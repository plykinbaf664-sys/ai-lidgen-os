alter table public.leadgen_campaigns
  add column if not exists pipeline_run_id text;

alter table public.leadgen_leads
  add column if not exists pipeline_run_id text;

alter table public.leadgen_events
  add column if not exists pipeline_run_id text;

alter table public.leadgen_telegram_notifications
  add column if not exists pipeline_run_id text;

update public.leadgen_campaigns
set pipeline_run_id = id
where pipeline_run_id is null;

update public.leadgen_leads
set pipeline_run_id = campaign_id
where pipeline_run_id is null;

update public.leadgen_events
set pipeline_run_id = campaign_id
where pipeline_run_id is null;

update public.leadgen_telegram_notifications
set pipeline_run_id = campaign_id
where pipeline_run_id is null;

alter table public.leadgen_campaigns
  alter column pipeline_run_id set not null;

alter table public.leadgen_leads
  alter column pipeline_run_id set not null;

alter table public.leadgen_events
  alter column pipeline_run_id set not null;

alter table public.leadgen_telegram_notifications
  alter column pipeline_run_id set not null;

create index if not exists leadgen_campaigns_pipeline_run_id_idx
  on public.leadgen_campaigns (pipeline_run_id);

create index if not exists leadgen_leads_pipeline_run_id_idx
  on public.leadgen_leads (pipeline_run_id);

create index if not exists leadgen_events_pipeline_run_id_idx
  on public.leadgen_events (pipeline_run_id);

create index if not exists leadgen_telegram_notifications_pipeline_run_id_idx
  on public.leadgen_telegram_notifications (pipeline_run_id);
