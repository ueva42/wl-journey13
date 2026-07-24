-- Körpergröße an weigh_ins (einmal im SQL Editor ausführen)
alter table public.weigh_ins
  add column if not exists height_cm numeric;
