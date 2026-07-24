-- Fix: Personen anlegen (INSERT) oft durch fehlende RLS-Policies blockiert.
-- Einmal im Supabase SQL Editor ausführen.

alter table public.persons enable row level security;

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

-- optional: owner automatisch setzen
alter table public.persons
  alter column owner_user_id set default auth.uid();
