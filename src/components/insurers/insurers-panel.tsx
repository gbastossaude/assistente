"use client";
import { BellRing, MailPlus, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState } from "@/components/ui/misc";
import { InsurerStatusBadge } from "@/components/ui/status";
import { useAction } from "@/components/ui/use-action";
import { INSURER_QUOTE_STATUSES, INSURER_QUOTE_STATUS_LABELS, type InsurerQuoteStatus } from "@/lib/domain/constants";
import { addDays, formatDateBR, formatDateTimeBR, relativeDays, todayISO } from "@/lib/domain/dates";
import { cn, formatPct } from "@/lib/utils";
import { addInsurersAction, registerFollowupAction, removeQuotationInsurerAction, sendToInsurerAction, updateQuotationInsurerAction } from "@/server/actions/insurers";
import { MessageDialog, type TemplateOption } from "@/components/quotations/message-dialog";

export interface QIView {
  id: string;
  insurerName: string;
  status: InsurerQuoteStatus;
  sentAt: Date | null;
  protocol: string | null;
  insurerContact: string | null;
  insurerEmail: string | null;
  expectedReturnAt: string | null;
  pendingNotes: string | null;
  lastFollowupAt: Date | null;
  nextFollowupAt: string | null;
  filesSent: string | null;
  commissionPct: number | null;
  adminFeePct: number | null;
  specialConditions: string | null;
  declineReason: string | null;
  notes: string | null;
  proposals: number;
  followups: { id: string; occurredAt: Date; channel: string; notes: string | null; userName: string | null }[];
}

export function InsurersPanel({ quotationId, rows, available, templates, canWrite, readyForMarket }: { quotationId: string; rows: QIView[]; available: { id: string; name: string }[]; templates: TemplateOption[]; canWrite: boolean; readyForMarket: boolean }) {
  const { run, pending, fieldErrors } = useAction();
  const today = todayISO();
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [send, setSend] = useState<{ id: string; sentAt: string; protocol: string; expectedReturnAt: string; filesSent: string } | null>(null);
  const [fu, setFu] = useState<{ quotationInsurerId: string; channel: string; notes: string; nextFollowupAt: string } | null>(null);
  const [edit, setEdit] = useState<(Omit<QIView, "commissionPct" | "adminFeePct"> & { commissionPct: string; adminFeePct: string }) | null>(null);
  const [msg, setMsg] = useState<{ qi: string; tpl: string } | null>(null);
  const inUse = new Set(rows.map((r) => r.insurerName));
  const s = (v: string | null | undefined) => v ?? "";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Cada operadora tem status, prazos e follow-ups próprios — o status geral da cotação não altera o individual.
          {!readyForMarket && rows.length === 0 && " A cotação ainda não está pronta para mercado."}
        </p>
        {canWrite && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus /> Selecionar operadoras
          </Button>
        )}
      </div>
      {rows.length === 0 && <EmptyState title="Nenhuma operadora selecionada" description="Selecione as operadoras/seguradoras que participarão da cotação." />}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {rows.map((r) => {
          const overdue = r.nextFollowupAt && r.nextFollowupAt <= today && ["enviada", "recebida_operadora", "em_analise", "pendencia"].includes(r.status);
          return (
            <div key={r.id} className={cn("rounded-lg border bg-surface", overdue ? "border-amber-400" : "border-border")}>
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <p className="font-semibold">{r.insurerName}</p>
                  <p className="text-xs text-muted">
                    {r.protocol ? `Protocolo ${r.protocol}` : "Sem protocolo"} · {r.proposals} proposta(s)
                  </p>
                </div>
                <InsurerStatusBadge value={r.status} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm sm:grid-cols-3">
                <Item l="Envio" v={r.sentAt ? formatDateBR(r.sentAt) : "—"} />
                <Item l="Retorno previsto" v={r.expectedReturnAt ? `${formatDateBR(r.expectedReturnAt)} (${relativeDays(r.expectedReturnAt)})` : "—"} />
                <Item l="Responsável na operadora" v={r.insurerContact ?? "—"} />
                <Item l="Último follow-up" v={r.lastFollowupAt ? formatDateBR(r.lastFollowupAt) : "—"} />
                <Item l="Próximo follow-up" v={r.nextFollowupAt ? <span className={overdue ? "font-medium text-amber-700" : undefined}>{formatDateBR(r.nextFollowupAt)}</span> : "—"} />
                <Item l="Comissão / taxa adm." v={`${formatPct(r.commissionPct)} / ${formatPct(r.adminFeePct)}`} />
                {r.pendingNotes && <Item l="Pendências da operadora" v={r.pendingNotes} wide />}
                {r.declineReason && <Item l="Motivo da declinação" v={r.declineReason} wide />}
                {r.specialConditions && <Item l="Condições especiais" v={r.specialConditions} wide />}
                {r.filesSent && <Item l="Arquivos enviados" v={r.filesSent} wide />}
              </dl>
              {r.followups.length > 0 && (
                <details className="border-t border-border px-4 py-2 text-xs">
                  <summary className="cursor-pointer text-muted">Histórico de follow-ups ({r.followups.length})</summary>
                  <ul className="mt-1 space-y-1">
                    {r.followups.map((f) => (
                      <li key={f.id}>
                        <span className="text-muted">{formatDateTimeBR(f.occurredAt)} · {f.channel} · {f.userName}</span> — {f.notes ?? "sem observações"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {canWrite && (
                <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2">
                  <Button size="sm" variant={r.sentAt ? "outline" : "default"} onClick={() => setSend({ id: r.id, sentAt: today, protocol: s(r.protocol), expectedReturnAt: r.expectedReturnAt ?? addDays(today, 7), filesSent: s(r.filesSent) })}>
                    <Send /> {r.sentAt ? "Reenviar" : "Registrar envio"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setFu({ quotationInsurerId: r.id, channel: "email", notes: "", nextFollowupAt: addDays(today, 3) })}>
                    <BellRing /> Follow-up
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setMsg({ qi: r.id, tpl: r.sentAt ? "operadora_cobranca_retorno" : "operadora_envio_inicial" })}>
                    <MailPlus /> Mensagem
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...r, commissionPct: r.commissionPct?.toString() ?? "", adminFeePct: r.adminFeePct?.toString() ?? "" })}>
                    <Pencil /> Status e dados
                  </Button>
                  {r.status === "nao_enviada" && (
                    <ConfirmButton title={`Remover ${r.insurerName}?`} onConfirm={() => run(() => removeQuotationInsurerAction(r.id))} size="sm">
                      <Trash2 />
                    </ConfirmButton>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent title="Selecionar operadoras/seguradoras">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {available
              .filter((a) => !inUse.has(a.name))
              .map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2">
                  <input type="checkbox" checked={selected.includes(a.id)} onChange={(e) => setSelected((x) => (e.target.checked ? [...x, a.id] : x.filter((y) => y !== a.id)))} />
                  {a.name}
                </label>
              ))}
          </div>
          <DialogFooter>
            <Button
              loading={pending}
              disabled={!selected.length}
              onClick={async () => {
                const r = await run(() => addInsurersAction(quotationId, selected));
                if (r.ok) {
                  setAddOpen(false);
                  setSelected([]);
                }
              }}
            >
              Adicionar {selected.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!send} onOpenChange={(o) => !o && setSend(null)}>
        <DialogContent title="Registrar envio do estudo" description="Gera follow-up automático conforme o prazo configurado (padrão 5 dias ou o prazo da operadora).">
          {send && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Data de envio" required error={fieldErrors.sentAt}>
                <Input type="date" value={send.sentAt} onChange={(e) => setSend({ ...send, sentAt: e.target.value })} />
              </Field>
              <Field label="Protocolo">
                <Input value={send.protocol} onChange={(e) => setSend({ ...send, protocol: e.target.value })} />
              </Field>
              <Field label="Data prevista de retorno" error={fieldErrors.expectedReturnAt}>
                <Input type="date" value={send.expectedReturnAt} onChange={(e) => setSend({ ...send, expectedReturnAt: e.target.value })} />
              </Field>
              <Field label="Arquivos enviados" className="sm:col-span-2">
                <Textarea rows={2} value={send.filesSent} onChange={(e) => setSend({ ...send, filesSent: e.target.value })} placeholder="Base de vidas, fatura, sinistralidade…" />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button
              loading={pending}
              onClick={async () => {
                const r = await run(() => sendToInsurerAction(send));
                if (r.ok) setSend(null);
              }}
            >
              Registrar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fu} onOpenChange={(o) => !o && setFu(null)}>
        <DialogContent title="Registrar follow-up">
          {fu && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Canal">
                <Select value={fu.channel} onChange={(e) => setFu({ ...fu, channel: e.target.value })}>
                  <option value="email">E-mail</option>
                  <option value="telefone">Telefone</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="reuniao">Reunião</option>
                  <option value="portal">Portal da operadora</option>
                </Select>
              </Field>
              <Field label="Próximo follow-up" hint="Vazio encerra os follow-ups">
                <Input type="date" value={fu.nextFollowupAt} onChange={(e) => setFu({ ...fu, nextFollowupAt: e.target.value })} />
              </Field>
              <Field label="O que foi tratado" className="sm:col-span-2">
                <Textarea value={fu.notes} onChange={(e) => setFu({ ...fu, notes: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button
              loading={pending}
              onClick={async () => {
                const r = await run(() => registerFollowupAction(fu));
                if (r.ok) setFu(null);
              }}
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.insurerName ?? ""} description="Status individual e dados desta operadora na cotação" size="lg">
          {edit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Status">
                <Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as InsurerQuoteStatus })}>
                  {INSURER_QUOTE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {INSURER_QUOTE_STATUS_LABELS[st]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Protocolo">
                <Input value={s(edit.protocol)} onChange={(e) => setEdit({ ...edit, protocol: e.target.value })} />
              </Field>
              <Field label="Data prevista de retorno">
                <Input type="date" value={s(edit.expectedReturnAt)} onChange={(e) => setEdit({ ...edit, expectedReturnAt: e.target.value })} />
              </Field>
              <Field label="Responsável na operadora">
                <Input value={s(edit.insurerContact)} onChange={(e) => setEdit({ ...edit, insurerContact: e.target.value })} />
              </Field>
              <Field label="E-mail" error={fieldErrors.insurerEmail}>
                <Input value={s(edit.insurerEmail)} onChange={(e) => setEdit({ ...edit, insurerEmail: e.target.value })} />
              </Field>
              <Field label="Próximo follow-up">
                <Input type="date" value={s(edit.nextFollowupAt)} onChange={(e) => setEdit({ ...edit, nextFollowupAt: e.target.value })} />
              </Field>
              <Field label="Comissão (%)" error={fieldErrors.commissionPct}>
                <Input inputMode="decimal" value={edit.commissionPct} onChange={(e) => setEdit({ ...edit, commissionPct: e.target.value })} />
              </Field>
              <Field label="Taxa administrativa (%)" error={fieldErrors.adminFeePct}>
                <Input inputMode="decimal" value={edit.adminFeePct} onChange={(e) => setEdit({ ...edit, adminFeePct: e.target.value })} />
              </Field>
              {edit.status === "declinada" && (
                <Field label="Motivo da declinação" required error={fieldErrors.declineReason}>
                  <Input value={s(edit.declineReason)} onChange={(e) => setEdit({ ...edit, declineReason: e.target.value })} />
                </Field>
              )}
              <Field label="Pendências solicitadas pela operadora" className="sm:col-span-3">
                <Textarea rows={2} value={s(edit.pendingNotes)} onChange={(e) => setEdit({ ...edit, pendingNotes: e.target.value })} />
              </Field>
              <Field label="Arquivos enviados" className="sm:col-span-3">
                <Textarea rows={2} value={s(edit.filesSent)} onChange={(e) => setEdit({ ...edit, filesSent: e.target.value })} />
              </Field>
              <Field label="Condições especiais" className="sm:col-span-3">
                <Textarea rows={2} value={s(edit.specialConditions)} onChange={(e) => setEdit({ ...edit, specialConditions: e.target.value })} />
              </Field>
              <Field label="Observações" className="sm:col-span-3">
                <Textarea rows={2} value={s(edit.notes)} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button
              loading={pending}
              onClick={async () => {
                if (!edit) return;
                const r = await run(() =>
                  updateQuotationInsurerAction({
                    id: edit.id,
                    status: edit.status,
                    protocol: edit.protocol,
                    insurerContact: edit.insurerContact,
                    insurerEmail: edit.insurerEmail,
                    expectedReturnAt: edit.expectedReturnAt,
                    pendingNotes: edit.pendingNotes,
                    nextFollowupAt: edit.nextFollowupAt,
                    filesSent: edit.filesSent,
                    commissionPct: edit.commissionPct,
                    adminFeePct: edit.adminFeePct,
                    specialConditions: edit.specialConditions,
                    declineReason: edit.declineReason,
                    notes: edit.notes,
                  }),
                );
                if (r.ok) setEdit(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {msg && (
        <MessageDialog open onOpenChange={(o) => !o && setMsg(null)} quotationId={quotationId} templates={templates} insurers={rows.map((r) => ({ id: r.id, name: r.insurerName }))} defaultTemplate={msg.tpl} defaultInsurerId={msg.qi} />
      )}
    </div>
  );
}

function Item({ l, v, wide }: { l: string; v: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3" : undefined}>
      <dt className="text-xs text-muted">{l}</dt>
      <dd className="whitespace-pre-wrap">{v}</dd>
    </div>
  );
}
