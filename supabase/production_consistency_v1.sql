-- Optional atomic helper for production consistency recovery.
-- Application recovery uses the same conditional transitions and remains compatible before this migration is applied.
create or replace function public.recover_leadgen_outreach_consistency()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer := 0;
declare changed integer := 0;
begin
  update public.leadgen_outreach_queue
  set status = 'failed', failed_at = now(), scheduled_at = null, next_attempt_at = null,
      last_error = 'Recovery: sending was stale for more than 30 minutes; manual review required.', updated_at = now()
  where status = 'sending' and (sending_started_at is null or sending_started_at < now() - interval '30 minutes');
  get diagnostics changed = row_count; affected := affected + changed;

  update public.leadgen_outreach_queue
  set status = 'approved', queued_at = null, scheduled_at = null, next_attempt_at = null,
      last_error = 'Recovery: queued item had no schedule and was returned to approved.', updated_at = now()
  where status = 'queued' and scheduled_at is null and next_attempt_at is null;
  get diagnostics changed = row_count; affected := affected + changed;

  update public.leadgen_outreach_queue set scheduled_at = null, next_attempt_at = null, updated_at = now()
  where status = 'failed' and (scheduled_at is not null or next_attempt_at is not null);
  get diagnostics changed = row_count; affected := affected + changed;

  update public.leadgen_outreach_queue set scheduled_at = null, next_attempt_at = null, queued_at = null, updated_at = now()
  where status = 'approved' and (scheduled_at is not null or next_attempt_at is not null);
  get diagnostics changed = row_count; affected := affected + changed;

  update public.leadgen_outreach_queue
  set last_error = 'Unknown structured error. Repeat the operation for fresh diagnostics.', updated_at = now()
  where last_error like '%[object Object]%';
  get diagnostics changed = row_count; affected := affected + changed;

  update public.leadgen_outreach_queue f
  set status = 'failed', failed_at = now(), scheduled_at = null, next_attempt_at = null,
      last_error = 'Recovery: follow-up parent is missing or inconsistent.', updated_at = now()
  where f.message_kind = 'follow_up' and f.status in ('queued', 'sending')
    and not exists (
      select 1 from public.leadgen_outreach_queue p
      where p.id = f.parent_outreach_id and p.status = 'sent' and p.smtp_message_id is not null
    );
  get diagnostics changed = row_count; affected := affected + changed;

  update public.leadgen_outreach_queue f
  set status = 'skipped', skip_reason = 'reply_detected', scheduled_at = null, next_attempt_at = null, updated_at = now()
  from public.leadgen_outreach_queue p
  where f.message_kind = 'follow_up' and f.status in ('queued', 'sending')
    and p.id = f.parent_outreach_id and p.reply_detected_at is not null;
  get diagnostics changed = row_count; affected := affected + changed;

  update public.leadgen_outreach_queue f
  set status = 'approved', queued_at = null, scheduled_at = null, next_attempt_at = null,
      last_error = 'Recovery: reply verification is unavailable; sending remains blocked.', updated_at = now()
  from public.leadgen_outreach_queue p
  where f.message_kind = 'follow_up' and f.status in ('queued', 'sending')
    and p.id = f.parent_outreach_id and p.reply_detected_at is null
    and p.reply_check_status <> 'verified';
  get diagnostics changed = row_count; affected := affected + changed;
  return affected;
end;
$$;
