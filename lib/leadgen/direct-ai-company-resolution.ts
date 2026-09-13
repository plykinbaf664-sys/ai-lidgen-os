import { normalizeCompanyName, normalizeDomain } from "@/lib/leadgen/company-identity";
import type { DirectAiNeedAssessment } from "@/lib/leadgen/direct-ai-need-agent";
import type { SearchProvider, SearchResult } from "@/lib/leadgen/search/search-provider";
import { classifySearchResultSource } from "@/lib/leadgen/signals/source-classifier";
import { runAbortableOperation } from "@/lib/network/abortable-operation";

export type DirectAiCompanyResolution = {
  confidence: "VERIFIED" | "HIGH_CONFIDENCE" | "UNCERTAIN" | "REJECTED";
  companyName: string | null;
  website: string | null;
  domain: string | null;
  evidence: string | null;
  reason: string;
  searchQueries: number;
};

const blockedSourceTypes = new Set([
  "job_board", "aggregator", "social", "news", "directory", "unknown",
]);

function clean(value: string, limit = 300): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function nameInText(name: string, value: string): boolean {
  const normalized = normalizeCompanyName(name);
  const text = normalizeCompanyName(value);
  if (normalized.length < 3 || !text) return false;
  if (text.includes(normalized)) return true;
  const terms = normalized.split(" ").filter((part) => part.length >= 4);
  return terms.length > 0 && terms.every((part) => text.includes(part));
}

function safeOfficialDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const domain = normalizeDomain(url);
  if (!domain) return null;
  const source = classifySearchResultSource({
    title: "",
    url: `https://${domain}`,
    snippet: "",
    source_label: "",
    score: 0,
    published_at: null,
    raw_content: null,
  });
  return blockedSourceTypes.has(source.source_type) ? null : domain;
}

async function verifyHomepage(
  domain: string,
  companyName: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<boolean> {
  const html = await runAbortableOperation<string | null>({
    timeoutMs: 8_000,
    parentSignal: signal,
    fallback: null,
    operation: async (requestSignal) => {
      const response = await fetchImpl(`https://${domain}`, {
        headers: { Accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
        signal: requestSignal,
      });
      if (!response.ok) return null;
      const finalDomain = normalizeDomain(response.url);
      if (finalDomain !== domain && !finalDomain?.endsWith(`.${domain}`)) return null;
      return (await response.text()).slice(0, 100_000);
    },
  });
  if (!html) return false;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:site_name|og:title)["'][^>]+content=["']([^"']+)/i)?.[1] ?? "";
  const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").slice(0, 20_000);
  return nameInText(companyName, `${title} ${description} ${body}`);
}

export async function resolveDirectAiCompany({
  result,
  assessment,
  structuredName,
  structuredWebsite,
  documentText,
  sourceIdentityText,
  sourceLinks = [],
  searchProvider,
  fetchImpl = fetch,
  signal,
}: {
  result: SearchResult;
  assessment: DirectAiNeedAssessment;
  structuredName?: string | null;
  structuredWebsite?: string | null;
  documentText: string;
  sourceIdentityText?: string | null;
  sourceLinks?: string[];
  searchProvider: SearchProvider;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<DirectAiCompanyResolution> {
  const companyName = clean(structuredName || assessment.companyName || "", 180);
  const identityEvidence = clean(assessment.identityEvidence || "", 400);
  const rejected = (reason: string, searchQueries = 0): DirectAiCompanyResolution => ({
    confidence: "REJECTED", companyName: companyName || null,
    website: null, domain: null, evidence: identityEvidence || null,
    reason, searchQueries,
  });
  if (!companyName || (!structuredName && !nameInText(companyName, `${result.title} ${documentText}`))) {
    return rejected("company_name_not_evidenced_on_intent_page");
  }
  if (!structuredName) {
    const words = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const actualText = words(`${result.title} ${documentText}`);
    const quoteParts = identityEvidence.split(/…|\.{3}/).map(words).filter(Boolean);
    if (!nameInText(companyName, identityEvidence) || !quoteParts.length ||
      !quoteParts.every((part) => actualText.includes(part))) {
      return rejected("company_action_not_evidenced_on_intent_page");
    }
  }

  const sourceDomain = safeOfficialDomain(result.url);
  const statedDomain = safeOfficialDomain(structuredWebsite || assessment.officialWebsite);
  const sourceOwnsCompany = Boolean(sourceDomain && nameInText(companyName, sourceIdentityText ?? ""));
  const linkedDomains = [...new Set(sourceLinks.map((url) => safeOfficialDomain(url)).filter((domain): domain is string => Boolean(domain)))];
  const linkedStatedDomain = statedDomain && linkedDomains.includes(statedDomain) ? statedDomain : null;
  const directDomain = sourceOwnsCompany ? sourceDomain : linkedStatedDomain;
  if (directDomain && await verifyHomepage(directDomain, companyName, fetchImpl, signal)) {
    return {
      confidence: sourceOwnsCompany && directDomain === sourceDomain ? "VERIFIED" : "HIGH_CONFIDENCE", companyName,
      website: `https://${directDomain}`, domain: directDomain,
      evidence: identityEvidence || clean(result.snippet, 400),
      reason: "intent_page_and_official_homepage_match", searchQueries: 0,
    };
  }
  if (sourceOwnsCompany && sourceDomain) {
    return {
      confidence: "HIGH_CONFIDENCE", companyName,
      website: `https://${sourceDomain}`, domain: sourceDomain,
      evidence: clean(sourceIdentityText ?? "", 400),
      reason: "company_identity_on_own_intent_page", searchQueries: 0,
    };
  }

  // One bounded identity recheck. A search hit is never itself an official site:
  // the candidate domain must also have a homepage naming this organization.
  const matches = await runAbortableOperation<SearchResult[]>({
    timeoutMs: 10_000,
    parentSignal: signal,
    fallback: [],
    operation: (requestSignal) => searchProvider.search({
      query: `"${companyName}" официальный сайт`,
      maxResults: 6,
      page: 0,
      market: "ru",
      queryLanguage: "ru",
      signal: requestSignal,
    }),
  });
  for (const match of matches.slice(0, 6)) {
    const domain = safeOfficialDomain(match.url);
    if (!domain || !nameInText(companyName, `${match.title} ${match.snippet}`)) continue;
    const homepageConfirmed = await verifyHomepage(domain, companyName, fetchImpl, signal);
    const independentLinkedEvidence = linkedDomains.includes(domain) && domain !== sourceDomain;
    if (homepageConfirmed || independentLinkedEvidence) {
      return {
        confidence: "HIGH_CONFIDENCE", companyName,
        website: `https://${domain}`, domain,
        evidence: identityEvidence || clean(`${result.snippet} ${match.title}`, 400),
        reason: homepageConfirmed
          ? "intent_page_search_and_official_homepage_match"
          : "intent_page_link_and_independent_search_match",
        searchQueries: 1,
      };
    }
  }
  return {
    confidence: "UNCERTAIN", companyName,
    website: null, domain: null,
    evidence: identityEvidence || clean(result.snippet, 400),
    reason: "official_domain_not_cross_checked", searchQueries: 1,
  };
}
