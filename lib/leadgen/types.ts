export type LeadStatus = "new" | "approved" | "rejected" | "paused";

export type CampaignStatus = "completed";

export type LeadgenEventType =
  | "campaign_started"
  | "lead_generated"
  | "lead_status_changed";

export type TelegramNotificationStatus =
  | "pending"
  | "prepared"
  | "sent"
  | "failed";

export type SignalType =
  | "HIRING_SIGNAL"
  | "GO_TO_MARKET_SIGNAL"
  | "GROWTH_SIGNAL"
  | "CONTENT_SIGNAL"
  | "TRAFFIC_SIGNAL"
  | "TECH_SIGNAL";

export type ContactChannel =
  | "decision-maker"
  | "department-head"
  | "founder"
  | "general-email"
  | "website-form"
  | "linkedin"
  | "social";

export type LeadgenContactType =
  | "confirmed_person"
  | "role_based_person"
  | "generic_email"
  | "contact_form"
  | "social_profile"
  | "company_website"
  | "no_contact_found";

export type DecisionMakerPriority = "high" | "medium" | "low";

export type LeadPriorityLevel = "critical" | "high" | "medium" | "low";

export type OpportunityType =
  | "confirmed_business_event"
  | "strong_buying_window"
  | "expansion"
  | "hiring"
  | "product_launch"
  | "operational_pressure"
  | "weak_context"
  | "evergreen_content"
  | "no_actionable_opportunity";

export type OpportunityUrgency = "immediate" | "high" | "medium" | "low";

export type OpportunityRecommendedAction =
  | "create_lead"
  | "run_enrichment"
  | "monitor"
  | "discard";

export type OpportunityAssessment = {
  should_create_lead: boolean;
  opportunity_score: number;
  opportunity_type: OpportunityType;
  urgency: OpportunityUrgency;
  business_reasoning: string;
  why_now: string;
  why_this_company: string;
  evidence_strength: number;
  confidence: number;
  positive_factors: string[];
  negative_factors: string[];
  missing_information: string[];
  recommended_action: OpportunityRecommendedAction;
};

export type RecommendedNextAction =
  | "send_outreach"
  | "run_enrichment"
  | "find_target_persona"
  | "monitor_for_new_signal"
  | "defer"
  | "review_manually";

export type LeadPriority = {
  priority: LeadPriorityLevel;
  priority_score: number;
  components: {
    icp_score: number;
    signal_strength: number;
    buying_intent: number;
    timing_score: number;
    contact_readiness: number;
    confidence: number;
  };
  reasoning: string;
  strengths: string[];
  risks: string[];
  recommended_next_action: RecommendedNextAction;
};

export type PersonaSearchStatus =
  | "target_persona_found"
  | "alternative_persona_found"
  | "department_entry_found"
  | "generic_entry_found"
  | "fallback_only"
  | "no_entry_found";

export type ContactEntryRole =
  | "best_outreach_entry"
  | "fallback_entry"
  | "other_entry";

export type PeopleDiscoverySearchStatus =
  | "person_found"
  | "no_person_found"
  | "provider_unavailable";

export type PersonCandidate = {
  full_name: string;
  role_title: string | null;
  department: string | null;
  linkedin_url: string | null;
  work_email: string | null;
  phone: string | null;
  source: string;
  confidence_score: number;
  evidence: string[];
  metadata: Record<string, unknown>;
};

export type PeopleDiscoveryResult = {
  primary_person: PersonCandidate | null;
  alternative_people: PersonCandidate[];
  all_candidates: PersonCandidate[];
  search_status: PeopleDiscoverySearchStatus;
  providers_used: string[];
};

export type BuyingRole =
  | "economic_buyer"
  | "technical_buyer"
  | "champion"
  | "influencer"
  | "operator";

export type DecisionMakerProfile = {
  primary_persona: string;
  alternative_personas: string[];
  department: string;
  buying_role: BuyingRole;
  influence_level: DecisionMakerPriority;
  decision_authority: DecisionMakerPriority;
  business_problem_owner: string;
  expected_pain: string;
  expected_goal: string;
  search_keywords: string[];
  priority: DecisionMakerPriority;
  reasoning: string;
  confidence_score: number;
  source_reasoning: {
    signal_type: SignalType;
    company_segment?: string;
    card_signal_title?: string;
    signal_summary?: string;
    why_it_matters?: string;
    why_now?: string;
    icp_fit_score?: number;
    matched_context_terms?: string[];
    confidence_reason?: string;
    competing_departments?: string[];
  };
};

export type DecisionMakerRecommendation = DecisionMakerProfile;

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
  type: SignalType;
  title: string;
  detail: string;
  sourceLabel: string;
  sourceUrl: string;
  confidenceScore: number;
  foundAt: string;
};

export type MockCompany = {
  id: string;
  name: string;
  domain: string;
  segment: string;
  contacts: Contact[];
  signal: Signal;
  signals: Signal[];
};

export type LeadgenCampaign = {
  id: string;
  pipeline_run_id: string;
  name: string;
  requested_by: string;
  status: CampaignStatus;
  icp_label: string;
  offer_label: string;
  created_at: string;
};

export type LeadgenLead = {
  id: string;
  pipeline_run_id: string;
  campaign_id: string;
  company_id: string | null;
  company_name: string;
  company_domain: string | null;
  company_segment: string;
  contact_channel: ContactChannel | null;
  contact_label: string | null;
  contact_value: string | null;
  company_source_url: string | null;
  lead_score: number;
  icp_fit_score: number;
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

export type LeadgenContact = {
  id: string;
  pipeline_run_id: string;
  campaign_id: string;
  company_id: string;
  lead_id: string;
  contact_type: LeadgenContactType;
  full_name: string | null;
  role_title: string | null;
  department: string | null;
  email: string | null;
  linkedin_url: string | null;
  telegram_url: string | null;
  contact_url: string | null;
  source_url: string | null;
  source_label: string | null;
  confidence_score: number;
  is_primary: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type LeadgenSignal = {
  id: string;
  pipeline_run_id: string;
  campaign_id: string;
  lead_id: string;
  company_id: string | null;
  signal_type: SignalType;
  signal_title: string;
  signal_detail: string;
  signal_source_label: string;
  source_url: string;
  confidence_score: number;
  found_at: string;
  created_at: string;
};

export type LeadCandidate = {
  company_name: string;
  company_domain: string | null;
  company_segment: string;
  company_source_url: string;
  signals: LeadgenSignal[];
  lead_score: number;
  icp_fit_score: number;
  icp_fit_breakdown: Record<string, unknown>;
  confirmed_facts?: string[];
  inferred_insights?: string[];
  confidence_level?:
    | "confirmed"
    | "high_confidence_inference"
    | "medium_confidence_hypothesis"
    | "weak_evidence";
  signal_summary?: string;
  why_it_matters?: string;
  why_now?: string;
  outreach_hypothesis?: string;
  evidence_quality?:
    | "confirmed_event"
    | "probable_event"
    | "topic_only"
    | "weak_context";
  card_signal_title?: string;
  should_create_lead?: boolean;
  gtm_signal_type?: "topic_only" | "confirmed_event" | "mixed";
  evidence_language?: "en" | "ru" | "mixed";
  signal_type?: SignalType;
  discovery_query?: string | null;
  discovery_market?: "global" | "ru" | null;
  discovery_query_language?: "en" | "ru" | null;
  discovery_query_angle?: string | null;
  source_country_hint?: string | null;
  matched_signal_count?: number;
};

export type LeadgenCompany = {
  id: string;
  pipeline_run_id: string;
  campaign_id: string;
  company_name: string;
  company_domain: string | null;
  company_segment: string;
  source: string;
  source_url: string | null;
  source_label: string | null;
  signal_type: SignalType;
  discovery_query: string | null;
  matched_signal_count: number;
  lead_score: number;
  icp_fit_score: number;
  confidence_score: number;
  country: string | null;
  industry: string | null;
  company_size: string | null;
  linkedin_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LeadgenEvent = {
  id: string;
  pipeline_run_id: string;
  campaign_id: string;
  lead_id: string | null;
  event_type: LeadgenEventType;
  payload: Record<string, string>;
  created_at: string;
};

export type TelegramNotification = {
  id: string;
  pipeline_run_id: string;
  lead_id: string;
  campaign_id: string;
  telegram_card_text: string;
  status: TelegramNotificationStatus;
  created_at: string;
};

export type LeadgenCampaignSummary = {
  id: string;
  pipeline_run_id: string;
  name: string;
  status: CampaignStatus;
  created_at: string;
  companies_count: number;
  contacts_count: number;
};

export type LeadgenCampaignDetailsStats = {
  companies_count: number;
  contacts_count: number;
  signals_count: number;
  notifications_count: number;
  events_count: number;
};

export type LeadgenCampaignDetails = {
  campaign: LeadgenCampaign;
  companies: LeadgenCompany[];
  leads: LeadgenLead[];
  contacts: LeadgenContact[];
  signals: LeadgenSignal[];
  events: LeadgenEvent[];
  notifications: TelegramNotification[];
  stats: LeadgenCampaignDetailsStats;
};

export type MockPipelineResult = {
  campaign: LeadgenCampaign;
  companies?: LeadgenCompany[];
  contacts?: LeadgenContact[];
  leads: LeadgenLead[];
  signals: LeadgenSignal[];
  events: LeadgenEvent[];
};

export type LeadDiscoveryResult = {
  campaign: LeadgenCampaign;
  companies: LeadgenCompany[];
  contacts: LeadgenContact[];
  leads: LeadgenLead[];
  signals: LeadgenSignal[];
  events: LeadgenEvent[];
};
