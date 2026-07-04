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
  "hh.ru",
  "hh.kz",
  "hh.uz",
  "linkedin.com",
  "indeed.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "workable.com",
  "workdayjobs.com",
  "myworkdayjobs.com",
  "successfactors.com",
  "successfactors.eu",
  "smartrecruiters.com",
  "recruitee.com",
  "paycor.com",
  "zohorecruit.com",
  "welcometothejungle.com",
  "rabota.ru",
  "robota.ua",
  "jobrun.ru",
  "avito.ru",
  "superjob.ru",
  "zarplata.ru",
  "jobfilter.ru",
  "remote-job.ru",
  "remote.co",
  "remoteok.com",
  "remoterocketship.com",
  "remotejobassistant.com",
  "weworkremotely.com",
  "flexjobs.com",
  "otta.com",
  "wellfound.com",
  "startup.jobs",
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
  "builtin.com",
  "g2.com",
  "capterra.com",
  "crunchbase.com",
  "clutch.co",
  "tracxn.com",
  "getapp.com",
  "repvue.com",
  "topstartups.io",
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
  "built in ",
  "\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438 \u043f\u043e \u0432\u0441\u0435\u0439",
  "\u0432\u0441\u0435 \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438",
  "\u0440\u0430\u0431\u043e\u0442\u0430 \u0432 ",
];

const recruitingProviderPhrases = [
  "executive recruiting",
  "recruiting firm",
  "recruitment agency",
  "staffing agency",
  "talent agency",
  "sales recruiting",
  "revenue recruiting",
  "hire top sales talent",
  "support your revenue teams",
  "talent acquisition partner",
  "recruiting services",
  "recruitment services",
  "one of our clients",
  "our client is hiring",
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

  return domains.some((item) => domain === item || domain.endsWith(`.${item}`));
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

  if (domainIncludesAny(domain, jobBoardDomains)) {
    return {
      source_type: "job_board",
      source_domain: domain,
      classification_confidence: 84,
      classification_reason: "Known job platform or hosted applicant tracking system",
    };
  }

  if (includesAny(text, aggregatorPhrases)) {
    return {
      source_type: "aggregator",
      source_domain: domain,
      classification_confidence: 82,
      classification_reason: "Broad listing or aggregate jobs page detected",
    };
  }

  if (
    includesAny(text, recruitingProviderPhrases) ||
    (domain?.includes("talent") && text.includes("recruiting"))
  ) {
    return {
      source_type: "aggregator",
      source_domain: domain,
      classification_confidence: 80,
      classification_reason:
        "Recruiting, staffing, or talent provider context detected",
    };
  }

  if (domainIncludesAny(domain, directoryDomains)) {
    return {
      source_type: "directory",
      source_domain: domain,
      classification_confidence: 76,
      classification_reason: "Known directory or regional jobs listing source",
    };
  }

  if (
    includesAny(path, careerPathHints) ||
    text.includes("careers") ||
    text.includes("open positions") ||
    text.includes("\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438")
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
    text.includes("\u043f\u0440\u0435\u0441\u0441-\u0440\u0435\u043b\u0438\u0437") ||
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

  if (
    text.includes("blog") ||
    text.includes("resources") ||
    text.includes("\u0431\u043b\u043e\u0433")
  ) {
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
