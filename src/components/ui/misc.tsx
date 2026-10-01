import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-xs text-muted hover:text-foreground">
            ← {back.label}
          </Link>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center", className)}>
      {icon && <div className="text-muted [&_svg]:size-8">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-md text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Progress({ value, tone = "blue", className, label }: { value: number; tone?: "red" | "amber" | "blue" | "green"; className?: string; label?: string }) {
  const color = { red: "bg-red-500", amber: "bg-amber-500", blue: "bg-blue-600", green: "bg-emerald-600" }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function StatCard({ label, value, hint, href, tone = "default", icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "default" | "red" | "amber" | "green" | "blue"; icon?: React.ReactNode }) {
  const accent = { default: "", red: "border-l-red-500", amber: "border-l-amber-500", green: "border-l-emerald-500", blue: "border-l-blue-500" }[tone];
  const inner = (
    <div className={cn("flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-3.5 shadow-xs transition-colors", tone !== "default" && "border-l-4", accent, href && "hover:bg-surface-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon && <span className="text-muted [&_svg]:size-4">{icon}</span>}
      </div>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap border-b border-border bg-surface-2/60 px-3 py-2 text-left text-xs font-semibold text-muted", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border px-3 py-2 align-top", className)} {...props} />;
}

export function KeyValue({ items, cols = 2 }: { items: { label: string; value: React.ReactNode }[]; cols?: 2 | 3 | 4 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3", grid)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words text-sm">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TabLinks({ tabs, active, baseHref }: { tabs: { key: string; label: string; count?: number | null }[]; active: string; baseHref: string }) {
  return (
    <nav className="no-print -mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Abas">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${baseHref}${baseHref.includes("?") ? "&" : "?"}tab=${t.key}`}
          scroll={false}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm",
            active === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted hover:text-foreground",
          )}
        >
          {t.label}
          {t.count ? <span className="rounded-full bg-surface-2 px-1.5 text-[10px] font-semibold">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}
