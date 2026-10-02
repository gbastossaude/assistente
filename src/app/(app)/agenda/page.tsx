import { CalendarView, type AgendaItem } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { addDays, isValidISODate, todayISO, toISODate, APP_TIMEZONE } from "@/lib/domain/dates";
import { requireUser } from "@/server/auth";
import { getScope } from "@/server/scope";
import { listAgenda, localToUtc } from "@/server/services/calendar";
import { taskOptions } from "@/server/services/options";

export const metadata = { title: "Agenda" };

function weekdayOf(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ view?: string; data?: string; resp?: string }> }) {
  const user = await requireUser();
  const scope = await getScope(user);
  const s = await searchParams;
  const view = s.view === "dia" ? "dia" : s.view === "mes" ? "mes" : "semana";
  const anchor = isValidISODate(s.data) ? s.data : todayISO();
  let from = anchor;
  let days = 1;
  if (view === "semana") {
    from = addDays(anchor, -weekdayOf(anchor));
    days = 7;
  } else if (view === "mes") {
    const first = `${anchor.slice(0, 7)}-01`;
    from = addDays(first, -weekdayOf(first));
    days = 42;
  }
  const [agenda, opts] = await Promise.all([listAgenda(localToUtc(from, "00:00"), localToUtc(addDays(from, days), "00:00"), { ownerId: s.resp === "eu" ? user.id : null, ownerIds: scope.all ? null : scope.ownerIds }), taskOptions(scope)]);
  const time = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const items: AgendaItem[] = [
    ...agenda.events.map(({ e, companyName, quotationCode, meetingId }) => ({
      id: e.id,
      kind: "evento" as const,
      title: e.title,
      type: e.type,
      date: toISODate(e.startsAt),
      time: e.allDay ? null : time(e.startsAt),
      endTime: e.endsAt ? time(e.endsAt) : null,
      allDay: e.allDay,
      href: meetingId ? `/reunioes/${meetingId}` : e.quotationId ? `/cotacoes/${e.quotationId}` : null,
      meetingId,
      context: [e.clientName ?? companyName, quotationCode].filter(Boolean).join(" · ") || null,
      status: e.status,
      raw: {
        location: e.location,
        description: e.description,
        companyId: e.companyId,
        quotationId: e.quotationId,
        insurerId: e.insurerId,
        taskId: e.taskId,
        ownerId: e.ownerId,
        opportunityId: e.opportunityId,
        status: e.status,
        clientName: e.clientName,
        advisorName: e.advisorName,
        salesRepName: e.salesRepName,
        reminderMinutes: e.reminderMinutes,
      },
    })),
    ...agenda.tasks.map(({ t, companyName }) => ({
      id: t.id,
      kind: "tarefa" as const,
      title: t.title,
      type: "tarefa",
      date: (t.scheduledDate ?? t.dueDate)!,
      time: t.scheduledTime?.slice(0, 5) ?? null,
      endTime: null,
      allDay: !t.scheduledTime,
      href: `/tarefas?id=${t.id}`,
      context: companyName,
    })),
  ];
  return (
    <>
      <PageHeader title="Agenda" description="Reuniões, follow-ups, apresentações, renovações e prazos" />
      <CalendarView view={view} anchor={anchor} from={from} days={days} items={items} options={opts} canWrite={can(user.role, "calendar:write")} />
    </>
  );
}
