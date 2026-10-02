import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import type { LibraryKind } from "@/lib/domain/commercial";
import { normalizeSearch } from "@/lib/domain/library";
import { LIBRARY_DEFAULTS } from "@/lib/domain/library-content";
import type { libraryItemSchema } from "@/lib/validation/schemas";
import { audit, diff } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { libraryItems } from "../db/schema";
import { BusinessError, NotFoundError } from "../errors";

type ItemData = z.output<typeof libraryItemSchema>;

export async function listLibrary(kind: LibraryKind, f: { q?: string | null; category?: string | null; includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(libraryItems)
    .where(and(eq(libraryItems.kind, kind), isNull(libraryItems.deletedAt), f.category ? eq(libraryItems.category, f.category) : undefined, f.includeInactive ? undefined : eq(libraryItems.active, true)))
    .orderBy(asc(libraryItems.category), asc(libraryItems.sortOrder), asc(libraryItems.title));
  if (!f.q) return rows;
  const terms = normalizeSearch(f.q).split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    const hay = normalizeSearch(`${r.title} ${r.subject ?? ""} ${r.body}`);
    return terms.every((t) => hay.includes(t));
  });
}
export type LibraryRow = Awaited<ReturnType<typeof listLibrary>>[number];

export async function saveLibraryItem(id: string | null, input: ItemData, user: CurrentUser) {
  if (id) {
    const [cur] = await db.select().from(libraryItems).where(and(eq(libraryItems.id, id), isNull(libraryItems.deletedAt)));
    if (!cur) throw new NotFoundError("Item");
    if (cur.kind !== input.kind) throw new BusinessError("Tipo do item não pode ser alterado.");
    await db.update(libraryItems).set({ ...input, updatedBy: user.id }).where(eq(libraryItems.id, id));
    await audit({ userId: user.id, action: "update", entityType: "library_item", entityId: id, summary: `${input.kind === "mensagem" ? "Mensagem" : "Resposta"} editada: ${input.title}`, changes: diff(cur as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>) });
    return id;
  }
  const [r] = await db
    .insert(libraryItems)
    .values({ ...input, createdBy: user.id, updatedBy: user.id })
    .returning();
  await audit({ userId: user.id, action: "create", entityType: "library_item", entityId: r.id, summary: `${input.kind === "mensagem" ? "Mensagem" : "Resposta"} criada: ${input.title}` });
  return r.id;
}

export async function duplicateLibraryItem(id: string, user: CurrentUser) {
  const [cur] = await db.select().from(libraryItems).where(and(eq(libraryItems.id, id), isNull(libraryItems.deletedAt)));
  if (!cur) throw new NotFoundError("Item");
  const [r] = await db
    .insert(libraryItems)
    .values({ kind: cur.kind, category: cur.category, title: `${cur.title} (cópia)`, channel: cur.channel, subject: cur.subject, body: cur.body, sortOrder: cur.sortOrder + 1, createdBy: user.id, updatedBy: user.id })
    .returning();
  await audit({ userId: user.id, action: "create", entityType: "library_item", entityId: r.id, summary: `Item duplicado: ${cur.title}` });
  return r.id;
}

export async function deleteLibraryItem(id: string, user: CurrentUser) {
  const [r] = await db.update(libraryItems).set({ deletedAt: new Date(), updatedBy: user.id }).where(eq(libraryItems.id, id)).returning();
  if (!r) throw new NotFoundError("Item");
  await audit({ userId: user.id, action: "delete", entityType: "library_item", entityId: id, summary: `Item excluído da biblioteca: ${r.title}` });
}

/** Volta um item padrão ao texto original do sistema. */
export async function restoreLibraryDefault(id: string, user: CurrentUser) {
  const [cur] = await db.select().from(libraryItems).where(eq(libraryItems.id, id));
  const def = LIBRARY_DEFAULTS.find((d) => d.sourceKey === cur?.sourceKey);
  if (!cur || !def) throw new BusinessError("Este item não tem versão original.");
  await db.update(libraryItems).set({ title: def.title, body: def.body, subject: def.subject ?? null, channel: def.channel, category: def.category, active: true, deletedAt: null, updatedBy: user.id }).where(eq(libraryItems.id, id));
  await audit({ userId: user.id, action: "restore", entityType: "library_item", entityId: id, summary: `Item restaurado ao original: ${def.title}` });
}
