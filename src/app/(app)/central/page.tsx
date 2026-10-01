import Link from "next/link";
import { TaskList } from "@/components/tasks/task-list";
import { toTaskViews } from "@/components/tasks/to-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { CompletenessBar, QuotationStatusBadge } from "@/components/ui/status";
import { can } from "@/lib/auth/permissions";
import { EVENT_TYPE_LABELS } from "@/lib/domain/constants";
import { addDays, formatDateBR, formatDateTimeBR, todayISO } from "@/lib/domain/dates";
import { requireUser } from "@/server/auth";
import { listAgenda, localToUtc } from "@/server/services/calendar";
import { listNotifications } from "@/server/services/notifications";
import { taskOptions } from "@/server/services/options";
import { listPendencies } from "@/server/services/pendencies";
import { listQuotations } from "@/server/services/quotations";
import { listTasks } from "@/server/services/tasks";

export const metadata = { title: "Minha Central" };

export default async function MyCentralPage() {
  const user = await requireUser();
  const today = todayISO();
  const [tasks, quotes, pend, notifs, agenda, opts] = await Promise.all([
    listTasks({ ownerId: user.id, view: "abertas", to: addDays(today, 7) }),
    listQuotations({ ownerId: user.id }),
    listPendencies({ ownerId: user.id }),
    listNotifications(user.id, 15),
    listAgenda(localToUtc(today, "00:00"), localToUtc(addDays(today, 7), "00:00"), { ownerId: user.id }),
    taskOptions(),
  ]);
  return (
    <>
      <PageHeader title="Minha Central" description="Tudo sob sua responsabilidade: tarefas, cotações, pendências, agenda e alertas" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Minhas tarefas (7 dias)" value={tasks.length} href="/tarefas?resp=eu" />
        <StatCard label="Minhas cotações em andamento" value={quotes.length} href="/cotacoes?view=tabela" />
        <StatCard label="Minhas pendências abertas" value={pend.length} href="/pendencias?resp=eu" tone={pend.length ? "amber" : "default"} />
        <StatCard label="Compromissos (7 dias)" value={agenda.events.length} href="/agenda" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Minhas tarefas (atrasadas e próximos 7 dias)</CardTitle>
              <Link href="/tarefas" className="text-xs text-primary hover:underline">
                Todas
              </Link>
            </CardHeader>
            <CardContent>
              <TaskList tasks={toTaskViews(tasks)} options={opts} canWrite={can(user.role, "task:write")} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Próximos compromissos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {agenda.events.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted">Sem compromissos</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {agenda.events.map(({ e, companyName }) => (
                    <li key={e.id} className="px-4 py-2">
                      <p className="font-medium">{e.title}</p>
                      <p className="text-xs text-muted">
                        {e.allDay ? formatDateBR(e.startsAt) : formatDateTimeBR(e.startsAt)} · {EVENT_TYPE_LABELS[e.type]}
                        {companyName ? ` · ${companyName}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Alertas recentes</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border text-sm">
                {notifs.map((n) => (
                  <li key={n.id} className="px-4 py-2">
                    {n.link ? (
                      <Link href={n.link} className={n.readAt ? "text-muted hover:underline" : "font-medium hover:underline"}>
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                    <p className="text-xs text-muted">{formatDateTimeBR(n.createdAt)}</p>
                  </li>
                ))}
                {notifs.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted">Sem alertas</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Minhas cotações</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {quotes.map((r) => (
                <li key={r.q.id}>
                  <Link href={`/cotacoes/${r.q.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2 hover:bg-surface-2/60">
                    <span className="min-w-48 flex-1 text-sm font-medium">
                      {r.companyName} <span className="text-xs font-normal text-muted">{r.q.code} · {r.q.estimatedLives} vidas</span>
                    </span>
                    <QuotationStatusBadge value={r.q.status} />
                    <CompletenessBar pct={r.completeness} />
                    <span className="w-28 text-right text-xs text-muted">alvo {formatDateBR(r.q.targetDate)}</span>
                  </Link>
                </li>
              ))}
              {quotes.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted">Nenhuma cotação sob sua responsabilidade</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
