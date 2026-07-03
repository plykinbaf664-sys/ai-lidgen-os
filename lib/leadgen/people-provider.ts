import type {
  PeopleProviderInput,
  PeopleProviderResult,
} from "@/lib/leadgen/types";

export type { PeopleProviderInput, PeopleProviderResult };

export interface PeopleEnrichmentProvider {
  id: string;
  label: string;
  findPeople(input: PeopleProviderInput): Promise<PeopleProviderResult>;
}
