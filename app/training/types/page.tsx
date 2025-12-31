"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type SportType = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export default function TrainingTypesPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [groupId, setGroupId] = useState<string | null>(null);
  const [types, setTypes] = useState<SportType[]>([]);
  const [newName, setNewName] = useState("");

  const sorted = useMemo(() => {
    return [...types].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name, "de");
    });
  }, [types]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        setError("Nicht eingeloggt.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("active_group_id")
        .eq("user_id", authData.user.id)
        .single();

      if (profErr) {
        setError("Profil konnte nicht geladen werden.");
        setLoading(false);
        return;
      }

      const gId = profile?.active_group_id ?? null;
      setGroupId(gId);

      if (!gId) {
        setTypes([]);
        setLoading(false);
        return;
      }

      const { data: st, error: stErr } = await supabase
        .from("sport_types")
        .select("id,name,active,created_at")
        .eq("group_id", gId);

      if (stErr) {
        setError("Sportarten konnten nicht geladen werden.");
      } else {
        setTypes((st ?? []) as SportType[]);
      }

      setLoading(false);
    })();
  }, [supabase]);

  async function addType() {
    const name = newName.trim();
    if (!name) return;

    if (!groupId) {
      setError("Keine aktive Gruppe gesetzt.");
      return;
    }

    setSaving(true);
    setError(null);

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) {
      setError("Nicht eingeloggt.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("sport_types")
      .insert({
        group_id: groupId,
        name,
        active: true,
        created_by: userId,
      })
      .select("id,name,active,created_at")
      .single();

    if (error) {
      setError(
        error.message.includes("duplicate")
          ? "Diese Sportart existiert in der Gruppe schon."
          : error.message
      );
    } else if (data) {
      setTypes((prev) => [data as SportType, ...prev]);
      setNewName("");
    }

    setSaving(false);
  }

  async function toggleActive(id: string, active: boolean) {
    setError(null);

    const { data, error } = await supabase
      .from("sport_types")
      .update({ active: !active })
      .eq("id", id)
      .select("id,name,active,created_at")
      .single();

    if (error) {
      setError(error.message);
      return;
    }
    if (data) {
      setTypes((prev) => prev.map((t) => (t.id === id ? (data as SportType) : t)));
    }
  }

  return (
    <div style={{ padding: 18, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 26, letterSpacing: 0.4 }}>Sportarten</h1>
        <span style={{ opacity: 0.7 }}>Definition pro Gruppe</span>
      </div>

      {!groupId && !loading && (
        <div className="panel" style={{ padding: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Keine aktive Gruppe</div>
          <div style={{ opacity: 0.8 }}>
            Du musst erst einer Gruppe beitreten oder eine Gruppe aktiv setzen.
          </div>
        </div>
      )}

      <div className="panel" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Neue Sportart (z.B. Laufen, Kraft, Rad, Schwimmen)"
            style={{
              flex: "1 1 320px",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.35)",
              color: "white",
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addType();
            }}
            disabled={loading || saving || !groupId}
          />
          <button
            onClick={() => void addType()}
            disabled={loading || saving || !groupId}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
            }}
          >
            + Hinzufügen
          </button>
        </div>

        {error && <div style={{ marginTop: 10, color: "#ff8b8b" }}>{error}</div>}
        {loading && <div style={{ marginTop: 10, opacity: 0.75 }}>Lade…</div>}
      </div>

      <div className="panel" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Liste</div>

        {sorted.length === 0 && !loading ? (
          <div style={{ opacity: 0.75 }}>Noch keine Sportarten angelegt.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {sorted.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      display: "inline-block",
                      background: t.active ? "rgba(120,255,170,0.95)" : "rgba(255,120,120,0.95)",
                    }}
                    title={t.active ? "aktiv" : "inaktiv"}
                  />
                  <div style={{ fontWeight: 650 }}>{t.name}</div>
                  <div style={{ opacity: 0.55, fontSize: 12 }}>
                    {t.active ? "aktiv" : "inaktiv"}
                  </div>
                </div>

                <button
                  onClick={() => void toggleActive(t.id, t.active)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  {t.active ? "Deaktivieren" : "Aktivieren"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
