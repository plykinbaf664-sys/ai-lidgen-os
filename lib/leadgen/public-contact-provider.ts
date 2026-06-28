import type {
  LeadgenCompany,
  LeadgenContact,
  LeadgenContactType,
} from "@/lib/leadgen/types";
import type {
  ContactProvider,
  ContactProviderInput,
  ContactProviderResult,
} from "@/lib/leadgen/contact-provider";

const genericEmailPattern =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function createRecordId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = "";
    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function getCompanyWebsite(company: LeadgenCompany): string | null {
  if (!company.company_domain) {
    return null;
  }

  if (company.company_domain.startsWith("http")) {
    return normalizeUrl(company.company_domain);
  }

  return `https://${company.company_domain}`;
}

function getKnownText(input: ContactProviderInput): string {
  return [
    input.company.company_name,
    input.company.company_domain ?? "",
    input.company.source_url ?? "",
    input.company.source_label ?? "",
    input.lead.signal_title,
    input.lead.signal_detail,
    input.lead.hook,
    input.lead.message,
    ...input.signals.flatMap((signal) => [
      signal.signal_title,
      signal.signal_detail,
      signal.source_url,
    ]),
    JSON.stringify(input.company.metadata),
  ].join(" ");
}

function getKnownUrls(input: ContactProviderInput): string[] {
  const urls = [
    input.company.source_url,
    input.lead.company_source_url,
    ...input.signals.map((signal) => signal.source_url),
  ]
    .map(normalizeUrl)
    .filter((url): url is string => Boolean(url));

  return [...new Set(urls)];
}

function isContactLikeUrl(url: string): boolean {
  const normalizedUrl = url.toLowerCase();

  return (
    normalizedUrl.includes("/contact") ||
    normalizedUrl.includes("/contacts") ||
    normalizedUrl.includes("/demo") ||
    normalizedUrl.includes("/book") ||
    normalizedUrl.includes("/sales")
  );
}

function isSocialUrl(url: string): boolean {
  const normalizedUrl = url.toLowerCase();

  return (
    normalizedUrl.includes("linkedin.com/company") ||
    normalizedUrl.includes("linkedin.com/in/") ||
    normalizedUrl.includes("t.me/") ||
    normalizedUrl.includes("telegram.me/") ||
    normalizedUrl.includes("twitter.com/") ||
    normalizedUrl.includes("x.com/")
  );
}

function createContact({
  input,
  type,
  index,
  email = null,
  contactUrl = null,
  linkedinUrl = null,
  telegramUrl = null,
  fullName = null,
  roleTitle = null,
  department = null,
  sourceUrl = null,
  sourceLabel = null,
  confidenceScore,
  metadata = {},
}: {
  input: ContactProviderInput;
  type: LeadgenContactType;
  index: number;
  email?: string | null;
  contactUrl?: string | null;
  linkedinUrl?: string | null;
  telegramUrl?: string | null;
  fullName?: string | null;
  roleTitle?: string | null;
  department?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  confidenceScore: number;
  metadata?: Record<string, unknown>;
}): LeadgenContact {
  const targetPersonaMetadata = input.decisionMaker
    ? {
        target_persona: input.decisionMaker.primary_persona,
        target_department: input.decisionMaker.department,
        target_persona_confidence: input.decisionMaker.confidence_score,
        target_persona_search_keywords: input.decisionMaker.search_keywords,
      }
    : {};

  return {
    id: createRecordId("contact", input.lead.id, type, String(index + 1)),
    pipeline_run_id: input.campaign.pipeline_run_id,
    campaign_id: input.campaign.id,
    company_id: input.company.id,
    lead_id: input.lead.id,
    contact_type: type,
    full_name: fullName,
    role_title: roleTitle,
    department,
    email,
    linkedin_url: linkedinUrl,
    telegram_url: telegramUrl,
    contact_url: contactUrl,
    source_url: sourceUrl,
    source_label: sourceLabel,
    confidence_score: confidenceScore,
    is_primary: false,
    metadata: {
      ...metadata,
      ...targetPersonaMetadata,
    },
    created_at: input.createdAt,
  };
}

export class PublicContactProvider implements ContactProvider {
  async findContacts(input: ContactProviderInput): Promise<ContactProviderResult> {
    const contacts: LeadgenContact[] = [];
    const knownUrls = getKnownUrls(input);
    const knownText = getKnownText(input);
    const emails = [...new Set(knownText.match(genericEmailPattern) ?? [])];
    const people = input.peopleDiscovery?.all_candidates ?? [];

    for (const person of people) {
      contacts.push(
        createContact({
          input,
          type: person.work_email ? "confirmed_person" : "role_based_person",
          index: contacts.length,
          email: person.work_email,
          contactUrl: person.linkedin_url,
          linkedinUrl: person.linkedin_url,
          fullName: person.full_name,
          roleTitle: person.role_title,
          department: person.department,
          sourceUrl: person.linkedin_url,
          sourceLabel: person.source,
          confidenceScore: person.confidence_score,
          metadata: {
            extraction: "people_discovery_candidate",
            full_name: person.full_name,
            role_title: person.role_title,
            department: person.department,
            phone: person.phone,
            evidence: person.evidence,
            people_metadata: person.metadata,
          },
        }),
      );
    }

    for (const email of emails) {
      contacts.push(
        createContact({
          input,
          type: "generic_email",
          index: contacts.length,
          email,
          sourceUrl: input.company.source_url,
          sourceLabel: "available company context",
          confidenceScore: 55,
          metadata: { extraction: "email_found_in_available_context" },
        }),
      );
    }

    for (const url of knownUrls.filter(isContactLikeUrl)) {
      contacts.push(
        createContact({
          input,
          type: "contact_form",
          index: contacts.length,
          contactUrl: url,
          sourceUrl: url,
          sourceLabel: "available contact-like URL",
          confidenceScore: 70,
          metadata: { extraction: "contact_like_url_from_available_context" },
        }),
      );
    }

    for (const url of knownUrls.filter(isSocialUrl)) {
      contacts.push(
        createContact({
          input,
          type: "social_profile",
          index: contacts.length,
          contactUrl: url,
          linkedinUrl: url.includes("linkedin.com") ? url : null,
          telegramUrl:
            url.includes("t.me/") || url.includes("telegram.me/") ? url : null,
          sourceUrl: url,
          sourceLabel: "available social URL",
          confidenceScore: 45,
          metadata: { extraction: "social_url_from_available_context" },
        }),
      );
    }

    const companyWebsite = getCompanyWebsite(input.company);

    if (companyWebsite) {
      contacts.push(
        createContact({
          input,
          type: "company_website",
          index: contacts.length,
          contactUrl: companyWebsite,
          sourceUrl: input.company.source_url ?? companyWebsite,
          sourceLabel: "company domain",
          confidenceScore: 35,
          metadata: { extraction: "company_domain_fallback" },
        }),
      );
    }

    if (contacts.length === 0) {
      contacts.push(
        createContact({
          input,
          type: "no_contact_found",
          index: 0,
          sourceUrl: input.company.source_url,
          sourceLabel: "available company context",
          confidenceScore: 0,
          metadata: {
            reason: "No public entry point found from available company context",
          },
        }),
      );
    }

    return { contacts };
  }
}
