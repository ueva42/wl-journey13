import { supabaseBrowser } from "./supabase/browser";

export type Person = {
  id: string;
  owner_user_id: string;
  display_name: string;
  target_weight_kg: number | null;
};

const ACTIVE_KEY = "wl-active-person-id";

export function getStoredActivePersonId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setStoredActivePersonId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!id) localStorage.removeItem(ACTIVE_KEY);
    else localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}

function mapPerson(row: any): Person {
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    display_name: row.display_name ?? "—",
    target_weight_kg:
      row.target_weight_kg == null ? null : Number(row.target_weight_kg),
  };
}

/** Lädt Personen; legt bei leerer Liste eine Default-Person aus dem Profil an. */
export async function loadOrCreatePersons(ownerUserId: string): Promise<Person[]> {
  const supabase = supabaseBrowser();

  const { data, error } = await supabase
    .from("persons")
    .select("id, owner_user_id, display_name, target_weight_kg")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: true });

  if (error) {
    if (error.message?.includes("persons") || error.code === "42P01") {
      throw new Error(
        "Tabelle „persons“ fehlt. Bitte supabase/migration_persons.sql im Supabase SQL Editor ausführen."
      );
    }
    throw error;
  }

  if ((data ?? []).length > 0) {
    return (data ?? []).map(mapPerson);
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name, target_weight_kg")
    .eq("user_id", ownerUserId)
    .maybeSingle();

  const display =
    (prof?.display_name && String(prof.display_name).trim()) || "Ich";

  const { data: created, error: insErr } = await supabase
    .from("persons")
    .insert({
      owner_user_id: ownerUserId,
      display_name: display,
      target_weight_kg: prof?.target_weight_kg ?? null,
    })
    .select("id, owner_user_id, display_name, target_weight_kg")
    .single();

  if (insErr) {
    if (insErr.message?.includes("persons") || insErr.code === "42P01") {
      throw new Error(
        "Tabelle „persons“ fehlt. Bitte supabase/migration_persons.sql im Supabase SQL Editor ausführen."
      );
    }
    throw insErr;
  }

  return [mapPerson(created)];
}

export function pickActivePerson(persons: Person[], preferredId?: string | null): Person | null {
  if (!persons.length) return null;
  const want = preferredId || getStoredActivePersonId();
  const found = want ? persons.find((p) => p.id === want) : null;
  return found ?? persons[0];
}

export async function createPerson(ownerUserId: string, displayName: string): Promise<Person> {
  const supabase = supabaseBrowser();
  const name = displayName.trim();
  if (!name) throw new Error("Name fehlt.");

  const { data, error } = await supabase
    .from("persons")
    .insert({
      owner_user_id: ownerUserId,
      display_name: name,
      target_weight_kg: null,
    })
    .select("id, owner_user_id, display_name, target_weight_kg")
    .single();

  if (error) {
    const msg = error.message || String(error);
    if (/row-level security|RLS|policy/i.test(msg)) {
      throw new Error(
        "Anlegen blockiert (RLS). Bitte supabase/fix_persons_rls.sql im SQL Editor ausführen."
      );
    }
    if (error.code === "42P01" || /persons/i.test(msg) && /does not exist/i.test(msg)) {
      throw new Error(
        "Tabelle „persons“ fehlt. Bitte supabase/migration_persons.sql ausführen."
      );
    }
    throw new Error(msg);
  }
  if (!data) throw new Error("Person wurde nicht angelegt (keine Daten zurück).");
  return mapPerson(data);
}

export async function renamePerson(personId: string, displayName: string): Promise<void> {
  const supabase = supabaseBrowser();
  const name = displayName.trim();
  if (!name) throw new Error("Name fehlt.");

  const { error } = await supabase
    .from("persons")
    .update({ display_name: name })
    .eq("id", personId);

  if (error) throw error;
}

export async function deletePerson(personId: string): Promise<void> {
  const supabase = supabaseBrowser();
  const { error } = await supabase.from("persons").delete().eq("id", personId);
  if (error) throw error;
}

export async function updatePersonTarget(
  personId: string,
  targetWeightKg: number
): Promise<void> {
  const supabase = supabaseBrowser();
  const { error } = await supabase
    .from("persons")
    .update({ target_weight_kg: targetWeightKg })
    .eq("id", personId);
  if (error) throw error;
}
