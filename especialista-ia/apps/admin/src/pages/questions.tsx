import { Lightbulb, MessageSquareWarning, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CHANNEL_LABELS, OUTCOME_LABELS, normalizeText, topicLabel, type AnswerOutcome, type Channel } from "@especialista/shared";
import {
  Alert, AnswerCard, Badge, Button, Card, Dialog, EmptyState, Input, Select, Spinner, Tabs, TabsContent, TabsList, TabsTrigger,
  answerOf, errorMessage, formatDateTime, type QuestionWithAnswer,
} from "@especialista/ui";
import { FaqDialog, emptyFaq, type FaqRow } from "../components/faq-dialog.tsx";
import { PageHeader, Table, Td } from "../components/layout.tsx";
import { sb, unwrap } from "../lib/supabase.ts";
import { useData } from "../lib/use-data.ts";

type Q = QuestionWithAnswer & { profile: { full_name: string } | null; operator: { name: string } | null };
const SELECT = "*, answers(*, answer_sources(*)), profile:profiles(full_name), operator:operators(name)";
const TONE: Record<string, "success" | "warning" | "info" | "danger" | "neutral"> = {
  respondida: "success", sem_fonte: "warning", precisa_info: "info", conflito: "danger", erro: "danger", recusada: "neutral", pendente: "neutral", processando: "info", expirada: "neutral",
};

export function QuestionsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("aba") ?? "recentes";
  const [faq, setFaq] = useState<FaqRow | null>(null);
  return (
    <>
      <PageHeader title="Perguntas" description="Consultas recebidas, lacunas da base de conhecimento e feedback da equipe." />
      <Tabs value={tab} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="recentes">Recentes</TabsTrigger>
          <TabsTrigger value="sem-resposta">Sem resposta</TabsTrigger>
          <TabsTrigger value="feedback">Feedback negativo</TabsTrigger>
          <TabsTrigger value="sugestoes">Sugestões de FAQ</TabsTrigger>
        </TabsList>
        <TabsContent value="recentes"><QuestionList onCreateFaq={setFaq} /></TabsContent>
        <TabsContent value="sem-resposta"><QuestionList unanswered onCreateFaq={setFaq} /></TabsContent>
        <TabsContent value="feedback"><FeedbackList onCreateFaq={setFaq} /></TabsContent>
        <TabsContent value="sugestoes"><Suggestions onCreateFaq={setFaq} /></TabsContent>
      </Tabs>
      {faq && <FaqDialog initial={faq} onClose={() => setFaq(null)} onSaved={() => setFaq(null)} />}
    </>
  );
}

function QuestionList({ unanswered, onCreateFaq }: { unanswered?: boolean; onCreateFaq: (f: FaqRow) => void }) {
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Q | null>(null);
  const list = useData(async () => {
    let q = sb.from("questions").select(SELECT).order("created_at", { ascending: false }).limit(200);
    if (unanswered) q = q.in("status", ["sem_fonte", "erro", "expirada", "conflito"]);
    else if (status) q = q.eq("status", status);
    if (channel) q = q.eq("channel", channel);
    if (search.trim()) q = q.ilike("text_redacted", `%${search.trim().replace(/[%_]/g, "")}%`);
    return unwrap(await q) as unknown as Q[];
  }, [unanswered, channel, status, search]);

  return (
    <Card>
      <div className="flex flex-wrap gap-2 border-b border-ink-100 p-4">
        <Input className="max-w-xs" placeholder="Buscar no texto" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar" />
        <Select className="w-44" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Canal">
          <option value="">Todos os canais</option>{Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {!unanswered && (
          <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Todos os status</option>{Object.entries(OUTCOME_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}
        <Button variant="outline" onClick={() => void list.reload()}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </div>
      {list.error ? <div className="p-4"><Alert tone="danger">{errorMessage(list.error)}</Alert></div> : !list.data ? <div className="p-6"><Spinner /></div> : (
        <Table head={["Data", "Canal", "Pergunta", "Tema", "Status", "Tempo"]} empty={list.data.length === 0 && <EmptyState title={unanswered ? "Nenhuma pergunta sem resposta" : "Nenhuma pergunta"} />}>
          {list.data.map((q) => {
            const st = answerOf(q)?.outcome ?? q.status;
            return (
              <tr key={q.id} className="cursor-pointer hover:bg-ink-50" onClick={() => setOpen(q)}>
                <Td className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(q.created_at)}</Td>
                <Td className="text-xs">{CHANNEL_LABELS[q.channel as Channel]}<span className="block text-ink-500">{q.profile?.full_name}</span></Td>
                <Td className="max-w-md"><span className="line-clamp-2">{q.text_redacted}</span></Td>
                <Td className="text-xs">{q.topic ? topicLabel(q.topic) : "—"}{q.operator ? <span className="block text-ink-500">{q.operator.name}</span> : null}</Td>
                <Td><Badge tone={TONE[st]}>{OUTCOME_LABELS[st as AnswerOutcome] ?? st}</Badge>{q.injection_flag && <Badge tone="danger" className="ml-1">Injeção</Badge>}</Td>
                <Td className="text-xs tabular-nums text-ink-500">{q.latency_ms ? `${(q.latency_ms / 1000).toFixed(1)} s` : "—"}</Td>
              </tr>
            );
          })}
        </Table>
      )}
      {open && <QuestionDialog q={open} onClose={() => setOpen(null)} onCreateFaq={onCreateFaq} onChanged={() => void list.reload()} />}
    </Card>
  );
}

function QuestionDialog({ q, onClose, onCreateFaq, onChanged }: { q: Q; onClose: () => void; onCreateFaq: (f: FaqRow) => void; onChanged: () => void }) {
  const a = answerOf(q);
  const retry = async () => {
    try { unwrap(await sb.rpc("retry_question", { p_question_id: q.id })); toast.success("Pergunta enviada para reprocessamento."); onChanged(); onClose(); }
    catch (err) { toast.error(errorMessage(err)); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Detalhe da consulta" description={`${CHANNEL_LABELS[q.channel as Channel]} · ${formatDateTime(q.created_at)} · ${q.profile?.full_name ?? ""}`} wide
      footer={<>
        <Button variant="outline" onClick={retry}><RefreshCw className="h-4 w-4" /> Reprocessar</Button>
        <Button onClick={() => { onClose(); onCreateFaq(emptyFaq({ question: q.text_redacted, operator_id: q.operator_id, topic: q.topic, origin_question_id: q.id })); }}><Lightbulb className="h-4 w-4" /> Criar FAQ oficial</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-ink-50 p-3 text-sm">{q.text_redacted}</div>
        {q.pii_redacted && <Alert tone="info">Dados pessoais foram removidos desta pergunta antes do armazenamento.</Alert>}
        {Object.keys(q.detected ?? {}).length > 0 && <p className="text-xs text-ink-500">Identificado: {Object.entries(q.detected).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : String(v)}`).join(" · ")}</p>}
        {a ? <AnswerCard answer={a} /> : <Alert tone="info">Ainda sem resposta (status: {OUTCOME_LABELS[q.status as AnswerOutcome] ?? q.status}).</Alert>}
        {a?.model && <p className="text-xs text-ink-500">Modelo: {a.model} · {a.total_ms ? `${(a.total_ms / 1000).toFixed(1)} s` : ""}</p>}
      </div>
    </Dialog>
  );
}

type Fb = { id: string; rating: string; comment: string | null; status: string; created_at: string; question: { id: string; text_redacted: string; operator_id: string | null; topic: string | null } | null; profile: { full_name: string } | null };

function FeedbackList({ onCreateFaq }: { onCreateFaq: (f: FaqRow) => void }) {
  const [status, setStatus] = useState("novo");
  const list = useData(async () => {
    let q = sb.from("feedback").select("id, rating, comment, status, created_at, question:questions(id, text_redacted, operator_id, topic), profile:profiles!feedback_profile_id_fkey(full_name)")
      .eq("rating", "incorreta").order("created_at", { ascending: false }).limit(200);
    if (status) q = q.eq("status", status);
    return unwrap(await q) as unknown as Fb[];
  }, [status]);
  const mark = async (id: string, s: string) => {
    try { unwrap(await sb.from("feedback").update({ status: s, reviewed_at: new Date().toISOString() }).eq("id", id).select("id")); void list.reload(); }
    catch (err) { toast.error(errorMessage(err)); }
  };
  return (
    <Card>
      <div className="flex gap-2 border-b border-ink-100 p-4">
        <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
          <option value="novo">Novos</option><option value="analisado">Analisados</option><option value="faq_criada">FAQ criada</option><option value="descartado">Descartados</option><option value="">Todos</option>
        </Select>
      </div>
      {!list.data ? <div className="p-6"><Spinner /></div> : (
        <Table head={["Data", "Pergunta", "Comentário", "Por", ""]} empty={list.data.length === 0 && <EmptyState icon={<MessageSquareWarning className="h-5 w-5" />} title="Nenhum feedback negativo" />}>
          {list.data.map((f) => (
            <tr key={f.id}>
              <Td className="whitespace-nowrap text-xs text-ink-500">{formatDateTime(f.created_at)}</Td>
              <Td className="max-w-sm text-sm">{f.question?.text_redacted}</Td>
              <Td className="max-w-xs text-xs">{f.comment || "—"}</Td>
              <Td className="text-xs">{f.profile?.full_name}</Td>
              <Td>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => { void mark(f.id, "faq_criada"); onCreateFaq(emptyFaq({ question: f.question?.text_redacted ?? "", operator_id: f.question?.operator_id ?? null, topic: f.question?.topic ?? null, origin_question_id: f.question?.id })); }}>Criar FAQ</Button>
                  <Button size="sm" variant="ghost" onClick={() => mark(f.id, "analisado")}>Analisado</Button>
                  <Button size="sm" variant="ghost" onClick={() => mark(f.id, "descartado")}>Descartar</Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function Suggestions({ onCreateFaq }: { onCreateFaq: (f: FaqRow) => void }) {
  const list = useData(async () => unwrap(await sb.from("questions").select("id, text_redacted, operator_id, topic, status, created_at")
    .in("status", ["sem_fonte", "conflito"]).gte("created_at", new Date(Date.now() - 90 * 86400_000).toISOString()).limit(1000)), []);
  const groups = useMemo(() => {
    const m = new Map<string, { text: string; count: number; operator_id: string | null; topic: string | null; id: string }>();
    for (const q of (list.data ?? []) as Array<{ id: string; text_redacted: string; operator_id: string | null; topic: string | null }>) {
      const key = normalizeText(q.text_redacted).replace(/[^a-z0-9 ]/g, "").split(" ").filter((w) => w.length > 3).sort().slice(0, 8).join(" ");
      const g = m.get(key) ?? { text: q.text_redacted, count: 0, operator_id: q.operator_id, topic: q.topic, id: q.id };
      g.count++;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 50);
  }, [list.data]);
  return (
    <Card>
      <p className="border-b border-ink-100 p-4 text-sm text-ink-500">Perguntas sem fonte confiável nos últimos 90 dias, agrupadas por semelhança. Cadastre o documento correspondente ou uma FAQ oficial com fonte.</p>
      {!list.data ? <div className="p-6"><Spinner /></div> : (
        <Table head={["Ocorrências", "Pergunta (exemplo)", "Tema", ""]} empty={groups.length === 0 && <EmptyState icon={<Lightbulb className="h-5 w-5" />} title="Nenhuma lacuna recente" />}>
          {groups.map((g) => (
            <tr key={g.id}>
              <Td><Badge tone={g.count > 2 ? "warning" : "neutral"}>{g.count}×</Badge></Td>
              <Td className="max-w-lg">{g.text}</Td>
              <Td className="text-xs">{g.topic ? topicLabel(g.topic) : "—"}</Td>
              <Td><Button size="sm" variant="outline" onClick={() => onCreateFaq(emptyFaq({ question: g.text, operator_id: g.operator_id, topic: g.topic, origin_question_id: g.id }))}>Criar FAQ</Button></Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
