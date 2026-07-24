-- WL-Journey: Personen unter einem Login (Gewicht + Training)
-- Im Supabase SQL Editor einmal ausführen.

-- 1) persons
create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  target_weight_kg numeric,
  created_at timestamptz not null default now()
);

create index if not exists persons_owner_idx on public.persons (owner_user_id);

alter table public.persons enable row level security;

drop policy if exists "persons_select_own" on public.persons;
drop policy if exists "persons_insert_own" on public.persons;
drop policy if exists "persons_update_own" on public.persons;
drop policy if exists "persons_delete_own" on public.persons;

create policy "persons_select_own"
  on public.persons for select
  using (auth.uid() = owner_user_id);

create policy "persons_insert_own"
  on public.persons for insert
  with check (auth.uid() = owner_user_id);

create policy "persons_update_own"
  on public.persons for update
  using (auth.uid() = owner_user_id);

create policy "persons_delete_own"
  on public.persons for delete
  using (auth.uid() = owner_user_id);

grant select, insert, update, delete on public.persons to authenticated;

-- 2) Backfill: eine Person pro bestehendem Profil
insert into public.persons (owner_user_id, display_name, target_weight_kg)
select
  p.user_id,
  coalesce(nullif(trim(p.display_name), ''), 'Ich'),
  p.target_weight_kg
from public.profiles p
where not exists (
  select 1 from public.persons x where x.owner_user_id = p.user_id
);

-- 3) weigh_ins.person_id
alter table public.weigh_ins
  add column if not exists person_id uuid references public.persons (id) on delete cascade;

update public.weigh_ins w
set person_id = p.id
from public.persons p
where w.person_id is null
  and p.owner_user_id = w.user_id;

-- alte Unique (user_id, entry_date) entfernen falls vorhanden
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
  on public.weigh_ins (person_id, entry_date);

-- 4) training_entries.person_id
alter table public.training_entries
  add column if not exists person_id uuid references public.persons (id) on delete cascade;

update public.training_entries t
set person_id = p.id
from public.persons p
where t.person_id is null
  and p.owner_user_id = t.user_id;

-- optional: Kartoffel-Feature abschalten (Tabellen bleiben, App nutzt sie nicht mehr)
-- drop table if exists public.potato_events;
-- drop table if exists public.potato_rules;
