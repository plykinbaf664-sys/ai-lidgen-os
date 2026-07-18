import { ApolloPeopleProvider } from "@/lib/leadgen/apollo-people-provider";
import { ClayPeopleProvider } from "@/lib/leadgen/clay-people-provider";
import { HunterPeopleProvider } from "@/lib/leadgen/hunter-people-provider";
import { MockPeopleProvider } from "@/lib/leadgen/mock-people-provider";
import { PeopleDataLabsProvider } from "@/lib/leadgen/people-data-labs-provider";
import type { PeopleEnrichmentProvider } from "@/lib/leadgen/people-provider";
import { RuPublicPeopleProvider } from "@/lib/leadgen/ru-public-people-provider";

type PeopleProviderMode =
  | "auto"
  | "ru_public"
  | "clay"
  | "apollo"
  | "hunter"
  | "pdl"
  | "mock";

const externalProviderModes = new Set<PeopleProviderMode>([
  "clay",
  "apollo",
  "hunter",
  "pdl",
]);

const defaultProviderOrder: PeopleProviderMode[] = ["ru_public"];

function areExternalPeopleProvidersEnabled(): boolean {
  return process.env.LEADGEN_ENABLE_EXTERNAL_PEOPLE_PROVIDERS === "true";
}

function isProviderMode(value: string): value is PeopleProviderMode {
  return [
    "auto",
    "ru_public",
    "clay",
    "apollo",
    "hunter",
    "pdl",
    "mock",
  ].includes(value);
}

function getProviderOrder(): PeopleProviderMode[] {
  const raw = process.env.LEADGEN_PEOPLE_PROVIDERS?.trim();

  if (!raw) {
    return defaultProviderOrder;
  }

  const modes = raw
    .split(",")
    .map((mode) => mode.trim().toLowerCase())
    .filter(isProviderMode)
    .filter((mode) => mode !== "auto")
    .filter(
      (mode) =>
        !externalProviderModes.has(mode) || areExternalPeopleProvidersEnabled(),
    );

  return modes.length > 0 ? modes : defaultProviderOrder;
}

function isConfigured(mode: PeopleProviderMode): boolean {
  if (mode === "ru_public") {
    return true;
  }

  if (mode === "clay") {
    return (
      areExternalPeopleProvidersEnabled() &&
      Boolean(process.env.CLAY_PEOPLE_WEBHOOK_URL)
    );
  }

  if (mode === "apollo") {
    return (
      areExternalPeopleProvidersEnabled() && Boolean(process.env.APOLLO_API_KEY)
    );
  }

  if (mode === "hunter") {
    return (
      areExternalPeopleProvidersEnabled() && Boolean(process.env.HUNTER_API_KEY)
    );
  }

  if (mode === "pdl") {
    return (
      areExternalPeopleProvidersEnabled() &&
      Boolean(process.env.PEOPLE_DATA_LABS_API_KEY)
    );
  }

  return mode === "mock" && process.env.LEADGEN_ALLOW_MOCK_PEOPLE === "true";
}

function createProvider(mode: PeopleProviderMode): PeopleEnrichmentProvider | null {
  if (!isConfigured(mode)) {
    return null;
  }

  if (mode === "ru_public") {
    return new RuPublicPeopleProvider();
  }

  if (mode === "clay") {
    return new ClayPeopleProvider();
  }

  if (mode === "apollo") {
    return new ApolloPeopleProvider();
  }

  if (mode === "hunter") {
    return new HunterPeopleProvider();
  }

  if (mode === "pdl") {
    return new PeopleDataLabsProvider();
  }

  if (mode === "mock") {
    return new MockPeopleProvider();
  }

  return null;
}

export function createPeopleProviders(): PeopleEnrichmentProvider[] {
  return getProviderOrder()
    .map(createProvider)
    .filter((provider): provider is PeopleEnrichmentProvider => Boolean(provider));
}
