"use server";
import { z } from "zod";
import { parseInput, runAction } from "../action-utils";
import { askAssistant, clearConversation, decideAction } from "../assistant";

export async function askAssistantAction(text: string) {
  return runAction("assistant:use", (u) => askAssistant(parseInput(z.string().min(1).max(2000), text), u), { revalidate: ["/assistente"] });
}
export async function decideAssistantAction(id: string, confirm: boolean) {
  return runAction("assistant:act", (u) => decideAction(parseInput(z.string().uuid(), id), confirm, u), { message: confirm ? "Ação executada" : "Ação recusada" });
}
export async function clearAssistantAction() {
  return runAction("assistant:use", (u) => clearConversation(u.id), { message: "Conversa limpa", revalidate: ["/assistente"] });
}
