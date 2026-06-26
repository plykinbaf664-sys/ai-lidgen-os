alter table public.leadgen_companies
  add column if not exists icp_fit_score numeric not null default 0
    check (icp_fit_score >= 0 and icp_fit_score <= 100);

alter table public.leadgen_leads
  add column if not exists icp_fit_score numeric not null default 0
    check (icp_fit_score >= 0 and icp_fit_score <= 100);

create index if not exists leadgen_companies_icp_fit_score_idx
  on public.leadgen_companies (icp_fit_score);

notify pgrst, 'reload schema';
