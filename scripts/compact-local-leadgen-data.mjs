import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { compactLocalTableRows } from "../lib/leadgen/local-storage-compaction.ts";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const configured = process.env.LEADGEN_LOCAL_DATA_DIR?.trim();
const root = path.join(configured ? path.resolve(configured) : path.join(process.cwd(), ".leadgen-data"), "tables");
await mkdir(root, { recursive: true });

const files = (await readdir(root)).filter((name) => name.endsWith(".json") || name.endsWith(".json.gz"));
const tableNames = [...new Set(files.map((name) => name.replace(/\.json(?:\.gz)?$/, "")))];
let before = 0;
let after = 0;
let rowsBefore = 0;
let rowsAfter = 0;

for (const table of tableNames) {
  const compressedName = `${table}.json.gz`;
  const legacyName = `${table}.json`;
  const name = files.includes(compressedName) ? compressedName : legacyName;
  const source = path.join(root, name);
  const sourceBytes = (
    await Promise.all(
      [compressedName, legacyName]
        .filter((candidate) => files.includes(candidate))
        .map(async (candidate) => (await stat(path.join(root, candidate))).size),
    )
  ).reduce((sum, size) => sum + size, 0);
  const raw = await readFile(source);
  const serialized = name.endsWith(".gz") ? (await gunzipAsync(raw)).toString("utf8") : raw.toString("utf8");
  const parsed = JSON.parse(serialized.replace(/^\uFEFF/, ""));
  const input = Array.isArray(parsed) ? parsed : [];
  const compacted = compactLocalTableRows(table, input);
  const target = path.join(root, `${table}.json.gz`);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, await gzipAsync(JSON.stringify(compacted), { level: 9 }));
  await rm(target, { force: true });
  await rename(temporary, target);
  await rm(path.join(root, legacyName), { force: true });
  before += sourceBytes;
  after += (await stat(target)).size;
  rowsBefore += input.length;
  rowsAfter += compacted.length;
}

console.log(JSON.stringify({ files: tableNames.length, rows_before: rowsBefore, rows_after: rowsAfter, bytes_before: before, bytes_after: after, saved_bytes: before - after }, null, 2));
