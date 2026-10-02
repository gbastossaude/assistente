/**
 * Bootstrap (seguro para produção, idempotente): parâmetros padrão, modelos de checklist NEW/RENEW,
 * templates de mensagens, regras de automação, catálogo de operadoras, biblioteca (mensagens prontas e
 * respostas rápidas) e o primeiro administrador
 * (ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME) quando não houver usuários. Não cria dados de clientes.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgConfig } from "../src/server/db/pg-config";
import { runResilient } from "./script-timeout";
import { CHECKLIST_CATALOG } from "../src/lib/domain/checklist-catalog";
import { DEFAULT_TEMPLATES } from "../src/lib/domain/messages";
import { PLAYBOOK_DEFAULTS } from "../src/lib/playbook/content";
import { LIBRARY_DEFAULTS } from "../src/lib/domain/library-content";
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

  // Uma inserção em lote por tabela (o banco pode estar em outra região: cada ida e volta conta no início do
  // servidor). onConflictDoNothing mantém a idempotência e não sobrescreve o que foi editado no sistema.
  await db
    .insert(schema.settings)
    .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();

  const checklistRows: (typeof schema.checklistTemplates.$inferInsert)[] = [];
  let order = 0;
  for (const item of CHECKLIST_CATALOG) {
    order += 10;
    for (const processType of ["NEW", "RENEW"] as const) {
      if (processType === "NEW" && item.inNew === false) continue;
      if (processType === "RENEW" && item.inRenew === false) continue;
      checklistRows.push({
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
      });
    }
  }
  await db.insert(schema.checklistTemplates).values(checklistRows).onConflictDoNothing();

  await db
    .insert(schema.messageTemplates)
    .values(DEFAULT_TEMPLATES.map((t) => ({ key: t.key, name: t.name, audience: t.audience, channel: t.channel, tone: t.tone ?? null, subject: t.subject ?? null, body: t.body })))
    .onConflictDoNothing();

  await db
    .insert(schema.automationRules)
    .values(AUTOMATION_RULES.map((r) => ({ key: r.key, name: r.name, description: r.description, params: r.params })))
    .onConflictDoNothing();

  await db.insert(schema.insurers).values(INSURERS).onConflictDoNothing();

  // Playbook Estratégico (conteúdo padrão; não sobrescreve edições feitas no sistema)
  await db.insert(schema.playbookEntries).values(PLAYBOOK_DEFAULTS).onConflictDoNothing();

  // Biblioteca: mensagens prontas e respostas rápidas (não sobrescreve edições feitas no sistema)
  await db
    .insert(schema.libraryItems)
    .values(
      LIBRARY_DEFAULTS.map((item, i) => ({ sourceKey: item.sourceKey, kind: item.kind, category: item.category, title: item.title, channel: item.channel, subject: item.subject ?? null, body: item.body, sortOrder: (i + 1) * 10 })),
    )
    .onConflictDoNothing();

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
  void runResilient("Bootstrap", () => bootstrap());
}
