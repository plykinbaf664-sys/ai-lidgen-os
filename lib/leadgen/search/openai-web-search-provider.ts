import { fetchLeadgenModel } from "@/lib/leadgen/ai-runtime";
import type { SearchProvider, SearchProviderSearchInput, SearchResult } from "@/lib/leadgen/search/search-provider";
import { llmAvailabilityError, recordLlmFailure } from "@/lib/leadgen/llm-availability";
import { researchUrl } from "@/lib/leadgen/research-evidence";

type Citation = { type?: string; url?: string; title?: string; start_index?: number; end_index?: number };
type Output = { type?: string; content?: { type?: string; text?: string; annotations?: Citation[] }[] };

/** Search summaries are discovery hints, never fetched person/email evidence. */
export function parseCitedSearchResults(output: Output[], maxResults: number): SearchResult[] {
  const results = new Map<string, SearchResult>();
  for (const item of output) for (const content of item.content ?? []) {
    if (content.type !== "output_text" || !content.text) continue;
    let previousEnd = 0;
    for (const citation of content.annotations ?? []) {
      const url = citation.type === "url_citation" && citation.url ? researchUrl(citation.url) : null;
      if (!url || typeof citation.start_index !== "number" || typeof citation.end_index !== "number") continue;
      const paragraphStart = content.text.lastIndexOf("\n\n", citation.start_index);
      const start = Math.max(previousEnd, paragraphStart < 0 ? 0 : paragraphStart + 2);
      const snippet = content.text.slice(start, citation.start_index).trim().slice(0, 1400);
      previousEnd = citation.end_index;
      if (snippet && !results.has(url)) results.set(url, { url, title: citation.title ?? url,
        snippet: `[Search summary; fetch source before confirming facts] ${snippet}`,
        source_label: "openai-web-search", score: null, published_at: null, raw_content: null });
    }
  }
  return [...results.values()].slice(0, maxResults);
}

export class OpenAiWebSearchProvider implements SearchProvider {
  async search(input: SearchProviderSearchInput): Promise<SearchResult[]> {
    if ((input.page ?? 0) > 0) return [];
    if (llmAvailabilityError("openai")) throw new Error(llmAvailabilityError("openai")!);
    const response = await fetchLeadgenModel("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(18_000)]) : AbortSignal.timeout(18_000),
      body: JSON.stringify({ model: "gpt-4.1-mini", store: false,
        tools: [{ type: "web_search", search_context_size: "low" }], tool_choice: { type: "web_search" }, max_tool_calls: 1,
        instructions: "Run one web search for the supplied query. Return up to five brief factual results, one per paragraph, with the source citation immediately after each result. Include published names, exact roles and contact details only when present in that source. Do not infer addresses, ownership or facts from memory. Keep the query's company/domain constraints. No reasoning or recommendations.",
        input: JSON.stringify({ query: input.query, maxResults: Math.min(input.maxResults ?? 5, 5) }), max_output_tokens: 800,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI web search: ${await recordLlmFailure(response)}`);
    const data = await response.json();
    return parseCitedSearchResults(data.output ?? [], Math.min(input.maxResults ?? 5, 5));
  }
}
