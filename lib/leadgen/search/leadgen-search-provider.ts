import type {
  SearchProvider,
  SearchProviderSearchInput,
  SearchResult,
} from "@/lib/leadgen/search/search-provider";
import { TavilySearchProvider } from "@/lib/leadgen/search/tavily-provider";
import { YandexSearchProvider } from "@/lib/leadgen/search/yandex-provider";

export type LeadgenSearchProviderMode =
  | "auto"
  | "tavily"
  | "yandex"
  | "yandex_tavily";

type ProviderSlot = {
  name: "tavily" | "yandex";
  provider: SearchProvider;
};

type CreateLeadgenSearchProviderInput = {
  mode?: LeadgenSearchProviderMode;
};

function isYandexConfigured(): boolean {
  return Boolean(
    process.env.YANDEX_SEARCH_API_KEY && process.env.YANDEX_SEARCH_FOLDER_ID,
  );
}

function isTavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

function createProviderSlot(name: ProviderSlot["name"]): ProviderSlot {
  return {
    name,
    provider:
      name === "yandex" ? new YandexSearchProvider() : new TavilySearchProvider(),
  };
}

function getConfiguredSlots(): ProviderSlot[] {
  const slots: ProviderSlot[] = [];

  if (isYandexConfigured()) {
    slots.push(createProviderSlot("yandex"));
  }

  if (isTavilyConfigured()) {
    slots.push(createProviderSlot("tavily"));
  }

  return slots;
}

function formatProviderErrors(errors: string[]): string {
  return errors.length > 0 ? ` Last errors: ${errors.join(" | ")}` : "";
}

function isRuSearch(input: SearchProviderSearchInput): boolean {
  return input.market === "ru" || input.queryLanguage === "ru";
}

function isFatalSearchProviderError(message: string): boolean {
  return /(?:permission denied|unauthorized|forbidden|\b40[13]\b|api[- ]?key|folder|not configured|search-api\.webSearch\.user)/i.test(
    message,
  );
}

export function isLeadgenSearchProviderMode(
  value: string | null | undefined,
): value is LeadgenSearchProviderMode {
  return (
    value === "auto" ||
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
        "No search provider is configured. Set YANDEX_SEARCH_API_KEY + YANDEX_SEARCH_FOLDER_ID for RU search, or TAVILY_API_KEY for Tavily fallback.",
      );
    }

    this.mode = mode;
    this.slots = slots;
  }

  private getProviderChain(input: SearchProviderSearchInput): ProviderSlot[] {
    const yandex = this.slots.find((slot) => slot.name === "yandex");
    const tavily = this.slots.find((slot) => slot.name === "tavily");

    if (this.mode === "yandex") {
      return yandex ? [yandex] : [];
    }

    if (this.mode === "tavily") {
      return tavily ? [tavily] : [];
    }

    if (this.mode === "yandex_tavily") {
      return [yandex, tavily].filter(Boolean) as ProviderSlot[];
    }

    const isRuSearch = input.market === "ru" || input.queryLanguage === "ru";

    return isRuSearch
      ? ([yandex, tavily].filter(Boolean) as ProviderSlot[])
      : ([tavily, yandex].filter(Boolean) as ProviderSlot[]);
  }

  async search(input: SearchProviderSearchInput): Promise<SearchResult[]> {
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
        const message = error instanceof Error ? error.message : String(error);
        const formattedError = `${slot.name}: ${message}`;
        errors.push(formattedError);

        if (
          this.mode === "auto" &&
          slot.name === "yandex" &&
          isRuSearch(input) &&
          isFatalSearchProviderError(message)
        ) {
          throw new Error(
            `Yandex RU search failed and Tavily fallback was skipped to avoid hiding RU provider issues.${formatProviderErrors(
              errors,
            )}`,
          );
        }
      }
    }

    if (errors.some((error) => !error.endsWith(": no results"))) {
      throw new Error(`All search providers failed.${formatProviderErrors(errors)}`);
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
