"use client";
import { CalendarClock, CheckCircle2, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/inputs";
import { EmptyState } from "@/components/ui/misc";
import { PriorityBadge, TaskStatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/use-action";
import { TASK_CATEGORY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, type Priority, type TaskCategory, type TaskStatus } from "@/lib/domain/constants";
import { addDays, formatDateBR, relativeDays, todayISO } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import { completeTaskAction, deleteTaskAction, setTaskStatusAction, toggleTaskChecklistAction } from "@/server/actions/tasks";
import { blankTask, TaskDialog, type TaskFormValue, type TaskOptions } from "./task-dialog";

export interface TaskView {
  id: string;
  title: string;
  description: string | null;
  companyId: string | null;
  quotationId: string | null;
  insurerId: string | null;
  ownerId: string | null;
  priority: Priority;
  scheduledDate: string | null;
  scheduledTime: string | null;
  dueDate: string | null;
  status: TaskStatus;
  category: string;
  checklist: { text: string; done: boolean }[];
  notes: string | null;
  recurrence: string;
  recurrenceUntil: string | null;
  reminderAt: Date | null;
  source: string;
  companyName: string | null;
  quotationCode: string | null;
  insurerName: string | null;
  ownerName: string | null;
}

function toForm(t: TaskView): TaskFormValue {
  const pad = (n: number) => String(n).padStart(2, "0");
  const r = t.reminderAt ? new Date(t.reminderAt) : null;
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    companyId: t.companyId ?? "",
    quotationId: t.quotationId ?? "",
    insurerId: t.insurerId ?? "",
    ownerId: t.ownerId ?? "",
    priority: t.priority,
    scheduledDate: t.scheduledDate ?? "",
    scheduledTime: t.scheduledTime?.slice(0, 5) ?? "",
    dueDate: t.dueDate ?? "",
    status: t.status,
    category: t.category,
    checklist: t.checklist,
    notes: t.notes ?? "",
    recurrence: t.recurrence,
    recurrenceUntil: t.recurrenceUntil ?? "",
    reminderAt: r ? `${r.getFullYear()}-${pad(r.getMonth() + 1)}-${pad(r.getDate())}T${pad(r.getHours())}:${pad(r.getMinutes())}` : "",
  };
}

export function TaskList({ tasks, options, canWrite, defaults, openId, autoNew, showContext = true }: { tasks: TaskView[]; options: TaskOptions; canWrite: boolean; defaults?: Partial<TaskFormValue>; openId?: string | null; autoNew?: boolean; showContext?: boolean }) {
  const { run, pending } = useAction();
  const today = todayISO();
  const [dialog, setDialog] = useState<TaskFormValue | null>(null);
  const [complete, setComplete] = useState<{ task: TaskView; nextAction: string; nextActionDate: string; nextActionOwnerId: string } | null>(null);
  useEffect(() => {
    if (autoNew && canWrite) setDialog(blankTask(defaults));
    else if (openId) {
      const t = tasks.find((x) => x.id === openId);
      if (t) setDialog(toForm(t));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, autoNew]);

  return (
    <div className="space-y-2">
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialog(blankTask(defaults))}>
            <Plus /> Nova tarefa
          </Button>
        </div>
      )}
      {tasks.length === 0 && <EmptyState title="Nenhuma tarefa" description="Nada pendente neste filtro." />}
      <ul className="space-y-2">
        {tasks.map((t) => {
          const date = t.dueDate ?? t.scheduledDate;
          const overdue = !!t.dueDate && t.dueDate < today && !["concluida", "cancelada"].includes(t.status);
          const done = t.status === "concluida" || t.status === "cancelada";
          return (
            <li key={t.id} className={cn("rounded-lg border bg-surface px-3 py-2.5", overdue ? "border-red-300" : "border-border", done && "opacity-70")}>
              <div className="flex flex-wrap items-start gap-3">
                {canWrite && !done && (
                  <button
                    type="button"
                    title="Concluir"
                    aria-label={`Concluir ${t.title}`}
                    className="mt-0.5 text-muted hover:text-emerald-600"
                    onClick={() => setComplete({ task: t, nextAction: "", nextActionDate: addDays(today, 2), nextActionOwnerId: t.ownerId ?? "" })}
                  >
                    <CheckCircle2 className="size-5" />
                  </button>
                )}
                <div className="min-w-48 flex-1">
                  <p className={cn("text-sm font-medium", t.status === "concluida" && "line-through")}>{t.title}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    {date && (
                      <span className={cn("flex items-center gap-0.5", overdue && "font-medium text-red-600")}>
                        <CalendarClock className="size-3" /> {formatDateBR(date)}
                        {t.scheduledTime ? ` ${t.scheduledTime.slice(0, 5)}` : ""} ({relativeDays(date, today)})
                      </span>
                    )}
                    {showContext && t.companyName && <span>{t.companyName}</span>}
                    {showContext && t.quotationCode && (
                      <a className="text-primary hover:underline" href={`/cotacoes/${t.quotationId}`}>
                        {t.quotationCode}
                      </a>
                    )}
                    {t.insurerName && <span>· {t.insurerName}</span>}
                    <span>· {TASK_CATEGORY_LABELS[t.category as TaskCategory] ?? t.category}</span>
                    {t.ownerName && <span>· {t.ownerName}</span>}
                    {t.recurrence !== "nenhuma" && <Repeat className="size-3" aria-label="Recorrente" />}
                    {t.source === "automacao" && <Badge tone="slate">automática</Badge>}
                  </p>
                  {t.checklist.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {t.checklist.map((c, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-xs">
                          <input type="checkbox" checked={c.done} disabled={!canWrite} onChange={() => run(() => toggleTaskChecklistAction(t.id, i), { success: false })} />
                          <span className={c.done ? "text-muted line-through" : ""}>{c.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <PriorityBadge value={t.priority} />
                  {canWrite ? (
                    <Select className="h-7 w-40 text-xs" value={t.status} onChange={(e) => run(() => setTaskStatusAction(t.id, e.target.value))} aria-label="Status">
                      {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {TASK_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <TaskStatusBadge value={t.status} />
                  )}
                  {canWrite && (
                    <>
                      <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setDialog(toForm(t))}>
                        <Pencil />
                      </Button>
                      <ConfirmButton title="Excluir tarefa?" onConfirm={() => run(() => deleteTaskAction(t.id))} size="icon-sm">
                        <Trash2 />
                      </ConfirmButton>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <TaskDialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)} value={dialog} options={options} />
      <Dialog open={!!complete} onOpenChange={(o) => !o && setComplete(null)}>
        <DialogContent title="Concluir tarefa" description={complete?.task.title}>
          {complete && (
            <div className="space-y-3">
              <p className="text-sm text-muted">Qual a próxima ação? (opcional — cria uma nova tarefa vinculada)</p>
              <Field label="Próxima ação">
                <Input value={complete.nextAction} onChange={(e) => setComplete({ ...complete, nextAction: e.target.value })} placeholder="Ex.: Enviar comparativo ao cliente" autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data">
                  <Input type="date" value={complete.nextActionDate} onChange={(e) => setComplete({ ...complete, nextActionDate: e.target.value })} />
                </Field>
                <Field label="Responsável">
                  <Select value={complete.nextActionOwnerId} onChange={(e) => setComplete({ ...complete, nextActionOwnerId: e.target.value })}>
                    <option value="">(mesmo)</option>
                    {options.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {complete.task.recurrence !== "nenhuma" && (
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Repeat className="size-3" /> A próxima ocorrência da tarefa recorrente será criada automaticamente.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="success"
              loading={pending}
              onClick={async () => {
                if (!complete) return;
                const r = await run(() =>
                  completeTaskAction({ id: complete.task.id, nextAction: complete.nextAction, nextActionDate: complete.nextAction ? complete.nextActionDate : null, nextActionOwnerId: complete.nextActionOwnerId }),
                );
                if (r.ok) setComplete(null);
              }}
            >
              <CheckCircle2 /> Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

