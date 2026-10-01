/**
 * Bootstrap (seguro para produção, idempotente): parâmetros padrão, modelos de checklist NEW/RENEW,
 * templates de mensagens, regras de automação, catálogo de operadoras e o primeiro administrador
 * (ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME) quando não houver usuários. Não cria dados de clientes.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgConfig } from "../src/server/db/pg-config";
import { CHECKLIST_CATALOG } from "../src/lib/domain/checklist-catalog";
import { DEFAULT_TEMPLATES } from "../src/lib/domain/messages";
import { AUTOMATION_RULES, DEFAULT_SETTINGS } from "../src/lib/domain/settings-defaults";
import * as schema from "../src/server/db/schema";

const INSURERS: { name: string; kind: "operadora" | "seguradora" }[] = [
  { name: "Amil", kind: "operadora" },
  { name: "Bradesco Saúde", kind: "seguradora" },
  { name: "SulAmérica Saúde", kind: "seguradora" },
  { name: "Porto Saúde", kind: "seguradora" },
  { name: "Allianz Saúde", kind: "seguradora" },
  { name: "Seguros Unimed", kind: "seguradora" },
  { name: "Unimed (cooperativa local)", kind: "operadora" },
  { name: "Hapvida NotreDame Intermédica", kind: "operadora" },
  { name: "Omint", kind: "operadora" },
  { name: "Care Plus", kind: "operadora" },
  { name: "Prevent Senior", kind: "operadora" },
  { name: "Golden Cross", kind: "operadora" },
  { name: "MedSênior", kind: "operadora" },
  { name: "Alice", kind: "operadora" },
];

export async function bootstrap(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL não configurada");
  const pool = new Pool(pgConfig(url));
  const db = drizzle(pool, { schema });

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
  }

  let order = 0;
  for (const item of CHECKLIST_CATALOG) {
    order += 10;
    for (const processType of ["NEW", "RENEW"] as const) {
      if (processType === "NEW" && item.inNew === false) continue;
      if (processType === "RENEW" && item.inRenew === false) continue;
      await db
        .insert(schema.checklistTemplates)
        .values({
          processType,
          itemKey: item.key,
          label: item.label,
          category: item.category,
          required: processType === "NEW" ? item.requiredNew : item.requiredRenew,
          condition: item.condition,
          autoSource: item.autoSource,
          documentType: item.documentType ?? null,
          requestText: item.requestText,
          sortOrder: order,
        })
        .onConflictDoNothing();
    }
  }

  for (const t of DEFAULT_TEMPLATES) {
    await db
      .insert(schema.messageTemplates)
      .values({ key: t.key, name: t.name, audience: t.audience, channel: t.channel, tone: t.tone ?? null, subject: t.subject ?? null, body: t.body })
      .onConflictDoNothing();
  }

  for (const r of AUTOMATION_RULES) {
    await db.insert(schema.automationRules).values({ key: r.key, name: r.name, description: r.description, params: r.params }).onConflictDoNothing();
  }

  for (const i of INSURERS) await db.insert(schema.insurers).values(i).onConflictDoNothing();

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (n === 0) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      if (password.length < 10) throw new Error("ADMIN_PASSWORD deve ter ao menos 10 caracteres");
      await db.insert(schema.users).values({ name: process.env.ADMIN_NAME || "Administrador", email: email.toLowerCase(), role: "admin", passwordHash: await bcrypt.hash(password, 12) });
      console.log(`Administrador criado: ${email}`);
    } else {
      console.warn("Nenhum usuário existe. Defina ADMIN_EMAIL e ADMIN_PASSWORD e rode novamente para criar o administrador.");
    }
  }
  await pool.end();
  console.log("Bootstrap concluído.");
}

if (process.argv[1]?.endsWith("bootstrap.ts")) {
  bootstrap().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
