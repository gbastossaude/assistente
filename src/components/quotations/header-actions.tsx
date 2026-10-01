"use client";
import { MessageSquareText, MoreHorizontal, Pencil, RefreshCw, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { PRIORITIES, PRIORITY_LABELS, type QuotationStatus } from "@/lib/domain/constants";
import { deleteQuotationAction, updateHeaderAction } from "@/server/actions/quotations";
import { MessageDialog, type TemplateOption } from "./message-dialog";
import { StatusDialog } from "./status-dialog";

export function QuotationHeaderActions({
  q,
  users,
  templates,
  insurers,
  pendingRequired,
  canWrite,
  canOverride,
  canDelete,
}: {
  q: { id: string; status: QuotationStatus; stipulantName: string | null; estimatedLives: number; reason: string | null; targetDate: string | null; renewalDate: string | null; ownerId: string | null; priority: string; notes: string | null };
  users: { id: string; name: string }[];
  templates: TemplateOption[];
  insurers: { id: string; name: string }[];
  pendingRequired: number;
  canWrite: boolean;
  canOverride: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction();
  const [statusOpen, setStatusOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [v, setV] = useState({ ...q, estimatedLives: String(q.estimatedLives), stipulantName: q.stipulantName ?? "", reason: q.reason ?? "", targetDate: q.targetDate ?? "", renewalDate: q.renewalDate ?? "", ownerId: q.ownerId ?? "", notes: q.notes ?? "" });
  return (
    <>
      <Button variant="outline" onClick={() => setMsgOpen(true)}>
        <MessageSquareText /> Gerar mensagem
      </Button>
      {canWrite && (
        <Button onClick={() => setStatusOpen(true)}>
          <RefreshCw /> Alterar status
        </Button>
      )}
      {canWrite && (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mais ações">
              <MoreHorizontal />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={() => setEditOpen(true)}>
              <Pencil /> Editar dados gerais
            </DropdownItem>
            <DropdownItem asChild>
              <Link href={`/cotacoes/${q.id}/wizard?step=2`}>
                <Wand2 /> Abrir wizard
              </Link>
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      )}
      {canDelete && (
        <ConfirmButton
          title="Excluir cotação?"
          description="A cotação será excluída logicamente; tarefas e pendências abertas serão canceladas. A ação fica registrada na auditoria."
          size="icon"
          onConfirm={async () => {
            const r = await run(() => deleteQuotationAction(q.id), { refresh: false });
            if (r.ok) router.push("/cotacoes");
          }}
        >
          <Trash2 />
        </ConfirmButton>
      )}
      <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} quotationId={q.id} current={q.status} pendingRequired={pendingRequired} canOverride={canOverride} />
      <MessageDialog open={msgOpen} onOpenChange={setMsgOpen} quotationId={q.id} templates={templates} insurers={insurers} />
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent title="Dados gerais da cotação" size="lg">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Estipulante" className="sm:col-span-2">
              <Input value={v.stipulantName} onChange={(e) => setV({ ...v, stipulantName: e.target.value })} />
            </Field>
            <Field label="Vidas estimadas" required error={fieldErrors.estimatedLives}>
              <Input type="number" value={v.estimatedLives} onChange={(e) => setV({ ...v, estimatedLives: e.target.value })} />
            </Field>
            <Field label="Data-alvo" error={fieldErrors.targetDate}>
              <Input type="date" value={v.targetDate} onChange={(e) => setV({ ...v, targetDate: e.target.value })} />
            </Field>
            <Field label="Data de renovação">
              <Input type="date" value={v.renewalDate} onChange={(e) => setV({ ...v, renewalDate: e.target.value })} />
            </Field>
            <Field label="Prioridade">
              <Select value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Responsável">
              <Select value={v.ownerId} onChange={(e) => setV({ ...v, ownerId: e.target.value })}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Motivo da cotação" className="sm:col-span-3">
              <Textarea value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} rows={2} />
            </Field>
            <Field label="Observações" className="sm:col-span-3">
              <Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} rows={2} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                const r = await run(() => updateHeaderAction(q.id, v));
                if (r.ok) setEditOpen(false);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
