import { NextResponse } from "next/server";
import { getCampaignDetails } from "@/lib/leadgen/storage";
import { getOutreachQueue } from "@/lib/leadgen/outreach-storage";
import { createLeadgenSearchProvider } from "@/lib/leadgen/search/leadgen-search-provider";
import {
  resolveLprShadow,
  type LprShadowResult,
} from "@/lib/leadgen/lpr-shadow-resolver";
import type { DecisionMakerProfile } from "@/lib/leadgen/types";
import { getActiveAbortableOperationCount } from "@/lib/network/abortable-operation";
import { clearLprShadowCacheForTests } from "@/lib/leadgen/lpr-shadow-cache";
import { formatUnknownError } from "@/lib/leadgen/error-format";

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

function isDecisionMaker(value: unknown): value is DecisionMakerProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.primary_persona === "string" &&
    Array.isArray(record.alternative_personas) &&
    typeof record.business_problem_owner === "string" &&
    typeof record.expected_pain === "string" &&
    typeof record.reasoning === "string";
}

type ShadowSkipped = {
  companyName: string;
  skipped: true;
  reason: string;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      campaignId?: string;
      limit?: number;
      fresh?: boolean;
    };
    if (!body.campaignId) {
      return NextResponse.json(
        { success: false, error: "campaignId обязателен" },
        { status: 400 },
      );
    }
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 20);
    if (body.fresh === true) clearLprShadowCacheForTests();
    const [details, entries] = await Promise.all([
      getCampaignDetails(body.campaignId),
      getOutreachQueue({ campaignId: body.campaignId }),
    ]);
    if (!details) {
      return NextResponse.json(
        { success: false, error: "Кампания не найдена" },
        { status: 404 },
      );
    }

    const companiesById = new Map(details.companies.map((company) => [company.id, company]));
    const evaluationEntries = entries
      .filter((entry) => entry.message_kind === "initial" && Boolean(entry.email))
      .slice(0, limit);
    const searchProvider = createLeadgenSearchProvider();
    const results = await mapWithConcurrency<
      (typeof evaluationEntries)[number],
      LprShadowResult | ShadowSkipped
    >(evaluationEntries, 2, async (entry) => {
      const company = entry.company_id
        ? companiesById.get(entry.company_id)
        : undefined;
      if (!company) {
        return {
          companyName: entry.company_name,
          skipped: true as const,
          reason: "company_missing",
        };
      }
      const decisionMaker = company.metadata.decision_maker;
      if (!isDecisionMaker(decisionMaker)) {
        return {
          companyName: company.company_name,
          skipped: true as const,
          reason: "decision_maker_profile_missing",
        };
      }
      return resolveLprShadow({
        company,
        decisionMaker,
        existingContacts: details.contacts.filter(
          (contact) => contact.company_id === company.id,
        ),
        fallbackEmail: entry.email,
        searchProvider,
      });
    });

    const resolved = results.filter(
      (result): result is LprShadowResult => !("skipped" in result),
    );
    const qualityFailures = resolved.flatMap((result) => {
      const failures: string[] = [];
      if (result.person && (!result.person.sourceUrl || result.person.evidence.length === 0)) {
        failures.push(`${result.companyName}:person_without_source_evidence`);
      }
      if (result.emailClassification === "VERIFIED_PERSONAL" && !result.person) {
        failures.push(`${result.companyName}:personal_without_confirmed_person`);
      }
      if (result.emailClassification === "INFERRED_PERSONAL" && result.contactLevel === "A") {
        failures.push(`${result.companyName}:inferred_marked_verified`);
      }
      if (result.timedOut && !result.ready) {
        failures.push(`${result.companyName}:timeout_destroyed_fallback`);
      }
      return failures;
    });
    const classifications = Object.fromEntries(
      [
        "VERIFIED_PERSONAL",
        "HIGH_CONFIDENCE_PERSONAL",
        "INFERRED_PERSONAL",
        "DEPARTMENT",
        "GENERAL",
        "INVALID",
      ].map((classification) => [
        classification,
        resolved.filter((result) => result.emailClassification === classification).length,
      ]),
    );
    const levels = Object.fromEntries(
      ["A", "B", "C", "D", "E"].map((level) => [
        level,
        resolved.filter((result) => result.contactLevel === level).length,
      ]),
    );
    const latencies = resolved.map((result) => result.latencyMs);
    const searches = resolved.map((result) => result.searchAttempts);

    return NextResponse.json({
      success: qualityFailures.length === 0,
      mode: "read_only_shadow_no_mutations_no_send",
      campaign_id: body.campaignId,
      companies: evaluationEntries.length,
      old: { lpr: 0, personal: 0 },
      new: {
        confirmed_lpr: resolved.filter((result) => result.person).length,
        classifications,
        levels,
      },
      metrics: {
        average_lpr_ms: latencies.length
          ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
          : 0,
        max_lpr_ms: Math.max(0, ...latencies),
        average_queries_per_company: searches.length
          ? Number((searches.reduce((sum, value) => sum + value, 0) / searches.length).toFixed(2))
          : 0,
        timeouts: resolved.filter((result) => result.timedOut).length,
        aborted_requests: resolved.reduce((sum, result) => sum + result.abortedRequests, 0),
        background_operations_after_completion: getActiveAbortableOperationCount(),
      },
      quality_failures: qualityFailures,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error, "Shadow LPR audit failed") },
      { status: 500 },
    );
  }
}
