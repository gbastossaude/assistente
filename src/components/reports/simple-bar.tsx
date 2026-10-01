"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/utils";

/** Barras horizontais de série única: rótulo da categoria no eixo, valor no tooltip e em tabela. */
export function SimpleBar({ title, data, unit = "", decimals = 0 }: { title: string; data: { label: string; value: number }[]; unit?: string; decimals?: number }) {
  return (
    <figure className="rounded-lg border border-border bg-surface p-3">
      <figcaption className="mb-2 text-xs font-semibold text-muted">{title}</figcaption>
      {data.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">Sem dados no período</p>
      ) : (
        <div style={{ height: Math.max(120, data.length * 28 + 30) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap={2}>
              <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "var(--chart-text)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={decimals > 0} />
              <YAxis type="category" dataKey="label" width={170} tick={{ fill: "var(--chart-text)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--foreground)" }}
                formatter={(v) => [`${formatNumber(Number(v), decimals || undefined)}${unit}`, title]}
              />
              <Bar dataKey="value" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-muted">Ver tabela</summary>
        <table className="mt-1 w-full">
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-border">
                <td className="py-0.5">{d.label}</td>
                <td className="py-0.5 text-right tabular-nums">
                  {formatNumber(d.value, decimals || undefined)}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
