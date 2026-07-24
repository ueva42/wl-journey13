"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";


import type { TooltipProps } from "recharts";
type Group = {
  id: string;
  name: string;
  code: string;
  owner_id: string;
};

type Member = { user_id: string; display_name: string; avatar_url?: string | null };
type WeighIn = { id: string; user_id: string; entry_date: string; weight_kg: number };

function fmtDateDE(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
function safeName(s?: string | null) {
  const t = (s ?? "").trim();
  return t.length ? t : "—";
}
function initialsFromName(name: string) {
  const t = (name ?? "").trim();
  if (!t || t === "—") return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  const a = (parts[0]?.[0] ?? "").toUpperCase();
  const b = (parts.length > 1 ? parts[parts.length - 1]?.[0] : "")?.toUpperCase() ?? "";
  const res = (a + b).trim();
  return res.length ? res : a || "?";
}
function colorForIndex(i: number) {
  const hue = (i * 57) % 360;
  return `hsl(${hue} 85% 62%)`;
}
// ---- Avatar helpers ----
function parseAvatarPathFromPublicUrl(url: string) {
  const marker = "/avatars/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}
function isAllowedImageType(file: File) {
  const ok = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  return ok.includes((file.type || "").toLowerCase());
}

// ---- Modern Tooltip ----
function ModernTooltip(
  props: TooltipProps<number, string> & { nameById: Map<string, string> }
) {
  const { active, payload, nameById } = props as any;
  const label = (props as any).label;
  if (!active || !payload || payload.length === 0) return null;

  const date = String(label ?? "");

  const rows = Array.from(payload)
    .filter((p) => p && (p as any).value != null && Number.isFinite(Number((p as any).value)))
    .map((p) => ({
      key: String((p as any).dataKey),
      name: nameById.get(String((p as any).dataKey)) ?? String((p as any).dataKey),
      value: Number((p as any).value),
      color: (p as any).stroke ?? "rgba(255,255,255,0.7)",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.14)",
        background:
          "linear-gradient(180deg, rgba(20,20,20,0.92), rgba(8,8,8,0.92))",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        padding: "10px 12px",
        minWidth: 220,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
        Datum: <span style={{ opacity: 0.95 }}>{fmtDateDE(date)}</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.75 }}>Keine Werte.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((r) => (
            <div
              key={r.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: r.color,
                    boxShadow: `0 0 14px ${r.color}`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, opacity: 0.9 }} className="truncate">
                  {r.name}
                </span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2 }}>
                {r.value.toFixed(1)} kg
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GroupDashboardPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const router = useRouter();

  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);

  // Chart Paging
  const CHART_WINDOW = 10;
  const [chartOffset, setChartOffset] = useState(0);

  // Swipe: Teilnehmer-Karte
  const [activeMemberIndex, setActiveMemberIndex] = useState(0);
  const [mSwipeStartX, setMSwipeStartX] = useState<number | null>(null);
  const [mSwipeStartTime, setMSwipeStartTime] = useState<number | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setStatus("");
        setLoading(true);

        const { data: u } = await supabase.auth.getUser();
        const user = u.user;
        if (!user) {
          router.push("/login");
          return;
        }
        setMyUserId(user.id);

        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("active_group_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (pErr) throw pErr;

        if (!prof?.active_group_id) {
          setGroup(null);
          setMembers([]);
          setWeighIns([]);
          setStatus("Du bist aktuell in keiner aktiven Gruppe.");
          return;
        }

        const groupId = prof.active_group_id as string;

        // group
        const { data: gRaw, error: gErr } = await supabase
          .from("groups")
          .select("*")
          .eq("id", groupId)
          .single();
        if (gErr) throw gErr;

        const g: Group = {
          id: gRaw.id,
          name: gRaw.name,
          code: gRaw.code,
          owner_id: gRaw.owner_id,
        };
        setGroup(g);

        // Member-IDs
        const { data: ms, error: mErr } = await supabase
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId);
        if (mErr) throw mErr;

        const ids = (ms ?? []).map((x: any) => x.user_id);
        if (ids.length === 0) {
          setMembers([]);
          setWeighIns([]);
          return;
        }

        // Profiles der Member inkl. avatar_url
        const { data: ps, error: prErr } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", ids);
        if (prErr) throw prErr;

        const merged: Member[] = (ps ?? [])
          .map((p: any) => ({
            user_id: p.user_id,
            display_name: p.display_name ?? "—",
            avatar_url: p.avatar_url ?? null,
          }))
          .sort((a: Member, b: Member) =>
            safeName(a.display_name).localeCompare(safeName(b.display_name), "de")
          );

        setMembers(merged);

        const meIndex = merged.findIndex((m) => m.user_id === user.id);
        setActiveMemberIndex(meIndex >= 0 ? meIndex : 0);

        // weigh_ins aller Member
        const { data: ws, error: wErr } = await supabase
          .from("weigh_ins")
          .select("id, user_id, entry_date, weight_kg")
          .in("user_id", ids)
          .order("entry_date", { ascending: false })
          .limit(3000);
        if (wErr) throw wErr;

        setWeighIns(
          (ws ?? []).map((x: any) => ({
            id: x.id,
            user_id: x.user_id,
            entry_date: x.entry_date,
            weight_kg: Number(x.weight_kg),
          }))
        );

        setChartOffset(0);
      } catch (e: any) {
        setStatus(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Letzter Eintrag je Nutzer (für Box über Chart) ----
  const latestWeighInByUser = useMemo(() => {
    const map = new Map<string, WeighIn>();
    for (const w of weighIns) {
      const prev = map.get(w.user_id);
      if (!prev || w.entry_date > prev.entry_date) map.set(w.user_id, w);
    }
    return map;
  }, [weighIns]);

  const latestRows = useMemo(() => {
    return members
      .map((m) => {
        const lw = latestWeighInByUser.get(m.user_id);
        return {
          user_id: m.user_id,
          name: safeName(m.display_name),
          date: lw?.entry_date ?? null,
          weight: lw?.weight_kg ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [members, latestWeighInByUser]);

  // ---- Chart (alle Linien) ----
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.user_id, safeName(mem.display_name));
    return m;
  }, [members]);

  const allDatesDesc = useMemo(() => {
    const set = new Set<string>();
    for (const w of weighIns) set.add(w.entry_date);
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [weighIns]);

  const maxOffset = Math.max(0, allDatesDesc.length - CHART_WINDOW);

  const windowDatesDesc = useMemo(() => {
    const start = Math.min(chartOffset, maxOffset);
    return allDatesDesc.slice(start, start + CHART_WINDOW);
  }, [allDatesDesc, chartOffset, maxOffset]);

  const windowDatesAsc = useMemo(() => windowDatesDesc.slice().reverse(), [windowDatesDesc]);

  const weightByDateUser = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const w of weighIns) {
      if (!map.has(w.entry_date)) map.set(w.entry_date, new Map());
      map.get(w.entry_date)!.set(w.user_id, w.weight_kg);
    }
    return map;
  }, [weighIns]);

  const chartData = useMemo(() => {
    return windowDatesAsc.map((d) => {
      const row: any = { date: d };
      const perUser = weightByDateUser.get(d);
      for (const m of members) {
        row[m.user_id] = perUser?.get(m.user_id) ?? null;
      }
      return row;
    });
  }, [windowDatesAsc, weightByDateUser, members]);

  const rangeLabel = useMemo(() => {
    if (windowDatesDesc.length === 0) return "";
    const newest = windowDatesDesc[0];
    const oldest = windowDatesDesc[windowDatesDesc.length - 1];
    return `${fmtDateDE(oldest)} – ${fmtDateDE(newest)}`;
  }, [windowDatesDesc]);

  function goOlderChart() {
    setChartOffset((o) => Math.min(o + CHART_WINDOW, maxOffset));
  }
  function goNewerChart() {
    setChartOffset((o) => Math.max(o - CHART_WINDOW, 0));
  }

  // ---- Teilnehmer Karte (Swipe) ----
  const activeMember = members[activeMemberIndex] ?? null;

  const activeMemberWeighIns = useMemo(() => {
    if (!activeMember) return [];
    return weighIns
      .filter((w) => w.user_id === activeMember.user_id)
      .sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1))
      .slice(0, 5);
  }, [weighIns, activeMember]);

  function prevMember() {
    setActiveMemberIndex((i) => (members.length ? (i - 1 + members.length) % members.length : 0));
  }
  function nextMember() {
    setActiveMemberIndex((i) => (members.length ? (i + 1) % members.length : 0));
  }

  function canStartSwipe(clientX: number, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const edge = 28;
    return clientX > r.left + edge && clientX < r.right - edge;
  }

  function onMemberPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return;
    const el = e.currentTarget;
    if (!canStartSwipe(e.clientX, el)) return;
    setMSwipeStartX(e.clientX);
    setMSwipeStartTime(Date.now());
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
  }

  function onMemberPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || mSwipeStartX == null || mSwipeStartTime == null) return;
    const dx = e.clientX - mSwipeStartX;
    const dt = Date.now() - mSwipeStartTime;
    const THRESH = 45;
    if (dt <= 900) {
      if (dx <= -THRESH) nextMember();
      else if (dx >= THRESH) prevMember();
    }
    setMSwipeStartX(null);
    setMSwipeStartTime(null);
  }

  function onMemberPointerCancel() {
    setMSwipeStartX(null);
    setMSwipeStartTime(null);
  }

  // ---- Avatar Upload/Delete (nur eigener User) ----
  async function uploadAvatar(file: File) {
    if (!myUserId) return;

    if (!isAllowedImageType(file)) {
      setStatus("Nur JPG/PNG/WEBP erlaubt.");
      return;
    }

    try {
      setUploading(true);
      setStatus("");

      const extFromMime =
        file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";

      const path = `${myUserId}/${Date.now()}.${extFromMime}`;

      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        cacheControl: "3600",
        contentType: file.type || "image/jpeg",
      });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;

      const { error: pErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("user_id", myUserId);
      if (pErr) throw pErr;

      setMembers((prev) => prev.map((m) => (m.user_id === myUserId ? { ...m, avatar_url: url } : m)));
      setStatus("Profilbild gespeichert.");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  }

  async function deleteAvatar() {
    if (!myUserId) return;

    const me = members.find((m) => m.user_id === myUserId);
    const url = me?.avatar_url ?? null;

    try {
      setDeletingAvatar(true);
      setStatus("");

      if (url) {
        const path = parseAvatarPathFromPublicUrl(url);
        if (path) {
          const { error: delErr } = await supabase.storage.from("avatars").remove([path]);
          if (delErr) console.warn("avatar remove failed:", delErr.message);
        }
      }

      const { error: pErr } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("user_id", myUserId);
      if (pErr) throw pErr;

      setMembers((prev) => prev.map((m) => (m.user_id === myUserId ? { ...m, avatar_url: null } : m)));
      setStatus("Profilbild gelöscht.");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setDeletingAvatar(false);
    }
  }

  // ---- Chart “Modern GTA-ish” Styling ----
  const chartWrapStyle: React.CSSProperties = {
    width: "100%",
    height: 400,
    minWidth: 0,
    marginTop: 12,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      "radial-gradient(900px 340px at 15% 0%, rgba(255,46,99,0.18), transparent 55%), radial-gradient(900px 340px at 85% 0%, rgba(0,220,255,0.14), transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.2))",
    boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
    overflow: "hidden",
  };

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Gruppen-Dashboard</h1>
          <div className="text-sm opacity-70">
            {group ? (
              <>
                Gruppe: <span className="font-semibold">{group.name}</span>{" "}
                <span className="opacity-60">(Code: {group.code})</span>
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => router.push("/dashboard")}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
          >
            Zum Dashboard
          </button>
          <button
            onClick={() => router.push("/group")}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
          >
            Zur Gruppe
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">Lade…</div>
      ) : null}

      {status ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">{status}</div>
      ) : null}

      {/* Letzter Eintrag je Nutzer */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-5 space-y-3">
        <div className="text-sm font-semibold">Letzter Eintrag je Teilnehmer</div>

        {latestRows.length === 0 ? (
          <div className="text-sm opacity-70">Keine Teilnehmer.</div>
        ) : (
          <div className="divide-y divide-white/10 rounded-xl border border-white/10 overflow-hidden">
            {latestRows.map((r) => (
              <div key={r.user_id} className="flex items-center justify-between p-3">
                <div className="text-sm min-w-0">
                  <span className="font-semibold">{r.name}</span>
                  <span className="opacity-70">{r.date ? ` · ${fmtDateDE(r.date)}` : " · —"}</span>
                </div>
                <div className="text-sm font-semibold">
                  {typeof r.weight === "number" ? `${r.weight.toFixed(1)} kg` : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
        <div className="flex items-center justify-between mb-1 gap-3">
          <div>
            <div className="text-sm font-semibold">Gewicht – alle Teilnehmer (10er-Fenster)</div>
            <div className="text-xs opacity-70">{rangeLabel}</div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={goNewerChart}
              disabled={chartOffset === 0}
              className="rounded-xl border border-white/15 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              Neuer
            </button>
            <button
              onClick={goOlderChart}
              disabled={chartOffset >= maxOffset}
              className="rounded-xl border border-white/15 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              Älter
            </button>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="text-sm opacity-70 mt-3">Noch keine Daten.</div>
        ) : (
          <div style={chartWrapStyle}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 18, right: 18, left: 6, bottom: 12 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => String(v).slice(5)}
                  tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.12)" }}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                  tickLine={{ stroke: "rgba(255,255,255,0.12)" }}
                />
                <Tooltip
                  content={(props: any) => <ModernTooltip {...(props as any)} nameById={nameById} />}
                  cursor={{ stroke: "rgba(255,255,255,0.10)" }}
                />
                <Legend
                  wrapperStyle={{
                    paddingTop: 10,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.75)",
                  }}
                  formatter={(value) => nameById.get(String(value)) ?? String(value)}
                />

                {members.map((m, idx) => {
                  const stroke = colorForIndex(idx);
                  return (
                    <Line
                      key={m.user_id}
                      type="monotone"
                      dataKey={m.user_id}
                      dot={false}
                      activeDot={{
                        r: 5,
                        strokeWidth: 2,
                        stroke: "rgba(0,0,0,0.8)",
                        fill: stroke,
                      }}
                      connectNulls={false}
                      stroke={stroke}
                      strokeWidth={2.4}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="text-xs opacity-70 mt-2">Chart: über „Neuer/Älter“ blättern.</div>
      </div>

      {/* Swipe Card */}
      <div
        className="rounded-2xl border border-white/15 bg-white/5 p-5 space-y-5"
        style={{ touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none" }}
        onPointerDown={onMemberPointerDown}
        onPointerUp={onMemberPointerUp}
        onPointerCancel={onMemberPointerCancel}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Teilnehmer</div>
            <div className="text-xs opacity-70">
              {members.length ? `Swipe: ${activeMemberIndex + 1}/${members.length}` : "—"}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={prevMember}
              disabled={members.length <= 1}
              className="rounded-xl border border-white/15 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              ◀
            </button>
            <button
              onClick={nextMember}
              disabled={members.length <= 1}
              className="rounded-xl border border-white/15 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              ▶
            </button>
          </div>
        </div>

        {!activeMember ? (
          <div className="text-sm opacity-70">Keine Mitglieder.</div>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 999,
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background:
                      "radial-gradient(24px 24px at 30% 30%, rgba(255,46,99,0.35), transparent 60%), radial-gradient(30px 30px at 70% 30%, rgba(0,220,255,0.25), transparent 60%), rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
                  }}
                >
                  {activeMember.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeMember.avatar_url}
                      alt="avatar"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontWeight: 800, letterSpacing: 0.8 }}>
                      {initialsFromName(safeName(activeMember.display_name))}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-lg font-semibold truncate">
                    {safeName(activeMember.display_name)}{" "}
                    {activeMember.user_id === myUserId ? (
                      <span className="text-sm opacity-70">(du)</span>
                    ) : null}
                  </div>

                  {activeMember.user_id === myUserId ? (
                    <div className="flex gap-2 flex-wrap mt-2">
                      <label className="inline-block">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={uploading || deletingAvatar}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadAvatar(f);
                            e.currentTarget.value = "";
                          }}
                          style={{ display: "none" }}
                        />
                        <span
                          className="rounded-xl border border-white/15 px-3 py-1 text-sm hover:bg-white/10 inline-block cursor-pointer"
                          style={{ opacity: uploading || deletingAvatar ? 0.6 : 1 }}
                        >
                          {uploading ? "Upload…" : "Profilbild hochladen"}
                        </span>
                      </label>

                      <button
                        onClick={deleteAvatar}
                        disabled={deletingAvatar || uploading || !activeMember.avatar_url}
                        className="rounded-xl border border-white/15 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
                      >
                        {deletingAvatar ? "Lösche…" : "Profilbild löschen"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">Letzte 5 Einträge</div>
                {activeMemberWeighIns.length === 0 ? (
                  <div className="text-sm opacity-70">Noch keine Einträge.</div>
                ) : (
                  <div className="divide-y divide-white/10 rounded-xl border border-white/10 overflow-hidden">
                    {activeMemberWeighIns.map((w) => (
                      <div key={w.id} className="flex items-center justify-between p-3">
                        <div className="text-sm">{fmtDateDE(w.entry_date)}</div>
                        <div className="text-sm font-semibold">{w.weight_kg.toFixed(1)} kg</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs opacity-70">
              Tipp: Auf der Karte links/rechts wischen, um den Teilnehmer zu wechseln.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
