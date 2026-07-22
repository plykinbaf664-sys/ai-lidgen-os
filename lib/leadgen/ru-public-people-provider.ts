import { createLeadgenSearchProvider } from "@/lib/leadgen/search/leadgen-search-provider";
import type {
  SearchProvider,
  SearchResult,
} from "@/lib/leadgen/search/search-provider";
import type {
  PeopleEnrichmentProvider,
  PeopleProviderInput,
  PeopleProviderResult,
} from "@/lib/leadgen/people-provider";
import {
  buildProviderUnavailableResult,
  getCompanyDomain,
  getRoleFitConfidence,
  getRoleKeywordGroups,
  getTargetTitles,
  hasTargetRoleMatch,
} from "@/lib/leadgen/people-provider-utils";
import type { PersonCandidate } from "@/lib/leadgen/types";

type CandidateDraft = {
  fullName: string;
  roleTitle: string | null;
  department: string | null;
  sourceUrl: string;
  sourceTitle: string;
  sourceSnippet: string;
  linkedinUrl: string | null;
  telegramUrl: string | null;
  vkUrl: string | null;
  workEmail: string | null;
  evidence: string[];
};

const CYRILLIC_NAME_PATTERN =
  /(?<![\p{L}\p{N}_])([\u0410-\u042f\u0401][\u0430-\u044f\u0451]{2,})\s+([\u0410-\u042f\u0401][\u0430-\u044f\u0451]{2,})(?:\s+([\u0410-\u042f\u0401][\u0430-\u044f\u0451]{2,}))?(?![\p{L}\p{N}_])/gu;
const LATIN_NAME_PATTERN =
  /(?<![\p{L}\p{N}_])([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})(?![\p{L}\p{N}_])/gu;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const GENERIC_EMAIL_PREFIX_PATTERN =
  /^(info|sales|support|hello|office|admin|contact|mail|marketing|hr|job|jobs|career|careers|press|pr|zakaz|order|client|service|crm|help|buh|buhgalter|accounting|account|finance|fin|bookkeeping|pay|payment|billing)@/i;
const FREE_EMAIL_DOMAIN_PATTERN =
  /@(gmail\.com|mail\.ru|yandex\.ru|ya\.ru|bk\.ru|list\.ru|inbox\.ru|outlook\.com|hotmail\.com|icloud\.com)$/i;
const ROLE_LIKE_NAME_PATTERN =
  /\b(?:sales|director|head|executive|assistant|manager|operations|marketing|product|support|success|growth|page|team|leadership|north|america|commercial|revenue|founder|owner|chief|officer|coo|ceo|cmo|cro|management|consulting|academy|university|objective|toggle|navigation|menu|catalog|contact|contacts|search|home|about|phone|email)\b/i;
const RU_ROLE_LIKE_NAME_PATTERN =
  /(?:\u0440\u0443\u043a\u043e\u0432\u043e\u0434|\u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440|\u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440|\u043f\u0440\u043e\u0434\u0430\u0436|\u043c\u0430\u0440\u043a\u0435\u0442|\u043e\u043f\u0435\u0440\u0430\u0446|\u043a\u043e\u043c\u043c\u0435\u0440\u0447|\u043e\u0442\u0434\u0435\u043b|\u043a\u043e\u043c\u0430\u043d\u0434|\u043e\u0441\u043d\u043e\u0432\u0430\u0442|\u0432\u043b\u0430\u0434\u0435\u043b|\u0433\u0435\u043d\u0435\u0440\u0430\u043b|\u043d\u0430\u0448\u0435|\u043d\u0430\u0448\u0430|\u043f\u0440\u043e\u0438\u0437\u0432\u043e\u0434\u0441\u0442\u0432|\u043a\u043e\u043c\u043f\u0430\u043d\u0438|\u043a\u0430\u0442\u0430\u043b\u043e\u0433|\u043f\u0440\u043e\u0434\u0443\u043a\u0446|\u0432\u0430\u043a\u0430\u043d\u0441|\u0443\u0441\u043b\u043e\u0432\u0438|\u0431\u043e\u043b\u044c\u0448\u0430\u044f|\u043f\u0438\u043e\u043d\u0435\u0440\u0441\u043a|\u0443\u043b\u0438\u0446|\u0430\u0434\u0440\u0435\u0441|\u0433\u043e\u0440\u043e\u0434|\u043e\u0431\u043b\u0430\u0441\u0442|\u043a\u043e\u043b\u043b\u0435\u0433|\u0431\u0438\u0437\u043d\u0435\u0441|\u0446\u0435\u043d\u0442\u0440|\u043e\u0431\u0449\u0435\u0441\u0442\u0432|\u0441\u043e\u044e\u0437|\u0430\u043b\u044c\u044f\u043d\u0441|\u0440\u043e\u0441\u0441\u0438\u0439|\u0444\u0435\u0434\u0435\u0440\u0430\u0446|\u0441\u0442\u0440\u0430\u043d|\u0440\u0435\u0433\u0438\u043e\u043d|\u043a\u0440\u0430\u0439|\u0440\u0435\u0441\u043f\u0443\u0431\u043b\u0438\u043a)/i;

const RU_EXECUTIVE_TITLES = [
  "\u0433\u0435\u043d\u0435\u0440\u0430\u043b\u044c\u043d\u044b\u0439 \u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440",
  "\u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0439 \u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440",
  "\u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440 \u043f\u043e \u043f\u0440\u043e\u0434\u0430\u0436\u0430\u043c",
  "\u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u043e\u0442\u0434\u0435\u043b\u0430 \u043f\u0440\u043e\u0434\u0430\u0436",
  "\u0440\u043e\u043f",
  "\u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440 \u043f\u043e \u043c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433\u0443",
  "\u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u043c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433\u0430",
  "\u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440 \u043f\u043e \u0440\u0430\u0437\u0432\u0438\u0442\u0438\u044e",
  "\u043e\u043f\u0435\u0440\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0439 \u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440",
  "\u043e\u0441\u043d\u043e\u0432\u0430\u0442\u0435\u043b\u044c",
  "\u0432\u043b\u0430\u0434\u0435\u043b\u0435\u0446",
];

function unique(values: string[]): string[] {
  return values.filter((value, index, list) => list.indexOf(value) === index);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "");
}

function getSearchText(result: SearchResult): string {
  return normalizeWhitespace(
    [result.title, result.snippet, result.url, result.source_label].join(" "),
  );
}

function quote(value: string): string {
  return `"${value}"`;
}

function getCompanyNeedles(input: PeopleProviderInput): string[] {
  return unique(
    [
      input.company.company_name,
      input.company.company_domain ?? "",
      getCompanyDomain(input.company) ?? "",
    ]
      .map((value) => normalizeComparable(value))
      .filter((value) => value.length >= 4),
  );
}

function isCompanyNameLike(name: string, input: PeopleProviderInput): boolean {
  const normalizedName = normalizeComparable(name);

  return getCompanyNeedles(input).some(
    (needle) => normalizedName.includes(needle) || needle.includes(normalizedName),
  );
}

function isLikelyPersonName(name: string, input: PeopleProviderInput): boolean {
  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length < 2 || parts.length > 3) {
    return false;
  }

  if (
    /^(OOO|AO|PAO|IP|LLC|LTD|INC|GROUP|COMPANY)$/i.test(
      parts[0].replace(/[^\w]/g, ""),
    )
  ) {
    return false;
  }

  if (
    ROLE_LIKE_NAME_PATTERN.test(name) ||
    RU_ROLE_LIKE_NAME_PATTERN.test(name) ||
    isCompanyNameLike(name, input)
  ) {
    return false;
  }

  return parts.every(
    (part) =>
      /^[A-Z][a-z]{2,}$/.test(part) ||
      /^[\u0410-\u042f\u0401][\u0430-\u044f\u0451]{2,}$/.test(part),
  );
}

function getNames(text: string, input: PeopleProviderInput): string[] {
  return unique([
    ...[...text.matchAll(CYRILLIC_NAME_PATTERN)].map((match) =>
      normalizeWhitespace([match[1], match[2], match[3]].filter(Boolean).join(" ")),
    ),
    ...[...text.matchAll(LATIN_NAME_PATTERN)].map((match) =>
      normalizeWhitespace(`${match[1]} ${match[2]}`),
    ),
  ]).filter((name) => isLikelyPersonName(name, input));
}

function getWorkEmails(text: string, input: PeopleProviderInput): string[] {
  const companyDomain = getCompanyDomain(input.company);

  if (!companyDomain) {
    return [];
  }

  return unique(
    [...text.matchAll(EMAIL_PATTERN)]
      .map((match) => match[0].toLowerCase())
      .filter((email) => !GENERIC_EMAIL_PREFIX_PATTERN.test(email))
      .filter((email) => !FREE_EMAIL_DOMAIN_PATTERN.test(email))
      .filter((email) => email.endsWith(`@${companyDomain}`)),
  );
}

function getCompanyWebsite(input: PeopleProviderInput): string | null {
  const domain = getCompanyDomain(input.company);

  return domain ? `https://${domain}` : null;
}

function getOfficialSiteUrls(input: PeopleProviderInput): string[] {
  const website = getCompanyWebsite(input);
  const sourceUrl = input.company.source_url;

  return unique(
    [
      sourceUrl ?? "",
      website ?? "",
      website ? `${website}/contacts` : "",
      website ? `${website}/contact` : "",
      website ? `${website}/kontakty` : "",
      website ? `${website}/about` : "",
      website ? `${website}/company` : "",
      website ? `${website}/team` : "",
      website ? `${website}/rukovodstvo` : "",
      website ? `${website}/leadership` : "",
    ].filter(Boolean),
  );
}

function stripHtml(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
}

async function fetchOfficialText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LeadgenOS/1.0 contact discovery",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return stripHtml(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getTextWindow(text: string, needle: string, radius = 700): string {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());

  if (index < 0) {
    return text.slice(0, radius * 2);
  }

  return text.slice(Math.max(0, index - radius), index + needle.length + radius);
}

function draftsFromOfficialText({
  input,
  text,
  sourceUrl,
}: {
  input: PeopleProviderInput;
  text: string;
  sourceUrl: string;
}): CandidateDraft[] {
  const roleKeywords = getRoleKeywords(input);
  const emails = getWorkEmails(text, input);

  return emails.flatMap((email) => {
    const context = getTextWindow(text, email);
    const roleTitle = getRoleTitle(context, roleKeywords);
    const names = getNames(context, input);

    if (!roleTitle || names.length === 0) {
      return [];
    }

    return names
      .slice(0, 2)
      .flatMap((fullName): CandidateDraft[] => {
        const nameContext = getTextWindow(context, fullName, 250);
        const nameRoleTitle = getRoleTitle(nameContext, roleKeywords);

        if (!nameRoleTitle) {
          return [];
        }

        return [{
          fullName,
          roleTitle: nameRoleTitle ?? roleTitle,
          department: input.decisionMaker.department,
          sourceUrl,
          sourceTitle: "Official company website",
          sourceSnippet: context.slice(0, 500),
          linkedinUrl: null,
          telegramUrl: null,
          vkUrl: null,
          workEmail: email,
          evidence: [
            `Official site contact: ${sourceUrl}`,
            `Email and role found near ${fullName}`,
          ],
        }];
      });
  });
}

function hasCompanyEvidence(input: PeopleProviderInput, result: SearchResult): boolean {
  const text = normalizeComparable(getSearchText(result));

  return getCompanyNeedles(input).some((needle) => text.includes(needle));
}

function getRoleKeywords(input: PeopleProviderInput): string[] {
  return unique([
    input.decisionMaker.primary_persona,
    ...input.decisionMaker.alternative_personas,
    ...input.decisionMaker.search_keywords,
    ...getTargetTitles(input.decisionMaker),
    ...getRoleKeywordGroups(input.decisionMaker).flat(),
    ...RU_EXECUTIVE_TITLES,
  ])
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function getRoleTitle(text: string, roleKeywords: string[]): string | null {
  const normalizedText = text.toLowerCase();

  return (
    roleKeywords
      .slice()
      .sort((left, right) => right.length - left.length)
      .find((keyword) => hasKeywordMatch(normalizedText, keyword)) ??
    null
  );
}

function hasKeywordMatch(text: string, keyword: string): boolean {
  const normalizedKeyword = keyword.toLowerCase().trim();

  if (!normalizedKeyword) {
    return false;
  }

  if (!/[\s/]/.test(normalizedKeyword) && normalizedKeyword.length <= 4) {
    return new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeRegExp(normalizedKeyword)}(?![\\p{L}\\p{N}_])`,
      "iu",
    ).test(text);
  }

  return text.includes(normalizedKeyword);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLinkedInUrl(url: string): string | null {
  return url.toLowerCase().includes("linkedin.com/in/") ? url : null;
}

function getTelegramUrl(url: string): string | null {
  const normalizedUrl = url.toLowerCase();

  return normalizedUrl.includes("t.me/") || normalizedUrl.includes("telegram.me/")
    ? url
    : null;
}

function getVkUrl(url: string): string | null {
  return url.toLowerCase().includes("vk.com/") ? url : null;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getNameFromProfileUrl(url: string, input: PeopleProviderInput): string | null {
  const normalizedUrl = url.toLowerCase();

  if (
    !normalizedUrl.includes("linkedin.com/in/") &&
    !normalizedUrl.includes("vk.com/")
  ) {
    return null;
  }

  let slug: string;

  try {
    const pathParts = new URL(url).pathname
      .split("/")
      .filter(Boolean)
      .filter(
        (part) =>
          ![
            "in",
            "pub",
            "company",
            "people",
            "profile",
            "id",
          ].includes(part.toLowerCase()),
      );

    slug = pathParts[pathParts.length - 1] ?? "";
  } catch {
    return null;
  }

  const parts = slug
    .split(/[-_.]/)
    .filter((part) => /^[a-z]{2,}$/i.test(part))
    .filter((part) => !ROLE_LIKE_NAME_PATTERN.test(part));

  if (parts.length < 2 || parts.length > 4) {
    return null;
  }

  const name = parts
    .filter((part) => part.length > 1)
    .slice(0, 3)
    .map(titleCase)
    .join(" ");

  return isLikelyPersonName(name, input) ? name : null;
}

function getInitialQueryParts(input: PeopleProviderInput): string[] {
  const company = quote(input.company.company_name);
  const domain = getCompanyDomain(input.company);
  const targetRoles = unique([
    input.decisionMaker.primary_persona,
    ...getRoleKeywordGroups(input.decisionMaker).flat(),
    ...RU_EXECUTIVE_TITLES,
  ]).slice(0, 12);
  const roleQuery = targetRoles.map(quote).join(" OR ");

  return [
    `${company} (${roleQuery})`,
    `${company} (${roleQuery}) email OR @ OR \u043f\u043e\u0447\u0442\u0430`,
    `${company} (${roleQuery}) Telegram OR \u0442\u0435\u043b\u0435\u0433\u0440\u0430\u043c OR t.me`,
    `${company} (${roleQuery}) VK OR vk.com`,
    `${company} (${roleQuery}) LinkedIn OR linkedin`,
    `${company} (${roleQuery}) vc.ru OR rb.ru OR \u0438\u043d\u0442\u0435\u0440\u0432\u044c\u044e`,
    `${company} "${input.company.company_name}" "\u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0441\u0442\u0432\u043e"`,
    `${company} "\u0433\u0435\u043d\u0435\u0440\u0430\u043b\u044c\u043d\u044b\u0439 \u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440"`,
    `${company} "\u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u0438"`,
    `${company} "\u0443\u0447\u0440\u0435\u0434\u0438\u0442\u0435\u043b\u044c"`,
    `${company} "\u0433\u0435\u043d\u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440"`,
    `${company} "\u0418\u041d\u041d" "\u0433\u0435\u043d\u0435\u0440\u0430\u043b\u044c\u043d\u044b\u0439 \u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440"`,
    `${company} site:rusprofile.ru`,
    `${company} site:checko.ru`,
    `${company} site:zachestnyibiznes.ru`,
    domain ? `site:${domain} (${roleQuery})` : "",
    domain
      ? `site:${domain} (${roleQuery}) email OR @ OR Telegram OR vk.com`
      : "",
  ].filter(Boolean);
}

function getCandidateContactQueries(
  input: PeopleProviderInput,
  candidate: CandidateDraft,
): string[] {
  const company = quote(input.company.company_name);
  const name = quote(candidate.fullName);
  const domain = getCompanyDomain(input.company);

  return [
    `${name} ${company} email OR @ OR \u043f\u043e\u0447\u0442\u0430`,
    domain ? `${name} "@${domain}"` : "",
    domain ? `${name} ${domain} email OR e-mail OR почта` : "",
    `${name} ${company} Telegram OR t.me OR \u0442\u0435\u043b\u0435\u0433\u0440\u0430\u043c`,
    `${name} ${company} VK OR vk.com`,
    `${name} ${company} LinkedIn OR linkedin`,
    domain ? `${name} ${domain} email OR @` : "",
  ].filter(Boolean);
}

function mergeDrafts(left: CandidateDraft, right: CandidateDraft): CandidateDraft {
  return {
    ...left,
    roleTitle: left.roleTitle ?? right.roleTitle,
    department: left.department ?? right.department,
    linkedinUrl: left.linkedinUrl ?? right.linkedinUrl,
    telegramUrl: left.telegramUrl ?? right.telegramUrl,
    vkUrl: left.vkUrl ?? right.vkUrl,
    workEmail: left.workEmail ?? right.workEmail,
    evidence: unique([...left.evidence, ...right.evidence]),
  };
}

function draftFromSearchResult({
  input,
  result,
}: {
  input: PeopleProviderInput;
  result: SearchResult;
}): CandidateDraft[] {
  if (!hasCompanyEvidence(input, result)) {
    return [];
  }

  const text = getSearchText(result);
  const roleKeywords = getRoleKeywords(input);
  const roleTitle = getRoleTitle(text, roleKeywords);
  const emails = getWorkEmails(text, input);
  const linkedinUrl = getLinkedInUrl(result.url);
  const telegramUrl = getTelegramUrl(result.url);
  const vkUrl = getVkUrl(result.url);

  if (!roleTitle && !linkedinUrl && !telegramUrl && !vkUrl && emails.length === 0) {
    return [];
  }

  const profileName = getNameFromProfileUrl(result.url, input);
  const names = unique([
    ...getNames(text, input),
    ...(profileName ? [profileName] : []),
  ]);

  return names.map((fullName) => ({
    fullName,
    roleTitle,
    department: input.decisionMaker.department,
    sourceUrl: result.url,
    sourceTitle: result.title,
    sourceSnippet: result.snippet,
    linkedinUrl,
    telegramUrl,
    vkUrl,
    workEmail: emails[0] ?? null,
    evidence: [`Public search result: ${result.title}`, `Source URL: ${result.url}`],
  }));
}

function mergeContactEvidence({
  candidate,
  input,
  result,
}: {
  candidate: CandidateDraft;
  input: PeopleProviderInput;
  result: SearchResult;
}): CandidateDraft {
  const text = getSearchText(result);
  const names = getNames(text, input);

  if (
    !names.some(
      (name) => normalizeComparable(name) === normalizeComparable(candidate.fullName),
    )
  ) {
    return candidate;
  }

  return mergeDrafts(candidate, {
    ...candidate,
    sourceUrl: result.url,
    sourceTitle: result.title,
    sourceSnippet: result.snippet,
    linkedinUrl: candidate.linkedinUrl ?? getLinkedInUrl(result.url),
    telegramUrl: candidate.telegramUrl ?? getTelegramUrl(result.url),
    vkUrl: candidate.vkUrl ?? getVkUrl(result.url),
    workEmail: candidate.workEmail ?? getWorkEmails(text, input)[0] ?? null,
    evidence: [
      ...candidate.evidence,
      `Contact search result: ${result.title}`,
      `Contact source URL: ${result.url}`,
    ],
  });
}

function dedupeDrafts(drafts: CandidateDraft[]): CandidateDraft[] {
  const byName = new Map<string, CandidateDraft>();

  for (const draft of drafts) {
    const key = normalizeComparable(draft.fullName);
    const existing = byName.get(key);

    byName.set(key, existing ? mergeDrafts(existing, draft) : draft);
  }

  return [...byName.values()];
}

function toPersonCandidate(
  draft: CandidateDraft,
  input: PeopleProviderInput,
  providerLabel: string,
  providerId: string,
): PersonCandidate {
  const candidate: PersonCandidate = {
    full_name: draft.fullName,
    role_title: draft.roleTitle,
    department: draft.department,
    linkedin_url: draft.linkedinUrl,
    work_email: draft.workEmail,
    phone: null,
    source: providerLabel,
    confidence_score: 0,
    evidence: draft.evidence,
    metadata: {
      provider_id: providerId,
      source_url: draft.sourceUrl,
      source_title: draft.sourceTitle,
      snippet: draft.sourceSnippet,
      telegram_url: draft.telegramUrl,
      vk_url: draft.vkUrl,
    },
  };

  return {
    ...candidate,
    confidence_score: getRoleFitConfidence({
      candidate,
      decisionMaker: input.decisionMaker,
      hasDirectContact: Boolean(
        draft.workEmail || draft.linkedinUrl || draft.telegramUrl || draft.vkUrl,
      ),
      baseConfidence: 52,
    }),
  };
}

export class RuPublicPeopleProvider implements PeopleEnrichmentProvider {
  id = "ru-public-web";
  label = "RU public web";

  constructor(private readonly searchProvider?: SearchProvider) {}

  private getSearchProvider(): SearchProvider | null {
    if (this.searchProvider) {
      return this.searchProvider;
    }

    try {
      return createLeadgenSearchProvider();
    } catch {
      return null;
    }
  }

  private async runSearches(
    searchProvider: SearchProvider,
    queries: string[],
    maxResults: number,
  ): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];
    const uniqueQueries = unique(queries);

    for (let index = 0; index < uniqueQueries.length; index += 3) {
      const batch = uniqueQueries.slice(index, index + 3);
      const results = await Promise.allSettled(
        batch.map((query) =>
          searchProvider.search({
            query,
            maxResults,
            market: "ru",
            queryLanguage: "ru",
          }),
        ),
      );

      allResults.push(
        ...results.flatMap((result) =>
          result.status === "fulfilled" ? result.value : [],
        ),
      );
    }

    return allResults;
  }

  async findPeople(input: PeopleProviderInput): Promise<PeopleProviderResult> {
    const searchProvider = this.getSearchProvider();

    if (!searchProvider) {
      return buildProviderUnavailableResult({
        providerId: this.id,
        providerLabel: this.label,
      });
    }

    const initialResults = await this.runSearches(
      searchProvider,
      getInitialQueryParts(input),
      4,
    );
    const initialDrafts = dedupeDrafts(
      initialResults.flatMap((result) => draftFromSearchResult({ input, result })),
    )
      .filter((draft) =>
        hasTargetRoleMatch(
          toPersonCandidate(draft, input, this.label, this.id),
          input.decisionMaker,
        ),
      )
      .slice(0, 4);

    const enrichedDrafts = await Promise.all(
      initialDrafts.map(async (draft) => {
        if (draft.workEmail) {
          return draft;
        }

        const contactResults = await this.runSearches(
          searchProvider,
          getCandidateContactQueries(input, draft),
          3,
        );

        return contactResults.reduce(
          (candidate, result) =>
            mergeContactEvidence({
              candidate,
              input,
              result,
            }),
          draft,
        );
      }),
    );
    const officialSiteDrafts = (
      await Promise.all(
        getOfficialSiteUrls(input).map(async (url) => {
          const text = await fetchOfficialText(url);

          return text ? draftsFromOfficialText({ input, text, sourceUrl: url }) : [];
        }),
      )
    ).flat();

    const candidates = dedupeDrafts([...enrichedDrafts, ...officialSiteDrafts])
      .map((draft) => toPersonCandidate(draft, input, this.label, this.id))
      .filter((candidate) => hasTargetRoleMatch(candidate, input.decisionMaker))
      .filter(
        (candidate) =>
          Boolean(
            candidate.work_email ||
              candidate.linkedin_url ||
              candidate.metadata.telegram_url ||
              candidate.metadata.vk_url,
          ) ||
          (Boolean(candidate.role_title) &&
            candidate.confidence_score >= 68 &&
            candidate.evidence.some((item) =>
              /source url:.*(?:linkedin\.com\/in|vk\.com\/|rusprofile\.ru|checko\.ru|zachestnyibiznes\.ru|focus\.kontur\.ru)/i.test(item),
            )),
      );

    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates,
      unavailable: false,
    };
  }
}
