import type {
  SearchProvider,
  SearchProviderSearchInput,
  SearchResult,
} from "@/lib/leadgen/search/search-provider";

type YandexSearchProviderOptions = {
  apiKey?: string;
  folderId?: string;
  endpoint?: string;
  ruRegionId?: string;
};

type YandexWebSearchResponse = {
  rawData?: unknown;
};

const DEFAULT_YANDEX_SEARCH_ENDPOINT =
  "https://searchapi.api.cloud.yandex.net/v2/web/search";
const DEFAULT_RU_REGION_ID = "225";

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripXmlTags(value: string): string {
  return decodeXmlEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getXmlTagValue(xml: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i");
  const match = xml.match(pattern);

  return match ? stripXmlTags(match[1] ?? "") : "";
}

function getPassages(docXml: string): string {
  const passages = [...docXml.matchAll(/<passage(?:\s[^>]*)?>([\s\S]*?)<\/passage>/gi)]
    .map((match) => stripXmlTags(match[1] ?? ""))
    .filter(Boolean);

  return passages.join(" ");
}

function getYandexError(xml: string): string | null {
  const error = getXmlTagValue(xml, "error");

  return error || null;
}

function formatYandexHttpError(status: number, responseText: string): string {
  try {
    const errorBody = JSON.parse(responseText) as {
      code?: unknown;
      message?: unknown;
    };
    const message =
      typeof errorBody.message === "string" ? errorBody.message : responseText;

    if (status === 403 || message.toLowerCase().includes("permission denied")) {
      return [
        `Yandex search failed: ${status} ${message}.`,
        "Check that the service account has the search-api.webSearch.user role for YANDEX_SEARCH_FOLDER_ID and that the API key is created for that service account.",
      ].join(" ");
    }
  } catch {
    // Fall through to the raw error below.
  }

  return `Yandex search failed: ${status} ${responseText}`;
}

function parseYandexXml(xml: string): SearchResult[] {
  const docs = [...xml.matchAll(/<doc(?:\s[^>]*)?>([\s\S]*?)<\/doc>/gi)];

  return docs
    .map((match): SearchResult => {
      const docXml = match[1] ?? "";
      const passages = getPassages(docXml);
      const headline = getXmlTagValue(docXml, "headline");

      return {
        title: getXmlTagValue(docXml, "title"),
        url: getXmlTagValue(docXml, "url"),
        snippet: passages || headline,
        source_label: "yandex",
        score: null,
        published_at: null,
        raw_content: passages || headline || null,
      };
    })
    .filter((result) => result.title || result.url || result.snippet)
    .map((result, index) => ({
      ...result,
      score: result.score ?? Math.max(1 - index * 0.05, 0.1),
    }));
}

export class YandexSearchProvider implements SearchProvider {
  private readonly apiKey: string;
  private readonly folderId: string;
  private readonly endpoint: string;
  private readonly ruRegionId: string;

  constructor({
    apiKey = process.env.YANDEX_SEARCH_API_KEY,
    folderId = process.env.YANDEX_SEARCH_FOLDER_ID,
    endpoint = process.env.YANDEX_SEARCH_ENDPOINT,
    ruRegionId = process.env.YANDEX_SEARCH_RU_REGION_ID,
  }: YandexSearchProviderOptions = {}) {
    if (!apiKey) {
      throw new Error("YANDEX_SEARCH_API_KEY is not configured");
    }

    if (!folderId) {
      throw new Error("YANDEX_SEARCH_FOLDER_ID is not configured");
    }

    this.apiKey = apiKey;
    this.folderId = folderId;
    this.endpoint = endpoint || DEFAULT_YANDEX_SEARCH_ENDPOINT;
    this.ruRegionId = ruRegionId || DEFAULT_RU_REGION_ID;
  }

  async search({
    query,
    maxResults = 5,
    page = 0,
    market,
    queryLanguage,
  }: SearchProviderSearchInput): Promise<SearchResult[]> {
    const isRuSearch = market === "ru" || queryLanguage === "ru";
    const resultsLimit = Math.min(Math.max(maxResults, 1), 100);
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: {
          searchType: isRuSearch ? "SEARCH_TYPE_RU" : "SEARCH_TYPE_COM",
          queryText: query,
          familyMode: "FAMILY_MODE_MODERATE",
          page: String(Math.max(0, page)),
          fixTypoMode: "FIX_TYPO_MODE_ON",
        },
        sortSpec: {
          sortMode: "SORT_MODE_BY_RELEVANCE",
          sortOrder: "SORT_ORDER_DESC",
        },
        groupSpec: {
          groupMode: "GROUP_MODE_FLAT",
          groupsOnPage: String(resultsLimit),
          docsInGroup: "1",
        },
        maxPassages: "3",
        region: isRuSearch ? this.ruRegionId : undefined,
        l10n: isRuSearch ? "LOCALIZATION_RU" : "LOCALIZATION_EN",
        folderId: this.folderId,
        responseFormat: "FORMAT_XML",
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(formatYandexHttpError(response.status, responseText));
    }

    const data = JSON.parse(responseText) as YandexWebSearchResponse;
    const rawData = typeof data.rawData === "string" ? data.rawData : "";

    if (!rawData) {
      return [];
    }

    const xml = rawData.trim().startsWith("<")
      ? rawData
      : Buffer.from(rawData, "base64").toString("utf8");
    const yandexError = getYandexError(xml);

    if (yandexError) {
      throw new Error(`Yandex search failed: ${yandexError}`);
    }

    return parseYandexXml(xml).slice(0, resultsLimit);
  }
}
