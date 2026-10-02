import "server-only";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { computeScope, inScope, type DataScope } from "@/lib/auth/scope";
import type { CurrentUser } from "./auth";
import { db } from "./db";
import { users } from "./db/schema";
import { NotFoundError } from "./errors";

export type { DataScope };

/** Escopo de dados do usuário: tudo (retaguarda), equipe (supervisor) ou a própria carteira (corretor). */
export async function getScope(user: Pick<CurrentUser, "id" | "role">): Promise<DataScope> {
  if (user.role !== "supervisor") return computeScope(user.role, user.id);
  const team = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.supervisorId, user.id), eq(users.active, true)));
  return computeScope(user.role, user.id, team.map((t) => t.id));
}

/** Condição SQL de escopo para a coluna de responsável (undefined = sem restrição). */
export function ownerCond(scope: DataScope, column: PgColumn): SQL | undefined {
  return scope.all ? undefined : inArray(column, scope.ownerIds);
}

/** Registros fora do escopo se comportam como inexistentes (não revela que existem). */
export function assertInScope(scope: DataScope, ownerId: string | null | undefined, what = "Registro") {
  if (!inScope(scope, ownerId)) throw new NotFoundError(what);
}

/** Ao gravar: papéis com escopo só atribuem responsáveis dentro do próprio escopo. */
export function scopedOwner(scope: DataScope, requested: string | null | undefined, fallback: string): string {
  const owner = requested ?? fallback;
  return inScope(scope, owner) ? owner : fallback;
}
