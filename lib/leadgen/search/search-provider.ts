export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source_label: string;
  score: number | null;
  published_at: string | null;
  raw_content: string | null;
};

export type SearchProviderSearchInput = {
  query: string;
  maxResults?: number;
  page?: number;
  market?: "global" | "ru";
  queryLanguage?: "en" | "ru";
};

export interface SearchProvider {
  search(input: SearchProviderSearchInput): Promise<SearchResult[]>;
}
