import { leadgenConfig } from "@/lib/leadgen/config";
import type { SearchProvider } from "@/lib/leadgen/search/search-provider";
import { interpretSignal } from "@/lib/leadgen/signals/signal-interpreter";
import { runSignalPipeline } from "@/lib/leadgen/signals/signal-pipeline";
import type {
  CampaignInput,
  LeadCandidate,
  LeadDiscoveryResult,
  LeadgenCampaign,
  LeadgenCompany,
  LeadgenEvent,
  LeadgenLead,
  LeadgenSignal,
  SignalType,
} from "@/lib/leadgen/types";

type RunLeadDiscoveryInput = {
  campaignInput: CampaignInput;
  searchProvider: SearchProvider;
  targetCompanies?: number;
};

type CandidateRecord = {
  candidate: LeadCandidate;
  signalType: SignalType;
};

const DEFAULT_TARGET_COMPANIES = 5;
const MAX_SIGNALS_PER_RUN = 3;
const TARGET_PER_SIGNAL = 3;
const MAX_QUERIES_PER_SIGNAL = 3;
const MAX_RESULTS_PER_QUERY = 5;

function createRecordId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeCompanyName(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

function getCandidateKey(candidate: LeadCandidate): string {
  if (candidate.company_domain) {
    return `domain:${candidate.company_domain.toLowerCase()}`;
  }

  return `name:${normalizeCompanyName(candidate.company_name)}`;
}

function getSignalOrder(): SignalType[] {
  return Object.entries(leadgenConfig.icp.signalPriorities)
    .sort((left, right) => right[1] - left[1])
    .map(([signalType]) => signalType as SignalType)
    .slice(0, MAX_SIGNALS_PER_RUN);
}

function buildCampaign(
  campaignInput: CampaignInput,
  pipelineRunId: string,
  createdAt: string,
): LeadgenCampaign {
  return {
    id: createRecordId("campaign", campaignInput.name, createdAt),
    pipeline_run_id: pipelineRunId,
    name: campaignInput.name,
    requested_by: campaignInput.requestedBy,
    status: "completed",
    icp_label: leadgenConfig.icp.label,
    offer_label: leadgenConfig.offer.label,
    created_at: createdAt,
  };
}

function getPrimarySignal(candidate: LeadCandidate): LeadgenSignal | null {
  return [...candidate.signals].sort(
    (left, right) => right.confidence_score - left.confidence_score,
  )[0] ?? null;
}

function getConfidenceScore(candidate: LeadCandidate): number {
  if (candidate.signals.length === 0) {
    return 0;
  }

  return Math.max(...candidate.signals.map((signal) => signal.confidence_score));
}

function interpretCandidate(candidate: LeadCandidate): LeadCandidate | null {
  const primarySignal = getPrimarySignal(candidate);

  if (!primarySignal) {
    return null;
  }

  const interpretation = interpretSignal({
    candidate,
    primarySignal,
  });

  return {
    ...candidate,
    ...interpretation,
  };
}

function buildCompany({
  campaign,
  candidate,
  signalType,
  createdAt,
  index,
}: {
  campaign: LeadgenCampaign;
  candidate: LeadCandidate;
  signalType: SignalType;
  createdAt: string;
  index: number;
}): LeadgenCompany {
  const primarySignal = getPrimarySignal(candidate);

  return {
    id: createRecordId(
      "company",
      campaign.id,
      candidate.company_domain ?? candidate.company_name,
      String(index + 1),
    ),
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    company_name: candidate.company_name,
    company_domain: candidate.company_domain,
    company_segment: candidate.company_segment,
    source: "signal_pipeline",
    source_url: candidate.company_source_url || primarySignal?.source_url || null,
    source_label: primarySignal?.signal_source_label ?? null,
    signal_type: candidate.signal_type ?? signalType,
    discovery_query: candidate.discovery_query ?? null,
    matched_signal_count:
      candidate.matched_signal_count ?? candidate.signals.length,
    lead_score: candidate.lead_score,
    icp_fit_score: candidate.icp_fit_score,
    confidence_score: getConfidenceScore(candidate),
    country: null,
    industry: null,
    company_size: null,
    linkedin_url: null,
    metadata: {
      signal_source_urls: candidate.signals.map((signal) => signal.source_url),
      signal_types: [
        ...new Set(candidate.signals.map((signal) => signal.signal_type)),
      ],
      icp_fit_breakdown: candidate.icp_fit_breakdown,
      signal_interpretation: {
        evidence_language: candidate.evidence_language,
        confirmed_facts: candidate.confirmed_facts,
        inferred_insights: candidate.inferred_insights,
        confidence_level: candidate.confidence_level,
        signal_summary: candidate.signal_summary,
        why_it_matters: candidate.why_it_matters,
        why_now: candidate.why_now,
        outreach_hypothesis: candidate.outreach_hypothesis,
        evidence_quality: candidate.evidence_quality,
        card_signal_title: candidate.card_signal_title,
        should_create_lead: candidate.should_create_lead,
      },
    },
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function createHook(company: LeadgenCompany, candidate: LeadCandidate): string {
  return `${company.company_name}: ${candidate.why_now ?? candidate.signal_summary}`;
}

function writeMessage(company: LeadgenCompany, candidate: LeadCandidate): string {
  return [
    `Noticed ${candidate.signal_summary}`,
    `${candidate.why_it_matters}`,
    `${candidate.outreach_hypothesis} Would it be useful if I sent 2-3 concrete workflow hypotheses for ${company.company_name}?`,
  ].join(" ");
}

function writeFollowUp(company: LeadgenCompany, candidate: LeadCandidate): string {
  return `Quick follow-up on ${company.company_name}. The reason I reached out now: ${candidate.why_now} I can send a short hypothesis map without a pitch or call as the first step.`;
}

function buildLead({
  campaign,
  company,
  primarySignal,
  candidate,
  createdAt,
}: {
  campaign: LeadgenCampaign;
  company: LeadgenCompany;
  primarySignal: LeadgenSignal;
  candidate: LeadCandidate;
  createdAt: string;
}): LeadgenLead {
  return {
    id: createRecordId("lead", campaign.id, company.id),
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    company_id: company.id,
    company_name: company.company_name,
    company_domain: company.company_domain,
    company_segment: company.company_segment,
    contact_channel: null,
    contact_label: null,
    contact_value: null,
    company_source_url: company.source_url,
    lead_score: company.lead_score,
    icp_fit_score: company.icp_fit_score,
    signal_title: candidate.card_signal_title ?? primarySignal.signal_title,
    signal_detail: candidate.signal_summary ?? primarySignal.signal_detail,
    signal_source_label: primarySignal.signal_source_label,
    hook: createHook(company, candidate),
    message: writeMessage(company, candidate),
    follow_up: writeFollowUp(company, candidate),
    status: "new",
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function buildSignals({
  campaign,
  company,
  lead,
  candidate,
  createdAt,
}: {
  campaign: LeadgenCampaign;
  company: LeadgenCompany;
  lead: LeadgenLead;
  candidate: LeadCandidate;
  createdAt: string;
}): LeadgenSignal[] {
  return candidate.signals.map((signal, index) => ({
    ...signal,
    id: createRecordId(
      "signal",
      lead.id,
      signal.signal_type,
      String(index + 1),
    ),
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    lead_id: lead.id,
    company_id: company.id,
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

async function discoverCandidates({
  searchProvider,
  targetCompanies,
}: {
  searchProvider: SearchProvider;
  targetCompanies: number;
}): Promise<CandidateRecord[]> {
  const candidateRecords = new Map<string, CandidateRecord>();

  for (const signalType of getSignalOrder()) {
    const result = await runSignalPipeline({
      signalType,
      searchProvider,
      targetCandidates: TARGET_PER_SIGNAL,
      maxQueries: MAX_QUERIES_PER_SIGNAL,
      maxResultsPerQuery: MAX_RESULTS_PER_QUERY,
    });

    for (const candidate of result.candidates) {
      const interpretedCandidate = interpretCandidate(candidate);

      if (!interpretedCandidate?.should_create_lead) {
        continue;
      }

      const candidateKey = getCandidateKey(candidate);

      if (!candidateRecords.has(candidateKey)) {
        candidateRecords.set(candidateKey, {
          candidate: interpretedCandidate,
          signalType,
        });
      }

      if (candidateRecords.size >= targetCompanies) {
        return [...candidateRecords.values()];
      }
    }
  }

  return [...candidateRecords.values()];
}

export async function runLeadDiscoveryEngine({
  campaignInput,
  searchProvider,
  targetCompanies = DEFAULT_TARGET_COMPANIES,
}: RunLeadDiscoveryInput): Promise<LeadDiscoveryResult> {
  const createdAt = new Date().toISOString();
  const pipelineRunId = createRecordId(
    "pipeline-run",
    campaignInput.name,
    createdAt,
  );
  const campaign = buildCampaign(campaignInput, pipelineRunId, createdAt);
  const candidateRecords = await discoverCandidates({
    searchProvider,
    targetCompanies,
  });
  const companies = candidateRecords.map(({ candidate, signalType }, index) =>
    buildCompany({
      campaign,
      candidate,
      signalType,
      createdAt,
      index,
    }),
  );
  const leadRecords = companies
    .map((company, index) => {
      const candidate = candidateRecords[index].candidate;
      const primarySignal = getPrimarySignal(candidate);

      if (!primarySignal) {
        return null;
      }

      const lead = buildLead({
        campaign,
        company,
        primarySignal,
        candidate,
        createdAt,
      });

      return {
        lead,
        signals: buildSignals({
          campaign,
          company,
          lead,
          candidate,
          createdAt,
        }),
      };
    })
    .filter((record): record is { lead: LeadgenLead; signals: LeadgenSignal[] } =>
      Boolean(record),
    );
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

  return {
    campaign,
    companies,
    leads,
    signals,
    events,
  };
}
