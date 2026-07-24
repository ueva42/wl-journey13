"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
} from "recharts";

import { Card, CardHeader, CardBody, Divider } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import PersonBar from "@/components/PersonBar";
import {
  createPerson,
  deletePerson,
  loadOrCreatePersons,
  pickActivePerson,
  renamePerson,
  setStoredActivePersonId,
  updatePersonTarget,
  type Person,
} from "@/lib/persons";

type WeighIn = {
  id: string;
  user_id: string;
  person_id: string;
  entry_date: string;
  weight_kg: number;
  height_cm: number | null;
};

const PERSON_COLORS = [
  "#ec4899",
  "#22d3ee",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#fb7185",
  "#38bdf8",
  "#4ade80",
];

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

const fmtKg = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const fmtCm = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function normalizeDecimalInput(raw: string) {
  return raw.trim().replace(/\s+/g, "").replace(",", ".");
}

function parseDecimalDE(raw: string) {
  const s = normalizeDecimalInput(raw);
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function formatInputForDE(n: number) {
  return fmtKg.format(n);
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

function MultiTooltip({
  active,
  payload,
  label,
  unit,
  nameByKey,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  unit: string;
  nameByKey: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-2xl border border-white/10 bg-black/70 px-3 py-2 text-sm text-zinc-100"
      style={{ backdropFilter: "blur(8px)" }}
    >
      <div className="text-xs text-zinc-400 mb-1">{fmtDateDE(String(label))}</div>
      <div className="space-y-1">
        {payload.map((p) => {
          const n = Number(p.value);
          if (!Number.isFinite(n)) return null;
          const name = nameByKey[p.dataKey] ?? p.dataKey;
          const formatted = unit === "kg" ? fmtKg.format(n) : fmtCm.format(n);
          return (
            <div key={p.dataKey} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: p.color }}
              />
              <span className="text-zinc-300">{name}:</span>
              <span className="font-semibold">
                {formatted} {unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MultiPersonChart({
  title,
  subtitle,
  chartData,
  persons,
  dataPrefix,
  unit,
  rangeLabel,
  pageCount,
  currentPage,
  onJump,
  onNewer,
  onOlder,
  canNewer,
  canOlder,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
}: {
  title: string;
  subtitle: string;
  chartData: Record<string, any>[];
  persons: Person[];
  dataPrefix: "w_" | "h_";
  unit: "kg" | "cm";
  rangeLabel: string;
  pageCount: number;
  currentPage: number;
  onJump: (page: number) => void;
  onNewer: () => void;
  onOlder: () => void;
  canNewer: boolean;
  canOlder: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
}) {
  const nameByKey = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of persons) m[`${dataPrefix}${p.id}`] = p.display_name;
    return m;
  }, [persons, dataPrefix]);

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        right={
          <div className="flex gap-2">
            <Button onClick={onNewer} disabled={!canNewer}>
              Neuer
            </Button>
            <Button onClick={onOlder} disabled={!canOlder}>
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

        <MiniTimeline pageCount={pageCount} currentPage={currentPage} onJump={onJump} />

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
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              Noch keine Daten.
            </div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
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
                  width={42}
                />
                <Tooltip
                  content={
                    <MultiTooltip unit={unit} nameByKey={nameByKey} />
                  }
                />
                <Legend
                  wrapperStyle={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}
                  formatter={(value) => nameByKey[String(value)] ?? value}
                />
                {persons.map((p, idx) => (
                  <Line
                    key={p.id}
                    type="monotone"
                    dataKey={`${dataPrefix}${p.id}`}
                    name={`${dataPrefix}${p.id}`}
                    stroke={PERSON_COLORS[idx % PERSON_COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    connectNulls
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-2 text-xs text-zinc-400">
          Alle Personen in einem Diagramm · links/rechts wischen zum Blättern.
        </div>
      </CardBody>
    </Card>
  );
}

export default function DashboardPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [activePersonId, setActivePersonId] = useState<string | null>(null);

  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState<string>("");
  const [height, setHeight] = useState<string>("");

  const [targetWeight, setTargetWeight] = useState<string>("");
  const [savingTarget, setSavingTarget] = useState(false);

  const [allEntries, setAllEntries] = useState<WeighIn[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState<string>("");
  const [editHeight, setEditHeight] = useState<string>("");

  const CHART_WINDOW = 10;
  const [chartOffset, setChartOffset] = useState(0);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeStartTime, setSwipeStartTime] = useState<number | null>(null);

  function applyActivePerson(list: Person[], preferredId?: string | null) {
    const active = pickActivePerson(list, preferredId);
    setPersons(list);
    setActivePersonId(active?.id ?? null);
    if (active) {
      setStoredActivePersonId(active.id);
      setTargetWeight(
        active.target_weight_kg == null
          ? ""
          : formatInputForDE(Number(active.target_weight_kg))
      );
    } else {
      setTargetWeight("");
    }
    return active;
  }

  async function loadAllWeighIns(personIds: string[]) {
    if (!personIds.length) {
      setAllEntries([]);
      setChartOffset(0);
      return;
    }
    const { data, error } = await supabase
      .from("weigh_ins")
      .select("id, user_id, person_id, entry_date, weight_kg, height_cm")
      .in("person_id", personIds)
      .order("entry_date", { ascending: false });
    if (error) {
      if (/height_cm/i.test(error.message || "")) {
        throw new Error(
          "Spalte height_cm fehlt. Bitte supabase/add_height_cm.sql im SQL Editor ausführen."
        );
      }
      throw error;
    }

    setAllEntries(
      (data ?? []).map((x: any) => ({
        id: x.id,
        user_id: x.user_id,
        person_id: x.person_id,
        entry_date: x.entry_date,
        weight_kg: Number(x.weight_kg),
        height_cm: x.height_cm == null ? null : Number(x.height_cm),
      }))
    );
    setChartOffset(0);
  }

  useEffect(() => {
    (async () => {
      try {
        setStatus("");
        const { data: u } = await supabase.auth.getUser();
        const user = u.user;
        if (!user) {
          setMyUserId(null);
          setPersons([]);
          setActivePersonId(null);
          setAllEntries([]);
          return;
        }
        setMyUserId(user.id);
        const list = await loadOrCreatePersons(user.id);
        applyActivePerson(list);
        await loadAllWeighIns(list.map((p) => p.id));
      } catch (e: any) {
        setStatus(e?.message ?? String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectPerson(id: string) {
    applyActivePerson(persons, id);
    setEditingId(null);
    setEditWeight("");
    setEditHeight("");
  }

  async function handleCreatePerson(name: string) {
    if (!myUserId) throw new Error("Nicht eingeloggt.");
    const created = await createPerson(myUserId, name);
    const list = [...persons, created];
    applyActivePerson(list, created.id);
    await loadAllWeighIns(list.map((p) => p.id));
  }

  async function handleRenamePerson(id: string, name: string) {
    await renamePerson(id, name);
    const list = persons.map((p) =>
      p.id === id ? { ...p, display_name: name.trim() } : p
    );
    applyActivePerson(list, activePersonId);
  }

  async function handleDeletePerson(id: string) {
    await deletePerson(id);
    const list = persons.filter((p) => p.id !== id);
    applyActivePerson(list);
    await loadAllWeighIns(list.map((p) => p.id));
  }

  async function saveTarget() {
    try {
      if (!myUserId) throw new Error("Nicht eingeloggt.");
      if (!activePersonId) throw new Error("Keine Person gewählt.");
      setSavingTarget(true);
      setStatus("");

      const n = parseDecimalDE(targetWeight);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Zielgewicht ungültig (z.B. 78,0).");

      await updatePersonTarget(activePersonId, n);

      setPersons((prev) =>
        prev.map((p) =>
          p.id === activePersonId ? { ...p, target_weight_kg: n } : p
        )
      );
      setTargetWeight(formatInputForDE(n));
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
      if (!activePersonId) throw new Error("Keine Person gewählt.");
      setBusy(true);
      setStatus("");

      const entryDate = date;
      const w = parseDecimalDE(weight);
      const hRaw = height.trim();
      const h = hRaw ? parseDecimalDE(height) : null;

      if (!entryDate) throw new Error("Datum fehlt.");
      if (!Number.isFinite(w) || w <= 0) throw new Error("Gewicht ungültig (z.B. 82,4).");
      if (hRaw && (!Number.isFinite(h!) || h! <= 0)) {
        throw new Error("Größe ungültig (z.B. 178 oder 178,5).");
      }

      const { data: existing, error: exErr } = await supabase
        .from("weigh_ins")
        .select("id")
        .eq("person_id", activePersonId)
        .eq("entry_date", entryDate)
        .maybeSingle();
      if (exErr) throw exErr;
      if (existing) {
        setStatus("Für dieses Datum existiert schon ein Eintrag. Bitte bearbeiten oder löschen.");
        return;
      }

      const { error } = await supabase.from("weigh_ins").insert({
        user_id: myUserId,
        person_id: activePersonId,
        entry_date: entryDate,
        weight_kg: w,
        height_cm: hRaw ? h : null,
      });
      if (error) {
        if (/height_cm/i.test(error.message || "")) {
          throw new Error(
            "Spalte height_cm fehlt. Bitte supabase/add_height_cm.sql im SQL Editor ausführen."
          );
        }
        throw error;
      }

      setWeight("");
      setHeight("");
      await loadAllWeighIns(persons.map((p) => p.id));
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(e: WeighIn) {
    setEditingId(e.id);
    setEditWeight(formatInputForDE(e.weight_kg));
    setEditHeight(e.height_cm == null ? "" : fmtCm.format(e.height_cm));
    setStatus("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditWeight("");
    setEditHeight("");
  }

  async function saveEdit(id: string) {
    try {
      if (!myUserId) throw new Error("Nicht eingeloggt.");
      if (!activePersonId) throw new Error("Keine Person gewählt.");
      setBusy(true);
      setStatus("");

      const w = parseDecimalDE(editWeight);
      if (!Number.isFinite(w) || w <= 0) throw new Error("Gewicht ungültig (z.B. 82,4).");

      const hRaw = editHeight.trim();
      const h = hRaw ? parseDecimalDE(editHeight) : null;
      if (hRaw && (!Number.isFinite(h!) || h! <= 0)) {
        throw new Error("Größe ungültig (z.B. 178 oder 178,5).");
      }

      const { error } = await supabase
        .from("weigh_ins")
        .update({
          weight_kg: w,
          height_cm: hRaw ? h : null,
        })
        .eq("id", id)
        .eq("person_id", activePersonId);
      if (error) throw error;

      cancelEdit();
      await loadAllWeighIns(persons.map((p) => p.id));
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id: string) {
    try {
      if (!myUserId) throw new Error("Nicht eingeloggt.");
      if (!activePersonId) throw new Error("Keine Person gewählt.");
      setBusy(true);
      setStatus("");

      const { error } = await supabase
        .from("weigh_ins")
        .delete()
        .eq("id", id)
        .eq("person_id", activePersonId);
      if (error) throw error;

      await loadAllWeighIns(persons.map((p) => p.id));
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const entries = useMemo(
    () => allEntries.filter((e) => e.person_id === activePersonId),
    [allEntries, activePersonId]
  );

  const latest = entries[0] ?? null;
  const prevWeek = useMemo(() => findPrevWeekEntry(entries), [entries]);
  const latestHeight = useMemo(
    () => entries.find((e) => e.height_cm != null)?.height_cm ?? null,
    [entries]
  );

  const diffToGoal = useMemo(() => {
    const tw = parseDecimalDE(targetWeight);
    if (!latest || !Number.isFinite(tw)) return null;
    return latest.weight_kg - tw;
  }, [latest, targetWeight]);

  const diffToPrevWeek = useMemo(() => {
    if (!latest || !prevWeek) return null;
    return latest.weight_kg - prevWeek.weight_kg;
  }, [latest, prevWeek]);

  const datesDesc = useMemo(() => {
    const set = new Set(allEntries.map((e) => e.entry_date));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [allEntries]);

  const maxOffset = Math.max(0, datesDesc.length - CHART_WINDOW);
  const pageCount = useMemo(() => {
    if (datesDesc.length === 0) return 0;
    return Math.ceil(datesDesc.length / CHART_WINDOW);
  }, [datesDesc.length]);

  const currentPage = useMemo(() => {
    return Math.floor(Math.min(chartOffset, maxOffset) / CHART_WINDOW);
  }, [chartOffset, maxOffset]);

  const pageDatesDesc = useMemo(() => {
    const start = Math.min(chartOffset, maxOffset);
    return datesDesc.slice(start, start + CHART_WINDOW);
  }, [datesDesc, chartOffset, maxOffset]);

  const weightChartData = useMemo(() => {
    const datesAsc = pageDatesDesc.slice().reverse();
    return datesAsc.map((d) => {
      const row: Record<string, any> = { date: d };
      for (const p of persons) {
        const hit = allEntries.find(
          (e) => e.person_id === p.id && e.entry_date === d
        );
        row[`w_${p.id}`] = hit ? hit.weight_kg : null;
      }
      return row;
    });
  }, [pageDatesDesc, persons, allEntries]);

  const heightChartData = useMemo(() => {
    const datesAsc = pageDatesDesc.slice().reverse();
    return datesAsc.map((d) => {
      const row: Record<string, any> = { date: d };
      for (const p of persons) {
        const hit = allEntries.find(
          (e) => e.person_id === p.id && e.entry_date === d && e.height_cm != null
        );
        row[`h_${p.id}`] = hit?.height_cm ?? null;
      }
      return row;
    });
  }, [pageDatesDesc, persons, allEntries]);

  const rangeLabel = useMemo(() => {
    if (pageDatesDesc.length === 0) return "";
    const newest = pageDatesDesc[0];
    const oldest = pageDatesDesc[pageDatesDesc.length - 1];
    if (!newest || !oldest) return "";
    return `${fmtDateDE(oldest)} – ${fmtDateDE(newest)}`;
  }, [pageDatesDesc]);

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

  const chartNav = {
    rangeLabel,
    pageCount,
    currentPage,
    onJump: jumpToPage,
    onNewer: goNewer,
    onOlder: goOlder,
    canNewer: chartOffset > 0,
    canOlder: chartOffset < maxOffset,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="text-xs text-zinc-400">Neon Crew · Gewicht & Größe</div>
      </div>

      <PersonBar
        persons={persons}
        activeId={activePersonId}
        busy={busy}
        onSelect={(id) => void selectPerson(id)}
        onCreate={handleCreatePerson}
        onRename={handleRenamePerson}
        onDelete={handleDeletePerson}
      />

      <Card className="space-y-4">
        <CardHeader
          title="Eintragen"
          subtitle="Für die aktive Person · ein Eintrag pro Tag · Größe optional."
        />
        <Divider />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
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
                placeholder="z.B. 82,4"
              />
            </div>

            <div>
              <div className="text-sm text-zinc-300 mb-1">Größe (cm)</div>
              <Input
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                inputMode="decimal"
                placeholder="z.B. 178"
              />
            </div>

            <Button
              onClick={addWeighIn}
              disabled={busy || !myUserId || !activePersonId}
              variant="solid"
              className="w-full"
            >
              {busy ? "…" : "Eintragen"}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <div className="text-sm text-zinc-300 mb-1">Zielgewicht (kg)</div>
              <Input
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                placeholder="z.B. 78,0"
                inputMode="decimal"
              />
            </div>

            <Button
              onClick={saveTarget}
              disabled={savingTarget || !myUserId || !activePersonId}
              className="w-full"
            >
              {savingTarget ? "…" : "Ziel speichern"}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-zinc-400">Letztes Gewicht</div>
              <div className="text-lg font-semibold">
                {latest ? `${fmtKg.format(latest.weight_kg)} kg` : "—"}
              </div>
              <div className="text-xs text-zinc-500">
                {latest ? fmtDateDE(latest.entry_date) : ""}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-zinc-400">Letzte Größe</div>
              <div className="text-lg font-semibold">
                {latestHeight != null ? `${fmtCm.format(latestHeight)} cm` : "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-zinc-400">Differenz zum Ziel</div>
              <div className="text-lg font-semibold">
                {diffToGoal == null
                  ? "—"
                  : `${diffToGoal > 0 ? "+" : ""}${fmtKg.format(diffToGoal)} kg`}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs text-zinc-400">Differenz zur Vorwoche</div>
              <div className="text-lg font-semibold">
                {diffToPrevWeek == null
                  ? "—"
                  : `${diffToPrevWeek > 0 ? "+" : ""}${fmtKg.format(diffToPrevWeek)} kg`}
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

      <MultiPersonChart
        title="Gewichts-Diagramm"
        subtitle="Alle Personen · kg"
        chartData={weightChartData}
        persons={persons}
        dataPrefix="w_"
        unit="kg"
        {...chartNav}
      />

      <MultiPersonChart
        title="Größen-Diagramm"
        subtitle="Alle Personen · cm"
        chartData={heightChartData}
        persons={persons}
        dataPrefix="h_"
        unit="cm"
        {...chartNav}
      />

      <Card>
        <CardHeader
          title="Einträge (aktive Person)"
          subtitle="Neueste zuerst. Gewicht und Größe bearbeiten/löschen."
        />
        <Divider />
        <CardBody>
          {entries.length === 0 ? (
            <div className="text-sm text-zinc-400">Keine Einträge.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="text-left text-sm text-zinc-300">
                    <th className="py-2">Datum</th>
                    <th className="py-2">kg</th>
                    <th className="py-2">cm</th>
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
                            className="w-24"
                            inputMode="decimal"
                          />
                        ) : (
                          fmtKg.format(e.weight_kg)
                        )}
                      </td>
                      <td className="py-3 text-sm text-zinc-200">
                        {editingId === e.id ? (
                          <Input
                            value={editHeight}
                            onChange={(ev) => setEditHeight(ev.target.value)}
                            className="w-24"
                            inputMode="decimal"
                            placeholder="—"
                          />
                        ) : e.height_cm != null ? (
                          fmtCm.format(e.height_cm)
                        ) : (
                          "—"
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
                            <Button onClick={() => startEdit(e)} disabled={busy}>
                              Bearbeiten
                            </Button>
                            <Button
                              onClick={() => deleteEntry(e.id)}
                              disabled={busy}
                              variant="danger"
                            >
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
