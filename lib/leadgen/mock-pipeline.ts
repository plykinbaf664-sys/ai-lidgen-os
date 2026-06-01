import { leadgenConfig } from "@/lib/leadgen/config";
import { mockCompanies } from "@/lib/leadgen/mock-data";
import type {
  CampaignInput,
  Contact,
  ContactChannel,
  LeadgenCampaign,
  LeadgenEvent,
  LeadgenLead,
  MockCompany,
  MockPipelineResult,
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
  return `${company.name}: ${signal.detail}`;
}

function writeMessage(company: MockCompany, signal: Signal): string {
  return `${signal.detail} В такие моменты исходящие коммуникации часто не успевают за изменениями: команда теряет часть подходящих компаний или выходит к ним с общим сообщением без убедительного повода ответить. Мы делаем ${leadgenConfig.offer.label.toLowerCase()}: находим приоритетные сегменты, реальные сигналы и точки входа, чтобы повысить долю содержательных ответов без массового спама. Могу прислать 3 гипотезы для ${company.name}?`;
}

function writeFollowUp(company: MockCompany): string {
  return `Коротко напомню о сообщении выше. Могу прислать 3 гипотезы для ${company.name}: без презентации и созвона на первом шаге. Посмотреть будет полезно?`;
}

function createRecordId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildCampaign(
  campaign: CampaignInput,
  createdAt: string,
): LeadgenCampaign {
  return {
    id: createRecordId("campaign", campaign.name, createdAt),
    name: campaign.name,
    requested_by: campaign.requestedBy,
    status: "completed",
    icp_label: leadgenConfig.icp.label,
    offer_label: leadgenConfig.offer.label,
    created_at: createdAt,
  };
}

function buildLead(
  campaign: LeadgenCampaign,
  company: MockCompany,
  createdAt: string,
): LeadgenLead {
  const signal = detectSignal(company);
  const contact = findBestContact(company.contacts);

  return {
    id: createRecordId("lead", campaign.id, company.id),
    campaign_id: campaign.id,
    company_name: company.name,
    company_domain: company.domain,
    company_segment: company.segment,
    contact_channel: contact?.channel ?? null,
    contact_label: contact?.label ?? null,
    contact_value: contact?.value ?? null,
    signal_title: signal.title,
    signal_detail: signal.detail,
    signal_source_label: signal.sourceLabel,
    hook: createHook(company, signal),
    message: writeMessage(company, signal),
    follow_up: writeFollowUp(company),
    status: "new",
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function buildEvent(
  campaignId: string,
  leadId: string | null,
  eventType: LeadgenEvent["event_type"],
  payload: LeadgenEvent["payload"],
  createdAt: string,
): LeadgenEvent {
  return {
    id: createRecordId("event", campaignId, leadId ?? "campaign", eventType),
    campaign_id: campaignId,
    lead_id: leadId,
    event_type: eventType,
    payload,
    created_at: createdAt,
  };
}

export function runMockPipeline(campaignInput: CampaignInput): MockPipelineResult {
  const createdAt = new Date().toISOString();
  const campaign = buildCampaign(campaignInput, createdAt);
  const leads = findCompanies().map((company) =>
    buildLead(campaign, company, createdAt),
  );
  const events = [
    buildEvent(
      campaign.id,
      null,
      "campaign_started",
      { campaign_name: campaign.name },
      createdAt,
    ),
    ...leads.map((lead) =>
      buildEvent(
        campaign.id,
        lead.id,
        "lead_generated",
        { company_name: lead.company_name },
        createdAt,
      ),
    ),
  ];

  return { campaign, leads, events };
}
