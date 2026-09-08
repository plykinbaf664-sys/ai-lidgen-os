import "server-only";

import { mutateLocalTable, readLocalTable } from "@/lib/leadgen/local-database";

const TABLE = "leadgen_source_canary_runs";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_ROWS = 40;

export type SourceCanaryOrigin = "AI_HIRING" | "IMPORTED";

export type SourceCanaryMetrics = {
  origin: SourceCanaryOrigin;
  candidates: number;
  qualified: number;
  ready: number;
  sampleSize: number;
  createdAt: string;
};

function isActive(row: Record<string, unknown>, now: number) {
  const createdAt = Date.parse(String(row.createdAt ?? ""));
  return Number.isFinite(createdAt) && createdAt >= now - RETENTION_MS;
}

export async function saveSourceCanaryMetrics(metrics: SourceCanaryMetrics) {
  await mutateLocalTable(TABLE, (rows) => {
    const now = Date.now();
    const active = rows.filter((row) => isActive(row, now));
    active.push(metrics);
    active.sort((left, right) =>
      Date.parse(String(right.createdAt)) - Date.parse(String(left.createdAt)),
    );
    rows.splice(0, rows.length, ...active.slice(0, MAX_ROWS));
  });
}

export async function getLatestSourceCanaryMetrics() {
  const rows = await readLocalTable<SourceCanaryMetrics & Record<string, unknown>>(TABLE);
  const active = rows
    .filter((row) => isActive(row, Date.now()))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return {
    aiHiring: active.find((row) => row.origin === "AI_HIRING") ?? null,
    imported: active.find((row) => row.origin === "IMPORTED") ?? null,
  };
}
