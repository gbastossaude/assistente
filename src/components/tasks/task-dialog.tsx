"use client";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { PRIORITIES, PRIORITY_LABELS, RECURRENCES, RECURRENCE_LABELS, TASK_CATEGORIES, TASK_CATEGORY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/domain/constants";
import { todayISO } from "@/lib/domain/dates";
import { saveTaskAction } from "@/server/actions/tasks";
import { UploadZone } from "@/components/documents/documents-panel";

export interface TaskFormValue {
  id?: string;
  title: string;
  description: string;
  companyId: string;
  quotationId: string;
  insurerId: string;
  opportunityId: string;
  meetingId: string;
  campaignId: string;
  ownerId: string;
  priority: string;
  scheduledDate: string;
  scheduledTime: string;
  dueDate: string;
  status: string;
  category: string;
  checklist: { text: string; done: boolean }[];
  notes: string;
  recurrence: string;
  recurrenceUntil: string;
  reminderAt: string;
}

export interface TaskOptions {
  users: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  quotations: { id: string; label: string; companyId: string }[];
  insurers: { id: string; name: string }[];
}

export function blankTask(over: Partial<TaskFormValue> = {}): TaskFormValue {
  return {
    title: "",
    description: "",
    companyId: "",
    quotationId: "",
    insurerId: "",
    opportunityId: "",
    meetingId: "",
    campaignId: "",
    ownerId: "",
    priority: "media",
    scheduledDate: "",
    scheduledTime: "",
    dueDate: todayISO(),
    status: "a_fazer",
    category: "follow_up",
    checklist: [],
    notes: "",
    recurrence: "nenhuma",
    recurrenceUntil: "",
    reminderAt: "",
    ...over,
  };
}

export function TaskDialog({ open, onOpenChange, value, options }: { open: boolean; onOpenChange: (o: boolean) => void; value: TaskFormValue | null; options: TaskOptions }) {
  const { run, pending, fieldErrors } = useAction();
  const [v, setV] = useState<TaskFormValue>(value ?? blankTask());
  const [item, setItem] = useState("");
  // Reinicia só ao abrir: dados que chegam com o diálogo aberto não apagam o que o usuário digitou.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setV(value ?? blankTask());
    wasOpen.current = open;
  }, [open, value]);
  const set = <K extends keyof TaskFormValue>(k: K, val: TaskFormValue[K]) => setV((s) => ({ ...s, [k]: val }));
  const qs = v.companyId ? options.quotations.filter((q) => q.companyId === v.companyId) : options.quotations;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={v.id ? "Editar tarefa" : "Nova tarefa"} size="lg">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Título" required error={fieldErrors.title} className="md:col-span-3">
            <Input value={v.title} onChange={(e) => set("title", e.target.value)} autoFocus />
          </Field>
          <Field label="Empresa">
            <Select value={v.companyId} onChange={(e) => setV((s) => ({ ...s, companyId: e.target.value, quotationId: "" }))}>
              <option value="">—</option>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cotação">
            <Select
              value={v.quotationId}
              onChange={(e) => {
                const q = options.quotations.find((x) => x.id === e.target.value);
                setV((s) => ({ ...s, quotationId: e.target.value, companyId: q?.companyId ?? s.companyId }));
              }}
            >
              <option value="">—</option>
              {qs.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Operadora">
            <Select value={v.insurerId} onChange={(e) => set("insurerId", e.target.value)}>
              <option value="">—</option>
              {options.insurers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={v.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              <option value="">(eu)</option>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={v.priority} onChange={(e) => set("priority", e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria">
            <Select value={v.category} onChange={(e) => set("category", e.target.value)}>
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {TASK_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data" error={fieldErrors.scheduledDate}>
            <Input type="date" value={v.scheduledDate} onChange={(e) => set("scheduledDate", e.target.value)} />
          </Field>
          <Field label="Hora" error={fieldErrors.scheduledTime}>
            <Input type="time" value={v.scheduledTime} onChange={(e) => set("scheduledTime", e.target.value)} />
          </Field>
          <Field label="Prazo" error={fieldErrors.dueDate}>
            <Input type="date" value={v.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={v.status} onChange={(e) => set("status", e.target.value)}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Recorrência" error={fieldErrors.recurrence}>
            <Select value={v.recurrence} onChange={(e) => set("recurrence", e.target.value)}>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {RECURRENCE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          {v.recurrence !== "nenhuma" ? (
            <Field label="Repetir até">
              <Input type="date" value={v.recurrenceUntil} onChange={(e) => set("recurrenceUntil", e.target.value)} />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Lembrete" error={fieldErrors.reminderAt} hint="Notificação no sistema">
            <Input type="datetime-local" value={v.reminderAt} onChange={(e) => set("reminderAt", e.target.value)} />
          </Field>
          <Field label="Descrição" className="md:col-span-3">
            <Textarea value={v.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </Field>
          <div className="md:col-span-3">
            <p className="mb-1 text-xs font-medium text-muted">Checklist interno</p>
            <ul className="space-y-1">
              {v.checklist.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.done} onChange={(e) => set("checklist", v.checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
                  <span className={c.done ? "text-muted line-through" : ""}>{c.text}</span>
                  <button type="button" className="ml-auto text-muted hover:text-red-600" onClick={() => set("checklist", v.checklist.filter((_, j) => j !== i))} aria-label="Remover item">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-1 flex gap-2">
              <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Novo item" onKeyDown={(e) => {
                if (e.key === "Enter" && item.trim()) {
                  e.preventDefault();
                  set("checklist", [...v.checklist, { text: item.trim(), done: false }]);
                  setItem("");
                }
              }} />
              <Button type="button" variant="outline" onClick={() => item.trim() && (set("checklist", [...v.checklist, { text: item.trim(), done: false }]), setItem(""))}>
                <Plus />
              </Button>
            </div>
          </div>
          <Field label="Observações" className="md:col-span-3">
            <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>
          {v.id && (
            <div className="md:col-span-3">
              <p className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                Anexos
                <a className="text-primary hover:underline" href={`/documentos?tarefa=${v.id}`}>
                  Ver anexos desta tarefa
                </a>
              </p>
              <UploadZone compact taskId={v.id} quotationId={v.quotationId || null} companyId={v.companyId || null} maxMb={25} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={async () => {
              const { id, ...rest } = v;
              const reminderAt = rest.reminderAt ? new Date(rest.reminderAt).toISOString() : "";
              const r = await run(() => saveTaskAction(id ?? null, { ...rest, reminderAt }));
              if (r.ok) onOpenChange(false);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
