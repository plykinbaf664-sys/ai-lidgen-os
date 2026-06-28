import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/client";
import type {
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
  TelegramNotification,
} from "@/lib/leadgen/types";

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

  try {
    await saveCampaign(supabase, result.campaign);
    await saveCompanies(supabase, result.companies ?? []);
    await saveLeads(supabase, result.leads);
    await saveSignals(supabase, result.signals);
    await saveContacts(supabase, result.contacts ?? []);
    await saveEvents(supabase, result.events);
    await saveTelegramNotifications(supabase, notifications);
  } catch (error) {
    const rollbackErrorMessage = await rollbackPipelineResult(
      supabase,
      result.campaign.id,
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
    pipeline_run_id: result.campaign.pipeline_run_id,
    campaign_id: result.campaign.id,
    companies_count: result.companies?.length ?? result.leads.length,
    contacts_count: result.contacts?.length ?? 0,
    leads_count: result.leads.length,
    signals_count: result.signals.length,
    events_count: result.events.length,
    notifications_count: notifications.length,
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

  return campaigns.map((campaign) => ({
    ...campaign,
    companies_count:
      companyCounts.get(campaign.id) ?? legacyLeadCounts.get(campaign.id) ?? 0,
    contacts_count: contactCounts.get(campaign.id) ?? 0,
  }));
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

  return {
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
      contacts_count:
        storedContacts.length > 0
          ? storedContacts.length
          : storedLeads.filter((lead) => lead.contact_value).length,
      signals_count: storedSignals.length,
      notifications_count: storedNotifications.length,
      events_count: storedEvents.length,
    },
  };
}
