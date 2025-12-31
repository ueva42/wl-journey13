"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ensureProfile } from "@/lib/profile";

type Rule = {
  id: string;
  group_id: string;
  title: string;
  points: number;
  active: boolean;
};

export default function PotatoesRulesPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();

  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [groupId, setGroupId] = useState<string | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);

  // create form
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState<number>(1);
  const [creating, setCreating] = useState(false);

  // update state
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setStatus("");
        setLoading(true);

        await ensureProfile();

        const { data: u } = await supabase.auth.getUser();
        const user = u.user;
        if (!user) {
          router.push("/login");
          return;
        }

        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("active_group_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (pErr) throw pErr;

        if (!prof?.active_group_id) {
          setGroupId(null);
          setRules([]);
          setStatus("Du bist aktuell in keiner aktiven Gruppe.");
          return;
        }

        setGroupId(prof.active_group_id);
        await loadRules(prof.active_group_id);
      } catch (e: any) {
        setStatus(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRules(gid: string) {
    const { data, error } = await supabase
      .from("potato_rules")
      .select("id, group_id, title, points, active")
      .eq("group_id", gid)
      .order("active", { ascending: false })
      .order("points", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    setRules(
      (data ?? []).map((r: any) => ({
        id: r.id,
        group_id: r.group_id,
        title: r.title ?? "",
        points: Number(r.points ?? 0),
        active: !!r.active,
      }))
    );
  }

  async function createRule() {
    if (!groupId) return;

    try {
      setCreating(true);
      setStatus("");

      const clean = title.trim();
      if (clean.length < 2) throw new Error("Regeltext zu kurz.");
      const pts = Number(points);
      if (!Number.isFinite(pts)) throw new Error("Punkte ungültig.");

      const { data, error } = await supabase
        .from("potato_rules")
        .insert({
          group_id: groupId,
          title: clean, // ✅ korrekt
          points: pts,
          active: true,
        })
        .select("id, group_id, title, points, active")
        .single();

      if (error) throw error;

      setRules((prev) => [
        {
          id: data.id,
          group_id: data.group_id,
          title: data.title ?? "",
          points: Number(data.points ?? 0),
          active: !!data.active,
        },
        ...prev,
      ]);

      setTitle("");
      setPoints(1);
      setStatus("Regel hinzugefügt.");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(rule: Rule) {
    try {
      setBusyId(rule.id);
      setStatus("");

      const { error } = await supabase
        .from("potato_rules")
        .update({ active: !rule.active })
        .eq("id", rule.id);

      if (error) throw error;

      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r))
      );
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function updatePoints(ruleId: string, newPoints: number) {
    try {
      setBusyId(ruleId);
      setStatus("");

      if (!Number.isFinite(newPoints)) throw new Error("Punkte ungültig.");

      const { error } = await supabase
        .from("potato_rules")
        .update({ points: newPoints })
        .eq("id", ruleId);

      if (error) throw error;

      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, points: newPoints } : r))
      );
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function updateTitle(ruleId: string, newTitle: string) {
    try {
      setBusyId(ruleId);
      setStatus("");

      const clean = newTitle.trim();
      if (clean.length < 2) throw new Error("Regeltext zu kurz.");

      const { error } = await supabase
        .from("potato_rules")
        .update({ title: clean })
        .eq("id", ruleId);

      if (error) throw error;

      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, title: clean } : r))
      );
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRule(ruleId: string, ruleTitle: string) {
    try {
      setDeletingId(ruleId);
      setStatus("");

      const ok = confirm(`Regel wirklich löschen?\n\n"${ruleTitle}"`);
      if (!ok) return;

      const { error } = await supabase.from("potato_rules").delete().eq("id", ruleId);
      if (error) throw error;

      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      setStatus("Regel gelöscht.");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Der Plan 2.0</h1>
          <div className="text-sm opacity-70">
            Hier werden nur Regeln definiert. Eintragen passiert im Gruppen-Dashboard.
          </div>
        </div>

        <button
          className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
          onClick={() => router.push("/group/dashboard")}
        >
          Zum Gruppen-Dashboard
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">Lade…</div>
      ) : null}

      {status ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">{status}</div>
      ) : null}

      {!groupId ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          Keine aktive Gruppe. Bitte zuerst unter „Meine Gruppe“ beitreten/erstellen.
        </div>
      ) : (
        <>
          {/* Create */}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5 space-y-3">
            <div className="text-sm font-semibold">Neue Regel</div>

            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z.B. Süßigkeiten nach 20 Uhr"
                className="flex-1 min-w-[220px] rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
              />
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="w-[120px] rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={createRule}
                disabled={creating}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
              >
                {creating ? "…" : "Hinzufügen"}
              </button>
            </div>

            <div className="text-xs opacity-70">
              Punkte werden später im Gruppen-Dashboard pro Woche eingetragen.
            </div>
          </div>

          {/* List */}
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5 space-y-3">
            <div className="text-sm font-semibold">Regeln ({rules.length})</div>

            {rules.length === 0 ? (
              <div className="text-sm opacity-70">Noch keine Regeln.</div>
            ) : (
              <div className="divide-y divide-white/10 rounded-xl border border-white/10">
                {rules.map((r) => (
                  <div key={r.id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <input
                          defaultValue={r.title}
                          disabled={busyId === r.id || deletingId === r.id}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v.trim() !== r.title.trim()) updateTitle(r.id, v);
                          }}
                          className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
                        />
                        <div className="text-xs opacity-70 mt-1">
                          Status: {r.active ? "aktiv" : "inaktiv"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleActive(r)}
                          disabled={busyId === r.id || deletingId === r.id}
                          className="rounded-xl border border-white/15 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
                        >
                          {busyId === r.id ? "…" : r.active ? "Deaktivieren" : "Aktivieren"}
                        </button>

                        <button
                          onClick={() => deleteRule(r.id, r.title)}
                          disabled={deletingId === r.id || busyId === r.id}
                          className="rounded-xl border border-white/15 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
                        >
                          {deletingId === r.id ? "…" : "Löschen"}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-xs opacity-70">Punkte:</div>
                      <input
                        type="number"
                        value={r.points}
                        disabled={busyId === r.id || deletingId === r.id}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setRules((prev) =>
                            prev.map((x) => (x.id === r.id ? { ...x, points: v } : x))
                          );
                        }}
                        onBlur={(e) => updatePoints(r.id, Number(e.target.value))}
                        className="w-[120px] rounded-xl border border-white/15 bg-black/20 px-3 py-1 text-sm outline-none"
                      />
                      <div className="text-xs opacity-60">(wird beim Verlassen gespeichert)</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
