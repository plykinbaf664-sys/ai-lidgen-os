import type { SearchProvider, SearchResult } from "@/lib/leadgen/search/search-provider";
import {
  verifyCompanySegment,
  type SegmentGuardInput,
  type SegmentVerification,
} from "@/lib/leadgen/segment-guard";
import { getVerticalProfile } from "@/lib/leadgen/verticals";
import { runAbortableOperation } from "@/lib/network/abortable-operation";

const SEGMENT_RECHECK_TIMEOUT_MS = 8_000;
const MAX_RECHECK_RESULTS = 5;

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCompanyEvidence(result: SearchResult, companyName: string) {
  const companyTokens = normalize(companyName)
    .split(" ")
    .filter((token) => token.length >= 4);
  if (companyTokens.length === 0) return false;
  const text = normalize(`${result.title} ${result.snippet}`);
  return companyTokens.some((token) => text.includes(token));
}

async function searchWithTimeout(
  searchProvider: SearchProvider,
  query: string,
  parentSignal?: AbortSignal,
): Promise<SearchResult[]> {
  return runAbortableOperation({
    timeoutMs: SEGMENT_RECHECK_TIMEOUT_MS,
    fallback: [],
    parentSignal,
    operation: (signal) => searchProvider.search({
        query,
        maxResults: MAX_RECHECK_RESULTS,
        page: 0,
        market: "ru",
        queryLanguage: "ru",
        signal,
      }),
  });
}

export type SegmentRecheckResult = {
  verification: SegmentVerification;
  attempted: boolean;
  sourceUrls: string[];
};

export async function recheckUncertainCompanySegment({
  input,
  initial,
  searchProvider,
  signal,
}: {
  input: SegmentGuardInput;
  initial: SegmentVerification;
  searchProvider: SearchProvider;
  signal?: AbortSignal;
}): Promise<SegmentRecheckResult> {
  if (initial.match !== "UNCERTAIN") {
    return { verification: initial, attempted: false, sourceUrls: [] };
  }

  const profile = getVerticalProfile(input.selectedSegment);
  const segmentTerms = [...profile.industries, ...profile.companyTypes]
    .slice(0, 4)
    .map((term) => `"${term}"`)
    .join(" OR ");
  const results = await searchWithTimeout(
    searchProvider,
    `"${input.companyName}" (${segmentTerms})`,
    signal,
  );
  const evidenceResults = results
    .filter((result) => isCompanyEvidence(result, input.companyName))
    .slice(0, 3);

  if (evidenceResults.length === 0) {
    return { verification: initial, attempted: true, sourceUrls: [] };
  }

  const researchContext = evidenceResults
    .map((result) => `${result.title}. ${result.snippet}`)
    .join(" ")
    .slice(0, 2_000);
  const verification = verifyCompanySegment({
    ...input,
    companySegment: [input.companySegment, researchContext]
      .filter(Boolean)
      .join(" "),
  });
  const sourceUrls = [...new Set(evidenceResults.map((result) => result.url))]
    .slice(0, 3);

  return {
    verification: {
      ...verification,
      evidence: [
        ...verification.evidence,
        ...sourceUrls.map((url) => `segment recheck: ${url}`),
      ].slice(0, 5),
    },
    attempted: true,
    sourceUrls,
  };
}
