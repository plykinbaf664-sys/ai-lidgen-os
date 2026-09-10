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
import { runAbortableOperation, throwIfAborted } from "@/lib/network/abortable-operation";
import { isPlausiblePublicPersonName } from "@/lib/leadgen/person-factuality";
import { emailLocalMatchesPerson } from "@/lib/leadgen/person-email-evidence";

type CandidateDraft = {
  fullName: string;
  roleTitle: string | null;
  department: string | null;
  sourceUrl: string;
  sourceTitle: string;
  sourceSnippet: string;
  sourceUrls?: string[];
  linkedinUrl: string | null;
  tenchatUrl: string | null;
  telegramUrl: string | null;
  vkUrl: string | null;
  workEmail: string | null;
  contactRoute: "target_persona" | "corporate_router";
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
const RU_PROFESSION_LIKE_NAME_PATTERN =
  /(?:инженер|архитектор|конструктор|специалист|врач|эксперт|консультант|администратор|главн|заместител|начальник|прораб)/i;

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

const boundedPeopleCache = new Map<string, {
  expiresAt: number;
  result: PeopleProviderResult;
}>();
const BOUNDED_PEOPLE_CACHE_MAX = 500;
const BOUNDED_PEOPLE_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.LEADGEN_LPR_CACHE_TTL_HOURS ?? 168), 1),
  720,
) * 3_600_000;

function getBoundedPeopleCacheKey(input: PeopleProviderInput): string {
  return [
    getCompanyDomain(input.company) ?? "",
    normalizeComparable(input.company.company_name),
    ...(input.roleSearchPlan?.primary ?? [input.decisionMaker.primary_persona]),
    ...(input.roleSearchPlan?.alternatives.flat() ?? []),
  ].join("|").toLowerCase();
}

function getCachedBoundedPeople(input: PeopleProviderInput): PeopleProviderResult | null {
  const key = getBoundedPeopleCacheKey(input);
  const cached = boundedPeopleCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    boundedPeopleCache.delete(key);
    return null;
  }
  return {
    ...cached.result,
    diagnostics: [{ level: "info", message: "Compact LPR cache hit." }],
    metrics: cached.result.metrics ? {
      ...cached.result.metrics,
      search_attempts: 0,
      official_pages_fetched: 0,
      elapsed_ms: 0,
      stop_reason: "cache_hit",
      trace: {
        queries_executed: [],
        sources_checked: [],
        rejected_candidates: {},
        final_failure_reason: cached.result.candidates.length ? null : "CACHED_NOT_FOUND",
      },
    } : undefined,
  };
}

function cacheBoundedPeople(input: PeopleProviderInput, result: PeopleProviderResult) {
  const key = getBoundedPeopleCacheKey(input);
  boundedPeopleCache.set(key, {
    expiresAt: Date.now() + BOUNDED_PEOPLE_CACHE_TTL_MS,
    result,
  });
  while (boundedPeopleCache.size > BOUNDED_PEOPLE_CACHE_MAX) {
    const oldest = boundedPeopleCache.keys().next().value;
    if (!oldest) break;
    boundedPeopleCache.delete(oldest);
  }
}

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
    RU_PROFESSION_LIKE_NAME_PATTERN.test(name) ||
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

function trimLeadingCompanyToken(name: string, input: PeopleProviderInput): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length !== 3) return name;
  const companyTokens = new Set(
    input.company.company_name
      .toLowerCase()
      .split(/[^a-zа-яё0-9]+/i)
      .filter((token) => token.length >= 3),
  );
  return companyTokens.has(parts[0].toLowerCase())
    ? parts.slice(1).join(" ")
    : name;
}

function getNames(text: string, input: PeopleProviderInput): string[] {
  return unique([
    ...[...text.matchAll(CYRILLIC_NAME_PATTERN)].map((match) =>
      trimLeadingCompanyToken(
        normalizeWhitespace([match[1], match[2], match[3]].filter(Boolean).join(" ")),
        input,
      ),
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

function getBoundedOfficialSiteUrls(input: PeopleProviderInput): string[] {
  const website = getCompanyWebsite(input);
  if (!website) return [];
  return [
    "",
    "rukovodstvo",
    "management",
    "team",
    "komanda",
    "rukovoditeli",
    "direktor",
    "about",
    "company",
    "contacts",
    "news",
    "press",
  ].map((path) => path ? `${website}/${path}` : website);
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

async function fetchOfficialText(
  url: string,
  parentSignal?: AbortSignal,
): Promise<string | null> {
  return runAbortableOperation({
    timeoutMs: 7_000,
    fallback: null,
    parentSignal,
    operation: async (signal) => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LeadgenOS/1.0 contact discovery",
      },
      signal,
    });

    if (!response.ok) {
      return null;
    }

      return stripHtml(await response.text());
    },
  });
}

type OfficialPage = {
  text: string;
  relevantLinks: string[];
};

const RELEVANT_OFFICIAL_LINK_PATTERN =
  /(?:team|management|leadership|rukovod|руковод|команд|about|company|о-компан|о_компан|contacts?|kontakt|контакт|news|press|новост|пресс)/i;

function getRelevantOfficialLinks(html: string, pageUrl: string, companyDomain: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].replace(/&amp;/gi, "&").replace(/&quot;/gi, '"');
    const anchor = stripHtml(match[2]);
    if (!RELEVANT_OFFICIAL_LINK_PATTERN.test(`${href} ${anchor}`)) continue;
    try {
      const url = new URL(href, pageUrl);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      if (hostname !== companyDomain && !hostname.endsWith(`.${companyDomain}`)) continue;
      url.hash = "";
      links.push(url.toString());
    } catch {
      // Ignore malformed links from public pages.
    }
  }
  const score = (value: string) => {
    if (/(?:management|leadership|rukovod|руковод)/i.test(value)) return 100;
    if (/(?:team|команд|staff)/i.test(value)) return 90;
    if (/(?:contacts?|kontakt|контакт)/i.test(value)) return 80;
    if (/(?:about|company|о-компан|о_компан)/i.test(value)) return 70;
    if (/(?:press|пресс|news|новост)/i.test(value)) return 50;
    return 0;
  };
  return unique(links)
    .sort((left, right) => score(right) - score(left))
    .slice(0, 8);
}

async function fetchOfficialPage(
  url: string,
  companyDomain: string,
  parentSignal?: AbortSignal,
): Promise<OfficialPage | null> {
  return runAbortableOperation({
    timeoutMs: 7_000,
    fallback: null,
    parentSignal,
    operation: async (signal) => {
      const response = await fetch(url, {
        headers: { "User-Agent": "LeadgenOS/1.0 contact discovery" },
        redirect: "follow",
        signal,
      });
      if (!response.ok) return null;
      const html = await response.text();
      return {
        text: stripHtml(html),
        relevantLinks: getRelevantOfficialLinks(html, response.url || url, companyDomain),
      };
    },
  });
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
    const context = getTextWindow(text, email, 360);
    const roleTitle = getRoleTitle(context, roleKeywords);
    const names = getNames(context, input);
    const emailIndex = context.toLowerCase().indexOf(email.toLowerCase());
    const nearestName = names
      .filter((fullName) => emailLocalMatchesPerson(email, fullName))
      .map((fullName) => ({
        fullName,
        distance: Math.abs(
          context.toLowerCase().indexOf(fullName.toLowerCase()) - emailIndex,
        ),
      }))
      .filter((candidate) => candidate.distance <= 260)
      .sort((left, right) => left.distance - right.distance)[0]?.fullName;

    if (!nearestName) {
      return [];
    }
    const nameContext = getTextWindow(context, nearestName, 250);
    const nameRoleTitle = getRoleTitle(nameContext, roleKeywords) ?? roleTitle;

    return [{
      fullName: nearestName,
      roleTitle: nameRoleTitle ?? "Публичный контакт компании",
      department: nameRoleTitle ? input.decisionMaker.department : null,
      sourceUrl,
      sourceTitle: "Official company website",
      sourceSnippet: context.slice(0, 500),
      sourceUrls: [sourceUrl],
      linkedinUrl: null,
      tenchatUrl: null,
      telegramUrl: null,
      vkUrl: null,
      workEmail: email,
      contactRoute: nameRoleTitle ? "target_persona" : "corporate_router",
      evidence: [
        `Official site contact: ${sourceUrl}`,
        nameRoleTitle
          ? `Email and target role found near ${nearestName}`
          : `Published corporate email found near ${nearestName}; exact responsibility is not asserted`,
      ],
    }];
  });
}

function draftsFromOfficialPeopleText({
  input,
  text,
  sourceUrl,
}: {
  input: PeopleProviderInput;
  text: string;
  sourceUrl: string;
}): CandidateDraft[] {
  const roleKeywords = unique([
    input.decisionMaker.primary_persona,
    ...input.decisionMaker.alternative_personas,
    ...input.searchKeywords,
  ])
    .map((value) => value.trim())
    .filter((value) => value.length >= 4)
    .sort((left, right) => right.length - left.length);
  const drafts: CandidateDraft[] = [];

  for (const roleTitle of roleKeywords) {
    const normalizedText = text.toLowerCase();
    const normalizedRole = roleTitle.toLowerCase();
    let cursor = 0;
    let occurrences = 0;
    while (occurrences < 3) {
      const roleIndex = normalizedText.indexOf(normalizedRole, cursor);
      if (roleIndex < 0) break;
      occurrences += 1;
      cursor = roleIndex + normalizedRole.length;
      const start = Math.max(0, roleIndex - 420);
      const end = Math.min(text.length, roleIndex + normalizedRole.length + 420);
      const context = text.slice(start, end);
      const names = getNames(context, input)
        .map((fullName) => ({
          fullName,
          distance: Math.abs(
            start + context.toLowerCase().indexOf(fullName.toLowerCase()) - roleIndex,
          ),
        }))
        .filter((candidate) => candidate.distance <= 360)
        .sort((left, right) => left.distance - right.distance);
      const nearestName = names[0]?.fullName;
      if (!nearestName) continue;
      const email = getWorkEmails(getTextWindow(context, nearestName, 300), input)
        .find((candidate) => emailLocalMatchesPerson(candidate, nearestName)) ?? null;
      drafts.push({
        fullName: nearestName,
        roleTitle,
        department: input.decisionMaker.department,
        sourceUrl,
        sourceTitle: "Official company website",
        sourceSnippet: context.slice(0, 500),
        sourceUrls: [sourceUrl],
        linkedinUrl: null,
        tenchatUrl: null,
        telegramUrl: null,
        vkUrl: null,
        workEmail: email,
        contactRoute: "target_persona",
        evidence: [
          `Official page links ${nearestName} to role ${roleTitle}`,
          `Official source: ${sourceUrl}`,
        ],
      });
    }
  }

  return dedupeDrafts(drafts);
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

function getTenChatUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return hostname === "tenchat.ru" || hostname.endsWith(".tenchat.ru")
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
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
    ...input.decisionMaker.alternative_personas,
    ...input.decisionMaker.search_keywords,
    ...getRoleKeywordGroups(input.decisionMaker).flat(),
  ]).filter(Boolean);
  const roleQuery = targetRoles.slice(0, 8).map(quote).join(" OR ");
  const responsibility = quote(input.decisionMaker.business_problem_owner);
  const department = quote(input.decisionMaker.department);

  return [
    `${company} (${roleQuery})`,
    `${company} ${department} ${responsibility}`,
    `${company} (${roleQuery}) публикация OR интервью OR конференция`,
    domain ? `site:${domain} (${roleQuery})` : "",
    domain
      ? `site:${domain} (${roleQuery}) email OR @ OR контакты`
      : "",
  ].filter(Boolean);
}

function getRoutingQueryParts(input: PeopleProviderInput): string[] {
  const company = quote(input.company.company_name);
  const domain = getCompanyDomain(input.company);

  return [
    `${company} ("руководитель" OR "директор" OR "менеджер" OR "специалист") email`,
    `${company} сотрудник контакты email`,
    domain
      ? `site:${domain} ("руководство" OR "команда" OR "сотрудники")`
      : "",
    domain
      ? `"@${domain}" ${company} -info@ -sales@ -office@ -support@`
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
  const missingEmail = !candidate.workEmail;
  const missingRole = !candidate.roleTitle;
  return [
    !candidate.tenchatUrl ? `${name} ${company} TenChat` : "",
    !candidate.telegramUrl ? `${name} ${company} Telegram` : "",
    missingEmail ? `${name} ${company} email OR @ OR почта` : "",
    missingEmail && domain ? `${name} "@${domain}"` : "",
    missingEmail && domain ? `site:${domain} ${name}` : "",
    missingRole ? `${name} ${company} должность OR руководитель` : "",
  ].filter(Boolean);
}

function getCompanySearchNames(input: PeopleProviderInput): string[] {
  const raw = normalizeWhitespace(input.company.company_name);
  const withoutPrefix = raw
    .replace(/^(?:группа\s+компаний|гк|сеть\s+(?:премиальных\s+)?(?:центров\s+)?(?:стоматологии\s+)?|дц|мц|пкф)\s+/i, "")
    .replace(/\s+-\s+/g, " ")
    .trim();
  const latinBrand = raw.match(/\b[A-Z][A-Za-z\d-]{2,}\b/g)?.at(-1) ?? "";
  return unique([raw, withoutPrefix, latinBrand])
    .map((value) => normalizeWhitespace(value))
    .filter((value) => value.length >= 3)
    .slice(0, 2);
}

type AdaptivePersonQuery = {
  level: "LEVEL_1" | "LEVEL_2" | "LEVEL_3";
  query: string;
  queryAngle: "person_research" | "market_news";
};

function getAdaptivePersonQueries(input: PeopleProviderInput): AdaptivePersonQuery[] {
  const names = getCompanySearchNames(input);
  const company = quote(names[0] ?? input.company.company_name);
  const primary = unique(
    input.roleSearchPlan?.primary ?? input.searchKeywords.slice(0, 3),
  ).filter(Boolean);
  const alternatives = (input.roleSearchPlan?.alternatives ??
    input.decisionMaker.alternative_personas.map((role) => [role]))
    .slice(0, 2)
    .map((roles) => unique(roles).filter(Boolean));
  const domain = getCompanyDomain(input.company);
  const queries: AdaptivePersonQuery[] = [];
  const push = (
    level: AdaptivePersonQuery["level"],
    query: string,
    queryAngle: AdaptivePersonQuery["queryAngle"] = "person_research",
  ) => {
    const normalized = normalizeWhitespace(query);
    if (!normalized || queries.some((item) => item.query === normalized)) return;
    queries.push({ level, query: normalized, queryAngle });
  };

  if (primary[0]) push("LEVEL_1", `${company} ${quote(primary[0])}`);
  const siteRole = primary[1] ?? primary[0];
  if (domain && siteRole) {
    push("LEVEL_1", `site:${domain} ${quote(siteRole)}`);
  }
  for (const role of primary.slice(1, 3)) {
    push("LEVEL_2", `${company} ${quote(role)}`);
  }
  for (const roles of alternatives) {
    if (roles[0]) push("LEVEL_2", `${company} ${quote(roles[0])}`);
  }
  if (domain) {
    push("LEVEL_2", `"${domain}" "генеральный директор"`, "person_research");
  }
  push("LEVEL_3", `${company} ИНН "генеральный директор"`, "person_research");
  const evidenceRoles = unique([
    primary[0],
    alternatives[0]?.[0],
    alternatives[1]?.[0],
  ].filter((value): value is string => Boolean(value)));
  if (evidenceRoles[0]) {
    push("LEVEL_3", `${company} ${quote(evidenceRoles[0])} интервью`, "person_research");
    push("LEVEL_3", `${company} ${quote(evidenceRoles[0])} назначен`, "market_news");
  }
  push("LEVEL_3", `${company} TenChat руководство`, "person_research");
  push("LEVEL_3", `${company} Telegram руководитель`, "person_research");
  for (const query of input.plannedQueries ?? []) {
    push("LEVEL_2", query, /новост|интервью|конференц|назначен/i.test(query)
      ? "market_news"
      : "person_research");
  }
  return queries.slice(0, 12);
}

function isExplicitlyStaleDraft(draft: CandidateDraft): boolean {
  return /(?:бывш(?:ий|ая)|экс[-\s]|покинул[аи]?\s+(?:компанию|должность)|ранее\s+занимал[аи]?)/i.test(
    `${draft.sourceTitle} ${draft.sourceSnippet}`,
  );
}

function isOrganizationLikePersonName(value: string): boolean {
  return /(?:^|\s)(?:групп?[а-я]*|медикал|клиник[а-я]*|центр[а-я]*|холдинг[а-я]*|компани[а-я]*|сервис[а-я]*|лаборатор[а-я]*|мастерск[а-я]*|партн[её]р[а-я]*|заведующ[а-я]*|телефон[а-я]*|контакт[а-я]*|офис[а-я]*|dental|clinic|medical|dream|group|company|center|centre|laboratory|studio|agency|workshop|partner|phone|contact|office)(?:\s|$)/i.test(value);
}

const COMMON_RU_GIVEN_NAMES = new Set([
  "александр", "алексей", "анатолий", "андрей", "антон", "артем", "артём",
  "борис", "вадим", "валерий", "василий", "виктор", "виталий", "владимир",
  "владислав", "вячеслав", "геннадий", "георгий", "глеб", "григорий", "даниил",
  "денис", "дмитрий", "евгений", "егор", "иван", "игорь", "илья", "кирилл",
  "константин", "лев", "леонид", "максим", "михаил", "никита", "николай",
  "олег", "павел", "петр", "пётр", "роман", "руслан", "сергей", "станислав",
  "степан", "тимур", "федор", "фёдор", "филипп", "юрий", "ярослав",
  "александра", "алина", "алла", "анастасия", "анна", "валентина", "валерия",
  "вера", "вероника", "виктория", "галина", "дарья", "диана", "екатерина",
  "елена", "елизавета", "евгения", "инна", "ирина", "карина", "ксения",
  "лариса", "лидия", "любовь", "людмила", "маргарита", "марина", "мария",
  "надежда", "наталья", "нина", "оксана", "ольга", "полина", "светлана",
  "софья", "тамара", "татьяна", "юлия", "яна",
]);

function hasPlausibleHumanNameEvidence(draft: CandidateDraft): boolean {
  const parts = draft.fullName.toLowerCase().split(/\s+/).filter(Boolean);
  const directProfileOrEmail = Boolean(
    draft.workEmail || draft.tenchatUrl || draft.telegramUrl || draft.vkUrl,
  );
  if (!parts.some((part) => /[а-яё]/i.test(part))) {
    return directProfileOrEmail || parts.length >= 3;
  }
  return directProfileOrEmail ||
    parts.some((part) => COMMON_RU_GIVEN_NAMES.has(part)) ||
    parts.some((part) => /(?:ович|евич|ич|овна|евна|ична)$/i.test(part));
}

function toBoundedCandidates(
  drafts: CandidateDraft[],
  input: PeopleProviderInput,
  providerLabel: string,
  providerId: string,
): PersonCandidate[] {
  const domain = getCompanyDomain(input.company);
  return dedupeDrafts(drafts)
    .filter((draft) => !isExplicitlyStaleDraft(draft))
    .filter(hasPlausibleHumanNameEvidence)
    .map((draft) => toPersonCandidate(draft, input, providerLabel, providerId))
    .filter((candidate) =>
      isPlausiblePublicPersonName(candidate.full_name) &&
      !isOrganizationLikePersonName(candidate.full_name) &&
      Boolean(candidate.role_title) &&
      hasTargetRoleMatch(candidate, input.decisionMaker) &&
      candidate.evidence.length > 0 &&
      Boolean(candidate.metadata.source_url),
    )
    .map((candidate) => {
      const sourceUrl = String(candidate.metadata.source_url ?? "");
      const sourceUrls = Array.isArray(candidate.metadata.source_urls)
        ? candidate.metadata.source_urls.filter((value): value is string => typeof value === "string")
        : [sourceUrl];
      const sourceHosts = unique(sourceUrls.flatMap((value) => {
        try {
          return [new URL(value).hostname.toLowerCase().replace(/^www\./, "")];
        } catch {
          return [];
        }
      }));
      const officialSource = Boolean(domain && sourceHosts.some(
        (hostname) => hostname === domain || hostname.endsWith(`.${domain}`),
      ));
      const corroboratedSources = sourceHosts.filter((hostname) =>
        !/(?:^|\.)(?:youtube\.com|youtu\.be|vk\.com|t\.me|hh\.ru)$/i.test(hostname),
      ).length >= 2;
      return {
        ...candidate,
        confidence_score: Math.max(
          candidate.confidence_score,
          officialSource || corroboratedSources ? 82 : 68,
        ),
        metadata: {
          ...candidate.metadata,
          normalized_role: input.decisionMaker.primary_persona,
          freshness: officialSource
            ? "current_official_source"
            : corroboratedSources
              ? "corroborated_public_sources"
              : "unknown",
          company_verified: true,
          role_verified: true,
          evidence_source_count: sourceHosts.length,
        },
      };
    })
    .sort((left, right) => right.confidence_score - left.confidence_score);
}

function getBoundedDraftRejectionReason(
  draft: CandidateDraft,
  input: PeopleProviderInput,
): string | null {
  if (isExplicitlyStaleDraft(draft)) return "STALE_ROLE";
  if (!isPlausiblePublicPersonName(draft.fullName)) return "INVALID_PERSON_NAME";
  if (isOrganizationLikePersonName(draft.fullName)) return "ORGANIZATION_AS_PERSON";
  if (!hasPlausibleHumanNameEvidence(draft)) return "NO_HUMAN_NAME_EVIDENCE";
  if (!draft.roleTitle) return "ROLE_NOT_FOUND";
  const candidate = toPersonCandidate(draft, input, "audit", "audit");
  if (!hasTargetRoleMatch(candidate, input.decisionMaker)) return "ROLE_MISMATCH";
  if (draft.evidence.length === 0 || !draft.sourceUrl) return "INSUFFICIENT_EVIDENCE";
  return null;
}

function aggregateBoundedRejections(
  drafts: CandidateDraft[],
  input: PeopleProviderInput,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const draft of dedupeDrafts(drafts)) {
    const reason = getBoundedDraftRejectionReason(draft, input);
    if (reason) counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

function getCandidateEvidenceFingerprint(candidates: PersonCandidate[]): string {
  return candidates
    .map((candidate) => [
      normalizeComparable(candidate.full_name),
      normalizeComparable(candidate.role_title ?? ""),
      candidate.work_email ?? "",
      String(candidate.metadata.tenchat_url ?? ""),
      String(candidate.metadata.telegram_url ?? ""),
      candidate.evidence.length,
    ].join(":"))
    .sort()
    .join("|");
}

function hasSufficientPersonBundle(candidates: PersonCandidate[]): boolean {
  if (candidates.length >= 3) return true;
  if (candidates.length < 2) return false;
  return candidates.some((candidate) => Boolean(
    candidate.work_email ||
    candidate.metadata.tenchat_url ||
    candidate.metadata.telegram_url,
  ));
}

function mergeDrafts(left: CandidateDraft, right: CandidateDraft): CandidateDraft {
  return {
    ...left,
    roleTitle: left.roleTitle ?? right.roleTitle,
    department: left.department ?? right.department,
    linkedinUrl: left.linkedinUrl ?? right.linkedinUrl,
    tenchatUrl: left.tenchatUrl ?? right.tenchatUrl,
    telegramUrl: left.telegramUrl ?? right.telegramUrl,
    vkUrl: left.vkUrl ?? right.vkUrl,
    workEmail: left.workEmail ?? right.workEmail,
    sourceUrls: unique([
      ...(left.sourceUrls ?? [left.sourceUrl]),
      ...(right.sourceUrls ?? [right.sourceUrl]),
    ]),
    contactRoute:
      left.contactRoute === "target_persona" || right.contactRoute === "target_persona"
        ? "target_persona"
        : "corporate_router",
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
  const linkedinUrl = input.plannedQueries ? null : getLinkedInUrl(result.url);
  const tenchatUrl = getTenChatUrl(result.url);
  const telegramUrl = getTelegramUrl(result.url);
  const vkUrl = getVkUrl(result.url);

  if (!roleTitle && !linkedinUrl && !tenchatUrl && !telegramUrl && !vkUrl && emails.length === 0) {
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
    sourceUrls: [result.url],
    linkedinUrl,
    tenchatUrl,
    telegramUrl,
    vkUrl,
    workEmail: emails.find((email) => emailLocalMatchesPerson(email, fullName)) ?? null,
    contactRoute: roleTitle ? "target_persona" : "corporate_router",
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
    sourceUrls: unique([...(candidate.sourceUrls ?? [candidate.sourceUrl]), result.url]),
    linkedinUrl: candidate.linkedinUrl ?? getLinkedInUrl(result.url),
    tenchatUrl: candidate.tenchatUrl ?? getTenChatUrl(result.url),
    telegramUrl: candidate.telegramUrl ?? getTelegramUrl(result.url),
    vkUrl: candidate.vkUrl ?? getVkUrl(result.url),
    workEmail: candidate.workEmail ?? getWorkEmails(text, input)
      .find((email) => emailLocalMatchesPerson(email, candidate.fullName)) ?? null,
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
      source_urls: draft.sourceUrls ?? [draft.sourceUrl],
      telegram_url: draft.telegramUrl,
      tenchat_url: draft.tenchatUrl,
      vk_url: draft.vkUrl,
      contact_route: draft.contactRoute,
      public_contact_verified:
        draft.contactRoute === "corporate_router" && Boolean(draft.workEmail),
    },
  };

  return {
    ...candidate,
    confidence_score: getRoleFitConfidence({
      candidate,
      decisionMaker: input.decisionMaker,
      hasDirectContact: Boolean(
        draft.workEmail || draft.tenchatUrl || draft.telegramUrl || draft.vkUrl,
      ),
      baseConfidence: draft.contactRoute === "corporate_router" ? 66 : 52,
    }),
  };
}

export class RuPublicPeopleProvider implements PeopleEnrichmentProvider {
  id = "ru-public-web";
  label = "RU public web";
  private readonly searchProvider?: SearchProvider;

  constructor(searchProvider?: SearchProvider) {
    this.searchProvider = searchProvider;
  }

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
    signal?: AbortSignal,
  ): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];
    const uniqueQueries = unique(queries);

    for (let index = 0; index < uniqueQueries.length; index += 3) {
      throwIfAborted(signal);
      const batch = uniqueQueries.slice(index, index + 3);
      const results = await Promise.allSettled(
        batch.map((query) =>
          searchProvider.search({
            query,
            maxResults,
            market: "ru",
            queryLanguage: "ru",
            signal,
          }),
        ),
      );

      allResults.push(
        ...results.flatMap((result) =>
          result.status === "fulfilled" ? result.value : [],
        ),
      );
      throwIfAborted(signal);
    }

    return allResults;
  }

  /** Read-only bounded resolver used by the shadow evaluation. */
  async findPeopleBounded(
    input: PeopleProviderInput,
  ): Promise<PeopleProviderResult> {
    const startedAt = Date.now();
    const searchProvider = this.getSearchProvider();
    if (!searchProvider) {
      return {
        ...buildProviderUnavailableResult({
          providerId: this.id,
          providerLabel: this.label,
        }),
        metrics: {
          search_attempts: 0,
          official_pages_fetched: 0,
          aborted_requests: 0,
          elapsed_ms: Date.now() - startedAt,
          stop_reason: "provider_unavailable",
        },
      };
    }
    if (!input.bypassCache) {
      const cached = getCachedBoundedPeople(input);
      if (cached) return cached;
    }

    let searchAttempts = 0;
    let officialPagesFetched = 0;
    let consecutiveNoGainQueries = 0;
    let drafts: CandidateDraft[] = [];
    const sourcesChecked: string[] = [];
    const queriesExecuted: NonNullable<NonNullable<PeopleProviderResult["metrics"]>["trace"]>["queries_executed"] = [];
    const domain = getCompanyDomain(input.company);
    const initialOfficialUrls = getBoundedOfficialSiteUrls(input);
    const homepageUrl = initialOfficialUrls[0];
    let officialUrls: string[] = [];

    if (domain && homepageUrl) {
      throwIfAborted(input.signal);
      const homepage = await fetchOfficialPage(homepageUrl, domain, input.signal);
      sourcesChecked.push(homepageUrl);
      officialPagesFetched += 1;
      if (homepage) {
        drafts.push(
          ...draftsFromOfficialPeopleText({ input, text: homepage.text, sourceUrl: homepageUrl }),
          ...draftsFromOfficialText({ input, text: homepage.text, sourceUrl: homepageUrl }),
        );
      }
      const discoveredLinks = homepage?.relevantLinks ?? [];
      officialUrls = unique([
        ...discoveredLinks,
        ...initialOfficialUrls.slice(1),
      ]).slice(0, 7);
    }

    let candidates = toBoundedCandidates(drafts, input, this.label, this.id);
    const fetchOfficialBatch = async (batch: string[]) => {
      if (!domain || batch.length === 0 || hasSufficientPersonBundle(candidates)) return;
      throwIfAborted(input.signal);
      const pages = await Promise.all(
        batch.map(async (url) => ({
          url,
          page: await fetchOfficialPage(url, domain, input.signal),
        })),
      );
      sourcesChecked.push(...batch);
      officialPagesFetched += pages.length;
      drafts.push(...pages.flatMap(({ url, page }) => page ? [
        ...draftsFromOfficialPeopleText({ input, text: page.text, sourceUrl: url }),
        ...draftsFromOfficialText({ input, text: page.text, sourceUrl: url }),
      ] : []));
      candidates = toBoundedCandidates(drafts, input, this.label, this.id);
    };
    const runQuery = async (
      query: string,
      level: "LEVEL_1" | "LEVEL_2" | "LEVEL_3" | "EMAIL",
      queryAngle: "person_research" | "market_news" = "person_research",
    ) => {
      throwIfAborted(input.signal);
      const before = getCandidateEvidenceFingerprint(candidates);
      searchAttempts += 1;
      try {
        const results = await searchProvider.search({
          query,
          maxResults: 5,
          page: 0,
          market: "ru",
          queryLanguage: "ru",
          queryAngle,
          signal: input.signal,
        });
        queriesExecuted.push({
          level,
          query,
          result_count: results.length,
          results: results.slice(0, 3).map((result) => ({
            title: result.title.slice(0, 180),
            url: result.url,
          })),
        });
        drafts.push(...results.flatMap((result) => draftFromSearchResult({ input, result })));
      } catch {
        throwIfAborted(input.signal);
        queriesExecuted.push({ level, query, result_count: 0, results: [] });
      }
      candidates = toBoundedCandidates(drafts, input, this.label, this.id);
      const after = getCandidateEvidenceFingerprint(candidates);
      consecutiveNoGainQueries = before === after
        ? consecutiveNoGainQueries + 1
        : 0;
    };

    const adaptiveQueries = getAdaptivePersonQueries(input);
    const levelOne = adaptiveQueries.filter((query) => query.level === "LEVEL_1");
    if (!hasSufficientPersonBundle(candidates) && levelOne[0]) {
      await runQuery(levelOne[0].query, levelOne[0].level, levelOne[0].queryAngle);
    }
    await fetchOfficialBatch(officialUrls.slice(0, 3));
    if (!hasSufficientPersonBundle(candidates) && levelOne[1]) {
      await runQuery(levelOne[1].query, levelOne[1].level, levelOne[1].queryAngle);
    }
    for (const level of ["LEVEL_2", "LEVEL_3"] as const) {
      if (hasSufficientPersonBundle(candidates)) break;
      await fetchOfficialBatch(
        level === "LEVEL_2" ? officialUrls.slice(3, 6) : officialUrls.slice(6, 7),
      );
      for (const item of adaptiveQueries.filter((query) => query.level === level)) {
        await runQuery(item.query, item.level, item.queryAngle);
        if (hasSufficientPersonBundle(candidates)) break;
        if (candidates.length > 0 && consecutiveNoGainQueries >= 3) break;
      }
    }

    for (const person of candidates.slice(0, 3)) {
      if (searchAttempts >= 12) break;
      if (person.work_email && person.metadata.tenchat_url && person.metadata.telegram_url) {
        continue;
      }
      const draft = drafts.find(
        (item) => normalizeComparable(item.fullName) === normalizeComparable(person.full_name),
      );
      if (draft) {
        for (const query of getCandidateContactQueries(input, draft).slice(0, 2)) {
          if (searchAttempts >= 12) break;
          throwIfAborted(input.signal);
          const before = getCandidateEvidenceFingerprint(candidates);
          searchAttempts += 1;
          try {
            const results = await searchProvider.search({
              query,
              maxResults: 4,
              page: 0,
              market: "ru",
              queryLanguage: "ru",
              queryAngle: "person_research",
              signal: input.signal,
            });
            queriesExecuted.push({
              level: "EMAIL",
              query,
              result_count: results.length,
              results: results.slice(0, 3).map((result) => ({
                title: result.title.slice(0, 180),
                url: result.url,
              })),
            });
            for (const result of results) {
              drafts = drafts.map((candidate) =>
                normalizeComparable(candidate.fullName) === normalizeComparable(draft.fullName)
                  ? mergeContactEvidence({ candidate, input, result })
                  : candidate,
              );
            }
          } catch {
            throwIfAborted(input.signal);
            queriesExecuted.push({ level: "EMAIL", query, result_count: 0, results: [] });
          }
          candidates = toBoundedCandidates(drafts, input, this.label, this.id);
          const after = getCandidateEvidenceFingerprint(candidates);
          consecutiveNoGainQueries = before === after
            ? consecutiveNoGainQueries + 1
            : 0;
          const updated = candidates.find(
            (candidate) => normalizeComparable(candidate.full_name) === normalizeComparable(person.full_name),
          );
          if (updated?.work_email && (updated.metadata.tenchat_url || updated.metadata.telegram_url)) {
            break;
          }
        }
      }
    }

    const result: PeopleProviderResult = {
      provider_id: this.id,
      provider_label: this.label,
      candidates: candidates.slice(0, 3),
      unavailable: false,
      diagnostics: [{
        level: "info",
        message: candidates.length
          ? "Bounded shadow search found an evidence-backed person."
          : "Bounded shadow search exhausted the person budget; fallback remains available.",
      }],
      metrics: {
        search_attempts: searchAttempts,
        official_pages_fetched: officialPagesFetched,
        aborted_requests: 0,
        elapsed_ms: Date.now() - startedAt,
        stop_reason: hasSufficientPersonBundle(candidates)
          ? "contact_bundle_sufficient"
          : candidates.length
            ? "diminishing_returns"
            : "lpr_not_found",
        trace: {
          queries_executed: queriesExecuted,
          sources_checked: unique(sourcesChecked),
          rejected_candidates: aggregateBoundedRejections(drafts, input),
          final_failure_reason: candidates.length
            ? null
            : drafts.length > 0
              ? "ENTITY_VERIFICATION_REJECT"
              : queriesExecuted.some((item) => item.result_count > 0)
                ? "INSUFFICIENT_EVIDENCE"
                : "NO_PERSON_RESULTS",
        },
      },
    };
    if (!input.bypassCache) cacheBoundedPeople(input, result);
    return result;
  }

  async findPeople(input: PeopleProviderInput): Promise<PeopleProviderResult> {
    if (input.roleSearchPlan) {
      return this.findPeopleBounded(input);
    }
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
      input.signal,
    );
    let initialDrafts = dedupeDrafts(
      initialResults.flatMap((result) => draftFromSearchResult({ input, result })),
    )
      .filter((draft) =>
        draft.contactRoute === "corporate_router" || hasTargetRoleMatch(
          toPersonCandidate(draft, input, this.label, this.id),
          input.decisionMaker,
        ),
      )
      .slice(0, 4);

    if (!initialDrafts.some((draft) => Boolean(draft.workEmail))) {
      const routingResults = await this.runSearches(
        searchProvider,
        getRoutingQueryParts(input),
        4,
        input.signal,
      );
      initialDrafts = dedupeDrafts([
        ...initialDrafts,
        ...routingResults.flatMap((result) =>
          draftFromSearchResult({ input, result }),
        ),
      ])
        .filter((draft) =>
          draft.contactRoute === "corporate_router" ||
          hasTargetRoleMatch(
            toPersonCandidate(draft, input, this.label, this.id),
            input.decisionMaker,
          ),
        )
        .slice(0, 6);
    }

    const enrichedDrafts = await Promise.all(
      initialDrafts.map(async (draft) => {
        if (draft.workEmail) {
          return draft;
        }

        const contactResults = await this.runSearches(
          searchProvider,
          getCandidateContactQueries(input, draft),
          3,
          input.signal,
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
          const text = await fetchOfficialText(url, input.signal);

          return text ? draftsFromOfficialText({ input, text, sourceUrl: url }) : [];
        }),
      )
    ).flat();

    const candidates = dedupeDrafts([...enrichedDrafts, ...officialSiteDrafts])
      .map((draft) => toPersonCandidate(draft, input, this.label, this.id))
      .filter((candidate) =>
        candidate.metadata.contact_route === "corporate_router" ||
        hasTargetRoleMatch(candidate, input.decisionMaker),
      )
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
            candidate.evidence.some((item) => /source url:\s*https?:\/\//i.test(item))),
      );

    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates,
      unavailable: false,
      diagnostics: [{
        level: "info",
        message: candidates.length
          ? `Adaptive public search stopped after ${candidates.length} evidence-backed candidate(s) were found.`
          : "Adaptive public search stopped because the remaining public steps were unlikely to improve contact quality.",
      }],
    };
  }
}
