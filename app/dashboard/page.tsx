"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
  Line,
} from "recharts";

import { Card, CardHeader, CardBody, Divider } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type WeighIn = {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  weight_kg: number;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateDE(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function toNumberSafe(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function daysBetween(aISO: string, bISO: string) {
  const a = new Date(aISO + "T00:00:00");
  const b = new Date(bISO + "T00:00:00");
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function findPrevWeekEntry(entriesDesc: WeighIn[]) {
  if (!entriesDesc.length) return null;
  const latest = entriesDesc[0];
  const target = new Date(latest.entry_date + "T00:00:00");
  target.setDate(target.getDate() - 7);
  const targetISO = target.toISOString().slice(0, 10);
  for (const e of entriesDesc) {
    if (e.entry_date <= targetISO) return e;
  }
  return null;
}

// Mini-Timeline: Dots wenn wenige Seiten, sonst Slider
function MiniTimeline({
  pageCount,
  currentPage,
  onJump,
}: {
  pageCount: number;
  currentPage: number;
  onJump: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  if (pageCount > 20) {
    return (
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
          <span>Neuer</span>
          <span>
            Seite {currentPage + 1} / {pageCount}
          </span>
          <span>Älter</span>
        </div>
        <input
          type="range"
          min={0}
          max={pageCount - 1}
          value={currentPage}
          onChange={(e) => onJump(Number(e.target.value))}
          className="w-full accent-fuchsia-400"
        />
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-zinc-400">Neuer</span>
      <div className="flex items-center gap-1">
        {Array.from({ length: pageCount }).map((_, i) => {
          const active = i === currentPage;
          return (
            <button
              key={i}
              onClick={() => onJump(i)}
              title={`Seite ${i + 1}`}
              className={[
                "h-[10px] w-[10px] rounded-full border transition",
                "border-white/20",
                active
                  ? "bg-fuchsia-300/70 shadow-[0_0_12px_rgba(236,72,153,0.25)]"
                  : "bg-white/10 hover:bg-white/16",
              ].join(" ")}
            />
          );
        })}
      </div>
      <span className="text-xs text-zinc-400">Älter</span>

      <span className="text-xs text-zinc-400 ml-2">
        Seite {currentPage + 1}/{pageCount}
      </span>
    </div>
  );
}

function ModernTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const w = payload[0]?.value;
  return (
    <div
      className="rounded-2xl border border-white/10 bg-black/70 px-3 py-2 text-sm text-zinc-100"
      style={{ backdropFilter: "blur(8px)" }}
    >
      <div className="text-xs text-zinc-400 mb-1">{fmtDateDE(String(label))}</div>
      <div className="font-semibold">{Number(w).toFixed(1)} kg</div>
    </div>
  );
}

export default function DashboardPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [myUserId, setMyUserId] = useState<string | null>(null);

  // Eingabe
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState<string>("");

  // Zielgewicht
  const [targetWeight, setTargetWeight] = useState<string>("");
  const [savingTarget, setSavingTarget] = useState(false);

  // Einträge (neu -> alt)
  const [entries, setEntries] = useState<WeighIn[]>([]);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState<string>("");

  // Chart-Paging + iOS-sicherer Swipe
  const CHART_WINDOW = 10;
  const [chartOffset, setChartOffset] = useState(0); // 0 = neueste
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeStartTime, setSwipeStartTime] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setStatus("");
        const { data: u } = await supabase.auth.getUser();
        const user = u.user;
        if (!user) {
          setMyUserId(null);
          setEntries([]);
          return;
        }
        setMyUserId(user.id);
        await loadTargetWeight(user.id);
        await loadWeighIns(user.id);
      } catch (e: any) {
        setStatus(e?.message ?? String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTargetWeight(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("target_weight_kg")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    setTargetWeight(data?.target_weight_kg == null ? "" : String(data.target_weight_kg));
  }

  async function loadWeighIns(userId: string) {
    const { data, error } = await supabase
      .from("weigh_ins")
      .select("id, user_id, entry_date, weight_kg")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false });
    if (error) throw error;

    setEntries(
      (data ?? []).map((x: any) => ({
        id: x.id,
        user_id: x.user_id,
        entry_date: x.entry_date,
        weight_kg: Number(x.weight_kg),
      }))
    );
    setChartOffset(0);
  }

  async function saveTarget() {
    try {
      if (!myUserId) throw new Error("Nicht eingeloggt.");
      setSavingTarget(true);
      setStatus("");
      const n = toNumberSafe(targetWeight);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Zielgewicht ungültig.");
      const { error } = await supabase
        .from("profiles")
        .update({ target_weight_kg: n })
        .eq("user_id", myUserId);
      if (error) throw error;
      setStatus("✅ Zielgewicht gespeichert.");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setSavingTarget(false);
    }
  }

  async function addWeighIn() {
    try {
      if (!myUserId) throw new Error("Nicht eingeloggt.");
      setBusy(true);
      setStatus("");

      const entryDate = date;
      const w = toNumberSafe(weight);
      if (!entryDate) throw new Error("Datum fehlt.");
      if (!Number.isFinite(w) || w <= 0) throw new Error("Gewicht ungültig.");

      const { data: existing, error: exErr } = await supabase
        .from("weigh_ins")
        .select("id")
        .eq("user_id", myUserId)
        .eq("entry_date", entryDate)
        .maybeSingle();
      if (exErr) throw exErr;
      if (existing) {
        setStatus("Für dieses Datum existiert schon ein Eintrag. Bitte bearbeiten oder löschen.");
        return;
      }

      const { error } = await supabase.from("weigh_ins").insert({
        user_id: myUserId,
        entry_date: entryDate,
        weight_kg: w,
      });
      if (error) throw error;

      setWeight("");
      await loadWeighIns(myUserId);
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(id: string, current: number) {
    setEditingId(id);
    setEditWeight(String(current));
    setStatus("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditWeight("");
  }

  async function saveEdit(id: string) {
    try {
      if (!myUserId) throw new Error("Nicht eingeloggt.");
      setBusy(true);
      setStatus("");
      const w = toNumberSafe(editWeight);
      if (!Number.isFinite(w) || w <= 0) throw new Error("Gewicht ungültig.");
      const { error } = await supabase
        .from("weigh_ins")
        .update({ weight_kg: w })
        .eq("id", id)
        .eq("user_id", myUserId);
      if (error) throw error;
      setEditingId(null);
      setEditWeight("");
      await loadWeighIns(myUserId);
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id: string) {
    try {
      if (!myUserId) throw new Error("Nicht eingeloggt.");
      setBusy(true);
      setStatus("");
      const { error } = await supabase
        .from("weigh_ins")
        .delete()
        .eq("id", id)
        .eq("user_id", myUserId);
      if (error) throw error;
      await loadWeighIns(myUserId);
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  // Kennzahlen
  const latest = entries[0] ?? null;
  const prevWeek = useMemo(() => findPrevWeekEntry(entries), [entries]);
  const diffToGoal = useMemo(() => {
    const tw = toNumberSafe(targetWeight);
    if (!latest || !Number.isFinite(tw)) return null;
    return latest.weight_kg - tw;
  }, [latest, targetWeight]);
  const diffToPrevWeek = useMemo(() => {
    if (!latest || !prevWeek) return null;
    return latest.weight_kg - prevWeek.weight_kg;
  }, [latest, prevWeek]);

  // Chart paging
  const maxOffset = Math.max(0, entries.length - CHART_WINDOW);

  const pageCount = useMemo(() => {
    if (entries.length === 0) return 0;
    return Math.ceil(entries.length / CHART_WINDOW);
  }, [entries.length]);

  const currentPage = useMemo(() => {
    return Math.floor(Math.min(chartOffset, maxOffset) / CHART_WINDOW);
  }, [chartOffset, maxOffset]);

  const pageDesc = useMemo(() => {
    const start = Math.min(chartOffset, maxOffset);
    return entries.slice(start, start + CHART_WINDOW);
  }, [entries, chartOffset, maxOffset]);

  const chartData = useMemo(
    () => pageDesc.slice().reverse().map((e) => ({ date: e.entry_date, weight: e.weight_kg })),
    [pageDesc]
  );

  const rangeLabel = useMemo(() => {
    if (pageDesc.length === 0) return "";
    const newest = pageDesc[0]?.entry_date;
    const oldest = pageDesc[pageDesc.length - 1]?.entry_date;
    if (!newest || !oldest) return "";
    return `${fmtDateDE(oldest)} – ${fmtDateDE(newest)}`;
  }, [pageDesc]);

  function goOlder() {
    setChartOffset((o) => Math.min(o + CHART_WINDOW, maxOffset));
  }
  function goNewer() {
    setChartOffset((o) => Math.max(o - CHART_WINDOW, 0));
  }

  function jumpToPage(page: number) {
    const p = Math.max(0, Math.min(page, Math.max(0, pageCount - 1)));
    setChartOffset(p * CHART_WINDOW);
  }

  // iOS-sicherer Pointer-Swipe (Rand ignorieren)
  function canStartSwipe(clientX: number, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const edge = 28;
    return clientX > r.left + edge && clientX < r.right - edge;
  }
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return;
    const el = e.currentTarget;
    if (!canStartSwipe(e.clientX, el)) return;
    setSwipeStartX(e.clientX);
    setSwipeStartTime(Date.now());
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || swipeStartX == null || swipeStartTime == null) return;
    const dx = e.clientX - swipeStartX;
    const dt = Date.now() - swipeStartTime;
    const THRESH = 45;
    if (dt <= 900) {
      if (dx <= -THRESH) goOlder();
      else if (dx >= THRESH) goNewer();
    }
    setSwipeStartX(null);
    setSwipeStartTime(null);
  }
  function onPointerCancel() {
    setSwipeStartX(null);
    setSwipeStartTime(null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="text-xs text-zinc-400">Neon Crew · modern chart</div>
      </div>

      {/* Eingabe + Ziel + Kennzahlen */}
      <Card className="space-y-4">
        <CardHeader
          title="Eintragen"
          subtitle="Ein Eintrag pro Tag – Bearbeiten/Löschen jederzeit möglich."
        />
        <Divider />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <div className="text-sm text-zinc-300 mb-1">Datum</div>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div>
              <div className="text-sm text-zinc-300 mb-1">Gewicht (kg)</div>
              <Input
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputMode="decimal"
                placeholder="z.B. 82.4"
              />
            </div>

            <Button onClick={addWeighIn} disabled={busy || !myUserId} variant="solid" className="w-full">
              {busy ? "…" : "Eintragen"}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <div className="text-sm text-zinc-300 mb-1">Zielgewicht (kg)</div>
              <Input
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                placeholder="z.B. 78.0"
                inputMode="decimal"
              />
            </div>

            <Button onClick={saveTarget} disabled={savingTarget || !myUserId} className="w-full">
              {savingTarget ? "…" : "Ziel speichern"}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-zinc-400">Letzter Eintrag</div>
              <div className="text-lg font-semibold">
                {latest ? `${latest.weight_kg.toFixed(1)} kg` : "—"}
              </div>
              <div className="text-xs text-zinc-500">{latest ? fmtDateDE(latest.entry_date) : ""}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-zinc-400">Differenz zum Ziel</div>
              <div className="text-lg font-semibold">
                {diffToGoal == null ? "—" : `${diffToGoal > 0 ? "+" : ""}${diffToGoal.toFixed(1)} kg`}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-zinc-400">Differenz zur Vorwoche</div>
              <div className="text-lg font-semibold">
                {diffToPrevWeek == null
                  ? "—"
                  : `${diffToPrevWeek > 0 ? "+" : ""}${diffToPrevWeek.toFixed(1)} kg`}
              </div>
              <div className="text-xs text-zinc-500">
                {prevWeek && latest
                  ? `vs. ${fmtDateDE(prevWeek.entry_date)} (${daysBetween(
                      latest.entry_date,
                      prevWeek.entry_date
                    )} Tage)`
                  : ""}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader
          title="Gewichts-Diagramm"
          subtitle="Modern · Area + Neon Gradient · Swipe/Timeline"
          right={
            <div className="flex gap-2">
              <Button onClick={goNewer} disabled={chartOffset === 0}>
                Neuer
              </Button>
              <Button onClick={goOlder} disabled={chartOffset >= maxOffset}>
                Älter
              </Button>
            </div>
          }
        />
        <Divider />
        <CardBody>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">{rangeLabel || "—"}</div>
            {pageCount > 1 ? (
              <div className="text-xs text-zinc-500">
                Seite {currentPage + 1}/{pageCount}
              </div>
            ) : null}
          </div>

          <MiniTimeline pageCount={pageCount} currentPage={currentPage} onJump={jumpToPage} />

          <div
            className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-2"
            style={{
              width: "100%",
              height: 360,
              minWidth: 0,
              touchAction: "pan-y",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="neonFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(236,72,153,0.35)" />
                    <stop offset="65%" stopColor="rgba(236,72,153,0.10)" />
                    <stop offset="100%" stopColor="rgba(236,72,153,0.00)" />
                  </linearGradient>

                  <linearGradient id="neonStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(34,211,238,0.95)" />
                    <stop offset="50%" stopColor="rgba(236,72,153,0.95)" />
                    <stop offset="100%" stopColor="rgba(16,185,129,0.95)" />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => String(v).slice(5)}
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.10)" }}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                />
                <Tooltip content={<ModernTooltip />} />

                <Area
                  type="monotone"
                  dataKey="weight"
                  stroke="url(#neonStroke)"
                  strokeWidth={3}
                  fill="url(#neonFill)"
                  fillOpacity={1}
                  dot={false}
                  activeDot={{
                    r: 5,
                    strokeWidth: 2,
                    stroke: "rgba(255,255,255,0.75)",
                    fill: "rgba(236,72,153,0.95)",
                  }}
                />

                {/* dünne Overlay-Linie für crisp look */}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth={1}
                  dot={false}
                  activeDot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 text-xs text-zinc-400">
            Tipp: Im Diagramm links/rechts wischen (Rand wird ignoriert).
          </div>
        </CardBody>
      </Card>

      {/* Tabelle */}
      <Card>
        <CardHeader title="Einträge (alle)" subtitle="Neueste zuerst. Direkt bearbeiten/löschen." />
        <Divider />
        <CardBody>
          {entries.length === 0 ? (
            <div className="text-sm text-zinc-400">Keine Einträge.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="text-left text-sm text-zinc-300">
                    <th className="py-2">Datum</th>
                    <th className="py-2">kg</th>
                    <th className="py-2">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t border-white/10">
                      <td className="py-3 text-sm text-zinc-200">{e.entry_date}</td>
                      <td className="py-3 text-sm text-zinc-200">
                        {editingId === e.id ? (
                          <Input
                            value={editWeight}
                            onChange={(ev) => setEditWeight(ev.target.value)}
                            className="w-28"
                            inputMode="decimal"
                          />
                        ) : (
                          e.weight_kg.toFixed(1)
                        )}
                      </td>
                      <td className="py-3">
                        {editingId === e.id ? (
                          <div className="flex gap-2 flex-wrap">
                            <Button onClick={() => saveEdit(e.id)} disabled={busy} variant="solid">
                              Speichern
                            </Button>
                            <Button onClick={cancelEdit} disabled={busy}>
                              Abbrechen
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2 flex-wrap">
                            <Button onClick={() => startEdit(e.id, e.weight_kg)} disabled={busy}>
                              Bearbeiten
                            </Button>
                            <Button onClick={() => deleteEntry(e.id)} disabled={busy} variant="danger">
                              Löschen
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {status ? (
        <Card>
          <CardBody>
            <div className="text-sm text-zinc-200">{status}</div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
