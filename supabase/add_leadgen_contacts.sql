create table if not exists public.leadgen_contacts (
  id text primary key,
  pipeline_run_id text not null,
  campaign_id text not null
    references public.leadgen_campaigns (id)
    on delete cascade,
  company_id text not null
    references public.leadgen_companies (id)
    on delete cascade,
  lead_id text not null
    references public.leadgen_leads (id)
    on delete cascade,
  contact_type text not null
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
    ),
  full_name text,
  role_title text,
  department text,
  email text,
  linkedin_url text,
  telegram_url text,
  contact_url text,
  source_url text,
  source_label text,
  confidence_score numeric not null default 0
    check (confidence_score >= 0 and confidence_score <= 100),
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists leadgen_contacts_pipeline_run_id_idx
  on public.leadgen_contacts (pipeline_run_id);

create index if not exists leadgen_contacts_campaign_id_idx
  on public.leadgen_contacts (campaign_id);

create index if not exists leadgen_contacts_company_id_idx
  on public.leadgen_contacts (company_id);

create index if not exists leadgen_contacts_lead_id_idx
  on public.leadgen_contacts (lead_id);

create index if not exists leadgen_contacts_contact_type_idx
  on public.leadgen_contacts (contact_type);

create index if not exists leadgen_contacts_is_primary_idx
  on public.leadgen_contacts (is_primary);

notify pgrst, 'reload schema';
