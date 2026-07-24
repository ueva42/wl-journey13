-- Fortsetzen nach FK-Fehler (verwaiste profiles ohne auth.users)
-- Alles kopieren → SQL Editor → Run

-- Personen nur für echte Auth-User anlegen
insert into public.persons (owner_user_id, display_name, target_weight_kg)
select
  p.user_id,
  coalesce(nullif(trim(p.display_name), ''), 'Ich'),
  p.target_weight_kg
from public.profiles p
inner join auth.users u on u.id = p.user_id
where not exists (
  select 1 from public.persons x where x.owner_user_id = p.user_id
);

-- weigh_ins.person_id nachziehen
alter table public.weigh_ins
  add column if not exists person_id uuid references public.persons (id) on delete cascade;

update public.weigh_ins w
set person_id = p.id
from public.persons p
where w.person_id is null
  and p.owner_user_id = w.user_id;

do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.weigh_ins'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) ilike '%user_id%entry_date%';
  if cname is not null then
    execute format('alter table public.weigh_ins drop constraint %I', cname);
  end if;
end $$;

create unique index if not exists weigh_ins_person_date_uidx
  on public.weigh_ins (person_id, entry_date)
  where person_id is not null;

-- training_entries.person_id nachziehen
alter table public.training_entries
  add column if not exists person_id uuid references public.persons (id) on delete cascade;

update public.training_entries t
set person_id = p.id
from public.persons p
where t.person_id is null
  and p.owner_user_id = t.user_id;
