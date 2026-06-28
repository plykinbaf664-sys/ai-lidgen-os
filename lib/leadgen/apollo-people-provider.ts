import type {
  PeopleEnrichmentProvider,
  PeopleProviderResult,
} from "@/lib/leadgen/people-provider";

export class ApolloPeopleProvider implements PeopleEnrichmentProvider {
  id = "apollo";
  label = "Apollo";

  async findPeople(): Promise<PeopleProviderResult> {
    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates: [],
      unavailable: true,
    };
  }
}
