import { cn } from "@especialista/ui";

/** Gráfico de barras em SVG acessível (sem bibliotecas): total por dia e, em destaque, "sem fonte". */
export function DailyBars({ data }: { data: Array<{ day: string; total: number; no_source: number }> }) {
  if (data.length === 0) return <p className="py-8 text-center text-sm text-ink-500">Sem consultas no período.</p>;
  const max = Math.max(1, ...data.map((d) => d.total));
  const w = 100 / data.length;
  return (
    <figure>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Consultas por dia">
        {data.map((d, i) => {
          const h = (d.total / max) * 38;
          const hn = (d.no_source / max) * 38;
          return (
            <g key={d.day}>
              <title>{`${d.day.split("-").reverse().join("/")}: ${d.total} consultas, ${d.no_source} sem fonte`}</title>
              <rect x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={h} rx={0.6} className="fill-brand-700" />
              <rect x={i * w + w * 0.15} y={40 - hn} width={w * 0.7} height={hn} rx={0.6} className="fill-warning-600" />
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-700" /> Consultas</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-warning-600" /> Sem fonte confiável</span>
      </figcaption>
    </figure>
  );
}

export function RankList({ items }: { items: Array<{ label: string; total: number }> }) {
  if (items.length === 0) return <p className="py-4 text-sm text-ink-500">Sem dados no período.</p>;
  const max = Math.max(1, ...items.map((i) => i.total));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between text-xs"><span className="text-ink-900">{i.label}</span><span className="tabular-nums text-ink-500">{i.total}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-ink-100"><div className="h-1.5 rounded-full bg-accent-600" style={{ width: `${(i.total / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function UsageMeter({ used, cap, label }: { used: number; cap: number; label: string }) {
  const pct = cap ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-ink-700">{label}</span><span className="tabular-nums font-medium">{used} / {cap}</span></div>
      <div className="mt-1.5 h-2.5 rounded-full bg-ink-100" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={cap} aria-label={label}>
        <div className={cn("h-2.5 rounded-full", pct >= 95 ? "bg-danger-600" : pct >= 80 ? "bg-warning-600" : "bg-success-600")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Kpi({ label, value, hint, tone = "default" }: { label: string; value: string | number; hint?: string; tone?: "default" | "warning" | "danger" | "success" }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "warning" && "text-warning-600", tone === "danger" && "text-danger-600", tone === "success" && "text-success-600")}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p>}
    </div>
  );
}
