"use client";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  Columns3,
  FileText,
  GalleryHorizontalEnd,
  Home,
  KanbanSquare,
  Megaphone,
  Menu,
  MessageSquareText,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  UserCircle,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ICONS = {
  home: Home,
  user: UserCircle,
  alert: AlertTriangle,
  building: Building2,
  kanban: KanbanSquare,
  star: Star,
  shield: ShieldCheck,
  columns: Columns3,
  calendar: CalendarDays,
  calendarPlus: CalendarRange,
  images: GalleryHorizontalEnd,
  check: CheckSquare,
  file: FileText,
  refresh: RefreshCw,
  chart: BarChart3,
  sparkles: Sparkles,
  settings: Settings,
  book: BookOpen,
  target: Target,
  megaphone: Megaphone,
  message: MessageSquareText,
  zap: Zap,
  users: Users,
} as const;

export function Sidebar({ items, badges }: { items: { href: string; label: string; icon: string; section?: string }[]; badges: Record<string, number> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="flex flex-col gap-0.5 p-2" aria-label="Menu principal">
      {items.map((it) => {
        const Icon = ICONS[it.icon as keyof typeof ICONS] ?? Home;
        const active = it.href === "/" ? pathname === "/" : pathname === it.href || pathname.startsWith(`${it.href}/`);
        const badge = badges[it.href];
        return (
          <div key={it.href}>
          {it.section && <p className="mt-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/70 first:mt-0">{it.section}</p>}
          <Link
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-sidebar-active font-medium text-white" : "text-sidebar-foreground hover:bg-sidebar-active/60 hover:text-white",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{it.label}</span>
            {badge ? <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{badge > 99 ? "99+" : badge}</span> : null}
          </Link>
          </div>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2 px-4 py-4">
      <span className="flex size-8 items-center justify-center rounded-md bg-white/10 text-xs font-bold text-white">BS</span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-white">BeSmart</span>
        <span className="block text-[11px] text-sidebar-foreground">Health Cockpit</span>
      </span>
    </Link>
  );

  return (
    <>
      <button type="button" className="no-print fixed left-3 top-3 z-40 rounded-md bg-sidebar p-2 text-white shadow lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
        <Menu className="size-5" />
      </button>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar lg:flex">
        {brand}
        <div className="flex-1 overflow-y-auto">{nav}</div>
      </aside>
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar">
            <div className="flex items-center justify-between">
              {brand}
              <button type="button" className="mr-3 rounded p-1 text-white" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
          </aside>
        </div>
      )}
    </>
  );
}
