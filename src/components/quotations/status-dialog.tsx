"use client";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { QUOTATION_STATUS_LABELS, type QuotationStatus } from "@/lib/domain/constants";
import { PIPELINE_PHASES, requiresLostReason, requiresReadiness } from "@/lib/domain/pipeline";
import { changeStatusAction } from "@/server/actions/quotations";

export function StatusDialog({
  open,
  onOpenChange,
  quotationId,
  current,
  initialTarget,
  pendingRequired,
  canOverride,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quotationId: string;
  current: QuotationStatus;
  initialTarget?: QuotationStatus;
  pendingRequired: number;
  canOverride: boolean;
}) {
  const { run, pending, fieldErrors } = useAction();
  const [to, setTo] = useState<QuotationStatus>(initialTarget ?? current);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState("");
  const [lost, setLost] = useState("");
  useEffect(() => {
    if (open) {
      setTo(initialTarget ?? current);
      setNote("");
      setOverride("");
      setLost("");
    }
  }, [open, initialTarget, current]);
  const needsOverride = requiresReadiness(current, to) && pendingRequired > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Alterar status da cotação" description={`Status atual: ${QUOTATION_STATUS_LABELS[current]}. Voltar status é permitido — todo movimento fica no histórico.`}>
        <div className="flex flex-col gap-3">
          <Field label="Novo status">
            <Select value={to} onChange={(e) => setTo(e.target.value as QuotationStatus)}>
              {PIPELINE_PHASES.map((ph) => (
                <optgroup key={ph.key} label={ph.label}>
                  {ph.statuses.map((s) => (
                    <option key={s} value={s} disabled={s === current}>
                      {QUOTATION_STATUS_LABELS[s]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          {needsOverride && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="size-4" /> {pendingRequired} item(ns) obrigatório(s) pendente(s)
              </p>
              <p className="mt-1 text-xs">
                A cotação não pode ir ao mercado com pendência obrigatória. {canOverride ? "Para prosseguir, registre uma justificativa de override (fica na auditoria)." : "Somente Head/Administrador pode liberar com override."}
              </p>
              {canOverride && (
                <Field label="Justificativa do override" error={fieldErrors.overrideReason} className="mt-2">
                  <Textarea value={override} onChange={(e) => setOverride(e.target.value)} rows={2} placeholder="Mínimo de 15 caracteres" />
                </Field>
              )}
            </div>
          )}
          {requiresLostReason(to) && (
            <Field label="Motivo da perda" required error={fieldErrors.lostReason}>
              <Textarea value={lost} onChange={(e) => setLost(e.target.value)} rows={2} placeholder="Preço, rede, timing, relacionamento…" />
            </Field>
          )}
          <Field label="Observação (opcional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            disabled={to === current || (needsOverride && !canOverride)}
            onClick={async () => {
              const r = await run(() => changeStatusAction({ quotationId, toStatus: to, note, overrideReason: needsOverride ? override : null, lostReason: lost }));
              if (r.ok) onOpenChange(false);
            }}
          >
            Confirmar mudança
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
