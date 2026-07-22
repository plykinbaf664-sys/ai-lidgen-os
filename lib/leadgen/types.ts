export type LeadStatus = "new" | "approved" | "rejected" | "paused";

export type CampaignStatus = "completed";

export type CampaignOperationalStatus =
  | "discovery_complete"
  | "needs_review"
  | "ready_to_send"
  | "queue_active"
  | "sent"
  | "needs_attention";

export type LeadgenEventType =
  | "campaign_started"
  | "lead_generated"
  | "lead_status_changed";

export type TelegramNotificationStatus =
  | "pending"
  | "prepared"
  | "sent"
  | "failed";

export type OutreachEmailStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "paused"
  | "rejected"
  | "replied"
  | "follow_up_due"
  | "completed"
  | "eligible"
  | "generating"
  | "skipped"
  | "cancelled";

export type OutreachMessageMode =
  | "personal"
  | "department"
  | "generic_routing";

export type OutreachMessageKind = "initial" | "follow_up";
export type ReplyCheckStatus = "pending" | "verified" | "unavailable";
export type ReplyDetectionMethod =
  | "in_reply_to"
  | "references"
  | "sender_email"
  | "subject_time";

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
  | "telegram"
  | "phone"
  | "social";

export type LeadgenContactType =
  | "work_email"
  | "linkedin"
  | "telegram"
  | "phone"
  | "website_form"
  | "company_social"
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

export type CommercialSignalType =
  | "hiring"
  | "expansion"
  | "new_location"
  | "new_product"
  | "new_service"
  | "partnership"
  | "investment"
  | "sales_growth"
  | "digital_transformation"
  | "customer_service_growth"
  | "infrastructure_change"
  | "procurement_activity"
  | "market_entry"
  | "leadership_change"
  | "other_verified"
  | "none";

export type CommercialSignal = {
  type: CommercialSignalType;
  summary: string;
  evidence: string;
  sourceUrl: string;
  sourceTitle?: string;
  detectedAt?: string;
  confidence: number;
};

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

export type ContactRecommendedNextAction =
  | "send_outreach"
  | "run_enrichment"
  | "use_fallback_channel"
  | "manual_review"
  | "skip_until_contact_found";

export type IdentityChannelTier = 1 | 2 | 3 | 4;

export type IdentityChannelOwnership =
  | "primary_person"
  | "alternative_person"
  | "department"
  | "company"
  | "unknown";

export type IdentityChannel = {
  id: string;
  contact_type: LeadgenContactType;
  label: string;
  value: string | null;
  url: string | null;
  tier: IdentityChannelTier;
  ownership: IdentityChannelOwnership;
  confidence_score: number;
  source_label: string | null;
  source_url: string | null;
  can_use_for_outreach: boolean;
  why_selected?: string;
};

export type IdentityProfile = {
  person: PersonCandidate | null;
  person_intelligence?: PersonIntelligence | null;
  identity_confidence: number;
  identity_summary: string;
  available_channels: IdentityChannel[];
  primary_contact_channel: IdentityChannel | null;
  fallback_channel: IdentityChannel | null;
  alternative_channels: IdentityChannel[];
  missing_channels: string[];
  recommended_next_action: ContactRecommendedNextAction;
  why_channel_selected: string;
};

export type LeadgenContactMetadata = {
  entry_role?: ContactEntryRole;
  persona_search_status?: PersonaSearchStatus;
  recommended_next_action?: ContactRecommendedNextAction;
  best_outreach_channel?: LeadgenContactType | null;
  best_outreach_contact_id?: string | null;
  best_outreach_confidence?: number | null;
  fallback_channel?: LeadgenContactType | null;
  fallback_contact_id?: string | null;
  fallback_confidence?: number | null;
  alternative_channel_ids?: string[];
  alternative_channels?: Array<{
    id: string;
    contact_type: LeadgenContactType;
    confidence_score: number;
    source_label: string | null;
  }>;
  people_discovery_role?: "primary" | "alternative";
  extraction?: string;
  phone?: string;
  reason?: string;
  email_subject?: string | null;
  email_body?: string | null;
  email_status?: string | null;
  email_classification?: string | null;
  email_micro_value?: {
    type: "ideas" | "audit" | "scenarios" | "processes";
    items: string[];
    summary: string;
  } | null;
  email_quality?: Record<string, number> | null;
  email_quality_gate_passed?: boolean;
  email_generation_attempts?: number;
  email_copy_review_status?: "ready" | "needs_manual_copy_review" | null;
  message_mode?: OutreachMessageMode | null;
  outreach_ready?: boolean;
  outreach_queue?: {
    id: string;
    status: OutreachEmailStatus;
    subject: string;
    body: string;
    idempotency_key: string;
    approved_at?: string | null;
    queued_at?: string | null;
    sent_at?: string | null;
    provider?: string | null;
    provider_message_id?: string | null;
    send_attempts?: number;
    last_error?: string | null;
    follow_up_due_at?: string | null;
    follow_up_status?: string | null;
    history?: Array<{
      status: OutreachEmailStatus;
      at: string;
      note?: string;
    }>;
  };
  [key: string]: unknown;
};

export type OutreachQueueEntry = {
  id: string;
  contact_id: string;
  lead_id: string;
  campaign_id: string;
  company_id: string | null;
  company_name: string;
  company_website?: string | null;
  recipient_name: string | null;
  recipient_role: string | null;
  email: string;
  email_type: LeadgenContactType;
  email_source_url: string | null;
  email_source_label: string | null;
  readiness: string;
  signal: {
    type: SignalType | null;
    title: string | null;
    detail: string | null;
    source_url: string | null;
    confidence_score: number | null;
  };
  subject: string;
  body: string;
  message_mode: OutreachMessageMode;
  status: OutreachEmailStatus;
  idempotency_key: string;
  normalized_recipient_email?: string;
  message_version?: number;
  send_attempts: number;
  last_error: string | null;
  provider: string | null;
  provider_message_id: string | null;
  smtp_response?: string | null;
  sent_copy_saved_at?: string | null;
  sent_copy_error?: string | null;
  created_at: string;
  approved_at: string | null;
  queued_at: string | null;
  scheduled_at?: string | null;
  next_attempt_at?: string | null;
  sending_started_at?: string | null;
  sent_at: string | null;
  failed_at?: string | null;
  updated_at?: string;
  approval_invalidated_reason?: string | null;
  copy_quality?: Record<string, number> | null;
  quality_gate_passed?: boolean;
  copy_review_status?: "ready" | "needs_manual_copy_review" | null;
  generation_attempts?: number;
  micro_value?: {
    type: "ideas" | "audit" | "scenarios" | "processes";
    items: string[];
    summary: string;
  } | null;
  queue_position?: number | null;
  follow_up_due_at: string | null;
  follow_up_status: string | null;
  history: Array<{
    status: OutreachEmailStatus;
    at: string;
    note?: string;
  }>;
  message_kind?: OutreachMessageKind;
  parent_outreach_id?: string | null;
  followup_number?: number | null;
  parent_smtp_message_id?: string | null;
  reply_check_status?: ReplyCheckStatus;
  reply_checked_at?: string | null;
  reply_detected_at?: string | null;
  reply_message_id?: string | null;
  reply_from?: string | null;
  reply_subject?: string | null;
  reply_detection_method?: ReplyDetectionMethod | null;
  generation_reason?: string | null;
  skip_reason?: string | null;
};

export type OutreachReadiness = {
  smtp_connected: boolean;
  email_test_mode: boolean;
  mode_label: string;
  queue_paused: boolean;
  approved: number;
  queued: number;
  sending: number;
  sent_today: number;
  daily_limit: number;
  daily_remaining: number;
  queued_for_today: number;
  batch_limit: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  can_launch: boolean;
  blockers: string[];
  imap_configured: boolean;
  imap_connected: boolean;
  imap_message: string;
  followup_send_blocked: boolean;
  consistency_issue_count: number;
  consistency_healthy: boolean;
};

export type OutreachOperationalState = {
  state: "empty" | "ready" | "waiting" | "sending" | "paused" | "stalled";
  due_count: number;
  overdue_count: number;
  next_scheduled_at: string | null;
  oldest_overdue_at: string | null;
  checked_at: string;
};

export type ProductionDiscoveryStats = {
  results_received: number;
  previously_discovered_skipped: number;
  within_run_duplicates: number;
  new_unique_companies: number;
  lead_target: number;
  email_target?: number;
  new_unique_emails?: number;
  known_emails_skipped?: number;
  duplicate_emails_skipped?: number;
  search_budget: number;
  skip_reasons: Record<string, number>;
  skipped_identity_keys?: string[];
};

export type PeopleDiscoverySearchStatus =
  | "person_found"
  | "no_person_found"
  | "provider_unavailable";

export type PersonConfidenceLevel =
  | "confirmed"
  | "high_confidence"
  | "medium_confidence"
  | "low_confidence"
  | "unknown";

export type PersonContactAvailability = {
  has_work_email: boolean;
  has_linkedin: boolean;
  has_phone: boolean;
  has_telegram: boolean;
};

export type PersonRecommendedNextAction =
  | "contact_primary_person"
  | "contact_alternative_person"
  | "run_enrichment"
  | "manual_review"
  | "monitor_changes";

export type PersonIntelligence = {
  candidate: PersonCandidate;
  rank_score: number;
  person_score: number;
  persona_match_score: number;
  business_problem_ownership: DecisionMakerPriority;
  decision_authority: DecisionMakerPriority;
  influence_level: DecisionMakerPriority;
  confidence_score: number;
  confidence_level: PersonConfidenceLevel;
  contact_availability: PersonContactAvailability;
  matched_keywords: string[];
  reasoning: string;
  selection_reason: string;
  strengths: string[];
  weaknesses: string[];
  why_not_other_candidates: string[];
  recommended_next_action: PersonRecommendedNextAction;
};

export type PersonRankingInput = {
  candidates: PersonCandidate[];
  decisionMaker: DecisionMakerProfile;
};

export type PersonRankingResult = {
  primary_person: PersonIntelligence | null;
  alternative_people: PersonIntelligence[];
  ranked_people: PersonIntelligence[];
};

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

export type ProviderDiagnostic = {
  provider_id: string;
  provider_label: string;
  level: "info" | "warning" | "error";
  message: string;
};

export type PeopleDiscoveryResult = {
  primary_person: PersonCandidate | null;
  alternative_people: PersonCandidate[];
  all_candidates: PersonCandidate[];
  primary_person_intelligence?: PersonIntelligence | null;
  alternative_people_intelligence?: PersonIntelligence[];
  ranked_people?: PersonIntelligence[];
  selection_reasoning?: string | null;
  search_status: PeopleDiscoverySearchStatus;
  providers_used: string[];
  provider_diagnostics?: ProviderDiagnostic[];
};

export type PeopleProviderInput = {
  company: LeadgenCompany;
  decisionMaker: DecisionMakerProfile;
  searchKeywords: string[];
};

export type PeopleProviderResult = {
  provider_id: string;
  provider_label: string;
  candidates: PersonCandidate[];
  unavailable?: boolean;
  diagnostics?: Array<Omit<ProviderDiagnostic, "provider_id" | "provider_label">>;
};

export type LeadReadinessStatus =
  | "outreach_ready"
  | "fallback_ready"
  | "enrichment_required"
  | "manual_research_required"
  | "provider_exhausted"
  | "rejected";

export type LeadReadyContactType =
  | "work_email"
  | "linkedin"
  | "telegram"
  | "phone"
  | "generic_email"
  | "website_form"
  | "company_social"
  | "company_website"
  | "none";

export type LeadReadyCandidate = {
  id: string;
  source_track: "contact_first" | "signal_first_ru" | "merged";
  company: {
    name: string;
    normalized_name: string;
    domain: string | null;
    website: string | null;
    source_url: string | null;
    location: string | null;
    industry: string | null;
  };
  person: {
    full_name: string | null;
    role_title: string | null;
    decision_authority: DecisionMakerPriority | "unknown";
    source: string | null;
    source_url: string | null;
  };
  contact: {
    type: LeadReadyContactType;
    value: string | null;
    verified: boolean;
    source: string | null;
    source_url: string | null;
  };
  signal: {
    type: SignalType | null;
    strength: number;
    why_now: string | null;
    source_url: string | null;
  };
  scores: {
    icp_fit: number;
    contact_readiness: number;
    signal_strength: number;
    decision_authority: number;
    overall: number;
  };
  readiness_status: LeadReadinessStatus;
  readiness_reason: string;
  providers_used: string[];
  diagnostics: ProviderDiagnostic[];
  raw_refs: {
    company_id?: string;
    lead_id?: string;
    people_discovery?: PeopleDiscoveryResult;
  };
};

export type DiscoverySuccessMetrics = {
  companies_discovered: number;
  people_verified: number;
  confirmed_people_count: number;
  direct_contacts_found: number;
  fallback_contacts_found: number;
  verified_contacts_count: number;
  outreach_ready_count: number;
  fallback_ready_count: number;
  enrichment_required_count: number;
  manual_research_required_count: number;
  provider_exhausted_count: number;
  rejected_count: number;
};

export type DiscoveryOrchestratorResult = {
  candidates: LeadReadyCandidate[];
  metrics: DiscoverySuccessMetrics;
  diagnostics: ProviderDiagnostic[];
};

export type ContactDiscoveryStatus =
  | "entry_found"
  | "fallback_only"
  | "no_entry_found";

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
  production_discovery_stats?: ProductionDiscoveryStats;
  operational_status?: CampaignOperationalStatus;
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
  metadata: LeadgenContactMetadata;
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
  commercial_signal?: CommercialSignal | null;
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
  leads_count: number;
  contacts_count: number;
  email_count?: number;
  sent_count?: number;
  initial_sent_count: number;
  followup_sent_count: number;
  needs_review_count: number;
  approved_count: number;
  queued_count: number;
  sending_count: number;
  failed_count: number;
  operational_status: CampaignOperationalStatus;
};

export type LeadgenCampaignDetailsStats = {
  companies_count: number;
  leads_count: number;
  contacts_count: number;
  signals_count: number;
  notifications_count: number;
  events_count: number;
  initial_sent_count: number;
  followup_sent_count: number;
  needs_review_count: number;
  approved_count: number;
  queued_count: number;
  sending_count: number;
  failed_count: number;
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

export type ContactDiscoveryInput = {
  campaign: LeadgenCampaign;
  company: LeadgenCompany;
  lead: LeadgenLead;
  signals: LeadgenSignal[];
  decisionMaker?: DecisionMakerProfile;
  peopleDiscovery: PeopleDiscoveryResult;
  createdAt: string;
};

export type ContactProviderInput = ContactDiscoveryInput;

export type ContactProviderResult = {
  contacts: LeadgenContact[];
  provider_id?: string;
  provider_label?: string;
  warnings?: string[];
  strategies_attempted?: string[];
  queries_executed?: string[];
  urls_inspected?: string[];
  channels_found?: string[];
  channels_rejected?: string[];
  provider_errors?: string[];
  emails_extracted?: string[];
  emails_rejected?: string[];
  email_search_completed?: boolean;
  email_search_status?: string;
  email_stop_reason?: string;
};

export type ContactDiscoveryResult = {
  contacts: LeadgenContact[];
  best_available_entry: LeadgenContact;
  best_outreach_entry: LeadgenContact | null;
  fallback_entry: LeadgenContact | null;
  alternative_channels: LeadgenContact[];
  identity_profile: IdentityProfile;
  persona_search_status: PersonaSearchStatus;
  discovery_status: ContactDiscoveryStatus;
  recommended_next_action: ContactRecommendedNextAction;
  providers_used: string[];
  warnings: string[];
  strategies_attempted: string[];
  queries_executed?: string[];
  urls_inspected: string[];
  channels_found: string[];
  channels_rejected: string[];
  provider_errors: string[];
  emails_extracted?: string[];
  emails_rejected?: string[];
  email_search_completed?: boolean;
  email_search_status?: string;
  email_stop_reason?: string;
};

export type ContactEnrichmentInput = ContactDiscoveryInput;

export type ContactEnrichmentResult = ContactDiscoveryResult;

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
  lead_ready_candidates?: LeadReadyCandidate[];
  discovery_metrics?: DiscoverySuccessMetrics;
  discovery_diagnostics?: ProviderDiagnostic[];
  production_discovery_stats?: ProductionDiscoveryStats;
};
