"use server";
import { z } from "zod";
import { parseInput, runAction } from "../action-utils";
import { deleteInteraction } from "../services/interactions";

/** Exclui uma atividade da linha do tempo (permissão conferida no serviço: autor ou quem pode excluir). */
export async function deleteInteractionAction(id: string) {
  return runAction("read", (u) => deleteInteraction(parseInput(z.string().uuid(), id), u), { message: "Atividade excluída" });
}
