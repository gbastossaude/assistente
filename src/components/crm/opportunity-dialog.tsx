"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { LEAD_SOURCES, LEAD_SOURCE_LABELS, LGPD_FREE_TEXT_WARNING, LOST_REASON_LABELS, OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABELS, PRODUCTS, PRODUCT_LABELS } from "@/lib/domain/commercial";
import { addDays, todayISO } from "@/lib/domain/dates";
import { saveOpportunityAction } from "@/server/actions/crm";

export interface CrmOptions {
  users: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  quotations: { id: string; label: string; companyId: string }[];
  insurers: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
}

export interface OpportunityFormValue {
  id?: string;
  clientName: string;
  companyId: string;
  document: string;
  contactName: string;
  phone: string;
  email: string;
  product: string;
  lives: string;
  estimatedValue: string;
  currentInsurer: string;
  quotedInsurers: string;
  brokerId: string;
  advisorName: string;
  salesRepName: string;
  source: string;
  campaignId: string;
  stage: string;
  nextStep: string;
  nextFollowupAt: string;
  lostReason: string;
  quotationId: string;
  notes: string;
}

export function blankOpportunity(over: Partial<OpportunityFormValue> = {}): OpportunityFormValue {
  return {
    clientName: "",
    companyId: "",
    document: "",
    contactName: "",
    phone: "",
    email: "",
    product: "plano_saude",
    lives: "",
    estimatedValue: "",
    currentInsurer: "",
    quotedInsurers: "",
    brokerId: "",
    advisorName: "",
    salesRepName: "",
    source: "indicacao",
    campaignId: "",
    stage: "lead_novo",
    nextStep: "Fazer o primeiro contato",
    nextFollowupAt: addDays(todayISO(), 1),
    lostReason: "",
    quotationId: "",
    notes: "",
    ...over,
  };
}

export function OpportunityDialog({ open, onOpenChange, value, options, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; value: OpportunityFormValue | null; options: CrmOptions; onSaved?: (id: string) => void }) {
  const { run, pending, fieldErrors } = useAction();
  const [v, setV] = useState<OpportunityFormValue>(value ?? blankOpportunity());
  useEffect(() => {
    if (open) setV(value ?? blankOpportunity());
  }, [open, value]);
  const set = <K extends keyof OpportunityFormValue>(k: K, val: OpportunityFormValue[K]) => setV((s) => ({ ...s, [k]: val }));
  const qs = v.companyId ? options.quotations.filter((q) => q.companyId === v.companyId) : options.quotations;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={v.id ? "Editar oportunidade" : "Nova oportunidade"} description="Lead, cliente ou empresa em negociação" size="xl">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Cliente ou empresa" required error={fieldErrors.clientName} className="md:col-span-2">
            <Input value={v.clientName} onChange={(e) => set("clientName", e.target.value)} autoFocus />
          </Field>
          <Field label="Empresa cadastrada" hint="Opcional — vincula à ficha da empresa">
            <Select
              value={v.companyId}
              onChange={(e) => {
                const c = options.companies.find((x) => x.id === e.target.value);
                setV((s) => ({ ...s, companyId: e.target.value, clientName: s.clientName || c?.name || "", quotationId: "" }));
              }}
            >
              <option value="">—</option>
              {options.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="CNPJ ou CPF" error={fieldErrors.document} hint="Quando aplicável">
            <Input value={v.document} onChange={(e) => set("document", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Contato">
            <Input value={v.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label="Telefone / WhatsApp">
            <Input value={v.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="E-mail" error={fieldErrors.email}>
            <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Produto" required>
            <Select value={v.product} onChange={(e) => set("product", e.target.value)}>
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {PRODUCT_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantidade de vidas" error={fieldErrors.lives}>
            <Input value={v.lives} onChange={(e) => set("lives", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Valor estimado (R$/mês)" error={fieldErrors.estimatedValue}>
            <Input value={v.estimatedValue} onChange={(e) => set("estimatedValue", e.target.value)} inputMode="decimal" placeholder="0,00" />
          </Field>
          <Field label="Operadora atual">
            <Input value={v.currentInsurer} onChange={(e) => set("currentInsurer", e.target.value)} list="crm-insurers" />
          </Field>
          <Field label="Operadoras cotadas" hint="Separe por vírgula">
            <Input value={v.quotedInsurers} onChange={(e) => set("quotedInsurers", e.target.value)} />
          </Field>
          <datalist id="crm-lost">
            {Object.values(LOST_REASON_LABELS).map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <datalist id="crm-insurers">
            {options.insurers.map((i) => (
              <option key={i.id} value={i.name} />
            ))}
          </datalist>
          <Field label="Corretor responsável">
            <Select value={v.brokerId} onChange={(e) => set("brokerId", e.target.value)}>
              <option value="">(eu)</option>
              {options.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assessor">
            <Input value={v.advisorName} onChange={(e) => set("advisorName", e.target.value)} />
          </Field>
          <Field label="Comercial">
            <Input value={v.salesRepName} onChange={(e) => set("salesRepName", e.target.value)} />
          </Field>
          <Field label="Origem do lead" required>
            <Select value={v.source} onChange={(e) => set("source", e.target.value)}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Campanha">
            <Select value={v.campaignId} onChange={(e) => setV((s) => ({ ...s, campaignId: e.target.value, source: e.target.value ? "campanha" : s.source }))}>
              <option value="">—</option>
              {options.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Etapa">
            <Select value={v.stage} onChange={(e) => set("stage", e.target.value)}>
              {OPPORTUNITY_STAGES.map((s) => (
                <option key={s} value={s}>
                  {OPPORTUNITY_STAGE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cotação +99 vinculada">
            <Select value={v.quotationId} onChange={(e) => set("quotationId", e.target.value)}>
              <option value="">—</option>
              {qs.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </Select>
          </Field>
          {v.stage === "perdido" && (
            <Field label="Motivo da perda" required error={fieldErrors.lostReason} className="md:col-span-2">
              <Input value={v.lostReason} onChange={(e) => set("lostReason", e.target.value)} list="crm-lost" />
            </Field>
          )}
          <Field label="Próximo passo" className="md:col-span-3">
            <Input value={v.nextStep} onChange={(e) => set("nextStep", e.target.value)} />
          </Field>
          <Field label="Próximo follow-up" error={fieldErrors.nextFollowupAt}>
            <Input type="date" value={v.nextFollowupAt} onChange={(e) => set("nextFollowupAt", e.target.value)} />
          </Field>
          <Field label="Observações" className="md:col-span-4" hint={LGPD_FREE_TEXT_WARNING}>
            <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={async () => {
              const { id, ...rest } = v;
              const r = await run(() => saveOpportunityAction(id ?? null, rest));
              if (r.ok) {
                onOpenChange(false);
                onSaved?.(r.data as string);
              }
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
