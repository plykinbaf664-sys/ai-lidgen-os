-- Stores only structured reply outcomes; message bodies are not persisted.
do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.leadgen_leads'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.leadgen_leads drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.leadgen_leads
  add constraint leadgen_leads_status_check check (
    status in ('new', 'approved', 'rejected', 'paused', 'replied', 'interested')
  );

notify pgrst, 'reload schema';
