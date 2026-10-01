"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Bucket } from "@/lib/lives-import/summary";
import { formatNumber } from "@/lib/utils";

/** Barras de série única (cor da série 1); o título nomeia a série, sem legenda. Tooltip ao passar o mouse. */
export function BucketBarChart({ title, data, horizontal, height = 220, max = 12 }: { title: string; data: Bucket[]; horizontal?: boolean; height?: number; max?: number }) {
  const rows = data.slice(0, max);
  const other = data.slice(max).reduce((a, b) => a + b.count, 0);
  if (other > 0) rows.push({ key: "Outros", count: other });
  const total = data.reduce((a, b) => a + b.count, 0);
  return (
    <figure className="rounded-lg border border-border bg-surface p-3">
      <figcaption className="mb-2 text-xs font-semibold text-muted">{title}</figcaption>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">Sem dados</p>
      ) : (
        <div style={{ height: horizontal ? Math.max(120, rows.length * 26 + 30) : height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 4, right: 12, bottom: 4, left: horizontal ? 8 : -12 }} barCategoryGap={2}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="0" vertical={horizontal} horizontal={!horizontal} />
              {horizontal ? (
                <>
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--chart-text)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="key" width={130} tick={{ fill: "var(--chart-text)", fontSize: 11 }} axisLine={false} tickLine={false} />
                </>
              ) : (
                <>
                  <XAxis dataKey="key" tick={{ fill: "var(--chart-text)", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={rows.length > 8 ? -30 : 0} textAnchor={rows.length > 8 ? "end" : "middle"} height={rows.length > 8 ? 50 : 24} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--chart-text)", fontSize: 11 }} axisLine={false} tickLine={false} />
                </>
              )}
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--foreground)" }}
                formatter={(v) => [`${formatNumber(Number(v))} (${total ? Math.round((Number(v) / total) * 100) : 0}%)`, "Vidas"]}
              />
              <Bar dataKey="count" isAnimationActive={false} fill="var(--series-1)" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-muted">Ver tabela</summary>
        <table className="mt-1 w-full">
          <tbody>
            {data.map((b) => (
              <tr key={b.key} className="border-t border-border">
                <td className="py-0.5">{b.key}</td>
                <td className="py-0.5 text-right tabular-nums">{formatNumber(b.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
