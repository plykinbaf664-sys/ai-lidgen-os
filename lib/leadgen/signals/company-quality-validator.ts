import type { SearchResult } from "@/lib/leadgen/search/search-provider";
import type { CompanyExtractionSource } from "@/lib/leadgen/signals/company-extractor";
import type { SourceType } from "@/lib/leadgen/signals/source-classifier";

export type CompanyInvalidReason =
  | "source_platform_name"
  | "generic_job_category"
  | "generic_business_phrase"
  | "geographic_entity"
  | "department_or_team"
  | "person_name"
  | "action_or_verb"
  | "sentence_fragment"
  | "non_employer_context"
  | "aggregator_or_directory_page"
  | "random_or_tokenized_name"
  | "too_short"
  | "too_long"
  | "insufficient_company_evidence";

export type CompanyQualityValidationInput = {
  companyName: string | null;
  companyDomain: string | null;
  sourceDomain: string | null;
  sourcePlatform: string | null;
  sourceType: SourceType;
  isPlatformLikeSource: boolean;
  isCompanyOwnedDomain: boolean;
  extractionStrategy: CompanyExtractionSource;
  result: SearchResult;
};

export type CompanyQualityValidationResult = {
  is_valid: boolean;
  invalid_reason: CompanyInvalidReason | null;
  validation_reason: string;
  company_quality_score: number;
};

const platformNamePattern =
  /^(indeed|linkedin|hh(\.(ru|kz|uz))?|headhunter(?:\s+(?:in|\u0432)\s+.+)?|vc(\.ru)?|habr|habr career|cnews|rb(\.ru)?|rusbase|rabota(\.ru)?|superjob|zarplata(\.ru)?|jobfilter|remote-job|ziprecruiter|glassdoor|greenhouse|lever|workday|successfactors|smartrecruiters|recruitee|workable|paycor)$/i;

const broadJobBoardPlatforms = new Set([
  "hh.ru",
  "hh.kz",
  "hh.uz",
  "linkedin.com",
  "indeed.com",
  "ziprecruiter.com",
  "glassdoor.com",
  "career.habr.com",
  "rabota.ru",
  "superjob.ru",
  "zarplata.ru",
  "jobfilter.ru",
  "remote-job.ru",
]);

const genericJobCategoryPattern =
  /\b(jobs?|careers?|vacanc(?:y|ies)|positions?|roles?|openings?|hiring|recruit(?:ing|ment)|talent|sales|customer success|account executive|account manager|sales manager|crm manager|product manager|software engineer|engineer|developer|specialist|consultant|analyst|administrator|architect|director|head of|lead|senior|junior|saas sales|b2b saas|\u0440\u0430\u0431\u043e\u0442\u0430|\u0432\u0430\u043a\u0430\u043d\u0441\u0438[\u044f\u0438]|\u043d\u0430\u0439\u043c|\u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440|\u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u0447\u0438\u043a|\u0438\u043d\u0436\u0435\u043d\u0435\u0440|\u0441\u043f\u0435\u0446\u0438\u0430\u043b\u0438\u0441\u0442|\u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a|\u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440|\u0440\u043e\u043f|\u043f\u0440\u043e\u0434\u0430\u0436[\u0430\u0438]?|\u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c)\b/i;

const genericBusinessPhrasePattern =
  /^(ai|b2b|saas|crm|gtm|recruitment|hiring|customer success|business software|crm software|sales software|marketing software|automation software|revenue teams?|growth teams?|technical skills?|sales talent|top talent|every level|open saas|cloud and ai|recruitment automation|bitrix24|amoCRM|\u0431\u0438\u0442\u0440\u0438\u043a\u044124|\u0431\u0438\u0442\u0440\u0438\u043a\u0441\s*24|\u0430\u043c\u043e\s*crm|\u0430\u043c\u043eCRM|\u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 \u043f\u043e \u043f\u0440\u043e\u0434\u0430\u0436\u0430\u043c|\u0440\u043e\u043f|\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f \u043d\u0430\u0439\u043c\u0430)$/i;

const genericBusinessWordPattern =
  /\b(ai|b2b|saas|crm|gtm|recruitment|hiring|talent|customer success|revenue|growth|technical skills|sales talent|top talent|bitrix24|amocrm|\u0431\u0438\u0442\u0440\u0438\u043a\u044124|\u0431\u0438\u0442\u0440\u0438\u043a\u0441\s*24|\u0430\u043c\u043e\s*crm|\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f|\u043d\u0430\u0439\u043c)\b/i;

const locationPattern =
  /^(?:[a-z .'-]+,\s*[a-z]{2}|bay area|remote|krym|united states|usa|us|uk|canada|germany|france|spain|italy|india|europe|emea|apac|latam|california|colorado|texas|florida|new york|los angeles|san francisco|boston|chicago|seattle|austin|denver|london|berlin|paris|toronto|moscow|saint petersburg|\u0443\u0434\u0430\u043b\u0435\u043d\u043d\u043e|\u0443\u0434\u0430\u043b\u0451\u043d\u043d\u043e|\u043a\u0440\u044b\u043c|\u0441\u043f\u0431|\u043c\u043e\u0441\u043a\u0432\u0430|\u0441\u0430\u043d\u043a\u0442-\u043f\u0435\u0442\u0435\u0440\u0431\u0443\u0440\u0433|\u0440\u043e\u0441\u0441\u0438\u044f|\u043a\u0430\u0437\u0430\u0445\u0441\u0442\u0430\u043d|\u0431\u0435\u043b\u0430\u0440\u0443\u0441\u044c)$/i;

const locationContextPattern =
  /\b(location|remote|hybrid|onsite|salary|experience|years?|city|state|region|area|metro|relocation|\u043c\u0435\u0441\u0442\u043e|\u0433\u043e\u0440\u043e\u0434|\u0440\u0435\u0433\u0438\u043e\u043d|\u0437\u0430\u0440\u043f\u043b\u0430\u0442\u0430|\u0433\u0440\u0430\u0444\u0438\u043a|\u043e\u043f\u044b\u0442|\u0443\u0434\u0430\u043b\u0435\u043d)/i;

const sentenceVerbPattern =
  /\b(is|are|was|were|be|being|been|has|have|had|leads?|supports?|supporting|builds?|building|helps?|helping|works?|working|hires?|hiring|looking|seeking|offers?|provides?|companies?|teams?|\u043a\u043e\u0442\u043e\u0440|\u0438\u0449\u0435\u0442|\u043d\u0430\u043d\u0438\u043c\u0430\u0435\u0442|\u043f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u0442|\u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442|\u043f\u043e\u043c\u043e\u0433\u0430\u0435\u0442|\u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442)\b/i;

const exactActionVerbPattern =
  /^(offers?|provides?|leads?|supports?|helps?|builds?|hires?|hiring|seeking|looking|\u043f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u0442|\u0438\u0449\u0435\u0442|\u043d\u0430\u043d\u0438\u043c\u0430\u0435\u0442|\u043f\u043e\u043c\u043e\u0433\u0430\u0435\u0442|\u0441\u0442\u0440\u043e\u0438\u0442|\u0432\u0435\u0434\u0435\u0442)$/i;

const directoryPagePattern =
  /\b(built in|job boards?|directory|directories|top companies|top recruiting|best companies|companies hiring|jobs in|jobs available in|available on indeed|on indeed\.com|apply to|all jobs|job search|\u0440\u0430\u0431\u043e\u0442\u0430 \u0432|\u0432\u0430\u043a\u0430\u043d\u0441\u0438\u0438 \u0432)\b/i;

const nonEmployerEntityPattern =
  /\b(the\s+.+\s+network|network|ecosystem|community|portfolio|investors?|venture capital|vc firm|accelerator|marketplace|job board|talent network|\u0441\u0435\u0442\u044c|\u044d\u043a\u043e\u0441\u0438\u0441\u0442\u0435\u043c\u0430|\u0441\u043e\u043e\u0431\u0449\u0435\u0441\u0442\u0432\u043e|\u043f\u043e\u0440\u0442\u0444\u0435\u043b\u044c|\u0438\u043d\u0432\u0435\u0441\u0442\u043e\u0440)\b/i;

const departmentOrTeamPattern =
  /\b(experience|technology|operations|platform|product|engineering|investment|growth|revenue|business unit|department|division|practice|function|team|\u043e\u0442\u0434\u0435\u043b|\u043a\u043e\u043c\u0430\u043d\u0434\u0430|\u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435|\u0434\u0435\u043f\u0430\u0440\u0442\u0430\u043c\u0435\u043d\u0442)\b/i;

const cyrillicPersonNamePattern =
  /^[\u0410-\u042f\u0401][\u0430-\u044f\u0451-]+\s+[\u0410-\u042f\u0401][\u0430-\u044f\u0451-]+\s+[\u0410-\u042f\u0401][\u0430-\u044f\u0451-]+(?:\s|$)/;

const cyrillicPatronymicPattern =
  /\b[\u0410-\u042f\u0401][\u0430-\u044f\u0451-]+(?:\u0432\u0438\u0447|\u0432\u043d\u0430|\u0438\u0447\u043d\u0430|\u043e\u0432\u0438\u0447|\u0435\u0432\u0438\u0447|\u043e\u0432\u043d\u0430|\u0435\u0432\u043d\u0430)\b/;

const personContextPattern =
  /\b(resume|cv|profile|candidate|applicant|personal|individual|\u0440\u0435\u0437\u044e\u043c\u0435|\u0441\u043e\u0438\u0441\u043a\u0430\u0442\u0435\u043b\u044c|\u043a\u0430\u043d\u0434\u0438\u0434\u0430\u0442|\u0444\u0438\u0437\u043b\u0438\u0446\u043e|\u043f\u0440\u043e\u0444\u0438\u043b\u044c)\b/i;

const organizationMarkerPattern =
  /\b(inc|llc|ltd|corp|corporation|company|group|software|systems|labs|technologies|tech|solutions|ventures|capital|studio|studios|\u043e\u043e\u043e|\u0430\u043e|\u0437\u0430\u043e|\u043f\u0430\u043e|\u0433\u0440\u0443\u043f\u043f\u0430|\u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f|\u0445\u043e\u043b\u0434\u0438\u043d\u0433)\b/i;

const uiChromePattern =
  /^(careers home|about us|our team)$|\b(logo|careers home|about us|our team)\b/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function countWords(value: string): number {
  return normalize(value).split(/\s+/).filter(Boolean).length;
}

function stripTld(domain: string | null): string {
  return domain?.split(".")[0]?.toLowerCase() ?? "";
}

function getSearchText(input: CompanyQualityValidationInput): string {
  return [
    input.result.title,
    input.result.snippet,
    input.result.source_label,
    input.result.raw_content ?? "",
    input.result.url,
  ].join(" ");
}

function getNonUrlSearchFields(input: CompanyQualityValidationInput): string[] {
  return [
    input.result.title,
    input.result.snippet,
    input.result.source_label,
    input.result.raw_content ?? "",
  ];
}

function includesCompany(text: string, companyName: string): boolean {
  return normalize(text).includes(normalize(companyName));
}

function countNonUrlMentions(
  input: CompanyQualityValidationInput,
  companyName: string,
): number {
  return getNonUrlSearchFields(input).filter((field) =>
    includesCompany(field, companyName),
  ).length;
}

function slugify(value: string): string {
  return normalize(value).replace(/[^a-z0-9\u0430-\u044f\u0451]+/g, "-");
}

function hasCompanyOwnedEvidence(input: CompanyQualityValidationInput): boolean {
  if (!input.isCompanyOwnedDomain || !input.sourceDomain || !input.companyName) {
    return false;
  }

  const domainPart = stripTld(input.sourceDomain).replace(/[-_]+/g, " ");
  const company = normalize(input.companyName).replace(/[-_]+/g, " ");

  return (
    domainPart === company ||
    domainPart.includes(company) ||
    company.includes(domainPart)
  );
}

function hasExplicitOrSubjectEvidence(input: CompanyQualityValidationInput): boolean {
  return hasEmployerSubjectEvidence(input) || hasExplicitCompanyEvidence(input);
}

function hasAtsSlugEvidence(input: CompanyQualityValidationInput): boolean {
  if (!input.companyName || !input.isPlatformLikeSource) {
    return false;
  }

  const companySlug = slugify(input.companyName);

  if (companySlug.length < 3) {
    return false;
  }

  try {
    const url = new URL(input.result.url);
    const urlText = `${url.pathname} ${url.search}`.toLowerCase();

    return urlText.includes(companySlug);
  } catch {
    return false;
  }
}

function hasExplicitCompanyEvidence(input: CompanyQualityValidationInput): boolean {
  if (!input.companyName) {
    return false;
  }

  const sourceText = getSearchText(input);

  return (
    input.extractionStrategy === "explicit_pattern" &&
    includesCompany(sourceText, input.companyName)
  );
}

function hasEmployerSubjectEvidence(input: CompanyQualityValidationInput): boolean {
  if (!input.companyName) {
    return false;
  }

  const sourceText = getSearchText(input);

  if (!includesCompany(sourceText, input.companyName)) {
    return false;
  }

  const escapedCompanyName = input.companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const subjectPatterns = [
    new RegExp(`\\b${escapedCompanyName}\\s+(?:is hiring|is looking|is seeking|hires|offers|provides)\\b`, "i"),
    new RegExp(`\\b(?:careers|jobs|roles|positions)\\s+at\\s+${escapedCompanyName}\\b`, "i"),
    new RegExp(`\\b(?:join|work at)\\s+${escapedCompanyName}\\b`, "i"),
    new RegExp(`\\b(?:we\\s+at|\\u043c\\u044b\\s+\\u0432|\\u0443\\s+\\u043d\\u0430\\u0441\\s+\\u0432)\\s+${escapedCompanyName}\\b`, "i"),
    new RegExp(`\\b(?:\\u0432\\s+\\u043a\\u043e\\u043c\\u043f\\u0430\\u043d\\u0438\\u0438|\\u0440\\u0430\\u0431\\u043e\\u0442\\u0430\\s+\\u0432\\s+\\u043a\\u043e\\u043c\\u043f\\u0430\\u043d\\u0438\\u0438)\\s+${escapedCompanyName}\\b`, "i"),
    new RegExp(`\\b\\u0432\\u0430\\u043a\\u0430\\u043d\\u0441\\u0438\\u044f[\\s\\S]{0,120}\\s+\\u0432\\s+\\u043a\\u043e\\u043c\\u043f\\u0430\\u043d\\u0438\\u0438\\s+${escapedCompanyName}\\b`, "i"),
  ];

  return subjectPatterns.some((pattern) => pattern.test(sourceText));
}

function hasStrongCompanyEvidence(input: CompanyQualityValidationInput): boolean {
  return (
    hasCompanyOwnedEvidence(input) ||
    hasAtsSlugEvidence(input) ||
    hasEmployerSubjectEvidence(input) ||
    hasExplicitCompanyEvidence(input)
  );
}

function isBroadJobBoardPlatform(input: CompanyQualityValidationInput): boolean {
  return Boolean(
    input.sourcePlatform && broadJobBoardPlatforms.has(input.sourcePlatform),
  );
}

function hasCompanyOwnedOverride(input: CompanyQualityValidationInput): boolean {
  return hasCompanyOwnedEvidence(input);
}

function isBrandStyledName(companyName: string): boolean {
  return (
    /[A-Z][a-z]+[A-Z]/.test(companyName) ||
    /\b[A-Z]{2,}\b/.test(companyName) ||
    /^[A-Z][a-z]{3,}$/.test(companyName) ||
    /^[a-z0-9-]+\.[a-z]{2,}$/i.test(companyName) ||
    organizationMarkerPattern.test(companyName)
  );
}

function looksLikeRandomOrTokenizedName(companyName: string): boolean {
  const normalizedName = companyName.trim();
  const compact = normalizedName.replace(/[\s._-]/g, "");
  const words = countWords(normalizedName);

  if (!compact) {
    return true;
  }

  if (words > 1 || organizationMarkerPattern.test(normalizedName)) {
    return false;
  }

  if (/^(?=.*[a-z])(?=.*\d)[a-z0-9]{6,}$/i.test(compact)) {
    return true;
  }

  if (/^[a-f0-9]{8,}$/i.test(compact)) {
    return true;
  }

  if (/^[a-z]{6,}$/i.test(compact)) {
    const vowels = compact.match(/[aeiouy]/gi)?.length ?? 0;
    const vowelRatio = vowels / compact.length;

    return vowelRatio < 0.18;
  }

  return false;
}

function looksLikeWeakSlugCandidate(
  companyName: string,
  input: CompanyQualityValidationInput,
): boolean {
  if (
    input.extractionStrategy !== "structured_job_text" ||
    !input.isPlatformLikeSource
  ) {
    return false;
  }

  if (
    hasCompanyOwnedEvidence(input) ||
    hasExplicitOrSubjectEvidence(input) ||
    organizationMarkerPattern.test(companyName)
  ) {
    return false;
  }

  const words = countWords(companyName);
  const nonUrlMentions = countNonUrlMentions(input, companyName);

  return words === 1 && companyName.length <= 6 && nonUrlMentions < 2;
}

function startsWithLowercasePhrase(companyName: string): boolean {
  return /^[a-z\u0430-\u044f\u0451]/.test(companyName) && !isBrandStyledName(companyName);
}

function looksLikeActionOrVerb(companyName: string): boolean {
  return (
    exactActionVerbPattern.test(companyName) ||
    /^(offers?|provides?|leads?|supports?|helps?|builds?|hiring|seeking|looking)\s+/i.test(companyName) ||
    /^(\u043f\u0440\u0435\u0434\u043b\u0430\u0433\u0430\u0435\u0442|\u0438\u0449\u0435\u0442|\u043d\u0430\u043d\u0438\u043c\u0430\u0435\u0442|\u043f\u043e\u043c\u043e\u0433\u0430\u0435\u0442)\s+/i.test(companyName)
  );
}

function looksLikePersonName(
  companyName: string,
  input: CompanyQualityValidationInput,
): boolean {
  if (
    cyrillicPatronymicPattern.test(companyName) ||
    cyrillicPersonNamePattern.test(companyName)
  ) {
    return true;
  }

  if (!personContextPattern.test(getSearchText(input))) {
    return false;
  }

  return /^[A-Z][a-z'-]+\s+[A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+)?$/.test(
    companyName,
  );
}

function looksLikeSentenceFragment(companyName: string): boolean {
  const words = countWords(companyName);

  return (
    words >= 6 ||
    sentenceVerbPattern.test(companyName) ||
    /\b(with|that|which|for|from|into|across|in cloud|and ai|high-performing)\b/i.test(
      companyName,
    )
  );
}

function looksLikeAggregatorOrDirectoryPage(
  companyName: string,
  input: CompanyQualityValidationInput,
): boolean {
  const text = [
    companyName,
    input.result.title,
    input.result.snippet,
    input.result.source_label,
  ].join(" ");

  if (directoryPagePattern.test(companyName)) {
    return true;
  }

  if (
    isBroadJobBoardPlatform(input) &&
    !hasEmployerSubjectEvidence(input) &&
    !hasExplicitCompanyEvidence(input)
  ) {
    return true;
  }

  return (
    (input.sourceType === "aggregator" || input.sourceType === "directory") &&
    directoryPagePattern.test(text)
  );
}

function looksLikeGeographicEntity(
  companyName: string,
  input: CompanyQualityValidationInput,
): boolean {
  const sourceText = getSearchText(input);
  const escapedCompanyName = companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const companySlug = slugify(companyName);
  const locationSegmentPatterns = [
    new RegExp(`\\b${escapedCompanyName}\\s*,\\s*[A-Z]{2}\\b`, "i"),
    new RegExp(`\\b(?:location|city|metro|area|region|onsite|hybrid|remote)\\s*:?\\s*${escapedCompanyName}\\b`, "i"),
    new RegExp(`\\b(?:\\u0433\\u043e\\u0440\\u043e\\u0434|\\u043b\\u043e\\u043a\\u0430\\u0446\\u0438\\u044f|\\u0440\\u0435\\u0433\\u0438\\u043e\\u043d)\\s*:?\\s*${escapedCompanyName}\\b`, "i"),
  ];
  const urlLocationSegmentPatterns = [
    `jobs-in-${companySlug}`,
    `${companySlug}-jobs`,
    `location/${companySlug}`,
    `locations/${companySlug}`,
    `city/${companySlug}`,
    `region/${companySlug}`,
  ];

  if (locationPattern.test(companyName)) {
    return true;
  }

  if (
    isBrandStyledName(companyName) &&
    (hasStrongCompanyEvidence(input) || includesCompany(sourceText, companyName))
  ) {
    return false;
  }

  if (hasStrongCompanyEvidence(input)) {
    return false;
  }

  if (locationSegmentPatterns.some((pattern) => pattern.test(sourceText))) {
    return true;
  }

  try {
    const url = new URL(input.result.url);
    const urlPath = slugify(url.pathname);

    if (
      urlLocationSegmentPatterns.some((pattern) => urlPath.includes(pattern))
    ) {
      return true;
    }
  } catch {
    // Ignore malformed URLs; source text checks still cover title/snippet context.
  }

  if (!locationContextPattern.test(sourceText)) {
    return false;
  }

  return /^[A-Z\u0410-\u042f\u0401][A-Za-z\u0410-\u042f\u0430-\u044f\u0401\u0451 .'-]{2,30}(,\s*[A-Z]{2})?$/.test(
    companyName,
  ) && !isBrandStyledName(companyName);
}

function looksLikeGenericBusinessPhrase(companyName: string): boolean {
  const words = countWords(companyName);

  if (genericBusinessPhrasePattern.test(companyName)) {
    return true;
  }

  return words <= 4 && genericBusinessWordPattern.test(companyName);
}

function looksLikeGenericJobCategory(companyName: string): boolean {
  const words = countWords(companyName);

  if (!genericJobCategoryPattern.test(companyName)) {
    return false;
  }

  return (
    words <= 5 ||
    /\bjobs?|careers?|vacancies|positions?|roles?|\u0432\u0430\u043a\u0430\u043d\u0441\u0438[\u044f\u0438]\b/i.test(
      companyName,
    )
  );
}

function looksLikeNonEmployerContext(
  companyName: string,
  input: CompanyQualityValidationInput,
): boolean {
  if (nonEmployerEntityPattern.test(companyName)) {
    return true;
  }

  const normalizedText = normalize(getSearchText(input));
  const normalizedCompany = normalize(companyName);

  return (
    normalizedText.includes(`in the ${normalizedCompany} network`) ||
    normalizedText.includes(`from the ${normalizedCompany} network`) ||
    normalizedText.includes(`${normalizedCompany} portfolio company`)
  );
}

function looksLikeDepartmentOrTeam(
  companyName: string,
  input: CompanyQualityValidationInput,
): boolean {
  if (hasStrongCompanyEvidence(input)) {
    return false;
  }

  const words = countWords(companyName);

  if (words < 2 || words > 5 || !departmentOrTeamPattern.test(companyName)) {
    return false;
  }

  const departmentTerms =
    companyName.match(departmentOrTeamPattern)?.length ?? 0;

  return (
    departmentTerms >= 1 &&
    !/\b(inc|llc|ltd|corp|corporation|company|group|holdings|partners|ventures|capital|\u043e\u043e\u043e|\u0430\u043e|\u0437\u0430\u043e|\u043f\u0430\u043e|\u0433\u0440\u0443\u043f\u043f\u0430|\u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f|\u0445\u043e\u043b\u0434\u0438\u043d\u0433)\b/i.test(
      companyName,
    )
  );
}

function calculateQualityScore(
  companyName: string,
  input: CompanyQualityValidationInput,
): number {
  let score = 45;
  const words = countWords(companyName);

  if (hasCompanyOwnedEvidence(input)) {
    score += 35;
  }

  if (hasAtsSlugEvidence(input)) {
    score += 30;
  }

  if (hasEmployerSubjectEvidence(input)) {
    score += 20;
  }

  if (input.extractionStrategy === "explicit_pattern") {
    score += 20;
  }

  if (input.extractionStrategy === "company_domain") {
    score += 20;
  }

  if (words >= 1 && words <= 3) {
    score += 10;
  }

  if (isBrandStyledName(companyName)) {
    score += 8;
  }

  if (input.sourceType === "aggregator" || input.sourceType === "directory") {
    score -= 20;
  }

  if (input.isPlatformLikeSource && input.extractionStrategy !== "explicit_pattern") {
    score -= 15;
  }

  if (looksLikeSentenceFragment(companyName)) {
    score -= 35;
  }

  if (looksLikeGenericJobCategory(companyName)) {
    score -= 30;
  }

  if (looksLikeGenericBusinessPhrase(companyName)) {
    score -= 30;
  }

  if (looksLikeDepartmentOrTeam(companyName, input)) {
    score -= 25;
  }

  if (looksLikeRandomOrTokenizedName(companyName)) {
    score -= 45;
  }

  if (looksLikeWeakSlugCandidate(companyName, input)) {
    score -= 35;
  }

  if (startsWithLowercasePhrase(companyName)) {
    score -= 20;
  }

  return Math.min(Math.max(score, 0), 100);
}

export function validateCompanyQuality(
  input: CompanyQualityValidationInput,
): CompanyQualityValidationResult {
  const companyName = input.companyName?.trim() ?? null;

  if (!companyName) {
    return {
      is_valid: false,
      invalid_reason: "insufficient_company_evidence",
      validation_reason: "No candidate company extracted",
      company_quality_score: 0,
    };
  }

  const qualityScore = calculateQualityScore(companyName, input);
  const strongEvidence = hasStrongCompanyEvidence(input);
  const companyOwnedOverride = hasCompanyOwnedOverride(input);

  if (companyName.length < 2) {
    return {
      is_valid: false,
      invalid_reason: "too_short",
      validation_reason: "Candidate company name is too short",
      company_quality_score: qualityScore,
    };
  }

  if (companyName.length > 70 || countWords(companyName) > 6) {
    return {
      is_valid: false,
      invalid_reason: "too_long",
      validation_reason: "Candidate company name is too long to be a reliable company name",
      company_quality_score: qualityScore,
    };
  }

  if (
    (looksLikeRandomOrTokenizedName(companyName) ||
      looksLikeWeakSlugCandidate(companyName, input)) &&
    !companyOwnedOverride
  ) {
    return {
      is_valid: false,
      invalid_reason: "random_or_tokenized_name",
      validation_reason:
        "Candidate company looks like a random URL slug, token, or weak platform-derived name without enough company evidence",
      company_quality_score: qualityScore,
    };
  }

  if (platformNamePattern.test(companyName)) {
    return {
      is_valid: false,
      invalid_reason: "source_platform_name",
      validation_reason: "Candidate company looks like a source platform",
      company_quality_score: qualityScore,
    };
  }

  if (uiChromePattern.test(companyName)) {
    return {
      is_valid: false,
      invalid_reason: "generic_job_category",
      validation_reason: "Candidate company contains UI or page chrome text",
      company_quality_score: qualityScore,
    };
  }

  if (looksLikePersonName(companyName, input) && !companyOwnedOverride) {
    return {
      is_valid: false,
      invalid_reason: "person_name",
      validation_reason: "Candidate company looks like a person name",
      company_quality_score: qualityScore,
    };
  }

  if (looksLikeActionOrVerb(companyName) && !companyOwnedOverride) {
    return {
      is_valid: false,
      invalid_reason: "action_or_verb",
      validation_reason: "Candidate company looks like an action or verb phrase",
      company_quality_score: qualityScore,
    };
  }

  if (looksLikeSentenceFragment(companyName) && !companyOwnedOverride) {
    return {
      is_valid: false,
      invalid_reason: "sentence_fragment",
      validation_reason: "Candidate company looks like a sentence fragment",
      company_quality_score: qualityScore,
    };
  }

  if (looksLikeNonEmployerContext(companyName, input) && !companyOwnedOverride) {
    return {
      is_valid: false,
      invalid_reason: "non_employer_context",
      validation_reason: "Candidate company looks like a network, ecosystem, investor, or non-employer entity",
      company_quality_score: qualityScore,
    };
  }

  if (looksLikeDepartmentOrTeam(companyName, input) && !companyOwnedOverride) {
    return {
      is_valid: false,
      invalid_reason: "department_or_team",
      validation_reason: "Candidate company looks like an internal department, team, or business unit",
      company_quality_score: qualityScore,
    };
  }

  if (
    looksLikeAggregatorOrDirectoryPage(companyName, input) &&
    !companyOwnedOverride
  ) {
    return {
      is_valid: false,
      invalid_reason: "aggregator_or_directory_page",
      validation_reason: "Candidate company looks like an aggregator or directory page",
      company_quality_score: qualityScore,
    };
  }

  if (looksLikeGenericJobCategory(companyName) && !companyOwnedOverride) {
    return {
      is_valid: false,
      invalid_reason: "generic_job_category",
      validation_reason: "Candidate company looks like a job or vacancy category",
      company_quality_score: qualityScore,
    };
  }

  if (looksLikeGeographicEntity(companyName, input) && !companyOwnedOverride) {
    return {
      is_valid: false,
      invalid_reason: "geographic_entity",
      validation_reason: "Candidate company looks like a geographic entity without company evidence",
      company_quality_score: qualityScore,
    };
  }

  if (looksLikeGenericBusinessPhrase(companyName) && !companyOwnedOverride) {
    return {
      is_valid: false,
      invalid_reason: "generic_business_phrase",
      validation_reason: "Candidate company looks like a generic business phrase",
      company_quality_score: qualityScore,
    };
  }

  if (startsWithLowercasePhrase(companyName) && !strongEvidence) {
    return {
      is_valid: false,
      invalid_reason: "insufficient_company_evidence",
      validation_reason: "Candidate company is not brand-styled and lacks strong organization evidence",
      company_quality_score: qualityScore,
    };
  }

  if (qualityScore < 50 && !strongEvidence) {
    return {
      is_valid: false,
      invalid_reason: "insufficient_company_evidence",
      validation_reason: "Candidate company has insufficient evidence for CRM use",
      company_quality_score: qualityScore,
    };
  }

  return {
    is_valid: true,
    invalid_reason: null,
    validation_reason: input.isCompanyOwnedDomain
      ? "Candidate company passed quality validation for company-owned domain"
      : "Candidate company passed quality validation",
    company_quality_score: qualityScore,
  };
}
