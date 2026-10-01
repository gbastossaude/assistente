"use server";
import { runAction } from "../action-utils";
import { markRead } from "../services/notifications";

export async function markNotificationReadAction(id?: string) {
  return runAction("read", async (u) => markRead(u.id, id), { revalidate: [] });
}
