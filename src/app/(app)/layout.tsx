import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { Header } from "@/components/layout/header";
import { NAV_ITEMS } from "@/components/layout/nav";
import { Sidebar } from "@/components/layout/sidebar";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { companies, pendencies, quotations, tasks } from "@/server/db/schema";
import { listNotifications, unreadCount } from "@/server/services/notifications";
import { todayISO } from "@/lib/domain/dates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const today = todayISO();
  const [notifs, unread, openQuotations, [overdue], [myPend]] = await Promise.all([
    listNotifications(user.id, 25),
    unreadCount(user.id),
    db
      .select({ id: quotations.id, code: quotations.code, name: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})` })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .where(and(isNull(quotations.deletedAt), sql`${quotations.status} not in ('fechada_ganha','fechada_perdida','concluida','cancelada')`))
      .orderBy(quotations.code),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(isNull(tasks.deletedAt), eq(tasks.ownerId, user.id), inArray(tasks.status, ["a_fazer", "em_andamento", "aguardando_terceiro"]), sql`${tasks.dueDate} < ${today}`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(pendencies)
      .where(and(eq(pendencies.ownerId, user.id), inArray(pendencies.status, ["aberta", "em_andamento"]), inArray(pendencies.priority, ["alta", "critica"]))),
  ]);
  const items = NAV_ITEMS.filter((i) => !i.permission || can(user.role, i.permission));
  return (
    <div className="min-h-screen">
      <Sidebar items={items} badges={{ "/tarefas": overdue.n, "/pendencias": myPend.n }} />
      <div className="lg:pl-60">
        <Header
          user={{ name: user.name, role: user.role }}
          notifications={notifs}
          unread={unread}
          quotations={openQuotations.map((q) => ({ id: q.id, label: `${q.code} — ${q.name}` }))}
          canWrite={can(user.role, "quotation:write")}
        />
        <main className="print-full mx-auto max-w-[1600px] px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
