"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { INTERACTION_TYPE_LABELS, MANUAL_INTERACTION_TYPES } from "@/lib/domain/constants";
import { registerInteractionAction } from "@/server/actions/companies";

export function InteractionForm({ companyId, quotationId }: { companyId?: string | null; quotationId?: string | null }) {
  const { run, pending, fieldErrors } = useAction();
  const blank = { type: "nota", occurredAt: "", description: "", nextAction: "", nextActionAt: "", createTask: true };
  const [v, setV] = useState(blank);
  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-2/40 p-3 md:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(() => registerInteractionAction({ ...v, companyId, quotationId }));
        if (r.ok) setV(blank);
      }}
    >
      <Field label="Tipo">
        <Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
          {MANUAL_INTERACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {INTERACTION_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Data/hora (vazio = agora)" error={fieldErrors.occurredAt}>
        <Input type="datetime-local" value={v.occurredAt} onChange={(e) => setV({ ...v, occurredAt: e.target.value })} />
      </Field>
      <Field label="Próxima ação" error={fieldErrors.nextAction}>
        <Input value={v.nextAction} onChange={(e) => setV({ ...v, nextAction: e.target.value })} placeholder="Ex.: cobrar sinistralidade" />
      </Field>
      <Field label="Data da próxima ação" error={fieldErrors.nextActionAt}>
        <Input type="date" value={v.nextActionAt} onChange={(e) => setV({ ...v, nextActionAt: e.target.value })} />
      </Field>
      <Field label="Descrição" required error={fieldErrors.description} className="md:col-span-4">
        <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={2} placeholder="O que foi tratado?" />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-4">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={v.createTask} onChange={(e) => setV({ ...v, createTask: e.target.checked })} /> Criar tarefa para a próxima ação
        </label>
        <Button type="submit" size="sm" loading={pending} disabled={!v.description.trim()}>
          Registrar interação
        </Button>
      </div>
    </form>
  );
}
