import type {
  LeadgenCompany,
  LeadgenContact,
  LeadgenContactType,
  PersonCandidate,
} from "@/lib/leadgen/types";
import { createLeadgenSearchProvider } from "@/lib/leadgen/search/leadgen-search-provider";
import type {
  SearchProvider,
  SearchResult,
} from "@/lib/leadgen/search/search-provider";
import type {
  ContactProvider,
  ContactProviderInput,
  ContactProviderResult,
} from "@/lib/leadgen/contact-provider";
import {
  extractPublicEmails,
  extractPublicEmailsDetailed,
  type ParsedPublicEmail,
  type RejectedPublicEmail,
} from "@/lib/leadgen/public-email-parser";
import { buildEmailOutreach } from "@/lib/leadgen/email-outreach-builder";

const publicUrlPattern = /https?:\/\/[^\s"'<>\\)]+/gi;
const officialSitePaths = [
  "",
  "contacts",
  "contact",
  "kontakty",
  "about",
  "o-kompanii",
  "requisites",
  "rekvizity",
];
const contactPathPattern =
  /(contact|kontakty|about|o-kompanii|company|team|management|leadership|rukovodstvo|sales|marketing|partners|press|news|requisites|rekvizity)/i;

const registryEvidenceHostPatterns = [
  "checko.ru",
  "rusprofile.ru",
  "egrul.nalog.ru",
  "zachestnyibiznes.ru",
  "list-org.com",
  "sbis.ru",
  "spark-interfax.ru",
  "fedresurs.ru",
  "audit-it.ru",
  "xfirm.ru",
  "companies.rbc.ru",
];
const nonOfficialSiteHostPatterns = [
  ...registryEvidenceHostPatterns,
  "hh.ru",
  "avito.ru",
  "rabota.ru",
  "superjob.ru",
  "careerjet.ru",
  "jobfilter.ru",
  "facancy.ru",
  "vk.com",
  "vk.ru",
  "ok.ru",
  "t.me",
  "youtube.com",
  "dzen.ru",
  "vc.ru",
  "forbes.ru",
  "kommersant.ru",
  "tass.ru",
  "vedomosti.ru",
];

function createRecordId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = "";
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function isRegistryEvidenceUrl(url: string | null | undefined): boolean {
  const normalizedUrl = normalizeUrl(url ?? null);

  if (!normalizedUrl) {
    return false;
  }

  try {
    const hostname = new URL(normalizedUrl).hostname
      .replace(/^www\./, "")
      .toLowerCase();

    return registryEvidenceHostPatterns.some(
      (pattern) => hostname === pattern || hostname.endsWith(`.${pattern}`),
    );
  } catch {
    return false;
  }
}

function getCompanyWebsite(company: LeadgenCompany): string | null {
  if (!company.company_domain) {
    return null;
  }

  if (company.company_domain.startsWith("http")) {
    return normalizeUrl(company.company_domain);
  }

  return `https://${company.company_domain}`;
}

function getCompanyDescription(company: LeadgenCompany): string | null {
  for (const key of [
    "company_description",
    "description",
    "business_description",
  ]) {
    const value = company.metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getCompanyDomain(company: LeadgenCompany): string | null {
  const website = getCompanyWebsite(company);

  if (!website) {
    return null;
  }

  try {
    return new URL(website).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function getKnownText(input: ContactProviderInput): string {
  const contactFacingSourceUrls = [
    input.company.source_url,
    ...input.signals.map((signal) => signal.source_url),
  ].filter((url) => !isRegistryEvidenceUrl(url));

  return [
    input.company.company_name,
    input.company.company_domain ?? "",
    input.company.source_url && !isRegistryEvidenceUrl(input.company.source_url)
      ? input.company.source_url
      : "",
    input.company.source_label ?? "",
    input.lead.signal_title,
    input.lead.signal_detail,
    input.lead.hook,
    input.lead.message,
    ...input.signals.flatMap((signal) => [
      signal.signal_title,
      signal.signal_detail,
      contactFacingSourceUrls.includes(signal.source_url) ? signal.source_url : "",
    ]),
  ].join(" ");
}

function getKnownUrls(input: ContactProviderInput): string[] {
  const urls = [
    input.company.source_url,
    input.lead.company_source_url,
    ...input.signals.map((signal) => signal.source_url),
  ]
    .map(normalizeUrl)
    .filter((url) => !isRegistryEvidenceUrl(url))
    .filter((url): url is string => Boolean(url));

  return [...new Set(urls)];
}

function getOfficialSiteUrls(input: ContactProviderInput): string[] {
  const website = getCompanyWebsite(input.company);

  if (!website) {
    return [];
  }

  try {
    const baseUrl = new URL(website);

    return officialSitePaths
      .map((path) => {
        const url = new URL(baseUrl.toString());
        url.pathname = path ? `/${path}` : "/";
        url.search = "";
        url.hash = "";
        return normalizeUrl(url.toString());
      })
      .filter((url): url is string => Boolean(url));
  } catch {
    return [];
  }
}

async function fetchPublicPageText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
        "user-agent": "LeadgenOS/1.0 contact-enrichment",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      return null;
    }

    const text = await response.text();

    return text.slice(0, 140_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractRelevantInternalLinks(html: string, pageUrl: string): string[] {
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((href): href is string => Boolean(href));
  const normalizedLinks = links
    .map((href) => {
      try {
        return normalizeUrl(new URL(href, pageUrl).toString());
      } catch {
        return null;
      }
    })
    .filter((url): url is string => Boolean(url));

  let baseHost = "";

  try {
    baseHost = new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return [];
  }

  return normalizedLinks.filter((url) => {
    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();

      return host === baseHost && contactPathPattern.test(parsedUrl.pathname);
    } catch {
      return false;
    }
  });
}

async function getOfficialSiteContext(
  input: ContactProviderInput,
): Promise<{
  text: string;
  urls: string[];
  pages: Array<{ url: string; text: string }>;
  warnings: string[];
}> {
  const urls = getOfficialSiteUrls(input);
  const results = await Promise.allSettled(urls.map(fetchPublicPageText));
  const warnings = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [`official_site_page_failed:${urls[index]}`]
      : [],
  );
  const text = results
    .flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    )
    .join(" ");
  const pages = results.flatMap((result, index) =>
    result.status === "fulfilled" && result.value
      ? [{ url: urls[index], text: result.value }]
      : [],
  );
  const internalUrls = [
    ...new Set(
      pages.flatMap((page) => extractRelevantInternalLinks(page.text, page.url)),
    ),
  ].filter((url) => !urls.includes(url));
  const internalResults = await Promise.allSettled(
    internalUrls.slice(0, 8).map(fetchPublicPageText),
  );
  const internalPages = internalResults.flatMap((result, index) =>
    result.status === "fulfilled" && result.value
      ? [{ url: internalUrls[index], text: result.value }]
      : [],
  );
  const allPages = [...pages, ...internalPages];
  const extractedUrls = [...text.matchAll(publicUrlPattern)]
    .map((match) => normalizeUrl(match[0]))
    .filter((url): url is string => Boolean(url));

  return {
    text: [...allPages.map((page) => page.text)].join(" "),
    urls: [...new Set([...allPages.map((page) => page.url), ...extractedUrls])],
    pages: allPages,
    warnings,
  };
}

function getSearchText(result: SearchResult): string {
  return [result.title, result.snippet, result.url, result.raw_content ?? ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isNonOfficialSiteHost(hostname: string): boolean {
  return nonOfficialSiteHostPatterns.some(
    (pattern) => hostname === pattern || hostname.endsWith(`.${pattern}`),
  );
}

function getCompanyIdentityTokens(companyName: string): string[] {
  return companyName
    .toLowerCase()
    .replace(/\b(?:ооо|ао|пао|зао|ип|компания|группа|group|company)\b/gi, " ")
    .split(/[^a-zа-яё0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

async function resolveOfficialCompanyDomain(
  input: ContactProviderInput,
  searchProvider: SearchProvider | null,
): Promise<string | null> {
  const existingDomain = getCompanyDomain(input.company);
  if (existingDomain || !searchProvider) {
    return existingDomain;
  }

  const companyName = input.company.company_name.trim();
  const tokens = getCompanyIdentityTokens(companyName);
  if (!companyName || tokens.length === 0) {
    return null;
  }

  const queries = [
    `"${companyName}" официальный сайт`,
    `"${companyName}" контакты`,
  ];

  for (const query of queries) {
    let results: SearchResult[] = [];
    try {
      results = await searchProvider.search({
        query,
        maxResults: 8,
        market: "ru",
        queryLanguage: "ru",
      });
    } catch {
      continue;
    }

    for (const result of results) {
      const hostname = getHostname(result.url);
      if (!hostname || isNonOfficialSiteHost(hostname)) {
        continue;
      }

      const haystack = getSearchText(result).toLowerCase();
      const domainLabel = hostname.split(".")[0] ?? "";
      const matchingTokens = tokens.filter(
        (token) => haystack.includes(token) || domainLabel.includes(token),
      );

      if (
        matchingTokens.length >= Math.min(tokens.length, 2) ||
        (tokens.length === 1 && matchingTokens.length === 1)
      ) {
        return hostname;
      }
    }
  }

  return null;
}

function getConfirmedPersonEmail(
  text: string,
  companyDomain: string,
  person: PersonCandidate,
  sourceUrl: string | null,
): ParsedPublicEmail | null {
  if (isRegistryEvidenceUrl(sourceUrl)) {
    return null;
  }

  return (
    extractPublicEmails({
      text,
      sourceUrl,
      companyDomain,
      person,
    }).find(
      (item) =>
        item.classification === "personal_verified" ||
        item.classification === "work_verified" ||
        isEmailLocalPartTiedToPerson(item.email, person),
    ) ?? null
  );
}

function isEmailLocalPartTiedToPerson(
  email: string,
  person: PersonCandidate,
): boolean {
  const localPart = email.split("@")[0]?.toLowerCase() ?? "";
  const latinNameParts = getLatinPersonNameParts(person.full_name)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length >= 3);

  if (latinNameParts.length < 2) {
    return false;
  }

  const [firstName, lastName] = latinNameParts;

  return (
    localPart.includes(firstName) ||
    localPart.includes(lastName) ||
    localPart.includes(`${firstName[0]}${lastName}`) ||
    localPart.includes(`${lastName}${firstName[0]}`)
  );
}

function getLatinPersonNameParts(fullName: string): string[] {
  return fullName
    .split(/\s+/)
    .flatMap((part) => {
      const latinPart = part.toLowerCase().replace(/[^a-z]/g, "");
      const transliteratedPart = transliterateRu(part).replace(/[^a-z]/g, "");

      return [latinPart, transliteratedPart].filter(Boolean);
    });
}

function transliterateRu(value: string): string {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "i",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };

  return value
    .toLowerCase()
    .split("")
    .map((char) => map[char] ?? char)
    .join("");
}

function includesPersonName(text: string, person: PersonCandidate): boolean {
  const normalizedText = text.toLowerCase();
  const nameParts = person.full_name
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part.length >= 3);

  return (
    nameParts.length >= 2 &&
    nameParts.every((part) => normalizedText.includes(part))
  );
}

function getPersonEmailQueries(
  input: ContactProviderInput,
  person: PersonCandidate,
): string[] {
  const companyDomain = getCompanyDomain(input.company);
  const quotedName = `"${person.full_name}"`;
  const quotedCompany = `"${input.company.company_name}"`;

  return [
    companyDomain ? `${quotedName} "@${companyDomain}"` : "",
    companyDomain ? `${quotedName} ${companyDomain} email OR e-mail` : "",
    `${quotedName} ${quotedCompany} email OR e-mail OR почта`,
  ].filter(Boolean);
}

function getExpandedPersonEmailQueries(
  input: ContactProviderInput,
  person: PersonCandidate,
): string[] {
  const companyDomain = getCompanyDomain(input.company);
  const quotedName = `"${person.full_name}"`;
  const quotedCompany = `"${input.company.company_name}"`;
  const role = person.role_title ? `"${person.role_title}"` : "";

  return [
    ...getPersonEmailQueries(input, person),
    companyDomain ? `site:${companyDomain} ${quotedName}` : "",
    `${quotedName} ${quotedCompany} \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u044b`,
    role ? `${quotedName} ${role} ${quotedCompany}` : "",
  ].filter(Boolean);
}

function getCompanyEmailQueries(input: ContactProviderInput): string[] {
  const companyDomain = getCompanyDomain(input.company);
  const quotedCompany = `"${input.company.company_name}"`;

  return [
    `${quotedCompany} email OR e-mail`,
    `${quotedCompany} \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u044b`,
    `${quotedCompany} \u043e\u0442\u0434\u0435\u043b \u043f\u0440\u043e\u0434\u0430\u0436 email`,
    `${quotedCompany} \u043a\u043e\u043c\u043c\u0435\u0440\u0447\u0435\u0441\u043a\u0438\u0439 \u043e\u0442\u0434\u0435\u043b email`,
    companyDomain ? `site:${companyDomain} "@${companyDomain}"` : "",
    companyDomain ? `site:${companyDomain} email` : "",
    companyDomain ? `site:${companyDomain} \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u044b` : "",
  ].filter(Boolean);
}

async function findPublicPersonEmail({
  input,
  person,
  searchProvider,
}: {
  input: ContactProviderInput;
  person: PersonCandidate;
  searchProvider: SearchProvider | null;
}): Promise<{
  email: string;
  sourceUrl: string | null;
  sourceLabel: string;
  context: string;
  classification: string;
  confidenceScore: number;
  queriesExecuted: string[];
} | null> {
  const companyDomain = getCompanyDomain(input.company);

  if (!companyDomain || !searchProvider) {
    return null;
  }

  const queries = getExpandedPersonEmailQueries(input, person);
  const results = await Promise.allSettled(
    queries.map((query) =>
      searchProvider.search({
        query,
        maxResults: 5,
        market: "ru",
        queryLanguage: "ru",
      }),
    ),
  );
  const searchResults = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  for (const result of searchResults) {
    const searchText = getSearchText(result);

    if (!includesPersonName(searchText, person)) {
      continue;
    }

    const email = getConfirmedPersonEmail(
      searchText,
      companyDomain,
      person,
      result.url || null,
    );

    if (email) {
      return {
        email: email.email,
        sourceUrl: email.source_url,
        sourceLabel: result.source_label || "public search",
        context: email.context,
        classification: email.classification,
        confidenceScore: email.confidence_score,
        queriesExecuted: queries,
      };
    }
  }

  return null;
}

async function findPublicCompanyEmails({
  input,
  searchProvider,
}: {
  input: ContactProviderInput;
  searchProvider: SearchProvider | null;
}): Promise<{
  emails: ParsedPublicEmail[];
  rejected: RejectedPublicEmail[];
  queriesExecuted: string[];
}> {
  const companyDomain = getCompanyDomain(input.company);
  const queries = getCompanyEmailQueries(input);

  if (!companyDomain || !searchProvider || queries.length === 0) {
    return { emails: [], rejected: [], queriesExecuted: queries };
  }

  const searchResults: SearchResult[] = [];
  for (const query of queries) {
    try {
      searchResults.push(
        ...(await searchProvider.search({
        query,
        maxResults: 5,
        market: "ru",
        queryLanguage: "ru",
        })),
      );
    } catch {
      // A single fallback query must not fail contact discovery.
    }
  }
  const parsed = searchResults.map((result) =>
    extractPublicEmailsDetailed({
      text: getSearchText(result),
      sourceUrl: result.url || null,
      companyDomain,
    }),
  );

  return {
    emails: dedupeParsedEmails(parsed.flatMap((result) => result.emails)),
    rejected: parsed.flatMap((result) => result.rejected),
    queriesExecuted: queries,
  };
}

function getPersonChannelQueries(
  input: ContactProviderInput,
  person: PersonCandidate,
): string[] {
  const quotedName = `"${person.full_name}"`;
  const quotedCompany = `"${input.company.company_name}"`;
  const role = person.role_title ? `"${person.role_title}"` : "";

  return [
    `${quotedName} ${quotedCompany} email OR e-mail`,
    `${quotedName} ${quotedCompany} Telegram OR t.me`,
    `${quotedName} ${quotedCompany} VK OR vk.com`,
    `${quotedName} ${quotedCompany} LinkedIn OR linkedin.com/in`,
    role ? `${quotedName} ${role} ${quotedCompany}` : "",
  ].filter(Boolean);
}

function dedupeParsedEmails(emails: ParsedPublicEmail[]): ParsedPublicEmail[] {
  return [...new Map(emails.map((email) => [email.email, email])).values()].sort(
    (left, right) => right.confidence_score - left.confidence_score,
  );
}

function getEmailContactType(email: ParsedPublicEmail): LeadgenContactType {
  return email.classification === "personal_verified" ||
    email.classification === "work_verified"
    ? "work_email"
    : "generic_email";
}

function isVerifiedSendableEmail(email: ParsedPublicEmail): boolean {
  return email.classification !== "candidate_unverified" &&
    email.classification !== "invalid";
}

function getEmailStatus(bestEmail: ParsedPublicEmail | null): string {
  if (!bestEmail) {
    return "email_not_found";
  }

  if (bestEmail.classification === "personal_verified") {
    return "personal_email_ready";
  }

  if (bestEmail.classification === "work_verified") {
    return "work_email_ready";
  }

  if (bestEmail.classification === "department_verified") {
    return "department_email_ready";
  }

  if (bestEmail.classification === "company_generic_verified") {
    return "company_email_ready";
  }

  return "email_candidate_found";
}

function getEmailStopReason(bestEmail: ParsedPublicEmail | null): string {
  if (!bestEmail) {
    return "email_search_exhausted";
  }

  return bestEmail.classification === "personal_verified" ||
    bestEmail.classification === "work_verified"
    ? "direct_email_found"
    : "fallback_email_found";
}

function getFinalEmailStatus({
  bestEmail,
  searchProviderAvailable,
}: {
  bestEmail: ParsedPublicEmail | null;
  searchProviderAvailable: boolean;
}): string {
  if (bestEmail) {
    return getEmailStatus(bestEmail);
  }

  return searchProviderAvailable ? "email_not_found" : "email_search_incomplete";
}

function getFinalEmailStopReason({
  bestEmail,
  searchProviderAvailable,
}: {
  bestEmail: ParsedPublicEmail | null;
  searchProviderAvailable: boolean;
}): string {
  if (bestEmail) {
    return getEmailStopReason(bestEmail);
  }

  return searchProviderAvailable
    ? "email_search_exhausted"
    : "search_provider_unavailable";
}

function formatRejectedEmail(email: RejectedPublicEmail): string {
  return [email.value, email.reason, email.source_url].filter(Boolean).join(" | ");
}

function getSocialKindFromUrl(url: string): string | null {
  const normalizedUrl = url.toLowerCase();

  if (
    normalizedUrl.includes("linkedin.com/in/") ||
    normalizedUrl.includes("linkedin.com/pub/")
  ) {
    return "linkedin";
  }

  if (normalizedUrl.includes("t.me/") || normalizedUrl.includes("telegram.me/")) {
    return "telegram";
  }

  if (normalizedUrl.includes("vk.com/")) {
    return "vk";
  }

  if (
    normalizedUrl.includes("instagram.com/") ||
    normalizedUrl.includes("twitter.com/") ||
    normalizedUrl.includes("x.com/")
  ) {
    return "social_profile";
  }

  return null;
}

function getUrlPathSegments(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

function isLikelyPersonalSocialUrl({
  url,
  kind,
  input,
}: {
  url: string;
  kind: string;
  input: ContactProviderInput;
}): boolean {
  const segments = getUrlPathSegments(url);
  const companyDomain = getCompanyDomain(input.company)?.split(".")[0] ?? "";
  const companyNameToken = input.company.company_name
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "");

  if (kind === "linkedin") {
    return url.toLowerCase().includes("linkedin.com/in/");
  }

  if (kind === "telegram") {
    const username = segments[0]?.toLowerCase() ?? "";

    return (
      segments.length === 1 &&
      username.length > 0 &&
      !username.startsWith("gk") &&
      !username.startsWith("ooo") &&
      !username.includes("company") &&
      !(companyDomain && username.includes(companyDomain)) &&
      !(companyNameToken && username.includes(companyNameToken))
    );
  }

  if (kind === "vk") {
    const username = segments[0]?.toLowerCase() ?? "";

    return (
      segments.length === 1 &&
      !username.startsWith("club") &&
      !username.startsWith("public") &&
      !username.startsWith("event")
    );
  }

  return segments.length <= 1;
}

function resultHasCompanyContext(
  resultText: string,
  input: ContactProviderInput,
): boolean {
  const normalizedText = resultText.toLowerCase();
  const domain = getCompanyDomain(input.company);

  return Boolean(
    normalizedText.includes(input.company.company_name.toLowerCase()) ||
      (domain && normalizedText.includes(domain)),
  );
}

async function findPublicPersonSocialProfiles({
  input,
  person,
  searchProvider,
}: {
  input: ContactProviderInput;
  person: PersonCandidate;
  searchProvider: SearchProvider | null;
}): Promise<Array<{ kind: string; url: string; sourceLabel: string }>> {
  if (!searchProvider) {
    return [];
  }

  const results = await Promise.allSettled(
    getPersonChannelQueries(input, person).map((query) =>
      searchProvider.search({
        query,
        maxResults: 5,
        market: "ru",
        queryLanguage: "ru",
      }),
    ),
  );
  const searchResults = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const profiles: Array<{ kind: string; url: string; sourceLabel: string }> = [];

  for (const result of searchResults) {
    const searchText = getSearchText(result);

    if (
      !includesPersonName(searchText, person) ||
      !resultHasCompanyContext(searchText, input)
    ) {
      continue;
    }

    const normalizedUrl = normalizeUrl(result.url);
    const kind = normalizedUrl ? getSocialKindFromUrl(normalizedUrl) : null;

    if (
      !normalizedUrl ||
      !kind ||
      !isLikelyPersonalSocialUrl({ url: normalizedUrl, kind, input })
    ) {
      continue;
    }

    profiles.push({
      kind,
      url: normalizedUrl,
      sourceLabel: result.source_label || "public person search",
    });
  }

  return [
    ...new Map(profiles.map((profile) => [profile.url, profile])).values(),
  ];
}

function isContactLikeUrl(url: string): boolean {
  const normalizedUrl = url.toLowerCase();

  return (
    normalizedUrl.includes("/contact") ||
    normalizedUrl.includes("/contacts") ||
    normalizedUrl.includes("/demo") ||
    normalizedUrl.includes("/book") ||
    normalizedUrl.includes("/sales")
  );
}

function isSocialUrl(url: string): boolean {
  const normalizedUrl = url.toLowerCase();

  return (
    normalizedUrl.includes("linkedin.com/company") ||
    normalizedUrl.includes("linkedin.com/in/") ||
    normalizedUrl.includes("t.me/") ||
    normalizedUrl.includes("telegram.me/") ||
    normalizedUrl.includes("twitter.com/") ||
    normalizedUrl.includes("x.com/")
  );
}

function isCompanyLinkedInUrl(url: string): boolean {
  return url.toLowerCase().includes("linkedin.com/company");
}

function isTelegramUrl(url: string): boolean {
  const normalizedUrl = url.toLowerCase();

  return normalizedUrl.includes("t.me/") || normalizedUrl.includes("telegram.me/");
}

function getPersonSourceUrl(person: PersonCandidate): string | null {
  return person.linkedin_url;
}

function getPersonMetadataUrl(
  person: PersonCandidate,
  key: string,
): string | null {
  const value = person.metadata[key];

  return typeof value === "string" ? normalizeUrl(value) : null;
}

function getPersonSocialProfiles(
  person: PersonCandidate,
): Array<{ kind: string; url: string }> {
  const metadataUrlKeys = [
    ["personal_website_url", "personal_website"],
    ["website_url", "personal_website"],
    ["telegram_url", "telegram"],
    ["x_url", "x"],
    ["twitter_url", "x"],
    ["github_url", "github"],
    ["instagram_url", "instagram"],
    ["facebook_url", "facebook"],
    ["vk_url", "vk"],
    ["youtube_url", "youtube"],
    ["medium_url", "medium"],
    ["substack_url", "substack"],
  ] as const;

  return metadataUrlKeys.reduce<Array<{ kind: string; url: string }>>(
    (profiles, [key, kind]) => {
      const url = getPersonMetadataUrl(person, key);

      if (url) {
        profiles.push({ kind, url });
      }

      return profiles;
    },
    [],
  );
}

function getProfileSourceLabel(
  profile:
    | { kind: string; url: string }
    | { kind: string; url: string; sourceLabel: string },
  fallback: string,
): string {
  return "sourceLabel" in profile ? profile.sourceLabel : fallback;
}

function createContact({
  input,
  type,
  index,
  email = null,
  contactUrl = null,
  linkedinUrl = null,
  telegramUrl = null,
  fullName = null,
  roleTitle = null,
  department = null,
  sourceUrl = null,
  sourceLabel = null,
  confidenceScore,
  metadata = {},
}: {
  input: ContactProviderInput;
  type: LeadgenContactType;
  index: number;
  email?: string | null;
  contactUrl?: string | null;
  linkedinUrl?: string | null;
  telegramUrl?: string | null;
  fullName?: string | null;
  roleTitle?: string | null;
  department?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  confidenceScore: number;
  metadata?: Record<string, unknown>;
}): LeadgenContact {
  const targetPersonaMetadata = input.decisionMaker
    ? {
        target_persona: input.decisionMaker.primary_persona,
        target_department: input.decisionMaker.department,
        target_persona_confidence: input.decisionMaker.confidence_score,
        target_persona_search_keywords: input.decisionMaker.search_keywords,
      }
    : {};

  return {
    id: createRecordId("contact", input.lead.id, type, String(index + 1)),
    pipeline_run_id: input.campaign.pipeline_run_id,
    campaign_id: input.campaign.id,
    company_id: input.company.id,
    lead_id: input.lead.id,
    contact_type: type,
    full_name: fullName,
    role_title: roleTitle,
    department,
    email,
    linkedin_url: linkedinUrl,
    telegram_url: telegramUrl,
    contact_url: contactUrl,
    source_url: sourceUrl,
    source_label: sourceLabel,
    confidence_score: confidenceScore,
    is_primary: false,
    metadata: {
      ...metadata,
      ...targetPersonaMetadata,
    },
    created_at: input.createdAt,
  };
}

export class PublicContactProvider implements ContactProvider {
  id = "public-contact-provider";
  label = "Public contact provider";

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

  async findContacts(
    rawInput: ContactProviderInput,
  ): Promise<ContactProviderResult> {
    const contacts: LeadgenContact[] = [];
    const searchProvider = this.getSearchProvider();
    const resolvedDomain = await resolveOfficialCompanyDomain(
      rawInput,
      searchProvider,
    );
    const input: ContactProviderInput = resolvedDomain
      ? {
          ...rawInput,
          company: {
            ...rawInput.company,
            company_domain: resolvedDomain,
            metadata: {
              ...rawInput.company.metadata,
              resolved_official_domain: resolvedDomain,
            },
          },
        }
      : rawInput;
    const officialSiteContext = await getOfficialSiteContext(input);
    const knownUrls = [
      ...new Set([...getKnownUrls(input), ...officialSiteContext.urls]),
    ];
    const companyDomain = getCompanyDomain(input.company);
    const knownContextEmails = extractPublicEmailsDetailed({
        text: getKnownText(input),
        sourceUrl: isRegistryEvidenceUrl(input.company.source_url)
          ? null
          : input.company.source_url,
        companyDomain,
    });
    const officialSiteEmails = officialSiteContext.pages.map((page) =>
      extractPublicEmailsDetailed({
          text: page.text,
          sourceUrl: page.url,
          companyDomain,
      }),
    );
    const strategiesAttempted = [
      "known_context_email_parse",
      "official_site_homepage",
      "official_site_bounded_pages",
    ];
    const queriesExecuted: string[] = [];
    const channelsRejected = [
      "registry_urls_excluded_from_contact_channels",
      "unverified_company_social_posts_excluded_from_direct_channels",
    ];
    const emailsRejected: RejectedPublicEmail[] = [
      ...knownContextEmails.rejected,
      ...officialSiteEmails.flatMap((result) => result.rejected),
    ];
    const primaryPerson = input.peopleDiscovery?.primary_person ?? null;
    const alternativePeople = input.peopleDiscovery?.alternative_people ?? [];
    const people = [
      ...(primaryPerson ? [primaryPerson] : []),
      ...alternativePeople.filter(
        (person) => person.full_name !== primaryPerson?.full_name,
      ),
    ];
    const directPersonEmails: ParsedPublicEmail[] = [];
    const preliminaryEmails = dedupeParsedEmails([
      ...knownContextEmails.emails,
      ...officialSiteEmails.flatMap((result) => result.emails),
    ]);
    const companySearchEmails =
      preliminaryEmails.length > 0
        ? { emails: [], rejected: [], queriesExecuted: [] }
        : await findPublicCompanyEmails({
            input,
            searchProvider,
          });
    if (companySearchEmails.queriesExecuted.length > 0) {
      strategiesAttempted.push("company_email_yandex_queries");
    }
    queriesExecuted.push(...companySearchEmails.queriesExecuted);
    emailsRejected.push(...companySearchEmails.rejected);
    const emails = dedupeParsedEmails([
      ...preliminaryEmails,
      ...companySearchEmails.emails,
    ]);

    for (const person of people) {
      strategiesAttempted.push("person_email_yandex_queries");
      queriesExecuted.push(...getExpandedPersonEmailQueries(input, person));
      const publicEmail = await findPublicPersonEmail({
          input,
          person,
          searchProvider,
        });
      if (publicEmail) {
        queriesExecuted.push(...publicEmail.queriesExecuted);
      }
      strategiesAttempted.push("person_social_yandex_queries");
      const publicSocialProfiles = await findPublicPersonSocialProfiles({
        input,
        person,
        searchProvider,
      });
      const personMetadata = {
        extraction: "people_discovery_candidate",
        people_discovery_role:
          person.full_name === primaryPerson?.full_name ? "primary" : "alternative",
        full_name: person.full_name,
        role_title: person.role_title,
        department: person.department,
        evidence: person.evidence,
        people_metadata: person.metadata,
      };
      const sourceUrl =
        publicEmail?.sourceUrl ?? getPersonSourceUrl(person);
      const workEmail = person.work_email ?? publicEmail?.email ?? null;
      const emailSourceLabel =
        publicEmail?.sourceLabel ?? person.source;

      if (workEmail) {
        const emailOutreach = buildEmailOutreach({
          companyName: input.company.company_name,
          companyWebsite:
            getCompanyWebsite(input.company) ?? input.company.source_url,
          companyDescription: getCompanyDescription(input.company),
          industry: input.company.industry,
          personName: person.full_name,
          personRole: person.role_title,
          contact: {
            ...createContact({
              input,
              type: "work_email",
              index: -1,
              email: workEmail,
              fullName: person.full_name,
              roleTitle: person.role_title,
              department: person.department,
              sourceUrl,
              sourceLabel: emailSourceLabel,
              confidenceScore: publicEmail?.confidenceScore ?? person.confidence_score,
            }),
            id: "email-outreach-preview",
          },
          readiness: "outreach_ready",
          whyNow:
            input.signals[0]?.signal_detail ||
            input.lead.signal_detail ||
            input.lead.signal_title,
          selectionReason: input.lead.hook,
          signalType: input.signals[0]?.signal_type,
          signalTitle: input.signals[0]?.signal_title ?? input.lead.signal_title,
          signalDetail:
            input.signals[0]?.signal_detail ?? input.lead.signal_detail,
          signalSourceUrl: input.signals[0]?.source_url ?? null,
          signalConfidence: input.signals[0]?.confidence_score ?? null,
        });
        directPersonEmails.push({
          email: workEmail,
          source_url: sourceUrl,
          context: publicEmail?.context ?? "",
          classification:
            (publicEmail?.classification as ParsedPublicEmail["classification"] | undefined) ??
            "work_verified",
          confidence_score:
            publicEmail?.confidenceScore ?? person.confidence_score,
          extraction_method: publicEmail
            ? "public_person_search"
            : "people_discovery_candidate",
        });
        contacts.push(
          createContact({
            input,
            type: "work_email",
            index: contacts.length,
            email: workEmail,
            fullName: person.full_name,
            roleTitle: person.role_title,
            department: person.department,
            sourceUrl,
            sourceLabel: emailSourceLabel,
            confidenceScore:
              publicEmail?.confidenceScore ?? person.confidence_score,
            metadata: {
              ...personMetadata,
              email_context: publicEmail?.context ?? null,
              email_classification:
                publicEmail?.classification ?? "personal_verified",
              email_status: publicEmail
                ? getEmailStatus({
                    email: publicEmail.email,
                    source_url: publicEmail.sourceUrl,
                    context: publicEmail.context,
                    classification:
                      publicEmail.classification as ParsedPublicEmail["classification"],
                    confidence_score: publicEmail.confidenceScore,
                    extraction_method: "public_person_search",
                  })
                : "work_email_ready",
              email_extraction_method: "public_person_search",
              email_subject: emailOutreach.subject,
              email_body: emailOutreach.body,
              email_micro_value: emailOutreach.microValue,
              email_quality: emailOutreach.quality,
              email_quality_gate_passed: emailOutreach.qualityGatePassed,
              email_generation_attempts: emailOutreach.generationAttempts,
              email_copy_review_status: emailOutreach.copyReviewStatus,
              message_mode: emailOutreach.messageMode,
              outreach_ready: emailOutreach.outreachReady,
            },
          }),
        );
      }

      if (person.linkedin_url) {
        contacts.push(
          createContact({
            input,
            type: "linkedin",
            index: contacts.length,
            contactUrl: person.linkedin_url,
            linkedinUrl: person.linkedin_url,
            fullName: person.full_name,
            roleTitle: person.role_title,
            department: person.department,
            sourceUrl: person.linkedin_url,
            sourceLabel: person.source,
            confidenceScore: person.confidence_score,
            metadata: personMetadata,
          }),
        );
      }

      if (person.phone) {
        contacts.push(
          createContact({
            input,
            type: "phone",
            index: contacts.length,
            contactUrl: `tel:${person.phone}`,
            fullName: person.full_name,
            roleTitle: person.role_title,
            department: person.department,
            sourceUrl,
            sourceLabel: person.source,
            confidenceScore: Math.max(person.confidence_score - 5, 0),
            metadata: {
              ...personMetadata,
              phone: person.phone,
            },
          }),
        );
      }

      for (const profile of [
        ...getPersonSocialProfiles(person),
        ...publicSocialProfiles,
      ]) {
        if (
          !isLikelyPersonalSocialUrl({
            url: profile.url,
            kind: profile.kind,
            input,
          })
        ) {
          continue;
        }

        const contactType: LeadgenContactType =
          profile.kind === "telegram"
            ? "telegram"
            : profile.kind === "linkedin"
              ? "linkedin"
              : "social_profile";

        contacts.push(
          createContact({
            input,
            type: contactType,
            index: contacts.length,
            contactUrl: profile.url,
            telegramUrl: profile.kind === "telegram" ? profile.url : null,
            linkedinUrl: profile.kind === "linkedin" ? profile.url : null,
            fullName: person.full_name,
            roleTitle: person.role_title,
            department: person.department,
            sourceUrl: profile.url,
            sourceLabel: getProfileSourceLabel(profile, person.source),
            confidenceScore: Math.max(person.confidence_score - 12, 0),
            metadata: {
              ...personMetadata,
              social_profile_kind: profile.kind,
              note:
                "Personal social profile found from metadata or bounded public person search; no profile was generated.",
            },
          }),
        );
      }
    }

    for (const email of emails.filter(isVerifiedSendableEmail)) {
      const emailType = getEmailContactType(email);
      const emailOutreach = buildEmailOutreach({
        companyName: input.company.company_name,
        companyWebsite:
          getCompanyWebsite(input.company) ?? input.company.source_url,
        companyDescription: getCompanyDescription(input.company),
        industry: input.company.industry,
        personName: input.decisionMaker?.primary_persona ?? null,
        personRole: input.decisionMaker?.primary_persona ?? null,
        contact: {
          ...createContact({
            input,
            type: emailType,
            index: -1,
            email: email.email,
            sourceUrl: email.source_url,
            sourceLabel: "public email parser",
            confidenceScore: email.confidence_score,
          }),
          id: "email-outreach-preview",
        },
        readiness: emailType === "work_email" ? "outreach_ready" : "fallback_ready",
        whyNow:
          input.signals[0]?.signal_detail ||
          input.lead.signal_detail ||
          input.lead.signal_title,
        selectionReason: input.lead.hook,
        signalType: input.signals[0]?.signal_type,
        signalTitle: input.signals[0]?.signal_title ?? input.lead.signal_title,
        signalDetail: input.signals[0]?.signal_detail ?? input.lead.signal_detail,
        signalSourceUrl: input.signals[0]?.source_url ?? null,
        signalConfidence: input.signals[0]?.confidence_score ?? null,
      });
      contacts.push(
        createContact({
          input,
          type: emailType,
          index: contacts.length,
          email: email.email,
          sourceUrl:
            email.source_url ??
            (isRegistryEvidenceUrl(input.company.source_url)
              ? null
              : input.company.source_url),
          sourceLabel: "public email parser",
          confidenceScore: email.confidence_score,
          metadata: {
            extraction: "public_email_parser",
            email_context: email.context,
            email_classification: email.classification,
            email_status: getEmailStatus(email),
            email_confidence: email.confidence_score,
            email_extraction_method: email.extraction_method,
            email_subject: emailOutreach.subject,
            email_body: emailOutreach.body,
            email_micro_value: emailOutreach.microValue,
            email_quality: emailOutreach.quality,
            email_quality_gate_passed: emailOutreach.qualityGatePassed,
            email_generation_attempts: emailOutreach.generationAttempts,
            email_copy_review_status: emailOutreach.copyReviewStatus,
            message_mode: emailOutreach.messageMode,
            outreach_ready: emailOutreach.outreachReady,
          },
        }),
      );
    }

    for (const url of knownUrls.filter(isContactLikeUrl)) {
      contacts.push(
        createContact({
          input,
          type: "website_form",
          index: contacts.length,
          contactUrl: url,
          sourceUrl: url,
          sourceLabel: "available contact-like URL",
          confidenceScore: 70,
          metadata: { extraction: "contact_like_url_from_available_context" },
        }),
      );
    }

    for (const url of knownUrls.filter(isSocialUrl)) {
      contacts.push(
        createContact({
          input,
          type: "company_social",
          index: contacts.length,
          contactUrl: url,
          linkedinUrl: isCompanyLinkedInUrl(url) ? url : null,
          telegramUrl: null,
          sourceUrl: url,
          sourceLabel: "available social URL",
          confidenceScore: 45,
          metadata: {
            extraction: "company_social_url_from_available_context",
            social_url_kind: isTelegramUrl(url)
              ? "telegram"
              : isCompanyLinkedInUrl(url)
                ? "company_linkedin"
                : "company_social",
            note:
              "Untied public social URLs are treated as company fallback channels, not direct personal contacts.",
          },
        }),
      );
    }

    const companyWebsite = getCompanyWebsite(input.company);

    if (companyWebsite) {
      contacts.push(
        createContact({
          input,
          type: "company_website",
          index: contacts.length,
          contactUrl: companyWebsite,
          sourceUrl: isRegistryEvidenceUrl(input.company.source_url)
            ? companyWebsite
            : input.company.source_url ?? companyWebsite,
          sourceLabel: "company domain",
          confidenceScore: 35,
          metadata: {
            extraction: "company_domain_fallback",
            fallback_kind: "company_website",
            note:
              "Company website is a fallback entry point only; no personal contact is inferred from the domain.",
          },
        }),
      );
    }

    if (contacts.length === 0) {
      contacts.push(
        createContact({
          input,
          type: "no_contact_found",
          index: 0,
          sourceUrl: isRegistryEvidenceUrl(input.company.source_url)
            ? null
            : input.company.source_url,
          sourceLabel: "available company context",
          confidenceScore: 0,
          metadata: {
            reason: "No public entry point found from available company context",
          },
        }),
      );
    }

    const allEmailFindings = dedupeParsedEmails([...directPersonEmails, ...emails]);
    const verifiedEmails = allEmailFindings.filter(isVerifiedSendableEmail);
    const bestEmail = verifiedEmails[0] ?? null;
    const searchProviderAvailable = Boolean(searchProvider);

    return {
      contacts,
      provider_id: this.id,
      provider_label: this.label,
      warnings: officialSiteContext.warnings,
      strategies_attempted: [...new Set(strategiesAttempted)],
      queries_executed: [...new Set(queriesExecuted)].slice(0, 40),
      urls_inspected: knownUrls.slice(0, 30),
      channels_found: contacts
        .filter((contact) => contact.contact_type !== "no_contact_found")
        .map((contact) => contact.contact_type),
      channels_rejected: [
        ...channelsRejected,
        ...emailsRejected.map(formatRejectedEmail),
        ...emails
          .filter((email) => email.classification === "candidate_unverified")
          .map((email) => `${email.email} | candidate_unverified | ${email.source_url ?? ""}`),
      ].slice(0, 80),
      provider_errors: officialSiteContext.warnings,
      emails_extracted: allEmailFindings.map(
        (email) =>
          `${email.email} | ${email.classification} | ${email.confidence_score} | ${email.source_url ?? ""}`,
      ),
      emails_rejected: [
        ...emailsRejected.map(formatRejectedEmail),
        ...emails
          .filter((email) => email.classification === "candidate_unverified")
          .map((email) => `${email.email} | candidate_unverified | ${email.source_url ?? ""}`),
      ].slice(0, 80),
      email_search_completed: searchProviderAvailable,
      email_search_status: getFinalEmailStatus({
        bestEmail,
        searchProviderAvailable,
      }),
      email_stop_reason: getFinalEmailStopReason({
        bestEmail,
        searchProviderAvailable,
      }),
    };
  }
}
