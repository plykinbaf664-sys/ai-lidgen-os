export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source_label: string;
  source_key?: string;
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
  signal?: AbortSignal;
  queryAngle?:
    | "company_careers"
    | "company_contacts"
    | "ats"
    | "job_board"
    | "ru_job_board"
    | "company_blog"
    | "market_news"
    | "person_research";
};

export interface SearchProvider {
  search(input: SearchProviderSearchInput): Promise<SearchResult[]>;
}
