import { execSync } from "node:child_process";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { dbSchema } from "@/server/db/pg-config";
import { users } from "@/server/db/schema";
import type { CurrentUser } from "@/server/auth";

export const hasTestDb = !!process.env.TEST_DATABASE_URL;

/** Recria o schema do banco de teste (public ou DATABASE_SCHEMA), aplica migrations e bootstrap. */
export async function resetTestDb() {
  const schema = dbSchema();
  if (schema === "public") {
    await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  } else {
    // Só o schema do sistema: o "public" (de outro sistema no mesmo banco) não é tocado.
    await db.execute(sql.raw(`drop schema if exists "${schema}" cascade`));
  }
  const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL! };
  execSync("npx tsx scripts/migrate.ts", { env, stdio: "pipe" });
  execSync("npx tsx scripts/bootstrap.ts", { env, stdio: "pipe" });
}

export async function makeUser(role: CurrentUser["role"] = "head", name = "Usuária Teste"): Promise<CurrentUser> {
  const email = `${role}-${Math.random().toString(36).slice(2, 8)}@teste.local`;
  const [u] = await db
    .insert(users)
    .values({ name, email, role, passwordHash: await bcrypt.hash("senha-de-teste-123", 4) })
    .returning();
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}
