import type {
  SearchProvider,
  SearchProviderSearchInput,
  SearchResult,
} from "@/lib/leadgen/search/search-provider";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { fetchWithTransientRetry } from "@/lib/network/fetch-with-transient-retry";
import { throwIfAborted } from "@/lib/network/abortable-operation";
import { isDiscoveryV2Enabled } from "@/lib/leadgen/discovery-v2-config";

type PublicSearchSource =
  | "hh-api"
  | "hh-web"
  | "google-news"
  | "yahoo"
  | "brave"
  | "bing-rss";

type PublicWebSearchProviderOptions = {
  fetchImpl?: typeof fetch;
  sources?: PublicSearchSource[];
  timeoutMs?: number;
  minRequestIntervalMs?: number;
};

type ParsedPublicResult = Pick<SearchResult, "title" | "url" | "snippet">;
type SourcedPublicResult = ParsedPublicResult & { source_key: PublicSearchSource };

const DEFAULT_SOURCES: PublicSearchSource[] = ["yahoo", "brave", "bing-rss"];
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 400;
const MAX_RESULTS_PER_REQUEST = 20;
const PUBLIC_SEARCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtml(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }

      if (entity.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }

      return HTML_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

function plainText(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(decodeHtml(value));
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function unwrapYahooUrl(value: string): string | null {
  const decoded = decodeHtml(value);
  const match = decoded.match(/\/RU=([^/]+)\/RK=/i);
  return safeUrl(match ? decodeURIComponent(match[1]) : decoded);
}

function unwrapBingUrl(value: string): string | null {
  const direct = safeUrl(value);
  if (!direct) {
    return null;
  }

  const encoded = new URL(direct).searchParams.get("u");
  if (!encoded?.startsWith("a1")) {
    return direct;
  }

  try {
    const base64 = encoded
      .slice(2)
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil((encoded.length - 2) / 4) * 4, "=");
    return safeUrl(Buffer.from(base64, "base64").toString("utf8"));
  } catch {
    return direct;
  }
}

function uniqueResults<T extends ParsedPublicResult>(results: T[]): T[] {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = result.url.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function parseBraveSearchHtml(html: string): ParsedPublicResult[] {
  const starts = [...html.matchAll(/<div\b[^>]*data-type="web"[^>]*>/gi)];
  const results: ParsedPublicResult[] = [];

  starts.forEach((start, index) => {
    const block = html.slice(
      start.index,
      starts[index + 1]?.index ?? Math.min(html.length, (start.index ?? 0) + 18_000),
    );
    const anchor = block.match(/<a\b[^>]*href="(https?:\/\/[^"#]+)"[^>]*>/i);
    const title = block.match(
      /<div\b[^>]*class="[^"]*search-snippet-title[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const snippet = block.match(
      /<div\b[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const url = anchor ? safeUrl(anchor[1]) : null;
    const normalizedTitle = plainText(title?.[1] ?? "");

    if (url && normalizedTitle) {
      results.push({
        title: normalizedTitle,
        url,
        snippet: plainText(snippet?.[1] ?? ""),
      });
    }
  });

  return uniqueResults(results);
}

export function parseYahooSearchHtml(html: string): ParsedPublicResult[] {
  const headings = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  const results: ParsedPublicResult[] = [];

  headings.forEach((heading, index) => {
    const headingIndex = heading.index ?? 0;
    const before = html.slice(Math.max(0, headingIndex - 3_000), headingIndex);
    const anchors = [...before.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/gi)];
    const url = anchors.length
      ? unwrapYahooUrl(anchors[anchors.length - 1][1])
      : null;
    const nextHeadingIndex = headings[index + 1]?.index ?? headingIndex + 8_000;
    const after = html.slice(headingIndex + heading[0].length, nextHeadingIndex);
    const paragraph = after.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    const title = plainText(heading[1]);

    if (url && title) {
      results.push({
        title,
        url,
        snippet: plainText(paragraph?.[1] ?? ""),
      });
    }
  });

  return uniqueResults(results);
}

export function parseBingRss(xml: string): ParsedPublicResult[] {
  const results: ParsedPublicResult[] = [];

  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = block.match(/<title>([\s\S]*?)<\/title>/i);
    const link = block.match(/<link>([\s\S]*?)<\/link>/i);
    const description = block.match(/<description>([\s\S]*?)<\/description>/i);
    const url = link ? unwrapBingUrl(plainText(link[1])) : null;
    const normalizedTitle = plainText(title?.[1] ?? "");

    if (url && normalizedTitle) {
      results.push({
        title: normalizedTitle,
        url,
        snippet: plainText(description?.[1] ?? ""),
      });
    }
  }

  return uniqueResults(results);
}

export function parseHhApiSearch(value: unknown): ParsedPublicResult[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return uniqueResults(items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const employer = record.employer;
    const employerName = employer && typeof employer === "object" && !Array.isArray(employer)
      ? (employer as Record<string, unknown>).name
      : null;
    const title = typeof record.name === "string" ? record.name.trim() : "";
    const company = typeof employerName === "string" ? employerName.trim() : "";
    const id = typeof record.id === "string" ? record.id : "";
    const alternateUrl = typeof record.alternate_url === "string"
      ? safeUrl(record.alternate_url)
      : null;
    if (!title || !company || (!alternateUrl && !id)) return [];
    const snippet = record.snippet && typeof record.snippet === "object" && !Array.isArray(record.snippet)
      ? Object.values(record.snippet as Record<string, unknown>)
          .filter((part): part is string => typeof part === "string")
          .map(plainText)
          .join(" ")
      : "";
    return [{
      title: `Вакансия ${title} — ${company}`,
      url: alternateUrl ?? `https://hh.ru/vacancy/${id}`,
      snippet: `Работодатель: ${company}; открыта вакансия: ${title}. ${snippet}`.trim(),
    }];
  }));
}

export function parseHhSearchHtml(html: string): ParsedPublicResult[] {
  const anchors = [
    ...html.matchAll(/<a\b(?=[^>]*data-qa="serp-item__title")[^>]*>/gi),
  ];
  const results: ParsedPublicResult[] = [];

  anchors.forEach((anchor, index) => {
    const href = anchor[0].match(/href="([^"]+)"/i);
    const rawUrl = href ? safeUrl(href[1]) : null;
    if (!rawUrl) {
      return;
    }

    const url = new URL(rawUrl);
    if (!/(?:^|\.)hh\.ru$/i.test(url.hostname) || !/^\/vacancy\/\d+/.test(url.pathname)) {
      return;
    }
    url.search = "";
    url.hash = "";

    const block = html.slice(
      anchor.index,
      anchors[index + 1]?.index ?? Math.min(html.length, (anchor.index ?? 0) + 8_000),
    );
    const title = block.match(
      /data-qa="serp-item__title-text"[^>]*>([\s\S]*?)<\/span>/i,
    );
    const normalizedTitle = plainText(title?.[1] ?? "");
    if (!normalizedTitle) {
      return;
    }

    results.push({
      title: normalizedTitle,
      url: url.toString(),
      snippet: plainText(block).slice(0, 700),
    });
  });

  return uniqueResults(results);
}

function queryTerms(query: string): string[] {
  const ignored = new Set([
    "and",
    "company",
    "official",
    "site",
    "the",
    "компания",
    "официальный",
    "сайт",
    "публичная",
    "карточка",
    "организация",
    "организации",
  ]);

  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/(?:^|\s)-\S+/g, " ")
        .replace(/site:\S+/g, " ")
        .match(/[a-zа-яё\d]{3,}/gi)
        ?.filter((term) => !ignored.has(term)) ?? [],
    ),
  );
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[«»"'`]+/g, " ").replace(/\s+/g, " ").trim();
}

function quotedPhrases(query: string): string[] {
  return [...query.matchAll(/["«]([^"»]{3,})["»]/g)]
    .map((match) => normalizeForMatch(match[1]))
    .filter(Boolean);
}

function excludedTerms(query: string): string[] {
  return [...query.matchAll(/(?:^|\s)-([a-zа-яё\d-]{3,})/gi)]
    .map((match) => normalizeForMatch(match[1]))
    .filter(Boolean);
}

function requiredSiteDomain(query: string): string | null {
  const match = query.match(/(?:^|\s)site:([^\s/]+)(?:\/\S*)?/i);
  return match?.[1]?.toLowerCase().replace(/^www\./, "") ?? null;
}

function publicSearchQuery(query: string): string {
  const domain = requiredSiteDomain(query);
  const withoutOperator = query.replace(/\bsite:\S+/gi, " ").replace(/\s+/g, " ").trim();
  return domain ? `${withoutOperator} ${domain}` : withoutOperator;
}

function directSiteQuery(query: string): string {
  return query.replace(/\bsite:\S+/gi, " ").replace(/\s+/g, " ").trim();
}

function isRelevant(result: ParsedPublicResult, query: string): boolean {
  const requiredDomain = requiredSiteDomain(query);
  if (requiredDomain) {
    try {
      const hostname = new URL(result.url).hostname.toLowerCase().replace(/^www\./, "");
      if (hostname !== requiredDomain && !hostname.endsWith(`.${requiredDomain}`)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const haystack = normalizeForMatch(`${result.title} ${result.snippet} ${result.url}`);
  if (!isDiscoveryV2Enabled()) {
    const terms = queryTerms(query);
    return terms.length === 0 || terms.some((term) => haystack.includes(term));
  }
  if (excludedTerms(query).some((term) => haystack.includes(term))) return false;

  const phrases = quotedPhrases(query);
  const phraseWords = new Set(phrases.flatMap((phrase) => phrase.split(" ")));
  if (phraseWords.size > 0 && ![...phraseWords].some((term) => haystack.includes(term))) {
    return false;
  }
  const contextTerms = queryTerms(query).filter((term) => !phraseWords.has(term));
  return contextTerms.length === 0 || contextTerms.some((term) => haystack.includes(term));
}

function looksBlocked(body: string): boolean {
  return /(?:page needs javascript[\s\S]{0,300}captcha|\/captcha(?:["'?/]|$)|verify(?:ing)? (?:that )?you(?:'re| are) not a bot|unusual traffic|security check couldn't be completed)/i.test(
    body,
  );
}

function sourceUrl(
  source: PublicSearchSource,
  input: SearchProviderSearchInput,
): string {
  const query = encodeURIComponent(publicSearchQuery(input.query));
  const page = Math.max(0, input.page ?? 0);

  if (source === "hh-web") {
    const text = encodeURIComponent(directSiteQuery(input.query));
    return `https://hh.ru/search/vacancy?text=${text}&area=113&page=${page}`;
  }

  if (source === "hh-api") {
    const text = encodeURIComponent(
      directSiteQuery(input.query).replace(/(?:^|\s)-\S+/g, " ").replace(/\s+/g, " ").trim(),
    );
    const perPage = Math.min(Math.max(input.maxResults ?? 20, 1), 20);
    return `https://api.hh.ru/vacancies?text=${text}&area=113&only_with_salary=false&per_page=${perPage}&page=${page}`;
  }

  if (source === "google-news") {
    return `https://news.google.com/rss/search?q=${query}&hl=ru&gl=RU&ceid=RU:ru`;
  }

  if (source === "yahoo") {
    return `https://search.yahoo.com/search?p=${query}&ei=UTF-8&b=${page * 10 + 1}`;
  }

  if (source === "brave") {
    return `https://search.brave.com/search?q=${query}&source=web&offset=${page}`;
  }

  return `https://www.bing.com/search?format=rss&q=${query}&mkt=ru-RU&setlang=ru&cc=RU&first=${page * 10 + 1}`;
}

function parseSource(
  source: PublicSearchSource,
  body: string,
): ParsedPublicResult[] {
  if (source === "hh-api") {
    try {
      return parseHhApiSearch(JSON.parse(body));
    } catch {
      return [];
    }
  }

  if (source === "hh-web") {
    return parseHhSearchHtml(body);
  }

  if (source === "yahoo") {
    return parseYahooSearchHtml(body);
  }

  if (source === "brave") {
    return parseBraveSearchHtml(body);
  }

  return parseBingRss(body);
}

export class PublicWebSearchProvider implements SearchProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly sources: PublicSearchSource[];
  private readonly timeoutMs: number;
  private readonly minRequestIntervalMs: number;
  private readonly cache = new Map<string, {
    expiresAt: number;
    value: Promise<SearchResult[]>;
  }>();
  private requestGate: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  private pruneCache(now = Date.now()): void {
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
    while (this.cache.size >= 256) {
      const oldest = this.cache.keys().next().value;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
  }

  constructor({
    fetchImpl = fetch,
    sources = DEFAULT_SOURCES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    minRequestIntervalMs = DEFAULT_MIN_REQUEST_INTERVAL_MS,
  }: PublicWebSearchProviderOptions = {}) {
    this.fetchImpl = fetchImpl;
    this.sources = sources;
    this.timeoutMs = timeoutMs;
    this.minRequestIntervalMs = minRequestIntervalMs;
  }

  private async waitForRequestSlot(signal?: AbortSignal): Promise<void> {
    const previous = this.requestGate;
    let release: () => void = () => {};
    this.requestGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(signal?.reason);
        signal?.addEventListener("abort", onAbort, { once: true });
        previous.then(resolve, reject).finally(() => {
          signal?.removeEventListener("abort", onAbort);
        });
      });
      throwIfAborted(signal);

      const waitMs = Math.max(
        0,
        this.minRequestIntervalMs - (Date.now() - this.lastRequestAt),
      );
      if (waitMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(timeout);
            reject(signal?.reason);
          };
          const timeout = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
          }, waitMs);
          signal?.addEventListener("abort", onAbort, { once: true });
        });
      }
      throwIfAborted(signal);
      this.lastRequestAt = Date.now();
    } finally {
      release();
    }
  }

  private async fetchSource(
    source: PublicSearchSource,
    input: SearchProviderSearchInput,
  ): Promise<ParsedPublicResult[]> {
    await this.waitForRequestSlot(input.signal);
    const response = await fetchWithTransientRetry(
      sourceUrl(source, input),
      {
        headers: {
          Accept: source === "hh-api"
            ? "application/json"
            : source === "bing-rss" || source === "google-news"
            ? "application/rss+xml, application/xml;q=0.9, text/html;q=0.8"
            : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": input.queryLanguage === "ru"
            ? "ru-RU,ru;q=0.9,en;q=0.7"
            : "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "User-Agent": PUBLIC_SEARCH_USER_AGENT,
        },
        redirect: "follow",
        signal: input.signal,
      },
      {
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
        maxAttempts: 3,
      },
    );
    const body = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const parsed = parseSource(source, body);
    if (parsed.length === 0 && looksBlocked(body)) {
      throw new Error("blocked by an anti-bot challenge");
    }

    return parsed.filter((result) =>
      isRelevant(result, input.query),
    );
  }

  private async searchUncached(
    input: SearchProviderSearchInput,
  ): Promise<SearchResult[]> {
    const errors: string[] = [];
    const resultsBySource: SourcedPublicResult[][] = [];
    let receivedSuccessfulResponse = false;
    const maxResults = Math.min(
      Math.max(input.maxResults ?? 10, 1),
      MAX_RESULTS_PER_REQUEST,
    );

    const isHhQuery =
      requiredSiteDomain(input.query) === "hh.ru" ||
      input.queryAngle === "ru_job_board";
    const sources = isHhQuery
      ? (["hh-api", "hh-web", "bing-rss"] as PublicSearchSource[])
      : input.queryAngle === "market_news"
        ? ([
            ...(Math.max(0, input.page ?? 0) === 0 ? ["google-news" as const] : []),
            "bing-rss",
            "yahoo",
          ] as PublicSearchSource[])
        : input.queryAngle === "person_research"
          ? (["brave", "bing-rss"] as PublicSearchSource[])
        : this.sources;

    const sourceResponses = await Promise.all(
      Array.from(new Set(sources)).map(async (source) => {
        try {
          return { source, results: await this.fetchSource(source, input), error: null };
        } catch (error) {
          return {
            source,
            results: [] as ParsedPublicResult[],
            error: formatUnknownError(error, "public search failed"),
          };
        }
      }),
    );
    throwIfAborted(input.signal);
    for (const response of sourceResponses) {
      if (response.error) {
        errors.push(`${response.source}: ${response.error}`);
        continue;
      }
      receivedSuccessfulResponse = true;
      if (response.results.length > 0) {
        resultsBySource.push(response.results.map((result) => ({
          ...result,
          source_key: response.source,
        })));
      }
      else errors.push(`${response.source}: no relevant results`);
    }

    const interleaved: SourcedPublicResult[] = [];
    const longestSource = Math.max(0, ...resultsBySource.map((items) => items.length));
    for (let index = 0; index < longestSource; index += 1) {
      for (const sourceResults of resultsBySource) {
        if (sourceResults[index]) interleaved.push(sourceResults[index]);
      }
    }
    const unique = uniqueResults(interleaved).slice(0, maxResults);
    if (unique.length > 0) {
      return unique.map((result, index) => ({
        ...result,
        source_label: `public-web:${result.source_key}`,
        score: Math.max(0.1, 1 - index * 0.04),
        published_at: null,
        raw_content: result.snippet || null,
      }));
    }

    if (receivedSuccessfulResponse) {
      return [];
    }

    throw new Error(`Public web search failed. ${errors.join(" | ")}`);
  }

  search(input: SearchProviderSearchInput): Promise<SearchResult[]> {
    if (input.signal) {
      return this.searchUncached(input);
    }
    const cacheKey = JSON.stringify({
      query: input.query.trim(),
      maxResults: input.maxResults ?? 10,
      page: input.page ?? 0,
      market: input.market ?? "global",
      queryLanguage: input.queryLanguage ?? "en",
    });
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached.value;
    }
    if (cached) this.cache.delete(cacheKey);
    this.pruneCache(now);

    const pending = this.searchUncached(input).catch((error) => {
      this.cache.delete(cacheKey);
      throw error;
    });
    this.cache.set(cacheKey, {
      expiresAt: now + 15 * 60 * 1_000,
      value: pending,
    });
    return pending;
  }
}
