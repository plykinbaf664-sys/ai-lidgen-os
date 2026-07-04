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

const DEFAULT_YANDEX_XML_ENDPOINT = "https://yandex.com/search/xml";
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
    this.endpoint = endpoint || DEFAULT_YANDEX_XML_ENDPOINT;
    this.ruRegionId = ruRegionId || DEFAULT_RU_REGION_ID;
  }

  async search({
    query,
    maxResults = 5,
    market,
    queryLanguage,
  }: SearchProviderSearchInput): Promise<SearchResult[]> {
    const isRuSearch = market === "ru" || queryLanguage === "ru";
    const url = new URL(this.endpoint);
    const resultsLimit = Math.min(Math.max(maxResults, 1), 100);

    url.searchParams.set("folderid", this.folderId);
    url.searchParams.set("apikey", this.apiKey);
    url.searchParams.set("query", query);
    url.searchParams.set("l10n", isRuSearch ? "ru" : "en");
    url.searchParams.set("filter", "none");
    url.searchParams.set("sortby", "rlv");
    url.searchParams.set(
      "groupby",
      `attr=d.mode=flat.groups-on-page=${resultsLimit}.docs-in-group=1`,
    );

    if (isRuSearch) {
      url.searchParams.set("lr", this.ruRegionId);
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/xml,text/xml,*/*",
      },
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Yandex search failed: ${response.status} ${responseText}`);
    }

    const yandexError = getYandexError(responseText);

    if (yandexError) {
      throw new Error(`Yandex search failed: ${yandexError}`);
    }

    return parseYandexXml(responseText).slice(0, resultsLimit);
  }
}
