export type LeadStatus = "new" | "approved" | "rejected" | "paused";

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

export type Lead = {
  id: string;
  campaignName: string;
  company: Pick<MockCompany, "name" | "domain" | "segment">;
  contact: Contact | null;
  signal: Signal;
  hook: string;
  message: string;
  followUp: string;
  status: LeadStatus;
};
