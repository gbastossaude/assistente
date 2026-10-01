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
import { formatCnpj } from "@/lib/domain/cnpj";
import { MODALITIES, MODALITY_LABELS } from "@/lib/domain/constants";
import { formatDateBR } from "@/lib/domain/dates";
import { formatMoney, formatNumber, formatPct } from "@/lib/utils";
import {
  addCnpjAction,
  deleteContactAction,
  deleteContractAction,
  removeCnpjAction,
  saveContactAction,
  saveContractAction,
} from "@/server/actions/companies";

// ─────────────── CNPJs ───────────────
export function CnpjManager({ companyId, cnpjs, canWrite }: { companyId: string; cnpjs: { id: string; cnpj: string; legalName: string | null; isMain: boolean }[]; canWrite: boolean }) {
  const { run, pending, fieldErrors } = useAction();
  const [v, setV] = useState({ cnpj: "", legalName: "", isMain: false });
  return (
    <div className="space-y-4">
      {canWrite && (
        <form
          className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.5fr_auto_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => addCnpjAction({ ...v, companyId }));
            if (r.ok) setV({ cnpj: "", legalName: "", isMain: false });
          }}
        >
          <Field label="CNPJ" error={fieldErrors.cnpj}>
            <Input value={v.cnpj} onChange={(e) => setV({ ...v, cnpj: e.target.value })} onBlur={(e) => setV({ ...v, cnpj: formatCnpj(e.target.value) })} placeholder="00.000.000/0000-00" />
          </Field>
          <Field label="Razão social do CNPJ">
            <Input value={v.legalName} onChange={(e) => setV({ ...v, legalName: e.target.value })} />
          </Field>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={v.isMain} onChange={(e) => setV({ ...v, isMain: e.target.checked })} /> Principal
          </label>
          <Button type="submit" loading={pending} disabled={!v.cnpj}>
            <Plus /> Adicionar
          </Button>
        </form>
      )}
      {cnpjs.length === 0 ? (
        <EmptyState title="Nenhum CNPJ vinculado" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>CNPJ</Th>
              <Th>Razão social</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {cnpjs.map((c) => (
              <tr key={c.id}>
                <Td className="tabular-nums">
                  {formatCnpj(c.cnpj)} {c.isMain && <Badge tone="blue">Principal</Badge>}
                </Td>
                <Td>{c.legalName ?? "—"}</Td>
                <Td className="text-right">
                  {canWrite && (
                    <ConfirmButton title="Desvincular CNPJ?" description={`O CNPJ ${formatCnpj(c.cnpj)} deixará de estar associado a esta empresa.`} onConfirm={() => run(() => removeCnpjAction(c.id))} size="icon-sm">
                      <Trash2 />
                    </ConfirmButton>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

// ─────────────── Contatos ───────────────
type Contact = { id: string; name: string; roleTitle: string | null; email: string | null; phone: string | null; whatsapp: string | null; isPrimary: boolean; notes: string | null };

export function ContactsManager({ companyId, contacts, canWrite }: { companyId: string; contacts: Contact[]; canWrite: boolean }) {
  const { run, pending, fieldErrors } = useAction();
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const save = async () => {
    if (!editing) return;
    const r = await run(() => saveContactAction(editing.id ?? null, { ...editing, companyId }));
    if (r.ok) setEditing(null);
  };
  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing({ name: "", isPrimary: contacts.length === 0 })}>
            <Plus /> Novo contato
          </Button>
        </div>
      )}
      {contacts.length === 0 ? (
        <EmptyState title="Nenhum contato cadastrado" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contacts.map((c) => (
            <div key={c.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1 font-medium">
                    {c.name} {c.isPrimary && <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="Contato principal" />}
                  </p>
                  <p className="text-xs text-muted">{c.roleTitle ?? "—"}</p>
                </div>
                {canWrite && (
                  <div className="flex">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(c)} aria-label="Editar">
                      <Pencil />
                    </Button>
                    <ConfirmButton title="Excluir contato?" onConfirm={() => run(() => deleteContactAction(c.id))} size="icon-sm">
                      <Trash2 />
                    </ConfirmButton>
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-0.5 text-sm">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="block truncate text-primary hover:underline">
                    {c.email}
                  </a>
                )}
                {c.phone && <p>{c.phone}</p>}
                {c.whatsapp && (
                  <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="block text-emerald-700 hover:underline">
                    WhatsApp {c.whatsapp}
                  </a>
                )}
                {c.notes && <p className="text-xs text-muted">{c.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? "Editar contato" : "Novo contato"}>
          {editing && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nome" required error={fieldErrors.name}>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Cargo">
                <Input value={editing.roleTitle ?? ""} onChange={(e) => setEditing({ ...editing, roleTitle: e.target.value })} />
              </Field>
              <Field label="E-mail" error={fieldErrors.email}>
                <Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
              <Field label="Telefone">
                <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>
              <Field label="WhatsApp">
                <Input value={editing.whatsapp ?? ""} onChange={(e) => setEditing({ ...editing, whatsapp: e.target.value })} placeholder="+55 11 9…" />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={!!editing.isPrimary} onChange={(e) => setEditing({ ...editing, isPrimary: e.target.checked })} /> Contato principal
              </label>
              <Field label="Observações" className="sm:col-span-2">
                <Textarea value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={save} loading={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────── Contratos atuais ───────────────
type Plan = { id?: string | null; planName: string; lives: string | number | null; monthlyCost: string | number | null; costPerLife: string | number | null; consultationReimbursement: string | number | null; notes?: string | null };
export type ContractView = {
  id: string;
  insurerId: string | null;
  insurerName: string | null;
  contractNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  anniversaryDate: string | null;
  contractingType: string | null;
  modality: string | null;
  paymentMethod: string | null;
  remission: string | null;
  upgradeDowngradeRules: string | null;
  adjustmentIndex: string | null;
  breakEven: number | null;
  commissionPct: number | null;
  lossRatioPct: number | null;
  notes: string | null;
  plans: { id: string; planName: string; lives: number | null; monthlyCost: number | null; costPerLife: number | null; consultationReimbursement: number | null; notes: string | null }[];
};

const emptyPlan = (): Plan => ({ planName: "", lives: "", monthlyCost: "", costPerLife: "", consultationReimbursement: "" });

export function ContractsManager({ companyId, contracts, insurers, canWrite }: { companyId: string; contracts: ContractView[]; insurers: { id: string; name: string }[]; canWrite: boolean }) {
  const { run, pending, fieldErrors } = useAction();
  const [editing, setEditing] = useState<(Record<string, unknown> & { plans: Plan[] }) | null>(null);
  const set = (k: string, v: unknown) => setEditing((e) => (e ? { ...e, [k]: v } : e));
  const setPlan = (i: number, k: keyof Plan, v: string) => setEditing((e) => (e ? { ...e, plans: e.plans.map((p, j) => (j === i ? { ...p, [k]: v } : p)) } : e));
  const str = (k: string) => (editing?.[k] as string | null | undefined) ?? "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">Cadastre um contrato por operadora/seguradora atual. Os dados alimentam automaticamente o checklist das cotações.</p>
        {canWrite && (
          <Button size="sm" onClick={() => setEditing({ plans: [emptyPlan()] })}>
            <Plus /> Novo contrato
          </Button>
        )}
      </div>
      {contracts.length === 0 && <EmptyState title="Nenhum contrato atual cadastrado" description="Se a empresa tem mais de uma operadora, cadastre um contrato para cada." />}
      {contracts.map((c) => {
        const totalLives = c.plans.reduce((a, p) => a + (p.lives ?? 0), 0);
        const totalCost = c.plans.reduce((a, p) => a + (p.monthlyCost ?? (p.costPerLife ?? 0) * (p.lives ?? 0)), 0);
        return (
          <div key={c.id} className="rounded-lg border border-border">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <p className="font-medium">{c.insurerName ?? "—"}</p>
                <p className="text-xs text-muted">
                  Vigência {formatDateBR(c.startDate)} – {formatDateBR(c.endDate)} · Aniversário {formatDateBR(c.anniversaryDate)} · {c.modality ? MODALITY_LABELS[c.modality as "opcional"] : "modalidade não informada"}
                </p>
              </div>
              {canWrite && (
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditing({
                        ...c,
                        plans: c.plans.map((p) => ({ ...p, lives: p.lives ?? "", monthlyCost: p.monthlyCost ?? "", costPerLife: p.costPerLife ?? "", consultationReimbursement: p.consultationReimbursement ?? "" })),
                      })
                    }
                  >
                    <Pencil /> Editar
                  </Button>
                  <ConfirmButton title="Excluir contrato?" description="O contrato deixa de compor as cotações da empresa." onConfirm={() => run(() => deleteContractAction(c.id))} size="icon-sm">
                    <Trash2 />
                  </ConfirmButton>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-sm md:grid-cols-4">
              <Info l="Tipo de contratação" v={c.contractingType} />
              <Info l="Forma de pagamento" v={c.paymentMethod} />
              <Info l="Remissão" v={c.remission} />
              <Info l="Índice de reajuste" v={c.adjustmentIndex} />
              <Info l="Break-even" v={formatPct(c.breakEven)} />
              <Info l="Comissão atual" v={formatPct(c.commissionPct)} />
              <Info l="Sinistralidade" v={formatPct(c.lossRatioPct)} />
              <Info l="Upgrade/downgrade" v={c.upgradeDowngradeRules} />
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Plano</Th>
                  <Th className="text-right">Vidas</Th>
                  <Th className="text-right">Custo mensal</Th>
                  <Th className="text-right">Custo/vida</Th>
                  <Th className="text-right">Reembolso consulta</Th>
                </tr>
              </thead>
              <tbody>
                {c.plans.map((p) => (
                  <tr key={p.id}>
                    <Td>{p.planName}</Td>
                    <Td className="text-right tabular-nums">{formatNumber(p.lives)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(p.monthlyCost)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(p.costPerLife)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(p.consultationReimbursement)}</Td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <Td>Total</Td>
                  <Td className="text-right tabular-nums">{formatNumber(totalLives)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(totalCost)}</Td>
                  <Td />
                  <Td />
                </tr>
              </tbody>
            </Table>
          </div>
        );
      })}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? "Editar contrato atual" : "Novo contrato atual"} size="xl">
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Operadora/seguradora (cadastro)" error={fieldErrors.insurerName}>
                  <Select value={str("insurerId")} onChange={(e) => set("insurerId", e.target.value)}>
                    <option value="">Outra (digitar)</option>
                    {insurers.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {!str("insurerId") && (
                  <Field label="Nome da operadora" error={fieldErrors.insurerName}>
                    <Input value={str("insurerName")} onChange={(e) => set("insurerName", e.target.value)} />
                  </Field>
                )}
                <Field label="Nº do contrato">
                  <Input value={str("contractNumber")} onChange={(e) => set("contractNumber", e.target.value)} />
                </Field>
                <Field label="Início da vigência" error={fieldErrors.startDate}>
                  <Input type="date" value={str("startDate")} onChange={(e) => set("startDate", e.target.value)} />
                </Field>
                <Field label="Fim da vigência" error={fieldErrors.endDate}>
                  <Input type="date" value={str("endDate")} onChange={(e) => set("endDate", e.target.value)} />
                </Field>
                <Field label="Data de aniversário/renovação">
                  <Input type="date" value={str("anniversaryDate")} onChange={(e) => set("anniversaryDate", e.target.value)} />
                </Field>
                <Field label="Tipo de contratação">
                  <Input value={str("contractingType")} onChange={(e) => set("contractingType", e.target.value)} placeholder="Empresarial, adesão…" />
                </Field>
                <Field label="Modalidade">
                  <Select value={str("modality")} onChange={(e) => set("modality", e.target.value)}>
                    <option value="">—</option>
                    {MODALITIES.map((m) => (
                      <option key={m} value={m}>
                        {MODALITY_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Forma de pagamento">
                  <Input value={str("paymentMethod")} onChange={(e) => set("paymentMethod", e.target.value)} />
                </Field>
                <Field label="Remissão">
                  <Input value={str("remission")} onChange={(e) => set("remission", e.target.value)} />
                </Field>
                <Field label="Índice de reajuste">
                  <Input value={str("adjustmentIndex")} onChange={(e) => set("adjustmentIndex", e.target.value)} />
                </Field>
                <Field label="Break-even (%)" error={fieldErrors.breakEven}>
                  <Input inputMode="decimal" value={String(editing.breakEven ?? "")} onChange={(e) => set("breakEven", e.target.value)} />
                </Field>
                <Field label="Comissão atual (%)" error={fieldErrors.commissionPct}>
                  <Input inputMode="decimal" value={String(editing.commissionPct ?? "")} onChange={(e) => set("commissionPct", e.target.value)} />
                </Field>
                <Field label="Sinistralidade (%)" error={fieldErrors.lossRatioPct}>
                  <Input inputMode="decimal" value={String(editing.lossRatioPct ?? "")} onChange={(e) => set("lossRatioPct", e.target.value)} />
                </Field>
                <Field label="Regras de upgrade/downgrade" className="md:col-span-3">
                  <Textarea value={str("upgradeDowngradeRules")} onChange={(e) => set("upgradeDowngradeRules", e.target.value)} rows={2} />
                </Field>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Planos, vidas, custos e reembolso por plano</p>
                  <Button size="sm" variant="outline" onClick={() => set("plans", [...editing.plans, emptyPlan()])}>
                    <Plus /> Plano
                  </Button>
                </div>
                <div className="space-y-2">
                  {editing.plans.map((p, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:items-end">
                      <Field label="Plano" error={fieldErrors[`plans.${i}.planName`]}>
                        <Input value={p.planName} onChange={(e) => setPlan(i, "planName", e.target.value)} />
                      </Field>
                      <Field label="Vidas" error={fieldErrors[`plans.${i}.lives`]}>
                        <Input inputMode="numeric" value={String(p.lives ?? "")} onChange={(e) => setPlan(i, "lives", e.target.value)} />
                      </Field>
                      <Field label="Custo mensal (R$)" error={fieldErrors[`plans.${i}.monthlyCost`]}>
                        <Input inputMode="decimal" value={String(p.monthlyCost ?? "")} onChange={(e) => setPlan(i, "monthlyCost", e.target.value)} />
                      </Field>
                      <Field label="Custo/vida (R$)">
                        <Input inputMode="decimal" value={String(p.costPerLife ?? "")} onChange={(e) => setPlan(i, "costPerLife", e.target.value)} />
                      </Field>
                      <Field label="Reembolso consulta (R$)">
                        <Input inputMode="decimal" value={String(p.consultationReimbursement ?? "")} onChange={(e) => setPlan(i, "consultationReimbursement", e.target.value)} />
                      </Field>
                      <Button variant="ghost" size="icon" aria-label="Remover plano" onClick={() => set("plans", editing.plans.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <Field label="Observações">
                <Textarea value={str("notes")} onChange={(e) => set("notes", e.target.value)} rows={2} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={async () => {
                if (!editing) return;
                const { id, ...rest } = editing as { id?: string } & Record<string, unknown>;
                const r = await run(() => saveContractAction(id ?? null, { ...rest, companyId }));
                if (r.ok) setEditing(null);
              }}
            >
              Salvar contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{l}</p>
      <p className="truncate">{v || "—"}</p>
    </div>
  );
}
