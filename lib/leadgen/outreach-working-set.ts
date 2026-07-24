import type {
  LeadgenCompany,
  OutreachEmailStatus,
  OutreachQueueEntry,
} from "@/lib/leadgen/types";

const TECHNICAL_EMAIL_ARTIFACT_PATTERN =
  /^(?:fonts\.[a-z]{1,8}@[a-z]{1,8}\.com|api\.[a-z]{1,8}@[a-z]{1,8}\.com)$/i;

export function isTechnicalEmailArtifact(value: string): boolean {
  return TECHNICAL_EMAIL_ARTIFACT_PATTERN.test(value.trim());
}

const WORKING_STATUSES = new Set<OutreachEmailStatus>([
  "needs_review",
  "approved",
  "queued",
  "sending",
  "sent",
  "failed",
]);

const NON_COMPANY_HOSTS = new Set([
  "hh.ru",
  "www.hh.ru",
  "avito.ru",
  "www.avito.ru",
  "linkedin.com",
  "www.linkedin.com",
  "rusprofile.ru",
  "www.rusprofile.ru",
]);

export type OutreachSkipReason =
  | "official_site_missing"
  | "email_not_found"
  | "contact_form_only"
  | "site_unreachable"
  | "outreach_not_created";

export type OutreachSkippedCompany = {
  company_id: string;
  company_name: string;
  reason: OutreachSkipReason;
  official_website_url: string | null;
};

export type BulkApprovalSkipReason =
  | "missing_email"
  | "missing_subject"
  | "missing_body"
  | "missing_official_website"
  | "quality_gate_failed"
  | "manual_review_required"
  | "already_approved"
  | "already_queued"
  | "already_sent"
  | "failed_requires_retry"
  | "invalid_status"
  | "already_contacted"
  | "stop_list"
  | "blocking_error"
  | "technical_email_artifact";

function normalizeWebsite(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`,
    );
    if (NON_COMPANY_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getConfirmedOfficialWebsite(company: LeadgenCompany) {
  const metadataWebsite = normalizeWebsite(company.metadata.official_website);
  if (
    metadataWebsite &&
    company.metadata.official_website_status !== "not_found"
  ) {
    return metadataWebsite;
  }

  const domainWebsite = normalizeWebsite(company.company_domain);
  const sourceWebsite = normalizeWebsite(company.source_url);
  if (!domainWebsite || !sourceWebsite) return null;
  try {
    return new URL(domainWebsite).hostname === new URL(sourceWebsite).hostname
      ? sourceWebsite
      : null;
  } catch {
    return null;
  }
}

export function isCanonicalOutreachWorkItem(entry: OutreachQueueEntry) {
  return (
    entry.message_kind === "initial" &&
    WORKING_STATUSES.has(entry.status) &&
    Boolean(entry.company_id) &&
    Boolean(entry.lead_id) &&
    Boolean(entry.id) &&
    Boolean(normalizeWebsite(entry.company_website)) &&
    Boolean(entry.email?.trim()) &&
    (entry.status === "sent" || !isTechnicalEmailArtifact(entry.email)) &&
    Boolean(entry.subject?.trim()) &&
    Boolean(entry.body?.trim())
  );
}

export function getBulkApprovalBaseReason(
  entry: OutreachQueueEntry,
): BulkApprovalSkipReason | null {
  if (!entry.email?.trim()) return "missing_email";
  if (!entry.subject?.trim()) return "missing_subject";
  if (!entry.body?.trim()) return "missing_body";
  if (!normalizeWebsite(entry.company_website)) return "missing_official_website";
  if (entry.status === "approved") return "already_approved";
  if (["queued", "sending"].includes(entry.status)) return "already_queued";
  if (entry.status === "sent") return "already_sent";
  if (isTechnicalEmailArtifact(entry.email)) return "technical_email_artifact";
  if (entry.status === "failed") return "failed_requires_retry";
  if (entry.status !== "needs_review") return "invalid_status";
  if (entry.quality_gate_passed !== true) return "quality_gate_failed";
  if (entry.copy_review_status === "needs_manual_copy_review") {
    return "manual_review_required";
  }
  if (entry.last_error) return "blocking_error";
  return null;
}

export function getOutreachSkipReason(
  company: LeadgenCompany,
  hasEmail: boolean,
  hasOutreach: boolean,
): OutreachSkipReason | null {
  const officialWebsite = getConfirmedOfficialWebsite(company);
  if (!officialWebsite) {
    const discovery = company.metadata.contact_discovery;
    const reason =
      discovery && typeof discovery === "object"
        ? (discovery as Record<string, unknown>).email_final_reason
        : null;
    return reason === "official_site_unreachable"
      ? "site_unreachable"
      : "official_site_missing";
  }
  if (hasOutreach) return null;
  if (!hasEmail) {
    const discovery = company.metadata.contact_discovery;
    const forms =
      discovery && typeof discovery === "object"
        ? (discovery as Record<string, unknown>).contact_forms_found
        : null;
    return Array.isArray(forms) && forms.length > 0
      ? "contact_form_only"
      : "email_not_found";
  }
  return hasOutreach ? null : "outreach_not_created";
}

export function countOutreachStatuses(entries: OutreachQueueEntry[]) {
  return {
    total: entries.length,
    needs_review: entries.filter((entry) => entry.status === "needs_review").length,
    approved: entries.filter((entry) => entry.status === "approved").length,
    queued: entries.filter((entry) => entry.status === "queued").length,
    sending: entries.filter((entry) => entry.status === "sending").length,
    sent: entries.filter((entry) => entry.status === "sent").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
  };
}
