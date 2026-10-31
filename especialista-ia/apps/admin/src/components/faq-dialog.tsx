import { useState } from "react";
import { toast } from "sonner";
import { CONTRACT_TYPE_LABELS, CONTRACT_TYPES, RULE_NATURE_LABELS, RULE_NATURES, TOPICS, UFS } from "@especialista/shared";
import { Alert, Button, Dialog, Field, Input, Select, Textarea, errorMessage } from "@especialista/ui";
import { useAuth } from "../lib/auth.tsx";
import { useCatalog } from "../lib/catalog.ts";
import { sb, unwrap } from "../lib/supabase.ts";

export interface FaqRow {
  id?: string; question: string; answer: string; operator_id: string | null; topic: string | null; contract_types: string[]; states: string[];
  valid_until: string | null; status: "rascunho" | "publicado" | "arquivado"; rule_nature: string; source_note: string | null; source_document_id: string | null;
  origin_question_id?: string | null; embedding_model?: string | null; updated_at?: string;
}

export function emptyFaq(partial: Partial<FaqRow> = {}): FaqRow {
  return { question: "", answer: "", operator_id: null, topic: null, contract_types: [], states: [], valid_until: null, status: "rascunho", rule_nature: "regra_contratacao", source_note: null, source_document_id: null, ...partial };
}

/** FAQ oficial: resposta aprovada por um editor, com fonte. Publicada, participa da busca com prioridade. */
export function FaqDialog({ initial, onClose, onSaved }: { initial: FaqRow; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const catalog = useCatalog();
  const [f, setF] = useState<FaqRow>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<FaqRow>) => setF((x) => ({ ...x, ...p }));

  const save = async (status: FaqRow["status"]) => {
    if (f.question.trim().length < 5 || f.answer.trim().length < 2) return setError("Preencha a pergunta e a resposta oficial.");
    if (status === "publicado" && !f.source_note?.trim() && !f.source_document_id) return setError("Para publicar, informe a fonte (documento ou referência) da resposta oficial.");
    setBusy(true);
    try {
      const row = {
        question: f.question.trim(), answer: f.answer.trim(), operator_id: f.operator_id, topic: f.topic, contract_types: f.contract_types, states: f.states,
        valid_until: f.valid_until || null, status, rule_nature: f.rule_nature, source_note: f.source_note?.trim() || null, source_document_id: f.source_document_id,
        origin_question_id: f.origin_question_id ?? null,
        ...(status === "publicado" ? { approved_by: profile?.id, approved_at: new Date().toISOString() } : {}),
      };
      if (f.id) unwrap(await sb.from("knowledge_faq").update(row).eq("id", f.id).select("id"));
      else unwrap(await sb.from("knowledge_faq").insert({ ...row, created_by: profile?.id }).select("id"));
      toast.success(status === "publicado" ? "FAQ publicada — será indexada pelo worker." : "FAQ salva.");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={f.id ? "Editar FAQ oficial" : "Nova FAQ oficial"} wide
      description="Use somente informações confirmadas em documento vigente. Respostas publicadas têm prioridade nas consultas."
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        {f.id && f.status === "publicado" && <Button variant="outline" onClick={() => save("arquivado")} loading={busy}>Arquivar</Button>}
        <Button variant="outline" onClick={() => save("rascunho")} loading={busy}>Salvar rascunho</Button>
        <Button onClick={() => save("publicado")} loading={busy}>Publicar</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Pergunta *" className="md:col-span-2"><Input value={f.question} onChange={(e) => set({ question: e.target.value })} maxLength={1000} /></Field>
        <Field label="Resposta oficial *" className="md:col-span-2"><Textarea value={f.answer} onChange={(e) => set({ answer: e.target.value })} className="min-h-[120px]" maxLength={6000} /></Field>
        <Field label="Operadora">
          <Select value={f.operator_id ?? ""} onChange={(e) => set({ operator_id: e.target.value || null })}>
            <option value="">Geral</option>{catalog.data?.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </Field>
        <Field label="Tema">
          <Select value={f.topic ?? ""} onChange={(e) => set({ topic: e.target.value || null })}>
            <option value="">—</option>{TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Natureza">
          <Select value={f.rule_nature} onChange={(e) => set({ rule_nature: e.target.value })}>{RULE_NATURES.map((r) => <option key={r} value={r}>{RULE_NATURE_LABELS[r]}</option>)}</Select>
        </Field>
        <Field label="Válida até"><Input type="date" value={f.valid_until ?? ""} onChange={(e) => set({ valid_until: e.target.value || null })} /></Field>
        <Field label="Modalidades (Ctrl/Cmd para várias)">
          <Select multiple className="h-28" value={f.contract_types} onChange={(e) => set({ contract_types: [...e.target.selectedOptions].map((o) => o.value) })}>
            {CONTRACT_TYPES.map((c) => <option key={c} value={c}>{CONTRACT_TYPE_LABELS[c]}</option>)}
          </Select>
        </Field>
        <Field label="Estados (vazio = sem restrição)">
          <Select multiple className="h-28" value={f.states} onChange={(e) => set({ states: [...e.target.selectedOptions].map((o) => o.value) })}>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="Fonte da resposta *" hint="Ex.: Manual PME Amil 2026, p. 12" className="md:col-span-2"><Input value={f.source_note ?? ""} onChange={(e) => set({ source_note: e.target.value })} /></Field>
        {error && <Alert tone="danger" className="md:col-span-2">{error}</Alert>}
      </div>
    </Dialog>
  );
}
