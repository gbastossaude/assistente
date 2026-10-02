import { CalendarPlus, Download, FileCheck2 } from "lucide-react";
import Link from "next/link";
import { MeetingStatusBadge } from "@/components/commercial/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/inputs";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { MEETING_STATUSES, MEETING_STATUS_LABELS, type MeetingStatus } from "@/lib/domain/commercial";
import { formatDateBR, isValidISODate, relativeDays, todayISO } from "@/lib/domain/dates";
import { sp } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getScope } from "@/server/scope";
import { listMeetings } from "@/server/services/meetings";

export const metadata = { title: "Reuniões" };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const s = await searchParams;
  const scope = await getScope(user);
  const status = (MEETING_STATUSES as readonly string[]).includes(s.status ?? "") ? (s.status as MeetingStatus) : null;
  const rows = await listMeetings({ q: sp(s.q), status, from: isValidISODate(s.de) ? s.de : null, to: isValidISODate(s.ate) ? s.ate : null, ownerId: s.resp === "eu" ? user.id : null }, scope);
  const today = todayISO();
  const exportQs = new URLSearchParams(Object.entries(s).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader
        title="Reuniões com clientes"
        description="Ficha de reunião com roteiro de perguntas, ata automática, pendências, follow-up de WhatsApp e tarefa de retorno"
        actions={
          <>
            {can(user.role, "data:export") && (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/export/reunioes?${exportQs}`}>
                  <Download /> CSV
                </a>
              </Button>
            )}
            {can(user.role, "meeting:write") && (
              <Button asChild>
                <Link href="/reunioes/nova">
                  <CalendarPlus /> Nova reunião
                </Link>
              </Button>
            )}
          </>
        }
      />
      <form className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-6" role="search">
        <Input name="q" defaultValue={s.q ?? ""} placeholder="Título, cliente, empresa, assessor…" className="col-span-2" aria-label="Buscar" />
        <Select name="status" defaultValue={s.status ?? ""} aria-label="Status">
          <option value="">Todos os status</option>
          {MEETING_STATUSES.map((st) => (
            <option key={st} value={st}>
              {MEETING_STATUS_LABELS[st]}
            </option>
          ))}
        </Select>
        <Input type="date" name="de" defaultValue={s.de ?? ""} aria-label="De" />
        <Input type="date" name="ate" defaultValue={s.ate ?? ""} aria-label="Até" />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted">
            <input type="checkbox" name="resp" value="eu" defaultChecked={s.resp === "eu"} /> Minhas
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Filtrar
          </Button>
        </div>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="Nenhuma reunião" description="Crie uma ficha de reunião para registrar o diagnóstico do cliente e gerar a ata automaticamente." />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Reunião</Th>
                <Th>Cliente</Th>
                <Th>Assessor / comercial</Th>
                <Th>Responsável</Th>
                <Th>Perguntas</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, ownerName }) => {
                const asked = m.questions.filter((q) => q.asked).length;
                const pending = m.questions.filter((q) => q.status === "pendente").length;
                return (
                  <tr key={m.id} className="hover:bg-surface-2/40">
                    <Td className="whitespace-nowrap">
                      {formatDateBR(m.date)}
                      {m.startTime && <span className="text-muted"> {m.startTime.slice(0, 5)}</span>}
                      <span className="block text-xs text-muted">{relativeDays(m.date, today)}</span>
                    </Td>
                    <Td>
                      <Link href={`/reunioes/${m.id}`} className="font-medium hover:underline">
                        {m.title}
                      </Link>
                      {m.minutesGeneratedAt && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                          <FileCheck2 className="size-3" /> ata
                        </span>
                      )}
                    </Td>
                    <Td>
                      {m.companyName ?? "—"}
                      {m.clientName && <span className="block text-xs text-muted">{m.clientName}</span>}
                    </Td>
                    <Td className="text-xs">{[m.advisorName, m.salesRepName].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td className="text-xs">{ownerName ?? "—"}</Td>
                    <Td className="text-xs tabular-nums">
                      {asked}/{m.questions.length}
                      {pending > 0 && <span className="block text-amber-700 dark:text-amber-300">{pending} pendente(s)</span>}
                    </Td>
                    <Td>
                      <MeetingStatusBadge value={m.status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
