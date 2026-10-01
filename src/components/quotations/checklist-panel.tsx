"use client";
import { Bot, FileCheck2, Pencil, Send, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { ChecklistStatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/use-action";
import { CHECKLIST_CATEGORY_LABELS, type ChecklistCategory } from "@/lib/domain/checklist-catalog";
import { CHECKLIST_STATUSES, CHECKLIST_STATUS_LABELS, type ChecklistStatus } from "@/lib/domain/constants";
import { formatDateBR } from "@/lib/domain/dates";
import { cn } from "@/lib/utils";
import { applyTemplateAction, markRequestedAction, updateChecklistItemAction } from "@/server/actions/quotations";
import { MessageDialog, type TemplateOption } from "./message-dialog";

export interface ChecklistItemView {
  id: string;
  itemKey: string;
  label: string;
  category: string;
  required: boolean;
  applicable: boolean;
  status: ChecklistStatus;
  autoFilled: boolean;
  sentBy: string | null;
  requestedAt: Date | null;
  receivedAt: Date | null;
  notes: string | null;
  documentId: string | null;
  documentType: string | null;
}

export function ChecklistPanel({
  quotationId,
  items,
  docs,
  templates,
  canWrite,
}: {
  quotationId: string;
  items: ChecklistItemView[];
  docs: { id: string; fileName: string }[];
  templates: TemplateOption[];
  canWrite: boolean;
}) {
  const { run, pending } = useAction();
  const [filter, setFilter] = useState<"todos" | "pendentes" | "obrigatorios">("pendentes");
  const [edit, setEdit] = useState<ChecklistItemView | null>(null);
  const [form, setForm] = useState({ status: "pendente", sentBy: "", notes: "", documentId: "", requestedAt: "", receivedAt: "" });
  const [msgOpen, setMsgOpen] = useState(false);
  const docName = new Map(docs.map((d) => [d.id, d.fileName]));

  const visible = useMemo(
    () =>
      items.filter((i) => {
        if (filter === "pendentes") return i.applicable && i.status === "pendente";
        if (filter === "obrigatorios") return i.required && i.applicable;
        return true;
      }),
    [items, filter],
  );
  const groups = useMemo(() => {
    const m = new Map<string, ChecklistItemView[]>();
    for (const i of visible) m.set(i.category, [...(m.get(i.category) ?? []), i]);
    return [...m.entries()];
  }, [visible]);
  const pendingCount = items.filter((i) => i.applicable && i.status === "pendente").length;

  const openEdit = (i: ChecklistItemView) => {
    setEdit(i);
    setForm({
      status: i.status,
      sentBy: i.sentBy ?? "",
      notes: i.notes ?? "",
      documentId: i.documentId ?? "",
      requestedAt: i.requestedAt ? new Date(i.requestedAt).toISOString().slice(0, 10) : "",
      receivedAt: i.receivedAt ? new Date(i.receivedAt).toISOString().slice(0, 10) : "",
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-border bg-surface p-0.5 text-xs">
          {(
            [
              ["pendentes", `Pendentes (${pendingCount})`],
              ["obrigatorios", "Obrigatórios"],
              ["todos", `Todos (${items.length})`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded px-2.5 py-1", filter === k ? "bg-primary text-white" : "text-muted hover:bg-surface-2")}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMsgOpen(true)} disabled={pendingCount === 0}>
            <Send /> Solicitar pendências ao cliente
          </Button>
          {canWrite && (
            <>
              <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => markRequestedAction(quotationId))} disabled={pendingCount === 0}>
                Registrar solicitação
              </Button>
              <ConfirmButton
                title="Reaplicar modelo de checklist?"
                description="Itens novos do modelo atual serão incluídos e a obrigatoriedade atualizada. Status já registrados são preservados."
                variant="default"
                triggerVariant="ghost"
                onConfirm={() => run(() => applyTemplateAction(quotationId))}
              >
                <RotateCcw /> Reaplicar modelo
              </ConfirmButton>
            </>
          )}
        </div>
      </div>
      {groups.length === 0 && <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted">Nenhum item neste filtro. {filter === "pendentes" && "Todos os itens aplicáveis foram resolvidos 🎉"}</p>}
      {groups.map(([cat, list]) => (
        <div key={cat} className="overflow-hidden rounded-lg border border-border bg-surface">
          <p className="border-b border-border bg-surface-2/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{CHECKLIST_CATEGORY_LABELS[cat as ChecklistCategory] ?? cat}</p>
          <ul>
            {list.map((i) => (
              <li key={i.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 last:border-0", !i.applicable && "opacity-60")}>
                <div className="min-w-56 flex-1">
                  <p className="text-sm">
                    {i.label} {i.required && i.applicable && <span className="text-red-600" title="Obrigatório">*</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                    {!i.applicable && <span>Não se aplica a este processo</span>}
                    {i.autoFilled && i.applicable && i.status !== "pendente" && (
                      <span className="flex items-center gap-0.5">
                        <Bot className="size-3" /> preenchido automaticamente
                      </span>
                    )}
                    {i.requestedAt && <span>Solicitado em {formatDateBR(new Date(i.requestedAt))}</span>}
                    {i.receivedAt && i.status !== "pendente" && <span>Recebido em {formatDateBR(new Date(i.receivedAt))}</span>}
                    {i.sentBy && <span>por {i.sentBy}</span>}
                    {i.documentId && docName.get(i.documentId) && (
                      <a className="flex items-center gap-0.5 text-primary hover:underline" href={`/api/documents/${i.documentId}/download`}>
                        <FileCheck2 className="size-3" /> {docName.get(i.documentId)}
                      </a>
                    )}
                    {i.notes && <span className="italic">“{i.notes}”</span>}
                  </p>
                </div>
                {!i.required && i.applicable && <Badge tone="zinc">Opcional</Badge>}
                <ChecklistStatusBadge value={i.status} />
                {canWrite && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Atualizar ${i.label}`} onClick={() => openEdit(i)}>
                    <Pencil />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.label ?? ""} description="A definição manual prevalece sobre o preenchimento automático.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {CHECKLIST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CHECKLIST_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quem enviou">
              <Input value={form.sentBy} onChange={(e) => setForm({ ...form, sentBy: e.target.value })} />
            </Field>
            <Field label="Data da solicitação">
              <Input type="date" value={form.requestedAt} onChange={(e) => setForm({ ...form, requestedAt: e.target.value })} />
            </Field>
            <Field label="Data de recebimento">
              <Input type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} />
            </Field>
            <Field label="Documento relacionado" className="sm:col-span-2">
              <Select value={form.documentId} onChange={(e) => setForm({ ...form, documentId: e.target.value })}>
                <option value="">—</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fileName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Observação" className="sm:col-span-2" hint={form.status === "dispensado" && edit?.required ? "Dispensar item obrigatório: registre o motivo" : undefined}>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              disabled={form.status === "dispensado" && !!edit?.required && !form.notes.trim()}
              onClick={async () => {
                if (!edit) return;
                const r = await run(() => updateChecklistItemAction({ id: edit.id, ...form }));
                if (r.ok) setEdit(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MessageDialog open={msgOpen} onOpenChange={setMsgOpen} quotationId={quotationId} templates={templates} defaultTemplate="cliente_solicitacao_inicial_email" />
    </div>
  );
}
