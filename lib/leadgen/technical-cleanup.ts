import "server-only";

import { cleanupExpiredImportPreviews } from "@/lib/leadgen/contact-import-store";
import { cleanupSourceCanaryMetrics } from "@/lib/leadgen/source-canary-store";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const cleanupRuntime = globalThis as typeof globalThis & {
  __leadgenLastTechnicalCleanupAt?: number;
};

export async function cleanupTechnicalLeadgenData(force = false) {
  const now = Date.now();
  if (
    !force &&
    cleanupRuntime.__leadgenLastTechnicalCleanupAt &&
    now - cleanupRuntime.__leadgenLastTechnicalCleanupAt < CLEANUP_INTERVAL_MS
  ) {
    return { skipped: true, importPreviews: 0, sourceCanaries: 0 };
  }
  cleanupRuntime.__leadgenLastTechnicalCleanupAt = now;
  const [importPreviews, sourceCanaries] = await Promise.all([
    cleanupExpiredImportPreviews(new Date(now)),
    cleanupSourceCanaryMetrics(),
  ]);
  return { skipped: false, importPreviews, sourceCanaries };
}
