"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { LOST_REASON_LABELS, OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABELS, type OpportunityStage } from "@/lib/domain/commercial";
import { changeOpportunityStageAction } from "@/server/actions/crm";

/** Mudança de etapa (inclusive voltar). Perder exige motivo; pode-se já agendar o próximo follow-up. */
export function StageDialog({ open, onOpenChange, opportunityId, clientName, current, initialTarget }: { open: boolean; onOpenChange: (o: boolean) => void; opportunityId: string; clientName: string; current: OpportunityStage; initialTarget?: OpportunityStage }) {
  const { run, pending, fieldErrors } = useAction();
  const [stage, setStage] = useState<OpportunityStage>(initialTarget ?? current);
  const [note, setNote] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [followup, setFollowup] = useState("");
  useEffect(() => {
    if (open) {
      setStage(initialTarget ?? current);
      setNote("");
      setLostReason("");
      setFollowup("");
    }
  }, [open, initialTarget, current]);
  const back = OPPORTUNITY_STAGES.indexOf(stage) < OPPORTUNITY_STAGES.indexOf(current) && stage !== "perdido";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Mover oportunidade" description={`${clientName} · atual: ${OPPORTUNITY_STAGE_LABELS[current]}`} size="sm">
        <div className="space-y-3">
          <Field label="Nova etapa">
            <Select value={stage} onChange={(e) => setStage(e.target.value as OpportunityStage)}>
              {OPPORTUNITY_STAGES.map((s) => (
                <option key={s} value={s}>
                  {OPPORTUNITY_STAGE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          {back && <p className="text-xs text-amber-700 dark:text-amber-300">Retorno de etapa — fica registrado no histórico.</p>}
          {stage === "perdido" && (
            <>
              <Field label="Motivo da perda" required error={fieldErrors.lostReason}>
                <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} list="stage-lost" autoFocus />
              </Field>
              <datalist id="stage-lost">
                {Object.values(LOST_REASON_LABELS).map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </>
          )}
          {stage !== "perdido" && stage !== "fechado" && stage !== "implantado" && (
            <Field label="Próximo follow-up (opcional)">
              <Input type="date" value={followup} onChange={(e) => setFollowup(e.target.value)} />
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
            disabled={stage === current}
            onClick={async () => {
              const r = await run(() => changeOpportunityStageAction({ id: opportunityId, stage, note, lostReason, nextFollowupAt: followup }));
              if (r.ok) onOpenChange(false);
            }}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
