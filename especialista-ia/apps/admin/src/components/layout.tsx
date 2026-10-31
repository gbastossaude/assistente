import {
  BookOpenCheck, ClipboardList, Download, FileText, Gauge, Headset, LogOut, Menu, MessageSquareText, ScrollText, Settings, ShieldCheck, Users, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ROLE_LABELS, type Role } from "@especialista/shared";
import { Badge, Button, cn } from "@especialista/ui";
import { useAuth } from "../lib/auth.tsx";
import { useInstallApp } from "../lib/install.ts";
import type { Branding } from "../lib/branding.ts";

export const NAV: Array<{ to: string; label: string; icon: typeof Gauge; roles: Role[] }> = [
  { to: "/", label: "Dashboard", icon: Gauge, roles: ["admin", "editor"] },
  { to: "/consultar", label: "Consultar", icon: MessageSquareText, roles: ["admin", "editor", "colaborador"] },
  { to: "/documentos", label: "Documentos", icon: FileText, roles: ["admin", "editor"] },
  { to: "/perguntas", label: "Perguntas", icon: ClipboardList, roles: ["admin", "editor"] },
  { to: "/atendimentos", label: "Atendimento humano", icon: Headset, roles: ["admin", "editor"] },
  { to: "/regras", label: "Regras e FAQ", icon: BookOpenCheck, roles: ["admin", "editor"] },
  { to: "/colaboradores", label: "Colaboradores", icon: Users, roles: ["admin"] },
  { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] },
  { to: "/auditoria", label: "Auditoria", icon: ScrollText, roles: ["admin"] },
];

export function AppLayout({ branding }: { branding: Branding }) {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => profile && n.roles.includes(profile.role));
  const app = useInstallApp();
  return (
    <div className="flex min-h-screen">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">Pular para o conteúdo</a>
      <aside className={cn("fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-brand-900 text-white transition-transform lg:static lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center gap-3 px-5 py-5">
          <img src={branding.logo_url || "/logo.png"} alt="" className="h-9 w-9 rounded-lg bg-white/10 object-contain" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">{branding.product_name.split("—")[0].trim()}</p>
            <p className="truncate text-[11px] text-white/60">{branding.company_name || "Planos de saúde"}</p>
          </div>
          <button className="ml-auto lg:hidden cursor-pointer" onClick={() => setOpen(false)} aria-label="Fechar menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Menu principal">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} onClick={() => setOpen(false)}
              className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors", isActive ? "bg-white/12 font-medium text-white" : "text-white/70 hover:bg-white/8 hover:text-white")}>
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <InstallApp app={app} />
          <p className="truncate text-sm font-medium">{profile?.full_name || profile?.email}</p>
          <div className="mt-1 flex items-center justify-between">
            <Badge tone="brand" className="bg-white/10 ring-white/20"><ShieldCheck className="h-3 w-3" />{profile ? ROLE_LABELS[profile.role] : ""}</Badge>
            <Button variant="ghost" size="sm" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={signOut}><LogOut className="h-3.5 w-3.5" /> Sair</Button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="cursor-pointer"><Menu className="h-5 w-5" /></button>
          <span className="text-sm font-semibold">{branding.product_name}</span>
          {app.canPrompt && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={app.install}><Download className="h-3.5 w-3.5" /> Instalar</Button>
          )}
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function InstallApp({ app }: { app: ReturnType<typeof useInstallApp> }) {
  if (app.canPrompt) {
    return (
      <button onClick={app.install} className="mb-3 flex w-full cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-left text-sm hover:bg-white/15">
        <Download className="h-4 w-4" aria-hidden />
        <span><span className="block font-medium">Instalar como aplicativo</span><span className="block text-[11px] text-white/60">Ícone na área de trabalho / celular</span></span>
      </button>
    );
  }
  if (app.iosHint) {
    return (
      <p className="mb-3 rounded-lg bg-white/10 px-3 py-2 text-[11px] text-white/80">
        Para ter o ícone no iPhone: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
      </p>
    );
  }
  return null;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-950">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-2.5 align-top", className)}>{children}</td>;
}
