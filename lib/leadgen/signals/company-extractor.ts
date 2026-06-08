import type { SearchResult } from "@/lib/leadgen/search/search-provider";
import type { SourceClassificationResult } from "@/lib/leadgen/signals/source-classifier";

export type CompanyExtractionSource =
  | "domain"
  | "title"
  | "snippet"
  | "unknown";

export type CompanyExtractionResult = {
  company_name: string | null;
  company_domain: string | null;
  extraction_confidence: number;
  extraction_source: CompanyExtractionSource;
  extraction_reason: string;
};

const platformDomains = [
  "indeed.",
  "glassdoor.",
  "linkedin.",
  "hh.ru",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "workable.com",
  "ziprecruiter.",
  "youtube.com",
  "t.me",
  "telegram.me",
  "twitter.com",
  "x.com",
  "facebook.com",
  "businesswire.com",
  "prnewswire.com",
  "techcrunch.com",
  "forbes.com",
  "reuters.com",
  "bloomberg.com",
  "g2.com",
  "capterra.com",
  "crunchbase.com",
  "clutch.co",
];

const companyTitlePatterns = [
  /\bat\s+([A-Z][A-Za-z0-9&.,' -]{2,60})\b/,
  /\bwith\s+([A-Z][A-Za-z0-9&.,' -]{2,60})\b/,
  /-\s*([A-Z][A-Za-z0-9&.,' -]{2,60})$/,
  /\|\s*([A-Z][A-Za-z0-9&.,' -]{2,60})$/,
  /\bв\s+([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z0-9&.,' -]{2,60})\b/,
];

const aggregateTitlePatterns = [
  /\bjobs\b/i,
  /\bemployment\b/i,
  /\bnow hiring\b/i,
  /\b\d+\+?\s+jobs\b/i,
  /\bjobs in\b/i,
  /\bвакансии\b/i,
  /\bработа\b/i,
];

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isPlatformDomain(domain: string | null): boolean {
  if (!domain) {
    return false;
  }

  return platformDomains.some((platformDomain) =>
    domain.includes(platformDomain),
  );
}

function humanizeDomain(domain: string): string {
  const firstDomainPart = domain.split(".")[0] ?? domain;

  return firstDomainPart
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanCompanyName(value: string): string {
  return value
    .replace(/\s+\((now hiring|hiring|jobs).*$/i, "")
    .replace(/\s+(jobs|careers|vacancies).*$/i, "")
    .replace(/[|,-]\s*(careers|jobs|vacancies).*$/i, "")
    .trim();
}

function extractFromText(text: string): string | null {
  for (const pattern of companyTitlePatterns) {
    const match = text.match(pattern);
    const companyName = match?.[1] ? cleanCompanyName(match[1]) : null;

    if (companyName && !aggregateTitlePatterns.some((item) => item.test(companyName))) {
      return companyName;
    }
  }

  return null;
}

export function extractCompanyFromSearchResult(
  result: SearchResult,
  source: SourceClassificationResult,
): CompanyExtractionResult {
  const domain = getDomain(result.url);

  if (
    domain &&
    !isPlatformDomain(domain) &&
    (source.source_type === "company_site" ||
      source.source_type === "company_careers" ||
      source.source_type === "blog" ||
      source.source_type === "press_release")
  ) {
    return {
      company_name: humanizeDomain(domain),
      company_domain: domain,
      extraction_confidence: 82,
      extraction_source: "domain",
      extraction_reason: "Company-like domain extracted from source URL",
    };
  }

  const titleCompany = extractFromText(result.title);

  if (titleCompany) {
    return {
      company_name: titleCompany,
      company_domain: null,
      extraction_confidence: 70,
      extraction_source: "title",
      extraction_reason: "Company name pattern extracted from result title",
    };
  }

  const snippetCompany = extractFromText(result.snippet);

  if (snippetCompany) {
    return {
      company_name: snippetCompany,
      company_domain: null,
      extraction_confidence: 56,
      extraction_source: "snippet",
      extraction_reason: "Company name pattern extracted from result snippet",
    };
  }

  return {
    company_name: null,
    company_domain: domain && !isPlatformDomain(domain) ? domain : null,
    extraction_confidence: 0,
    extraction_source: "unknown",
    extraction_reason: "No specific company could be extracted",
  };
}
