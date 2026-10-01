"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea, YesNo } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { COPAY_PROCEDURES, COPAY_PROCEDURE_LABELS } from "@/lib/domain/constants";
import { updateStep3Action } from "@/server/actions/quotations";

export interface ContributionValues {
  employeeContributionType: string | null;
  employeeContributionValue: number | null;
  dependentContributionType: string | null;
  dependentContributionValue: number | null;
  hasCopay: boolean | null;
  copayPct: number | null;
  copayProcedures: string[];
  copayOther: string | null;
  copayNotes: string | null;
}

export function ContributionForm({ quotationId, initial, copayMax, canWrite, nextHref, submitLabel = "Salvar" }: { quotationId: string; initial: ContributionValues; copayMax: number; canWrite: boolean; nextHref?: string; submitLabel?: string }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction();
  const [v, setV] = useState({
    employeeContributionType: initial.employeeContributionType ?? "percentual",
    employeeContributionValue: initial.employeeContributionValue?.toString() ?? "",
    dependentContributionType: initial.dependentContributionType ?? "percentual",
    dependentContributionValue: initial.dependentContributionValue?.toString() ?? "",
    hasCopay: initial.hasCopay,
    copayPct: initial.copayPct?.toString() ?? "",
    copayProcedures: initial.copayProcedures,
    copayOther: initial.copayOther ?? "",
    copayNotes: initial.copayNotes ?? "",
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const pct = Number(String(v.copayPct).replace(",", "."));
  const over = v.hasCopay && Number.isFinite(pct) && pct > copayMax;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Contribuição e coparticipação</CardTitle>
          <CardDescription>Contribuição em folha (0% a 100% ou valor) e modelo de coparticipação. Limite configurado: {copayMax}%.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canWrite} className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="Contribuição do funcionário — tipo">
            <Select value={v.employeeContributionType} onChange={(e) => set("employeeContributionType", e.target.value)}>
              <option value="percentual">Percentual (%)</option>
              <option value="valor">Valor (R$)</option>
            </Select>
          </Field>
          <Field label={v.employeeContributionType === "percentual" ? "Contribuição do funcionário (%)" : "Contribuição do funcionário (R$)"} error={fieldErrors.employeeContributionValue}>
            <Input inputMode="decimal" value={v.employeeContributionValue} onChange={(e) => set("employeeContributionValue", e.target.value)} />
          </Field>
          <Field label="Contribuição do dependente — tipo">
            <Select value={v.dependentContributionType} onChange={(e) => set("dependentContributionType", e.target.value)}>
              <option value="percentual">Percentual (%)</option>
              <option value="valor">Valor (R$)</option>
            </Select>
          </Field>
          <Field label={v.dependentContributionType === "percentual" ? "Contribuição do dependente (%)" : "Contribuição do dependente (R$)"} error={fieldErrors.dependentContributionValue}>
            <Input inputMode="decimal" value={v.dependentContributionValue} onChange={(e) => set("dependentContributionValue", e.target.value)} />
          </Field>
          <Field label="Há coparticipação?" className="md:col-span-1">
            <YesNo name="coparticipação" value={v.hasCopay} onChange={(x) => set("hasCopay", x)} />
          </Field>
          {v.hasCopay && (
            <>
              <Field label="Percentual de coparticipação (%)" required error={over ? `Acima do limite de ${copayMax}%` : fieldErrors.copayPct}>
                <Input inputMode="decimal" value={v.copayPct} onChange={(e) => set("copayPct", e.target.value)} aria-invalid={over || undefined} />
              </Field>
              <div className="md:col-span-4">
                <p className="mb-1 text-xs font-medium text-muted">Procedimentos com coparticipação</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {COPAY_PROCEDURES.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={v.copayProcedures.includes(p)}
                        onChange={(e) => set("copayProcedures", e.target.checked ? [...v.copayProcedures, p] : v.copayProcedures.filter((x) => x !== p))}
                      />
                      {COPAY_PROCEDURE_LABELS[p]}
                    </label>
                  ))}
                </div>
                {fieldErrors.copayProcedures && <p className="mt-1 text-xs text-red-600">{fieldErrors.copayProcedures[0]}</p>}
              </div>
              {v.copayProcedures.includes("outros") && (
                <Field label="Outros procedimentos" required error={fieldErrors.copayOther} className="md:col-span-2">
                  <Input value={v.copayOther} onChange={(e) => set("copayOther", e.target.value)} />
                </Field>
              )}
            </>
          )}
          <Field label="Observações e regras específicas" className="md:col-span-4">
            <Textarea value={v.copayNotes} onChange={(e) => set("copayNotes", e.target.value)} rows={2} placeholder="Tetos por evento, isenções, regras de contribuição…" />
          </Field>
        </fieldset>
        {canWrite && (
          <div className="mt-4 flex justify-end">
            <Button
              loading={pending}
              disabled={!!over}
              onClick={async () => {
                const r = await run(() => updateStep3Action(quotationId, v));
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
