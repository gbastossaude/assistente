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
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [...PERMISSIONS],
  head: [...OPERATIONAL, "quotation:override_ready", "sensitive:read", "settings:manage", "audit:read", "delete"],
  analista: [...OPERATIONAL, "sensitive:read"],
  comercial: ["read", "company:write", "quotation:write", "task:write", "calendar:write", "renewal:write", "pendency:write", "assistant:use", "assistant:act", "reports:read"],
  leitura: ["read", "reports:read", "assistant:use"],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
