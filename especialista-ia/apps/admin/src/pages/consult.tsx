import { History, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Alert, AnswerCard, AskForm, Button, Card, CardBody, CardHeader, EmptyState, HistoryList, Input, Spinner, WaitingIndicator,
  errorMessage, fetchMyHistory, fetchOperators, fetchServiceStatus, requestHandoff, sendFeedback, toggleFavorite, useAsk, useElapsed,
  type QuestionWithAnswer,
} from "@especialista/ui";
import { toast } from "sonner";
import { PageHeader } from "../components/layout.tsx";
import { useAuth } from "../lib/auth.tsx";
import { sb } from "../lib/supabase.ts";

export function ConsultPage() {
  const { profile } = useAuth();
  const ask = useAsk(sb, "admin");
  const elapsed = useElapsed(ask.startedAt, ask.phase === "waiting" || ask.phase === "sending");
  const [operators, setOperators] = useState<Array<{ id: string; name: string }>>([]);
  const [history, setHistory] = useState<QuestionWithAnswer[] | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [followUp, setFollowUp] = useState("");

  useEffect(() => void fetchOperators(sb).then(setOperators).catch(() => {}), []);
  useEffect(() => void fetchServiceStatus(sb).then((s) => setWorkerOnline(s.worker_online && s.ai_ok)).catch(() => setWorkerOnline(null)), [ask.phase]);
  useEffect(() => {
    if (profile) void fetchMyHistory(sb, profile.id, { limit: 30 }).then(setHistory).catch(() => setHistory([]));
  }, [profile, ask.phase]);

  const q = ask.question;
  const a = ask.answer;
  return (
    <>
      <PageHeader title="Consultar o especialista" description="Respostas baseadas somente nos documentos ativos e vigentes, com fonte." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {(ask.phase === "idle" || ask.phase === "error") && <Card><CardBody><AskForm operators={operators} onSubmit={(t, c) => void ask.ask(t, c as Record<string, unknown>)} /></CardBody></Card>}
          {ask.phase === "error" && <Alert tone="danger">{errorMessage(ask.error)}</Alert>}
          {q && <div className="rounded-lg bg-brand-900/5 px-4 py-3 text-sm"><p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">Pergunta</p>{q.text_redacted}</div>}
          {ask.redactedNotice && <Alert tone="info">Dados pessoais foram removidos da pergunta antes do envio.</Alert>}
          {(ask.phase === "sending" || ask.phase === "waiting") && <WaitingIndicator seconds={elapsed} workerOnline={workerOnline} />}
          {q?.status === "expirada" && <Alert tone="warning">A pergunta expirou sem resposta.</Alert>}
          {a && q && (
            <Card><CardBody>
              <AnswerCard answer={a} isFavorite={q.is_favorite}
                onToggleFavorite={async () => { await toggleFavorite(sb, q.id, !q.is_favorite); ask.setQuestion({ ...q, is_favorite: !q.is_favorite }); }}
                onFeedback={(r, c) => sendFeedback(sb, a.id, r, c)}
                onHandoff={async () => { await requestHandoff(sb, q.id); toast.success("Pedido de atendimento humano registrado."); }} />
            </CardBody></Card>
          )}
          {a?.outcome === "precisa_info" && q && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (followUp.trim()) { void ask.ask(followUp.trim(), {}, q.id); setFollowUp(""); } }}>
              <Input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="Complemente: operadora, estado, modalidade, vidas…" aria-label="Complemento" />
              <Button type="submit">Enviar</Button>
            </form>
          )}
          {(ask.phase === "done" || ask.phase === "waiting") && <Button variant="outline" className="self-start" onClick={ask.reset}><RotateCcw className="h-4 w-4" /> Nova pergunta</Button>}
        </div>
        <Card className="h-fit">
          <CardHeader title="Minhas perguntas recentes" />
          <CardBody className="py-2">
            {history === null ? <Spinner /> : history.length === 0 ? <EmptyState icon={<History className="h-5 w-5" />} title="Nenhuma pergunta ainda" /> :
              <HistoryList items={history} onOpen={(item) => void ask.open(item.id)} />}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
