import "server-only";

import {
  evaluateAiAutomationHiring,
  matchesAiHiringRole,
  type AiHiringIntentResult,
  type AiHiringVacancy,
} from "@/lib/leadgen/ai-hiring-intent";
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
import { verifyCompanySegment, type SegmentMatch } from "@/lib/leadgen/segment-guard";
import { getVerticalProfile, type LeadgenVerticalId } from "@/lib/leadgen/verticals";

const SEARCH_QUERIES = [
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
  icpResult: SegmentMatch | "NOT_CHECKED";
  contactsFound: number;
  contactEmail: string | null;
  contactKind: string | null;
  contactSourceUrl: string | null;
  ready: boolean;
};

export type AiHiringLiveCanaryResult = {
  mode: "LIVE_READ_ONLY";
  verticalId: LeadgenVerticalId;
  metrics: {
    jobsScanned: number;
    aiRoleCandidates: number;
    automationIntentPass: number;
    companiesExtracted: number;
    officialDomainsConfirmed: number;
    icpMatch: number;
    icpUncertain: number;
    icpMismatch: number;
    contactsFound: number;
    ready: number;
    falsePositives: number;
    runtimeMs: number;
    requests: number;
    timeouts: number;
    abortedRequests: number;
    orphanRequests: number;
  };
  accepted: AiHiringCanaryItem[];
  rejected: AiHiringCanaryItem[];
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

async function inspectVacancy(
  result: { title: string; url: string },
  trackedFetch: typeof fetch,
  signal: AbortSignal,
): Promise<{ vacancy: AiHiringVacancy | null; result: AiHiringIntentResult | null }> {
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
  evaluation?: AiHiringIntentResult | null;
}): AiHiringCanaryItem {
  return {
    company: input.evaluation?.company?.name ?? null,
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
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39);/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_500) || null;
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
  verticalId: LeadgenVerticalId;
  signal?: AbortSignal;
}): Promise<AiHiringLiveCanaryResult> {
  const startedAt = Date.now();
  const baselineOperations = getActiveAbortableOperationCount();
  const network: NetworkMetrics = { requests: 0, active: 0, timeouts: 0, aborted: 0 };
  const trackedFetch = createTrackedFetch(network);
  const runController = new AbortController();
  const abortFromParent = () => runController.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromParent, { once: true });
  const deadline = setTimeout(
    () => runController.abort(new DOMException("AI hiring canary timed out", "TimeoutError")),
    120_000,
  );
  try {
    const provider = new PublicWebSearchProvider({
      fetchImpl: trackedFetch,
      sources: ["hh-web"],
      timeoutMs: 12_000,
      minRequestIntervalMs: 350,
    });
    const searchBatches = await mapLimited(SEARCH_QUERIES, 2, async (query) =>
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
          queryAngle: "ru_job_board",
          signal: requestSignal,
        }),
      }),
    );
    const byUrl = new Map(searchBatches.flat().map((item) => [item.url, item]));
    const jobs = [...byUrl.values()].slice(0, MAX_SEARCH_RESULTS);
    const roleCandidates = jobs
      .filter((item) => matchesAiHiringRole(`${item.title} ${item.snippet}`))
      .slice(0, MAX_DETAIL_REQUESTS);
    const inspected = await mapLimited(roleCandidates, 3, (item) =>
      inspectVacancy(item, trackedFetch, runController.signal),
    );
    const accepted: AiHiringCanaryItem[] = [];
    const rejected: AiHiringCanaryItem[] = [];
    let automationIntentPass = 0;
    let companiesExtracted = 0;
    let officialDomainsConfirmed = 0;
    let contactChecks = 0;
    const seenCompanies = new Set<string>();
    for (let index = 0; index < roleCandidates.length; index += 1) {
      const source = roleCandidates[index];
      const inspection = inspected[index];
      if (!inspection.vacancy || !inspection.result) {
        rejected.push(rejectedItem({ title: resultTitle(source.title), url: source.url, reason: "vacancy_detail_unavailable" }));
        continue;
      }
      const vacancy = inspection.vacancy;
      const evaluation = inspection.result;
      if (evaluation.automationIntentMatched) automationIntentPass += 1;
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
      const segment = requireExplicitSegmentIdentity(verifyCompanySegment({
        selectedSegment: verticalId,
        companyName: evaluation.company.name,
        companySegment: officialWebsiteText,
        industry: officialWebsiteText,
        officialWebsite: evaluation.company.website,
        signalTitle: vacancy.title,
        signalSummary: evaluation.signal.signalSummary,
        signalEvidence: evaluation.signal.evidence,
        discoveryQuery: "direct AI automation hiring",
      }), verticalId, evaluation.company.name, officialWebsiteText);
      let contactsFound = 0;
      let contactEmail: string | null = null;
      let contactKind: string | null = null;
      let contactSourceUrl: string | null = null;
      if (segment.match === "MATCH" && contactChecks < MAX_CONTACT_CHECKS) {
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
              emailPriority: getVerticalProfile(verticalId).emailPriority,
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
        icpResult: segment.match,
        contactsFound,
        contactEmail,
        contactKind,
        contactSourceUrl,
        ready: segment.match === "MATCH" && contactsFound > 0,
      });
    }
    const icpMatch = accepted.filter((item) => item.icpResult === "MATCH").length;
    const icpUncertain = accepted.filter((item) => item.icpResult === "UNCERTAIN").length;
    const icpMismatch = accepted.filter((item) => item.icpResult === "MISMATCH").length;
    const falsePositives = accepted.filter((item) =>
      !item.company ||
      !item.sourceUrl ||
      !item.evidence ||
      !item.automationUseCase ||
      !item.officialWebsite,
    ).length;
    return {
      mode: "LIVE_READ_ONLY",
      verticalId,
      metrics: {
        jobsScanned: jobs.length,
        aiRoleCandidates: roleCandidates.length,
        automationIntentPass,
        companiesExtracted,
        officialDomainsConfirmed,
        icpMatch,
        icpUncertain,
        icpMismatch,
        contactsFound: accepted.reduce((sum, item) => sum + item.contactsFound, 0),
        ready: accepted.filter((item) => item.ready).length,
        falsePositives,
        runtimeMs: Date.now() - startedAt,
        requests: network.requests,
        timeouts: network.timeouts,
        abortedRequests: network.aborted,
        orphanRequests: Math.max(
          network.active,
          getActiveAbortableOperationCount() - baselineOperations,
        ),
      },
      accepted,
      rejected: rejected.slice(0, 20),
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
