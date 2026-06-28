import type {
  PeopleEnrichmentProvider,
  PeopleProviderInput,
  PeopleProviderResult,
} from "@/lib/leadgen/people-provider";

export class PeopleProviderManager {
  constructor(private readonly providers: PeopleEnrichmentProvider[]) {}

  async findPeople(input: PeopleProviderInput): Promise<PeopleProviderResult[]> {
    if (this.providers.length === 0) {
      return [];
    }

    const results = await Promise.allSettled(
      this.providers.map((provider) => provider.findPeople(input)),
    );

    return results.flatMap((result, index) => {
      if (result.status === "fulfilled") {
        return [result.value];
      }

      const provider = this.providers[index];

      return [
        {
          provider_id: provider.id,
          provider_label: provider.label,
          candidates: [],
          unavailable: true,
        },
      ];
    });
  }
}
