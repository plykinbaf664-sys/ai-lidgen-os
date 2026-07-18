import type {
  SearchProvider,
  SearchProviderSearchInput,
  SearchResult,
} from "@/lib/leadgen/search/search-provider";

type TavilySearchResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  score?: unknown;
  published_date?: unknown;
  raw_content?: unknown;
};

type TavilySearchResponse = {
  results?: unknown;
};

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function normalizeTavilyResult(result: TavilySearchResult): SearchResult {
  return {
    title: toStringOrEmpty(result.title),
    url: toStringOrEmpty(result.url),
    snippet: toStringOrEmpty(result.content),
    source_label: "tavily",
    score: toNumberOrNull(result.score),
    published_at: toStringOrEmpty(result.published_date) || null,
    raw_content: toStringOrEmpty(result.raw_content) || null,
  };
}

export class TavilySearchProvider implements SearchProvider {
  private readonly apiKey: string;

  constructor(apiKey = process.env.TAVILY_API_KEY) {
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY is not configured");
    }

    this.apiKey = apiKey;
  }

  async search({
    query,
    maxResults = 5,
    page = 0,
  }: SearchProviderSearchInput): Promise<SearchResult[]> {
    // Tavily's current endpoint has no stable page/cursor contract. Additional
    // discovery comes from unique queries; never repeat the same query as a fake page.
    if (page > 0) return [];
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        topic: "general",
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily search failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as TavilySearchResponse;

    if (!Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((result) =>
      normalizeTavilyResult(result as TavilySearchResult),
    );
  }
}
