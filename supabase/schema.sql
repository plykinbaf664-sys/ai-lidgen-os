create table if not exists public.leadgen_campaigns (
  id text primary key,
  pipeline_run_id text not null,
  name text not null,
  requested_by text not null,
  status text not null
    check (status in ('completed')),
  icp_label text not null,
  offer_label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.leadgen_companies (
  id text primary key,
  pipeline_run_id text not null,
  campaign_id text not null
    references public.leadgen_campaigns (id)
    on delete cascade,
  company_name text not null,
  company_domain text,
  company_segment text not null,
  source text not null default 'signal_pipeline',
  source_url text,
  source_label text,
  signal_type text not null
    check (
      signal_type in (
        'HIRING_SIGNAL',
        'GO_TO_MARKET_SIGNAL',
        'GROWTH_SIGNAL',
        'CONTENT_SIGNAL',
        'TRAFFIC_SIGNAL',
        'TECH_SIGNAL'
      )
    ),
  discovery_query text,
  matched_signal_count integer not null default 0
    check (matched_signal_count >= 0),
  lead_score numeric not null default 0,
  icp_fit_score numeric not null default 0
    check (icp_fit_score >= 0 and icp_fit_score <= 100),
  confidence_score numeric not null default 0
    check (confidence_score >= 0 and confidence_score <= 100),
  country text,
  industry text,
  company_size text,
  linkedin_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leadgen_leads (
  id text primary key,
  pipeline_run_id text not null,
  campaign_id text not null
    references public.leadgen_campaigns (id)
    on delete cascade,
  company_id text
    references public.leadgen_companies (id)
    on delete cascade,
  company_name text not null,
  company_domain text,
  company_segment text not null,
  contact_channel text
    check (
      contact_channel is null
      or contact_channel in (
        'decision-maker',
        'department-head',
        'founder',
        'general-email',
        'website-form',
        'linkedin',
        'telegram',
        'phone',
        'social'
      )
    ),
  contact_label text,
  contact_value text,
  company_source_url text,
  lead_score numeric not null default 0,
  icp_fit_score numeric not null default 0
    check (icp_fit_score >= 0 and icp_fit_score <= 100),
  signal_title text not null,
  signal_detail text not null,
  signal_source_label text not null,
  hook text not null,
  message text not null,
  follow_up text not null,
  status text not null
    check (status in ('new', 'approved', 'rejected', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leadgen_signals (
  id text primary key,
  pipeline_run_id text not null,
  campaign_id text not null
    references public.leadgen_campaigns (id)
    on delete cascade,
  lead_id text not null
    references public.leadgen_leads (id)
    on delete cascade,
  company_id text
    references public.leadgen_companies (id)
    on delete cascade,
  signal_type text not null
    check (
      signal_type in (
        'HIRING_SIGNAL',
        'GO_TO_MARKET_SIGNAL',
        'GROWTH_SIGNAL',
        'CONTENT_SIGNAL',
        'TRAFFIC_SIGNAL',
        'TECH_SIGNAL'
      )
    ),
  signal_title text not null,
  signal_detail text not null,
  signal_source_label text not null,
  source_url text not null,
  confidence_score numeric not null
    check (confidence_score >= 0 and confidence_score <= 100),
  found_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.leadgen_contacts (
  id text primary key,
  pipeline_run_id text not null,
  campaign_id text not null
    references public.leadgen_campaigns (id)
    on delete cascade,
  company_id text not null
    references public.leadgen_companies (id)
    on delete cascade,
  lead_id text not null
    references public.leadgen_leads (id)
    on delete cascade,
  contact_type text not null
    check (
      contact_type in (
        'confirmed_person',
        'role_based_person',
        'work_email',
        'linkedin',
        'telegram',
        'phone',
        'website_form',
        'generic_email',
        'contact_form',
        'social_profile',
        'company_social',
        'company_website',
        'no_contact_found'
      )
    ),
  full_name text,
  role_title text,
  department text,
  email text,
  linkedin_url text,
  telegram_url text,
  contact_url text,
  source_url text,
  source_label text,
  confidence_score numeric not null default 0
    check (confidence_score >= 0 and confidence_score <= 100),
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.leadgen_events (
  id text primary key,
  pipeline_run_id text not null,
  campaign_id text not null
    references public.leadgen_campaigns (id)
    on delete cascade,
  lead_id text
    references public.leadgen_leads (id)
    on delete cascade,
  event_type text not null
    check (
      event_type in (
        'campaign_started',
        'lead_generated',
        'lead_status_changed'
      )
    ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.leadgen_telegram_notifications (
  id text primary key,
  pipeline_run_id text not null,
  lead_id text not null
    references public.leadgen_leads (id)
    on delete cascade,
  campaign_id text not null
    references public.leadgen_campaigns (id)
    on delete cascade,
  telegram_card_text text not null,
  status text not null
    check (status in ('pending', 'prepared', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists leadgen_campaigns_pipeline_run_id_idx
  on public.leadgen_campaigns (pipeline_run_id);

create index if not exists leadgen_leads_pipeline_run_id_idx
  on public.leadgen_leads (pipeline_run_id);

create index if not exists leadgen_leads_campaign_id_idx
  on public.leadgen_leads (campaign_id);

create index if not exists leadgen_leads_company_id_idx
  on public.leadgen_leads (company_id);

create index if not exists leadgen_leads_status_idx
  on public.leadgen_leads (status);

create index if not exists leadgen_leads_lead_score_idx
  on public.leadgen_leads (lead_score);

create index if not exists leadgen_companies_pipeline_run_id_idx
  on public.leadgen_companies (pipeline_run_id);

create index if not exists leadgen_companies_campaign_id_idx
  on public.leadgen_companies (campaign_id);

create index if not exists leadgen_companies_company_domain_idx
  on public.leadgen_companies (company_domain);

create index if not exists leadgen_companies_signal_type_idx
  on public.leadgen_companies (signal_type);

create index if not exists leadgen_companies_lead_score_idx
  on public.leadgen_companies (lead_score);

create index if not exists leadgen_companies_icp_fit_score_idx
  on public.leadgen_companies (icp_fit_score);

create index if not exists leadgen_companies_confidence_score_idx
  on public.leadgen_companies (confidence_score);

create index if not exists leadgen_signals_pipeline_run_id_idx
  on public.leadgen_signals (pipeline_run_id);

create index if not exists leadgen_signals_campaign_id_idx
  on public.leadgen_signals (campaign_id);

create index if not exists leadgen_signals_lead_id_idx
  on public.leadgen_signals (lead_id);

create index if not exists leadgen_signals_company_id_idx
  on public.leadgen_signals (company_id);

create index if not exists leadgen_signals_signal_type_idx
  on public.leadgen_signals (signal_type);

create index if not exists leadgen_signals_confidence_score_idx
  on public.leadgen_signals (confidence_score);

create index if not exists leadgen_contacts_pipeline_run_id_idx
  on public.leadgen_contacts (pipeline_run_id);

create index if not exists leadgen_contacts_campaign_id_idx
  on public.leadgen_contacts (campaign_id);

create index if not exists leadgen_contacts_company_id_idx
  on public.leadgen_contacts (company_id);

create index if not exists leadgen_contacts_lead_id_idx
  on public.leadgen_contacts (lead_id);

create index if not exists leadgen_contacts_contact_type_idx
  on public.leadgen_contacts (contact_type);

create index if not exists leadgen_contacts_is_primary_idx
  on public.leadgen_contacts (is_primary);

create index if not exists leadgen_events_pipeline_run_id_idx
  on public.leadgen_events (pipeline_run_id);

create index if not exists leadgen_events_campaign_id_idx
  on public.leadgen_events (campaign_id);

create index if not exists leadgen_events_lead_id_idx
  on public.leadgen_events (lead_id);

create index if not exists leadgen_events_event_type_idx
  on public.leadgen_events (event_type);

create index if not exists leadgen_telegram_notifications_pipeline_run_id_idx
  on public.leadgen_telegram_notifications (pipeline_run_id);

create index if not exists leadgen_telegram_notifications_campaign_id_idx
  on public.leadgen_telegram_notifications (campaign_id);

create index if not exists leadgen_telegram_notifications_lead_id_idx
  on public.leadgen_telegram_notifications (lead_id);

create index if not exists leadgen_telegram_notifications_status_idx
  on public.leadgen_telegram_notifications (status);

-- Production Outreach Launch tables and atomic queue claim are defined in:
-- supabase/production_outreach_launch.sql
