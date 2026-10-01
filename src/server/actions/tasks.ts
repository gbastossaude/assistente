"use server";
import { z } from "zod";
import { TASK_STATUSES } from "@/lib/domain/constants";
import { completeTaskSchema, taskSchema } from "@/lib/validation/schemas";
import { parseInput, runAction } from "../action-utils";
import { completeTask, createTask, setTaskStatus, softDeleteTask, toggleTaskChecklistItem, updateTask } from "../services/tasks";

export async function saveTaskAction(id: string | null, input: unknown) {
  return runAction("task:write", async (u) => {
    const data = parseInput(taskSchema, input);
    if (id) await updateTask(id, data, u);
    else await createTask(data, u);
  }, { message: id ? "Tarefa atualizada" : "Tarefa criada" });
}
export async function completeTaskAction(input: unknown) {
  return runAction("task:write", (u) => completeTask(parseInput(completeTaskSchema, input), u), { message: "Tarefa concluída" });
}
export async function setTaskStatusAction(id: string, status: unknown) {
  return runAction("task:write", (u) => setTaskStatus(id, parseInput(z.enum(TASK_STATUSES), status), u), { message: "Status atualizado" });
}
export async function toggleTaskChecklistAction(id: string, index: number) {
  return runAction("task:write", (u) => toggleTaskChecklistItem(id, index, u), {});
}
export async function deleteTaskAction(id: string) {
  return runAction("task:write", (u) => softDeleteTask(id, u), { message: "Tarefa excluída" });
}
