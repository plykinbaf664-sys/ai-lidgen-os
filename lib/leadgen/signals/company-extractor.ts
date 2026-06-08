import type { SearchResult } from "@/lib/leadgen/search/search-provider";
import type { SourceClassificationResult } from "@/lib/leadgen/signals/source-classifier";

export type CompanyExtractionSource =
  | "explicit_pattern"
  | "structured_job_text"
  | "company_domain"
  | "title"
  | "snippet"
  | "unknown";

export type CompanyExtractionResult = {
  company_name: string | null;
  company_domain: string | null;
  source_platform: string | null;
  source_domain: string | null;
  extraction_confidence: number;
  extraction_source: CompanyExtractionSource;
  is_candidate_company_valid: boolean;
  validation_reason: string;
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
  "workdayjobs.com",
  "myworkdayjobs.com",
  "successfactors.com",
  "smartrecruiters.com",
  "recruitee.com",
  "paycor.com",
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
  /\bcareers\s+at\s+([A-Z][A-Za-z0-9&.,' -]{2,60})\b/i,
  /\bjoin\s+([A-Z][A-Za-z0-9&.,' -]{2,60})\b/,
  /\b([A-Z][A-Za-z0-9&.,' -]{2,60})\s+is\s+hiring\b/,
  /\bat\s+([A-Z][A-Za-z0-9&.,' -]{2,60})\b/,
  /\bwith\s+([A-Z][A-Za-z0-9&.,' -]{2,60})\b/,
  /-\s*([A-Z][A-Za-z0-9&.,' -]{2,60})$/,
  /\|\s*([A-Z][A-Za-z0-9&.,' -]{2,60})$/,
  /\bв\s+компании\s+([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z0-9&.,' -]{2,60})\b/i,
  /\bкомпания\s+([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z0-9&.,' -]{2,60})\s+ищет\b/i,
  /\b([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z0-9&.,' -]{2,60})\s+открыла\s+вакансию\b/i,
  /\bработа\s+в\s+компании\s+([А-ЯЁA-Z][А-ЯЁа-яёA-Za-z0-9&.,' -]{2,60})\b/i,
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

const invalidCompanyNamePatterns = [
  /^indeed$/i,
  /^linkedin$/i,
  /^hh(\.ru)?$/i,
  /^ziprecruiter$/i,
  /^glassdoor$/i,
  /^greenhouse$/i,
  /^lever$/i,
  /^ashby$/i,
  /^workday$/i,
  /^successfactors$/i,
  /^smartrecruiters$/i,
  /^recruitee$/i,
  /^workable$/i,
  /^paycor$/i,
  /^jobs?$/i,
  /^careers?$/i,
  /^vacancies$/i,
  /^работа$/i,
  /^вакансии$/i,
  /\bjobs\b/i,
  /\bcareers\b/i,
  /\bvacancies\b/i,
  /\bвакансии\b/i,
];

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getSourcePlatform(domain: string | null): string | null {
  if (!domain) {
    return null;
  }

  if (isPlatformDomain(domain)) {
    return domain;
  }

  return null;
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
    .replace(/^career(s)?\s+at\s+/i, "")
    .replace(/^job(s)?\s+at\s+/i, "")
    .replace(/\s+\((now hiring|hiring|jobs).*$/i, "")
    .replace(/\s+(jobs|careers|vacancies).*$/i, "")
    .replace(/[|,-]\s*(careers|jobs|vacancies).*$/i, "")
    .trim();
}

function validateCompanyName(
  companyName: string | null,
  sourceDomain: string | null,
): Pick<
  CompanyExtractionResult,
  "is_candidate_company_valid" | "validation_reason"
> {
  if (!companyName) {
    return {
      is_candidate_company_valid: false,
      validation_reason: "No candidate company extracted",
    };
  }

  const normalizedCompanyName = companyName.toLowerCase();
  const normalizedSourceDomain = sourceDomain?.toLowerCase() ?? "";

  if (companyName.length < 2) {
    return {
      is_candidate_company_valid: false,
      validation_reason: "Candidate company name is too short",
    };
  }

  if (
    normalizedSourceDomain &&
    normalizedCompanyName === normalizedSourceDomain.replace(/\..*$/, "")
  ) {
    return {
      is_candidate_company_valid: false,
      validation_reason: "Candidate company equals source platform/domain",
    };
  }

  if (invalidCompanyNamePatterns.some((pattern) => pattern.test(companyName))) {
    return {
      is_candidate_company_valid: false,
      validation_reason: "Candidate company looks like a platform or generic category",
    };
  }

  return {
    is_candidate_company_valid: true,
    validation_reason: "Candidate company passed validation",
  };
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

function buildExtractionResult({
  companyName,
  companyDomain,
  sourcePlatform,
  sourceDomain,
  extractionConfidence,
  extractionSource,
  extractionReason,
}: {
  companyName: string | null;
  companyDomain: string | null;
  sourcePlatform: string | null;
  sourceDomain: string | null;
  extractionConfidence: number;
  extractionSource: CompanyExtractionSource;
  extractionReason: string;
}): CompanyExtractionResult {
  const validation = validateCompanyName(companyName, sourceDomain);

  return {
    company_name: companyName,
    company_domain: validation.is_candidate_company_valid ? companyDomain : null,
    source_platform: sourcePlatform,
    source_domain: sourceDomain,
    extraction_confidence: validation.is_candidate_company_valid
      ? extractionConfidence
      : 0,
    extraction_source: extractionSource,
    ...validation,
    extraction_reason: extractionReason,
  };
}

export function extractCompanyFromSearchResult(
  result: SearchResult,
  source: SourceClassificationResult,
): CompanyExtractionResult {
  const domain = getDomain(result.url);
  const sourcePlatform = getSourcePlatform(domain);
  const isCompanyOwnedSource =
    domain &&
    !isPlatformDomain(domain) &&
    (source.source_type === "company_site" ||
      source.source_type === "company_careers" ||
      source.source_type === "blog" ||
      source.source_type === "press_release");

  if (isCompanyOwnedSource) {
    return buildExtractionResult({
      companyName: humanizeDomain(domain),
      companyDomain: domain,
      sourcePlatform,
      sourceDomain: domain,
      extractionConfidence: 82,
      extractionSource: "company_domain",
      extractionReason: "Company-like domain extracted from source URL",
    });
  }

  const titleCompany = extractFromText(result.title);

  if (titleCompany) {
    return buildExtractionResult({
      companyName: titleCompany,
      companyDomain: null,
      sourcePlatform,
      sourceDomain: domain,
      extractionConfidence:
        source.source_type === "job_board" || source.source_type === "aggregator"
          ? 74
          : 70,
      extractionSource:
        source.source_type === "job_board" || source.source_type === "aggregator"
          ? "structured_job_text"
          : "explicit_pattern",
      extractionReason: "Company name pattern extracted from result title",
    });
  }

  const snippetCompany = extractFromText(result.snippet);

  if (snippetCompany) {
    return buildExtractionResult({
      companyName: snippetCompany,
      companyDomain: null,
      sourcePlatform,
      sourceDomain: domain,
      extractionConfidence:
        source.source_type === "job_board" || source.source_type === "aggregator"
          ? 64
          : 56,
      extractionSource:
        source.source_type === "job_board" || source.source_type === "aggregator"
          ? "structured_job_text"
          : "snippet",
      extractionReason: "Company name pattern extracted from result snippet",
    });
  }

  return buildExtractionResult({
    companyName: null,
    companyDomain: null,
    sourcePlatform,
    sourceDomain: domain,
    extractionConfidence: 0,
    extractionSource: "unknown",
    extractionReason: "No specific company could be extracted",
  });
}
