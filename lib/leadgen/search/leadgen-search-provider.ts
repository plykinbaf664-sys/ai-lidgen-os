import type {
  SearchProvider,
  SearchProviderSearchInput,
  SearchResult,
} from "@/lib/leadgen/search/search-provider";
import { PublicWebSearchProvider } from "@/lib/leadgen/search/public-web-search-provider";
import { TavilySearchProvider } from "@/lib/leadgen/search/tavily-provider";
import { OpenAiWebSearchProvider } from "@/lib/leadgen/search/openai-web-search-provider";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { cachedResearch, researchCacheKey } from "@/lib/leadgen/research-cache";

export type LeadgenSearchProviderMode =
  | "auto"
  | "browser"
  | "tavily"
  | "yandex"
  | "yandex_tavily";

type ProviderSlot = {
  name: "browser" | "tavily" | "openai-web";
  provider: SearchProvider;
};

type CreateLeadgenSearchProviderInput = {
  mode?: LeadgenSearchProviderMode;
};

function createProviderSlot(name: ProviderSlot["name"]): ProviderSlot {
  return {
    name,
    provider: name === "tavily" ? new TavilySearchProvider() : name === "openai-web" ? new OpenAiWebSearchProvider() : new PublicWebSearchProvider(),
  };
}

function getConfiguredSlots(): ProviderSlot[] {
  return [createProviderSlot("browser"),
    ...(process.env.TAVILY_API_KEY?.trim() ? [createProviderSlot("tavily")] : []),
    ...(process.env.OPENAI_API_KEY?.trim() && process.env.LEADGEN_OPENAI_SEARCH_FALLBACK !== "false" ? [createProviderSlot("openai-web")] : [])];
}

function formatProviderErrors(errors: string[]): string {
  return errors.length > 0 ? ` Last errors: ${errors.join(" | ")}` : "";
}

export function isLeadgenSearchProviderMode(
  value: string | null | undefined,
): value is LeadgenSearchProviderMode {
  return (
    value === "auto" ||
    value === "browser" ||
    value === "tavily" ||
    value === "yandex" ||
    value === "yandex_tavily"
  );
}

export class MarketAwareSearchProvider implements SearchProvider {
  private readonly mode: LeadgenSearchProviderMode;
  private readonly slots: ProviderSlot[];

  constructor({
    mode = "auto",
    slots = getConfiguredSlots(),
  }: {
    mode?: LeadgenSearchProviderMode;
    slots?: ProviderSlot[];
  } = {}) {
    if (slots.length === 0) {
      throw new Error(
        "No free public search provider is configured.",
      );
    }

    this.mode = mode;
    this.slots = slots;
  }

  private getProviderChain(input: SearchProviderSearchInput): ProviderSlot[] {
    const browser = this.slots.find((slot) => slot.name === "browser");
    const tavily = this.slots.find((slot) => slot.name === "tavily");
    const openai = this.slots.find((slot) => slot.name === "openai-web");

    if (this.mode === "browser" || this.mode === "auto") {
      // Explicit general-web research used to bypass this chain and call Tavily
      // directly. Preserve that preference while keeping outages recoverable.
      if (input.searchTopic === "general") return [tavily, openai, browser].filter((slot): slot is ProviderSlot => Boolean(slot));
      return [browser, tavily, openai].filter((slot): slot is ProviderSlot => Boolean(slot));
    }
    if (this.mode === "tavily") return tavily ? [tavily] : [];
    void input;
    return [];
  }

  async search(input: SearchProviderSearchInput): Promise<SearchResult[]> {
    const { signal, ...parameters } = input;
    const key = researchCacheKey({ version: 2, mode: this.mode, slots: this.slots.map(slot => slot.name),
      ...parameters, query: input.query.trim().replace(/\s+/g, " ").toLowerCase() });
    return cachedResearch("search", key, 6*60*60_000, requestSignal => this.searchUncached({ ...input, signal: requestSignal }), signal,
      results => results.length > 0);
  }

  private async searchUncached(input: SearchProviderSearchInput): Promise<SearchResult[]> {
    const providerChain = this.getProviderChain(input);
    const errors: string[] = [];

    if (providerChain.length === 0) {
      throw new Error(
        `Search provider mode "${this.mode}" is not configured for this environment.`,
      );
    }

    for (const slot of providerChain) {
      try {
        const results = await slot.provider.search(input);

        if (results.length > 0) {
          return results.map((result) => ({
            ...result,
            source_label: result.source_label || slot.name,
          }));
        }

        errors.push(`${slot.name}: no results`);
      } catch (error) {
        const message = formatUnknownError(error, "Search provider failed.");
        const formattedError = `${slot.name}: ${message}`;
        errors.push(formattedError);

      }
    }

    if (
      errors.some((error) => !error.endsWith(": no results"))
    ) {
      throw new Error(`Search incomplete: providers unavailable and no usable results.${formatProviderErrors(errors)}`);
    }

    return [];
  }
}

export function createLeadgenSearchProvider({
  mode,
}: CreateLeadgenSearchProviderInput = {}): SearchProvider {
  const selectedMode =
    mode ??
    (isLeadgenSearchProviderMode(process.env.LEADGEN_SEARCH_PROVIDER)
      ? process.env.LEADGEN_SEARCH_PROVIDER
      : "auto");

  return new MarketAwareSearchProvider({ mode: selectedMode });
}
