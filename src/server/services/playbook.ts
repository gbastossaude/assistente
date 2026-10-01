import "server-only";
import { asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { PLAYBOOK_DEFAULTS, type PlaybookKind } from "@/lib/playbook/content";
import { searchPlaybook } from "@/lib/playbook/search";
import type { playbookEntrySchema } from "@/lib/validation/schemas";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db, type DbOrTx } from "../db";
import { playbookEntries } from "../db/schema";
import { NotFoundError } from "../errors";

export interface PlaybookEntry {
  id: string | null;
  section: string;
  key: string;
  title: string;
  subtitle: string | null;
  objective: string | null;
  kind: PlaybookKind;
  body: string;
  sortOrder: number;
  active: boolean;
  updatedAt: Date | null;
}

/** Conteúdo do Playbook. Antes do bootstrap (tabela vazia) usa o conteúdo padrão embutido. */
export async function listPlaybook(opts: { includeInactive?: boolean } = {}): Promise<PlaybookEntry[]> {
  const rows = await db.select().from(playbookEntries).orderBy(asc(playbookEntries.section), asc(playbookEntries.sortOrder));
  if (!rows.length) return PLAYBOOK_DEFAULTS.map((d) => ({ ...d, id: null, active: true, updatedAt: null }));
  return rows
    .filter((r) => opts.includeInactive || r.active)
    .map((r) => ({
      id: r.id,
      section: r.section,
      key: r.key,
      title: r.title,
      subtitle: r.subtitle,
      objective: r.objective,
      kind: (r.kind === "roteiro" ? "roteiro" : "texto") as PlaybookKind,
      body: r.body,
      sortOrder: r.sortOrder,
      active: r.active,
      updatedAt: r.updatedAt,
    }));
}

export async function findPlaybook(query: string, limit = 4) {
  return searchPlaybook(await listPlaybook(), query, limit);
}

/** Grava o conteúdo padrão (idempotente: não sobrescreve edições). */
export async function seedPlaybook(tx: DbOrTx = db) {
  for (const d of PLAYBOOK_DEFAULTS) {
    await tx.insert(playbookEntries).values(d).onConflictDoNothing();
  }
}

export async function updatePlaybookEntry(input: z.output<typeof playbookEntrySchema>, user: CurrentUser) {
  const [e] = await db
    .update(playbookEntries)
    .set({ title: input.title, subtitle: input.subtitle, objective: input.objective, body: input.body, active: input.active, updatedBy: user.id })
    .where(eq(playbookEntries.id, input.id))
    .returning();
  if (!e) throw new NotFoundError("Item do playbook");
  await audit({ userId: user.id, action: "settings_change", entityType: "playbook_entry", entityId: e.id, summary: `Playbook atualizado: ${e.title}` });
}

/** Restaura o texto original (site Be Smart) de um item editado. */
export async function restorePlaybookEntry(id: string, user: CurrentUser) {
  const [e] = await db.select().from(playbookEntries).where(eq(playbookEntries.id, id));
  if (!e) throw new NotFoundError("Item do playbook");
  const def = PLAYBOOK_DEFAULTS.find((d) => d.section === e.section && d.key === e.key);
  if (!def) throw new NotFoundError("Conteúdo original");
  await db
    .update(playbookEntries)
    .set({ title: def.title, subtitle: def.subtitle, objective: def.objective, body: def.body, kind: def.kind, active: true, updatedBy: user.id })
    .where(eq(playbookEntries.id, id));
  await audit({ userId: user.id, action: "settings_change", entityType: "playbook_entry", entityId: id, summary: `Playbook restaurado ao original: ${def.title}` });
}
