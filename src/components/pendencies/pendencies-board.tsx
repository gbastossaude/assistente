"use client";
import { Bot, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState } from "@/components/ui/misc";
import { PriorityBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/use-action";
import { PENDENCY_CATEGORIES, PENDENCY_CATEGORY_LABELS, PENDENCY_STATUSES, PENDENCY_STATUS_LABELS, PRIORITIES, PRIORITY_LABELS, type PendencyCategory, type PendencyStatus, type Priority } from "@/lib/domain/constants";
import { formatDateBR, relativeDays, todayISO } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import { deletePendencyAction, savePendencyAction, setPendencyStatusAction } from "@/server/actions/pendencies";

export interface PendencyView {
  id: string;
  category: PendencyCategory;
  title: string;
  description: string | null;
  origin: string;
  companyId: string | null;
  quotationId: string | null;
  ownerId: string | null;
  dueDate: string | null;
  priority: Priority;
  status: PendencyStatus;
  nextAction: string | null;
  companyName: string | null;
  quotationCode: string | null;
  ownerName: string | null;
}

const ORIGIN: Record<string, string> = { manual: "Manual", checklist: "Checklist", especial: "Situação especial", documento: "Documento", base_vidas: "Base de vidas", operadora: "Operadora", automacao: "Automação" };

export function PendenciesBoard({ rows, users, quotations, canWrite, defaultQuotationId, initialCategory }: { rows: PendencyView[]; users: { id: string; name: string }[]; quotations: { id: string; label: string }[]; canWrite: boolean; defaultQuotationId?: string | null; initialCategory?: PendencyCategory | null }) {
  const { run, pending, fieldErrors } = useAction();
  const today = todayISO();
  const [cat, setCat] = useState<PendencyCategory | "todas">("todas");
  const [edit, setEdit] = useState<(Partial<PendencyView> & { id?: string }) | null>(null);
  useEffect(() => setCat(initialCategory ?? "todas"), [initialCategory]);
  const counts = Object.fromEntries(PENDENCY_CATEGORIES.map((c) => [c, rows.filter((r) => r.category === c).length]));
  const visible = rows.filter((r) => cat === "todas" || r.category === cat);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(["todas", ...PENDENCY_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn("rounded-full border px-3 py-1 text-xs", cat === c ? "border-primary bg-primary text-white" : "border-border bg-surface text-muted hover:bg-surface-2")}
            >
              {c === "todas" ? `Todas (${rows.length})` : `${PENDENCY_CATEGORY_LABELS[c]} (${counts[c]})`}
            </button>
          ))}
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setEdit({ category: "interna", priority: "media", status: "aberta", quotationId: defaultQuotationId ?? null })}>
            <Plus /> Nova pendência
          </Button>
        )}
      </div>
      {visible.length === 0 ? (
        <EmptyState title="Nenhuma pendência" description="Pendências automáticas surgem do checklist, documentos, base de vidas e operadoras." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">Pendência</th>
                <th className="px-3 py-2">Categoria / origem</th>
                <th className="px-3 py-2">Empresa / cotação</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Prazo</th>
                <th className="px-3 py-2">Prioridade</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const overdue = p.dueDate && p.dueDate < today && ["aberta", "em_andamento"].includes(p.status);
                return (
                  <tr key={p.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium">{p.title}</p>
                      {p.nextAction && <p className="text-xs text-primary">→ {p.nextAction}</p>}
                      {p.description && <p className="text-xs text-muted">{p.description}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Badge tone="slate">{PENDENCY_CATEGORY_LABELS[p.category]}</Badge>
                      <span className="mt-0.5 flex items-center gap-1 text-muted">
                        {p.origin !== "manual" && <Bot className="size-3" />}
                        {ORIGIN[p.origin] ?? p.origin}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {p.companyName ?? "—"}
                      {p.quotationId && (
                        <Link className="block text-primary hover:underline" href={`/cotacoes/${p.quotationId}?tab=checklist`}>
                          {p.quotationCode}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{p.ownerName ?? "—"}</td>
                    <td className={cn("whitespace-nowrap px-3 py-2 text-xs", overdue && "font-medium text-red-600")}>{p.dueDate ? `${formatDateBR(p.dueDate)} (${relativeDays(p.dueDate, today)})` : "—"}</td>
                    <td className="px-3 py-2">
                      <PriorityBadge value={p.priority} />
                    </td>
                    <td className="px-3 py-2">
                      {canWrite ? (
                        <Select className="h-7 w-36 text-xs" value={p.status} onChange={(e) => run(() => setPendencyStatusAction(p.id, e.target.value))} aria-label="Status">
                          {PENDENCY_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {PENDENCY_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        PENDENCY_STATUS_LABELS[p.status]
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {canWrite && p.origin === "manual" && (
                        <div className="flex">
                          <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEdit(p)}>
                            <Pencil />
                          </Button>
                          <ConfirmButton
                            title="Excluir pendência?"
                            description={`“${p.title}” será excluída. A exclusão fica registrada na auditoria.`}
                            confirmLabel="Excluir"
                            size="icon-sm"
                            className="text-muted hover:text-red-600"
                            ariaLabel="Excluir pendência"
                            onConfirm={() => run(() => deletePendencyAction(p.id))}
                          >
                            <Trash2 />
                          </ConfirmButton>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">Pendências automáticas são resolvidas sozinhas quando a condição deixa de existir. “Cancelada” impede que reabram.</p>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? "Editar pendência" : "Nova pendência"}>
          {edit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Título" required error={fieldErrors.title} className="sm:col-span-2">
                <Input value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              </Field>
              <Field label="Categoria">
                <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as PendencyCategory })}>
                  {PENDENCY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {PENDENCY_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Cotação">
                <Select value={edit.quotationId ?? ""} onChange={(e) => setEdit({ ...edit, quotationId: e.target.value || null })}>
                  <option value="">—</option>
                  {quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Responsável">
                <Select value={edit.ownerId ?? ""} onChange={(e) => setEdit({ ...edit, ownerId: e.target.value || null })}>
                  <option value="">(eu)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Prazo">
                <Input type="date" value={edit.dueDate ?? ""} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} />
              </Field>
              <Field label="Prioridade">
                <Select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value as Priority })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as PendencyStatus })}>
                  {PENDENCY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PENDENCY_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Próxima ação" className="sm:col-span-2">
                <Input value={edit.nextAction ?? ""} onChange={(e) => setEdit({ ...edit, nextAction: e.target.value })} />
              </Field>
              <Field label="Descrição" className="sm:col-span-2">
                <Textarea value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button
              loading={pending}
              onClick={async () => {
                if (!edit) return;
                const { id, ...rest } = edit;
                const r = await run(() => savePendencyAction(id ?? null, rest));
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
