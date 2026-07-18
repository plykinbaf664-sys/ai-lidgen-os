import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/client";
import { normalizeLeadgenStrings } from "@/lib/leadgen/text-normalization";
import type {
  DiscoverySuccessMetrics,
  LeadgenCampaign,
  LeadgenCampaignDetails,
  LeadgenCampaignSummary,
  LeadgenCompany,
  LeadgenContact,
  LeadgenEvent,
  LeadgenLead,
  LeadgenSignal,
  LeadDiscoveryResult,
  MockPipelineResult,
  OutreachEmailStatus,
  OutreachQueueEntry,
  TelegramNotification,
} from "@/lib/leadgen/types";
import {
  buildOutreachQueueEntry,
  getOutreachIdempotencyKey,
  getOutreachQueueId,
  isEmailReadyContact,
} from "@/lib/leadgen/outreach-queue";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

type SavePipelineInput = {
  result: LeadDiscoveryResult | MockPipelineResult;
  notifications: TelegramNotification[];
};

type SavePipelineResult = {
  pipeline_run_id: string;
  campaign_id: string;
  companies_count: number;
  contacts_count: number;
  leads_count: number;
  signals_count: number;
  events_count: number;
  notifications_count: number;
  discovery_metrics?: DiscoverySuccessMetrics;
};

type StoredCampaign = Pick<
  LeadgenCampaign,
  "id" | "pipeline_run_id" | "name" | "status" | "created_at"
>;

type StoredLeadCampaignRef = Pick<
  LeadgenLead,
  "campaign_id" | "contact_value"
>;

type StoredCompanyCampaignRef = Pick<LeadgenCompany, "campaign_id">;
type StoredContactCampaignRef = Pick<LeadgenContact, "campaign_id">;

function isMissingRelationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybeError = error as {
    code?: unknown;
    message?: unknown;
  };
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message =
    typeof maybeError.message === "string"
      ? maybeError.message.toLowerCase()
      : "";

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("leadgen_companies") && message.includes("not") ||
    message.includes("leadgen_contacts") && message.includes("not")
  );
}

async function saveCampaign(
  supabase: SupabaseServerClient,
  campaign: LeadgenCampaign,
) {
  const { error } = await supabase.from("leadgen_campaigns").insert(campaign);

  if (error) {
    throw error;
  }
}

async function saveLeads(supabase: SupabaseServerClient, leads: LeadgenLead[]) {
  if (leads.length === 0) {
    return;
  }

  const { error } = await supabase.from("leadgen_leads").insert(leads);

  if (error) {
    throw error;
  }
}

async function saveCompanies(
  supabase: SupabaseServerClient,
  companies: LeadgenCompany[],
) {
  if (companies.length === 0) {
    return;
  }

  const { error } = await supabase.from("leadgen_companies").insert(companies);

  if (error) {
    throw error;
  }
}

async function saveContacts(
  supabase: SupabaseServerClient,
  contacts: LeadgenContact[],
) {
  if (contacts.length === 0) {
    return;
  }

  const { error } = await supabase.from("leadgen_contacts").insert(contacts);

  if (error) {
    throw error;
  }
}

async function saveEvents(
  supabase: SupabaseServerClient,
  events: LeadgenEvent[],
) {
  if (events.length === 0) {
    return;
  }

  const { error } = await supabase.from("leadgen_events").insert(events);

  if (error) {
    throw error;
  }
}

async function saveSignals(
  supabase: SupabaseServerClient,
  signals: LeadgenSignal[],
) {
  if (signals.length === 0) {
    return;
  }

  const { error } = await supabase.from("leadgen_signals").insert(signals);

  if (error) {
    throw error;
  }
}

async function saveTelegramNotifications(
  supabase: SupabaseServerClient,
  notifications: TelegramNotification[],
) {
  if (notifications.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("leadgen_telegram_notifications")
    .insert(notifications);

  if (error) {
    throw error;
  }
}

async function rollbackPipelineResult(
  supabase: SupabaseServerClient,
  campaignId: string,
): Promise<string | null> {
  const { error } = await supabase
    .from("leadgen_campaigns")
    .delete()
    .eq("id", campaignId);

  if (error) {
    return error.message;
  }

  return null;
}

export async function savePipelineResult({
  result,
  notifications,
}: SavePipelineInput): Promise<SavePipelineResult> {
  const supabase = createSupabaseServerClient();
  const normalizedResult = normalizeLeadgenStrings(result, "storage.save.result");
  const normalizedNotifications = normalizeLeadgenStrings(
    notifications,
    "storage.save.notifications",
  );

  try {
    await saveCampaign(supabase, normalizedResult.campaign);
    await saveCompanies(supabase, normalizedResult.companies ?? []);
    await saveLeads(supabase, normalizedResult.leads);
    await saveSignals(supabase, normalizedResult.signals);
    await saveContacts(supabase, normalizedResult.contacts ?? []);
    await saveEvents(supabase, normalizedResult.events);
    await saveTelegramNotifications(supabase, normalizedNotifications);
  } catch (error) {
    const rollbackErrorMessage = await rollbackPipelineResult(
      supabase,
      normalizedResult.campaign.id,
    );

    if (rollbackErrorMessage) {
      throw new Error(
        `Pipeline save failed. Rollback also failed: ${rollbackErrorMessage}`,
        { cause: error },
      );
    }

    throw error;
  }

  return {
    pipeline_run_id: normalizedResult.campaign.pipeline_run_id,
    campaign_id: normalizedResult.campaign.id,
    companies_count:
      normalizedResult.companies?.length ?? normalizedResult.leads.length,
    contacts_count: normalizedResult.contacts?.length ?? 0,
    leads_count: normalizedResult.leads.length,
    signals_count: normalizedResult.signals.length,
    events_count: normalizedResult.events.length,
    notifications_count: normalizedNotifications.length,
    discovery_metrics:
      "discovery_metrics" in normalizedResult
        ? normalizedResult.discovery_metrics
        : undefined,
  };
}

export async function getRecentCampaigns(
  limit = 10,
): Promise<LeadgenCampaignSummary[]> {
  const supabase = createSupabaseServerClient();
  const { data: campaigns, error: campaignsError } = await supabase
    .from("leadgen_campaigns")
    .select("id,pipeline_run_id,name,status,created_at")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<StoredCampaign[]>();

  if (campaignsError) {
    throw campaignsError;
  }

  if (!campaigns || campaigns.length === 0) {
    return [];
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const [
    { data: companies, error: companiesError },
    { data: contacts, error: contactsError },
    { data: leads, error: leadsError },
  ] = await Promise.all([
    supabase
      .from("leadgen_companies")
      .select("campaign_id")
      .in("campaign_id", campaignIds)
      .returns<StoredCompanyCampaignRef[]>(),
    supabase
      .from("leadgen_contacts")
      .select("campaign_id")
      .in("campaign_id", campaignIds)
      .returns<StoredContactCampaignRef[]>(),
    supabase
      .from("leadgen_leads")
      .select("campaign_id,contact_value")
      .in("campaign_id", campaignIds)
      .returns<StoredLeadCampaignRef[]>(),
  ]);

  if (companiesError && !isMissingRelationError(companiesError)) {
    throw companiesError;
  }

  if (leadsError) {
    throw leadsError;
  }

  if (contactsError && !isMissingRelationError(contactsError)) {
    throw contactsError;
  }

  const companyCounts = new Map<string, number>();
  const legacyLeadCounts = new Map<string, number>();
  const contactCounts = new Map<string, number>();

  for (const contact of contactsError ? [] : contacts ?? []) {
    contactCounts.set(
      contact.campaign_id,
      (contactCounts.get(contact.campaign_id) ?? 0) + 1,
    );
  }

  for (const company of companiesError ? [] : companies ?? []) {
    companyCounts.set(
      company.campaign_id,
      (companyCounts.get(company.campaign_id) ?? 0) + 1,
    );
  }

  for (const lead of leads ?? []) {
    legacyLeadCounts.set(
      lead.campaign_id,
      (legacyLeadCounts.get(lead.campaign_id) ?? 0) + 1,
    );

    if (!contactCounts.has(lead.campaign_id) && lead.contact_value) {
      contactCounts.set(
        lead.campaign_id,
        (contactCounts.get(lead.campaign_id) ?? 0) + 1,
      );
    }
  }

  return normalizeLeadgenStrings(campaigns.map((campaign) => ({
    ...campaign,
    companies_count:
      companyCounts.get(campaign.id) ?? legacyLeadCounts.get(campaign.id) ?? 0,
    leads_count: legacyLeadCounts.get(campaign.id) ?? 0,
    contacts_count: contactCounts.get(campaign.id) ?? 0,
  })), "storage.read.campaigns");
}

export async function getCampaignDetails(
  campaignId: string,
): Promise<LeadgenCampaignDetails | null> {
  const supabase = createSupabaseServerClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("leadgen_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single<LeadgenCampaign>();

  if (campaignError) {
    if (campaignError.code === "PGRST116") {
      return null;
    }

    throw campaignError;
  }

  const [
    { data: companies, error: companiesError },
    { data: contacts, error: contactsError },
    { data: leads, error: leadsError },
    { data: signals, error: signalsError },
    { data: events, error: eventsError },
    { data: notifications, error: notificationsError },
  ] = await Promise.all([
    supabase
      .from("leadgen_companies")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("lead_score", { ascending: false })
      .returns<LeadgenCompany[]>(),
    supabase
      .from("leadgen_contacts")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("is_primary", { ascending: false })
      .order("confidence_score", { ascending: false })
      .returns<LeadgenContact[]>(),
    supabase
      .from("leadgen_leads")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .returns<LeadgenLead[]>(),
    supabase
      .from("leadgen_signals")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("confidence_score", { ascending: false })
      .returns<LeadgenSignal[]>(),
    supabase
      .from("leadgen_events")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .returns<LeadgenEvent[]>(),
    supabase
      .from("leadgen_telegram_notifications")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .returns<TelegramNotification[]>(),
  ]);

  if (companiesError && !isMissingRelationError(companiesError)) {
    throw companiesError;
  }

  if (leadsError) {
    throw leadsError;
  }

  if (contactsError && !isMissingRelationError(contactsError)) {
    throw contactsError;
  }

  if (signalsError) {
    throw signalsError;
  }

  if (eventsError) {
    throw eventsError;
  }

  if (notificationsError) {
    throw notificationsError;
  }

  const storedCompanies = companiesError ? [] : companies ?? [];
  const storedContacts = contactsError ? [] : contacts ?? [];
  const storedLeads = leads ?? [];
  const storedSignals = signals ?? [];
  const storedEvents = events ?? [];
  const storedNotifications = notifications ?? [];

  return normalizeLeadgenStrings({
    campaign,
    companies: storedCompanies,
    contacts: storedContacts,
    leads: storedLeads,
    signals: storedSignals,
    events: storedEvents,
    notifications: storedNotifications,
    stats: {
      companies_count:
        storedCompanies.length > 0 ? storedCompanies.length : storedLeads.length,
      leads_count: storedLeads.length,
      contacts_count:
        storedContacts.length > 0
          ? storedContacts.length
          : storedLeads.filter((lead) => lead.contact_value).length,
      signals_count: storedSignals.length,
      notifications_count: storedNotifications.length,
      events_count: storedEvents.length,
    },
  }, "storage.read.details");
}

function getContactIdFromOutreachId(id: string): string {
  return id.startsWith("outreach-") ? id.slice("outreach-".length) : id;
}

async function getContactByOutreachId(
  supabase: SupabaseServerClient,
  id: string,
): Promise<LeadgenContact | null> {
  const contactId = getContactIdFromOutreachId(id);
  const { data, error } = await supabase
    .from("leadgen_contacts")
    .select("*")
    .eq("id", contactId)
    .single<LeadgenContact>();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }

    throw error;
  }

  return data;
}

async function updateContactOutreachQueue(
  supabase: SupabaseServerClient,
  contact: LeadgenContact,
  patch: Partial<NonNullable<LeadgenContact["metadata"]["outreach_queue"]>>,
  status?: OutreachEmailStatus,
  note?: string,
): Promise<LeadgenContact> {
  const now = new Date().toISOString();
  const currentQueue = contact.metadata.outreach_queue;
  const nextStatus = status ?? patch.status ?? currentQueue?.status ?? "draft";
  const nextQueue = {
    id: currentQueue?.id ?? getOutreachQueueId(contact.id),
    status: nextStatus,
    subject:
      patch.subject ??
      currentQueue?.subject ??
      (typeof contact.metadata.email_subject === "string"
        ? contact.metadata.email_subject
        : ""),
    body:
      patch.body ??
      currentQueue?.body ??
      (typeof contact.metadata.email_body === "string"
        ? contact.metadata.email_body
        : ""),
    idempotency_key:
      patch.idempotency_key ??
      currentQueue?.idempotency_key ??
      [contact.campaign_id, contact.lead_id, contact.email?.toLowerCase() ?? ""].join(
        ":",
      ),
    approved_at:
      patch.approved_at ??
      (nextStatus === "approved" ? now : currentQueue?.approved_at ?? null),
    queued_at:
      patch.queued_at ??
      (nextStatus === "queued" ? now : currentQueue?.queued_at ?? null),
    sent_at:
      patch.sent_at ??
      (nextStatus === "sent" ? now : currentQueue?.sent_at ?? null),
    provider: patch.provider ?? currentQueue?.provider ?? null,
    provider_message_id:
      patch.provider_message_id ?? currentQueue?.provider_message_id ?? null,
    send_attempts: patch.send_attempts ?? currentQueue?.send_attempts ?? 0,
    last_error: patch.last_error ?? currentQueue?.last_error ?? null,
    follow_up_due_at: patch.follow_up_due_at ?? currentQueue?.follow_up_due_at ?? null,
    follow_up_status:
      patch.follow_up_status ?? currentQueue?.follow_up_status ?? null,
    history: [
      ...(currentQueue?.history ?? []),
      { status: nextStatus, at: now, ...(note ? { note } : {}) },
    ],
  };
  const metadata = {
    ...contact.metadata,
    outreach_queue: nextQueue,
  };
  const { data, error } = await supabase
    .from("leadgen_contacts")
    .update({ metadata })
    .eq("id", contact.id)
    .select("*")
    .single<LeadgenContact>();

  if (error) {
    throw error;
  }

  return data;
}

export async function getOutreachQueue({
  campaignId,
}: {
  campaignId?: string | null;
} = {}): Promise<OutreachQueueEntry[]> {
  const supabase = createSupabaseServerClient();
  let campaignIds = campaignId ? [campaignId] : [];

  if (!campaignId) {
    const campaigns = await getRecentCampaigns(5);
    campaignIds = campaigns.map((campaign) => campaign.id);
  }

  if (campaignIds.length === 0) {
    return [];
  }

  const [
    { data: contacts, error: contactsError },
    { data: leads, error: leadsError },
    { data: companies, error: companiesError },
    { data: signals, error: signalsError },
  ] = await Promise.all([
    supabase
      .from("leadgen_contacts")
      .select("*")
      .in("campaign_id", campaignIds)
      .returns<LeadgenContact[]>(),
    supabase
      .from("leadgen_leads")
      .select("*")
      .in("campaign_id", campaignIds)
      .returns<LeadgenLead[]>(),
    supabase
      .from("leadgen_companies")
      .select("*")
      .in("campaign_id", campaignIds)
      .returns<LeadgenCompany[]>(),
    supabase
      .from("leadgen_signals")
      .select("*")
      .in("campaign_id", campaignIds)
      .returns<LeadgenSignal[]>(),
  ]);

  if (contactsError) throw contactsError;
  if (leadsError) throw leadsError;
  if (companiesError && !isMissingRelationError(companiesError)) throw companiesError;
  if (signalsError) throw signalsError;

  const leadsById = new Map((leads ?? []).map((lead) => [lead.id, lead]));
  const companiesById = new Map(
    (companies ?? []).map((company) => [company.id, company]),
  );
  const signalsByLeadId = new Map<string, LeadgenSignal>();

  for (const signal of signals ?? []) {
    if (!signalsByLeadId.has(signal.lead_id)) {
      signalsByLeadId.set(signal.lead_id, signal);
    }
  }

  const dedupedEntries = new Map<string, OutreachQueueEntry>();

  for (const contact of contacts ?? []) {
    const entry = buildOutreachQueueEntry({
      contact,
      lead: leadsById.get(contact.lead_id) ?? null,
      company: contact.company_id
        ? companiesById.get(contact.company_id) ?? null
        : null,
      signal: signalsByLeadId.get(contact.lead_id) ?? null,
    });

    if (!entry || dedupedEntries.has(entry.idempotency_key)) {
      continue;
    }

    dedupedEntries.set(entry.idempotency_key, entry);
  }

  return normalizeLeadgenStrings(
    Array.from(dedupedEntries.values()),
    "storage.read.outreach_queue",
  );
}

export async function queueReadyOutreachEmails({
  campaignId,
}: {
  campaignId: string;
}): Promise<OutreachQueueEntry[]> {
  const supabase = createSupabaseServerClient();
  const { data: contacts, error } = await supabase
    .from("leadgen_contacts")
    .select("*")
    .eq("campaign_id", campaignId)
    .returns<LeadgenContact[]>();

  if (error) {
    throw error;
  }

  const emailContacts = (contacts ?? []).filter(isEmailReadyContact);
  const seenIdempotencyKeys = new Set<string>();

  for (const contact of emailContacts) {
    if (contact.metadata.outreach_queue?.status === "sent") {
      continue;
    }

    const idempotencyKey =
      contact.metadata.outreach_queue?.idempotency_key ??
      getOutreachIdempotencyKey({
        campaignId: contact.campaign_id,
        email: contact.email ?? "",
      });

    if (seenIdempotencyKeys.has(idempotencyKey)) {
      continue;
    }

    seenIdempotencyKeys.add(idempotencyKey);

    await updateContactOutreachQueue(
      supabase,
      contact,
      { idempotency_key: idempotencyKey },
      contact.metadata.outreach_queue?.status ?? "needs_review",
      "Добавлено в очередь проверки",
    );
  }

  return getOutreachQueue({ campaignId });
}

export async function updateOutreachQueueEntry({
  id,
  subject,
  body,
  status,
  note,
}: {
  id: string;
  subject?: string;
  body?: string;
  status?: OutreachEmailStatus;
  note?: string;
}): Promise<OutreachQueueEntry | null> {
  const supabase = createSupabaseServerClient();
  const contact = await getContactByOutreachId(supabase, id);

  if (!contact) {
    return null;
  }

  const patch: Partial<NonNullable<LeadgenContact["metadata"]["outreach_queue"]>> = {};

  if (typeof subject === "string") {
    patch.subject = subject.trim();
  }

  if (typeof body === "string") {
    patch.body = body.trim();
  }

  const nextStatus =
    status ??
    (typeof subject === "string" || typeof body === "string"
      ? "needs_review"
      : undefined);
  const updated = await updateContactOutreachQueue(
    supabase,
    contact,
    patch,
    nextStatus,
    note ?? (nextStatus === "needs_review" ? "Письмо отредактировано" : undefined),
  );
  const [entry] = await getOutreachQueue({ campaignId: updated.campaign_id });

  return (
    (await getOutreachQueue({ campaignId: updated.campaign_id })).find(
      (item) => item.contact_id === updated.id,
    ) ?? entry ?? null
  );
}

export async function markOutreachQueueEntry({
  id,
  status,
  note,
  patch = {},
}: {
  id: string;
  status: OutreachEmailStatus;
  note?: string;
  patch?: Partial<NonNullable<LeadgenContact["metadata"]["outreach_queue"]>>;
}): Promise<OutreachQueueEntry | null> {
  const supabase = createSupabaseServerClient();
  const contact = await getContactByOutreachId(supabase, id);

  if (!contact) {
    return null;
  }

  const updated = await updateContactOutreachQueue(
    supabase,
    contact,
    patch,
    status,
    note,
  );

  return (
    (await getOutreachQueue({ campaignId: updated.campaign_id })).find(
      (item) => item.contact_id === updated.id,
    ) ?? null
  );
}
