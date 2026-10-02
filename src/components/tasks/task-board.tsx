"use client";
import { CalendarClock, Pencil } from "lucide-react";
import { useState } from "react";
import { PriorityBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/use-action";
import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS, type TaskCategory, type TaskStatus } from "@/lib/domain/constants";
import { formatDateBR, relativeDays, todayISO } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import { setTaskStatusAction } from "@/server/actions/tasks";
import { TaskDialog, type TaskFormValue, type TaskOptions } from "./task-dialog";
import { toTaskForm, type TaskView } from "./task-list";

const COLUMNS: TaskStatus[] = ["a_fazer", "em_andamento", "aguardando_terceiro", "concluida"];

/** Kanban de tarefas: arraste entre colunas para mudar o status; atrasadas ficam em destaque. */
export function TaskBoard({ tasks, options, canWrite }: { tasks: TaskView[]; options: TaskOptions; canWrite: boolean }) {
  const { run } = useAction();
  const today = todayISO();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [edit, setEdit] = useState<TaskFormValue | null>(null);
  const overdue = (t: TaskView) => !!t.dueDate && t.dueDate < today && t.status !== "concluida" && t.status !== "cancelada";
  return (
    <>
      <p className="mb-2 text-xs text-muted">Arraste os cartões para mudar o status. Concluídas aparecem por 7 dias. Tarefas atrasadas ficam com borda vermelha.</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col);
          const late = items.filter(overdue).length;
          return (
            <section
              key={col}
              aria-label={TASK_STATUS_LABELS[col]}
              onDragOver={(e) => {
                if (!canWrite) return;
                e.preventDefault();
                setOver(col);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                const t = tasks.find((x) => x.id === id);
                if (t && t.status !== col) void run(() => setTaskStatusAction(id, col));
              }}
              className={cn("flex min-h-40 flex-col rounded-lg bg-surface-2/70 p-2", over === col && "ring-2 ring-primary")}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold">{TASK_STATUS_LABELS[col]}</span>
                <span className="flex items-center gap-1">
                  {late > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{late} atrasada(s)</span>}
                  <span className="rounded-full bg-surface px-1.5 text-[10px] font-semibold text-muted">{items.length}</span>
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {items.map((t) => {
                  const date = t.dueDate ?? t.scheduledDate;
                  return (
                    <div
                      key={t.id}
                      draggable={canWrite}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                      className={cn("rounded-md border bg-surface p-2.5 shadow-xs", overdue(t) ? "border-red-400" : "border-border", canWrite && "cursor-grab active:cursor-grabbing", t.status === "concluida" && "opacity-70")}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className={cn("text-sm font-medium leading-tight", t.status === "concluida" && "line-through")}>{t.title}</p>
                        {canWrite && (
                          <button type="button" className="text-muted hover:text-foreground" onClick={() => setEdit(toTaskForm(t))} aria-label={`Editar ${t.title}`}>
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted">
                        {TASK_CATEGORY_LABELS[t.category as TaskCategory] ?? t.category}
                        {t.companyName ? ` · ${t.companyName}` : ""}
                        {t.ownerName ? ` · ${t.ownerName}` : ""}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <PriorityBadge value={t.priority} />
                        {date && (
                          <span className={cn("flex items-center gap-0.5 text-[11px]", overdue(t) ? "font-medium text-red-600" : "text-muted")}>
                            <CalendarClock className="size-3" /> {formatDateBR(date)} ({relativeDays(date, today)})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <TaskDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} value={edit} options={options} />
    </>
  );
}
