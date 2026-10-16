import { inspectVacancy } from "@/lib/leadgen/ai-hiring-live-canary";
import { normalizeDomain } from "@/lib/leadgen/company-identity";
import { assessDirectAiNeedDocuments, planDirectAiNeedSearch } from "@/lib/leadgen/direct-ai-need-agent";
import { createLeadgenSearchProvider } from "@/lib/leadgen/search/leadgen-search-provider";

// Imported identity enters the same semantic demand assessment as discovery.
// No supplied notes are upgraded to verified evidence.
export async function researchImportedCompanySignal(companyName: string, website: string, parentSignal?: AbortSignal) {
  const signal = parentSignal ? AbortSignal.any([parentSignal, AbortSignal.timeout(40_000)]) : AbortSignal.timeout(40_000);
  try {
    const plan = await planDirectAiNeedSearch({ companyName, signal });
    if (plan.status !== "AI") return null;
    const provider = createLeadgenSearchProvider();
    const selected = [plan.queries.find((_, index) => plan.queryAngles?.[index] === "ru_job_board"),
      plan.queries.find((_, index) => plan.queryAngles?.[index] === "market_news")].filter((query): query is string => Boolean(query));
    const searches = await Promise.allSettled(selected.slice(0, 2).map(query => provider.search({
      query: query.includes(companyName) ? query : `"${companyName}" ${query}`, maxResults: 4, market: "ru", queryLanguage: "ru", signal,
    })));
    const results = [...new Map(searches.flatMap(result => result.status === "fulfilled" ? result.value : []).map(result => [result.url, result])).values()].slice(0, 4);
    const inspected = [];
    for (let index = 0; index < results.length; index += 2) {
      inspected.push(...await Promise.all(results.slice(index, index + 2).map(result => inspectVacancy(result, fetch, signal))));
    }
    const domain = normalizeDomain(website);
    const documents = inspected.flatMap(item => {
      const vacancy = item.vacancy;
      if (!vacancy) return [];
      const linkedIdentity = normalizeDomain(vacancy.employerWebsite) === domain ||
        normalizeDomain(vacancy.sourceUrl) === domain ||
        item.sourceLinks?.some(link => normalizeDomain(link) === domain);
      if (!linkedIdentity) return [];
      return [{ id: vacancy.id ?? vacancy.sourceUrl, title: vacancy.title, excerpt: vacancy.description ?? "", sourceUrl: vacancy.sourceUrl,
        companyName: vacancy.employerName, activeJobPosting: vacancy.sourceProvider === "hh-web" }];
    });
    const assessed = await assessDirectAiNeedDocuments({ documents, signal });
    const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const best = assessed?.find(item => item.classification === "DIRECT" && item.freshness === "CURRENT" &&
      item.organizationKind === "COMMERCIAL" && item.companyName && normalize(item.companyName) === normalize(companyName));
    const document = documents.find(item => item.id === best?.id);
    return best && document ? { title: document.title, detail: best.evidenceExcerpt, sourceUrl: document.sourceUrl, confidence: best.confidence } : null;
  } catch {
    return null;
  }
}
