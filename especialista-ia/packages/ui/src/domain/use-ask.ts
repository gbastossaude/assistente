import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { redactSensitive } from "@especialista/shared";
import { answerOf, fetchQuestion, submitQuestion, type QuestionWithAnswer } from "./api.ts";

export type AskPhase = "idle" | "sending" | "waiting" | "done" | "error";

/**
 * Envia a pergunta e aguarda a resposta do worker: Realtime (instantâneo) + consulta periódica
 * como garantia. Dados pessoais são removidos ANTES de sair do navegador.
 */
export function useAsk(sb: SupabaseClient, channel: "extension" | "admin") {
  const [phase, setPhase] = useState<AskPhase>("idle");
  const [question, setQuestion] = useState<QuestionWithAnswer | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [redactedNotice, setRedactedNotice] = useState(false);
  const rt = useRef<RealtimeChannel | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (rt.current) void sb.removeChannel(rt.current);
    rt.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, [sb]);
  useEffect(() => cleanup, [cleanup]);

  const refresh = useCallback(async (id: string) => {
    const q = await fetchQuestion(sb, id);
    setQuestion(q);
    if (answerOf(q) || ["expirada", "erro"].includes(q.status)) {
      setPhase("done");
      cleanup();
    }
    return q;
  }, [sb, cleanup]);

  const watch = useCallback((id: string) => {
    cleanup();
    rt.current = sb
      .channel(`answer-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "answers", filter: `question_id=eq.${id}` }, () => void refresh(id))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "questions", filter: `id=eq.${id}` }, () => void refresh(id))
      .subscribe();
    let ticks = 0;
    timer.current = setInterval(() => {
      ticks++;
      // 4 s nos primeiros 2 min, depois a cada 15 s (a pergunta continua na fila se o worker estiver offline)
      if (ticks <= 30 || ticks % 4 === 0) void refresh(id).catch(() => {});
    }, 4000);
  }, [sb, cleanup, refresh]);

  const ask = useCallback(async (text: string, context: Record<string, unknown>, parentId?: string | null) => {
    setError(null);
    setPhase("sending");
    setStartedAt(Date.now());
    const red = redactSensitive(text);
    setRedactedNotice(red.hasSensitive);
    try {
      const id = await submitQuestion(sb, red.text, context, channel, parentId);
      setPhase("waiting");
      await refresh(id);
      watch(id);
      return id;
    } catch (err) {
      setError(err);
      setPhase("error");
      return null;
    }
  }, [sb, channel, refresh, watch]);

  const open = useCallback(async (id: string) => {
    setError(null);
    try {
      const q = await refresh(id);
      if (!answerOf(q) && !["expirada", "erro"].includes(q.status)) {
        setPhase("waiting");
        setStartedAt(new Date(q.created_at).getTime());
        watch(id);
      } else setPhase("done");
    } catch (err) {
      setError(err);
      setPhase("error");
    }
  }, [refresh, watch]);

  const reset = useCallback(() => {
    cleanup();
    setPhase("idle");
    setQuestion(null);
    setError(null);
    setRedactedNotice(false);
  }, [cleanup]);

  return { phase, question, answer: question ? answerOf(question) : null, error, startedAt, redactedNotice, ask, open, reset, setQuestion };
}

export function useElapsed(startedAt: number | null, active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
}
