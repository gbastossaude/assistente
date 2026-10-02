"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input, Select, Textarea, YesNo } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { ACCOMMODATIONS, ACCOMMODATION_LABELS, COVERAGE_AREAS, COVERAGE_AREA_LABELS, MODALITIES, MODALITY_LABELS } from "@/lib/domain/constants";
import { updateStep2Action } from "@/server/actions/quotations";

export interface ConditionsValues {
  modality: string | null;
  takeover: boolean | null;
  fgts100: boolean | null;
  dependents100: boolean | null;
  paymentMethod: string | null;
  remission: string | null;
  adjustmentIndex: string | null;
  breakEven: number | null;
  upgradeDowngradeRules: string | null;
  commissionPct: number | null;
  designChange: boolean | null;
  designChangeDetails: string | null;
  accommodation: string | null;
  coverageArea: string | null;
  holdersCount: number | null;
  dependentsCount: number | null;
  desiredStartDate: string | null;
  clientDeadline: string | null;
}

export function ConditionsForm({ quotationId, initial, canWrite, nextHref, submitLabel = "Salvar" }: { quotationId: string; initial: ConditionsValues; canWrite: boolean; nextHref?: string; submitLabel?: string }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction();
  const [v, setV] = useState({
    ...initial,
    modality: initial.modality ?? "",
    paymentMethod: initial.paymentMethod ?? "",
    remission: initial.remission ?? "",
    adjustmentIndex: initial.adjustmentIndex ?? "",
    breakEven: initial.breakEven?.toString() ?? "",
    upgradeDowngradeRules: initial.upgradeDowngradeRules ?? "",
    commissionPct: initial.commissionPct?.toString() ?? "",
    designChangeDetails: initial.designChangeDetails ?? "",
    accommodation: initial.accommodation ?? "",
    coverageArea: initial.coverageArea ?? "",
    holdersCount: initial.holdersCount?.toString() ?? "",
    dependentsCount: initial.dependentsCount?.toString() ?? "",
    desiredStartDate: initial.desiredStartDate ?? "",
    clientDeadline: initial.clientDeadline ?? "",
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Perfil do plano e condições do contrato</CardTitle>
          <CardDescription>Dados exigidos pelo checklist; o preenchimento atualiza os itens automaticamente.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canWrite} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted md:col-span-3">Perfil do plano desejado</p>
          <Field label="Acomodação" error={fieldErrors.accommodation}>
            <Select value={v.accommodation} onChange={(e) => set("accommodation", e.target.value)}>
              <option value="">—</option>
              {ACCOMMODATIONS.map((a) => (
                <option key={a} value={a}>
                  {ACCOMMODATION_LABELS[a]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Abrangência" error={fieldErrors.coverageArea}>
            <Select value={v.coverageArea} onChange={(e) => set("coverageArea", e.target.value)}>
              <option value="">—</option>
              {COVERAGE_AREAS.map((a) => (
                <option key={a} value={a}>
                  {COVERAGE_AREA_LABELS[a]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Titulares" error={fieldErrors.holdersCount} hint="Se ainda sem base de vidas">
              <Input inputMode="numeric" value={v.holdersCount} onChange={(e) => set("holdersCount", e.target.value)} />
            </Field>
            <Field label="Dependentes" error={fieldErrors.dependentsCount}>
              <Input inputMode="numeric" value={v.dependentsCount} onChange={(e) => set("dependentsCount", e.target.value)} />
            </Field>
          </div>
          <Field label="Data desejada para início" error={fieldErrors.desiredStartDate}>
            <Input type="date" value={v.desiredStartDate} onChange={(e) => set("desiredStartDate", e.target.value)} />
          </Field>
          <Field label="Prazo esperado pelo cliente" error={fieldErrors.clientDeadline}>
            <Input type="date" value={v.clientDeadline} onChange={(e) => set("clientDeadline", e.target.value)} />
          </Field>
          <div />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted md:col-span-3">Contratação</p>
          <Field label="Tipo/modalidade de contratação" error={fieldErrors.modality}>
            <Select value={v.modality} onChange={(e) => set("modality", e.target.value)}>
              <option value="">—</option>
              {MODALITIES.map((m) => (
                <option key={m} value={m}>
                  {MODALITY_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          {v.modality === "opcional" && (
            <Field label="Haverá encampação/tombamento das vidas?">
              <YesNo name="encampação" value={v.takeover} onChange={(x) => set("takeover", x)} />
            </Field>
          )}
          <Field label="A cotação considera 100% do FGTS?" hint={v.modality === "compulsorio" ? "Compulsório: estudo com 100% do FGTS do(s) CNPJ(s) cotado(s)" : undefined}>
            <YesNo name="FGTS" value={v.fgts100} onChange={(x) => set("fgts100", x)} />
          </Field>
          {v.modality === "compulsorio" && (
            <Field label="Considera 100% dos dependentes legais?">
              <YesNo name="dependentes" value={v.dependents100} onChange={(x) => set("dependents100", x)} />
            </Field>
          )}
          <Field label="Forma de pagamento">
            <Input value={v.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} placeholder="Boleto, débito…" />
          </Field>
          <Field label="Remissão">
            <Input value={v.remission} onChange={(e) => set("remission", e.target.value)} />
          </Field>
          <Field label="Índice de reajuste">
            <Input value={v.adjustmentIndex} onChange={(e) => set("adjustmentIndex", e.target.value)} placeholder="VCMH, IPCA, técnico…" />
          </Field>
          <Field label="Break-even (%)" error={fieldErrors.breakEven}>
            <Input inputMode="decimal" value={v.breakEven} onChange={(e) => set("breakEven", e.target.value)} />
          </Field>
          <Field label="Comissão a ser considerada (%)" error={fieldErrors.commissionPct}>
            <Input inputMode="decimal" value={v.commissionPct} onChange={(e) => set("commissionPct", e.target.value)} />
          </Field>
          <Field label="Regras de upgrade/downgrade" className="md:col-span-3">
            <Textarea value={v.upgradeDowngradeRules} onChange={(e) => set("upgradeDowngradeRules", e.target.value)} rows={2} />
          </Field>
          <Field label="Alteração do desenho atual?">
            <YesNo name="alteração de desenho" value={v.designChange} onChange={(x) => set("designChange", x)} />
          </Field>
          {v.designChange && (
            <Field label="Detalhamento da alteração" required error={fieldErrors.designChangeDetails} className="md:col-span-2">
              <Textarea value={v.designChangeDetails} onChange={(e) => set("designChangeDetails", e.target.value)} rows={2} />
            </Field>
          )}
        </fieldset>
        {canWrite && (
          <div className="mt-4 flex justify-end">
            <Button
              loading={pending}
              onClick={async () => {
                const r = await run(() => updateStep2Action(quotationId, v));
                if (r.ok && nextHref) router.push(nextHref);
              }}
            >
              {submitLabel}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
