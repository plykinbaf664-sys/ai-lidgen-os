import type { AiHiringIntentResult } from "./ai-hiring-intent.ts";
import type { ImportedContactRow } from "./contact-import.ts";
import type { UnifiedSourceCandidate } from "./unified-source-dedup.ts";

export function importedRowToUnifiedCandidate(
  row: ImportedContactRow,
): UnifiedSourceCandidate | null {
  if (row.status !== "SUCCESS") return null;
  const companyName = row.company || row.domain || row.email.split("@")[1] || "Не определена";
  return {
    companyName,
    domain: row.domain || null,
    website: row.website || null,
    fullName: row.full_name || null,
    email: row.email || null,
    originContext: row.originContext,
    signals: [],
  };
}

export function aiHiringResultToUnifiedCandidate(
  result: AiHiringIntentResult,
): UnifiedSourceCandidate | null {
  if (result.status !== "SUCCESS" || !result.company || !result.signal) return null;
  return {
    companyName: result.company.name,
    domain: result.company.domain,
    website: result.company.website,
    fullName: null,
    email: null,
    originContext: result.originContext,
    signals: [
      {
        type: result.signal.signalType,
        sourceUrl: result.signal.sourceUrl,
        evidence: result.signal.evidence,
      },
    ],
  };
}

