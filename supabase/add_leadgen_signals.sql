alter table public.leadgen_leads
  add column if not exists company_source_url text;

alter table public.leadgen_leads
  add column if not exists lead_score numeric not null default 0;

create table if not exists public.leadgen_signals (
  id text primary key,
  pipeline_run_id text not null,
  campaign_id text not null
    references public.leadgen_campaigns (id)
    on delete cascade,
  lead_id text not null
    references public.leadgen_leads (id)
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

create index if not exists leadgen_leads_lead_score_idx
  on public.leadgen_leads (lead_score);

create index if not exists leadgen_signals_pipeline_run_id_idx
  on public.leadgen_signals (pipeline_run_id);

create index if not exists leadgen_signals_campaign_id_idx
  on public.leadgen_signals (campaign_id);

create index if not exists leadgen_signals_lead_id_idx
  on public.leadgen_signals (lead_id);

create index if not exists leadgen_signals_signal_type_idx
  on public.leadgen_signals (signal_type);

create index if not exists leadgen_signals_confidence_score_idx
  on public.leadgen_signals (confidence_score);
