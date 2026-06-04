import { leadgenConfig } from "@/lib/leadgen/config";
import { mockCompanies } from "@/lib/leadgen/mock-data";
import type {
  CampaignInput,
  Contact,
  ContactChannel,
  LeadgenCampaign,
  LeadgenEvent,
  LeadgenLead,
  LeadgenSignal,
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
  return company.signals[0] ?? company.signal;
}

function detectSignals(company: MockCompany): Signal[] {
  return company.signals.length > 0 ? company.signals : [company.signal];
}

function calculateLeadScore(signals: Signal[]): number {
  if (signals.length === 0) {
    return 0;
  }

  const strongestSignalScore = Math.max(
    ...signals.map((signal) => signal.confidenceScore),
  );
  const signalCountBonus = Math.min((signals.length - 1) * 8, 20);

  return Math.min(strongestSignalScore + signalCountBonus, 100);
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
  pipelineRunId: string,
  createdAt: string,
): LeadgenCampaign {
  return {
    id: createRecordId("campaign", campaign.name, createdAt),
    pipeline_run_id: pipelineRunId,
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
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    company_name: company.name,
    company_domain: company.domain,
    company_segment: company.segment,
    contact_channel: contact?.channel ?? null,
    contact_label: contact?.label ?? null,
    contact_value: contact?.value ?? null,
    company_source_url: signal.sourceUrl,
    lead_score: calculateLeadScore(detectSignals(company)),
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

function buildSignals(
  campaign: LeadgenCampaign,
  lead: LeadgenLead,
  company: MockCompany,
  createdAt: string,
): LeadgenSignal[] {
  return detectSignals(company).map((signal, index) => ({
    id: createRecordId("signal", lead.id, signal.type, String(index + 1)),
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    lead_id: lead.id,
    signal_type: signal.type,
    signal_title: signal.title,
    signal_detail: signal.detail,
    signal_source_label: signal.sourceLabel,
    source_url: signal.sourceUrl,
    confidence_score: signal.confidenceScore,
    found_at: signal.foundAt,
    created_at: createdAt,
  }));
}

function buildEvent(
  pipelineRunId: string,
  campaignId: string,
  leadId: string | null,
  eventType: LeadgenEvent["event_type"],
  payload: LeadgenEvent["payload"],
  createdAt: string,
): LeadgenEvent {
  return {
    id: createRecordId("event", campaignId, leadId ?? "campaign", eventType),
    pipeline_run_id: pipelineRunId,
    campaign_id: campaignId,
    lead_id: leadId,
    event_type: eventType,
    payload,
    created_at: createdAt,
  };
}

export function runMockPipeline(campaignInput: CampaignInput): MockPipelineResult {
  const createdAt = new Date().toISOString();
  const pipelineRunId = createRecordId("pipeline-run", campaignInput.name, createdAt);
  const campaign = buildCampaign(campaignInput, pipelineRunId, createdAt);
  const leadRecords = findCompanies().map((company) => {
    const lead = buildLead(campaign, company, createdAt);

    return {
      lead,
      signals: buildSignals(campaign, lead, company, createdAt),
    };
  });
  const leads = leadRecords.map((record) => record.lead);
  const signals = leadRecords.flatMap((record) => record.signals);
  const events = [
    buildEvent(
      pipelineRunId,
      campaign.id,
      null,
      "campaign_started",
      { campaign_name: campaign.name },
      createdAt,
    ),
    ...leads.map((lead) =>
      buildEvent(
        pipelineRunId,
        campaign.id,
        lead.id,
        "lead_generated",
        { company_name: lead.company_name },
        createdAt,
      ),
    ),
  ];

  return { campaign, leads, signals, events };
}
