import type { Permission } from "@/lib/auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
  /** Título de seção exibido antes do item. */
  section?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: "home", section: "Meu dia" },
  { href: "/central", label: "Minha Central", icon: "user" },
  { href: "/agenda", label: "Agenda", icon: "calendar" },
  { href: "/tarefas", label: "Tarefas", icon: "check" },
  { href: "/reunioes", label: "Reuniões", icon: "users" },
  { href: "/crm", label: "CRM", icon: "target", section: "Comercial" },
  { href: "/campanhas", label: "Campanhas", icon: "megaphone" },
  { href: "/mensagens", label: "Mensagens prontas", icon: "message" },
  { href: "/respostas", label: "Respostas rápidas", icon: "zap" },
  { href: "/calendario-editorial", label: "Calendário editorial", icon: "calendarPlus", permission: "content:write" },
  { href: "/carrossel", label: "Carrossel Instagram", icon: "images", permission: "content:write" },
  { href: "/empresas", label: "Empresas", icon: "building" },
  { href: "/cotacoes", label: "Cotações", icon: "kanban", section: "Cotações" },
  { href: "/grandes-contas", label: "Grandes Contas +99", icon: "star", permission: "operations:read" },
  { href: "/pendencias", label: "Pendências", icon: "alert", permission: "operations:read" },
  { href: "/operadoras", label: "Operadoras", icon: "shield", permission: "operations:read" },
  { href: "/comparativos", label: "Comparativos", icon: "columns", permission: "operations:read" },
  { href: "/documentos", label: "Documentos", icon: "file", permission: "operations:read" },
  { href: "/renovacoes", label: "Renovações", icon: "refresh", permission: "operations:read" },
  { href: "/playbook", label: "Playbook", icon: "book", section: "Inteligência" },
  { href: "/relatorios", label: "Relatórios", icon: "chart", permission: "reports:read" },
  { href: "/assistente", label: "Assistente IA", icon: "sparkles", permission: "assistant:use" },
  { href: "/configuracoes", label: "Configurações", icon: "settings" },
];
