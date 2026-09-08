import type { LeadOrigin, LeadOriginContext } from "@/lib/leadgen/types";

const originOrder: LeadOrigin[] = ["DISCOVERY", "AI_HIRING", "IMPORTED"];

export function mergeLeadOriginContexts(
  ...contexts: Array<LeadOriginContext | null | undefined>
): LeadOriginContext {
  const origins = new Set<LeadOrigin>();
  let sourceProvider: string | null = null;
  let sourceUrl: string | null = null;
  let importBatchId: string | null = null;
  const sourceMetadata: Record<string, string | number | boolean | null> = {};

  for (const context of contexts) {
    if (!context) continue;
    context.origins.forEach((origin) => origins.add(origin));
    sourceProvider ??= context.source_provider ?? null;
    sourceUrl ??= context.source_url ?? null;
    importBatchId ??= context.import_batch_id ?? null;
    Object.assign(sourceMetadata, context.source_metadata ?? {});
  }

  return {
    origins: originOrder.filter((origin) => origins.has(origin)),
    source_provider: sourceProvider,
    source_url: sourceUrl,
    import_batch_id: importBatchId,
    source_metadata: sourceMetadata,
  };
}

export function createLeadOriginContext(
  origin: LeadOrigin,
  input: Omit<LeadOriginContext, "origins"> = {},
): LeadOriginContext {
  return mergeLeadOriginContexts({ ...input, origins: [origin] });
}
