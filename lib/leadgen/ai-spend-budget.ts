import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { researchDataDirectory } from "@/lib/leadgen/research-cache";

type Scope = { chargedUsd: number; limitUsd: number };
const scopes = new AsyncLocalStorage<Scope>();
const amount = (name: string, fallback: number) => {
  const raw = process.env[name];
  const parsed = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${name}`);
  return parsed;
};
export function withAiSpendScope<T>(operation: () => Promise<T>) {
  if (scopes.getStore()) return operation();
  return scopes.run({ chargedUsd: 0, limitUsd: amount("LEADGEN_AI_COMPANY_BUDGET_USD", 0.20) }, operation);
}
type Ledger = { chargedUsd: number; requests: number; settled: number };
async function updateLedger(file: string, update: (ledger: Ledger) => void) {
  await mkdir(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  let handle;
  // Fail closed on contention or abandoned lock; never send a paid request
  // without reserving its budget. No unsafe stale-lock guessing.
  for (let attempt = 0; attempt < 80; attempt++) {
    try { handle = await open(lock, "wx", 0o600); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  if (!handle) throw new Error("ai_budget_ledger_locked");
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    let ledger: Ledger;
    try { ledger = JSON.parse(await readFile(file, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      ledger = { chargedUsd: 0, requests: 0, settled: 0 };
    }
    if (!Number.isFinite(ledger.chargedUsd) || ledger.chargedUsd < 0) throw new Error("ai_budget_ledger_invalid");
    update(ledger);
    await writeFile(temporary, JSON.stringify(ledger), { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await handle.close();
    await rm(lock, { force: true });
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
export async function reserveAiSpend(upperBoundUsd: number) {
  if (!Number.isFinite(upperBoundUsd) || upperBoundUsd < 0) throw new Error("ai_budget_invalid_reservation");
  const scope = scopes.getStore();
  if (scope && scope.chargedUsd + upperBoundUsd > scope.limitUsd) throw new Error("ai_company_budget_exceeded");
  // Reserve in memory before yielding so concurrent actions share one limit.
  if (scope) scope.chargedUsd += upperBoundUsd;
  const file = path.join(researchDataDirectory(), "spend", `${new Date().toISOString().slice(0,10)}.json`);
  try {
    await updateLedger(file, ledger => {
      if (ledger.chargedUsd + upperBoundUsd > amount("LEADGEN_AI_DAILY_BUDGET_USD", 1)) throw new Error("ai_daily_budget_exceeded");
      ledger.chargedUsd += upperBoundUsd; ledger.requests++;
    });
  } catch (error) { if (scope) scope.chargedUsd -= upperBoundUsd; throw error; }
  let settled = false;
  return async (actualUsd: number) => {
    if (settled) return;
    settled = true;
    const adjustment = Math.max(0, actualUsd) - upperBoundUsd;
    await updateLedger(file, ledger => { ledger.chargedUsd = Math.max(0, ledger.chargedUsd + adjustment); ledger.settled++; });
    if (scope) scope.chargedUsd = Math.max(0, scope.chargedUsd + adjustment);
  };
}
