import { leadgenConfig } from "@/lib/leadgen/config";
import { mockCompanies } from "@/lib/leadgen/mock-data";
import type {
  CampaignInput,
  Contact,
  ContactChannel,
  Lead,
  MockCompany,
  Signal,
} from "@/lib/leadgen/types";

const contactPriority: ContactChannel[] = [
  "decision-maker",
  "department-head",
  "founder",
  "general-email",
  "website-form",
  "linkedin",
  "social",
];

function findCompanies(): MockCompany[] {
  return mockCompanies;
}

function findBestContact(contacts: Contact[]): Contact | null {
  for (const channel of contactPriority) {
    const contact = contacts.find((item) => item.channel === channel);

    if (contact) {
      return contact;
    }
  }

  return null;
}

function detectSignal(company: MockCompany): Signal {
  return company.signal;
}

function createHook(company: MockCompany, signal: Signal): string {
  return `${company.name}: noticed the ${signal.title.toLowerCase()} signal.`;
}

function writeMessage(company: MockCompany, signal: Signal): string {
  return `I saw that ${company.name} has a ${signal.title.toLowerCase()} signal. ${signal.detail} We are testing a focused ${leadgenConfig.offer.label.toLowerCase()} and this looks like a relevant moment to compare notes.`;
}

function writeFollowUp(company: MockCompany): string {
  return `Following up on the note about ${company.name}. Would a short outline of the audit be useful?`;
}

function buildLead(campaign: CampaignInput, company: MockCompany): Lead {
  const signal = detectSignal(company);

  return {
    id: `${campaign.name}-${company.id}`,
    campaignName: campaign.name,
    company: {
      name: company.name,
      domain: company.domain,
      segment: company.segment,
    },
    contact: findBestContact(company.contacts),
    signal,
    hook: createHook(company, signal),
    message: writeMessage(company, signal),
    followUp: writeFollowUp(company),
    status: "new",
  };
}

export function runMockPipeline(campaign: CampaignInput): Lead[] {
  return findCompanies().map((company) => buildLead(campaign, company));
}
