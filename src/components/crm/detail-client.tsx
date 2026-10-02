"use client";
import { ArrowRightLeft, Pencil, ShieldOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { LGPD_FREE_TEXT_WARNING } from "@/lib/domain/commercial";
import { INTERACTION_TYPE_LABELS, MANUAL_INTERACTION_TYPES } from "@/lib/domain/constants";
import { anonymizeOpportunityAction, deleteOpportunityAction, registerOpportunityInteractionAction, updateOpportunityFollowupAction } from "@/server/actions/crm";
import { toForm, type OpportunityView } from "./board";
import { OpportunityDialog, type CrmOptions } from "./opportunity-dialog";
import { StageDialog } from "./stage-dialog";

export function OpportunityHeaderActions({ o, options, canWrite, canLgpd }: { o: OpportunityView; options: CrmOptions; canWrite: boolean; canLgpd: boolean }) {
  const router = useRouter();
  const { run } = useAction();
  const [edit, setEdit] = useState(false);
  const [stage, setStage] = useState(false);
  return (
    <>
      {canWrite && (
        <>
          <Button size="sm" onClick={() => setStage(true)}>
            <ArrowRightLeft /> Mover etapa
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
            <Pencil /> Editar
          </Button>
          <ConfirmButton
            title="Excluir oportunidade?"
            description="A exclusão é lógica e fica registrada na auditoria."
            triggerVariant="outline"
            onConfirm={async () => {
              const r = await run(() => deleteOpportunityAction(o.id), { refresh: false });
              if (r.ok) router.push("/crm");
            }}
          >
            <Trash2 /> Excluir
          </ConfirmButton>
        </>
      )}
      {canLgpd && (
        <ConfirmButton
          title="Anonimizar dados pessoais (LGPD)?"
          description="Remove nome, documento, contato, telefone, e-mail, observações e o texto das interações. Etapa, produto e valores são mantidos para os relatórios. Não pode ser desfeito."
          confirmLabel="Anonimizar"
          triggerVariant="outline"
          onConfirm={() => run(() => anonymizeOpportunityAction(o.id))}
        >
          <ShieldOff /> Anonimizar
        </ConfirmButton>
      )}
      <OpportunityDialog open={edit} onOpenChange={setEdit} value={edit ? toForm(o) : null} options={options} />
      <StageDialog open={stage} onOpenChange={setStage} opportunityId={o.id} clientName={o.clientName} current={o.stage} />
    </>
  );
}

export function FollowupEditor({ id, nextStep, nextFollowupAt }: { id: string; nextStep: string | null; nextFollowupAt: string | null }) {
  const { run, pending, fieldErrors } = useAction();
  const [v, setV] = useState({ nextStep: nextStep ?? "", nextFollowupAt: nextFollowupAt ?? "" });
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <Field label="Próximo passo">
        <Input value={v.nextStep} onChange={(e) => setV({ ...v, nextStep: e.target.value })} />
      </Field>
      <Field label="Data do follow-up" error={fieldErrors.nextFollowupAt}>
        <Input type="date" value={v.nextFollowupAt} onChange={(e) => setV({ ...v, nextFollowupAt: e.target.value })} />
      </Field>
      <Button loading={pending} onClick={() => run(() => updateOpportunityFollowupAction({ id, ...v }))}>
        Salvar
      </Button>
    </div>
  );
}

export function OpportunityInteractionForm({ opportunityId }: { opportunityId: string }) {
  const { run, pending, fieldErrors } = useAction();
  const blank = { type: "whatsapp", description: "", nextAction: "", nextActionAt: "" };
  const [v, setV] = useState(blank);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <Field label="Tipo">
          <Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
            {MANUAL_INTERACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {INTERACTION_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="O que aconteceu" required error={fieldErrors.description} className="sm:col-span-3" hint={LGPD_FREE_TEXT_WARNING}>
          <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={2} />
        </Field>
        <Field label="Próxima ação" className="sm:col-span-2">
          <Input value={v.nextAction} onChange={(e) => setV({ ...v, nextAction: e.target.value })} placeholder="Atualiza o próximo passo" />
        </Field>
        <Field label="Quando">
          <Input type="date" value={v.nextActionAt} onChange={(e) => setV({ ...v, nextActionAt: e.target.value })} />
        </Field>
        <div className="flex items-end">
          <Button
            className="w-full"
            loading={pending}
            onClick={async () => {
              const r = await run(() => registerOpportunityInteractionAction({ opportunityId, ...v }));
              if (r.ok) setV(blank);
            }}
          >
            Registrar
          </Button>
        </div>
      </div>
    </div>
  );
}
