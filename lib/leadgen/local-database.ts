import "server-only";

import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { compactLocalTableRows } from "@/lib/leadgen/local-storage-compaction";

export type LocalRow = Record<string, unknown>;

const writeChains = new Map<string, Promise<void>>();
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

function dataRoot() {
  const configured = process.env.LEADGEN_LOCAL_DATA_DIR?.trim();
  const root = configured ? path.resolve(configured) : path.join(process.cwd(), ".leadgen-data");
  return path.join(root, "tables");
}

function safeTableName(table: string) {
  if (!/^[a-z0-9_]+$/i.test(table)) throw new Error(`Invalid local table: ${table}`);
  return table;
}

function tablePath(table: string) {
  return path.join(dataRoot(), `${safeTableName(table)}.json.gz`);
}

function legacyTablePath(table: string) {
  return path.join(dataRoot(), `${safeTableName(table)}.json`);
}

async function ensureRoot() {
  await mkdir(dataRoot(), { recursive: true });
}

export async function readLocalTable<T extends LocalRow = LocalRow>(table: string): Promise<T[]> {
  await ensureRoot();
  try {
    let serialized: string;
    try {
      serialized = (await gunzipAsync(await readFile(tablePath(table)))).toString("utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      serialized = await readFile(legacyTablePath(table), "utf8");
    }
    const parsed = JSON.parse(serialized.replace(/^\uFEFF/, ""));
    return Array.isArray(parsed)
      ? (compactLocalTableRows(table, parsed as LocalRow[]) as T[])
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (table === "leadgen_outreach_settings") {
        return [{ id: "global", is_paused: false, followup_paused: false }] as unknown as T[];
      }
      return [];
    }
    throw error;
  }
}

async function atomicWriteTable(table: string, rows: LocalRow[]) {
  await ensureRoot();
  const target = tablePath(table);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  const compactedRows = compactLocalTableRows(table, rows);
  rows.splice(0, rows.length, ...compactedRows);
  await writeFile(temporary, await gzipAsync(JSON.stringify(compactedRows), { level: 9 }));
  await rm(target, { force: true });
  await rename(temporary, target);
  await rm(legacyTablePath(table), { force: true });
}

export function mutateLocalTable<T>(
  table: string,
  operation: (rows: LocalRow[]) => Promise<T> | T,
): Promise<T> {
  const previous = writeChains.get(table) ?? Promise.resolve();
  let resolveResult!: (value: T | PromiseLike<T>) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<T>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const next = previous.then(async () => {
    try {
      const rows = await readLocalTable(table);
      const value = await operation(rows);
      await atomicWriteTable(table, rows);
      resolveResult(value);
    } catch (error) {
      rejectResult(error);
    }
  });
  writeChains.set(
    table,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

export async function getLocalTableBytes(table: string) {
  try {
    return (await stat(tablePath(table))).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

export async function getLocalDatabaseStats(tableNames: string[]) {
  return Promise.all(
    tableNames.map(async (table) => ({
      table,
      rows: (await readLocalTable(table)).length,
      bytes: await getLocalTableBytes(table),
    })),
  );
}
