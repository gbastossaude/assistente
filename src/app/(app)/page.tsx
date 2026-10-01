import { AlarmClock, ArrowRight, Building2, CalendarClock, CheckSquare, ClipboardList, FileWarning, Hourglass, Inbox, RefreshCw, Siren, Star } from "lucide-react";
import Link from "next/link";
import { Timeline } from "@/components/crm/timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { PriorityBadge } from "@/components/ui/status";
import { formatDateBR, relativeDays } from "@/lib/domain/dates";
import { formatNumber, sp } from "@/lib/utils";
import { maybeRunSweep } from "@/server/automation/engine";
import { requireUser } from "@/server/auth";
import { logTechnicalError } from "@/server/errors";
import { getMyDay } from "@/server/services/dashboard";

export const metadata = { title: "Meu Dia" };

const KIND_LABEL = { tarefa: "Tarefa", cotacao: "Cotação", followup: "Follow-up", pendencia: "Pendência", renovacao: "Renovação", proposta: "Proposta" } as const;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ escopo?: string }> }) {
  const user = await requireUser();
  const scope = sp((await searchParams).escopo) === "equipe" ? "equipe" : "meu";
  // Rotina de alertas/automações (no máximo 1x por hora); falha não impede o painel.
  await maybeRunSweep().catch((e) => logTechnicalError("sweep", e));
  const d = await getMyDay(scope === "meu" ? user.id : null);
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={`O que precisa de ação agora · ${formatDateBR(d.today)}`}
        actions={
          <div className="flex rounded-md border border-border bg-surface p-0.5 text-xs">
            <Link href="/" className={`rounded px-3 py-1 ${scope === "meu" ? "bg-primary text-white" : "text-muted"}`}>
              Minha carteira
            </Link>
            <Link href="/?escopo=equipe" className={`rounded px-3 py-1 ${scope === "equipe" ? "bg-primary text-white" : "text-muted"}`}>
              Equipe
            </Link>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Tarefas para hoje" value={d.tasksToday.length} href="/tarefas?view=hoje" icon={<CheckSquare />} tone={d.tasksToday.length ? "blue" : "default"} />
        <StatCard label="Tarefas atrasadas" value={d.tasksOverdue.length} href="/tarefas?view=atrasadas" icon={<AlarmClock />} tone={d.tasksOverdue.length ? "red" : "default"} />
        <StatCard label="Follow-ups para hoje" value={d.followupsToday.length} href="#followups" icon={<RefreshCw />} tone={d.followupsToday.length ? "amber" : "default"} />
        <StatCard label="Pendência de cliente" value={d.clientPending.length} href="/pendencias?categoria=cliente" icon={<Inbox />} />
        <StatCard label="Aguardando operadora" value={d.awaitingInsurer.length} href="/cotacoes?view=tabela" icon={<Hourglass />} />
        <StatCard label="Propostas para analisar" value={d.proposalsToReview.length} href="/comparativos" icon={<ClipboardList />} tone={d.proposalsToReview.length ? "green" : "default"} />
        <StatCard label="Renovações em 30 dias" value={d.renewalBuckets.d30.length} href="/renovacoes?janela=30" icon={<CalendarClock />} tone={d.renewalBuckets.d30.length ? "red" : "default"} />
        <StatCard label="Renovações em 60 dias" value={d.renewalBuckets.d60.length} href="/renovacoes?janela=60" icon={<CalendarClock />} tone={d.renewalBuckets.d60.length ? "amber" : "default"} />
        <StatCard label="Renovações em 90 dias" value={d.renewalBuckets.d90.length} href="/renovacoes?janela=90" icon={<CalendarClock />} />
        <StatCard label="Grandes contas em andamento" value={d.largeAccounts.length} href="/grandes-contas" icon={<Star />} hint={`${formatNumber(d.largeAccounts.reduce((a, r) => a + r.q.estimatedLives, 0))} vidas`} />
        <StatCard label={`Sem movimentação há ${d.staleDays}+ dias`} value={d.stale.length} href="#paradas" icon={<FileWarning />} tone={d.stale.length ? "amber" : "default"} />
        <StatCard label="Processos críticos" value={d.critical.length} href="#criticos" icon={<Siren />} tone={d.critical.length ? "red" : "default"} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Prioridades do dia</CardTitle>
            <span className="text-xs text-muted">ordenado por prazo × criticidade × impacto (vidas)</span>
          </CardHeader>
          <CardContent className="p-0">
            {d.priorities.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">Nada urgente para hoje. 👏</p>
            ) : (
              <ol className="divide-y divide-border">
                {d.priorities.map((p, i) => (
                  <li key={p.id}>
                    <Link href={p.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                      <span className="w-5 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.title}</p>
                        <p className="truncate text-xs text-muted">
                          {KIND_LABEL[p.kind]}
                          {p.subtitle ? ` · ${p.subtitle}` : ""}
                        </p>
                      </div>
                      {p.overdueDays > 0 ? <Badge tone="red">{p.overdueDays}d atrasado</Badge> : p.dueDate ? <span className="text-xs text-muted">{relativeDays(p.dueDate, d.today)}</span> : null}
                      <PriorityBadge value={p.priority} />
                      <ArrowRight className="size-4 text-muted" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Últimas movimentações</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[520px] overflow-y-auto">
            <Timeline rows={d.timeline} showContext />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ListCard id="followups" title="Follow-ups com operadoras (hoje ou vencidos)" empty="Nenhum follow-up vencido">
          {d.followupsToday.map((r) => (
            <Row key={r.qi.id} href={`/cotacoes/${r.q.id}?tab=operadoras`} title={`${r.insurerName} — ${r.companyName}`} sub={`${r.q.code} · previsto ${formatDateBR(r.qi.nextFollowupAt)}`} />
          ))}
        </ListCard>
        <ListCard id="criticos" title="Processos críticos" empty="Nenhum processo crítico">
          {d.critical.map((r) => (
            <Row key={r.q.id} href={`/cotacoes/${r.q.id}`} title={`${r.companyName} (${r.q.code})`} sub={`${r.completeness}% completa · ${r.criticalPendencies} pendência(s) crítica(s) · alvo ${formatDateBR(r.q.targetDate)}`} />
          ))}
        </ListCard>
        <ListCard id="propostas" title="Propostas recebidas para analisar" empty="Nenhuma proposta aguardando análise">
          {d.proposalsToReview.map((r) => (
            <Row key={r.q.id} href={`/cotacoes/${r.q.id}?tab=comparativo`} title={r.companyName} sub={`${r.proposalsToReview} proposta(s) · ${r.q.code}`} />
          ))}
        </ListCard>
        <ListCard id="cliente" title="Cotações com pendência de cliente" empty="Nenhuma">
          {d.clientPending.map((r) => (
            <Row key={r.q.id} href={`/cotacoes/${r.q.id}?tab=checklist`} title={r.companyName} sub={`${r.completeness}% completa · ${r.q.code}`} />
          ))}
        </ListCard>
        <ListCard id="paradas" title={`Sem movimentação há ${d.staleDays}+ dias`} empty="Todos os processos com movimentação recente">
          {d.stale.map((r) => (
            <Row key={r.q.id} href={`/cotacoes/${r.q.id}`} title={r.companyName} sub={`${r.idleDays} dias parado · ${r.q.code}`} />
          ))}
        </ListCard>
        <ListCard id="renovacoes" title="Renovações nos próximos 90 dias" empty="Nenhuma renovação próxima">
          {[...d.renewalBuckets.d30, ...d.renewalBuckets.d60, ...d.renewalBuckets.d90].map((r) => (
            <Row key={r.r.id} href={`/renovacoes?id=${r.r.id}`} title={r.companyName} sub={`Aniversário ${formatDateBR(r.r.anniversaryDate)} (${relativeDays(r.r.anniversaryDate, d.today)}) · ${r.r.insurerName ?? ""}`} />
          ))}
        </ListCard>
      </div>
      <p className="mt-4 flex items-center gap-1 text-xs text-muted">
        <Building2 className="size-3" /> {d.openPendencies} pendência(s) aberta(s) {scope === "meu" ? "sob sua responsabilidade" : "na equipe"} ·{" "}
        <Link className="text-primary hover:underline" href="/pendencias">
          Central de pendências
        </Link>
      </p>
    </>
  );
}

function ListCard({ id, title, empty, children }: { id: string; title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <Card id={id}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="text-xs text-muted">{children.length}</span>
      </CardHeader>
      <CardContent className="max-h-72 overflow-y-auto p-0">{children.length ? <ul className="divide-y divide-border">{children}</ul> : <p className="px-4 py-6 text-center text-xs text-muted">{empty}</p>}</CardContent>
    </Card>
  );
}

function Row({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <li>
      <Link href={href} className="block px-4 py-2 hover:bg-surface-2/60">
        <p className="truncate text-sm">{title}</p>
        <p className="truncate text-xs text-muted">{sub}</p>
      </Link>
    </li>
  );
}
