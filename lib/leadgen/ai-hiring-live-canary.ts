import "server-only";

import { createHash } from "node:crypto";
import {
  evaluateAiAutomationHiring,
  matchesAiHiringRole,
  type AiHiringIntentResult,
  type AiHiringVacancy,
} from "@/lib/leadgen/ai-hiring-intent";
import {
  assessDirectAiNeedDocuments,
  planDirectAiNeedSearch,
  type DirectAiNeedAssessment,
  type DirectAiNeedSearchPlan,
} from "@/lib/leadgen/direct-ai-need-agent";
import { discoverCompanyEmails } from "@/lib/leadgen/email-discovery-engine";
import {
  getActiveAbortableOperationCount,
  runAbortableOperation,
} from "@/lib/network/abortable-operation";
import {
  parseHhEmployerId,
  parseHhEmployerWebsite,
} from "@/lib/leadgen/public-contact-provider";
import { parseJobPostingContext } from "@/lib/leadgen/signals/job-posting-context";
import { PublicWebSearchProvider } from "@/lib/leadgen/search/public-web-search-provider";
import type { SearchResult } from "@/lib/leadgen/search/search-provider";
import { classifySearchResultSource } from "@/lib/leadgen/signals/source-classifier";
import { extractCompanyFromSearchResult } from "@/lib/leadgen/signals/company-extractor";
import { resolveDirectAiCompany } from "@/lib/leadgen/direct-ai-company-resolution";
import { TavilySearchProvider } from "@/lib/leadgen/search/tavily-provider";
import { verifyCompanySegment, type SegmentMatch } from "@/lib/leadgen/segment-guard";
import { getVerticalProfile, type LeadgenVerticalId } from "@/lib/leadgen/verticals";

const LEGACY_FALLBACK_QUERIES = [
  '"AI инженер" автоматизация бизнес процессов',
  '"ИИ-инженер" автоматизация CRM',
  '"LLM-разработчик" AI агенты',
  '"AI Automation Engineer" CRM',
  '"специалист по внедрению ИИ" процессы',
  '"разработчик AI-агентов" бизнес',
];
const MAX_SEARCH_RESULTS = 60;
const MAX_DETAIL_REQUESTS = 24;
const MAX_CONTACT_CHECKS = 6;

function queryAngleForDirectNeed(query: string): "ru_job_board" | "market_news" | undefined {
  const normalized = query.toLocaleLowerCase("ru-RU");
  if (/ваканс|найм|наним|job|hiring|специалист|разработчик|инженер/.test(normalized)) {
    return "ru_job_board";
  }
  if (/тендер|закуп|пилот|проект|инициатив|внедрен|подрядчик|объявлен|публикац/.test(normalized)) {
    return "market_news";
  }
  return undefined;
}

type NetworkMetrics = {
  requests: number;
  active: number;
  timeouts: number;
  aborted: number;
};

export type AiHiringCanaryItem = {
  company: string | null;
  vacancyTitle: string;
  sourceUrl: string;
  status: "ACCEPTED" | "REJECTED";
  reason: string;
  evidence: string | null;
  automationUseCase: string | null;
  whyRelevant: string | null;
  officialWebsite: string | null;
  icpResult: SegmentMatch | "NOT_CHECKED" | "NOT_APPLIED";
  contactsFound: number;
  contactEmail: string | null;
  contactKind: string | null;
  contactSourceUrl: string | null;
  companyIdentityConfidence?: "VERIFIED" | "HIGH_CONFIDENCE" | "UNCERTAIN" | "REJECTED" | null;
  ready: boolean;
};

export type AiHiringLiveCanaryResult = {
  mode: "LIVE_READ_ONLY";
  verticalId: LeadgenVerticalId | null;
  planner: DirectAiNeedSearchPlan & {
    execution: "ai_semantic" | "legacy_fallback";
    refinementQueries: string[];
  };
  metrics: {
    jobsScanned: number;
    assessed: number;
    hhAssessed: number;
    nonHhAssessed: number;
    semanticDirect: number;
    aiRoleCandidates: number;
    automationIntentPass: number;
    companiesExtracted: number;
    hhCompanies: number;
    nonHhCompanies: number;
    officialDomainsConfirmed: number;
    icpMatch: number;
    icpUncertain: number;
    icpMismatch: number;
    segmentNotApplied: number;
    contactsFound: number;
    ready: number;
    falsePositives: number;
    runtimeMs: number;
    requests: number;
    companyIdentityQueries: number;
    timeouts: number;
    abortedRequests: number;
    orphanRequests: number;
  };
  accepted: AiHiringCanaryItem[];
  rejected: AiHiringCanaryItem[];
  rejectionReasons: Record<string, number>;
  sourceClasses: Record<string, { results: number; assessed: number; direct: number; companies: number; rejected: Record<string, number> }>;
  mutated: false;
  smtpCalls: 0;
};

async function mapLimited<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index]);
    }
  }));
  return output;
}

function interleaveResults(batches: SearchResult[][]): SearchResult[] {
  const output: SearchResult[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...batches.map((batch) => batch.length));
  for (let index = 0; index < longest; index += 1) {
    for (const batch of batches) {
      const result = batch[index];
      if (!result || seen.has(result.url)) continue;
      seen.add(result.url);
      output.push(result);
    }
  }
  return output;
}

function createTrackedFetch(metrics: NetworkMetrics): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    metrics.requests += 1;
    metrics.active += 1;
    try {
      return await fetch(input, init);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout/i.test(`${name} ${message}`)) metrics.timeouts += 1;
      if (/abort/i.test(`${name} ${message}`)) metrics.aborted += 1;
      throw error;
    } finally {
      metrics.active -= 1;
    }
  }) as typeof fetch;
}

async function fetchText(url: string, trackedFetch: typeof fetch, signal: AbortSignal) {
  return runAbortableOperation<string | null>({
    timeoutMs: 12_000,
    parentSignal: signal,
    fallback: null,
    operation: async (requestSignal) => {
      const response = await trackedFetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; LeadgenOS/1.0; live-canary)",
        },
        redirect: "follow",
        signal: requestSignal,
      });
      if (!response.ok) return null;
      return response.text();
    },
  });
}

function resultTitle(value: string) {
  return value.replace(/^Вакансия\s+/iu, "").split(/\s+[—–-]\s+/u)[0]?.trim() || value;
}

function vacancyId(url: string) {
  return url.match(/\/vacancy\/(\d+)/)?.[1] ?? null;
}

function isHhResult(url: string): boolean {
  try { return /(?:^|\.)hh\.ru$/i.test(new URL(url).hostname); }
  catch { return false; }
}

async function inspectVacancy(
  result: SearchResult,
  trackedFetch: typeof fetch,
  signal: AbortSignal,
): Promise<{
  vacancy: AiHiringVacancy | null;
  result: AiHiringIntentResult | null;
  sourceIdentityText?: string | null;
  sourceLinks?: string[];
}> {
  if (!isHhResult(result.url)) {
    const pageHtml = result.source_key === "google-news"
      ? null
      : await fetchText(result.url, trackedFetch, signal);
    const pageContext = pageHtml ? compactDocumentContext(pageHtml, result.url) : null;
    const extraction = extractCompanyFromSearchResult(
      result,
      classifySearchResultSource(result),
    );
    const companyName = extraction.is_candidate_company_valid
      ? extraction.company_name
      : null;
    const companyDomain = extraction.is_company_owned_domain
      ? extraction.company_domain
      : null;
    const publicDocument: AiHiringVacancy = {
      id: `public-${createHash("sha256").update(result.url).digest("hex").slice(0, 24)}`,
      title: result.title,
      description: `${result.snippet} ${pageContext?.text ?? ""}`.trim().slice(0, 4500),
      employerName: companyName,
      employerWebsite: companyDomain ? `https://${companyDomain}` : null,
      sourceProvider: result.source_key ?? result.source_label,
      sourceUrl: result.url,
    };
    return {
      vacancy: publicDocument,
      result: evaluateAiAutomationHiring(publicDocument),
      sourceIdentityText: pageContext?.identityText ?? null,
      sourceLinks: pageContext?.links ?? [],
    };
  }
  const html = await fetchText(result.url, trackedFetch, signal);
  if (!html) return { vacancy: null, result: null };
  const context = parseJobPostingContext(html);
  if (!context) return { vacancy: null, result: null };
  const employerId = parseHhEmployerId(html);
  let website: string | null = null;
  if (employerId) {
    const employerHtml = await fetchText(`https://hh.ru/employer/${employerId}`, trackedFetch, signal);
    website = employerHtml ? parseHhEmployerWebsite(employerHtml) : null;
  }
  const vacancy: AiHiringVacancy = {
    id: vacancyId(result.url),
    title: context.jobTitle,
    description: context.description ?? "",
    employerName: context.companyName,
    employerWebsite: website,
    sourceProvider: "hh-web",
    sourceUrl: result.url,
  };
  return { vacancy, result: evaluateAiAutomationHiring(vacancy) };
}

function rejectedItem(input: {
  title: string;
  url: string;
  reason: string;
  company?: string | null;
  evaluation?: AiHiringIntentResult | null;
}): AiHiringCanaryItem {
  return {
    company: input.company ?? input.evaluation?.company?.name ?? null,
    vacancyTitle: input.title,
    sourceUrl: input.url,
    status: "REJECTED",
    reason: input.reason,
    evidence: input.evaluation?.signal?.evidence ?? null,
    automationUseCase: input.evaluation?.automationIntentMatched ? "business_automation" : null,
    whyRelevant: input.evaluation?.signal?.whyRelevant ?? null,
    officialWebsite: input.evaluation?.company?.website ?? null,
    icpResult: "NOT_CHECKED",
    contactsFound: 0,
    contactEmail: null,
    contactKind: null,
    contactSourceUrl: null,
    ready: false,
  };
}

function compactWebsiteText(html: string | null) {
  if (!html) return null;
  // Some job pages contain multi-megabyte embedded state. Bound the parser input
  // before regex cleanup so a live page cannot overflow the JS regexp stack or
  // retain an oversized document throughout the canary.
  return html
    .slice(0, 200_000)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39);/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_500) || null;
}

function plainDocumentText(html: string, limit: number): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39);/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function compactDocumentContext(html: string, sourceUrl: string) {
  const bounded = html.slice(0, 200_000);
  const title = bounded.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const siteName = bounded.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1] ?? "";
  const header = bounded.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i)?.[1] ?? "";
  const footer = bounded.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1] ?? "";
  const identityText = plainDocumentText(`${siteName} ${header} ${footer}`, 2_000);
  const links = [...bounded.matchAll(/<a\b[^>]*href=["']([^"'#]{1,500})["'][^>]*>/gi)]
    .slice(0, 100)
    .flatMap((match) => {
      try {
        const url = new URL(match[1], sourceUrl);
        return /^https?:$/.test(url.protocol) ? [url.href] : [];
      } catch { return []; }
    })
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, 12);
  const main = bounded.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)?.[1] ?? bounded;
  const mainText = plainDocumentText(main.replace(/<(?:header|nav|footer)\b[^>]*>[\s\S]*?<\/(?:header|nav|footer)>/gi, " "), 2_800);
  const text = `${plainDocumentText(title, 250)} ${mainText} ${identityText} ${links.join(" ")}`.trim().slice(0, 4_500);
  return { text, identityText, links };
}

function requireExplicitSegmentIdentity(
  result: ReturnType<typeof verifyCompanySegment>,
  verticalId: LeadgenVerticalId,
  companyName: string,
  websiteText: string | null,
) {
  if (result.match !== "MATCH") return result;
  const identity = `${companyName} ${websiteText ?? ""}`
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
  const profile = getVerticalProfile(verticalId);
  const explicitTerms = [...profile.industries, ...profile.companyTypes]
    .map((term) => term.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim())
    .filter((term) => term.length >= 4);
  if (explicitTerms.some((term) => identity.includes(term))) return result;
  return {
    ...result,
    match: "UNCERTAIN" as const,
    confidence: Math.min(result.confidence, 59),
    evidence: [
      ...result.evidence,
      "Не подтверждён явный тип компании выбранного сегмента.",
    ].slice(0, 5),
  };
}

export async function runAiHiringLiveCanary({
  verticalId,
  signal,
}: {
  verticalId?: LeadgenVerticalId;
  signal?: AbortSignal;
}): Promise<AiHiringLiveCanaryResult> {
  const startedAt = Date.now();
  const baselineOperations = getActiveAbortableOperationCount();
  const network: NetworkMetrics = { requests: 0, active: 0, timeouts: 0, aborted: 0 };
  const trackedFetch = createTrackedFetch(network);
  const runController = new AbortController();
  const abortFromParent = () => runController.abort(signal?.reason);
  if (signal?.aborted) abortFromParent();
  signal?.addEventListener("abort", abortFromParent, { once: true });
  const deadline = setTimeout(
    () => runController.abort(new DOMException("AI hiring canary timed out", "TimeoutError")),
    120_000,
  );
  try {
    const provider = new PublicWebSearchProvider({
      fetchImpl: trackedFetch,
      ...(process.env.OPENAI_API_KEY?.trim() ? {} : { sources: ["hh-web" as const] }),
      timeoutMs: 12_000,
      minRequestIntervalMs: 350,
    });
    const initialPlan = await planDirectAiNeedSearch({
      optionalIndustry: verticalId ? getVerticalProfile(verticalId).label : null,
      signal: runController.signal,
    });
    const initialQueries = initialPlan.status === "AI"
      ? initialPlan.queries.slice(0, 6)
      : LEGACY_FALLBACK_QUERIES;
    const webProvider = initialPlan.status === "AI" && process.env.TAVILY_API_KEY?.trim()
      ? new TavilySearchProvider()
      : null;
    const plannedAngle = (query: string) => initialPlan.queryAngles?.[initialPlan.queries.indexOf(query)] ?? queryAngleForDirectNeed(query);
    const searchBatches = await mapLimited(initialQueries, 2, async (query) =>
      runAbortableOperation({
        timeoutMs: 18_000,
        parentSignal: runController.signal,
        fallback: [],
        operation: async (requestSignal) => {
          const angle = plannedAngle(query);
          if (webProvider && angle !== "ru_job_board") {
            network.requests += 1;
            const hits = await webProvider.search({ query, maxResults: 10, page: 0, market: "ru", queryLanguage: "ru", signal: requestSignal });
            if (hits.length > 0) return hits.map((item) => ({ ...item, source_key: "tavily", raw_content: null }));
          }
          return provider.search({
          query,
          maxResults: 10,
          page: 0,
          market: "ru",
          queryLanguage: "ru",
          queryAngle: initialPlan.status === "AI"
            ? angle
            : "ru_job_board",
          signal: requestSignal,
          });
        },
      }),
    );
    const initialResults = interleaveResults(searchBatches);
    const refinementPlan = initialPlan.status === "AI" && initialResults.length > 0 && initialResults.length < MAX_DETAIL_REQUESTS
      ? await planDirectAiNeedSearch({
          optionalIndustry: verticalId ? getVerticalProfile(verticalId).label : null,
          learnedContext: initialResults.slice(0, 12).map((item) => ({
            title: item.title,
            excerpt: item.snippet,
            sourceUrl: item.url,
          })),
          previousQueries: initialQueries,
          signal: runController.signal,
        })
      : null;
    const refinementQueries = refinementPlan?.status === "AI"
      ? refinementPlan.queries.slice(0, 3)
      : [];
    const refinementBatches = refinementQueries.length > 0
      ? await mapLimited(refinementQueries, 2, async (query) =>
          runAbortableOperation({
            timeoutMs: 18_000,
            parentSignal: runController.signal,
            fallback: [],
            operation: (requestSignal) => provider.search({
              query,
              maxResults: 10,
              page: 0,
              market: "ru",
              queryLanguage: "ru",
              queryAngle: queryAngleForDirectNeed(query) ?? "market_news",
              signal: requestSignal,
            }),
          }),
        )
      : [];
    const freeResults = interleaveResults([...searchBatches, ...refinementBatches]);
    const directWebResults = freeResults.filter((item) =>
      item.source_key !== "google-news" && !isHhResult(item.url),
    );
    const webQueries = [...refinementQueries, ...initialQueries]
      .filter((query) => queryAngleForDirectNeed(query) !== "ru_job_board")
      .filter((query, index, all) => all.indexOf(query) === index)
      .slice(0, directWebResults.length >= 6 ? 0 : 2);
    const tavilyBatches: SearchResult[][] = [];
    if (webProvider) {
      for (const query of webQueries) {
        network.requests += 1;
        const webResults = await runAbortableOperation<SearchResult[]>({
          timeoutMs: 10_000,
          parentSignal: runController.signal,
          fallback: [],
          operation: (requestSignal) => webProvider.search({
            query, maxResults: 5, page: 0, market: "ru", queryLanguage: "ru", signal: requestSignal,
          }),
        });
        tavilyBatches.push(webResults.map((item) => ({ ...item, source_key: "tavily", raw_content: null })));
      }
    }
    const jobs = interleaveResults([...searchBatches, ...refinementBatches, ...tavilyBatches]).slice(0, MAX_SEARCH_RESULTS);
    const candidates = jobs
      .filter((item) => initialPlan.status === "AI" || matchesAiHiringRole(`${item.title} ${item.snippet}`));
    const roleCandidates = interleaveResults([
      candidates.filter((item) => isHhResult(item.url)),
      candidates.filter((item) => !isHhResult(item.url)),
    ]).slice(0, MAX_DETAIL_REQUESTS);
    const inspected = await mapLimited(roleCandidates, 3, (item) =>
      inspectVacancy(item, trackedFetch, runController.signal),
    );
    const semanticDocuments = inspected.flatMap((item, index) => item.vacancy ? [{
            id: item.vacancy.id ?? `vacancy-${index}`,
            title: item.vacancy.title,
            excerpt: item.vacancy.description,
            sourceUrl: item.vacancy.sourceUrl,
            publishedAt: roleCandidates[index]?.published_at ?? null,
            companyName: item.vacancy.employerName,
          }] : []);
    const semanticBatches = initialPlan.status === "AI"
      ? await mapLimited(
          Array.from(
            { length: Math.ceil(semanticDocuments.length / 6) },
            (_, index) => semanticDocuments.slice(index * 6, index * 6 + 6),
          ),
          2,
          (documents) => assessDirectAiNeedDocuments({
            documents,
            signal: runController.signal,
          }),
        )
      : null;
    const semanticAssessments = semanticBatches?.flatMap((batch) => batch ?? []) ?? null;
    const semanticById = new Map<string, DirectAiNeedAssessment>(
      (semanticAssessments ?? []).map((item) => [item.id, item]),
    );
    const accepted: AiHiringCanaryItem[] = [];
    const rejected: AiHiringCanaryItem[] = [];
    let automationIntentPass = 0;
    let companiesExtracted = 0;
    let officialDomainsConfirmed = 0;
    let contactChecks = 0;
    let companyIdentityQueries = 0;
    const seenCompanies = new Set<string>();
    for (let index = 0; index < roleCandidates.length; index += 1) {
      const source = roleCandidates[index];
      const inspection = inspected[index];
      if (!inspection.vacancy || !inspection.result) {
        rejected.push(rejectedItem({ title: resultTitle(source.title), url: source.url, reason: "vacancy_detail_unavailable" }));
        continue;
      }
      let vacancy = inspection.vacancy;
      const semantic = semanticById.get(vacancy.id ?? `vacancy-${index}`) ?? null;
      let companyIdentityConfidence: AiHiringCanaryItem["companyIdentityConfidence"] = null;
      if (semantic?.classification === "DIRECT" && semantic.organizationKind !== "COMMERCIAL") {
        rejected.push(rejectedItem({
          title: vacancy.title,
          url: source.url,
          reason: `organization_kind_${semantic.organizationKind.toLowerCase()}`,
        }));
        continue;
      }
      if (
        initialPlan.status === "AI" &&
        semantic?.classification === "DIRECT" &&
        semantic.freshness !== "STALE" &&
        semantic.confidence >= 70 &&
        (!isHhResult(source.url) || !vacancy.employerName || !vacancy.employerWebsite)
      ) {
        const identity = await resolveDirectAiCompany({
          result: source,
          assessment: semantic,
          structuredName: isHhResult(source.url) ? vacancy.employerName : null,
          structuredWebsite: isHhResult(source.url) ? vacancy.employerWebsite : null,
          documentText: vacancy.description,
          sourceIdentityText: inspection.sourceIdentityText,
          sourceLinks: inspection.sourceLinks,
          searchProvider: webProvider ?? provider,
          fetchImpl: trackedFetch,
          signal: runController.signal,
        });
        companyIdentityConfidence = identity.confidence;
        companyIdentityQueries += identity.searchQueries;
        if (source.source_key === "tavily") network.requests += identity.searchQueries;
        if (identity.confidence === "VERIFIED" || identity.confidence === "HIGH_CONFIDENCE") {
          vacancy = {
            ...vacancy,
            employerName: identity.companyName,
            employerWebsite: identity.website,
          };
        } else {
          rejected.push(rejectedItem({
            title: vacancy.title,
            url: source.url,
            reason: identity.reason,
            company: identity.companyName,
          }));
          continue;
        }
      }
      const evaluation = semantic
        ? evaluateAiAutomationHiring(vacancy, semantic)
        : initialPlan.status === "AI"
          ? { ...inspection.result, status: "SKIPPED" as const, reason: "semantic_assessment_missing" }
          : inspection.result;
      if (evaluation.status === "SUCCESS" && evaluation.automationIntentMatched) {
        automationIntentPass += 1;
      }
      if (evaluation.status !== "SUCCESS" || !evaluation.company || !evaluation.signal) {
        rejected.push(rejectedItem({
          title: vacancy.title,
          url: source.url,
          reason: evaluation.reason,
          evaluation,
        }));
        continue;
      }
      const companyKey = evaluation.company.domain
        ? `domain:${evaluation.company.domain}`
        : `name:${evaluation.company.name.toLowerCase().replace(/\s+/g, " ")}`;
      if (seenCompanies.has(companyKey)) {
        rejected.push(rejectedItem({
          title: vacancy.title,
          url: source.url,
          reason: "duplicate_company",
          evaluation,
        }));
        continue;
      }
      seenCompanies.add(companyKey);
      companiesExtracted += 1;
      if (!evaluation.company.domain || !evaluation.company.website) {
        rejected.push(rejectedItem({
          title: vacancy.title,
          url: source.url,
          reason: "official_domain_not_confirmed",
          evaluation,
        }));
        continue;
      }
      officialDomainsConfirmed += 1;
      const officialWebsiteText = compactWebsiteText(
        await fetchText(
          evaluation.company.website,
          trackedFetch,
          runController.signal,
        ),
      );
      const segment = verticalId
        ? requireExplicitSegmentIdentity(verifyCompanySegment({
            selectedSegment: verticalId,
            companyName: evaluation.company.name,
            companySegment: officialWebsiteText,
            industry: officialWebsiteText,
            officialWebsite: evaluation.company.website,
            signalTitle: vacancy.title,
            signalSummary: evaluation.signal.signalSummary,
            signalEvidence: evaluation.signal.evidence,
            discoveryQuery: "direct AI need",
          }), verticalId, evaluation.company.name, officialWebsiteText)
        : null;
      let contactsFound = 0;
      let contactEmail: string | null = null;
      let contactKind: string | null = null;
      let contactSourceUrl: string | null = null;
      if ((!segment || segment.match === "MATCH") && contactChecks < MAX_CONTACT_CHECKS) {
        contactChecks += 1;
        const emailResult = await runAbortableOperation({
          timeoutMs: 16_000,
          parentSignal: runController.signal,
          fallback: null,
          operation: (requestSignal) => discoverCompanyEmails({
            rawInput: {
              companyId: `ai-hiring-canary-${vacancy.id ?? index}`,
              companyName: evaluation.company!.name,
              officialWebsiteUrl: evaluation.company!.website!,
              officialDomain: evaluation.company!.domain!,
              commercialSignalSourceUrl: vacancy.sourceUrl,
              targetPersona: null,
              targetDepartment: null,
              emailPriority: verticalId
                ? getVerticalProfile(verticalId).emailPriority
                : ["personal", "commercial", "sales", "marketing", "general"],
            },
            searchProvider: null,
            signal: requestSignal,
          }),
        });
        contactsFound = emailResult?.bestEmail ? 1 : 0;
        contactEmail = emailResult?.bestEmail?.email ?? null;
        contactKind = emailResult?.bestEmail?.kind ?? null;
        contactSourceUrl = emailResult?.bestEmail?.sourceUrl ?? null;
        network.requests += emailResult?.pages.length ?? 0;
      }
      accepted.push({
        company: evaluation.company.name,
        vacancyTitle: vacancy.title,
        sourceUrl: vacancy.sourceUrl,
        status: "ACCEPTED",
        reason: evaluation.reason,
        evidence: evaluation.signal.evidence,
        automationUseCase: "business_automation",
        whyRelevant: evaluation.signal.whyRelevant,
        officialWebsite: evaluation.company.website,
        icpResult: segment?.match ?? "NOT_APPLIED",
        contactsFound,
        contactEmail,
        contactKind,
        contactSourceUrl,
        companyIdentityConfidence: companyIdentityConfidence ?? "HIGH_CONFIDENCE",
        ready: (!segment || segment.match === "MATCH") && contactsFound > 0,
      });
    }
    const icpMatch = accepted.filter((item) => item.icpResult === "MATCH").length;
    const icpUncertain = accepted.filter((item) => item.icpResult === "UNCERTAIN").length;
    const icpMismatch = accepted.filter((item) => item.icpResult === "MISMATCH").length;
    const segmentNotApplied = accepted.filter((item) => item.icpResult === "NOT_APPLIED").length;
    const falsePositives = accepted.filter((item) =>
      !item.company ||
      !item.sourceUrl ||
      !item.evidence ||
      !item.automationUseCase ||
      !item.officialWebsite,
    ).length;
    const sourceClass = (item: SearchResult) => isHhResult(item.url) ? "hh" : classifySearchResultSource(item).source_type;
    const sourceClasses: AiHiringLiveCanaryResult["sourceClasses"] = {};
    for (const item of jobs) {
      const key = sourceClass(item);
      const bucket = sourceClasses[key] ??= { results: 0, assessed: 0, direct: 0, companies: 0, rejected: {} };
      bucket.results += 1;
      const index = roleCandidates.findIndex((candidate) => candidate.url === item.url);
      const semantic = index >= 0 ? semanticById.get(inspected[index]?.vacancy?.id ?? `vacancy-${index}`) : null;
      if (semantic) bucket.assessed += 1;
      if (semantic?.classification === "DIRECT") bucket.direct += 1;
      if (accepted.some((company) => company.sourceUrl === item.url)) bucket.companies += 1;
      const reason = rejected.find((company) => company.sourceUrl === item.url)?.reason ?? (index < 0 ? "bounded_sample_not_assessed" : null);
      if (reason) bucket.rejected[reason] = (bucket.rejected[reason] ?? 0) + 1;
    }
    return {
      mode: "LIVE_READ_ONLY",
      verticalId: verticalId ?? null,
      planner: {
        ...initialPlan,
        execution: initialPlan.status === "AI" ? "ai_semantic" : "legacy_fallback",
        refinementQueries,
      },
      metrics: {
        jobsScanned: jobs.length,
        assessed: semanticById.size,
        hhAssessed: roleCandidates.filter((item, index) =>
          isHhResult(item.url) && semanticById.has(inspected[index]?.vacancy?.id ?? `vacancy-${index}`),
        ).length,
        nonHhAssessed: roleCandidates.filter((item, index) =>
          !isHhResult(item.url) && semanticById.has(inspected[index]?.vacancy?.id ?? `vacancy-${index}`),
        ).length,
        semanticDirect: [...semanticById.values()].filter((item) =>
          item.classification === "DIRECT" && item.freshness !== "STALE" && item.confidence >= 70,
        ).length,
        aiRoleCandidates: roleCandidates.length,
        automationIntentPass,
        companiesExtracted,
        hhCompanies: accepted.filter((item) => isHhResult(item.sourceUrl)).length,
        nonHhCompanies: accepted.filter((item) => !isHhResult(item.sourceUrl)).length,
        officialDomainsConfirmed,
        icpMatch,
        icpUncertain,
        icpMismatch,
        segmentNotApplied,
        contactsFound: accepted.reduce((sum, item) => sum + item.contactsFound, 0),
        ready: accepted.filter((item) => item.ready).length,
        falsePositives,
        runtimeMs: Date.now() - startedAt,
        requests: network.requests,
        companyIdentityQueries,
        timeouts: network.timeouts,
        abortedRequests: network.aborted,
        orphanRequests: Math.max(
          network.active,
          getActiveAbortableOperationCount() - baselineOperations,
        ),
      },
      accepted,
      sourceClasses,
      rejected: rejected.slice(0, 20),
      rejectionReasons: rejected.reduce<Record<string, number>>((counts, item) => {
        counts[item.reason] = (counts[item.reason] ?? 0) + 1;
        return counts;
      }, {}),
      mutated: false,
      smtpCalls: 0,
    };
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", abortFromParent);
    if (!runController.signal.aborted) {
      runController.abort(new DOMException("AI hiring canary completed", "AbortError"));
    }
  }
}
