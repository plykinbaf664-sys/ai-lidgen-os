import type {
  PeopleEnrichmentProvider,
  PeopleProviderResult,
} from "@/lib/leadgen/people-provider";

export class MockPeopleProvider implements PeopleEnrichmentProvider {
  id = "mock-public-context";
  label = "Mock public context";

  async findPeople(): Promise<PeopleProviderResult> {
    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates: [],
    };
  }
}
