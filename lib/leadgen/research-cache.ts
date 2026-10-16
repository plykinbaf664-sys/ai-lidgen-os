import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

const policy = new AsyncLocalStorage<{ bypass: boolean }>();
export function withResearchCachePolicy<T>(bypass: boolean, operation: () => Promise<T>) {
  return policy.run({ bypass: bypass || policy.getStore()?.bypass === true }, operation);
}
export function researchCacheEnabled() {
  return process.env.LEADGEN_RESEARCH_CACHE_ENABLED !== "false" && !policy.getStore()?.bypass;
}
export function researchDataDirectory() {
  const configured = process.env.LEADGEN_LOCAL_DATA_DIR?.trim();
  const root = configured ? path.resolve(configured) : path.join(process.cwd(), ".leadgen-data");
  return path.join(root, "research-cache");
}
export function researchCacheKey(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function cacheFile(namespace: string, key: string) {
  if (!/^[a-z-]+$/.test(namespace)) throw new Error("Invalid research cache namespace");
  return path.join(researchDataDirectory(), namespace, `${researchCacheKey(key)}.json`);
}
export async function readResearchCache<T>(namespace: string, key: string): Promise<T | null> {
  if (!researchCacheEnabled()) return null;
  try {
    const entry = JSON.parse(await readFile(cacheFile(namespace, key), "utf8"));
    if (entry.version !== 1 || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) return null;
    return entry.value as T;
  } catch { return null; }
}
export async function writeResearchCache(namespace: string, key: string, value: unknown, ttlMs: number) {
  if (!researchCacheEnabled()) return;
  const file = cacheFile(namespace, key);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const content = JSON.stringify({ version: 1, expiresAt: Date.now() + ttlMs, value });
    if (Buffer.byteLength(content) > 1_000_000) return;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, file);
    // Bound persistent size without extra metadata writes or touching other data.
    const files = (await readdir(path.dirname(file))).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
    if (files.length > 1000) {
      const entries = await Promise.all(files.map(async name => {
        const target = path.join(path.dirname(file), name);
        try { return { target, expires: (await stat(target)).mtimeMs }; }
        catch { return { target, expires: 0 }; }
      }));
      await Promise.all(entries.sort((a,b) => a.expires-b.expires).slice(0, files.length-900).map(entry => rm(entry.target, { force: true })));
    }
  } catch { /* Cache failures must not turn evidence into facts or lose results. */ }
  finally { await rm(temporary, { force: true }).catch(() => undefined); }
}

type Pending = { controller: AbortController; promise: Promise<unknown>; users: number; done: boolean };
const pending = new Map<string, Pending>();
/** Share identical work; one cancelled consumer cannot cancel another's work. */
export async function cachedResearch<T>(namespace: string, key: string, ttlMs: number,
  operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal | null, cacheable: (value: T) => boolean = () => true): Promise<T> {
  signal?.throwIfAborted();
  const enabled = researchCacheEnabled();
  if (enabled) {
    const cached = await readResearchCache<T>(namespace, key);
    signal?.throwIfAborted();
    if (cached !== null) return cached;
  }
  const id = `${researchDataDirectory()}:${namespace}:${researchCacheKey(key)}`;
  let entry = enabled ? pending.get(id) : undefined;
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    entry = { controller, users: 0, done: false, promise: Promise.resolve() };
    const current = entry;
    current.promise = Promise.resolve().then(() => operation(controller.signal)).then(async value => {
      if (enabled && !controller.signal.aborted && cacheable(value)) await writeResearchCache(namespace, key, value, ttlMs);
      return value;
    }).finally(() => { current.done = true; if (pending.get(id) === current) pending.delete(id); });
    if (enabled) pending.set(id, current);
  }
  const current = entry;
  current.users++;
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const release = () => {
      if (finished) return false;
      finished = true; signal?.removeEventListener("abort", abort); current.users--;
      if (!current.users && !current.done) current.controller.abort();
      return true;
    };
    const abort = () => { if (release()) reject(signal?.reason ?? new Error("aborted")); };
    signal?.addEventListener("abort", abort, { once: true });
    current.promise.then(value => { if (release()) resolve(structuredClone(value) as T); }, error => { if (release()) reject(error); });
    if (signal?.aborted) abort();
  });
}
