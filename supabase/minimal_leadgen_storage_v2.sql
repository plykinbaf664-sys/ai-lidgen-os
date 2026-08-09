-- Leadgen OS minimal storage v2.
-- Apply manually after Supabase access is restored.
-- Delivery, deduplication, contacts, signals and campaign analytics are preserved.
begin;

-- These events duplicate canonical campaign/lead/outreach state and are no longer
-- written by the application.
delete from public.leadgen_events;

-- Keep notifications that still require attention. Old successfully delivered
-- Telegram card copies are not part of the canonical operating state.
delete from public.leadgen_telegram_notifications
where status = 'sent'
  and created_at < now() - interval '7 days';

-- Remove duplicated/transient JSON that is already represented by canonical rows.
update public.leadgen_contacts
set metadata = metadata
  - 'identity_profile'
  - 'alternative_channels'
  - 'alternative_channel_ids'
where metadata ?| array[
  'identity_profile',
  'alternative_channels',
  'alternative_channel_ids'
];

update public.leadgen_companies
set metadata = metadata
  - 'identity_profile'
  - 'lead_ready_candidate'
  - 'raw_search_results'
  - 'search_response'
  - 'provider_response'
  - 'provider_responses'
  - 'raw_html'
  - 'html'
  - 'telegram_preview'
  - 'diagnostics',
  updated_at = now()
where metadata ?| array[
  'identity_profile',
  'lead_ready_candidate',
  'raw_search_results',
  'search_response',
  'provider_response',
  'provider_responses',
  'raw_html',
  'html',
  'telegram_preview',
  'diagnostics'
];

-- Contact-discovery facts remain in canonical contact rows. These arrays are
-- transient crawl diagnostics and were the largest repeated JSON payload.
update public.leadgen_companies
set metadata = jsonb_set(
  metadata,
  '{contact_discovery}',
  coalesce(metadata->'contact_discovery', '{}'::jsonb)
    - 'queries_executed'
    - 'urls_inspected'
    - 'provider_errors'
    - 'email_pages_audit'
    - 'emails_rejected'
    - 'ranked_email_candidates'
    - 'raw_search_results'
    - 'rendered_html',
  true
), updated_at = now()
where metadata ? 'contact_discovery';

-- Preserve canonical counters, but remove raw provider/search artifacts.
update public.leadgen_campaigns
set production_discovery_stats = production_discovery_stats
  - 'raw_search_results'
  - 'provider_responses'
  - 'search_pages'
  - 'diagnostics'
where production_discovery_stats is not null;

-- SMTP Message-ID/status/timestamps remain first-class columns. Provider raw
-- responses and generated HTML are not required for delivery history.
update public.leadgen_outreach_queue
set metadata = coalesce(metadata, '{}'::jsonb)
  - 'smtp_response'
  - 'provider_response'
  - 'body_html'
  - 'raw_html'
  - 'diagnostics'
  - 'telegram_preview'
where metadata ?| array[
  'smtp_response', 'provider_response', 'body_html', 'raw_html',
  'diagnostics', 'telegram_preview'
];

commit;
