"use client";
import { AlertTriangle, CheckCircle2, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, YesNo } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { formatCnpj } from "@/lib/domain/cnpj";
import { DOCUMENT_TYPE_LABELS } from "@/lib/domain/constants";
import { formatDateBR } from "@/lib/domain/dates";
import { evaluateSpecialCase, SPECIAL_CASE_KINDS, SPECIAL_CASES, type FieldDef, type SpecialCaseKind } from "@/lib/domain/special-cases";
import { formatMoney } from "@/lib/utils";
import { declareRemainingNoAction, deleteSpecialEntryAction, saveSpecialEntryAction, saveSpecialSummaryAction } from "@/server/actions/quotations";
import { UploadZone } from "@/components/documents/documents-panel";

export interface SummaryRow {
  kind: SpecialCaseKind;
  has: boolean | null;
  quantity: number | null;
  details: Record<string, unknown>;
  notes: string | null;
}
export interface EntryRow {
  id: string;
  kind: SpecialCaseKind;
  data: Record<string, unknown>;
}

function display(f: FieldDef, v: unknown, docs: Map<string, string>, canSensitive: boolean) {
  if (v === null || v === undefined || v === "") return "—";
  if (f.sensitive && !canSensitive) return "•••";
  switch (f.type) {
    case "money":
      return formatMoney(Number(v));
    case "date":
      return formatDateBR(String(v));
    case "boolean":
      return v ? "Sim" : "Não";
    case "cnpj":
      return formatCnpj(String(v));
    case "select":
      return f.options?.find((o) => o.value === v)?.label ?? String(v);
    case "document":
      return docs.get(String(v)) ?? "Documento vinculado";
    default:
      return String(v);
  }
}

function FieldInput({ f, value, onChange, docs, quotationId, maxMb }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; docs: { id: string; fileName: string; docType: string }[]; quotationId: string; maxMb: number }) {
  const s = value === null || value === undefined ? "" : String(value);
  switch (f.type) {
    case "textarea":
      return <Textarea value={s} onChange={(e) => onChange(e.target.value)} rows={2} />;
    case "number":
    case "money":
      return <Input inputMode="decimal" value={s} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <Input type="date" value={s} onChange={(e) => onChange(e.target.value)} />;
    case "boolean":
      return <YesNo name={f.label} value={value as boolean | null} onChange={onChange} />;
    case "select":
      return (
        <Select value={s} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case "document": {
      const options = docs.filter((d) => !f.documentType || d.docType === f.documentType || d.docType === "relatorio_medico" || d.docType === "outros");
      return (
        <div className="space-y-2">
          <Select value={s} onChange={(e) => onChange(e.target.value)}>
            <option value="">— nenhum documento vinculado —</option>
            {options.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fileName}
              </option>
            ))}
          </Select>
          <UploadZone compact quotationId={quotationId} defaultType={f.documentType ?? "outros"} maxMb={maxMb} onUploaded={(d) => onChange(d.id)} />
          <p className="text-[11px] text-muted">Upload como “{DOCUMENT_TYPE_LABELS[f.documentType ?? "outros"]}”.</p>
        </div>
      );
    }
    default:
      return <Input value={s} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function SpecialCasesEditor({
  quotationId,
  summaries,
  entries,
  docs,
  canWrite,
  canSensitive,
  maxMb,
}: {
  quotationId: string;
  summaries: SummaryRow[];
  entries: EntryRow[];
  docs: { id: string; fileName: string; docType: string }[];
  canWrite: boolean;
  canSensitive: boolean;
  maxMb: number;
}) {
  const { run, pending, fieldErrors } = useAction();
  const docNames = new Map(docs.map((d) => [d.id, d.fileName]));
  const [entry, setEntry] = useState<{ id?: string; kind: SpecialCaseKind; data: Record<string, unknown> } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SummaryRow>>(() =>
    Object.fromEntries(SPECIAL_CASE_KINDS.map((k) => [k, summaries.find((s) => s.kind === k) ?? { kind: k, has: null, quantity: null, details: {}, notes: null }])),
  );
  const canEditEntries = canWrite && canSensitive;
  const undeclared = SPECIAL_CASE_KINDS.filter((k) => (summaries.find((s) => s.kind === k)?.has ?? null) === null).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
        <p className="text-sm">
          {undeclared > 0 ? (
            <span className="flex items-center gap-1.5 text-amber-700">
              <AlertTriangle className="size-4" /> {undeclared} situação(ões) ainda não declarada(s) (Sim/Não)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="size-4" /> Todas as situações declaradas
            </span>
          )}
        </p>
        {canWrite && undeclared > 0 && (
          <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => declareRemainingNoAction(quotationId))}>
            Declarar demais como “Não”
          </Button>
        )}
      </div>
      {!canSensitive && (
        <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <Lock className="size-3.5" /> Campos com dados de saúde (CID, relatórios) estão ocultos para o seu perfil.
        </p>
      )}
      {SPECIAL_CASE_KINDS.map((kind) => {
        const def = SPECIAL_CASES[kind];
        const saved = summaries.find((s) => s.kind === kind) ?? { kind, has: null, quantity: null, details: {}, notes: null };
        const d = drafts[kind];
        const own = entries.filter((e) => e.kind === kind);
        const issues = evaluateSpecialCase({ kind, has: saved.has, quantity: saved.quantity }, entries);
        const dirty = d.has !== saved.has || String(d.quantity ?? "") !== String(saved.quantity ?? "") || JSON.stringify(d.details) !== JSON.stringify(saved.details) || (d.notes ?? "") !== (saved.notes ?? "");
        return (
          <div key={kind} className="rounded-lg border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-semibold">{def.label}</p>
                <p className="text-xs text-muted">{def.description}</p>
              </div>
              <YesNo name={def.label} value={d.has} disabled={!canWrite} onChange={(v) => setDrafts((s) => ({ ...s, [kind]: { ...d, has: v } }))} />
              {d.has && (
                <Input
                  className="w-28"
                  type="number"
                  min={0}
                  placeholder="Quantidade"
                  aria-label="Quantidade"
                  disabled={!canWrite}
                  value={d.quantity ?? ""}
                  onChange={(e) => setDrafts((s) => ({ ...s, [kind]: { ...d, quantity: e.target.value === "" ? null : Number(e.target.value) } }))}
                />
              )}
              {issues.length === 0 && saved.has !== null ? <Badge tone="emerald">Tratado</Badge> : saved.has !== null && <Badge tone="red">{issues.length} pendência(s)</Badge>}
            </div>
            {d.has && (
              <div className="space-y-3 border-t border-border px-4 py-3">
                {def.summaryFields.length > 0 && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {def.summaryFields.map((f) => (
                      <Field key={f.key} label={f.label}>
                        <FieldInput f={f} value={d.details[f.key]} onChange={(v) => setDrafts((s) => ({ ...s, [kind]: { ...d, details: { ...d.details, [f.key]: v } } }))} docs={docs} quotationId={quotationId} maxMb={maxMb} />
                      </Field>
                    ))}
                  </div>
                )}
                <Field label="Observação">
                  <Textarea rows={1} value={d.notes ?? ""} disabled={!canWrite} onChange={(e) => setDrafts((s) => ({ ...s, [kind]: { ...d, notes: e.target.value } }))} />
                </Field>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-muted">
                      Registros detalhados ({own.length}
                      {saved.quantity ? ` de ${saved.quantity}` : ""})
                    </p>
                    {canEditEntries && (
                      <Button size="sm" variant="outline" onClick={() => setEntry({ kind, data: {} })}>
                        <Plus /> {def.entryLabel}
                      </Button>
                    )}
                  </div>
                  {own.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted">
                            {def.entryFields.map((f) => (
                              <th key={f.key} className="px-2 py-1 font-medium">
                                {f.label}
                              </th>
                            ))}
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {own.map((e) => (
                            <tr key={e.id} className="border-t border-border">
                              {def.entryFields.map((f) => (
                                <td key={f.key} className="px-2 py-1.5">
                                  {display(f, e.data[f.key], docNames, canSensitive)}
                                </td>
                              ))}
                              <td className="whitespace-nowrap px-2 py-1 text-right">
                                {canEditEntries && (
                                  <>
                                    <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setEntry({ id: e.id, kind, data: e.data })}>
                                      <Pencil />
                                    </Button>
                                    <ConfirmButton title="Remover registro?" onConfirm={() => run(() => deleteSpecialEntryAction(e.id))} size="icon-sm">
                                      <Trash2 />
                                    </ConfirmButton>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {issues.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-red-700">
                    {issues.map((i) => (
                      <li key={i.message}>• {i.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {canWrite && dirty && (
              <div className="flex justify-end border-t border-border px-4 py-2">
                <Button size="sm" loading={pending} onClick={() => run(() => saveSpecialSummaryAction({ quotationId, kind, has: d.has, quantity: d.quantity, details: d.details, notes: d.notes }))}>
                  Salvar {def.label.toLowerCase()}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <Dialog open={!!entry} onOpenChange={(o) => !o && setEntry(null)}>
        {entry && (
          <DialogContent title={`${entry.id ? "Editar" : "Novo"} ${SPECIAL_CASES[entry.kind].entryLabel}`} description={SPECIAL_CASES[entry.kind].label} size="lg">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {SPECIAL_CASES[entry.kind].entryFields.map((f) => (
                <Field key={f.key} label={f.label} required={f.required} error={fieldErrors[f.key]} className={f.type === "textarea" || f.type === "document" ? "md:col-span-2" : undefined}>
                  <FieldInput f={f} value={entry.data[f.key]} onChange={(v) => setEntry((s) => (s ? { ...s, data: { ...s.data, [f.key]: v } } : s))} docs={docs} quotationId={quotationId} maxMb={maxMb} />
                </Field>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEntry(null)}>
                Cancelar
              </Button>
              <Button
                loading={pending}
                onClick={async () => {
                  const r = await run(() => saveSpecialEntryAction({ id: entry.id ?? null, quotationId, kind: entry.kind, data: entry.data }));
                  if (r.ok) setEntry(null);
                }}
              >
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
