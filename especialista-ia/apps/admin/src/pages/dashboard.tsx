import { AlertTriangle, Cpu, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { topicLabel } from "@especialista/shared";
import { Alert, Badge, Card, CardBody, CardHeader, Select, Spinner, StatusDot, errorMessage, timeAgo } from "@especialista/ui";
import { DailyBars, Kpi, RankList, UsageMeter } from "../components/charts.tsx";
import { PageHeader } from "../components/layout.tsx";
import { sb, unwrap } from "../lib/supabase.ts";
import { useData } from "../lib/use-data.ts";

interface Dashboard {
  totals: { questions: number; answered: number; no_source: number; needs_info: number; conflicts: number; refused: number; errors: number; expired: number; pending: number; avg_latency_ms: number; by_channel: Record<string, number> };
  per_day: Array<{ day: string; total: number; no_source: number }>;
  top_topics: Array<{ topic: string; total: number }>;
  top_operators: Array<{ operator: string; total: number }>;
  feedback: { useful: number; incorrect: number; incorrect_open: number };
  jobs: { pending: number; processing: number; failed_period: number; expired_period: number };
  documents: { active: number; review: number; errors: number; processing: number; expired: number; expiring: number };
  open_conflicts: number;
  open_handoffs: number;
  workers: Array<{ worker_id: string; machine_name: string; status: string; ollama_ok: boolean; chat_model: string; embedding_model: string; last_seen_at: string; online: boolean; jobs_done: number; last_error: string | null }>;
  whatsapp: null | { cap: number; daily_cap: number; enabled: boolean; mode: string; reserved: number; sent: number; delivered: number; failed: number; blocked: number; today_reserved: number; alerts: Array<{ threshold: number; count: number }> };
}

export function DashboardPage() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useData(async () => unwrap(await sb.rpc("get_dashboard", { p_days: days })) as Dashboard, [days]);
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

  return (
    <>
      <PageHeader title="Dashboard" description="Uso do especialista, qualidade das respostas e saúde dos serviços."
        actions={<Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período" className="w-40">
          <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option>
        </Select>} />
      {error ? <Alert tone="danger">{errorMessage(error)}</Alert> : loading && !data ? <Spinner /> : data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Consultas" value={data.totals.questions} hint={`Extensão ${data.totals.by_channel.extension} · WhatsApp ${data.totals.by_channel.whatsapp}`} />
            <Kpi label="Respondidas com fonte" value={pct(data.totals.answered, data.totals.questions)} tone="success" hint={`${data.totals.answered} respostas`} />
            <Kpi label="Sem fonte confiável" value={data.totals.no_source} tone={data.totals.no_source ? "warning" : "default"} hint="Lacunas na base" />
            <Kpi label="Erros de processamento" value={data.totals.errors + data.jobs.failed_period} tone={data.totals.errors ? "danger" : "default"} hint={`${data.totals.expired} expiradas`} />
            <Kpi label="Tempo médio" value={data.totals.avg_latency_ms ? `${(data.totals.avg_latency_ms / 1000).toFixed(1)} s` : "—"} hint="Da pergunta à resposta" />
            <Kpi label="Na fila agora" value={data.jobs.pending + data.jobs.processing} hint={`${data.jobs.processing} em processamento`} />
          </div>

          {(data.open_conflicts > 0 || data.documents.expired > 0 || data.feedback.incorrect_open > 0 || data.open_handoffs > 0 || data.documents.review > 0) && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {data.open_conflicts > 0 && <Alert tone="danger" title={`${data.open_conflicts} conflito(s) de regras em aberto`}><Link className="underline" to="/regras?aba=conflitos">Revisar conflitos</Link></Alert>}
              {data.documents.expired > 0 && <Alert tone="warning" title={`${data.documents.expired} documento(s) ativo(s) vencido(s)`}><Link className="underline" to="/documentos?vencidos=1">Atualizar documentos</Link></Alert>}
              {data.documents.review > 0 && <Alert tone="warning" title={`${data.documents.review} documento(s) aguardando revisão`}><Link className="underline" to="/documentos?status=revisao">Revisar extração</Link></Alert>}
              {data.feedback.incorrect_open > 0 && <Alert tone="warning" title={`${data.feedback.incorrect_open} feedback(s) negativo(s) sem análise`}><Link className="underline" to="/perguntas?aba=feedback">Analisar</Link></Alert>}
              {data.open_handoffs > 0 && <Alert tone="info" title={`${data.open_handoffs} pedido(s) de atendimento humano`}><Link className="underline" to="/atendimentos">Atender</Link></Alert>}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2"><CardHeader title="Consultas por dia" /><CardBody><DailyBars data={data.per_day} /></CardBody></Card>
            <Card>
              <CardHeader title="Worker local (IA)" description="Computador que executa o Ollama" />
              <CardBody className="flex flex-col gap-3">
                {data.workers.length === 0 && <Alert tone="warning">Nenhum worker conectado ainda. Instale e inicie o worker no computador com Ollama.</Alert>}
                {data.workers.map((w) => (
                  <div key={w.worker_id} className="rounded-lg border border-ink-200 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-medium text-ink-900"><Cpu className="h-3.5 w-3.5" />{w.machine_name || w.worker_id}</span>
                      <StatusDot online={w.online} label={w.online ? "online" : "offline"} />
                    </div>
                    <p className="mt-1 text-ink-500">Visto {timeAgo(w.last_seen_at)} · {w.jobs_done} tarefas nesta sessão</p>
                    <p className="text-ink-500">Modelos: {w.chat_model ?? "—"} / {w.embedding_model ?? "—"}</p>
                    <p className="mt-1">{w.ollama_ok ? <Badge tone="success">Ollama OK</Badge> : <Badge tone="danger">Ollama indisponível</Badge>}</p>
                    {w.last_error && !w.ollama_ok && <p className="mt-1 text-danger-600">{w.last_error}</p>}
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card><CardHeader title="Principais dúvidas" /><CardBody><RankList items={data.top_topics.map((t) => ({ label: topicLabel(t.topic), total: t.total }))} /></CardBody></Card>
            <Card><CardHeader title="Operadoras mais consultadas" /><CardBody><RankList items={data.top_operators.map((t) => ({ label: t.operator, total: t.total }))} /></CardBody></Card>
            <Card>
              <CardHeader title="Base de conhecimento" />
              <CardBody className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-ink-500">Ativos</p><p className="text-lg font-semibold">{data.documents.active}</p></div>
                <div><p className="text-xs text-ink-500">Vencem em breve</p><p className="text-lg font-semibold text-warning-600">{data.documents.expiring}</p></div>
                <div><p className="text-xs text-ink-500">Indexando</p><p className="text-lg font-semibold">{data.documents.processing}</p></div>
                <div><p className="text-xs text-ink-500">Com erro</p><p className="text-lg font-semibold text-danger-600">{data.documents.errors}</p></div>
                <div><p className="text-xs text-ink-500">Feedback útil</p><p className="text-lg font-semibold text-success-600">{data.feedback.useful}</p></div>
                <div><p className="text-xs text-ink-500">Feedback incorreto</p><p className="text-lg font-semibold text-danger-600">{data.feedback.incorrect}</p></div>
              </CardBody>
            </Card>
          </div>

          {data.whatsapp && (
            <Card>
              <CardHeader title="Utilização do WhatsApp (mês atual)" description="Mensagens enviadas pelo bot — teto preventivo abaixo da franquia gratuita de mensagens de serviço."
                actions={<><Badge tone={data.whatsapp.enabled ? "success" : "neutral"}><MessageCircle className="h-3 w-3" />{data.whatsapp.enabled ? "Envio ativo" : "Envio desativado"}</Badge><Badge tone="info">Modo {data.whatsapp.mode}</Badge></>} />
              <CardBody className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-4">
                  <UsageMeter used={data.whatsapp.reserved} cap={data.whatsapp.cap} label="Mensagens no mês (teto do aplicativo)" />
                  <UsageMeter used={data.whatsapp.today_reserved} cap={data.whatsapp.daily_cap} label="Mensagens hoje (teto diário)" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-ink-500">Enviadas</p><p className="font-semibold">{data.whatsapp.sent}</p></div>
                  <div><p className="text-xs text-ink-500">Entregues</p><p className="font-semibold">{data.whatsapp.delivered}</p></div>
                  <div><p className="text-xs text-ink-500">Falhas</p><p className="font-semibold text-danger-600">{data.whatsapp.failed}</p></div>
                  <div><p className="text-xs text-ink-500">Bloqueadas pelo teto</p><p className="font-semibold text-warning-600">{data.whatsapp.blocked}</p></div>
                </div>
                {data.whatsapp.alerts.length > 0 && (
                  <Alert tone="warning" className="md:col-span-2">
                    <span className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Alertas de consumo</span>
                    {data.whatsapp.alerts.map((a) => <span key={a.threshold} className="block">Atingido {Math.round(a.threshold * 100)}% do teto ({a.count} mensagens).</span>)}
                  </Alert>
                )}
                <p className="text-xs text-ink-500 md:col-span-2">Atenção: outros sistemas que usem o mesmo número também consomem a franquia da Meta e não aparecem nesta contagem.</p>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
