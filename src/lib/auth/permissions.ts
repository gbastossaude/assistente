/** RBAC: papéis → permissões. Granular e pronto para expansão (basta acrescentar permissões/papéis). */
import type { Role } from "@/lib/domain/constants";

export const PERMISSIONS = [
  "read", // ler registros operacionais
  "company:write",
  "quotation:write",
  "quotation:override_ready", // marcar pronta para mercado com override
  "document:write",
  "lives:import",
  "insurer:write",
  "task:write",
  "calendar:write",
  "renewal:write",
  "pendency:write",
  "sensitive:read", // CID, relatórios médicos, documentos sensíveis
  "settings:manage", // checklists, automações, templates, parâmetros
  "users:manage",
  "audit:read",
  "delete", // exclusão lógica de registros comerciais
  "assistant:use",
  "assistant:act", // confirmar ações propostas pelo assistente
  "reports:read",
  "operations:read", // módulos de retaguarda com visão global (pendências, documentos, renovações, comparativos…)
  "crm:write", // oportunidades (CRM)
  "meeting:write", // fichas de reunião
  "campaign:write", // campanhas do mês
  "content:write", // biblioteca de mensagens prontas e respostas rápidas
  "data:export", // exportação CSV
  "lgpd:manage", // anonimização de titulares e backup JSON
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const OPERATIONAL: Permission[] = [
  "read",
  "company:write",
  "quotation:write",
  "document:write",
  "lives:import",
  "insurer:write",
  "task:write",
  "calendar:write",
  "renewal:write",
  "pendency:write",
  "assistant:use",
  "assistant:act",
  "reports:read",
  "operations:read",
  "crm:write",
  "meeting:write",
  "content:write",
  "data:export",
];

/** Papéis com escopo (supervisor/corretor) NÃO recebem "operations:read": essas telas mostram dados de toda a operação. */
const SCOPED_SALES: Permission[] = [
  "read",
  "company:write",
  "quotation:write",
  "task:write",
  "calendar:write",
  "crm:write",
  "meeting:write",
  "content:write",
  "assistant:use",
  "assistant:act",
  "reports:read",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [...PERMISSIONS],
  head: [...OPERATIONAL, "quotation:override_ready", "sensitive:read", "settings:manage", "audit:read", "delete", "campaign:write", "lgpd:manage"],
  supervisor: [...SCOPED_SALES, "campaign:write", "data:export"],
  analista: [...OPERATIONAL, "sensitive:read"],
  comercial: ["read", "company:write", "quotation:write", "task:write", "calendar:write", "renewal:write", "pendency:write", "assistant:use", "assistant:act", "reports:read", "operations:read", "crm:write", "meeting:write", "campaign:write", "content:write", "data:export"],
  corretor: SCOPED_SALES,
  assistente: ["read", "operations:read", "task:write", "calendar:write", "meeting:write", "content:write", "pendency:write", "document:write", "crm:write", "assistant:use", "assistant:act"],
  leitura: ["read", "reports:read", "assistant:use", "operations:read"],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
