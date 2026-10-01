import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { can, type Permission } from "@/lib/auth/permissions";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/auth/session";
import { db } from "./db";
import { users } from "./db/schema";
import { ForbiddenError } from "./errors";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: SessionPayload["role"];
}

/** Usuário da sessão, revalidado contra o banco (usuário desativado perde acesso imediatamente). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, session.sub));
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export { ForbiddenError };

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u.role, permission)) throw new ForbiddenError();
  return u;
}

export function hasPermission(user: CurrentUser | null, permission: Permission) {
  return can(user?.role, permission);
}
