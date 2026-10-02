"use client";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { EVENT_STATUSES, EVENT_STATUS_LABELS, EVENT_TYPES, EVENT_TYPE_LABELS, REMINDER_OPTIONS, type EventType } from "@/lib/domain/constants";
import { addDays, todayISO } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import { deleteEventAction, saveEventAction } from "@/server/actions/calendar";
import type { TaskOptions } from "@/components/tasks/task-dialog";

export interface AgendaItem {
  id: string;
  kind: "evento" | "tarefa";
  title: string;
  type: string;
  date: string; // YYYY-MM-DD local
  time: string | null; // HH:MM local
  endTime: string | null;
  allDay: boolean;
  href: string | null;
  context: string | null;
  status?: string;
  /** Compromisso gerado por uma ficha de reunião: abre a ficha em vez do diálogo. */
  meetingId?: string | null;
  raw?: {
    location: string | null;
    description: string | null;
    companyId: string | null;
    quotationId: string | null;
    insurerId: string | null;
    taskId: string | null;
    ownerId: string | null;
    opportunityId: string | null;
    status: string;
    clientName: string | null;
    advisorName: string | null;
    salesRepName: string | null;
    reminderMinutes: number;
  };
}

const TYPE_COLOR: Record<string, string> = {
  reuniao_cliente: "border-l-blue-500",
  reuniao_operadora: "border-l-indigo-500",
  ligacao: "border-l-cyan-500",
  follow_up: "border-l-amber-500",
  envio_cotacao: "border-l-sky-500",
  retorno_operadora: "border-l-purple-500",
  pos_venda: "border-l-lime-500",
  campanha: "border-l-pink-500",
  apresentacao: "border-l-violet-500",
  renovacao: "border-l-red-500",
  prazo_proposta: "border-l-fuchsia-500",
  implantacao: "border-l-teal-500",
  tarefa_interna: "border-l-slate-500",
  outro: "border-l-zinc-400",
  tarefa: "border-l-emerald-500",
};
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function weekday(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

type EditState = {
  id?: string;
  title: string;
  type: EventType;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  description: string;
  companyId: string;
  quotationId: string;
  insurerId: string;
  ownerId: string;
  opportunityId: string;
  status: string;
  clientName: string;
  advisorName: string;
  salesRepName: string;
  reminderMinutes: number;
};

export function CalendarView({ view, anchor, from, days, items, options, canWrite }: { view: "dia" | "semana" | "mes"; anchor: string; from: string; days: number; items: AgendaItem[]; options: TaskOptions; canWrite: boolean }) {
  const { run, pending, fieldErrors } = useAction();
  const [edit, setEdit] = useState<EditState | null>(null);
  const today = todayISO();
  const step = view === "dia" ? 1 : view === "semana" ? 7 : 30;
  const nav = (d: string) => `/agenda?view=${view}&data=${d}`;
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  // Compromissos antes de tarefas; dentro de cada grupo, dia inteiro primeiro e depois por horário.
  const rank = (i: AgendaItem) => (i.kind === "evento" ? 0 : 2) + (i.allDay ? 0 : 1);
  const byDate = (d: string) => items.filter((i) => i.date === d).sort((a, b) => rank(a) - rank(b) || (a.time ?? "").localeCompare(b.time ?? ""));
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${anchor}T12:00:00Z`));
  const newAt = (date: string) =>
    setEdit({ title: "", type: "reuniao_cliente", date, startTime: "09:00", endTime: "10:00", allDay: false, location: "", description: "", companyId: "", quotationId: "", insurerId: "", ownerId: "", opportunityId: "", status: "agendado", clientName: "", advisorName: "", salesRepName: "", reminderMinutes: 30 });

  const ItemChip = ({ it, compact }: { it: AgendaItem; compact?: boolean }) => (
    <button
      type="button"
      onClick={() => {
        if (it.meetingId) window.location.href = `/reunioes/${it.meetingId}`;
        else if (it.kind === "evento" && canWrite && it.raw) {
          const r = it.raw;
          setEdit({
            id: it.id,
            title: it.title,
            type: it.type as EventType,
            date: it.date,
            startTime: it.time ?? "09:00",
            endTime: it.endTime ?? "",
            allDay: it.allDay,
            location: r.location ?? "",
            description: r.description ?? "",
            companyId: r.companyId ?? "",
            quotationId: r.quotationId ?? "",
            insurerId: r.insurerId ?? "",
            ownerId: r.ownerId ?? "",
            opportunityId: r.opportunityId ?? "",
            status: r.status,
            clientName: r.clientName ?? "",
            advisorName: r.advisorName ?? "",
            salesRepName: r.salesRepName ?? "",
            reminderMinutes: r.reminderMinutes,
          });
        } else if (it.href) window.location.href = it.href;
      }}
      className={cn(
        "w-full truncate rounded border border-l-4 border-border bg-surface px-1.5 py-0.5 text-left text-[11px] hover:bg-surface-2",
        TYPE_COLOR[it.kind === "tarefa" ? "tarefa" : it.type],
        it.status === "cancelado" && "line-through opacity-60",
        it.status === "realizado" && "opacity-75",
      )}
      title={`${it.title}${it.context ? ` — ${it.context}` : ""}${it.status && it.status !== "agendado" ? ` (${EVENT_STATUS_LABELS[it.status as keyof typeof EVENT_STATUS_LABELS]})` : ""}`}
    >
      {!it.allDay && it.time && <span className="mr-1 tabular-nums text-muted">{it.time}</span>}
      {it.kind === "tarefa" && "☐ "}
      {it.title}
      {!compact && it.context && <span className="block truncate text-muted">{it.context}</span>}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon-sm">
            <Link href={nav(addDays(anchor, -step))} aria-label="Anterior">
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={nav(today)}>Hoje</Link>
          </Button>
          <Button asChild variant="outline" size="icon-sm">
            <Link href={nav(addDays(anchor, step))} aria-label="Próximo">
              <ChevronRight />
            </Link>
          </Button>
          <span className="ml-2 text-sm font-semibold first-letter:uppercase">{view === "dia" ? anchor.split("-").reverse().join("/") : monthLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-surface p-0.5 text-xs">
            {(["dia", "semana", "mes"] as const).map((v) => (
              <Link key={v} href={`/agenda?view=${v}&data=${anchor}`} className={cn("rounded px-3 py-1", view === v ? "bg-primary text-white" : "text-muted")}>
                {v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}
              </Link>
            ))}
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => newAt(view === "dia" ? anchor : today)}>
              <Plus /> Compromisso
            </Button>
          )}
        </div>
      </div>

      {view === "mes" ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="grid grid-cols-7 border-b border-border bg-surface-2/60 text-center text-xs text-muted">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1.5">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dates.map((d) => {
              const list = byDate(d);
              const outside = d.slice(5, 7) !== anchor.slice(5, 7);
              return (
                <div key={d} className={cn("min-h-28 border-b border-r border-border p-1", outside && "bg-surface-2/40")}>
                  <div className="mb-1 flex items-center justify-between">
                    <Link href={`/agenda?view=dia&data=${d}`} className={cn("rounded px-1 text-xs", d === today ? "bg-primary font-semibold text-white" : outside ? "text-muted" : "")}>
                      {Number(d.slice(8))}
                    </Link>
                    {canWrite && (
                      <button type="button" className="text-muted opacity-0 hover:opacity-100 focus:opacity-100" onClick={() => newAt(d)} aria-label={`Novo compromisso em ${d}`}>
                        <Plus className="size-3" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {list.slice(0, 4).map((it) => (
                      <ItemChip key={`${it.kind}-${it.id}`} it={it} compact />
                    ))}
                    {list.length > 4 && (
                      <Link href={`/agenda?view=dia&data=${d}`} className="block px-1 text-[10px] text-muted hover:underline">
                        +{list.length - 4} mais
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={cn("grid gap-2", view === "semana" ? "grid-cols-1 md:grid-cols-7" : "grid-cols-1")}>
          {dates.map((d) => (
            <div key={d} className={cn("min-h-40 rounded-lg border bg-surface p-2", d === today ? "border-primary" : "border-border")}>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className={cn("font-medium", d === today && "text-primary")}>
                  {WEEKDAYS[weekday(d)]} {d.split("-").reverse().slice(0, 2).join("/")}
                </span>
                {canWrite && (
                  <button type="button" className="text-muted hover:text-foreground" onClick={() => newAt(d)} aria-label="Novo compromisso">
                    <Plus className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {byDate(d).map((it) => (
                  <ItemChip key={`${it.kind}-${it.id}`} it={it} />
                ))}
                {byDate(d).length === 0 && <p className="py-4 text-center text-[11px] text-muted">Livre</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">Inclui compromissos e tarefas com data. Integração com Google Calendar via OAuth está prevista (ver docs) — a agenda funciona integralmente sem ela.</p>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? "Editar compromisso" : "Novo compromisso"} size="lg">
          {edit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Título" required error={fieldErrors.title} className="sm:col-span-2">
                <Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              </Field>
              <Field label="Tipo">
                <Select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as EventType })}>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EVENT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Cliente">
                <Input value={edit.clientName} onChange={(e) => setEdit({ ...edit, clientName: e.target.value })} placeholder="Nome do cliente" />
              </Field>
              <Field label="Assessor">
                <Input value={edit.advisorName} onChange={(e) => setEdit({ ...edit, advisorName: e.target.value })} />
              </Field>
              <Field label="Comercial">
                <Input value={edit.salesRepName} onChange={(e) => setEdit({ ...edit, salesRepName: e.target.value })} />
              </Field>
              <Field label="Status">
                <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  {EVENT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {EVENT_STATUS_LABELS[st]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Lembrete">
                <Select value={String(edit.reminderMinutes)} onChange={(e) => setEdit({ ...edit, reminderMinutes: Number(e.target.value) })}>
                  {REMINDER_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data" required error={fieldErrors.date}>
                <Input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
              </Field>
              {!edit.allDay && (
                <>
                  <Field label="Início" error={fieldErrors.startTime}>
                    <Input type="time" value={edit.startTime} onChange={(e) => setEdit({ ...edit, startTime: e.target.value })} />
                  </Field>
                  <Field label="Término" error={fieldErrors.endTime}>
                    <Input type="time" value={edit.endTime} onChange={(e) => setEdit({ ...edit, endTime: e.target.value })} />
                  </Field>
                </>
              )}
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input type="checkbox" checked={edit.allDay} onChange={(e) => setEdit({ ...edit, allDay: e.target.checked })} /> Dia inteiro
              </label>
              <Field label="Empresa">
                <Select value={edit.companyId} onChange={(e) => setEdit({ ...edit, companyId: e.target.value })}>
                  <option value="">—</option>
                  {options.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Cotação">
                <Select value={edit.quotationId} onChange={(e) => setEdit({ ...edit, quotationId: e.target.value })}>
                  <option value="">—</option>
                  {options.quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Operadora">
                <Select value={edit.insurerId} onChange={(e) => setEdit({ ...edit, insurerId: e.target.value })}>
                  <option value="">—</option>
                  {options.insurers.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Responsável">
                <Select value={edit.ownerId} onChange={(e) => setEdit({ ...edit, ownerId: e.target.value })}>
                  <option value="">(eu)</option>
                  {options.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Local ou link da reunião" className="sm:col-span-2">
                <Input value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} />
              </Field>
              <Field label="Observações" className="sm:col-span-3">
                <Textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={2} />
              </Field>
            </div>
          )}
          <DialogFooter>
            {edit?.id && (
              <ConfirmButton title="Excluir compromisso?" triggerVariant="ghost" size="sm" onConfirm={async () => { const r = await run(() => deleteEventAction(edit.id!)); if (r.ok) setEdit(null); }}>
                <Trash2 /> Excluir
              </ConfirmButton>
            )}
            <Button
              loading={pending}
              onClick={async () => {
                if (!edit) return;
                const { id, ...rest } = edit;
                const r = await run(() => saveEventAction(id ?? null, rest));
                if (r.ok) setEdit(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
