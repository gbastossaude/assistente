import type { Permission } from "@/lib/auth/permissions";

export const NAV_ITEMS: { href: string; label: string; icon: string; permission?: Permission }[] = [
  { href: "/", label: "Início", icon: "home" },
  { href: "/central", label: "Minha Central", icon: "user" },
  { href: "/pendencias", label: "Pendências", icon: "alert" },
  { href: "/empresas", label: "Empresas", icon: "building" },
  { href: "/cotacoes", label: "Cotações", icon: "kanban" },
  { href: "/grandes-contas", label: "Grandes Contas +99", icon: "star" },
  { href: "/operadoras", label: "Operadoras", icon: "shield" },
  { href: "/comparativos", label: "Comparativos", icon: "columns" },
  { href: "/agenda", label: "Agenda", icon: "calendar" },
  { href: "/tarefas", label: "Tarefas", icon: "check" },
  { href: "/documentos", label: "Documentos", icon: "file" },
  { href: "/renovacoes", label: "Renovações", icon: "refresh" },
  { href: "/relatorios", label: "Relatórios", icon: "chart", permission: "reports:read" },
  { href: "/assistente", label: "Assistente IA", icon: "sparkles", permission: "assistant:use" },
  { href: "/configuracoes", label: "Configurações", icon: "settings" },
];
