import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  getCampaignDetailsByPipelineRunId,
  getRecentCampaigns,
} from "@/lib/leadgen/storage";
import { syncOutreachQueue } from "@/lib/leadgen/outreach-storage";
import { createLeadgenSearchProvider } from "@/lib/leadgen/search/leadgen-search-provider";
import { discoverCompanyEmails } from "@/lib/leadgen/email-discovery-engine";
import { buildEmailOutreach } from "@/lib/leadgen/email-outreach-builder";
import type {
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
} from "@/lib/leadgen/types";

function createRecordId(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451]+/gi, "-")
    .replace(/(^-|-$)/g, "");
}

function getOfficialWebsite(company: LeadgenCompany): string | null {
  if (typeof company.metadata.official_website === "string") {
    return company.metadata.official_website;
  }
  return company.company_domain ? `https://${company.company_domain}` : null;
}

function getDecisionMaker(company: LeadgenCompany): {
  persona: string | null;
  department: string | null;
} {
  const decisionMaker =
    company.metadata.decision_maker &&
    typeof company.metadata.decision_maker === "object"
      ? (company.metadata.decision_maker as Record<string, unknown>)
      : null;
  return {
    persona:
      typeof decisionMaker?.primary_persona === "string"
        ? decisionMaker.primary_persona
        : null,
    department:
      typeof decisionMaker?.department === "string"
        ? decisionMaker.department
        : null,
  };
}

function contactTypeForKind(
  kind: string,
): LeadgenContact["contact_type"] {
  return kind === "personal_work" ? "work_email" : "generic_email";
}

function emailStatusForKind(kind: string): string {
  if (kind === "personal_work") return "work_email_ready";
  if (
    ["sales", "commercial", "marketing", "partnership", "press", "support"].includes(
      kind,
    )
  ) {
    return "department_email_ready";
  }
  return "company_email_ready";
}

export async function reprocessLatestCampaignEmailDiscovery({
  dryRun = true,
}: {
  dryRun?: boolean;
}) {
  const [latest] = await getRecentCampaigns(1);
  if (!latest) throw new Error("No campaign is available for email reprocessing.");
  const details = await getCampaignDetailsByPipelineRunId(latest.pipeline_run_id);
  if (!details) throw new Error("Latest campaign details are unavailable.");

  const existingEmailCompanyIds = new Set(
    details.contacts
      .filter((contact) => Boolean(contact.email))
      .map((contact) => contact.company_id),
  );
  const targets = details.companies.filter(
    (company) =>
      Boolean(getOfficialWebsite(company) && company.company_domain) &&
      !existingEmailCompanyIds.has(company.id),
  );
  const searchProvider = createLeadgenSearchProvider();
  const results = [];

  for (const company of targets) {
    const website = getOfficialWebsite(company)!;
    const lead =
      details.leads.find((item) => item.company_id === company.id) ?? null;
    const signal =
      details.signals.find((item) => item.company_id === company.id) ?? null;
    const decisionMaker = getDecisionMaker(company);
    const discovery = await discoverCompanyEmails({
      rawInput: {
        companyId: company.id,
        companyName: company.company_name,
        officialWebsiteUrl: website,
        officialDomain: company.company_domain!,
        commercialSignalSourceUrl: signal?.source_url ?? null,
        targetPersona: decisionMaker.persona,
        targetDepartment: decisionMaker.department,
      },
      searchProvider,
    });
    results.push({ company, lead, signal, discovery });
  }

  if (!dryRun) {
    const supabase = createSupabaseServerClient();
    const now = new Date().toISOString();
    for (const { company, lead, signal, discovery } of results) {
      const decisionMaker = getDecisionMaker(company);
      const website = getOfficialWebsite(company)!;
      const contactDiscovery =
        company.metadata.contact_discovery &&
        typeof company.metadata.contact_discovery === "object"
          ? (company.metadata.contact_discovery as Record<string, unknown>)
          : {};
      const metadata = {
        ...company.metadata,
        contact_discovery: {
          ...contactDiscovery,
          email_pages_audit: discovery.pages,
          ranked_email_candidates: discovery.candidates,
          contact_forms_found: discovery.forms,
          urls_inspected: discovery.urlsInspected,
          queries_executed: discovery.queriesExecuted,
          email_final_reason: discovery.finalReason,
          email_search_completed: true,
          email_search_status: discovery.bestEmail
            ? emailStatusForKind(discovery.bestEmail.kind)
            : discovery.finalReason,
          email_stop_reason: discovery.bestEmail
            ? "verified_email_found"
            : discovery.finalReason,
        },
        updated_at: now,
      };
      const { error: companyError } = await supabase
        .from("leadgen_companies")
        .update({ metadata, updated_at: now })
        .eq("id", company.id);
      if (companyError) throw companyError;

      if (!discovery.bestEmail || !lead) continue;
      const email = discovery.bestEmail;
      const contactType = contactTypeForKind(email.kind);
      const draft = buildEmailOutreach({
        companyName: company.company_name,
        companyWebsite: discovery.input.officialWebsiteUrl,
        companyDescription: null,
        industry: company.industry ?? company.company_segment,
        personName: null,
        personRole: decisionMaker.persona,
        contact: {
          id: "reprocess-preview",
          pipeline_run_id: company.pipeline_run_id,
          campaign_id: company.campaign_id,
          company_id: company.id,
          lead_id: lead.id,
          contact_type: contactType,
          full_name: null,
          role_title: decisionMaker.persona,
          department: decisionMaker.department,
          email: email.email,
          linkedin_url: null,
          telegram_url: null,
          contact_url: null,
          source_url: email.sourceUrl,
          source_label: email.sourceType,
          confidence_score: Math.min(99, Math.max(55, email.score)),
          is_primary: true,
          metadata: {},
          created_at: now,
        },
        readiness: contactType === "work_email" ? "outreach_ready" : "fallback_ready",
        whyNow: signal?.signal_detail ?? lead.signal_detail,
        selectionReason: lead.hook,
        signalType: signal?.signal_type,
        signalTitle: signal?.signal_title,
        signalDetail: signal?.signal_detail,
        signalSourceUrl: signal?.source_url ?? null,
        signalConfidence: signal?.confidence_score ?? null,
      });
      const contact: LeadgenContact = {
        id: createRecordId("contact", lead.id, "email-reprocess", email.email),
        pipeline_run_id: company.pipeline_run_id,
        campaign_id: company.campaign_id,
        company_id: company.id,
        lead_id: lead.id,
        contact_type: contactType,
        full_name: null,
        role_title: decisionMaker.persona,
        department: decisionMaker.department,
        email: email.email,
        linkedin_url: null,
        telegram_url: null,
        contact_url: null,
        source_url: email.sourceUrl,
        source_label: email.sourceType,
        confidence_score: Math.min(99, Math.max(55, email.score)),
        is_primary: true,
        metadata: {
          extraction: "production_email_discovery_reprocess",
          email_kind: email.kind,
          email_status: emailStatusForKind(email.kind),
          email_validation_status: email.validationStatus,
          email_domain_match_reason: email.domainMatchReason,
          email_mx_verified: true,
          email_score: email.score,
          email_subject: draft.subject,
          email_body: draft.body,
          email_micro_value: draft.microValue,
          email_quality: draft.quality,
          email_quality_gate_passed: draft.qualityGatePassed,
          email_generation_attempts: draft.generationAttempts,
          email_copy_review_status: draft.copyReviewStatus,
          message_mode: draft.messageMode,
          outreach_ready: draft.outreachReady,
        },
        created_at: now,
      };
      const { error: contactError } = await supabase
        .from("leadgen_contacts")
        .upsert(contact, { onConflict: "id" });
      if (contactError) throw contactError;
      const leadPatch: Partial<LeadgenLead> = {
        company_domain: company.company_domain,
        company_source_url: website,
        contact_channel:
          contactType === "work_email" ? "decision-maker" : "general-email",
        contact_label:
          email.kind === "general" ? "General company email" : email.kind,
        contact_value: email.email,
        status: "new",
        updated_at: now,
      };
      const { error: leadError } = await supabase
        .from("leadgen_leads")
        .update(leadPatch)
        .eq("id", lead.id);
      if (leadError) throw leadError;
    }
    await syncOutreachQueue(latest.id);
  }

  return {
    mode: dryRun
      ? "dry_run_no_persistence_no_send"
      : "persisted_no_send",
    campaign: {
      id: latest.id,
      created_at: latest.created_at,
    },
    before: {
      official_sites: details.companies.filter((company) =>
        Boolean(getOfficialWebsite(company)),
      ).length,
      emails: existingEmailCompanyIds.size,
    },
    processed: results.length,
    after: {
      official_sites: details.companies.filter((company) =>
        Boolean(getOfficialWebsite(company)),
      ).length,
      emails:
        existingEmailCompanyIds.size +
        results.filter(({ discovery }) => Boolean(discovery.bestEmail)).length,
    },
    companies: results.map(({ company, discovery }) => ({
      company_id: company.id,
      company_name: company.company_name,
      official_website: discovery.input.officialWebsiteUrl,
      pages_attempted: discovery.pages.length,
      pages_opened: discovery.pages.filter((page) => page.opened).length,
      pages: discovery.pages,
      candidates: discovery.candidates,
      rejected: discovery.rejected,
      best_email: discovery.bestEmail,
      forms: discovery.forms,
      reason: discovery.finalReason,
    })),
  };
}
