"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureProfile, setActiveGroup } from "@/lib/profile";
import { makeGroupCode, normalizeCode } from "@/lib/groupCode";

type Group = { id: string; name: string; code: string; owner_id: string };
type Member = { user_id: string; role: string; display_name: string; joined_at: string };

type GroupMember = {
  user_id: string;
  username?: string | null;
  role: "owner" | "member";
  joined_at?: string | null;
};


export default function GroupPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();

  const [status, setStatus] = useState("");
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // Anzeigename
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Create/Join
  const [newName, setNewName] = useState("Meine Gruppe");
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Owner actions
  const [renaming, setRenaming] = useState(false);
  const [regen, setRegen] = useState(false);
  const [kickingUserId, setKickingUserId] = useState<string | null>(null);

  const isOwner = !!group?.owner_id && !!myUserId && group.owner_id === myUserId;

  useEffect(() => {
    (async () => {
      try {
        setStatus("");

        // sorgt dafür, dass profiles-row existiert (falls du kein Trigger hast)
        await ensureProfile();

        const { data: u } = await supabase.auth.getUser();
        const user = u.user;
        setMyUserId(user?.id ?? null);

        if (user) {
          // aktuellen Anzeigenamen laden
          const { data: prof, error: pErr } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("user_id", user.id)
            .maybeSingle();
          if (pErr) throw pErr;
          setDisplayName(prof?.display_name ?? "");
        }

        await loadActiveGroupAndMembers();
      } catch (e: any) {
        setStatus(e?.message ?? String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadActiveGroupAndMembers() {
    const { data: u } = await supabase.auth.getUser();
    const user = u.user;
    if (!user) {
      setGroup(null);
      setMembers([]);
      return;
    }

    // active_group_id aus profile
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("active_group_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) throw pErr;

    if (!prof?.active_group_id) {
      setGroup(null);
      setMembers([]);
      return;
    }

    // group holen
    const { data: g, error: gErr } = await supabase
      .from("groups")
      .select("id, name, code, owner_id")
      .eq("id", prof.active_group_id)
      .single();

    if (gErr) throw gErr;
    setGroup(g);

    // members holen
    const { data: ms, error: mErr } = await supabase
      .from("group_members")
      .select("user_id, role, created_at")
      .eq("group_id", g.id);

    if (mErr) throw mErr;

    const userIds = (ms ?? []).map((x: any) => x.user_id);
    if (userIds.length === 0) {
      setMembers([]);
      return;
    }

    const { data: ps, error: prErr } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);

    if (prErr) throw prErr;

    const nameMap = new Map((ps ?? []).map((p: any) => [p.user_id, p.display_name || "—"]));

    const merged: Member[] = (ms ?? [])
      .map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        display_name: nameMap.get(m.user_id) ?? "—",
        joined_at: m.created_at,
      }))
      .sort((a: GroupMember, b: GroupMember) => {
  const ra = a.role === "owner" ? 0 : 1;
  const rb = b.role === "owner" ? 0 : 1;
  return ra - rb;
});


    setMembers(merged);
  }

  async function saveDisplayName() {
    try {
      setSavingName(true);
      setStatus("");

      const name = displayName.trim();
      if (name.length < 2) throw new Error("Name zu kurz (mind. 2 Zeichen).");

      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) throw new Error("Nicht eingeloggt.");

      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name })
        .eq("user_id", user.id);

      if (error) throw error;

      setStatus("Anzeigename gespeichert.");
      await loadActiveGroupAndMembers();
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setSavingName(false);
    }
  }

  async function createGroup() {
    try {
      setCreating(true);
      setStatus("");

      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) throw new Error("Nicht eingeloggt.");

      const name = newName.trim();
      if (name.length < 2) throw new Error("Gruppenname zu kurz.");

      const code = makeGroupCode(6);

      // 1) group insert
      const { data: g, error } = await supabase
        .from("groups")
        .insert({ name, code, owner_id: user.id })
        .select("id, name, code, owner_id")
        .single();

      if (error) throw new Error("groups insert: " + error.message);
      if (!g?.id) throw new Error("groups insert: keine id zurückbekommen");

      // 2) owner als member eintragen
      const { error: mErr } = await supabase
        .from("group_members")
        .insert({ group_id: g.id, user_id: user.id, role: "owner" });

      if (mErr && !String(mErr.message).toLowerCase().includes("duplicate")) {
        throw new Error("group_members insert: " + mErr.message);
      }

      // 3) active group setzen
      await setActiveGroup(g.id);

      setStatus(`Gruppe erstellt. Code: ${g.code ?? code}`);
      await loadActiveGroupAndMembers();
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  }

  async function joinGroup() {
    try {
      setJoining(true);
      setStatus("");

      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) throw new Error("Nicht eingeloggt.");

      const code = normalizeCode(joinCode);
      if (code.length < 4) throw new Error("Bitte gültigen Gruppen-Code eingeben.");

      const { data: g, error: gErr } = await supabase
        .from("groups")
        .select("id, name, code, owner_id")
        .eq("code", code)
        .maybeSingle();

      if (gErr) throw gErr;
      if (!g) throw new Error("Gruppe nicht gefunden (Code falsch).");

      const { error: mErr } = await supabase
        .from("group_members")
        .insert({ group_id: g.id, user_id: user.id, role: "member" });

      if (mErr && !String(mErr.message).toLowerCase().includes("duplicate")) throw mErr;

      await setActiveGroup(g.id);

      setStatus(`Beigetreten: ${g.name}`);
      await loadActiveGroupAndMembers();
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setJoining(false);
    }
  }

  async function leaveGroup() {
    try {
      setStatus("");
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) throw new Error("Nicht eingeloggt.");
      if (!group) throw new Error("Keine aktive Gruppe.");

      if (isOwner) {
        const others = members.filter((m) => m.user_id !== user.id);
        if (others.length > 0) {
          throw new Error(
            "Als Owner kannst du nicht verlassen, solange andere Mitglieder drin sind. Entferne sie zuerst oder übergib Ownership (später)."
          );
        }
      }

      const { error: delErr } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", group.id)
        .eq("user_id", user.id);

      if (delErr) throw delErr;

      await setActiveGroup(null);

      setGroup(null);
      setMembers([]);
      setStatus("Du hast die Gruppe verlassen.");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    }
  }

  async function renameGroup() {
    try {
      if (!group) return;
      if (!isOwner) throw new Error("Nur der Owner darf umbenennen.");

      setRenaming(true);
      setStatus("");

      const name = newName.trim();
      if (name.length < 2) throw new Error("Gruppenname zu kurz.");

      const { error } = await supabase.from("groups").update({ name }).eq("id", group.id);
      if (error) throw error;

      setStatus("Gruppenname aktualisiert.");
      await loadActiveGroupAndMembers();
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setRenaming(false);
    }
  }

  async function regenerateCode() {
    try {
      if (!group) return;
      if (!isOwner) throw new Error("Nur der Owner darf den Code ändern.");

      setRegen(true);
      setStatus("");

      const code = makeGroupCode(6);
      const { error } = await supabase.from("groups").update({ code }).eq("id", group.id);
      if (error) throw error;

      setStatus(`Neuer Code: ${code}`);
      await loadActiveGroupAndMembers();
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setRegen(false);
    }
  }

  async function kickMember(userId: string) {
    try {
      if (!group) return;
      if (!isOwner) throw new Error("Nur der Owner darf Mitglieder entfernen.");
      if (userId === myUserId) throw new Error("Du kannst dich nicht selbst kicken.");
      setKickingUserId(userId);
      setStatus("");

      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", group.id)
        .eq("user_id", userId);

      if (error) throw error;

      setStatus("Mitglied entfernt.");
      await loadActiveGroupAndMembers();
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setKickingUserId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meine Gruppe</h1>
        <div className="flex gap-3">
          <button
            className="text-sm underline opacity-80 hover:opacity-100"
            onClick={() => router.push("/group/dashboard")}
          >
            Gruppen-Dashboard
          </button>
          <button
            className="text-sm underline opacity-80 hover:opacity-100"
            onClick={() => router.push("/dashboard")}
          >
            Zum Dashboard
          </button>
        </div>
      </div>

      {/* Anzeigename */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-5 space-y-3">
        <div className="text-sm font-semibold opacity-90">Dein Anzeigename</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="z.B. Steffen"
            className="flex-1 min-w-[220px] rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={saveDisplayName}
            disabled={savingName}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            {savingName ? "Speichere..." : "Speichern"}
          </button>
        </div>
        <div className="text-xs opacity-70">
          Dieser Name wird in deiner Gruppe angezeigt.
        </div>
      </div>

      {/* Aktive Gruppe */}
      {group ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{group.name}</div>
              <div className="text-sm opacity-80">
                Gruppen-Code: <span className="font-mono font-semibold">{group.code}</span>
              </div>
            </div>

            <button
              onClick={leaveGroup}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
            >
              Gruppe verlassen
            </button>
          </div>

          {/* Mitglieder */}
          <div className="space-y-2">
            <div className="text-sm font-semibold opacity-90">Mitglieder ({members.length})</div>
            <div className="divide-y divide-white/10 rounded-xl border border-white/10">
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center justify-between p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {m.display_name}{" "}
                      {m.user_id === myUserId ? <span className="opacity-70">(du)</span> : null}
                    </div>
                    <div className="text-xs opacity-70">Rolle: {m.role}</div>
                  </div>

                  {isOwner && m.user_id !== myUserId && (
                    <button
                      onClick={() => kickMember(m.user_id)}
                      disabled={kickingUserId === m.user_id}
                      className="rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/10 disabled:opacity-50"
                    >
                      {kickingUserId === m.user_id ? "Entferne..." : "Entfernen"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Owner Aktionen */}
          {isOwner && (
            <div className="pt-2 space-y-3">
              <div className="text-sm font-semibold opacity-90">Owner-Aktionen</div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 min-w-[220px] rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
                />
                <button
                  onClick={renameGroup}
                  disabled={renaming}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
                >
                  {renaming ? "Speichere..." : "Umbenennen"}
                </button>
                <button
                  onClick={regenerateCode}
                  disabled={regen}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
                >
                  {regen ? "..." : "Code neu"}
                </button>
              </div>

              <div className="text-xs opacity-70">
                Hinweis: Wenn du den Code neu erzeugst, können andere nur noch mit dem neuen Code beitreten.
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-5 space-y-4">
          <div className="text-sm opacity-80">Du hast aktuell keine aktive Gruppe.</div>

          {/* Erstellen */}
          <div className="rounded-xl border border-white/10 p-4 space-y-2">
            <div className="font-semibold">Gruppe erstellen</div>
            <div className="flex flex-wrap gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 min-w-[220px] rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={createGroup}
                disabled={creating}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
              >
                {creating ? "Erstelle..." : "Erstellen"}
              </button>
            </div>
          </div>

          {/* Beitreten */}
          <div className="rounded-xl border border-white/10 p-4 space-y-2">
            <div className="font-semibold">Gruppe beitreten</div>
            <div className="flex flex-wrap gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Code z.B. AB12CD"
                className="flex-1 min-w-[220px] rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
                style={{ textTransform: "uppercase" }}
              />
              <button
                onClick={joinGroup}
                disabled={joining}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
              >
                {joining ? "Trete bei..." : "Beitreten"}
              </button>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          {status}
        </div>
      )}
    </div>
  );
}
<div style={{opacity:.5,fontSize:12}}>DEPLOY ffc118e</div>
