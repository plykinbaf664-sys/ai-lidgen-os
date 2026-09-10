import "server-only";

import { createHash } from "node:crypto";
import { runAiHiringLiveCanary } from "@/lib/leadgen/ai-hiring-live-canary";
import { getDuplicateReason, getCompanyIdentity, normalizeDomain } from "@/lib/leadgen/company-identity";
import { getRegisteredCompanyIdentities, registerDiscoveredCompanies } from "@/lib/leadgen/company-registry";
import { completeImportBatch, getImportBatchRows } from "@/lib/leadgen/contact-import-store";
import { classifyEvidenceBackedEmail, getContactLevel } from "@/lib/leadgen/contact-quality";
import { discoverDecisionMaker } from "@/lib/leadgen/decision-maker-discovery";
import { buildEmailOutreach } from "@/lib/leadgen/email-outreach-builder";
import { createLeadOriginContext } from "@/lib/leadgen/lead-origin";
import { isConfirmedOutreachEmail } from "@/lib/leadgen/adaptive-contact-intelligence";
import { researchCompany, type CompanyResearchResult } from "@/lib/leadgen/company-research-agent";
import { getKnownRecipientEmails, syncOutreachQueue } from "@/lib/leadgen/outreach-storage";
import { verifyCompanySegment, type SegmentVerification } from "@/lib/leadgen/segment-guard";
import { savePipelineResult } from "@/lib/leadgen/storage";
import { runAbortableOperation } from "@/lib/network/abortable-operation";
import type {
  CampaignInput,
  LeadCandidate,
  LeadgenCampaign,
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
  LeadgenSignal,
  LeadDiscoveryResult,
  PeopleDiscoveryResult,
  SignalType,
} from "@/lib/leadgen/types";
import { getVerticalIcp, getVerticalProfile, type LeadgenVerticalId } from "@/lib/leadgen/verticals";

type SourceCandidate = {
  origin: "AI_HIRING" | "IMPORTED";
  companyName: string;
  domain: string;
  website: string;
  segmentVerification: SegmentVerification;
  signalType: "AI_AUTOMATION_HIRING_SIGNAL" | "IMPORTED_CONTEXT";
  signalTitle: string;
  signalDetail: string;
  signalSourceUrl: string;
  signalConfidence: number;
  email: string | null;
  emailKind: string | null;
  emailSourceUrl: string | null;
  importedName?: string | null;
  importedRole?: string | null;
};

const EMPTY_PEOPLE: PeopleDiscoveryResult = {
  primary_person: null,
  alternative_people: [],
  all_candidates: [],
  search_status: "no_person_found",
  providers_used: [],
};

function id(...parts: string[]) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 28);
}

function compactText(value: string, maximum = 800) {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function emailDomain(email: string) {
  return normalizeDomain(email.split("@")[1]) ?? "";
}

async function mapBounded<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(items.length, Math.max(1, concurrency)) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        output[index] = await worker(items[index]);
      }
    }),
  );
  return output;
}

async function readOfficialContext(website: string, signal?: AbortSignal) {
  return runAbortableOperation<string | null>({
    timeoutMs: 6_000,
    parentSignal: signal,
    fallback: null,
    operation: async (requestSignal) => {
      const response = await fetch(website, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadgenOS/1.0)" },
        signal: requestSignal,
      });
      if (!response.ok) return null;
      const html = (await response.text()).slice(0, 150_000);
      return compactText(
        html
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
          .replace(/<[^>]+>/g, " "),
        1_500,
      );
    },
  });
}

function candidateForRoleResolution(source: SourceCandidate): LeadCandidate {
  return {
    company_name: source.companyName,
    company_domain: source.domain,
    company_segment: source.segmentVerification.detectedSegment ?? source.segmentVerification.selectedSegment,
    company_source_url: source.website,
    signals: [],
    lead_score: source.signalConfidence,
    icp_fit_score: source.segmentVerification.confidence,
    icp_fit_breakdown: { segment: source.segmentVerification },
    signal_summary: source.signalTitle,
    why_it_matters: source.signalDetail,
    why_now: source.signalDetail,
    outreach_hypothesis: source.signalDetail,
    evidence_quality: source.origin === "AI_HIRING" ? "confirmed_event" : "probable_event",
    card_signal_title: source.signalTitle,
    signal_type: "TECH_SIGNAL",
    origin_context: createLeadOriginContext(source.origin, {
      source_provider: source.origin === "AI_HIRING" ? "hh-web" : "contact_import",
      source_url: source.signalSourceUrl,
    }),
  };
}

function buildSourceContact(input: {
  campaign: LeadgenCampaign;
  company: LeadgenCompany;
  lead: LeadgenLead;
  source: SourceCandidate;
  people: PeopleDiscoveryResult;
  createdAt: string;
}) {
  if (!input.source.email) return null;
  const person = input.people.primary_person;
  const confirmedPerson = Boolean(person);
  const classification = classifyEvidenceBackedEmail({
    email: input.source.email,
    officialDomain: input.source.domain,
    confirmedPerson,
  });
  const level = getContactLevel({ confirmedPerson, classification });
  if (!level.ready) return null;
  const contact: LeadgenContact = {
    id: `contact-${id(input.campaign.id, input.source.email)}`,
    pipeline_run_id: input.campaign.pipeline_run_id,
    campaign_id: input.campaign.id,
    company_id: input.company.id,
    lead_id: input.lead.id,
    contact_type: "generic_email",
    full_name: person?.full_name ?? null,
    role_title: person?.role_title ?? null,
    department: classification === "DEPARTMENT" ? input.source.importedRole ?? null : null,
    email: input.source.email,
    linkedin_url: null,
    telegram_url: null,
    contact_url: null,
    source_url: input.source.emailSourceUrl ?? input.source.website,
    source_label: "Собственная база",
    confidence_score: classification === "DEPARTMENT" ? 78 : 70,
    is_primary: true,
    metadata: {
      email_classification: classification === "DEPARTMENT" ? "department_verified" : "company_generic_verified",
      normalized_email_classification: classification,
      email_status: classification === "DEPARTMENT" ? "department_email_ready" : "company_email_ready",
      email_mx_verified: input.source.origin === "AI_HIRING" ? true : undefined,
      email_domain_match_reason: input.source.origin === "AI_HIRING" ? "official_domain" : undefined,
      contact_level: level.level,
      message_mode: confirmedPerson ? "personal" : classification === "DEPARTMENT" ? "department" : "generic_routing",
      entry_role: confirmedPerson ? "best_outreach_entry" : "fallback_entry",
      imported_identity_unverified: Boolean(input.source.importedName),
      people_discovery: input.people,
    },
    created_at: input.createdAt,
  };
  const copy = buildEmailOutreach({
    companyName: input.source.companyName,
    companyWebsite: input.source.website,
    personName: person?.full_name ?? null,
    personRole: person?.role_title ?? null,
    contact,
    readiness: "fallback_ready",
    whyNow: input.source.signalDetail,
    selectionReason: person
      ? `Подтверждён ${person.full_name}${person.role_title ? `, ${person.role_title}` : ""}; письмо доставляется через лучший найденный корпоративный адрес.`
      : "Используется лучший найденный корпоративный адрес; конкретный получатель не подтверждён.",
    signalType: input.source.signalType,
    signalTitle: input.source.signalTitle,
    signalDetail: input.source.signalDetail,
    signalSourceUrl: input.source.signalSourceUrl,
    signalConfidence: input.source.signalConfidence,
    verticalId: input.source.segmentVerification.selectedSegment,
  });
  contact.metadata.email_subject = copy.subject;
  contact.metadata.email_body = copy.body;
  contact.metadata.email_quality = copy.quality as unknown as Record<string, number> | null;
  contact.metadata.email_quality_gate_passed = copy.qualityGatePassed;
  contact.metadata.email_generation_attempts = copy.generationAttempts;
  contact.metadata.email_copy_review_status = copy.copyReviewStatus;
  contact.metadata.email_guide_assignment = copy.guideAssignment;
  return contact;
}

async function buildSourceRecords(
  campaign: LeadgenCampaign,
  source: SourceCandidate,
  index: number,
  signal?: AbortSignal,
) {
  const createdAt = campaign.created_at;
  const candidate = candidateForRoleResolution(source);
  const decisionMaker = discoverDecisionMaker({
    candidate,
    signalType: "TECH_SIGNAL",
    preferredRoles: getVerticalProfile(campaign.vertical_id).targetRoles,
  });
  const companyId = `company-${id(campaign.id, source.domain)}`;
  const leadId = `lead-${id(campaign.id, source.domain, String(index))}`;
  const company: LeadgenCompany = {
    id: companyId,
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    company_name: source.companyName,
    company_domain: source.domain,
    company_segment: String(source.segmentVerification.detectedSegment ?? campaign.vertical_id),
    source: source.origin === "AI_HIRING" ? "ai_hiring" : "imported_base",
    source_url: source.signalSourceUrl,
    source_label: source.origin === "AI_HIRING" ? "Публичная вакансия" : "Собственная база",
    signal_type: source.signalType as unknown as SignalType,
    discovery_query: null,
    matched_signal_count: 1,
    lead_score: source.signalConfidence,
    icp_fit_score: source.segmentVerification.confidence,
    confidence_score: Math.min(source.signalConfidence, source.segmentVerification.confidence),
    country: "Россия",
    industry: source.segmentVerification.detectedSegment,
    company_size: null,
    linkedin_url: null,
    metadata: {
      vertical_id: campaign.vertical_id,
      official_website: source.website,
      resolved_official_domain: source.domain,
      official_website_status: "confirmed",
      official_website_source_url: source.website,
      official_website_confidence: 90,
      segment_verification: source.segmentVerification,
      decision_maker: decisionMaker,
      origin_context: candidate.origin_context,
    },
    origin_context: candidate.origin_context,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const storedSignal: LeadgenSignal = {
    id: `signal-${id(leadId, source.signalSourceUrl)}`,
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    lead_id: leadId,
    company_id: companyId,
    signal_type: source.signalType as unknown as SignalType,
    signal_title: compactText(source.signalTitle, 220),
    signal_detail: compactText(source.signalDetail),
    signal_source_label: source.origin === "AI_HIRING" ? "Публичная вакансия" : "Контекст собственной базы",
    source_url: source.signalSourceUrl,
    confidence_score: source.signalConfidence,
    found_at: createdAt,
    created_at: createdAt,
  };
  const lead: LeadgenLead = {
    id: leadId,
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    company_id: companyId,
    company_name: source.companyName,
    company_domain: source.domain,
    company_segment: company.company_segment,
    contact_channel: source.email ? "general-email" : null,
    contact_label: source.email ? "Рабочий email" : null,
    contact_value: source.email,
    company_source_url: source.signalSourceUrl,
    lead_score: source.signalConfidence,
    icp_fit_score: source.segmentVerification.confidence,
    signal_title: storedSignal.signal_title,
    signal_detail: storedSignal.signal_detail,
    signal_source_label: storedSignal.signal_source_label,
    hook: source.signalTitle,
    message: "",
    follow_up: "",
    status: "new",
    created_at: createdAt,
    updated_at: createdAt,
  };

  const research = await runAbortableOperation<CompanyResearchResult | null>({
    timeoutMs: 55_000,
    parentSignal: signal,
    fallback: null,
    operation: (requestSignal) => researchCompany(
      source.companyName,
      source.website,
      {
        type: storedSignal.signal_type,
        title: storedSignal.signal_title,
        detail: storedSignal.signal_detail,
        sourceUrl: storedSignal.source_url,
        confidence: storedSignal.confidence_score,
      },
      {
        campaign,
        company,
        lead,
        signals: [storedSignal],
        decisionMaker,
        createdAt,
        signal: requestSignal,
      },
    ),
  });
  const people = research?.peopleDiscovery ?? EMPTY_PEOPLE;
  company.metadata.people_discovery = people;
  if (research) {
    company.metadata.company_research = research.bundle;
  }
  const sourceContact = buildSourceContact({ campaign, company, lead, source, people, createdAt });
  const discoveredContacts: LeadgenContact[] = research?.contactDiscovery.contacts ?? [];
  const resolved = research?.contactDiscovery;
  if (resolved) {
    company.metadata.contact_discovery = {
      resolved_official_domain: resolved.resolved_official_domain,
      official_website: resolved.official_website,
      discovery_status: resolved.discovery_status,
      persona_search_status: resolved.persona_search_status,
      email_search_completed: resolved.email_search_completed,
      email_search_status: resolved.email_search_status,
      email_stop_reason: resolved.email_stop_reason,
      email_final_reason: resolved.email_final_reason,
      providers_used: resolved.providers_used,
      strategies_attempted: resolved.strategies_attempted,
      urls_inspected: resolved.urls_inspected.slice(0, 20),
      emails_extracted: resolved.emails_extracted?.slice(0, 10) ?? [],
      emails_rejected: resolved.emails_rejected?.slice(0, 10) ?? [],
    };
  }
  const uniqueContacts = [sourceContact, ...discoveredContacts]
    .filter((contact): contact is LeadgenContact => Boolean(contact))
    .filter((contact, contactIndex, all) => {
      const key = contact.email?.trim().toLowerCase() || contact.id;
      return all.findIndex((candidate) =>
        (candidate.email?.trim().toLowerCase() || candidate.id) === key) === contactIndex;
    });
  const confirmedEmail = uniqueContacts
    .filter(isConfirmedOutreachEmail)
    .sort((left, right) => right.confidence_score - left.confidence_score)[0] ?? null;
  const contact = confirmedEmail ?? sourceContact ?? null;
  const contacts = [
    ...uniqueContacts.filter((candidate) => !candidate.email),
    ...(contact ? [contact] : []),
  ];
  if (contact?.email) {
    lead.contact_channel = contact.contact_type === "work_email" ? "decision-maker" : "general-email";
    lead.contact_value = contact.email;
    lead.contact_label = contact.source_label;
    lead.message = String(contact.metadata.email_body ?? "");
  }
  return { company, lead, signal: storedSignal, contacts };
}

async function persistSourceCampaign(
  input: CampaignInput,
  origin: SourceCandidate["origin"],
  candidates: SourceCandidate[],
  signal?: AbortSignal,
) {
  if (!input.verticalId) throw new Error("Перед запуском выберите сегмент.");
  const createdAt = new Date().toISOString();
  const campaign: LeadgenCampaign = {
    id: `campaign-${origin.toLowerCase().replace("_", "-")}-${id(input.name, createdAt)}`,
    pipeline_run_id: `pipeline-${id(input.name, createdAt, "source")}`,
    name: input.name,
    requested_by: input.requestedBy,
    status: "completed",
    icp_label: getVerticalIcp(input.verticalId).label,
    offer_label: getVerticalProfile(input.verticalId).offer,
    created_at: createdAt,
    vertical_id: input.verticalId,
  };
  const knownEmails = new Set(
    (await getKnownRecipientEmails()).map((email) => email.trim().toLowerCase()),
  );
  const knownCompanies = await getRegisteredCompanyIdentities();
  const selected = candidates.filter((candidate) => {
    if (candidate.segmentVerification.match !== "MATCH") return false;
    if (candidate.email && knownEmails.has(candidate.email.toLowerCase())) return false;
    const identity = getCompanyIdentity({
      company_name: candidate.companyName,
      company_domain: candidate.domain,
      website: candidate.website,
    });
    return !knownCompanies.some((known) => Boolean(getDuplicateReason(identity, known)));
  });
  const records = [];
  for (const [index, candidate] of selected.slice(0, 20).entries()) {
    records.push(await buildSourceRecords(campaign, candidate, index, signal));
  }
  const result: LeadDiscoveryResult = {
    campaign,
    companies: records.map((record) => record.company),
    leads: records.map((record) => record.lead),
    signals: records.map((record) => record.signal),
    contacts: records.flatMap((record) => record.contacts),
    events: [],
  };
  const saved = await savePipelineResult({ result, notifications: [] });
  await registerDiscoveredCompanies(result.companies);
  const queue = await syncOutreachQueue(campaign.id);
  return { campaign, result, saved, queue, skipped: candidates.length - selected.length };
}

export async function runAiHiringCampaign({
  input,
  signal,
}: {
  input: CampaignInput & { verticalId: LeadgenVerticalId };
  signal?: AbortSignal;
}) {
  const canary = await runAiHiringLiveCanary({ verticalId: input.verticalId, signal });
  const candidates: SourceCandidate[] = canary.accepted
    .filter((item) => item.icpResult === "MATCH" && item.company && item.officialWebsite)
    .map((item) => ({
      origin: "AI_HIRING",
      companyName: item.company!,
      domain: normalizeDomain(item.officialWebsite)!,
      website: item.officialWebsite!,
      segmentVerification: {
        selectedSegment: input.verticalId,
        detectedSegment: input.verticalId,
        match: "MATCH",
        confidence: 85,
        evidence: [compactText(item.evidence ?? item.vacancyTitle, 500)],
      },
      signalType: "AI_AUTOMATION_HIRING_SIGNAL",
      signalTitle: item.vacancyTitle,
      signalDetail: item.evidence ?? item.whyRelevant ?? item.vacancyTitle,
      signalSourceUrl: item.sourceUrl,
      signalConfidence: 90,
      email: item.contactEmail,
      emailKind: item.contactKind,
      emailSourceUrl: item.contactSourceUrl,
    }));
  const persisted = await persistSourceCampaign(input, "AI_HIRING", candidates, signal);
  return { ...persisted, live: canary };
}

export async function runImportedCampaign({
  batchId,
  input,
  signal,
}: {
  batchId: string;
  input: CampaignInput & { verticalId: LeadgenVerticalId };
  signal?: AbortSignal;
}) {
  const rows = await getImportBatchRows(batchId);
  const resolved = await mapBounded(rows.slice(0, 50), 4, async (raw): Promise<SourceCandidate | null> => {
    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    const explicitDomain = normalizeDomain(
      typeof raw.domain === "string" && raw.domain
        ? raw.domain
        : typeof raw.website === "string" && raw.website
          ? raw.website
          : emailDomain(email),
    );
    if (!explicitDomain || !email || emailDomain(email) !== explicitDomain) return null;
    const website = `https://${explicitDomain}`;
    const officialContext = await readOfficialContext(website, signal);
    const companyName = typeof raw.company === "string" && raw.company.trim()
      ? raw.company.trim()
      : explicitDomain;
    const notes = typeof raw.notes === "string" ? compactText(raw.notes) : "";
    const segmentVerification = verifyCompanySegment({
      selectedSegment: input.verticalId,
      companyName,
      companySegment: officialContext,
      industry: officialContext,
      officialWebsite: website,
      signalSummary: notes || null,
      signalEvidence: notes || null,
      discoveryQuery: "imported base",
    });
    return {
      origin: "IMPORTED",
      companyName,
      domain: explicitDomain,
      website,
      segmentVerification,
      signalType: "IMPORTED_CONTEXT",
      signalTitle: notes ? "Контекст из собственной базы" : "Контакт из собственной базы",
      signalDetail: notes || "Компания и рабочий адрес предоставлены пользователем; коммерческий сигнал не подтверждён.",
      signalSourceUrl: website,
      signalConfidence: notes ? 70 : 40,
      email,
      emailKind: null,
      emailSourceUrl: website,
      importedName: typeof raw.full_name === "string" ? raw.full_name : null,
      importedRole: typeof raw.role === "string" ? raw.role : null,
    };
  });
  const candidates = resolved.filter((candidate): candidate is SourceCandidate => candidate !== null);
  const persisted = await persistSourceCampaign(input, "IMPORTED", candidates, signal);
  const summary = {
    rows: rows.length,
    candidates: candidates.length,
    qualified: persisted.result.companies.length,
    contacts: persisted.result.contacts.length,
    ready: persisted.queue.length,
  };
  await completeImportBatch({ batchId, campaignId: persisted.campaign.id, resultSummary: summary });
  return { ...persisted, importSummary: summary };
}
