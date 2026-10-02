"use client";
import { Bot, Check, Copy, Send, Sparkles, Trash2, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Textarea } from "@/components/ui/inputs";
import { useAction } from "@/components/ui/use-action";
import { formatDateTimeBR } from "@/lib/domain/dates";
import { askAssistantAction, clearAssistantAction, decideAssistantAction } from "@/server/actions/assistant";

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  actionIds: string[];
  mode?: string;
}
export interface ChatAction {
  id: string;
  description: string;
  status: string;
  items: { title: string; dueDate: string }[];
}

const SUGGESTIONS = [
  "Resumo do dia",
  "Mostrar vendas com follow-up atrasado",
  "Criar mensagem de follow-up para o cliente Construtora Alfa",
  "Resumir a última reunião",
  "Criar roteiro para reunião com o cliente Construtora Alfa",
  "Gerar mensagem pedindo documentos para o cliente Construtora Alfa",
  "Criar campanha para planos empresariais este mês",
  "Relatório de vendas do mês",
  "Resumo semanal",
  "Resuma a cotação da empresa Horizonte",
  "O que está pendente na cotação da empresa Sol Nascente?",
  "Quais renovações vencem nos próximos 90 dias?",
  "Quais operadoras não responderam há mais de 5 dias?",
  "Mostre as cotações acima de 200 vidas em negociação",
  "Gere uma mensagem de WhatsApp para a empresa Sol Nascente pedindo as pendências",
  "Crie tarefas para todas as operadoras que não responderam",
  "Prepare um resumo executivo para minha reunião de hoje",
  "Como funciona a carência no plano PME?",
  "Me dê um gancho para objeção de preço",
];

/** Renderização segura de texto simples com **negrito** e marcadores (sem HTML arbitrário). */
function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm">
      {text.split("\n").map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*|_\([^)]*\)_)/g).map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : p.startsWith("_(") ? <em key={j} className="text-muted">{p.slice(1, -1)}</em> : <span key={j}>{p}</span>,
        );
        const bullet = /^\s*[•\-*]\s/.test(line);
        return line.trim() === "" ? <div key={i} className="h-1" /> : <p key={i} className={bullet ? "pl-3 -indent-3" : undefined} style={{ marginLeft: `${(line.match(/^\s*/)?.[0].length ?? 0) * 4}px` }}>{parts}</p>;
      })}
    </div>
  );
}

export function AssistantChat({ initial, actions, mode, canAct }: { initial: ChatMessage[]; actions: ChatAction[]; mode: "claude" | "local"; canAct: boolean }) {
  const { run, pending } = useAction();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [initial.length, optimistic]);

  const send = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setOptimistic(q);
    setText("");
    await run(() => askAssistantAction(q), { success: false });
    setOptimistic(null);
    setBusy(false);
  };
  const actionById = new Map(actions.map((a) => [a.id, a]));

  return (
    <div className="flex h-[calc(100vh-9.5rem)] flex-col rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <p className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-primary" />
          Modo: {mode === "claude" ? <Badge tone="emerald">Claude (ferramentas controladas)</Badge> : <Badge tone="slate">Local — roteador de intenções</Badge>}
        </p>
        {initial.length > 0 && (
          <ConfirmButton title="Limpar conversa?" description="O histórico de mensagens será apagado. As ações executadas continuam registradas na auditoria." onConfirm={() => run(() => clearAssistantAction())} triggerVariant="ghost" size="sm">
            <Trash2 /> Limpar
          </ConfirmButton>
        )}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {initial.length === 0 && !optimistic && (
          <div className="mx-auto max-w-2xl py-6 text-center">
            <Bot className="mx-auto size-10 text-muted" />
            <p className="mt-2 font-medium">Pergunte sobre suas cotações, pendências, renovações e operadoras</p>
            <p className="text-sm text-muted">O assistente usa apenas dados do sistema, não envia mensagens e pede confirmação antes de qualquer alteração.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-2">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {initial.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-primary text-white" : "bg-surface-2 text-primary"}`}>
              {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
            </span>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 ${m.role === "user" ? "bg-primary/10" : "border border-border bg-surface"}`}>
              <RichText text={m.content} />
              {m.actionIds.map((id) => {
                const a = actionById.get(id);
                if (!a) return null;
                return (
                  <div key={id} className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:bg-amber-950">
                    <p className="font-medium">{a.description}</p>
                    <ul className="mt-1 list-disc pl-4">
                      {a.items.map((it, k) => (
                        <li key={k}>{it.title}</li>
                      ))}
                    </ul>
                    {a.status === "proposta" ? (
                      canAct ? (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="success" loading={pending} onClick={() => run(() => decideAssistantAction(id, true))}>
                            <Check /> Confirmar e executar
                          </Button>
                          <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => decideAssistantAction(id, false))}>
                            <X /> Recusar
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-1 text-muted">Seu perfil não pode confirmar ações.</p>
                      )
                    ) : (
                      <Badge tone={a.status === "executada" ? "emerald" : "zinc"} className="mt-2">
                        {a.status === "executada" ? "Executada" : "Recusada"}
                      </Badge>
                    )}
                  </div>
                );
              })}
              <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                {formatDateTimeBR(m.createdAt)}
                {m.role === "assistant" && (
                  <button
                    type="button"
                    aria-label="Copiar resposta"
                    className="hover:text-foreground"
                    onClick={async () => {
                      await navigator.clipboard.writeText(m.content);
                      toast.success("Copiado");
                    }}
                  >
                    <Copy className="size-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {optimistic && (
          <>
            <div className="flex flex-row-reverse gap-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-white">
                <User className="size-4" />
              </span>
              <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm">{optimistic}</div>
            </div>
            <div className="flex gap-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-primary">
                <Bot className="size-4" />
              </span>
              <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted">
                <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Consultando os dados…
              </div>
            </div>
          </>
        )}
        <div ref={end} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          rows={2}
          placeholder="Ex.: Quais documentos ainda faltam na cotação da empresa Horizonte?"
          aria-label="Pergunta ao assistente"
          className="resize-none"
        />
        <Button type="submit" loading={busy} disabled={!text.trim()}>
          <Send /> Enviar
        </Button>
      </form>
    </div>
  );
}
