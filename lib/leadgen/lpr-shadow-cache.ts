import type { LprShadowResult } from "@/lib/leadgen/lpr-shadow-resolver";

type CacheEntry = {
  expiresAt: number;
  value: LprShadowResult;
};

const ttlHours = Math.min(
  Math.max(Number(process.env.LEADGEN_LPR_CACHE_TTL_HOURS ?? 168), 1),
  720,
);
const maxEntries = 500;
const cache = new Map<string, CacheEntry>();

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "").replace(/\s+/g, " ");
}

export function getLprShadowCacheKey(companyName: string, domain: string | null) {
  return `${normalize(domain ?? "")}|${normalize(companyName)}`;
}

function prune() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function getCachedLprShadowResult(key: string): LprShadowResult | null {
  prune();
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  cache.set(key, entry);
  return { ...entry.value, cacheHit: true };
}

export function cacheLprShadowResult(key: string, value: LprShadowResult) {
  cache.set(key, {
    value: { ...value, cacheHit: false },
    expiresAt: Date.now() + ttlHours * 3_600_000,
  });
  prune();
}

export function clearLprShadowCacheForTests() {
  cache.clear();
}

