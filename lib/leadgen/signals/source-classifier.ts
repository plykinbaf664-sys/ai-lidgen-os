import type { SearchResult } from "@/lib/leadgen/search/search-provider";

export type SourceType =
  | "company_site"
  | "company_careers"
  | "job_board"
  | "aggregator"
  | "social"
  | "news"
  | "blog"
  | "press_release"
  | "directory"
  | "unknown";

export type SourceClassificationResult = {
  source_type: SourceType;
  source_domain: string | null;
  classification_confidence: number;
  classification_reason: string;
};

const jobBoardDomains = [
  "indeed.",
  "glassdoor.",
  "linkedin.",
  "hh.ru",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "workable.com",
  "ziprecruiter.",
];

const socialDomains = [
  "youtube.com",
  "linkedin.com",
  "t.me",
  "telegram.me",
  "twitter.com",
  "x.com",
  "facebook.com",
];

const newsDomains = [
  "businesswire.com",
  "prnewswire.com",
  "techcrunch.com",
  "forbes.com",
  "reuters.com",
  "bloomberg.com",
  "vc.ru",
  "rb.ru",
];

const directoryDomains = [
  "g2.com",
  "capterra.com",
  "crunchbase.com",
  "clutch.co",
  "tracxn.com",
  "getapp.com",
];

const careerPathHints = [
  "/careers",
  "/career",
  "/jobs",
  "/join-us",
  "/joinus",
  "/vacancies",
  "/work-with-us",
];

const aggregatorPhrases = [
  "jobs, employment",
  "jobs now hiring",
  "jobs in ",
  "all jobs",
  "1000+",
  "100+",
  "now hiring",
  "вакансии по всей",
  "все вакансии",
  "работа в ",
];

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function includesAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function domainIncludesAny(
  domain: string | null,
  domains: readonly string[],
): boolean {
  if (!domain) {
    return false;
  }

  return domains.some((item) => domain.includes(item));
}

export function classifySearchResultSource(
  result: SearchResult,
): SourceClassificationResult {
  const domain = getDomain(result.url);
  const text = normalizeText(
    [result.title, result.snippet, result.url, result.source_label].join(" "),
  );
  const path = (() => {
    try {
      return normalizeText(new URL(result.url).pathname);
    } catch {
      return "";
    }
  })();

  if (includesAny(text, aggregatorPhrases)) {
    return {
      source_type: "aggregator",
      source_domain: domain,
      classification_confidence: 82,
      classification_reason: "Broad listing or aggregate jobs page detected",
    };
  }

  if (domainIncludesAny(domain, jobBoardDomains)) {
    return {
      source_type: "job_board",
      source_domain: domain,
      classification_confidence: 78,
      classification_reason: "Known job board or hosted applicant tracking system",
    };
  }

  if (
    includesAny(path, careerPathHints) ||
    text.includes("careers") ||
    text.includes("open positions") ||
    text.includes("вакансии")
  ) {
    return {
      source_type: "company_careers",
      source_domain: domain,
      classification_confidence: 76,
      classification_reason: "Career or vacancies context on a non-aggregator page",
    };
  }

  if (
    text.includes("press release") ||
    text.includes("пресс-релиз") ||
    text.includes("announces")
  ) {
    return {
      source_type: "press_release",
      source_domain: domain,
      classification_confidence: 72,
      classification_reason: "Press release language detected",
    };
  }

  if (domainIncludesAny(domain, newsDomains) || text.includes("news")) {
    return {
      source_type: "news",
      source_domain: domain,
      classification_confidence: 70,
      classification_reason: "News source or news context detected",
    };
  }

  if (text.includes("blog") || text.includes("resources") || text.includes("блог")) {
    return {
      source_type: "blog",
      source_domain: domain,
      classification_confidence: 68,
      classification_reason: "Blog or resources context detected",
    };
  }

  if (domainIncludesAny(domain, socialDomains)) {
    return {
      source_type: "social",
      source_domain: domain,
      classification_confidence: 66,
      classification_reason: "Public social platform detected",
    };
  }

  if (domainIncludesAny(domain, directoryDomains)) {
    return {
      source_type: "directory",
      source_domain: domain,
      classification_confidence: 70,
      classification_reason: "Company directory or software listing detected",
    };
  }

  if (domain) {
    return {
      source_type: "company_site",
      source_domain: domain,
      classification_confidence: 54,
      classification_reason: "Non-platform domain treated as possible company site",
    };
  }

  return {
    source_type: "unknown",
    source_domain: null,
    classification_confidence: 0,
    classification_reason: "Unable to classify source",
  };
}
