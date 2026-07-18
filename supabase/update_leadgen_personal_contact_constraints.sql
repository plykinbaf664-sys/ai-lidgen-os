do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.leadgen_contacts'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%contact_type%'
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.leadgen_contacts drop constraint %I',
      constraint_name
    );
  end if;
end $$;

alter table public.leadgen_contacts
  add constraint leadgen_contacts_contact_type_check
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
  );

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.leadgen_leads'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%contact_channel%'
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.leadgen_leads drop constraint %I',
      constraint_name
    );
  end if;
end $$;

alter table public.leadgen_leads
  add constraint leadgen_leads_contact_channel_check
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
  );

notify pgrst, 'reload schema';
