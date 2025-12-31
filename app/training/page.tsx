"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardHeader, CardBody, Divider } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type SportType = { id: string; name: string; active: boolean };

type TrainingEntry = {
  id: string;
  group_id: string;
  user_id: string;
  sport_type_id: string;
  occurred_on: string; // YYYY-MM-DD
  duration_min: number;
  distance_km: number | null;
  intensity: number | null; // 1..7
  note: string | null;
  sport_types?: { name: string } | null;
};

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateDE(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Montag = Wochenstart
function startOfWeekMonday(d: Date) {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 So, 1 Mo ...
  const diff = (day === 0 ? -6 : 1) - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatWeekRange(weekStart: Date) {
  const end = addDays(weekStart, 6);
  const fmt = (x: Date) =>
    `${String(x.getDate()).padStart(2, "0")}.${String(x.getMonth() + 1).padStart(2, "0")}.`;
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

function parseNumberOrNull(s: string): number | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const v = Number(t.replace(",", "."));
  if (!Number.isFinite(v)) return null;
  return v;
}

function safeInt(s: string): number | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export default function TrainingPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  const [sportTypes, setSportTypes] = useState<SportType[]>([]);
  const [entries, setEntries] = useState<TrainingEntry[]>([]);

  // Woche: 0 = diese (neu), 1 = letzte (älter), 2 = noch älter...
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const ws = startOfWeekMonday(new Date());
    return addDays(ws, -7 * weekOffset);
  }, [weekOffset]);

  const weekStartISO = useMemo(() => toISODate(weekStart), [weekStart]);
  const weekEndISO = useMemo(() => toISODate(addDays(weekStart, 6)), [weekStart]);

  // Form (Add)
  const [occurredOn, setOccurredOn] = useState(toISODate(new Date()));
  const [sportTypeId, setSportTypeId] = useState<string>("");
  const [durationMin, setDurationMin] = useState<string>("45");
  const [distanceKm, setDistanceKm] = useState<string>("");
  const [intensity, setIntensity] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOccurredOn, setEditOccurredOn] = useState<string>("");
  const [editSportTypeId, setEditSportTypeId] = useState<string>("");
  const [editDurationMin, setEditDurationMin] = useState<string>("");
  const [editDistanceKm, setEditDistanceKm] = useState<string>("");
  const [editIntensity, setEditIntensity] = useState<string>("");
  const [editNote, setEditNote] = useState<string>("");

  // Swipe (gedreht):
  // - links wischen => NEUER (weekOffset - 1)
  // - rechts wischen => ÄLTER (weekOffset + 1)
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null || touchStartY.current == null) return;

    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const endY = e.changedTouches[0]?.clientY ?? touchStartY.current;

    const dx = endX - touchStartX.current;
    const dy = endY - touchStartY.current;

    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

    if (dx < 0) {
      // LEFT swipe => NEWER
      setWeekOffset((w) => Math.max(0, w - 1));
    } else {
      // RIGHT swipe => OLDER
      setWeekOffset((w) => w + 1);
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }

  // date aligned zur angezeigten Woche
  useEffect(() => {
    const now = new Date();
    const nowWs = startOfWeekMonday(now);
    const isCurrent = toISODate(nowWs) === toISODate(weekStart);
    setOccurredOn(isCurrent ? toISODate(now) : weekStartISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartISO]);

  useEffect(() => {
    (async () => {
      try {
        setStatus("");
        setLoading(true);

        const { data: u } = await supabase.auth.getUser();
        const user = u.user;
        if (!user) {
          setMyUserId(null);
          setGroupId(null);
          setSportTypes([]);
          setEntries([]);
          setStatus("Nicht eingeloggt.");
          return;
        }
        setMyUserId(user.id);

        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("active_group_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (pErr) throw pErr;

        const gId = (prof?.active_group_id as string) ?? null;
        setGroupId(gId);

        if (!gId) {
          setSportTypes([]);
          setEntries([]);
          setStatus("Du bist aktuell in keiner aktiven Gruppe.");
          return;
        }

        const { data: st, error: stErr } = await supabase
          .from("sport_types")
          .select("id,name,active")
          .eq("group_id", gId)
          .order("name", { ascending: true });

        if (stErr) throw stErr;

        const stList = (st ?? []) as SportType[];
        setSportTypes(stList);

        const firstActive = stList.find((x) => x.active)?.id ?? "";
        setSportTypeId((prev) => prev || firstActive);

        const { data: te, error: teErr } = await supabase
          .from("training_entries")
          .select(
            "id,group_id,user_id,sport_type_id,occurred_on,duration_min,distance_km,intensity,note, sport_types(name)"
          )
          .eq("group_id", gId)
          .eq("user_id", user.id)
          .order("occurred_on", { ascending: false })
          .limit(2000);

        if (teErr) throw teErr;

        setEntries((te ?? []) as TrainingEntry[]);
      } catch (e: any) {
        setStatus(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSportTypeOptions = useMemo(() => sportTypes.filter((x) => x.active), [sportTypes]);

  const weekEntries = useMemo(() => {
    return entries
      .filter((e) => e.occurred_on >= weekStartISO && e.occurred_on <= weekEndISO)
      .slice()
      .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1));
  }, [entries, weekStartISO, weekEndISO]);

  const weekTotals = useMemo(() => {
    const min = weekEntries.reduce((sum, e) => sum + (Number(e.duration_min) || 0), 0);
    const km = weekEntries.reduce((sum, e) => sum + (Number(e.distance_km) || 0), 0);
    const sessions = weekEntries.length;
    return { min, km, sessions };
  }, [weekEntries]);

  const bySport = useMemo(() => {
    const map = new Map<string, { name: string; sessions: number; min: number; km: number }>();
    for (const e of weekEntries) {
      const name = e.sport_types?.name ?? "—";
      const cur = map.get(name) ?? { name, sessions: 0, min: 0, km: 0 };
      cur.sessions += 1;
      cur.min += Number(e.duration_min) || 0;
      cur.km += Number(e.distance_km) || 0;
      map.set(name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.min - a.min);
  }, [weekEntries]);

  const kpis = useMemo(() => {
    const now = new Date();
    const since = new Date(now);
    since.setDate(now.getDate() - 6);
    const sinceISO = toISODate(since);

    const totalAll = entries.reduce((sum, e) => sum + (Number(e.duration_min) || 0), 0);
    const sessionsAll = entries.length;

    const last7 = entries.filter((e) => e.occurred_on >= sinceISO);
    const total7 = last7.reduce((sum, e) => sum + (Number(e.duration_min) || 0), 0);

    return { total7, sessions7: last7.length, totalAll, sessionsAll };
  }, [entries]);

  async function addEntry() {
    try {
      if (!myUserId) throw new Error("Nicht eingeloggt.");
      if (!groupId) throw new Error("Keine aktive Gruppe.");
      if (!sportTypeId) throw new Error("Bitte Sportart wählen.");

      setBusy(true);
      setStatus("");

      const dur = safeInt(durationMin);
      if (dur == null || dur <= 0) throw new Error("Dauer muss eine Zahl > 0 sein.");

      const dist = parseNumberOrNull(distanceKm);
      if (dist !== null && dist < 0) throw new Error("Distanz muss leer oder ≥ 0 sein.");

      const inten = safeInt(intensity);
      if (inten !== null && (inten < 1 || inten > 7)) {
        throw new Error("Intensität muss 1–7 sein (oder leer).");
      }

      const payload = {
        group_id: groupId,
        user_id: myUserId,
        sport_type_id: sportTypeId,
        occurred_on: occurredOn,
        duration_min: dur,
        distance_km: dist,
        intensity: inten,
        note: note.trim() ? note.trim() : null,
      };

      const { data, error } = await supabase
        .from("training_entries")
        .insert(payload)
        .select(
          "id,group_id,user_id,sport_type_id,occurred_on,duration_min,distance_km,intensity,note, sport_types(name)"
        )
        .single();

      if (error) throw error;

      setEntries((prev) => [data as TrainingEntry, ...prev]);
      setNote("");
      setDistanceKm("");
      setIntensity("");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(e: TrainingEntry) {
    setStatus("");
    setEditingId(e.id);
    setEditOccurredOn(e.occurred_on);
    setEditSportTypeId(e.sport_type_id);
    setEditDurationMin(String(e.duration_min ?? ""));
    setEditDistanceKm(e.distance_km == null ? "" : String(e.distance_km));
    setEditIntensity(e.intensity == null ? "" : String(e.intensity));
    setEditNote(e.note ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditOccurredOn("");
    setEditSportTypeId("");
    setEditDurationMin("");
    setEditDistanceKm("");
    setEditIntensity("");
    setEditNote("");
  }

  async function saveEdit(id: string) {
    try {
      if (!myUserId) throw new Error("Nicht eingeloggt.");

      setRowBusyId(id);
      setStatus("");

      const dur = safeInt(editDurationMin);
      if (dur == null || dur <= 0) throw new Error("Dauer muss eine Zahl > 0 sein.");

      const dist = parseNumberOrNull(editDistanceKm);
      if (dist !== null && dist < 0) throw new Error("Distanz muss leer oder ≥ 0 sein.");

      const inten = safeInt(editIntensity);
      if (inten !== null && (inten < 1 || inten > 7)) {
        throw new Error("Intensität muss 1–7 sein (oder leer).");
      }

      if (!editSportTypeId) throw new Error("Sportart fehlt.");

      const { data, error } = await supabase
        .from("training_entries")
        .update({
          occurred_on: editOccurredOn,
          sport_type_id: editSportTypeId,
          duration_min: dur,
          distance_km: dist,
          intensity: inten,
          note: editNote.trim() ? editNote.trim() : null,
        })
        .eq("id", id)
        .eq("user_id", myUserId)
        .select(
          "id,group_id,user_id,sport_type_id,occurred_on,duration_min,distance_km,intensity,note, sport_types(name)"
        )
        .single();

      if (error) throw error;

      setEntries((prev) => prev.map((x) => (x.id === id ? (data as TrainingEntry) : x)));
      cancelEdit();
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setRowBusyId(null);
    }
  }

  async function deleteEntry(id: string) {
    try {
      if (!myUserId) throw new Error("Nicht eingeloggt.");
      if (!confirm("Eintrag wirklich löschen?")) return;

      setRowBusyId(id);
      setStatus("");

      const { error } = await supabase.from("training_entries").delete().eq("id", id).eq("user_id", myUserId);
      if (error) throw error;

      setEntries((prev) => prev.filter((x) => x.id !== id));
      if (editingId === id) cancelEdit();
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setRowBusyId(null);
    }
  }

  const weekTitle = useMemo(() => {
    if (weekOffset === 0) return "Diese Woche";
    if (weekOffset === 1) return "Letzte Woche";
    return `Woche -${weekOffset}`;
  }, [weekOffset]);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Training</h1>
        <div className="text-xs text-zinc-400">
          {fmtDateDE(weekStartISO)} – {fmtDateDE(weekEndISO)} (Mo–So)
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">Lade…</div>
      ) : null}

      {status ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">{status}</div>
      ) : null}

      {/* Gesamtübersicht */}
      <Card>
        <CardHeader title="Gesamtübersicht" subtitle="Rolling 7 Tage + Gesamt" />
        <Divider />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
              <div className="text-xs opacity-70">Letzte 7 Tage</div>
              <div className="text-lg font-semibold">{kpis.total7} min</div>
              <div className="text-xs opacity-70">{kpis.sessions7} Einheiten</div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
              <div className="text-xs opacity-70">Insgesamt</div>
              <div className="text-lg font-semibold">{kpis.totalAll} min</div>
              <div className="text-xs opacity-70">{kpis.sessionsAll} Einheiten</div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Wochenkarte */}
      <Card>
        <CardHeader
          title={weekTitle}
          subtitle={`${formatWeekRange(weekStart)} (Mo–So)`}
          right={
            <div className="flex gap-2">
              <Button onClick={() => setWeekOffset((w) => w + 1)}>Älter</Button>
              <Button onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} disabled={weekOffset === 0}>
                Neuer
              </Button>
            </div>
          }
        />
        <Divider />
        <CardBody>
          <div
            className="space-y-5"
            style={{ touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* Woche (breit) */}
            <div className="rounded-2xl border border-white/15 bg-white/5 p-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Woche</div>
                <div className="text-xs opacity-70">
                  {weekTotals.sessions} Einheiten
                  {weekTotals.km > 0 ? ` · ${Math.round(weekTotals.km * 10) / 10} km` : ""}
                </div>
              </div>
              <div className="text-lg font-semibold">{weekTotals.min} min</div>
            </div>

            {/* Pro Sportart */}
            <div className="space-y-2">
              <div className="text-sm font-semibold">Pro Sportart</div>
              {bySport.length === 0 ? (
                <div className="text-sm opacity-70">Noch nichts in dieser Woche.</div>
              ) : (
                <div className="space-y-2">
                  {bySport.map((r) => (
                    <div
                      key={r.name}
                      className="rounded-2xl border border-white/15 bg-white/5 p-5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{r.name}</div>
                        <div className="text-xs opacity-70">{r.sessions}×</div>
                      </div>
                      <div className="text-sm font-semibold text-right">
                        {r.min} min{r.km > 0 ? ` · ${Math.round(r.km * 10) / 10} km` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Neuer Eintrag */}
            <div className="space-y-3">
              <div className="text-sm font-semibold">Neuer Eintrag</div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <div className="text-sm text-zinc-300 mb-1">Datum</div>
                  <Input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
                </div>

                <div className="md:col-span-4">
                  <div className="text-sm text-zinc-300 mb-1">Sportart</div>
                  <select
                    value={sportTypeId}
                    onChange={(e) => setSportTypeId(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
                  >
                    {activeSportTypeOptions.length === 0 ? (
                      <option value="">Keine aktive Sportart</option>
                    ) : (
                      activeSportTypeOptions.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <div className="text-sm text-zinc-300 mb-1">Dauer (min)</div>
                  <Input value={durationMin} onChange={(e) => setDurationMin(e.target.value)} inputMode="numeric" />
                </div>

                <div className="md:col-span-2">
                  <div className="text-sm text-zinc-300 mb-1">Distanz (km)</div>
                  <Input value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="optional" />
                </div>

                <div className="md:col-span-1">
                  <div className="text-sm text-zinc-300 mb-1">Int. (1–7)</div>
                  <Input
                    value={intensity}
                    onChange={(e) => setIntensity(e.target.value)}
                    inputMode="numeric"
                    placeholder="optional"
                  />
                </div>

                <div className="md:col-span-10">
                  <div className="text-sm text-zinc-300 mb-1">Notiz</div>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
                </div>

                <div className="md:col-span-2">
                  <Button onClick={addEntry} disabled={busy || !myUserId || !groupId} variant="solid" className="w-full">
                    {busy ? "…" : "Speichern"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Einträge dieser Woche */}
            <div className="space-y-2">
              <div className="text-sm font-semibold">Einträge dieser Woche</div>

              {weekEntries.length === 0 ? (
                <div className="text-sm opacity-70">Keine Einträge in dieser Woche.</div>
              ) : (
                <div className="space-y-2">
                  {weekEntries.map((e) => {
                    const isEditing = editingId === e.id;
                    const disabled = rowBusyId === e.id;

                    return (
                      <div key={e.id} className="rounded-2xl border border-white/15 bg-white/5 p-5">
                        {!isEditing ? (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">
                                {fmtDateDE(e.occurred_on)} · {e.sport_types?.name ?? "—"}
                              </div>
                              <div className="text-xs opacity-70 mt-1">
                                {e.duration_min} min
                                {e.distance_km != null ? ` · ${e.distance_km} km` : ""}
                                {e.intensity != null ? ` · Int ${e.intensity}/7` : ""}
                              </div>
                              {e.note ? <div className="text-sm mt-2">{e.note}</div> : null}
                            </div>

                            <div className="flex gap-2 flex-wrap justify-end">
                              <Button onClick={() => startEdit(e)} disabled={disabled}>
                                Bearbeiten
                              </Button>
                              <Button onClick={() => deleteEntry(e.id)} disabled={disabled} variant="danger">
                                Löschen
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                              <div className="md:col-span-3">
                                <div className="text-sm text-zinc-300 mb-1">Datum</div>
                                <Input
                                  type="date"
                                  value={editOccurredOn}
                                  onChange={(ev) => setEditOccurredOn(ev.target.value)}
                                />
                              </div>

                              <div className="md:col-span-4">
                                <div className="text-sm text-zinc-300 mb-1">Sportart</div>
                                <select
                                  value={editSportTypeId}
                                  onChange={(ev) => setEditSportTypeId(ev.target.value)}
                                  className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
                                >
                                  {activeSportTypeOptions.length === 0 ? (
                                    <option value="">Keine aktive Sportart</option>
                                  ) : (
                                    activeSportTypeOptions.map((st) => (
                                      <option key={st.id} value={st.id}>
                                        {st.name}
                                      </option>
                                    ))
                                  )}
                                </select>
                              </div>

                              <div className="md:col-span-2">
                                <div className="text-sm text-zinc-300 mb-1">Dauer (min)</div>
                                <Input
                                  value={editDurationMin}
                                  onChange={(ev) => setEditDurationMin(ev.target.value)}
                                  inputMode="numeric"
                                />
                              </div>

                              <div className="md:col-span-2">
                                <div className="text-sm text-zinc-300 mb-1">Distanz (km)</div>
                                <Input
                                  value={editDistanceKm}
                                  onChange={(ev) => setEditDistanceKm(ev.target.value)}
                                  placeholder="optional"
                                />
                              </div>

                              <div className="md:col-span-1">
                                <div className="text-sm text-zinc-300 mb-1">Int. (1–7)</div>
                                <Input
                                  value={editIntensity}
                                  onChange={(ev) => setEditIntensity(ev.target.value)}
                                  inputMode="numeric"
                                  placeholder="optional"
                                />
                              </div>

                              <div className="md:col-span-12">
                                <div className="text-sm text-zinc-300 mb-1">Notiz</div>
                                <Input
                                  value={editNote}
                                  onChange={(ev) => setEditNote(ev.target.value)}
                                  placeholder="optional"
                                />
                              </div>
                            </div>

                            <div className="flex gap-2 flex-wrap">
                              <Button onClick={() => saveEdit(e.id)} disabled={disabled} variant="solid">
                                {disabled ? "…" : "Speichern"}
                              </Button>
                              <Button onClick={cancelEdit} disabled={disabled}>
                                Abbrechen
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
