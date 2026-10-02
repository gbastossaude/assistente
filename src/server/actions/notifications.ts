"use server";
import { runAction } from "../action-utils";
import { dismissNotifications, markRead } from "../services/notifications";

export async function markNotificationReadAction(id?: string) {
  return runAction("read", async (u) => markRead(u.id, id), { revalidate: [] });
}

/** Exclui uma notificação (id) ou todas as do usuário. Cada usuário só mexe nas próprias. */
export async function dismissNotificationAction(id?: string) {
  return runAction("read", async (u) => dismissNotifications(u.id, id), { revalidate: [] });
}
