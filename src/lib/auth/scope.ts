/**
 * Escopo de dados por papel (seção 12 do prompt mestre):
 * Administrador/Head/demais papéis de retaguarda veem tudo; Supervisor vê a própria equipe;
 * Corretor vê apenas a própria carteira.
 */
import type { Role } from "@/lib/domain/constants";

export type DataScope = { all: true } | { all: false; ownerIds: string[] };

export function computeScope(role: Role, userId: string, teamMemberIds: string[] = []): DataScope {
  if (role === "corretor") return { all: false, ownerIds: [userId] };
  if (role === "supervisor") return { all: false, ownerIds: [...new Set([userId, ...teamMemberIds])] };
  return { all: true };
}

export function inScope(scope: DataScope, ownerId: string | null | undefined): boolean {
  if (scope.all) return true;
  return !!ownerId && scope.ownerIds.includes(ownerId);
}
