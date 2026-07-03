import { ContactDiscoveryService } from "@/lib/leadgen/contact-discovery-service";
import type {
  ContactEnrichmentInput,
  ContactEnrichmentResult,
} from "@/lib/leadgen/types";

export class ContactEnrichmentEngine {
  constructor(
    private readonly contactDiscoveryService = new ContactDiscoveryService(),
  ) {}

  async enrichContacts(
    input: ContactEnrichmentInput,
  ): Promise<ContactEnrichmentResult> {
    return this.contactDiscoveryService.discoverContacts(input);
  }
}
