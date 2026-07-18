create table if not exists public.leadgen_discovered_companies (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  canonical_company_id text,
  normalized_domain text,
  normalized_website text,
  normalized_name text not null,
  legal_name text,
  region text,
  legal_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_campaign_id text references public.leadgen_campaigns (id) on delete set null,
  last_campaign_id text references public.leadgen_campaigns (id) on delete set null,
  times_seen integer not null default 1 check (times_seen > 0),
  contact_status text,
  outreach_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leadgen_campaigns
  add column if not exists production_discovery_stats jsonb not null default '{}'::jsonb;

create table if not exists public.leadgen_email_stop_list (
  normalized_email text primary key,
  reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leadgen_discovered_companies_legal_id_uidx
  on public.leadgen_discovered_companies (legal_id)
  where legal_id is not null;
create unique index if not exists leadgen_discovered_companies_domain_uidx
  on public.leadgen_discovered_companies (normalized_domain)
  where normalized_domain is not null;
create index if not exists leadgen_discovered_companies_name_region_idx
  on public.leadgen_discovered_companies (normalized_name, region);

create table if not exists public.leadgen_outreach_queue (
  id text primary key,
  contact_id text not null references public.leadgen_contacts (id) on delete cascade,
  lead_id text not null references public.leadgen_leads (id) on delete cascade,
  campaign_id text not null references public.leadgen_campaigns (id) on delete cascade,
  company_id text references public.leadgen_companies (id) on delete cascade,
  company_name text not null,
  recipient_email text not null,
  normalized_recipient_email text not null,
  recipient_name text,
  recipient_role text,
  subject text not null,
  body text not null,
  message_mode text not null,
  message_version integer not null default 1 check (message_version > 0),
  status text not null check (status in (
    'draft','needs_review','approved','queued','sending','sent','failed',
    'paused','rejected','replied','follow_up_due','completed'
  )),
  approved_at timestamptz,
  queued_at timestamptz,
  scheduled_at timestamptz,
  next_attempt_at timestamptz,
  sending_started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  smtp_message_id text,
  provider text,
  idempotency_key text not null unique,
  approval_invalidated_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leadgen_outreach_queue_due_idx
  on public.leadgen_outreach_queue (status, next_attempt_at);
create index if not exists leadgen_outreach_queue_campaign_idx
  on public.leadgen_outreach_queue (campaign_id, status);
create index if not exists leadgen_outreach_queue_sent_at_idx
  on public.leadgen_outreach_queue (sent_at)
  where status = 'sent';
create unique index if not exists leadgen_outreach_queue_active_email_uidx
  on public.leadgen_outreach_queue (normalized_recipient_email)
  where status in ('queued', 'sending');
create unique index if not exists leadgen_outreach_queue_sent_email_uidx
  on public.leadgen_outreach_queue (normalized_recipient_email)
  where status = 'sent';
create unique index if not exists leadgen_outreach_queue_sent_company_uidx
  on public.leadgen_outreach_queue (company_id)
  where status = 'sent' and company_id is not null;

create table if not exists public.leadgen_outreach_settings (
  id text primary key default 'global' check (id = 'global'),
  is_paused boolean not null default false,
  paused_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.leadgen_outreach_settings (id)
values ('global')
on conflict (id) do nothing;

create or replace function public.claim_due_outreach_item(worker_id text)
returns setof public.leadgen_outreach_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id text;
begin
  update public.leadgen_outreach_queue
  set status = 'failed',
      failed_at = now(),
      last_error = 'Processor interrupted while sending; manual retry required.',
      updated_at = now()
  where status = 'sending'
    and sending_started_at < now() - interval '30 minutes';

  if exists (
    select 1 from public.leadgen_outreach_settings
    where id = 'global' and is_paused
  ) or exists (
    select 1 from public.leadgen_outreach_queue where status = 'sending'
  ) then
    return;
  end if;

  select id into claimed_id
  from public.leadgen_outreach_queue
  where status = 'queued'
    and coalesce(next_attempt_at, scheduled_at, now()) <= now()
  order by coalesce(next_attempt_at, scheduled_at, created_at), created_at
  for update skip locked
  limit 1;

  if claimed_id is null then
    return;
  end if;

  return query
  update public.leadgen_outreach_queue
  set status = 'sending',
      sending_started_at = now(),
      attempt_count = attempt_count + 1,
      last_error = null,
      updated_at = now(),
      provider = coalesce(provider, worker_id)
  where id = claimed_id and status = 'queued'
  returning *;
end;
$$;
