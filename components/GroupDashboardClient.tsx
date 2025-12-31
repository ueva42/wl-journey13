"use client";

import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

export type GroupMemberWithWeighIns = {
  user_id: string;
  display_name: string;
  role: string;
  weigh_ins: { id: string; entry_date: string; weight_kg: number }[]; // desc by date (kommt so aus server)
};

type Props = {
  meUserId: string;
  group: {
    id: string;
    name: string;
    code: string;
    owner_id: string;
  };
  members: GroupMemberWithWeighIns[];
};

function fmtDate(d: string) {
  // entry_date ist "YYYY-MM-DD"
  const [y, m, day] = d.split("-").map((x) => Number(x));
  if (!y || !m || !day) return d;
  return `${day.toString().padStart(2, "0")}.${m.toString().padStart(2, "0")}.`;
}

export default function GroupDashboardClient({ meUserId, group, members }: Props) {
  // Für Tabelle: letzte 4 je Mitglied (sortiert asc fürs Anzeigen)
  const membersWithLast4 = useMemo(() => {
    return members.map((m) => {
      const last4Desc = (m.weigh_ins ?? []).slice(0, 4);
      const last4Asc = [...last4Desc].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
      return { ...m, last4Asc, last4Desc };
    });
  }, [members]);

  // Für Chart: letzte 7 je Mitglied, dann auf gemeinsame X-Achse mergen (Datum als Key)
  const chartData = useMemo(() => {
    const datesSet = new Set<string>();

    // pro User: letzte 7 (DESC geliefert) -> wir wollen ASC fürs Chart
    const perUserAsc = new Map<string, { entry_date: string; weight_kg: number }[]>();
    for (const m of members) {
      const last7Desc = (m.weigh_ins ?? []).slice(0, 7);
      const last7Asc = [...last7Desc].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
      perUserAsc.set(m.user_id, last7Asc.map((x) => ({ entry_date: x.entry_date, weight_kg: x.weight_kg })));
      for (const x of last7Asc) datesSet.add(x.entry_date);
    }

    const dates = Array.from(datesSet).sort((a, b) => a.localeCompare(b));

    // Datensätze für recharts: { date: 'YYYY-MM-DD', user_<id>: weight }
    const rows = dates.map((d) => {
      const row: any = { date: d };
      for (const m of members) {
        const arr = perUserAsc.get(m.user_id) ?? [];
        const found = arr.find((x) => x.entry_date === d);
        row[`u_${m.user_id}`] = found ? found.weight_kg : null;
      }
      return row;
    });

    return rows;
  }, [members]);

  // Lines: eine Linie pro Member
  const lines = useMemo(() => {
    return members.map((m) => ({
      key: `u_${m.user_id}`,
      name: m.display_name + (m.role === "owner" ? " (Owner)" : ""),
    }));
  }, [members]);

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Gruppe: {group.name}</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>Gruppencode: <b>{group.code}</b></div>
          <div style={{ opacity: 0.8, marginTop: 6 }}>Mitglieder: <b>{members.length}</b></div>
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12, minWidth: 260 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Legende</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {members.map((m) => (
              <div key={m.user_id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{m.display_name}</span>
                <span style={{ opacity: 0.75 }}>
                  {m.user_id === meUserId ? "du" : m.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
        <h2 style={{ margin: 0, marginBottom: 12 }}>Gewicht – letzte 7 Einträge je Mitglied</h2>

        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tickFormatter={fmtDate} />
              <YAxis domain={["auto", "auto"]} />
              <Tooltip labelFormatter={(l) => `Datum: ${fmtDate(String(l))}`} />
              <Legend />
              {lines.map((l) => (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.name}
                  dot={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ opacity: 0.75, marginTop: 8, fontSize: 13 }}>
          Hinweis: Es werden pro Person maximal 7 letzte Einträge genutzt. Fehlende Tage bleiben leer.
        </div>
      </div>

      <div style={{ marginTop: 16, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
        <h2 style={{ margin: 0, marginBottom: 12 }}>Letzte 4 Einträge pro Mitglied</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.12)" }}>Name</th>
                <th style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.12)" }}>Rolle</th>
                <th style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.12)" }}>Einträge (neu → alt)</th>
                <th style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.12)" }}>Letzter Stand</th>
                <th style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.12)" }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {membersWithLast4.map((m) => {
                const latest = m.weigh_ins?.[0];
                const prev = m.weigh_ins?.[1];
                const trend = latest && prev ? (Number(latest.weight_kg) - Number(prev.weight_kg)) : null;

                return (
                  <tr key={m.user_id}>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                      <b>{m.display_name}</b> {m.user_id === meUserId ? <span style={{ opacity: 0.7 }}>(du)</span> : null}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>{m.role}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                      {m.last4Desc.length === 0 ? (
                        <span style={{ opacity: 0.7 }}>keine Einträge</span>
                      ) : (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {m.last4Desc.map((x) => (
                            <span
                              key={x.id}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: "1px solid rgba(0,0,0,0.14)",
                                fontSize: 13,
                              }}
                            >
                              {fmtDate(x.entry_date)} — <b>{x.weight_kg.toFixed(1)}</b> kg
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                      {latest ? <b>{Number(latest.weight_kg).toFixed(1)} kg</b> : <span style={{ opacity: 0.7 }}>–</span>}
                      {latest ? <div style={{ opacity: 0.7, fontSize: 12 }}>{fmtDate(latest.entry_date)}</div> : null}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                      {trend === null ? (
                        <span style={{ opacity: 0.7 }}>–</span>
                      ) : (
                        <b>{trend > 0 ? "+" : ""}{trend.toFixed(1)} kg</b>
                      )}
                      <div style={{ opacity: 0.7, fontSize: 12 }}>vs. vorheriger Eintrag</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
