create table if not exists public.leadgen_campaigns (
  id text primary key,
  name text not null,
  requested_by text not null,
  status text not null
    check (status in ('completed')),
  icp_label text not null,
  offer_label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.leadgen_leads (
  id text primary key,
  campaign_id text not null
    references public.leadgen_campaigns (id)
    on delete cascade,
  company_name text not null,
  company_domain text not null,
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
        'social'
      )
    ),
  contact_label text,
  contact_value text,
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

create table if not exists public.leadgen_events (
  id text primary key,
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

create index if not exists leadgen_leads_campaign_id_idx
  on public.leadgen_leads (campaign_id);

create index if not exists leadgen_leads_status_idx
  on public.leadgen_leads (status);

create index if not exists leadgen_events_campaign_id_idx
  on public.leadgen_events (campaign_id);

create index if not exists leadgen_events_lead_id_idx
  on public.leadgen_events (lead_id);

create index if not exists leadgen_events_event_type_idx
  on public.leadgen_events (event_type);

create index if not exists leadgen_telegram_notifications_campaign_id_idx
  on public.leadgen_telegram_notifications (campaign_id);

create index if not exists leadgen_telegram_notifications_lead_id_idx
  on public.leadgen_telegram_notifications (lead_id);

create index if not exists leadgen_telegram_notifications_status_idx
  on public.leadgen_telegram_notifications (status);
