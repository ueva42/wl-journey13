-- WL-Journey: Personen komplett (Tabelle + RLS + Spalten)
-- Alles markieren, in Supabase SQL Editor einfügen, Run.
-- Sicher mehrfach ausführbar.

-- 1) Tabelle
create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  target_weight_kg numeric,
  created_at timestamptz not null default now()
);

create index if not exists persons_owner_idx on public.persons (owner_user_id);

alter table public.persons
  alter column owner_user_id set default auth.uid();

alter table public.persons enable row level security;

-- 2) RLS neu setzen
drop policy if exists "persons_select_own" on public.persons;
drop policy if exists "persons_insert_own" on public.persons;
drop policy if exists "persons_update_own" on public.persons;
drop policy if exists "persons_delete_own" on public.persons;

create policy "persons_select_own"
  on public.persons for select
  to authenticated
  using (auth.uid() = owner_user_id);

create policy "persons_insert_own"
  on public.persons for insert
  to authenticated
  with check (auth.uid() = owner_user_id);

create policy "persons_update_own"
  on public.persons for update
  to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "persons_delete_own"
  on public.persons for delete
  to authenticated
  using (auth.uid() = owner_user_id);

grant select, insert, update, delete on public.persons to authenticated;

-- 3) Eine Person pro bestehendem Profil
insert into public.persons (owner_user_id, display_name, target_weight_kg)
select
  p.user_id,
  coalesce(nullif(trim(p.display_name), ''), 'Ich'),
  p.target_weight_kg
from public.profiles p
where not exists (
  select 1 from public.persons x where x.owner_user_id = p.user_id
);

-- 4) weigh_ins.person_id
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

-- 5) training_entries.person_id
alter table public.training_entries
  add column if not exists person_id uuid references public.persons (id) on delete cascade;

update public.training_entries t
set person_id = p.id
from public.persons p
where t.person_id is null
  and p.owner_user_id = t.user_id;
