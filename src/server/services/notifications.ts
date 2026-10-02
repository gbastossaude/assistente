import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../db";
import { notifications } from "../db/schema";

/** Cria notificação; `dedupeKey` evita alertas repetidos para o mesmo fato. */
export async function notify(
  n: { userId: string; kind: string; title: string; body?: string | null; link?: string | null; dedupeKey?: string | null },
  tx: DbOrTx = db,
) {
  await tx
    .insert(notifications)
    .values({ userId: n.userId, kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, dedupeKey: n.dedupeKey ?? null })
    .onConflictDoNothing();
}

const visible = (userId: string) => and(eq(notifications.userId, userId), isNull(notifications.dismissedAt));

export async function listNotifications(userId: string, limit = 30) {
  return db.select().from(notifications).where(visible(userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(visible(userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function markRead(userId: string, id?: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), id ? eq(notifications.id, id) : undefined));
}

/**
 * Exclui da lista do usuário (uma ou todas). A linha é mantida como "dispensada" para o dedupeKey impedir que a
 * rotina horária recrie o mesmo alerta; a limpeza periódica (retenção LGPD) apaga as antigas de vez.
 */
export async function dismissNotifications(userId: string, id?: string) {
  const now = new Date();
  await db
    .update(notifications)
    .set({ dismissedAt: now, readAt: sql`coalesce(${notifications.readAt}, ${now})` })
    .where(and(visible(userId), id ? eq(notifications.id, id) : undefined));
}
