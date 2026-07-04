import { NextResponse } from "next/server";
import { leadgenConfig } from "@/lib/leadgen/config";
import {
  createLeadgenSearchProvider,
  isLeadgenSearchProviderMode,
} from "@/lib/leadgen/search/leadgen-search-provider";
import { collectSignalEvidence } from "@/lib/leadgen/signals/evidence-collector";
import { buildLeadCandidates } from "@/lib/leadgen/signals/lead-candidate-builder";
import type { EvidenceResult } from "@/lib/leadgen/signals/evidence-collector";
import type { SearchResult } from "@/lib/leadgen/search/search-provider";
import type { SignalType } from "@/lib/leadgen/types";

const signalTypes: SignalType[] = [
  "HIRING_SIGNAL",
  "GO_TO_MARKET_SIGNAL",
  "GROWTH_SIGNAL",
  "CONTENT_SIGNAL",
  "TRAFFIC_SIGNAL",
  "TECH_SIGNAL",
];

function isSignalType(value: string | null): value is SignalType {
  return signalTypes.includes(value as SignalType);
}

function formatRouteError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function toEvidenceResponse(evidence: EvidenceResult) {
  return {
    signal_type: evidence.signal_type,
    signal_title: evidence.signal_title,
    source_url: evidence.source_url,
    confidence_score: evidence.confidence_score,
    decision: evidence.decision,
    source_type: evidence.source_type,
    company_extraction: evidence.company_extraction,
    matched_signal_phrases: evidence.matched_signal_phrases,
    event_strength_score: evidence.event_strength_score,
    event_strength_breakdown: evidence.event_strength_breakdown,
    matched_icp_terms: evidence.matched_icp_terms,
    matched_source_hints: evidence.matched_source_hints,
    decision_reason: evidence.decision_reason,
    rejection_reason: evidence.rejection_reason,
  };
}

function toRejectedResult(result: SearchResult, evidence: EvidenceResult) {
  return {
    url: result.url,
    title: result.title,
    rejection_reason: evidence.rejection_reason,
    confidence_score: evidence.confidence_score,
    source_type: evidence.source_type,
    company_extraction: evidence.company_extraction,
    decision_reason: evidence.decision_reason,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const signal = url.searchParams.get("signal");
    const query = url.searchParams.get("query")?.trim();

    if (!isSignalType(signal)) {
      return NextResponse.json(
        {
          success: false,
          error: "Valid signal query parameter is required",
          allowed_signals: signalTypes,
        },
        { status: 400 },
      );
    }

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: "query parameter is required",
        },
        { status: 400 },
      );
    }

    const providerParam = url.searchParams.get("provider");
    const languageParam = url.searchParams.get("language");
    const provider = createLeadgenSearchProvider({
      mode: isLeadgenSearchProviderMode(providerParam) ? providerParam : undefined,
    });
    const results = await provider.search({
      query,
      maxResults: 5,
      market: languageParam === "ru" ? "ru" : "global",
      queryLanguage: languageParam === "ru" ? "ru" : "en",
    });
    const evidenceResults = results.map((result) =>
      collectSignalEvidence({
        result,
        signalType: signal,
        icp: leadgenConfig.icp,
      }),
    );
    const { candidates } = buildLeadCandidates(evidenceResults);
    const weakEvidence = evidenceResults
      .filter((evidence) => evidence.decision === "weak_signal")
      .map(toEvidenceResponse);
    const rejectedResults = results
      .map((result, index) => ({
        result,
        evidence: evidenceResults[index],
      }))
      .filter(({ evidence }) => evidence?.decision === "rejected")
      .map(({ result, evidence }) => toRejectedResult(result, evidence));

    return NextResponse.json({
      success: true,
      signal,
      query,
      candidates,
      weak_evidence: weakEvidence,
      rejected_results: rejectedResults,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatRouteError(error),
      },
      { status: 500 },
    );
  }
}
