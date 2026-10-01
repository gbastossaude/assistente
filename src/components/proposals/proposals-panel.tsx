"use client";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { EmptyState, Table, Td, Th } from "@/components/ui/misc";
import { useAction } from "@/components/ui/use-action";
import { formatDateBR, todayISO } from "@/lib/domain/dates";
import { formatMoney, formatPct } from "@/lib/utils";
import { deleteProposalAction, saveProposalAction, toggleHighlightAction } from "@/server/actions/insurers";
import type { Comparison } from "@/server/services/insurers";
import { UploadZone } from "@/components/documents/documents-panel";

type Plan = Record<string, string>;
const PLAN_FIELDS: { k: string; l: string; num?: boolean }[] = [
  { k: "productName", l: "Produto/plano" },
  { k: "network", l: "Rede" },
  { k: "coverage", l: "Abrangência" },
  { k: "accommodation", l: "Acomodação" },
  { k: "copay", l: "Coparticipação" },
  { k: "reimbursement", l: "Reembolso (R$)", num: true },
  { k: "monthlyValue", l: "Valor mensal estimado (R$)", num: true },
  { k: "currentCost", l: "Custo atual equivalente (R$)", num: true },
  { k: "lives", l: "Vidas", num: true },
  { k: "waitingPeriods", l: "Carências" },
  { k: "commercialConditions", l: "Condições comerciais" },
];
const emptyPlan = (): Plan => Object.fromEntries(PLAN_FIELDS.map((f) => [f.k, ""]));

export function ProposalsPanel({ quotationId, comparison, insurers, docs, canWrite, maxMb }: { quotationId: string; comparison: Comparison; insurers: { id: string; name: string }[]; docs: { id: string; fileName: string }[]; canWrite: boolean; maxMb: number }) {
  const { run, pending, fieldErrors } = useAction();
  const [edit, setEdit] = useState<{ id?: string; quotationInsurerId: string; receivedAt: string; validUntil: string; commissionPct: string; adminFeePct: string; commercialConditions: string; notes: string; documentId: string; plans: Plan[] } | null>(null);
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const startNew = () => setEdit({ quotationInsurerId: insurers[0]?.id ?? "", receivedAt: todayISO(), validUntil: "", commissionPct: "", adminFeePct: "", commercialConditions: "", notes: "", documentId: "", plans: [emptyPlan()] });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">A proposta recebida muda o status da operadora para “Cotação recebida” e cancela as cobranças pendentes daquela operadora.</p>
        {canWrite && (
          <Button size="sm" onClick={startNew} disabled={!insurers.length} title={!insurers.length ? "Selecione operadoras primeiro" : undefined}>
            <Plus /> Registrar proposta
          </Button>
        )}
      </div>
      {comparison.proposals.length === 0 && <EmptyState title="Nenhuma proposta recebida" />}
      {comparison.proposals.map((p) => (
        <div key={p.p.id} className="rounded-lg border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <p className="flex items-center gap-2 font-semibold">
                {p.insurerName} <Badge tone="slate">v{p.p.version}</Badge>
                {p.p.selectedForPresentation && <Badge tone="amber">Destacada para apresentação</Badge>}
                {p.expired && <Badge tone="red">Vencida</Badge>}
              </p>
              <p className="text-xs text-muted">
                Recebida {formatDateBR(p.p.receivedAt)} · válida até {formatDateBR(p.p.validUntil)} · comissão {formatPct(p.p.commissionPct)} · taxa adm. {formatPct(p.p.adminFeePct)}
              </p>
            </div>
            <div className="flex gap-1">
              {p.p.documentId && (
                <Button asChild size="sm" variant="ghost">
                  <a href={`/api/documents/${p.p.documentId}/download`}>Arquivo</a>
                </Button>
              )}
              {canWrite && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => run(() => toggleHighlightAction(p.p.id))} title="Destacar para apresentação (decisão do usuário)">
                    <Star className={p.p.selectedForPresentation ? "fill-amber-400 text-amber-500" : ""} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEdit({
                        id: p.p.id,
                        quotationInsurerId: p.p.quotationInsurerId,
                        receivedAt: p.p.receivedAt,
                        validUntil: str(p.p.validUntil),
                        commissionPct: str(p.p.commissionPct),
                        adminFeePct: str(p.p.adminFeePct),
                        commercialConditions: str(p.p.commercialConditions),
                        notes: str(p.p.notes),
                        documentId: str(p.p.documentId),
                        plans: p.plans.map((pl) => Object.fromEntries(PLAN_FIELDS.map((f) => [f.k, str((pl as Record<string, unknown>)[f.k])]))),
                      })
                    }
                  >
                    <Pencil />
                  </Button>
                  <ConfirmButton title="Excluir proposta?" onConfirm={() => run(() => deleteProposalAction(p.p.id))} size="icon-sm">
                    <Trash2 />
                  </ConfirmButton>
                </>
              )}
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Abrangência</Th>
                <Th>Acomodação</Th>
                <Th>Copart.</Th>
                <Th className="text-right">Reembolso</Th>
                <Th className="text-right">Valor mensal</Th>
                <Th className="text-right">Custo atual</Th>
                <Th className="text-right">Variação</Th>
              </tr>
            </thead>
            <tbody>
              {p.plans.map((pl) => (
                <tr key={pl.id}>
                  <Td>{pl.productName}</Td>
                  <Td>{pl.coverage ?? "—"}</Td>
                  <Td>{pl.accommodation ?? "—"}</Td>
                  <Td>{pl.copay ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(pl.reimbursement)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(pl.monthlyValue)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(pl.currentCost)}</Td>
                  <Td className={`text-right tabular-nums ${pl.variationPct === null ? "" : pl.variationPct > 0 ? "text-red-700" : "text-emerald-700"}`}>{pl.variationPct === null ? "—" : `${pl.variationPct > 0 ? "+" : ""}${formatPct(pl.variationPct)}`}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ))}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? "Editar proposta" : "Registrar proposta"} size="xl">
          {edit && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Operadora" required>
                  <Select value={edit.quotationInsurerId} onChange={(e) => setEdit({ ...edit, quotationInsurerId: e.target.value })} disabled={!!edit.id}>
                    {insurers.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Data da proposta" required error={fieldErrors.receivedAt}>
                  <Input type="date" value={edit.receivedAt} onChange={(e) => setEdit({ ...edit, receivedAt: e.target.value })} />
                </Field>
                <Field label="Validade" error={fieldErrors.validUntil}>
                  <Input type="date" value={edit.validUntil} onChange={(e) => setEdit({ ...edit, validUntil: e.target.value })} />
                </Field>
                <Field label="Arquivo da proposta">
                  <Select value={edit.documentId} onChange={(e) => setEdit({ ...edit, documentId: e.target.value })}>
                    <option value="">—</option>
                    {docs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fileName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Comissão (%)" error={fieldErrors.commissionPct}>
                  <Input inputMode="decimal" value={edit.commissionPct} onChange={(e) => setEdit({ ...edit, commissionPct: e.target.value })} />
                </Field>
                <Field label="Taxa administrativa (%)" error={fieldErrors.adminFeePct}>
                  <Input inputMode="decimal" value={edit.adminFeePct} onChange={(e) => setEdit({ ...edit, adminFeePct: e.target.value })} />
                </Field>
                <Field label="Condições comerciais" className="md:col-span-2">
                  <Input value={edit.commercialConditions} onChange={(e) => setEdit({ ...edit, commercialConditions: e.target.value })} />
                </Field>
              </div>
              <UploadZone compact quotationId={quotationId} defaultType="proposta_operadora" maxMb={maxMb} onUploaded={(d) => setEdit((s) => (s ? { ...s, documentId: d.id } : s))} />
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Produtos/planos da proposta</p>
                  <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, plans: [...edit.plans, emptyPlan()] })}>
                    <Plus /> Produto
                  </Button>
                </div>
                {fieldErrors.plans && <p className="mb-1 text-xs text-red-600">{fieldErrors.plans[0]}</p>}
                <div className="space-y-2">
                  {edit.plans.map((pl, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 md:grid-cols-4 lg:grid-cols-6">
                      {PLAN_FIELDS.map((f) => (
                        <Field key={f.k} label={f.l} error={fieldErrors[`plans.${i}.${f.k}`]} className={f.k === "productName" ? "col-span-2" : undefined}>
                          <Input inputMode={f.num ? "decimal" : undefined} value={pl[f.k]} onChange={(e) => setEdit({ ...edit, plans: edit.plans.map((x, j) => (j === i ? { ...x, [f.k]: e.target.value } : x)) })} />
                        </Field>
                      ))}
                      <div className="flex items-end">
                        <Button variant="ghost" size="sm" onClick={() => setEdit({ ...edit, plans: edit.plans.filter((_, j) => j !== i) })}>
                          <Trash2 /> Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Field label="Observações">
                <Textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={2} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                if (!edit) return;
                const r = await run(() => saveProposalAction({ ...edit, id: edit.id ?? null }));
                if (r.ok) setEdit(null);
              }}
            >
              Salvar proposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
