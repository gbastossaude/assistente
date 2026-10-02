import "server-only";
import bcrypt from "bcryptjs";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import type { userSchema } from "@/lib/validation/schemas";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import type { DataScope } from "../scope";
import { users } from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";

// Hash de referência para equalizar o tempo de resposta quando o e-mail não existe.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("senha-inexistente", 12));

export async function authenticate(email: string, password: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  const ok = await bcrypt.compare(password, u?.passwordHash ?? (await getDummyHash()));
  if (!u || !ok || !u.active) {
    await audit({ userId: u?.id ?? null, action: "login_failed", entityType: "user", entityId: u?.id ?? null, summary: "Tentativa de login sem sucesso" });
    return null;
  }
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await audit({ userId: u.id, action: "login", entityType: "user", entityId: u.id, summary: "Login" });
  return u;
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function listUsers() {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, lastLoginAt: users.lastLoginAt, supervisorId: users.supervisorId })
    .from(users)
    .orderBy(asc(users.name));
}

export async function userOptions(scope?: DataScope) {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.active, true), scope && !scope.all ? inArray(users.id, scope.ownerIds) : undefined))
    .orderBy(asc(users.name));
}

export async function saveUser(input: z.output<typeof userSchema>, actor: CurrentUser) {
  if (input.supervisorId) {
    const [sup] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.supervisorId));
    if (!sup || sup.role !== "supervisor") throw new BusinessError("O supervisor escolhido precisa ter o papel Supervisor.", { supervisorId: ["Escolha um supervisor"] });
    if (sup.id === input.id) throw new BusinessError("Um usuário não pode supervisionar a si mesmo.", { supervisorId: ["Inválido"] });
  }
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (dup && dup.id !== input.id) throw new BusinessError("E-mail já cadastrado.", { email: ["Já cadastrado"] });
  if (input.id) {
    const [cur] = await db.select().from(users).where(eq(users.id, input.id));
    if (!cur) throw new NotFoundError("Usuário");
    if (cur.id === actor.id && (!input.active || input.role !== cur.role)) throw new BusinessError("Você não pode desativar ou alterar o próprio papel.");
    if (cur.role === "admin" && (input.role !== "admin" || !input.active)) {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`${users.role} = 'admin' and ${users.active}`);
      if (r.n <= 1) throw new BusinessError("É necessário manter ao menos um administrador ativo.");
    }
    await db
      .update(users)
      .set({ name: input.name, email: input.email, role: input.role, supervisorId: input.supervisorId, active: input.active, ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}) })
      .where(eq(users.id, input.id));
    await audit({
      userId: actor.id,
      action: "update",
      entityType: "user",
      entityId: input.id,
      summary: `Usuário atualizado: ${input.email} (${input.role}${input.active ? "" : ", inativo"})${input.password ? " — senha redefinida" : ""}`,
    });
    return input.id;
  }
  if (!input.password) throw new BusinessError("Defina uma senha inicial.", { password: ["Obrigatória"] });
  const [u] = await db
    .insert(users)
    .values({ name: input.name, email: input.email, role: input.role, supervisorId: input.supervisorId, active: input.active, passwordHash: await hashPassword(input.password) })
    .returning({ id: users.id });
  await audit({ userId: actor.id, action: "create", entityType: "user", entityId: u.id, summary: `Usuário criado: ${input.email} (${input.role})` });
  return u.id;
}

export async function changeOwnPassword(userId: string, current: string, next: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await bcrypt.compare(current, u.passwordHash))) throw new BusinessError("Senha atual incorreta.", { current: ["Incorreta"] });
  if (next.length < 10) throw new BusinessError("A nova senha deve ter ao menos 10 caracteres.", { next: ["Mínimo 10 caracteres"] });
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
  await audit({ userId, action: "update", entityType: "user", entityId: userId, summary: "Senha alterada pelo próprio usuário" });
}
