import type { SearchResult } from "@/lib/leadgen/search/search-provider";
import type { CompanyInvalidReason } from "@/lib/leadgen/signals/company-quality-validator";
import { validateCompanyQuality } from "@/lib/leadgen/signals/company-quality-validator";
import type { SourceClassificationResult } from "@/lib/leadgen/signals/source-classifier";

export type CompanyExtractionSource =
  | "explicit_pattern"
  | "structured_job_text"
  | "company_domain"
  | "title"
  | "snippet"
  | "unknown";

export type CompanyCandidateOption = {
  company_name: string;
  company_domain: string | null;
  extraction_source: CompanyExtractionSource;
  matched_ru_pattern: string | null;
  selection_score: number;
  selection_reason: string;
  is_valid: boolean;
  invalid_reason: CompanyInvalidReason | null;
  validation_reason: string;
};

export type CompanyExtractionResult = {
  company_name: string | null;
  company_domain: string | null;
  source_platform: string | null;
  source_domain: string | null;
  is_platform_like_source: boolean;
  is_company_owned_domain: boolean;
  extraction_strategy_used: CompanyExtractionSource;
  extraction_confidence: number;
  extraction_source: CompanyExtractionSource;
  matched_ru_pattern: string | null;
  is_candidate_company_valid: boolean;
  invalid_reason: CompanyInvalidReason | null;
  validation_reason: string;
  company_quality_score: number;
  candidate_selection_score: number;
  candidate_selection_reason: string;
  candidate_options: CompanyCandidateOption[];
  extraction_reason: string;
};

type CandidateRole =
  | "employer_subject"
  | "company_owned_domain"
  | "ats_slug"
  | "organization_mention"
  | "structured_title"
  | "weak_text";

type CandidateDraft = {
  companyName: string;
  companyDomain: string | null;
  extractionSource: CompanyExtractionSource;
  role: CandidateRole;
  baseScore: number;
  extractionReason: string;
  matchedRuPattern?: string;
};

type CandidatePattern = {
  pattern: RegExp;
  role: CandidateRole;
  source: CompanyExtractionSource;
  baseScore: number;
  reason: string;
  matchedRuPattern?: string;
};

type TextCandidateSource = {
  text: string;
  extractionSource: CompanyExtractionSource;
  baseScore: number;
  reason: string;
};

const platformLikeDomains = [
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
  "workdayjobs.com",
  "myworkdayjobs.com",
  "successfactors.com",
  "successfactors.eu",
  "smartrecruiters.com",
  "recruitee.com",
  "workable.com",
  "paycor.com",
  "welcometothejungle.com",
  "career.habr.com",
  "rabota.ru",
  "robota.ua",
  "jobrun.ru",
  "gorodrabot.ru",
  "careerist.ru",
  "rabota-trud.ru",
  "workius.ru",
  "gdejob.com",
  "work.ua",
  "spisokrabot.ru",
  "stepo.ru",
  "gorodrabot.by",
  "avito.ru",
  "leboard.ru",
  "superjob.ru",
  "zarplata.ru",
  "jobfilter.ru",
  "it-vacancies.ru",
  "geekjob.ru",
  "rabotajob.ru",
  "jobcareer.ru",
  "na-svyazi.ru",
  "layboard.com",
  "joblum.com",
  "najtiraboty.ru",
  "knopka.kz",
  "cyberleninka.ru",
  "sostav.ru",
  "22century.ru",
  "remote-job.ru",
  "careerjet.ru",
  "careerjet.com",
  "joblab.ru",
  "workhere.ru",
  "facancy.ru",
  "trudvsem.ru",
  "rabix.ru",
  "finder.work",
  "rabota1000.ru",
  "work-zilla.com",
  "workzilla.com",
  "freelance.ru",
  "freelancehunt.com",
  "rabota-ipoisk.ru",
  "startupfellows.ru",
  "vk.com",
  "vk.ru",
  "ok.ru",
  "t.me",
  "telegram.me",
  "youtube.com",
  "rutube.ru",
  "tenchat.ru",
  "dzen.ru",
  "vc.ru",
  "rb.ru",
  "forbes.ru",
  "kommersant.ru",
  "tass.ru",
  "vedomosti.ru",
  "fedpress.ru",
  "spark.ru",
  "incrussia.ru",
  "vctr.media",
  "interfax.ru",
  "interfax-russia.ru",
  "rambler.ru",
  "biz360.ru",
  "klerk.ru",
  "weproject.media",
  "probusiness.io",
];

const companyOwnedSourceTypes = new Set([
  "company_site",
  "company_careers",
  "blog",
  "press_release",
]);

const domainAcronyms: Record<string, string> = {
  ptc: "PTC",
};

const ignoredSlugParts = new Set([
  "jobs",
  "job",
  "careers",
  "career",
  "vacancies",
  "vacancy",
  "view",
  "apply",
  "boards",
  "companies",
  "company",
  "openings",
  "positions",
  "roles",
  "rabota",
  "robota",
  "gorodrabot",
  "careerist",
  "rabota-trud",
  "workius",
  "gdejob",
  "spisokrabot",
  "stepo",
  "avito",
  "leboard",
  "vakansii",
  "remote",
  "udalennaya",
  "search",
  "id",
  "ids",
  "uuid",
  "guid",
  "token",
  "ref",
  "redirect",
  "jobdetail",
  "jobdetails",
  "vacancy",
  "en",
  "ru",
]);

const broadJobBoardDomains = new Set([
  "hh.ru",
  "hh.kz",
  "hh.uz",
  "linkedin.com",
  "indeed.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "career.habr.com",
  "rabota.ru",
  "robota.ua",
  "jobrun.ru",
  "gorodrabot.ru",
  "careerist.ru",
  "rabota-trud.ru",
  "workius.ru",
  "gdejob.com",
  "work.ua",
  "spisokrabot.ru",
  "stepo.ru",
  "gorodrabot.by",
  "avito.ru",
  "leboard.ru",
  "superjob.ru",
  "zarplata.ru",
  "jobfilter.ru",
  "it-vacancies.ru",
  "geekjob.ru",
  "rabotajob.ru",
  "jobcareer.ru",
  "na-svyazi.ru",
  "layboard.com",
  "joblum.com",
  "najtiraboty.ru",
  "knopka.kz",
  "cyberleninka.ru",
  "sostav.ru",
  "22century.ru",
  "remote-job.ru",
  "careerjet.ru",
  "careerjet.com",
  "joblab.ru",
  "workzilla.com",
  "work-zilla.com",
  "workhere.ru",
  "facancy.ru",
  "trudvsem.ru",
  "rabix.ru",
  "finder.work",
  "rabota1000.ru",
  "freelance.ru",
  "freelancehunt.com",
  "rabota-ipoisk.ru",
]);

const companyNamePattern =
  "([A-Z\\u0410-\\u042F\\u0401][A-Za-z\\u0410-\\u042F\\u0430-\\u044F\\u0401\\u04510-9&.,'’ -]{1,80})";

const organizationMentionPattern =
  /\b([A-Z][A-Za-z0-9&.'’+-]+(?:\s+[A-Z][A-Za-z0-9&.'’+-]+){1,4})\b/g;

const organizationMarkerPattern =
  /\b(group|software|systems|technologies|technology|solutions|labs|inc|llc|ltd|corp|corporation|company|holdings|partners|capital|ventures|studio|studios)\b/i;

const explicitCandidatePatterns: CandidatePattern[] = [
  {
    pattern: new RegExp(
      `\\u0440\\u0430\\u0431\\u043e\\u0442\\u043e\\u0434\\u0430\\u0442\\u0435\\u043b\\u044c\\s*[:\\-]\\s*${companyNamePattern}`,
      "gi",
    ),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 96,
    reason: "Explicit Russian employer field",
    matchedRuPattern: "employer_field",
  },
  {
    pattern: new RegExp(
      `\\b(?:\\u041e\\u041e\\u041e|\\u0410\\u041e|\\u041f\\u0410\\u041e|\\u0417\\u0410\\u041e|\\u0418\\u041f|\\u0413\\u041a|\\u0421\\u041a)\\s+${companyNamePattern}`,
      "gi",
    ),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 95,
    reason: "Russian legal entity marker",
    matchedRuPattern: "legal_entity_marker",
  },
  {
    pattern: new RegExp(
      `\\u043a\\u043e\\u043c\\u043f\\u0430\\u043d\\u0438\\u044f\\s+${companyNamePattern}\\s+(?:\\u0438\\u0449\\u0435\\u0442|\\u043d\\u0430\\u043d\\u0438\\u043c\\u0430\\u0435\\u0442|\\u043e\\u0442\\u043a\\u0440\\u044b\\u043b[\\u0430]?|\\u043e\\u0442\\u043a\\u0440\\u044b\\u0432\\u0430\\u0435\\u0442|\\u0440\\u0430\\u0441\\u0448\\u0438\\u0440\\u044f\\u0435\\u0442)`,
      "gi",
    ),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 94,
    reason: "Russian company as hiring or growth subject",
    matchedRuPattern: "company_subject_action",
  },
  {
    pattern: new RegExp(
      `${companyNamePattern}\\s+(?:\\u0438\\u0449\\u0435\\u0442|\\u043d\\u0430\\u043d\\u0438\\u043c\\u0430\\u0435\\u0442|\\u043e\\u0442\\u043a\\u0440\\u044b\\u043b[\\u0430]?\\s+\\u0432\\u0430\\u043a\\u0430\\u043d\\u0441\\u0438\\u044e|\\u043e\\u0442\\u043a\\u0440\\u044b\\u0432\\u0430\\u0435\\u0442\\s+\\u0432\\u0430\\u043a\\u0430\\u043d\\u0441\\u0438\\u044e|\\u0440\\u0430\\u0441\\u0448\\u0438\\u0440\\u044f\\u0435\\u0442\\s+\\u043e\\u0442\\u0434\\u0435\\u043b\\s+\\u043f\\u0440\\u043e\\u0434\\u0430\\u0436)`,
      "gi",
    ),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 93,
    reason: "Russian employer subject before action",
    matchedRuPattern: "subject_before_action",
  },
  {
    pattern: new RegExp(
      `\\b(?:\\u043c\\u044b|\\u0443\\s+\\u043d\\u0430\\u0441|\\u043a\\u043e\\u043c\\u0430\\u043d\\u0434\\u0430)\\s+\\u0432\\s+${companyNamePattern}`,
      "gi",
    ),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 94,
    reason: "Russian we-at-company employer phrase",
    matchedRuPattern: "we_at_company",
  },
  {
    pattern: new RegExp(`\\bwe\\s+at\\s+${companyNamePattern}\\b`, "gi"),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 90,
    reason: "We-at-company employer phrase",
  },
  {
    pattern: new RegExp(
      `\\bAt\\s+${companyNamePattern}\\s*,?\\s+(?:we|our|is|are|helps?|builds?|creates?|provides?)\\b`,
      "g",
    ),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 92,
    reason: "At-company employer phrase",
  },
  {
    pattern: new RegExp(
      `\\u0432\\u0430\\u043a\\u0430\\u043d\\u0441\\u0438\\u044f[\\s\\S]{0,120}\\s+\\u0432\\s+\\u043a\\u043e\\u043c\\u043f\\u0430\\u043d\\u0438\\u0438\\s+${companyNamePattern}`,
      "gi",
    ),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 92,
    reason: "Employer phrase in Russian vacancy context",
    matchedRuPattern: "vacancy_in_company",
  },
  {
    pattern: new RegExp(
      `\\u0440\\u0430\\u0431\\u043e\\u0442\\u0430\\s+\\u0432\\s+(?:\\u043a\\u043e\\u043c\\u043f\\u0430\\u043d\\u0438\\u0438\\s+)?${companyNamePattern}`,
      "gi",
    ),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 92,
    reason: "Employer phrase in Russian work context",
    matchedRuPattern: "work_in_company",
  },
  {
    pattern: new RegExp(
      `\\u0432\\s+\\u043a\\u043e\\u043c\\u043f\\u0430\\u043d\\u0438\\u0438\\s+${companyNamePattern}`,
      "gi",
    ),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 88,
    reason: "Explicit Russian company phrase",
    matchedRuPattern: "in_company",
  },
  {
    pattern: new RegExp(`\\bcareers\\s+at\\s+${companyNamePattern}\\b`, "gi"),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 90,
    reason: "Careers-at employer phrase",
  },
  {
    pattern: new RegExp(`\\b(?:jobs?|roles?|positions?)\\s+at\\s+${companyNamePattern}\\b`, "gi"),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 88,
    reason: "Jobs-at employer phrase",
  },
  {
    pattern: new RegExp(`\\bjoin\\s+${companyNamePattern}\\b`, "gi"),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 84,
    reason: "Join-company employer phrase",
  },
  {
    pattern: new RegExp(`\\b${companyNamePattern}\\s+(?:is\\s+hiring|is\\s+looking|is\\s+seeking|hires)\\b`, "gi"),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 92,
    reason: "Company appears as hiring subject",
  },
  {
    pattern: new RegExp(
      `\\b[A-Z][A-Za-z0-9&.,'’ /+-]{2,100}\\s+at\\s+${companyNamePattern}\\b`,
      "g",
    ),
    role: "employer_subject",
    source: "explicit_pattern",
    baseScore: 76,
    reason: "Job-title-at-company phrase",
  },
];

const structuredCandidatePatterns: CandidatePattern[] = [
  {
    pattern: new RegExp(`(?:\\s+[|\\-–—]\\s*|\\s*\\|\\s*)${companyNamePattern}\\s*$`, "g"),
    role: "structured_title",
    source: "structured_job_text",
    baseScore: 56,
    reason: "Company-like suffix after title separator",
  },
  {
    pattern: new RegExp(
      `${companyNamePattern}\\s+[|\\-–—]\\s*(?:jobs?|careers?|vacancies|\\u0432\\u0430\\u043a\\u0430\\u043d\\u0441\\u0438\\u0438|\\u0440\\u0430\\u0431\\u043e\\u0442\\u0430)\\b`,
      "gi",
    ),
    role: "structured_title",
    source: "structured_job_text",
    baseScore: 52,
    reason: "Company-like prefix before jobs/careers category",
  },
  {
    pattern: new RegExp(
      `${companyNamePattern}\\s+(?:careers?|jobs?|\\u0432\\u0430\\u043a\\u0430\\u043d\\u0441\\u0438\\u0438)\\b`,
      "gi",
    ),
    role: "structured_title",
    source: "structured_job_text",
    baseScore: 48,
    reason: "Company-like title before jobs/careers word",
  },
];

function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function matchesDomain(domain: string, candidateDomain: string): boolean {
  return domain === candidateDomain || domain.endsWith(`.${candidateDomain}`);
}

function getPlatformLikeDomain(domain: string | null): string | null {
  if (!domain) {
    return null;
  }

  return (
    platformLikeDomains.find((platformDomain) =>
      matchesDomain(domain, platformDomain),
    ) ?? null
  );
}

function isPlatformLikeDomain(domain: string | null): boolean {
  return Boolean(getPlatformLikeDomain(domain));
}

function isCompanyOwnedSource(
  domain: string | null,
  source: SourceClassificationResult,
): boolean {
  return Boolean(
    domain &&
      !isPlatformLikeDomain(domain) &&
      companyOwnedSourceTypes.has(source.source_type),
  );
}

function formatDomainPart(part: string): string {
  const normalizedPart = part.toLowerCase();

  if (domainAcronyms[normalizedPart]) {
    return domainAcronyms[normalizedPart];
  }

  return normalizedPart.charAt(0).toUpperCase() + normalizedPart.slice(1);
}

function humanizeSlug(value: string): string {
  if (value.includes(".")) {
    return value;
  }

  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map(formatDomainPart)
    .join(" ");
}

function humanizeDomain(domain: string): string {
  if (domain.endsWith(".group")) {
    return domain;
  }

  const domainParts = domain.split(".").filter(Boolean);
  const firstCompanyPart =
    domainParts.find((part) => part !== "careers" && part !== "jobs") ??
    domainParts[0] ??
    domain;

  return humanizeSlug(firstCompanyPart);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function countWords(value: string): number {
  return normalize(value).split(/\s+/).filter(Boolean).length;
}

function slugify(value: string): string {
  return normalize(value).replace(/[^a-z0-9\u0430-\u044f\u0451]+/g, "-");
}

function looksLikeRandomSlugSegment(value: string): boolean {
  const segment = value.trim().toLowerCase();

  if (!segment) {
    return true;
  }

  const compact = segment.replace(/[-_]/g, "");

  if (compact.length < 3) {
    return true;
  }

  if (/^(?=.*[a-z])(?=.*\d)[a-z0-9]{6,}$/i.test(compact)) {
    return true;
  }

  if (/^[a-f0-9]{8,}$/i.test(compact)) {
    return true;
  }

  if (/^[a-z]{5,}$/i.test(compact)) {
    const vowels = compact.match(/[aeiouy]/gi)?.length ?? 0;

    return vowels / compact.length < 0.18;
  }

  return false;
}

function isBroadJobBoardPlatform(sourcePlatform: string | null): boolean {
  return Boolean(sourcePlatform && broadJobBoardDomains.has(sourcePlatform));
}

function hasHostedCompanyPath(url: string): boolean {
  try {
    const pathParts = new URL(url).pathname
      .split("/")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);

    return pathParts.includes("companies") || pathParts.includes("company");
  } catch {
    return false;
  }
}

function getSearchText(result: SearchResult): string {
  return [
    result.title,
    result.snippet,
    result.source_label,
    result.raw_content ?? "",
    result.url,
  ].join(" ");
}

function cleanCompanyName(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/^at\s+/i, "")
    .replace(/^company\s+/i, "")
    .replace(/^\u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f\s+/i, "")
    .replace(
      /\s+\u0432\s+[\u0410-\u042f\u0401][\u0410-\u042f\u0430-\u044f\u0401\u0451 -]{2,40}(?:\s+\u0441\u0440\u043e\u0447\u043d\u043e)?$/i,
      "",
    )
    .replace(/\s+\u0441\u0440\u043e\u0447\u043d\u043e$/i, "")
    .replace(/\s*,\s*(?:you|we|which|that|who|where|when)\b[\s\S]*$/i, "")
    .replace(
      /\s*\.\s*(?=(?:salary|compensation|pay|posted|date|archived|archive|location|remote|hybrid|onsite|experience|schedule|conditions|description|\u0437\u0430\u0440\u043f\u043b\u0430\u0442\u0430|\u043e\u043f\u043b\u0430\u0442\u0430|\u0434\u043e\u0445\u043e\u0434|\u0434\u0430\u0442\u0430|\u0430\u0440\u0445\u0438\u0432|\u0433\u043e\u0440\u043e\u0434))[\s\S]*$/i,
      "",
    )
    .replace(/^inside\s+/i, "")
    .replace(
      /\s+(?:press releases?|newsroom|company news|latest news|media center|logo|careers home|about us|our team)$/i,
      "",
    )
    .replace(
      /\s*[.。]\s*(?:salary|compensation|pay|posted|date|archived|archive|location|remote|hybrid|onsite|experience|schedule|conditions|description|about the role|job description|\u0437\u0430\u0440\u043f\u043b\u0430\u0442\u0430|\u043e\u043f\u043b\u0430\u0442\u0430|\u0434\u043e\u0445\u043e\u0434|\u0434\u0430\u0442\u0430|\u0430\u0440\u0445\u0438\u0432|\u0430\u0440\u0445\u0438\u0432\u043d\u0430\u044f|\u0433\u0440\u0430\u0444\u0438\u043a|\u043e\u043f\u044b\u0442|\u0433\u043e\u0440\u043e\u0434|\u043b\u043e\u043a\u0430\u0446\u0438\u044f|\u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435|\u0443\u0441\u043b\u043e\u0432\u0438\u044f|\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u044f|\u0440\u0430\u0431\u043e\u0442\u0430)\b[\s\S]*$/i,
      "",
    )
    .replace(
      /\s+(?:salary|compensation|pay|posted|date|archived|archive|location|remote|hybrid|onsite|experience|schedule|conditions|\u0437\u0430\u0440\u043f\u043b\u0430\u0442\u0430|\u043e\u043f\u043b\u0430\u0442\u0430|\u0434\u043e\u0445\u043e\u0434|\u0434\u0430\u0442\u0430|\u0430\u0440\u0445\u0438\u0432|\u0433\u0440\u0430\u0444\u0438\u043a|\u043e\u043f\u044b\u0442|\u0433\u043e\u0440\u043e\u0434|\u043b\u043e\u043a\u0430\u0446\u0438\u044f|\u0443\u0441\u043b\u043e\u0432\u0438\u044f)\s*:.*$/i,
      "",
    )
    .replace(/\s*[|,;-]\s*(?:LinkedIn|HH\.ru|hh\.ru|Indeed|ZipRecruiter|Glassdoor).*$/i, "")
    .replace(
      /\s*[|,;-]\s*(?:jobs?|careers?|vacancies|\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438|\u0440\u0430\u0431\u043e\u0442\u0430).*$/i,
      "",
    )
    .replace(/^career(s)?\s+at\s+/i, "")
    .replace(/^job(s)?\s+at\s+/i, "")
    .replace(
      /\s+\((?:now hiring|hiring|jobs|careers|\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438|\u0440\u0430\u0431\u043e\u0442\u0430).*$/i,
      "",
    )
    .replace(
      /\s+(?:is hiring|is looking|is seeking|offers|provides|helps|\u043e\u0442\u043a\u0440\u044b\u043b\u0430 \u0432\u0430\u043a\u0430\u043d\u0441\u0438\u044e|\u0438\u0449\u0435\u0442|\u0438\u0449\u0435\u043c|\u043f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u0442|\u043f\u043e\u043c\u043e\u0433\u0430\u0435\u0442|\u043d\u0430\u043d\u0438\u043c\u0430\u0435\u0442).*$/i,
      "",
    )
    .replace(/[.:;,!?\s]+$/g, "")
    .trim();
}

function includesNormalized(text: string, value: string): boolean {
  return normalize(text).includes(normalize(value));
}

function isBrandStyledName(companyName: string): boolean {
  return (
    /[A-Z][a-z]+[A-Z]/.test(companyName) ||
    /\b[A-Z]{2,}\b/.test(companyName) ||
    /^[a-z0-9-]+\.[a-z]{2,}$/i.test(companyName) ||
    organizationMarkerPattern.test(companyName)
  );
}

function isOrganizationLikeMention(companyName: string): boolean {
  const words = countWords(companyName);

  if (words < 2 || words > 5) {
    return false;
  }

  if (organizationMarkerPattern.test(companyName) || isBrandStyledName(companyName)) {
    return true;
  }

  return companyName
    .split(/\s+/)
    .every((word) => /^[A-Z][A-Za-z0-9&.'’+-]*$/.test(word));
}

function hasAtsSlugEvidence(result: SearchResult, companyName: string): boolean {
  const companySlug = slugify(companyName);

  if (companySlug.length < 3) {
    return false;
  }

  try {
    const url = new URL(result.url);
    const urlPath = slugify(url.pathname);
    const urlSearch = slugify(url.search);
    const listingPatterns = [
      `jobs-in-${companySlug}`,
      `q-${companySlug}`,
      `l-${companySlug}`,
      `${companySlug}-jobs`,
      `location-${companySlug}`,
      `locations-${companySlug}`,
      `city-${companySlug}`,
      `region-${companySlug}`,
    ];

    if (listingPatterns.some((pattern) => urlPath.includes(pattern))) {
      return false;
    }

    return urlPath.includes(companySlug) || urlSearch.includes(companySlug);
  } catch {
    return false;
  }
}

function hasDomainCompanyEvidence(
  result: SearchResult,
  domainCompanyName: string,
): boolean {
  return includesNormalized(
    [
      result.title,
      result.snippet,
      result.source_label,
      result.raw_content ?? "",
    ].join(" "),
    domainCompanyName,
  );
}

function getEmployerSubjectBonus(result: SearchResult, companyName: string): number {
  const text = getSearchText(result);
  const escapedCompanyName = companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\b${escapedCompanyName}\\s+(?:is\\s+hiring|is\\s+looking|is\\s+seeking|hires|offers|provides)\\b`, "i"),
    new RegExp(`\\b(?:careers|jobs|roles|positions)\\s+at\\s+${escapedCompanyName}\\b`, "i"),
    new RegExp(`\\b(?:join|work\\s+at)\\s+${escapedCompanyName}\\b`, "i"),
    new RegExp(`\\b(?:we\\s+at|\\u043c\\u044b\\s+\\u0432|\\u0443\\s+\\u043d\\u0430\\u0441\\s+\\u0432)\\s+${escapedCompanyName}\\b`, "i"),
  ];

  return patterns.some((pattern) => pattern.test(text)) ? 24 : 0;
}

function getRepetitionBonus(result: SearchResult, companyName: string): number {
  const fields = [
    result.title,
    result.snippet,
    result.source_label,
    result.raw_content ?? "",
  ];
  const mentions = fields.filter((field) =>
    includesNormalized(field, companyName),
  ).length;

  return Math.min(mentions * 7, 21);
}

function getSourcePenalty(source: SourceClassificationResult): number {
  if (source.source_type === "aggregator" || source.source_type === "directory") {
    return -22;
  }

  return 0;
}

function scoreCandidateDraft({
  draft,
  result,
  source,
  sourceDomain,
  isPlatformLikeSource,
  isCompanyOwnedDomain,
}: {
  draft: CandidateDraft;
  result: SearchResult;
  source: SourceClassificationResult;
  sourceDomain: string | null;
  isPlatformLikeSource: boolean;
  isCompanyOwnedDomain: boolean;
}): { score: number; reason: string } {
  const reasons = [draft.extractionReason];
  let score = draft.baseScore;
  const wordCount = countWords(draft.companyName);

  if (draft.role === "company_owned_domain" && isCompanyOwnedDomain) {
    score += 28;
    reasons.push("company-owned domain evidence");
  }

  if (hasAtsSlugEvidence(result, draft.companyName)) {
    score += 30;
    reasons.push("candidate appears in ATS/source URL slug");
  }

  const subjectBonus = getEmployerSubjectBonus(result, draft.companyName);

  if (subjectBonus > 0) {
    score += subjectBonus;
    reasons.push("candidate appears as employer subject");
  }

  const repetitionBonus = getRepetitionBonus(result, draft.companyName);

  if (repetitionBonus > 0) {
    score += repetitionBonus;
    reasons.push("candidate repeats in title/snippet/source context");
  }

  if (isBrandStyledName(draft.companyName)) {
    score += 8;
    reasons.push("candidate is brand-styled");
  }

  if (wordCount >= 2) {
    score += Math.min(wordCount * 5, 18);
    reasons.push("candidate is a fuller organization name");
  }

  if (
    sourceDomain &&
    draft.role !== "company_owned_domain" &&
    includesNormalized(draft.companyName, humanizeDomain(sourceDomain))
  ) {
    score += 12;
    reasons.push("candidate contains source domain brand fragment");
  }

  if (isPlatformLikeSource && draft.role !== "employer_subject" && draft.role !== "ats_slug") {
    score -= 18;
    reasons.push("weak candidate from platform-like source");
  }

  const sourcePenalty = getSourcePenalty(source);

  if (sourcePenalty < 0) {
    score += sourcePenalty;
    reasons.push("aggregator/directory context penalty");
  }

  return {
    score: Math.min(Math.max(score, 0), 100),
    reason: reasons.join("; "),
  };
}

function collectPatternDrafts(
  texts: string[],
  patterns: CandidatePattern[],
  companyDomain: string | null,
): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];

  for (const text of texts) {
    for (const candidatePattern of patterns) {
      for (const match of text.matchAll(candidatePattern.pattern)) {
        const companyName = match[1] ? cleanCompanyName(match[1]) : null;

        if (!companyName) {
          continue;
        }

        drafts.push({
          companyName,
          companyDomain,
          extractionSource: candidatePattern.source,
          role: candidatePattern.role,
          baseScore: candidatePattern.baseScore,
          extractionReason: candidatePattern.reason,
          matchedRuPattern: candidatePattern.matchedRuPattern,
        });
      }
    }
  }

  return drafts;
}

function collectOrganizationMentionDrafts(
  textSources: TextCandidateSource[],
  companyDomain: string | null,
): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];

  for (const textSource of textSources) {
    for (const match of textSource.text.matchAll(organizationMentionPattern)) {
      const companyName = match[1] ? cleanCompanyName(match[1]) : null;

      if (!companyName || !isOrganizationLikeMention(companyName)) {
        continue;
      }

      drafts.push({
        companyName,
        companyDomain,
        extractionSource: textSource.extractionSource,
        role: "organization_mention",
        baseScore: textSource.baseScore,
        extractionReason: textSource.reason,
      });
    }
  }

  return drafts;
}

function collectAtsSlugDraft(result: SearchResult): CandidateDraft | null {
  try {
    const url = new URL(result.url);
    const pathParts = url.pathname
      .split("/")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    const pathSlug = slugify(url.pathname);

    if (
      !pathParts.includes("companies") &&
      !pathParts.includes("company") &&
      (pathSlug.startsWith("q-") ||
        pathSlug.includes("-l-") ||
        pathSlug.includes("jobs-in-") ||
        pathSlug.includes("search") ||
        pathSlug.includes("vacancy"))
    ) {
      return null;
    }

    const slug = pathParts.find(
      (part) =>
        part.length >= 3 &&
        !ignoredSlugParts.has(part) &&
        !/^\d+$/.test(part) &&
        !looksLikeRandomSlugSegment(part),
    );

    if (!slug) {
      return null;
    }

    return {
      companyName: humanizeSlug(slug),
      companyDomain: null,
      extractionSource: "structured_job_text",
      role: "ats_slug",
      baseScore: 82,
      extractionReason: "Company-like source URL slug",
    };
  } catch {
    return null;
  }
}

function dedupeDrafts(drafts: CandidateDraft[]): CandidateDraft[] {
  const bestByName = new Map<string, CandidateDraft>();

  for (const draft of drafts) {
    const key = slugify(draft.companyName);
    const existing = bestByName.get(key);

    if (!existing || draft.baseScore > existing.baseScore) {
      bestByName.set(key, draft);
    }
  }

  return [...bestByName.values()];
}

function compareScoredCandidateOptions(
  left: {
    draft: CandidateDraft;
    selection: { score: number; reason: string };
  },
  right: {
    draft: CandidateDraft;
    selection: { score: number; reason: string };
  },
): number {
  const scoreDiff = right.selection.score - left.selection.score;

  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const leftWords = countWords(left.draft.companyName);
  const rightWords = countWords(right.draft.companyName);

  if (left.draft.role === "company_owned_domain" && rightWords > leftWords) {
    return 1;
  }

  if (right.draft.role === "company_owned_domain" && leftWords > rightWords) {
    return -1;
  }

  const rolePriority: Record<CandidateRole, number> = {
    ats_slug: 5,
    company_owned_domain: 4,
    employer_subject: 3,
    organization_mention: 2,
    structured_title: 1,
    weak_text: 0,
  };
  const roleDiff =
    rolePriority[right.draft.role] - rolePriority[left.draft.role];

  if (roleDiff !== 0) {
    return roleDiff;
  }

  return rightWords - leftWords;
}

function buildFallbackResult({
  result,
  source,
  sourcePlatform,
  sourceDomain,
  isPlatformLikeSource,
  isCompanyOwnedDomain,
  candidateOptions,
}: {
  result: SearchResult;
  source: SourceClassificationResult;
  sourcePlatform: string | null;
  sourceDomain: string | null;
  isPlatformLikeSource: boolean;
  isCompanyOwnedDomain: boolean;
  candidateOptions: CompanyCandidateOption[];
}): CompanyExtractionResult {
  const validation = validateCompanyQuality({
    companyName: null,
    companyDomain: null,
    sourceDomain,
    sourcePlatform,
    sourceType: source.source_type,
    isPlatformLikeSource,
    isCompanyOwnedDomain,
    extractionStrategy: "unknown",
    result,
  });

  return {
    company_name: null,
    company_domain: null,
    source_platform: sourcePlatform,
    source_domain: sourceDomain,
    is_platform_like_source: isPlatformLikeSource,
    is_company_owned_domain: isCompanyOwnedDomain,
    extraction_strategy_used: "unknown",
    extraction_confidence: 0,
    extraction_source: "unknown",
    matched_ru_pattern: null,
    is_candidate_company_valid: false,
    invalid_reason: validation.invalid_reason,
    validation_reason: validation.validation_reason,
    company_quality_score: validation.company_quality_score,
    candidate_selection_score: 0,
    candidate_selection_reason: "No high-confidence company subject found",
    candidate_options: candidateOptions,
    extraction_reason: "No specific company could be extracted",
  };
}

export function extractCompanyFromSearchResult(
  result: SearchResult,
  source: SourceClassificationResult,
): CompanyExtractionResult {
  const domain = getDomain(result.url);
  const sourcePlatform = getPlatformLikeDomain(domain);
  const isPlatformLikeSource = Boolean(sourcePlatform);
  const isHostedCompanyPath = hasHostedCompanyPath(result.url);
  const isCompanyOwnedDomain =
    isCompanyOwnedSource(domain, source) && !isHostedCompanyPath;
  const candidateDomain = isCompanyOwnedDomain ? domain : null;
  const textFields = [
    result.title,
    result.snippet,
    result.source_label,
    result.raw_content ?? "",
  ].filter(Boolean);
  const allowLooseTextMentions =
    !isBroadJobBoardPlatform(sourcePlatform) && !isHostedCompanyPath;
  const drafts: CandidateDraft[] = [
    ...collectPatternDrafts(
      textFields,
      explicitCandidatePatterns,
      candidateDomain,
    ),
    ...collectPatternDrafts(
      [result.title, result.snippet],
      structuredCandidatePatterns,
      candidateDomain,
    ),
    ...(allowLooseTextMentions
      ? collectOrganizationMentionDrafts(
          [
            {
              text: result.title,
              extractionSource: "title",
              baseScore: 66,
              reason: "Organization-like phrase in page title",
            },
            {
              text: result.source_label,
              extractionSource: "title",
              baseScore: 62,
              reason: "Organization-like phrase in source label",
            },
            {
              text: result.snippet,
              extractionSource: "snippet",
              baseScore: 58,
              reason: "Organization-like phrase in snippet",
            },
            {
              text: result.raw_content ?? "",
              extractionSource: "snippet",
              baseScore: 54,
              reason: "Organization-like phrase in page content",
            },
          ],
          candidateDomain,
        )
      : []),
  ];
  const atsSlugDraft =
    isPlatformLikeSource || isHostedCompanyPath
      ? collectAtsSlugDraft(result)
      : null;

  if (atsSlugDraft) {
    drafts.push(atsSlugDraft);
  }

  if (domain && isCompanyOwnedDomain) {
    const domainCompanyName = humanizeDomain(domain);

    if (drafts.length === 0 || hasDomainCompanyEvidence(result, domainCompanyName)) {
      drafts.push({
        companyName: domainCompanyName,
        companyDomain: domain,
        extractionSource: "company_domain",
        role: "company_owned_domain",
        baseScore: 84,
        extractionReason: "Company-like company-owned source domain",
      });
    }
  }

  const scoredOptions = dedupeDrafts(drafts)
    .map((draft) => {
      const selection = scoreCandidateDraft({
        draft,
        result,
        source,
        sourceDomain: domain,
        isPlatformLikeSource,
        isCompanyOwnedDomain,
      });
      const validation = validateCompanyQuality({
        companyName: draft.companyName,
        companyDomain: draft.companyDomain,
        sourceDomain: domain,
        sourcePlatform,
        sourceType: source.source_type,
        isPlatformLikeSource,
        isCompanyOwnedDomain,
        extractionStrategy: draft.extractionSource,
        result,
      });

      return {
        draft,
        selection,
        validation,
      };
    })
    .sort(compareScoredCandidateOptions);

  const candidateOptions: CompanyCandidateOption[] = scoredOptions.map(
    ({ draft, selection, validation }) => ({
      company_name: draft.companyName,
      company_domain: validation.is_valid ? draft.companyDomain : null,
      extraction_source: draft.extractionSource,
      matched_ru_pattern: draft.matchedRuPattern ?? null,
      selection_score: selection.score,
      selection_reason: selection.reason,
      is_valid: validation.is_valid,
      invalid_reason: validation.invalid_reason,
      validation_reason: validation.validation_reason,
    }),
  );
  const selected = scoredOptions.find(
    ({ selection, validation }) => validation.is_valid && selection.score >= 60,
  );

  if (!selected) {
    return buildFallbackResult({
      result,
      source,
      sourcePlatform,
      sourceDomain: domain,
      isPlatformLikeSource,
      isCompanyOwnedDomain,
      candidateOptions,
    });
  }

  return {
    company_name: selected.draft.companyName,
    company_domain: selected.validation.is_valid
      ? selected.draft.companyDomain
      : null,
    source_platform: sourcePlatform,
    source_domain: domain,
    is_platform_like_source: isPlatformLikeSource,
    is_company_owned_domain: isCompanyOwnedDomain,
    extraction_strategy_used: selected.draft.extractionSource,
    extraction_confidence: selected.validation.is_valid
      ? Math.min(Math.round(selected.selection.score), 100)
      : 0,
    extraction_source: selected.draft.extractionSource,
    matched_ru_pattern: selected.draft.matchedRuPattern ?? null,
    is_candidate_company_valid: selected.validation.is_valid,
    invalid_reason: selected.validation.invalid_reason,
    validation_reason: selected.validation.validation_reason,
    company_quality_score: selected.validation.company_quality_score,
    candidate_selection_score: selected.selection.score,
    candidate_selection_reason: selected.selection.reason,
    candidate_options: candidateOptions,
    extraction_reason: selected.draft.extractionReason,
  };
}
