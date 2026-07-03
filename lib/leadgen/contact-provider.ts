import type {
  ContactProviderInput,
  ContactProviderResult,
} from "@/lib/leadgen/types";

export type { ContactProviderInput, ContactProviderResult };

export interface ContactProvider {
  id: string;
  label: string;
  findContacts(input: ContactProviderInput): Promise<ContactProviderResult>;
}
