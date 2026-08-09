import { resolveMx } from "node:dns/promises";
import type { SearchProvider, SearchResult } from "@/lib/leadgen/search/search-provider";
import {
  extractPublicEmailsDetailed,
  type ParsedPublicEmail,
  type RejectedPublicEmail,
} from "@/lib/leadgen/public-email-parser";

export type EmailDiscoveryInput = {
  companyId: string;
  companyName: string;
  officialWebsiteUrl: string;
  officialDomain: string;
  commercialSignalSourceUrl: string | null;
  targetPersona: string | null;
  targetDepartment: string | null;
  emailPriority?: Array<"personal" | "sales" | "commercial" | "marketing" | "general">;
};

export type EmailCandidateKind =
  | "personal_work"
  | "sales"
  | "commercial"
  | "marketing"
  | "partnership"
  | "press"
  | "hr"
  | "support"
  | "general"
  | "unknown";

export type RankedEmailCandidate = {
  email: string;
  kind: EmailCandidateKind;
  score: number;
  sourceUrl: string;
  sourceType: string;
  domainMatch: boolean;
  domainMatchReason: string | null;
  validationStatus: string;
  rejectionReason: string | null;
  extractionMethod: string;
  evidenceCount: number;
};

export type EmailDiscoveryPageAudit = {
  requestedUrl: string;
  finalUrl: string | null;
  status: number | null;
  contentType: string | null;
  opened: boolean;
  bytes: number;
  depth: number;
  error: string | null;
};

export type EmailDiscoveryResult = {
  input: EmailDiscoveryInput;
  bestEmail: RankedEmailCandidate | null;
  candidates: RankedEmailCandidate[];
  rejected: RejectedPublicEmail[];
  pages: EmailDiscoveryPageAudit[];
  urlsInspected: string[];
  forms: string[];
  aliases: string[];
  queriesExecuted: string[];
  diagnostics: string[];
  finalReason:
    | "email_found"
    | "official_site_unreachable"
    | "robots_blocked"
    | "homepage_empty"
    | "javascript_required"
    | "no_contact_pages_found"
    | "contact_pages_unreachable"
    | "no_email_in_html"
    | "search_fallback_empty"
    | "candidates_rejected"
    | "timeout"
    | "parser_error";
};

type CrawledPage = EmailDiscoveryPageAudit & {
  html: string;
};

const MAX_PAGES = 12;
const MAX_DISCOVERED_LINKS = 12;
const FETCH_TIMEOUT_MS = 5_000;
const PRIORITY_PATHS = [
  "",
  "contact",
  "contacts",
  "kontakty",
  "kontakti",
  "contact-us",
  "about",
  "about-us",
  "company",
  "o-kompanii",
  "team",
  "management",
  "leadership",
  "staff",
  "departments",
  "sales",
  "partners",
  "press",
  "media",
  "requisites",
  "rekvizity",
  "support",
  "privacy",
  "personal-data",
];
const PRIORITY_LINK_PATTERN =
  /(contact|kontak|связат|about|о-компан|команд|team|management|руковод|leadership|staff|employee|department|sales|продаж|partner|press|media|news|career|job|vacanc|support|поддерж|requisite|rekviz|privacy|personal)/i;
const BLOCKED_HOSTS = [
  "hh.ru",
  "avito.ru",
  "dreamjob.ru",
  "rusprofile.ru",
  "spark-interfax.ru",
  "b2b.house",
  "e-xecutive.ru",
  "wikipedia.org",
  "linkedin.com",
  "crunchbase.com",
];
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "mail.ru",
  "inbox.ru",
  "bk.ru",
  "list.ru",
  "yandex.ru",
  "ya.ru",
  "outlook.com",
  "hotmail.com",
]);
const mxCache = new Map<string, Promise<boolean>>();

function normalizeHostname(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOSTS.some(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
  );
}

function normalizeOfficialInput(input: EmailDiscoveryInput): EmailDiscoveryInput {
  const website = new URL(input.officialWebsiteUrl);
  const websiteDomain = website.hostname.replace(/^www\./, "").toLowerCase();
  const officialDomain = input.officialDomain.replace(/^www\./, "").toLowerCase();

  if (
    websiteDomain !== officialDomain ||
    isBlockedHost(websiteDomain)
  ) {
    throw new Error("email_discovery_official_site_contract_violation");
  }

  website.protocol = "https:";
  website.pathname = "/";
  website.search = "";
  website.hash = "";
  return {
    ...input,
    officialWebsiteUrl: website.toString().replace(/\/$/, ""),
    officialDomain,
  };
}

function normalizeUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isInternalUrl(url: string, domain: string): boolean {
  const hostname = normalizeHostname(url);
  return Boolean(
    hostname && (hostname === domain || hostname.endsWith(`.${domain}`)),
  );
}

function buildPriorityUrls(input: EmailDiscoveryInput): string[] {
  return PRIORITY_PATHS.map((path) =>
    new URL(path ? `/${path}` : "/", input.officialWebsiteUrl).toString(),
  );
}

async function fetchPage(url: string, depth: number): Promise<CrawledPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.2",
        "accept-encoding": "gzip, deflate, br",
        "user-agent": "Mozilla/5.0 (compatible; LeadgenOS/1.0; email-discovery)",
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type");
    const html = response.ok ? (await response.text()).slice(0, 350_000) : "";
    return {
      requestedUrl: url,
      finalUrl: response.url || url,
      status: response.status,
      contentType,
      opened: response.ok,
      bytes: html.length,
      depth,
      error: response.ok ? null : `http_${response.status}`,
      html,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : error instanceof Error
          ? error.message
          : "fetch_failed";
    return {
      requestedUrl: url,
      finalUrl: null,
      status: null,
      contentType: null,
      opened: false,
      bytes: 0,
      depth,
      error: message,
      html: "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractLinks(html: string, pageUrl: string, domain: string): string[] {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      url: normalizeUrl(match[1], pageUrl),
      text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    }))
    .filter(
      (item): item is { url: string; text: string } =>
        Boolean(item.url && isInternalUrl(item.url, domain)),
    )
    .filter((item) => PRIORITY_LINK_PATTERN.test(`${item.url} ${item.text}`))
    .map((item) => item.url);
}

function extractForms(html: string, pageUrl: string, domain: string): string[] {
  const forms = [...html.matchAll(/<form\b[^>]*(?:action=["']([^"']*)["'])?[^>]*>/gi)]
    .map((match) => normalizeUrl(match[1] || pageUrl, pageUrl))
    .filter((url): url is string => Boolean(url && isInternalUrl(url, domain)));
  return [...new Set(forms)];
}

function extractSitemapUrls(xml: string, domain: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((match) => normalizeUrl(match[1].replace(/&amp;/g, "&"), `https://${domain}`))
    .filter((url): url is string => Boolean(url && isInternalUrl(url, domain)))
    .filter((url) => PRIORITY_LINK_PATTERN.test(url));
}

async function crawlOfficialWebsite(
  input: EmailDiscoveryInput,
): Promise<{ pages: CrawledPage[]; forms: string[]; diagnostics: string[] }> {
  const priorityUrls = buildPriorityUrls(input);
  const homepage = await fetchPage(priorityUrls[0], 0);
  const pages: CrawledPage[] = [homepage];
  const diagnostics: string[] = [];
  if (!homepage.opened) {
    diagnostics.push(`homepage_failed:${homepage.error ?? "unknown"}`);
  }
  if (homepage.opened && homepage.bytes < 500) {
    diagnostics.push("homepage_empty_or_javascript_required");
  }

  const robotsUrl = new URL("/robots.txt", input.officialWebsiteUrl).toString();
  const sitemapUrl = new URL("/sitemap.xml", input.officialWebsiteUrl).toString();
  const [robots, sitemap] = await Promise.all([
    fetchPage(robotsUrl, 0),
    fetchPage(sitemapUrl, 0),
  ]);
  pages.push(robots, sitemap);
  if (
    robots.opened &&
    /user-agent:\s*\*[\s\S]{0,500}disallow:\s*\/\s*(?:$|\r?\n)/im.test(
      robots.html,
    )
  ) {
    diagnostics.push("robots_blocked");
  }
  const robotsSitemaps = [
    ...robots.html.matchAll(/^\s*sitemap:\s*(https?:\/\/\S+)/gim),
  ].map((match) => match[1]);
  const extraSitemaps = await Promise.all(
    robotsSitemaps
      .filter((url) => isInternalUrl(url, input.officialDomain))
      .slice(0, 2)
      .map((url) => fetchPage(url, 0)),
  );
  pages.push(...extraSitemaps);

  const discovered = [
    ...extractLinks(homepage.html, homepage.finalUrl ?? input.officialWebsiteUrl, input.officialDomain),
    ...extractSitemapUrls(sitemap.html, input.officialDomain),
    ...extraSitemaps.flatMap((page) =>
      extractSitemapUrls(page.html, input.officialDomain),
    ),
  ];
  const queued = [
    ...priorityUrls.slice(1, 10),
    ...[...new Set(discovered)].slice(0, MAX_DISCOVERED_LINKS),
  ]
    .filter((url) => !pages.some((page) => page.requestedUrl === url))
    .slice(0, Math.max(0, MAX_PAGES - pages.length));
  const fetched = await Promise.all(queued.map((url) => fetchPage(url, 1)));
  pages.push(...fetched);
  const forms = [
    ...new Set(
      pages.flatMap((page) =>
        page.opened
          ? extractForms(page.html, page.finalUrl ?? page.requestedUrl, input.officialDomain)
          : [],
      ),
    ),
  ];
  return { pages, forms, diagnostics };
}

function getEmailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

function getRegistrableDomain(domain: string): string {
  const parts = domain.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : domain;
}

function isTrustedAliasEvidence(
  candidate: ParsedPublicEmail,
  input: EmailDiscoveryInput,
): boolean {
  if (!candidate.source_url || !isInternalUrl(candidate.source_url, input.officialDomain)) {
    return false;
  }
  try {
    const path = new URL(candidate.source_url).pathname.toLowerCase();
    if (
      /(partner|supplier|catalog|news|press|media|career|job|vacanc|privacy|personal-data|policy)/i.test(
        path,
      )
    ) {
      return false;
    }
    const trustedPath =
      path === "/" ||
      /(contact|kontak|about|o-kompanii|requisite|rekviz|company)/i.test(path);
    return trustedPath && candidate.extraction_method === "mailto";
  } catch {
    return false;
  }
}

function classifyKind(email: string): EmailCandidateKind {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (/^(sales|sale|zakaz|order|client)/.test(local)) return "sales";
  if (/^(commercial|commerce|bizdev)/.test(local)) return "commercial";
  if (/^(partner|partnership)/.test(local)) return "partnership";
  if (/^(marketing|market)/.test(local)) return "marketing";
  if (/^(press|pr|media)/.test(local)) return "press";
  if (/^(hr|job|career|vacancy|resume|recruit)/.test(local)) return "hr";
  if (/^(support|help|service)/.test(local)) return "support";
  if (/^(info|contact|hello|office|mail|reception|admin)/.test(local)) return "general";
  return local.includes(".") ? "personal_work" : "unknown";
}

function kindScore(kind: EmailCandidateKind, priority: EmailDiscoveryInput["emailPriority"]): number {
  const base = {
    personal_work: 38,
    sales: 34,
    commercial: 33,
    partnership: 31,
    marketing: 27,
    press: 18,
    support: 15,
    general: 20,
    unknown: 10,
    hr: -12,
  }[kind];
  const profileKind = kind === "personal_work" ? "personal" : kind;
  const priorityIndex = priority?.indexOf(profileKind as NonNullable<EmailDiscoveryInput["emailPriority"]>[number]) ?? -1;
  return base + (priorityIndex >= 0 ? (priority!.length - priorityIndex) * 8 : 0);
}

async function hasMx(domain: string): Promise<boolean> {
  if (!mxCache.has(domain)) {
    mxCache.set(
      domain,
      resolveMx(domain)
        .then((records) => records.length > 0)
        .catch(() => false),
    );
  }
  return mxCache.get(domain)!;
}

function getSearchQueries(input: EmailDiscoveryInput): string[] {
  const domain = input.officialDomain;
  const name = `"${input.companyName}"`;
  return [
    `site:${domain} контакты`,
    `${name} контакты`,
  ];
}

async function searchFallback(
  input: EmailDiscoveryInput,
  searchProvider: SearchProvider | null,
): Promise<{ results: SearchResult[]; queries: string[] }> {
  if (!searchProvider) return { results: [], queries: [] };
  const queries = getSearchQueries(input);
  const results: SearchResult[] = [];
  for (const query of queries) {
    try {
      results.push(
        ...(await searchProvider.search({
          query,
          maxResults: 8,
          market: "ru",
          queryLanguage: "ru",
        })),
      );
    } catch {
      // One search source must not abort the full company audit.
    }
  }
  return {
    queries,
    results: [
      ...new Map(results.map((result) => [result.url, result])).values(),
    ],
  };
}

function mergeParsedEmails(emails: ParsedPublicEmail[]): Array<ParsedPublicEmail & { evidenceCount: number }> {
  const grouped = new Map<string, ParsedPublicEmail & { evidenceCount: number }>();
  for (const email of emails) {
    const existing = grouped.get(email.email);
    if (existing) {
      existing.evidenceCount += 1;
      if (email.confidence_score > existing.confidence_score) {
        grouped.set(email.email, { ...email, evidenceCount: existing.evidenceCount });
      }
    } else {
      grouped.set(email.email, { ...email, evidenceCount: 1 });
    }
  }
  return [...grouped.values()];
}

export async function discoverCompanyEmails({
  rawInput,
  searchProvider,
}: {
  rawInput: EmailDiscoveryInput;
  searchProvider: SearchProvider | null;
}): Promise<EmailDiscoveryResult> {
  const input = normalizeOfficialInput(rawInput);
  const crawl = await crawlOfficialWebsite(input);
  const openedPages = crawl.pages.filter((page) => page.opened && page.html);
  const rejected: RejectedPublicEmail[] = [];
  const parsedFromOfficialPages = openedPages.flatMap((page) => {
    const parsed = extractPublicEmailsDetailed({
      text: page.html,
      sourceUrl: page.finalUrl ?? page.requestedUrl,
      companyDomain: null,
    });
    rejected.push(...parsed.rejected);
    return parsed.emails;
  });
  const fallback = parsedFromOfficialPages.length > 0
    ? { results: [] as SearchResult[], queries: [] as string[] }
    : await searchFallback(input, searchProvider);
  const indexedOfficialPages = await Promise.all(
    fallback.results
      .filter((result) => isInternalUrl(result.url, input.officialDomain))
      .filter(
        (result) =>
          !crawl.pages.some(
            (page) => (page.finalUrl ?? page.requestedUrl) === result.url,
          ),
      )
      .slice(0, 6)
      .map((result) => fetchPage(result.url, 2)),
  );
  const parsedFromIndexedOfficialPages = indexedOfficialPages.flatMap((page) => {
    if (!page.opened) return [];
    const parsed = extractPublicEmailsDetailed({
      text: page.html,
      sourceUrl: page.finalUrl ?? page.requestedUrl,
      companyDomain: null,
    });
    rejected.push(...parsed.rejected);
    return parsed.emails;
  });
  const aliases = [
    ...new Set(
      [...parsedFromOfficialPages, ...parsedFromIndexedOfficialPages]
        .filter((email) => isTrustedAliasEvidence(email, input))
        .map((email) => getEmailDomain(email.email))
        .filter((domain) => domain && domain !== input.officialDomain),
    ),
  ];
  const parsedFromSearch = fallback.results.flatMap((result) => {
    const resultHost = normalizeHostname(result.url);
    const parsed = extractPublicEmailsDetailed({
      text: `${result.title} ${result.snippet} ${result.raw_content ?? ""}`,
      sourceUrl: result.url,
      companyDomain: null,
    });
    const allowed = parsed.emails.filter((email) => {
      const domain = getEmailDomain(email.email);
      return (
        domain === input.officialDomain ||
        aliases.includes(domain) ||
        resultHost === input.officialDomain ||
        Boolean(resultHost?.endsWith(`.${input.officialDomain}`))
      );
    });
    rejected.push(
      ...parsed.emails
        .filter((email) => !allowed.includes(email))
        .map((email) => ({
          value: email.email,
          source_url: result.url,
          reason: "unconfirmed_external_domain",
          context: email.context,
        })),
      ...parsed.rejected,
    );
    return allowed;
  });

  const merged = mergeParsedEmails([
    ...parsedFromOfficialPages,
    ...parsedFromIndexedOfficialPages,
    ...parsedFromSearch,
  ]);
  const candidates = await Promise.all(
    merged.map(async (candidate): Promise<RankedEmailCandidate> => {
      const domain = getEmailDomain(candidate.email);
      const domainMatch = domain === input.officialDomain;
      const aliasPublishedOnOfficialSite = aliases.includes(domain);
      const corporateParentDomain =
        getRegistrableDomain(domain) ===
          getRegistrableDomain(input.officialDomain) &&
        isTrustedAliasEvidence(candidate, input);
      const mxExists = await hasMx(domain);
      const kind = classifyKind(candidate.email);
      const freeDomain = FREE_EMAIL_DOMAINS.has(domain);
      const validDomain =
        domainMatch || aliasPublishedOnOfficialSite || corporateParentDomain;
      const rejectionReason = !validDomain
        ? "domain_mismatch"
        : !mxExists
          ? "mx_missing"
          : null;
      const sourceType = candidate.source_url &&
        isInternalUrl(candidate.source_url, input.officialDomain)
        ? "official_website"
        : "public_search";
      const score =
        40 +
        kindScore(kind, input.emailPriority) +
        (domainMatch ? 24 : 8) +
        (candidate.extraction_method === "mailto" ? 10 : 0) +
        (candidate.evidenceCount > 1 ? 8 : 0) +
        (mxExists ? 8 : -30) +
        (sourceType === "official_website" ? 12 : -5) +
        (freeDomain ? -18 : 0);
      return {
        email: candidate.email,
        kind,
        score,
        sourceUrl: candidate.source_url ?? input.officialWebsiteUrl,
        sourceType,
        domainMatch,
        domainMatchReason: domainMatch
          ? "official_domain"
          : corporateParentDomain
            ? "confirmed_corporate_parent_domain"
          : aliasPublishedOnOfficialSite
            ? "domain_alias_published_on_official_site"
            : null,
        validationStatus: rejectionReason ? "rejected" : "domain_and_mx_confirmed",
        rejectionReason,
        extractionMethod: candidate.extraction_method,
        evidenceCount: candidate.evidenceCount,
      };
    }),
  );
  candidates.sort((left, right) => right.score - left.score);
  const bestEmail =
    candidates.find(
      (candidate) =>
        !candidate.rejectionReason &&
        (candidate.kind !== "hr" ||
          /hr|кадр|персонал|recruit/i.test(input.targetDepartment ?? "")),
    ) ?? null;
  const openedCount = openedPages.length;
  const hasTimeout = crawl.pages.some((page) => page.error === "timeout");
  const finalReason = bestEmail
    ? "email_found"
    : crawl.diagnostics.includes("robots_blocked")
      ? "robots_blocked"
    : openedCount === 0
      ? hasTimeout
        ? "timeout"
        : "official_site_unreachable"
      : openedPages.every((page) => page.bytes < 500)
        ? "javascript_required"
        : merged.length > 0
          ? "candidates_rejected"
          : fallback.results.length === 0
            ? "search_fallback_empty"
            : "no_email_in_html";

  return {
    input,
    bestEmail,
    candidates,
    rejected,
    pages: [...crawl.pages, ...indexedOfficialPages].map((page) => ({
      requestedUrl: page.requestedUrl,
      finalUrl: page.finalUrl,
      status: page.status,
      contentType: page.contentType,
      opened: page.opened,
      bytes: page.bytes,
      depth: page.depth,
      error: page.error,
    })),
    urlsInspected: [...crawl.pages, ...indexedOfficialPages].map(
      (page) => page.finalUrl ?? page.requestedUrl,
    ),
    forms: crawl.forms,
    aliases,
    queriesExecuted: fallback.queries,
    diagnostics: crawl.diagnostics,
    finalReason,
  };
}
