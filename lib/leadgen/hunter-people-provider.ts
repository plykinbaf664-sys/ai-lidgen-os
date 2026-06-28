import type {
  PeopleEnrichmentProvider,
  PeopleProviderResult,
} from "@/lib/leadgen/people-provider";

export class HunterPeopleProvider implements PeopleEnrichmentProvider {
  id = "hunter";
  label = "Hunter";

  async findPeople(): Promise<PeopleProviderResult> {
    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates: [],
      unavailable: true,
    };
  }
}
