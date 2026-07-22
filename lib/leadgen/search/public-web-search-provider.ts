import type {
  SearchProvider,
  SearchProviderSearchInput,
  SearchResult,
} from "@/lib/leadgen/search/search-provider";
import { formatUnknownError } from "@/lib/leadgen/error-format";

type PublicSearchSource = "hh-web" | "yahoo" | "brave" | "bing-rss";

type PublicWebSearchProviderOptions = {
  fetchImpl?: typeof fetch;
  sources?: PublicSearchSource[];
  timeoutMs?: number;
  minRequestIntervalMs?: number;
};

type ParsedPublicResult = Pick<SearchResult, "title" | "url" | "snippet">;

const DEFAULT_SOURCES: PublicSearchSource[] = ["yahoo", "brave", "bing-rss"];
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 850;
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

function uniqueResults(results: ParsedPublicResult[]): ParsedPublicResult[] {
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
  ]);

  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/site:\S+/g, " ")
        .match(/[a-zа-яё\d]{3,}/gi)
        ?.filter((term) => !ignored.has(term)) ?? [],
    ),
  );
}

function requiredSiteDomain(query: string): string | null {
  const match = query.match(/\bsite:([^\s/]+)(?:\/\S*)?/i);
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

  const terms = queryTerms(query);
  if (terms.length === 0) {
    return true;
  }

  const haystack = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
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
  private readonly cache = new Map<string, Promise<SearchResult[]>>();
  private requestGate: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

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

  private async waitForRequestSlot(): Promise<void> {
    const previous = this.requestGate;
    let release: () => void = () => {};
    this.requestGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const waitMs = Math.max(
      0,
      this.minRequestIntervalMs - (Date.now() - this.lastRequestAt),
    );
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestAt = Date.now();
    release();
  }

  private async fetchSource(
    source: PublicSearchSource,
    input: SearchProviderSearchInput,
  ): Promise<ParsedPublicResult[]> {
    await this.waitForRequestSlot();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(sourceUrl(source, input), {
        headers: {
          Accept: source === "bing-rss"
            ? "application/rss+xml, application/xml;q=0.9, text/html;q=0.8"
            : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": input.queryLanguage === "ru"
            ? "ru-RU,ru;q=0.9,en;q=0.7"
            : "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          "User-Agent": PUBLIC_SEARCH_USER_AGENT,
        },
        redirect: "follow",
        signal: controller.signal,
      });
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
    } finally {
      clearTimeout(timeout);
    }
  }

  private async searchUncached(
    input: SearchProviderSearchInput,
  ): Promise<SearchResult[]> {
    const errors: string[] = [];
    let receivedSuccessfulResponse = false;
    const maxResults = Math.min(
      Math.max(input.maxResults ?? 10, 1),
      MAX_RESULTS_PER_REQUEST,
    );

    const sources = requiredSiteDomain(input.query) === "hh.ru"
      ? (["hh-web", ...this.sources] as PublicSearchSource[])
      : this.sources;

    for (const source of Array.from(new Set(sources))) {
      try {
        const results = await this.fetchSource(source, input);
        receivedSuccessfulResponse = true;
        if (results.length > 0) {
          return results.slice(0, maxResults).map((result, index) => ({
            ...result,
            source_label: `public-web:${source}`,
            score: Math.max(0.1, 1 - index * 0.05),
            published_at: null,
            raw_content: result.snippet || null,
          }));
        }
        errors.push(`${source}: no relevant results`);
      } catch (error) {
        errors.push(
          `${source}: ${formatUnknownError(error, "public search failed")}`,
        );
      }
    }

    if (receivedSuccessfulResponse) {
      return [];
    }

    throw new Error(`Public web search failed. ${errors.join(" | ")}`);
  }

  search(input: SearchProviderSearchInput): Promise<SearchResult[]> {
    const cacheKey = JSON.stringify({
      query: input.query.trim(),
      maxResults: input.maxResults ?? 10,
      page: input.page ?? 0,
      market: input.market ?? "global",
      queryLanguage: input.queryLanguage ?? "en",
    });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = this.searchUncached(input).catch((error) => {
      this.cache.delete(cacheKey);
      throw error;
    });
    this.cache.set(cacheKey, pending);
    return pending;
  }
}
