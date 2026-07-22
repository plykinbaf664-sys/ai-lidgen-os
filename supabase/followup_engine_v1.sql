-- Leadgen OS Follow-up Engine v1. Safe, additive migration.
alter table public.leadgen_outreach_queue
  add column if not exists message_kind text not null default 'initial',
  add column if not exists parent_outreach_id text references public.leadgen_outreach_queue (id) on delete restrict,
  add column if not exists followup_number integer,
  add column if not exists parent_smtp_message_id text,
  add column if not exists reply_check_status text not null default 'pending',
  add column if not exists reply_checked_at timestamptz,
  add column if not exists reply_detected_at timestamptz,
  add column if not exists reply_message_id text,
  add column if not exists reply_from text,
  add column if not exists reply_subject text,
  add column if not exists reply_detection_method text,
  add column if not exists generation_reason text,
  add column if not exists skip_reason text,
  add column if not exists copy_review_status text;

alter table public.leadgen_outreach_queue
  drop constraint if exists leadgen_outreach_queue_status_check;
alter table public.leadgen_outreach_queue
  add constraint leadgen_outreach_queue_status_check check (status in (
    'draft','needs_review','approved','queued','sending','sent','failed','paused',
    'rejected','replied','follow_up_due','completed','eligible','generating','skipped','cancelled'
  ));

alter table public.leadgen_outreach_queue
  drop constraint if exists leadgen_outreach_queue_message_kind_check;
alter table public.leadgen_outreach_queue
  add constraint leadgen_outreach_queue_message_kind_check
  check (message_kind in ('initial', 'follow_up'));

alter table public.leadgen_outreach_queue
  drop constraint if exists leadgen_outreach_queue_followup_number_check;
alter table public.leadgen_outreach_queue
  add constraint leadgen_outreach_queue_followup_number_check check (
    (message_kind = 'initial' and followup_number is null and parent_outreach_id is null)
    or
    (message_kind = 'follow_up' and followup_number is not null and followup_number > 0
      and parent_outreach_id is not null)
  );

drop index if exists public.leadgen_outreach_queue_active_email_uidx;
drop index if exists public.leadgen_outreach_queue_sent_email_uidx;
drop index if exists public.leadgen_outreach_queue_sent_company_uidx;

create unique index if not exists leadgen_outreach_queue_active_initial_email_uidx
  on public.leadgen_outreach_queue (normalized_recipient_email)
  where message_kind = 'initial' and status in ('queued', 'sending');
create unique index if not exists leadgen_outreach_queue_sent_initial_email_uidx
  on public.leadgen_outreach_queue (normalized_recipient_email)
  where message_kind = 'initial' and status = 'sent';
create unique index if not exists leadgen_outreach_queue_sent_initial_company_uidx
  on public.leadgen_outreach_queue (company_id)
  where message_kind = 'initial' and status = 'sent' and company_id is not null;
create unique index if not exists leadgen_outreach_queue_followup_uidx
  on public.leadgen_outreach_queue (parent_outreach_id, followup_number);
create unique index if not exists leadgen_outreach_queue_active_followup_uidx
  on public.leadgen_outreach_queue (parent_outreach_id, followup_number)
  where message_kind = 'follow_up' and status in ('approved', 'queued', 'sending', 'sent');
create index if not exists leadgen_outreach_queue_reply_scan_idx
  on public.leadgen_outreach_queue (message_kind, status, sent_at, reply_check_status);

create table if not exists public.leadgen_followup_scan_lock (
  id text primary key default 'global' check (id = 'global'),
  locked_until timestamptz,
  locked_by text,
  updated_at timestamptz not null default now()
);
insert into public.leadgen_followup_scan_lock (id) values ('global')
on conflict (id) do nothing;

alter table public.leadgen_outreach_settings
  add column if not exists followup_paused boolean not null default false;

create or replace function public.claim_due_outreach_item(worker_id text)
returns setof public.leadgen_outreach_queue
language plpgsql
security definer
set search_path = public
as $$
declare claimed_id text;
begin
  update public.leadgen_outreach_queue set status = 'failed', failed_at = now(),
    last_error = 'Processor interrupted while sending; manual retry required.', updated_at = now()
  where status = 'sending' and sending_started_at < now() - interval '30 minutes';

  if exists (select 1 from public.leadgen_outreach_settings where id = 'global' and is_paused)
    or exists (select 1 from public.leadgen_outreach_queue where status = 'sending') then
    return;
  end if;

  select q.id into claimed_id
  from public.leadgen_outreach_queue q
  cross join public.leadgen_outreach_settings s
  where q.status = 'queued'
    and coalesce(q.next_attempt_at, q.scheduled_at, now()) <= now()
    and not (q.message_kind = 'follow_up' and s.followup_paused)
  order by coalesce(q.next_attempt_at, q.scheduled_at, q.created_at), q.created_at
  for update of q skip locked limit 1;

  if claimed_id is null then return; end if;
  return query update public.leadgen_outreach_queue
  set status = 'sending', sending_started_at = now(), attempt_count = attempt_count + 1,
    last_error = null, updated_at = now(), provider = coalesce(provider, worker_id)
  where id = claimed_id and status = 'queued' returning *;
end;
$$;

create or replace function public.claim_followup_reply_scan(worker_id text, lock_seconds integer default 120)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  update public.leadgen_followup_scan_lock
  set locked_until = now() + make_interval(secs => greatest(30, least(lock_seconds, 600))),
      locked_by = worker_id,
      updated_at = now()
  where id = 'global' and (locked_until is null or locked_until < now() or locked_by = worker_id);
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

create or replace function public.release_followup_reply_scan(worker_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.leadgen_followup_scan_lock
  set locked_until = null, locked_by = null, updated_at = now()
  where id = 'global' and locked_by = worker_id;
$$;
