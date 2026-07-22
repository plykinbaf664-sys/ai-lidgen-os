import {
  isFallbackEmailContact,
  isSendableEmailContact,
} from "@/lib/leadgen/contact-channel-ranking";
import { normalizeRecipientEmail } from "@/lib/leadgen/company-identity";
import type {
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
  LeadgenSignal,
  OutreachEmailStatus,
  OutreachMessageMode,
  OutreachQueueEntry,
} from "@/lib/leadgen/types";

const readyEmailStatuses = new Set([
  "personal_email_ready",
  "work_email_ready",
  "department_email_ready",
  "company_email_ready",
]);

export function getOutreachQueueId(contactId: string): string {
  return `outreach-${contactId}`;
}

export function getOutreachIdempotencyKey({
  campaignId,
  email,
  messageVersion = 1,
}: {
  campaignId: string;
  email: string;
  messageVersion?: number;
}): string {
  return [
    normalizeRecipientEmail(email),
    campaignId,
    String(messageVersion),
  ].join(":");
}

export function isEmailReadyContact(contact: LeadgenContact): boolean {
  if (!contact.email) {
    return false;
  }

  if (!isSendableEmailContact(contact) && !isFallbackEmailContact(contact)) {
    return false;
  }

  const emailStatus =
    typeof contact.metadata.email_status === "string"
      ? contact.metadata.email_status
      : null;

  return emailStatus ? readyEmailStatuses.has(emailStatus) : true;
}

function getMessageMode(contact: LeadgenContact): OutreachMessageMode {
  if (
    contact.metadata.message_mode === "personal" ||
    contact.metadata.message_mode === "department" ||
    contact.metadata.message_mode === "generic_routing"
  ) {
    return contact.metadata.message_mode;
  }

  return contact.contact_type === "work_email" ? "personal" : "generic_routing";
}

export function buildOutreachQueueEntry({
  contact,
  lead,
  company,
  signal,
}: {
  contact: LeadgenContact;
  lead: LeadgenLead | null;
  company: LeadgenCompany | null;
  signal: LeadgenSignal | null;
}): OutreachQueueEntry | null {
  if (!isEmailReadyContact(contact) || !contact.email) {
    return null;
  }

  const subject =
    typeof contact.metadata.email_subject === "string"
      ? contact.metadata.email_subject.trim()
      : "";
  const body =
    typeof contact.metadata.email_body === "string"
      ? contact.metadata.email_body.trim()
      : "";

  if (!subject || !body) {
    return null;
  }

  const queue = contact.metadata.outreach_queue;
  const status: OutreachEmailStatus = queue?.status ?? "draft";
  const id = queue?.id ?? getOutreachQueueId(contact.id);
  const idempotencyKey =
    queue?.idempotency_key ??
    getOutreachIdempotencyKey({
      campaignId: contact.campaign_id,
      email: contact.email,
    });

  return {
    id,
    contact_id: contact.id,
    lead_id: contact.lead_id,
    campaign_id: contact.campaign_id,
    company_id: contact.company_id,
    company_name:
      lead?.company_name ?? company?.company_name ?? contact.full_name ?? "Компания",
    recipient_name: contact.full_name,
    recipient_role: contact.role_title,
    email: contact.email,
    email_type: contact.contact_type,
    email_source_url: contact.source_url,
    email_source_label: contact.source_label,
    readiness: String(contact.metadata.email_status ?? "email_ready"),
    signal: {
      type: signal?.signal_type ?? company?.signal_type ?? null,
      title: signal?.signal_title ?? lead?.signal_title ?? null,
      detail: signal?.signal_detail ?? lead?.signal_detail ?? null,
      source_url: signal?.source_url ?? lead?.company_source_url ?? null,
      confidence_score:
        signal?.confidence_score ?? company?.confidence_score ?? null,
    },
    subject: queue?.subject ?? subject,
    body: queue?.body ?? body,
    message_mode: getMessageMode(contact),
    status,
    idempotency_key: idempotencyKey,
    normalized_recipient_email: normalizeRecipientEmail(contact.email),
    message_version: 1,
    send_attempts: queue?.send_attempts ?? 0,
    last_error: queue?.last_error ?? null,
    provider: queue?.provider ?? null,
    provider_message_id: queue?.provider_message_id ?? null,
    copy_quality:
      (contact.metadata.email_quality as Record<string, number> | null | undefined) ?? null,
    quality_gate_passed: contact.metadata.email_quality_gate_passed === true,
    copy_review_status:
      contact.metadata.email_copy_review_status === "ready"
        ? "ready"
        : "needs_manual_copy_review",
    generation_attempts:
      typeof contact.metadata.email_generation_attempts === "number"
        ? contact.metadata.email_generation_attempts
        : 0,
    micro_value:
      (contact.metadata.email_micro_value as OutreachQueueEntry["micro_value"]) ?? null,
    created_at: contact.created_at,
    approved_at: queue?.approved_at ?? null,
    queued_at: queue?.queued_at ?? null,
    sent_at: queue?.sent_at ?? null,
    follow_up_due_at: queue?.follow_up_due_at ?? null,
    follow_up_status: queue?.follow_up_status ?? null,
    history: queue?.history ?? [],
  };
}
