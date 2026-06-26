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

alter table public.leadgen_leads
  add column if not exists company_id text
    references public.leadgen_companies (id)
    on delete cascade;

alter table public.leadgen_leads
  alter column company_domain drop not null;

alter table public.leadgen_signals
  add column if not exists company_id text
    references public.leadgen_companies (id)
    on delete cascade;

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

create index if not exists leadgen_companies_confidence_score_idx
  on public.leadgen_companies (confidence_score);

create index if not exists leadgen_leads_company_id_idx
  on public.leadgen_leads (company_id);

create index if not exists leadgen_signals_company_id_idx
  on public.leadgen_signals (company_id);
