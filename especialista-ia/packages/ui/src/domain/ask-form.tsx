import { ChevronDown, SendHorizontal, SlidersHorizontal } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CONTRACT_TYPE_LABELS, CONTRACT_TYPES, QUESTION_MAX_LENGTH, TOPICS, UFS } from "@especialista/shared";
import { Button, Input, Select, Textarea } from "../components/primitives.tsx";
import { cn } from "../lib.ts";

export interface AskContext {
  operator_id?: string;
  uf?: string;
  contract_type?: string;
  lives?: number;
}

/** Sugestões por categoria (atalhos de escrita — não são respostas). */
export const CATEGORY_PROMPTS: Array<{ topic: string; prompt: string }> = [
  { topic: "elegibilidade", prompt: "Quais são as regras de elegibilidade da operadora " },
  { topic: "vidas", prompt: "Qual a quantidade mínima de vidas para contratar " },
  { topic: "mei_cnpj", prompt: "A operadora aceita MEI? Qual o tempo mínimo de CNPJ " },
  { topic: "carencias", prompt: "Quais as carências e há redução/aproveitamento de carência na " },
  { topic: "portabilidade", prompt: "Como funciona a portabilidade de carências para a " },
  { topic: "cpt_dlp", prompt: "Como é aplicada a CPT para doenças preexistentes na " },
  { topic: "coparticipacao", prompt: "Quais os percentuais de coparticipação do plano " },
  { topic: "rede", prompt: "Quais hospitais e laboratórios da rede credenciada " },
  { topic: "documentacao", prompt: "Quais documentos são necessários para contratar " },
  { topic: "reajuste", prompt: "Como funciona o reajuste do contrato " },
  { topic: "cancelamento", prompt: "Qual o aviso prévio para cancelamento na " },
  { topic: "comissionamento", prompt: "Qual a regra de comissionamento da " },
];

export function AskForm({ operators, onSubmit, busy, compact, initialText = "" }: {
  operators: Array<{ id: string; name: string }>;
  onSubmit: (text: string, context: AskContext) => void;
  busy?: boolean;
  compact?: boolean;
  initialText?: string;
}) {
  const [text, setText] = useState(initialText);
  const [showContext, setShowContext] = useState(false);
  const [ctx, setCtx] = useState<AskContext>({});
  const tooShort = text.trim().length < 3;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (tooShort || busy) return;
    const clean: AskContext = {};
    if (ctx.operator_id) clean.operator_id = ctx.operator_id;
    if (ctx.uf) clean.uf = ctx.uf;
    if (ctx.contract_type) clean.contract_type = ctx.contract_type;
    if (ctx.lives && ctx.lives > 0) clean.lives = ctx.lives;
    onSubmit(text.trim(), clean);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label="Fazer uma pergunta">
      <div className="relative">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(); }}
          placeholder="Ex.: A Bradesco aceita empresa PME com 3 vidas em SP?"
          maxLength={QUESTION_MAX_LENGTH}
          aria-label="Sua pergunta"
          className={cn("pr-12", compact ? "min-h-[84px]" : "min-h-[100px]")}
        />
        <Button type="submit" size="icon" variant="accent" className="absolute bottom-2 right-2" loading={busy} disabled={tooShort} aria-label="Enviar pergunta">
          {!busy && <SendHorizontal className="h-4 w-4" />}
        </Button>
      </div>
      <div className="flex items-center justify-between text-[11px] text-ink-500">
        <button type="button" className="inline-flex items-center gap-1 font-medium text-ink-700 hover:text-ink-900 cursor-pointer" onClick={() => setShowContext((v) => !v)} aria-expanded={showContext}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Detalhes (opcional)
          <ChevronDown className={cn("h-3 w-3 transition-transform", showContext && "rotate-180")} />
        </button>
        <span>Ctrl+Enter para enviar · não inclua CPF ou dados de saúde</span>
      </div>
      {showContext && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-ink-200 bg-ink-50 p-2">
          <Select aria-label="Operadora" value={ctx.operator_id ?? ""} onChange={(e) => setCtx({ ...ctx, operator_id: e.target.value || undefined })}>
            <option value="">Operadora</option>
            {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
          <Select aria-label="Estado" value={ctx.uf ?? ""} onChange={(e) => setCtx({ ...ctx, uf: e.target.value || undefined })}>
            <option value="">Estado (UF)</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
          <Select aria-label="Modalidade" value={ctx.contract_type ?? ""} onChange={(e) => setCtx({ ...ctx, contract_type: e.target.value || undefined })}>
            <option value="">Modalidade</option>
            {CONTRACT_TYPES.map((c) => <option key={c} value={c}>{CONTRACT_TYPE_LABELS[c]}</option>)}
          </Select>
          <Input aria-label="Número de vidas" type="number" min={1} max={99999} placeholder="Nº de vidas" value={ctx.lives ?? ""} onChange={(e) => setCtx({ ...ctx, lives: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5" aria-label="Categorias de dúvidas">
        {CATEGORY_PROMPTS.slice(0, compact ? 6 : 12).map((c) => (
          <button
            key={c.topic}
            type="button"
            onClick={() => setText(c.prompt)}
            className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11px] text-ink-700 hover:border-accent-500 hover:text-accent-600 cursor-pointer"
          >
            {TOPICS.find((t) => t.id === c.topic)?.label}
          </button>
        ))}
      </div>
    </form>
  );
}
