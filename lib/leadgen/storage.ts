import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/client";
import type {
  LeadgenCampaign,
  LeadgenCampaignDetails,
  LeadgenCampaignSummary,
  LeadgenEvent,
  LeadgenLead,
  MockPipelineResult,
  TelegramNotification,
} from "@/lib/leadgen/types";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

type SavePipelineInput = {
  result: MockPipelineResult;
  notifications: TelegramNotification[];
};

type SavePipelineResult = {
  pipeline_run_id: string;
  campaign_id: string;
  leads_count: number;
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
    await saveLeads(supabase, result.leads);
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
    leads_count: result.leads.length,
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
  const { data: leads, error: leadsError } = await supabase
    .from("leadgen_leads")
    .select("campaign_id,contact_value")
    .in("campaign_id", campaignIds)
    .returns<StoredLeadCampaignRef[]>();

  if (leadsError) {
    throw leadsError;
  }

  const companyCounts = new Map<string, number>();
  const contactCounts = new Map<string, number>();

  for (const lead of leads ?? []) {
    companyCounts.set(
      lead.campaign_id,
      (companyCounts.get(lead.campaign_id) ?? 0) + 1,
    );

    if (lead.contact_value) {
      contactCounts.set(
        lead.campaign_id,
        (contactCounts.get(lead.campaign_id) ?? 0) + 1,
      );
    }
  }

  return campaigns.map((campaign) => ({
    ...campaign,
    companies_count: companyCounts.get(campaign.id) ?? 0,
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
    { data: leads, error: leadsError },
    { data: events, error: eventsError },
    { data: notifications, error: notificationsError },
  ] = await Promise.all([
    supabase
      .from("leadgen_leads")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
      .returns<LeadgenLead[]>(),
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

  if (leadsError) {
    throw leadsError;
  }

  if (eventsError) {
    throw eventsError;
  }

  if (notificationsError) {
    throw notificationsError;
  }

  const storedLeads = leads ?? [];
  const storedEvents = events ?? [];
  const storedNotifications = notifications ?? [];

  return {
    campaign,
    leads: storedLeads,
    events: storedEvents,
    notifications: storedNotifications,
    stats: {
      companies_count: storedLeads.length,
      contacts_count: storedLeads.filter((lead) => lead.contact_value).length,
      notifications_count: storedNotifications.length,
      events_count: storedEvents.length,
    },
  };
}
