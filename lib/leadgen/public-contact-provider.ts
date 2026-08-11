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
import { discoverCompanyEmails } from "@/lib/leadgen/email-discovery-engine";
import { getVerticalProfile } from "@/lib/leadgen/verticals";

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
  "dreamjob.ru",
  "2gis.ru",
  "zoon.ru",
  "orgpage.ru",
  "e-ecolog.ru",
  "b2b.house",
  "e-xecutive.ru",
  "wikipedia.org",
  "vk.com",
  "vk.ru",
  "ok.ru",
  "t.me",
  "youtube.com",
  "dzen.ru",
  "vc.ru",
  "linkedin.com",
  "crunchbase.com",
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

  const website = company.company_domain.startsWith("http")
    ? normalizeUrl(company.company_domain)
    : `https://${company.company_domain}`;
  if (!website) {
    return null;
  }
  const hostname = getHostname(website);
  return hostname && !isNonOfficialSiteHost(hostname) ? website : null;
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
    const hostname = new URL(website).hostname.replace(/^www\./, "").toLowerCase();
    return isNonOfficialSiteHost(hostname) ? null : hostname;
  } catch {
    return null;
  }
}

function getKnownUrls(input: ContactProviderInput): string[] {
  return getOfficialSiteUrls(input);
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

function getHhVacancyUrl(company: LeadgenCompany): string | null {
  const candidates = [
    company.source_url,
    company.metadata.signal_source_url,
    ...(Array.isArray(company.metadata.signal_source_urls)
      ? company.metadata.signal_source_urls
      : []),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    try {
      const url = new URL(candidate);
      if (
        (url.hostname === "hh.ru" || url.hostname.endsWith(".hh.ru")) &&
        /^\/vacancy\/\d+/.test(url.pathname)
      ) {
        return url.toString();
      }
    } catch {
      // Continue with the next source URL.
    }
  }

  return null;
}

export type HhPublicVacancyContact = {
  fullName: string;
  email: string;
  phones: string[];
  sourceUrl: string;
};

function isLikelyNamedPerson(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim();
  const parts = normalized.split(" ").filter(Boolean);
  return parts.length >= 2 && parts.length <= 4 &&
    !/(?:отдел|служба|команда|подбор|персонал|кадры|recruitment|human resources|hr team)/i.test(normalized) &&
    parts.every((part) => /^[\p{L}][\p{L}'-]{1,}$/u.test(part));
}

function isPersonalCorporateEmail(email: string, officialDomain: string): boolean {
  const normalized = email.trim().toLowerCase();
  const [local = "", domain = ""] = normalized.split("@");
  const domainMatches =
    domain === officialDomain || domain.endsWith(`.${officialDomain}`);
  return domainMatches &&
    !/^(?:info|sales|support|hello|office|admin|contact|mail|marketing|hr|jobs?|career|press|pr|reception|service)$/i.test(local);
}

export function parseHhPublicVacancyContact(
  payload: unknown,
  officialDomain: string,
  sourceUrl: string,
): HhPublicVacancyContact | null {
  if (!payload || typeof payload !== "object") return null;
  const contacts = (payload as { contacts?: unknown }).contacts;
  if (!contacts || typeof contacts !== "object") return null;
  const record = contacts as {
    name?: unknown;
    email?: unknown;
    phones?: unknown;
  };
  const fullName = typeof record.name === "string" ? record.name.trim() : "";
  const email = typeof record.email === "string"
    ? record.email.trim().toLowerCase()
    : "";
  if (
    !isLikelyNamedPerson(fullName) ||
    !isPersonalCorporateEmail(email, officialDomain)
  ) {
    return null;
  }

  const phones = Array.isArray(record.phones)
    ? record.phones.flatMap((phone) => {
        if (!phone || typeof phone !== "object") return [];
        const item = phone as Record<string, unknown>;
        const formatted = typeof item.formatted === "string"
          ? item.formatted.trim()
          : [item.country, item.city, item.number]
              .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
              .join("");
        return formatted ? [formatted] : [];
      })
    : [];

  return { fullName, email, phones, sourceUrl };
}

async function findHhPublicVacancyContact(
  company: LeadgenCompany,
  officialDomain: string | null,
): Promise<HhPublicVacancyContact | null> {
  const vacancyUrl = getHhVacancyUrl(company);
  const vacancyId = vacancyUrl?.match(/\/vacancy\/(\d+)/)?.[1] ?? null;
  if (!vacancyUrl || !vacancyId || !officialDomain) return null;

  const feedbackEmail =
    process.env.SMTP_USER?.trim() || process.env.IMAP_USER?.trim() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail)) return null;

  try {
    const response = await fetch(`https://api.hh.ru/vacancies/${vacancyId}`, {
      headers: {
        accept: "application/json",
        "HH-User-Agent": `LeadgenOS/1.0 (${feedbackEmail})`,
        "user-agent": `LeadgenOS/1.0 (${feedbackEmail})`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    return parseHhPublicVacancyContact(
      await response.json(),
      officialDomain,
      vacancyUrl,
    );
  } catch {
    return null;
  }
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

async function fetchHhPageHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html",
        "user-agent":
          "Mozilla/5.0 (compatible; LeadgenOS/1.0; official-site-resolution)",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return (await response.text()).slice(0, 1_600_000);
  } catch {
    return null;
  }
}

export function parseHhEmployerId(html: string): string | null {
  return (
    html.match(/\/employer\/(\d+)/i)?.[1] ??
    html.match(/employerId(?:=|%3D|\\u003d)(\d+)/i)?.[1] ??
    null
  );
}

export function parseHhEmployerWebsite(html: string): string | null {
  const rawWebsite =
    html.match(
      /data-qa=["']company-site["'][^>]*\bhref=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /\bhref=["']([^"']+)["'][^>]*data-qa=["']company-site["']/i,
    )?.[1] ??
    html.match(/siteUrl(?:&(?:#34|quot);|\\u0022)?\s*:\s*(?:&(?:#34|quot);|\\u0022)(https?:[^<&"\\]+)/i)?.[1] ??
    null;

  if (!rawWebsite) return null;

  const normalized = normalizeUrl(decodeHtmlAttribute(rawWebsite));
  if (!normalized) return null;

  const hostname = getHostname(normalized);
  return hostname && !isNonOfficialSiteHost(hostname) ? normalized : null;
}

async function resolveOfficialWebsiteFromHh(
  company: LeadgenCompany,
): Promise<OfficialWebsiteResolution | null> {
  const vacancyUrl = getHhVacancyUrl(company);
  if (!vacancyUrl) return null;

  const vacancyHtml = await fetchHhPageHtml(vacancyUrl);
  const employerId = vacancyHtml ? parseHhEmployerId(vacancyHtml) : null;
  if (!employerId) return null;

  const employerUrl = `https://hh.ru/employer/${employerId}`;
  const employerHtml = await fetchHhPageHtml(employerUrl);
  const website = employerHtml
    ? parseHhEmployerWebsite(employerHtml)
    : null;
  if (!website) return null;

  const hostname = getHostname(website);
  if (!hostname) return null;

  return {
    domain: hostname,
    website: `https://${hostname}`,
    sourceUrl: employerUrl,
    status: "confirmed",
    confidence: 90,
    reason: "official_site_declared_on_hh_employer_profile",
  };
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
    .replace(/\b(?:ооо|ао|пао|зао|ип|компания|компании|группа|группы|group|company)\b/gi, " ")
    .split(/[^a-zа-яё0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function hasCompanyDomainMatch(tokens: string[], hostname: string): boolean {
  const domainLabel = (hostname.split(".")[0] ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

  return tokens.some((token) => {
    const transliterated = transliterateRu(token)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    return (
      transliterated.length >= 4 &&
      (domainLabel.includes(transliterated) ||
        transliterated.includes(domainLabel))
    );
  });
}

export type OfficialWebsiteResolution = {
  domain: string | null;
  website: string | null;
  sourceUrl: string | null;
  status: "confirmed" | "not_found";
  confidence: number;
  reason: string;
};

export async function resolveOfficialCompanyWebsite(
  company: LeadgenCompany,
  searchProvider: SearchProvider | null,
): Promise<OfficialWebsiteResolution> {
  const existingDomain = getCompanyDomain(company);
  if (existingDomain) {
    return {
      domain: existingDomain,
      website: `https://${existingDomain}`,
      sourceUrl: getCompanyWebsite(company),
      status: "confirmed",
      confidence: 100,
      reason: "confirmed_existing_company_domain",
    };
  }

  const hhResolution = await resolveOfficialWebsiteFromHh(company);
  if (hhResolution) {
    return hhResolution;
  }

  if (!searchProvider) {
    return {
      domain: null,
      website: null,
      sourceUrl: null,
      status: "not_found",
      confidence: 0,
      reason: "official_site_search_provider_unavailable",
    };
  }

  const companyName = company.company_name.trim();
  const tokens = getCompanyIdentityTokens(companyName);
  if (!companyName || tokens.length === 0) {
    return {
      domain: null,
      website: null,
      sourceUrl: null,
      status: "not_found",
      confidence: 0,
      reason: "company_name_insufficient_for_resolution",
    };
  }

  const queries = [`"${companyName}" официальный сайт`];

  for (const query of queries) {
    let results: SearchResult[] = [];
    try {
      results = await searchProvider.search({
        query,
        maxResults: 12,
        market: "ru",
        queryLanguage: "ru",
      });
    } catch {
      continue;
    }

    let identityPagesChecked = 0;
    for (const result of results) {
      const hostname = getHostname(result.url);
      if (!hostname || isNonOfficialSiteHost(hostname)) {
        continue;
      }

      const haystack = getSearchText(result).toLowerCase();
      const matchingTokens = tokens.filter(
        (token) => haystack.includes(token),
      );
      const domainMatchesCompany = hasCompanyDomainMatch(tokens, hostname);
      let pageConfirmsCompany = false;
      if (!domainMatchesCompany && identityPagesChecked < 3) {
        try {
          const pathname = new URL(result.url).pathname.replace(/\/+$/, "") || "/";
          if (pathname === "/") {
            identityPagesChecked += 1;
            const pageText = (await fetchPublicPageText(result.url))?.toLowerCase() ?? "";
            const distinctiveToken = [...tokens].sort(
              (left, right) => right.length - left.length,
            )[0];
            const occurrences = distinctiveToken
              ? pageText.split(distinctiveToken).length - 1
              : 0;
            pageConfirmsCompany =
              Boolean(distinctiveToken && distinctiveToken.length >= 6) &&
              occurrences >= 2;
          }
        } catch {
          pageConfirmsCompany = false;
        }
      }

      if (
        (domainMatchesCompany || pageConfirmsCompany) &&
        (matchingTokens.length >= 1 ||
          haystack.includes(companyName.toLowerCase()))
      ) {
        return {
          domain: hostname,
          website: `https://${hostname}`,
          sourceUrl: result.url,
          status: "confirmed",
          confidence: domainMatchesCompany
            ? matchingTokens.length >= 2
              ? 95
              : 85
            : 80,
          reason: domainMatchesCompany
            ? "official_site_confirmed_by_company_identity"
            : "official_site_confirmed_by_repeated_company_identity_on_homepage",
        };
      }
    }
  }

  return {
    domain: null,
    website: null,
    sourceUrl: null,
    status: "not_found",
    confidence: 0,
    reason: "official_site_not_found",
  };
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

  return companyDomain
    ? [
        `site:${companyDomain} ${quotedCompany} email OR e-mail`,
        `site:${companyDomain} "@${companyDomain}"`,
        `site:${companyDomain} \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u044b`,
      ]
    : [];
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
  let fetchedOfficialPages = 0;

  for (const result of searchResults) {
    if (getHostname(result.url) !== companyDomain) {
      continue;
    }
    const searchText = getSearchText(result);

    if (!includesPersonName(searchText, person)) {
      continue;
    }

    let email = getConfirmedPersonEmail(
      searchText,
      companyDomain,
      person,
      result.url || null,
    );

    // Search snippets often contain the name but omit the nearby mailto.
    // Open at most two matching official pages and parse their public content.
    if (!email && fetchedOfficialPages < 2 && result.url) {
      fetchedOfficialPages += 1;
      const pageText = await fetchPublicPageText(result.url);
      if (pageText && includesPersonName(pageText, person)) {
        email = getConfirmedPersonEmail(
          pageText,
          companyDomain,
          person,
          result.url,
        );
      }
    }

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
    getHostname(result.url) === companyDomain
      ? extractPublicEmailsDetailed({
          text: getSearchText(result),
          sourceUrl: result.url || null,
          companyDomain,
        })
      : { emails: [], rejected: [] },
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
  const sourceUrl = person.metadata.source_url;
  return typeof sourceUrl === "string" && sourceUrl.trim()
    ? normalizeUrl(sourceUrl)
    : person.linkedin_url;
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
    const auditedWebsiteStatus =
      rawInput.company.metadata.official_website_status;
    const auditedWebsiteReason =
      rawInput.company.metadata.official_website_reason;
    const websiteResolution = auditedWebsiteStatus === "not_found"
      ? {
          domain: null,
          website: null,
          sourceUrl: null,
          status: "not_found" as const,
          confidence: 0,
          reason:
            typeof auditedWebsiteReason === "string"
              ? auditedWebsiteReason
              : "official_site_not_found",
        }
      : await resolveOfficialCompanyWebsite(rawInput.company, searchProvider);
    const input: ContactProviderInput = websiteResolution.domain
      ? {
          ...rawInput,
          company: {
            ...rawInput.company,
            company_domain: websiteResolution.domain,
            metadata: {
              ...rawInput.company.metadata,
              official_website: websiteResolution.website,
              resolved_official_domain: websiteResolution.domain,
            },
          },
        }
      : rawInput;
    const emailDiscovery = websiteResolution.domain && websiteResolution.website
      ? await discoverCompanyEmails({
          rawInput: {
            companyId: input.company.id,
            companyName: input.company.company_name,
            officialWebsiteUrl: websiteResolution.website,
            officialDomain: websiteResolution.domain,
            commercialSignalSourceUrl: input.signals[0]?.source_url ?? null,
            targetPersona: input.decisionMaker?.primary_persona ?? null,
            targetDepartment: input.decisionMaker?.department ?? null,
            emailPriority: getVerticalProfile(
              typeof input.company.metadata.vertical_id === "string"
                ? input.company.metadata.vertical_id
                : null,
            ).emailPriority,
          },
          searchProvider,
        })
      : null;
    const officialSiteContext = emailDiscovery
      ? {
          text: "",
          urls: [
            ...emailDiscovery.urlsInspected,
            ...emailDiscovery.forms,
          ],
          pages: [] as Array<{ url: string; text: string }>,
          warnings: emailDiscovery.diagnostics,
        }
      : await getOfficialSiteContext(input);
    const knownUrls = [
      ...new Set([...getKnownUrls(input), ...officialSiteContext.urls]),
    ];
    const companyDomain = getCompanyDomain(input.company);
    const knownContextEmails = { emails: [] as ParsedPublicEmail[], rejected: [] as RejectedPublicEmail[] };
    const officialSiteEmails = emailDiscovery
      ? [{
          emails: emailDiscovery.candidates
            .filter((candidate) => !candidate.rejectionReason)
            .map((candidate): ParsedPublicEmail => ({
              email: candidate.email,
              source_url: candidate.sourceUrl,
              context: "",
              classification:
                candidate.kind === "personal_work"
                  ? "personal_verified"
                  : ["sales", "commercial", "marketing", "partnership", "press", "support", "hr"].includes(candidate.kind)
                    ? "department_verified"
                    : "company_generic_verified",
              confidence_score: Math.min(99, Math.max(55, candidate.score)),
              extraction_method: candidate.extractionMethod,
            })),
          rejected: emailDiscovery.rejected,
        }]
      : officialSiteContext.pages.map((page) =>
          extractPublicEmailsDetailed({
            text: page.text,
            sourceUrl: page.url,
            companyDomain,
          }),
        );
    const strategiesAttempted = [
      "official_company_context_email_parse",
      "official_website_resolution",
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
    const allPeople = input.peopleDiscovery?.all_candidates ?? [];
    const people = [
      ...new Map(
        [
          ...(primaryPerson ? [primaryPerson] : []),
          ...alternativePeople,
          ...allPeople.filter((person) => Boolean(person.work_email)),
        ].map((person) => [person.full_name.toLowerCase(), person]),
      ).values(),
    ].slice(0, 4);
    const directPersonEmails: ParsedPublicEmail[] = [];
    const hhPublicContact = await findHhPublicVacancyContact(
      input.company,
      companyDomain,
    );
    if (hhPublicContact) {
      strategiesAttempted.push("hh_public_vacancy_contact");
      const routingMetadata = {
        extraction: "hh_public_vacancy_api",
        people_discovery_role: "routing",
        contact_route: "corporate_router",
        public_contact_verified: true,
        email_classification: "routing_person_verified",
        email_status: "work_email_ready",
        email_extraction_method: "hh_public_vacancy_api",
        phone: hhPublicContact.phones[0] ?? null,
        phones: hhPublicContact.phones,
        note:
          "Контакт публично указан работодателем в вакансии HH; владение целевой бизнес-задачей не предполагается.",
      };
      const routingContact = createContact({
        input,
        type: "work_email",
        index: contacts.length,
        email: hhPublicContact.email,
        fullName: hhPublicContact.fullName,
        roleTitle: "Контакт вакансии",
        sourceUrl: hhPublicContact.sourceUrl,
        sourceLabel: "HH public vacancy contact",
        confidenceScore: 76,
        metadata: routingMetadata,
      });
      const emailOutreach = buildEmailOutreach({
        companyName: input.company.company_name,
        companyWebsite: getCompanyWebsite(input.company),
        companyDescription: getCompanyDescription(input.company),
        industry: input.company.industry,
        personName: hhPublicContact.fullName,
        personRole: "Контакт вакансии",
        contact: { ...routingContact, id: "email-outreach-preview" },
        readiness: "outreach_ready",
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
        businessProblemHypothesis: input.decisionMaker?.expected_pain ?? null,
        targetResponsibility: input.decisionMaker?.business_problem_owner ?? null,
        whyThisPerson:
          "Публичный корпоративный контакт выбран как маршрутизатор, а не как предполагаемый владелец задачи.",
      });
      contacts.push({
        ...routingContact,
        metadata: {
          ...routingContact.metadata,
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
      });
      directPersonEmails.push({
        email: hhPublicContact.email,
        source_url: hhPublicContact.sourceUrl,
        context: `Public vacancy contact: ${hhPublicContact.fullName}`,
        classification: "work_verified",
        confidence_score: 76,
        extraction_method: "hh_public_vacancy_api",
      });
    }
    const preliminaryEmails = dedupeParsedEmails([
      ...knownContextEmails.emails,
      ...officialSiteEmails.flatMap((result) => result.emails),
    ]);
    const companySearchEmails = emailDiscovery
      ? {
          emails: [],
          rejected: [],
          queriesExecuted: emailDiscovery.queriesExecuted,
        }
      : preliminaryEmails.length > 0
        ? { emails: [], rejected: [], queriesExecuted: [] }
        : await findPublicCompanyEmails({ input, searchProvider });
    if (companySearchEmails.queriesExecuted.length > 0) {
      strategiesAttempted.push("company_email_yandex_queries");
    }
    queriesExecuted.push(...companySearchEmails.queriesExecuted);
    emailsRejected.push(...companySearchEmails.rejected);
    const emails = dedupeParsedEmails([
      ...preliminaryEmails,
      ...companySearchEmails.emails,
    ]);

    for (const [personIndex, person] of people.entries()) {
      const shouldSearchPersonEmail = !person.work_email && personIndex < 2;
      if (shouldSearchPersonEmail) {
        strategiesAttempted.push("person_email_yandex_queries");
        queriesExecuted.push(...getExpandedPersonEmailQueries(input, person));
      }
      const publicEmail = shouldSearchPersonEmail
        ? await findPublicPersonEmail({ input, person, searchProvider })
        : null;
      if (publicEmail) {
        queriesExecuted.push(...publicEmail.queriesExecuted);
      }
      const shouldSearchSocial = personIndex === 0 && !person.work_email && !publicEmail;
      if (shouldSearchSocial) strategiesAttempted.push("person_social_yandex_queries");
      const publicSocialProfiles = shouldSearchSocial
        ? await findPublicPersonSocialProfiles({ input, person, searchProvider })
        : [];
      const isRoutingPerson = person.metadata.contact_route === "corporate_router";
      const personMetadata = {
        extraction: "people_discovery_candidate",
        people_discovery_role:
          isRoutingPerson
            ? "routing"
            : person.full_name === primaryPerson?.full_name ? "primary" : "alternative",
        ...(isRoutingPerson ? { contact_route: "corporate_router" } : {}),
        full_name: person.full_name,
        role_title: person.role_title,
        department: person.department,
        evidence: person.evidence,
        people_metadata: person.metadata,
      };
      const sourceUrl =
        publicEmail?.sourceUrl ?? getPersonSourceUrl(person);
      const personSourceHost = getHostname(getPersonSourceUrl(person) ?? "");
      const personEmailDomain = person.work_email?.split("@")[1]?.toLowerCase();
      const confirmedPeopleEmail =
        person.work_email &&
        personEmailDomain === companyDomain &&
        (personSourceHost === companyDomain ||
          person.metadata.public_contact_verified === true)
          ? person.work_email
          : null;
      const workEmail = confirmedPeopleEmail ?? publicEmail?.email ?? null;
      const emailSourceLabel =
        publicEmail?.sourceLabel ?? person.source;

      if (workEmail) {
        const emailOutreach = buildEmailOutreach({
          companyName: input.company.company_name,
          companyWebsite:
            getCompanyWebsite(input.company),
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
          businessProblemHypothesis: input.decisionMaker?.expected_pain ?? null,
          targetResponsibility: input.decisionMaker?.business_problem_owner ?? null,
          whyThisPerson: input.decisionMaker?.reasoning ?? null,
          publicPersonContext: person.evidence.slice(0, 2).join(" "),
          emailEvidence: publicEmail?.context ?? null,
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
                publicEmail?.classification ??
                (isRoutingPerson ? "routing_person_verified" : "personal_verified"),
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
      const rankedEmail = emailDiscovery?.candidates.find(
        (candidate) => candidate.email === email.email,
      ) ?? null;
      const emailOutreach = buildEmailOutreach({
        companyName: input.company.company_name,
        companyWebsite:
          getCompanyWebsite(input.company),
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
        businessProblemHypothesis: input.decisionMaker?.expected_pain ?? null,
        targetResponsibility: input.decisionMaker?.business_problem_owner ?? null,
        whyThisPerson: input.decisionMaker?.reasoning ?? null,
      });
      contacts.push(
        createContact({
          input,
          type: emailType,
          index: contacts.length,
          email: email.email,
          sourceUrl:
            email.source_url ??
            getCompanyWebsite(input.company),
          sourceLabel: "public email parser",
          confidenceScore: email.confidence_score,
          metadata: {
            extraction: "public_email_parser",
            email_context: email.context,
            email_classification: email.classification,
            email_status: getEmailStatus(email),
            email_confidence: email.confidence_score,
            email_extraction_method: email.extraction_method,
            email_kind: rankedEmail?.kind ?? null,
            email_mx_verified:
              rankedEmail?.validationStatus === "domain_and_mx_confirmed",
            email_domain_match_reason: rankedEmail?.domainMatchReason ?? null,
            email_validation_status: rankedEmail?.validationStatus ?? null,
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
          sourceUrl: companyWebsite,
          sourceLabel: "official company website",
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
          sourceUrl: null,
          sourceLabel: "official website resolution",
          confidenceScore: 0,
          metadata: {
            reason: websiteResolution.domain
              ? "Email not found on official company website"
              : "Official company website could not be resolved",
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
      official_website: websiteResolution.website,
      resolved_official_domain: websiteResolution.domain,
      official_website_status: websiteResolution.status,
      official_website_source_url: websiteResolution.sourceUrl,
      official_website_confidence: websiteResolution.confidence,
      official_website_reason: websiteResolution.reason,
      email_pages_audit: emailDiscovery?.pages ?? [],
      ranked_email_candidates:
        emailDiscovery?.candidates.map((candidate) => ({ ...candidate })) ?? [],
      contact_forms_found: emailDiscovery?.forms ?? [],
      email_final_reason:
        emailDiscovery?.finalReason ??
        (websiteResolution.domain ? "no_email_in_html" : "official_site_missing"),
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
      email_search_status: websiteResolution.domain
        ? getFinalEmailStatus({ bestEmail, searchProviderAvailable })
        : "official_site_not_found",
      email_stop_reason: websiteResolution.domain
        ? getFinalEmailStopReason({ bestEmail, searchProviderAvailable })
        : "official_site_not_found",
    };
  }
}
