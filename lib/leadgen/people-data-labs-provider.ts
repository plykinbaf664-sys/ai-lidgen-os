import type {
  PeopleEnrichmentProvider,
  PeopleProviderResult,
} from "@/lib/leadgen/people-provider";

export class PeopleDataLabsProvider implements PeopleEnrichmentProvider {
  id = "people-data-labs";
  label = "People Data Labs";

  async findPeople(): Promise<PeopleProviderResult> {
    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates: [],
      unavailable: true,
    };
  }
}
