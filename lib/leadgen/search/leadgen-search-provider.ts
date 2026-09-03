import type {
  SearchProvider,
  SearchProviderSearchInput,
  SearchResult,
} from "@/lib/leadgen/search/search-provider";
import { PublicWebSearchProvider } from "@/lib/leadgen/search/public-web-search-provider";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export type LeadgenSearchProviderMode =
  | "auto"
  | "browser"
  | "tavily"
  | "yandex"
  | "yandex_tavily";

type ProviderSlot = {
  name: "browser";
  provider: SearchProvider;
};

type CreateLeadgenSearchProviderInput = {
  mode?: LeadgenSearchProviderMode;
};

function createProviderSlot(name: ProviderSlot["name"]): ProviderSlot {
  return {
    name,
    provider: new PublicWebSearchProvider(),
  };
}

function getConfiguredSlots(): ProviderSlot[] {
  return [createProviderSlot("browser")];
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

    if (this.mode === "browser" || this.mode === "auto") {
      return browser ? [browser] : [];
    }
    void input;
    return [];
  }

  async search(input: SearchProviderSearchInput): Promise<SearchResult[]> {
    const providerChain = this.getProviderChain(input);
    const errors: string[] = [];
    let receivedSuccessfulResponse = false;

    if (providerChain.length === 0) {
      throw new Error(
        `Search provider mode "${this.mode}" is not configured for this environment.`,
      );
    }

    for (const slot of providerChain) {
      try {
        const results = await slot.provider.search(input);
        receivedSuccessfulResponse = true;

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
      !receivedSuccessfulResponse &&
      errors.some((error) => !error.endsWith(": no results"))
    ) {
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
