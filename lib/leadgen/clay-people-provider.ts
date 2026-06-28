import type {
  PeopleEnrichmentProvider,
  PeopleProviderResult,
} from "@/lib/leadgen/people-provider";

export class ClayPeopleProvider implements PeopleEnrichmentProvider {
  id = "clay";
  label = "Clay";

  async findPeople(): Promise<PeopleProviderResult> {
    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates: [],
      unavailable: true,
    };
  }
}
