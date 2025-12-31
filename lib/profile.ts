import { supabaseBrowser } from "./supabase/browser";

export async function ensureProfile() {
  const supabase = supabaseBrowser();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if (!user) throw new Error("Nicht eingeloggt.");

  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("user_id, display_name, active_group_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing;

  const display =
    (user.user_metadata as any)?.display_name ||
    (user.user_metadata as any)?.full_name ||
    null;

  const { data: ins, error: insErr } = await supabase
    .from("profiles")
    .insert({ user_id: user.id, display_name: display })
    .select()
    .single();

  if (insErr) throw insErr;
  return ins;
}

export async function setActiveGroup(groupId: string | null) {
  const supabase = supabaseBrowser();
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if (!user) throw new Error("Nicht eingeloggt.");

  const { error } = await supabase
    .from("profiles")
    .update({ active_group_id: groupId })
    .eq("user_id", user.id);

  if (error) throw error;
}
