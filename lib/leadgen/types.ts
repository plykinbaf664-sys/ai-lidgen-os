export type LeadStatus = "new" | "approved" | "rejected" | "paused";

export type CampaignStatus = "completed";

export type LeadgenEventType =
  | "campaign_started"
  | "lead_generated"
  | "lead_status_changed";

export type ContactChannel =
  | "decision-maker"
  | "department-head"
  | "founder"
  | "general-email"
  | "website-form"
  | "linkedin"
  | "social";

export type CampaignInput = {
  name: string;
  requestedBy: string;
};

export type Contact = {
  channel: ContactChannel;
  label: string;
  value: string;
};

export type Signal = {
  title: string;
  detail: string;
  sourceLabel: string;
};

export type MockCompany = {
  id: string;
  name: string;
  domain: string;
  segment: string;
  contacts: Contact[];
  signal: Signal;
};

export type LeadgenCampaign = {
  id: string;
  name: string;
  requested_by: string;
  status: CampaignStatus;
  icp_label: string;
  offer_label: string;
  created_at: string;
};

export type LeadgenLead = {
  id: string;
  campaign_id: string;
  company_name: string;
  company_domain: string;
  company_segment: string;
  contact_channel: ContactChannel | null;
  contact_label: string | null;
  contact_value: string | null;
  signal_title: string;
  signal_detail: string;
  signal_source_label: string;
  hook: string;
  message: string;
  follow_up: string;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
};

export type LeadgenEvent = {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  event_type: LeadgenEventType;
  payload: Record<string, string>;
  created_at: string;
};

export type MockPipelineResult = {
  campaign: LeadgenCampaign;
  leads: LeadgenLead[];
  events: LeadgenEvent[];
};
