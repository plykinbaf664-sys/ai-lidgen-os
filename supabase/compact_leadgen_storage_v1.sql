-- Leadgen OS storage compaction v1.
-- Safe and idempotent: removes duplicated JSON keys only. No rows are deleted.
begin;

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
  - 'lead_ready_candidate',
  updated_at = now()
where metadata ?| array[
  'identity_profile',
  'lead_ready_candidate'
];

commit;
