import { SimpleBar } from "@/components/reports/simple-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/inputs";
import { PageHeader, StatCard, Table, Td, Th } from "@/components/ui/misc";
import { PENDENCY_CATEGORY_LABELS, QUOTATION_STATUSES, QUOTATION_STATUS_LABELS, type QuotationStatus } from "@/lib/domain/constants";
import { formatDateBR } from "@/lib/domain/dates";
import { formatNumber, formatPct, sp } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { taskOptions } from "@/server/services/options";
import { getReports } from "@/server/services/reports";

export const metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("reports:read");
  const s = await searchParams;
  const [r, opts] = await Promise.all([getReports({ from: sp(s.de), to: sp(s.ate), companyId: sp(s.empresa), insurerId: sp(s.operadora), status: sp(s.status) }), taskOptions()]);
  const order = (st: string) => QUOTATION_STATUSES.indexOf(st as QuotationStatus);
  const won = r.totals.won ?? 0;
  const lost = r.totals.lost ?? 0;
  return (
    <>
      <PageHeader title="Relatórios" description={`Período de abertura: ${formatDateBR(r.period.from)} a ${formatDateBR(r.period.to)}`} />
      <form className="no-print mb-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <Field label="De">
          <Input type="date" name="de" defaultValue={s.de ?? r.period.from} />
        </Field>
        <Field label="Até">
          <Input type="date" name="ate" defaultValue={s.ate ?? r.period.to} />
        </Field>
        <Field label="Empresa">
          <Select name="empresa" defaultValue={s.empresa ?? ""}>
            <option value="">Todas</option>
            {opts.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Operadora">
          <Select name="operadora" defaultValue={s.operadora ?? ""}>
            <option value="">Todas</option>
            {opts.insurers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={s.status ?? ""}>
            <option value="">Todos</option>
            {QUOTATION_STATUSES.map((st) => (
              <option key={st} value={st}>
                {QUOTATION_STATUS_LABELS[st]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full">
            Aplicar
          </Button>
        </div>
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Cotações abertas" value={r.totals.open} />
        <StatCard label="Cotações +99 vidas" value={r.totals.large} />
        <StatCard label="Vidas cotadas" value={formatNumber(r.totals.lives)} />
        <StatCard label="Completude média" value={formatPct(r.totals.avgCompleteness)} />
        <StatCard label="Ganhas" value={won} tone="green" hint={won + lost ? `${Math.round((won / (won + lost)) * 100)}% de conversão` : undefined} />
        <StatCard label="Perdidas" value={lost} tone={lost ? "red" : "default"} />
        <StatCard label="Pendências abertas" value={r.totals.pendencies} />
        <StatCard label="Tarefas atrasadas" value={r.tasks.overdue} tone={r.tasks.overdue ? "red" : "default"} hint={`${r.tasks.followups} follow-ups abertos · ${r.tasks.insurerFollowupsOpen} com operadoras`} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SimpleBar title="Cotações por etapa" data={[...r.byStatus].sort((a, b) => order(a.status) - order(b.status)).map((x) => ({ label: QUOTATION_STATUS_LABELS[x.status], value: x.n }))} />
        <SimpleBar title="Tempo médio em cada etapa (dias)" decimals={1} unit=" d" data={[...r.stageTimes].sort((a, b) => order(a.status) - order(b.status)).map((x) => ({ label: QUOTATION_STATUS_LABELS[x.status as QuotationStatus], value: x.avg_days }))} />
        <SimpleBar title="Tempo médio de retorno por operadora (dias)" decimals={1} unit=" d" data={r.insurerResponse.filter((x) => x.avgDays !== null).map((x) => ({ label: x.insurer, value: x.avgDays! }))} />
        <SimpleBar title="Pendências abertas por categoria" data={r.pendencyByCategory.map((x) => ({ label: PENDENCY_CATEGORY_LABELS[x.category], value: x.n }))} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Renovações próximas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <tbody>
                {(
                  [
                    ["Até 30 dias", r.renewalWindows?.d30],
                    ["31 a 60 dias", r.renewalWindows?.d60],
                    ["61 a 90 dias", r.renewalWindows?.d90],
                    ["91 a 120 dias", r.renewalWindows?.d120],
                  ] as const
                ).map(([l, v]) => (
                  <tr key={l}>
                    <Td>{l}</Td>
                    <Td className="text-right tabular-nums">{v ?? 0}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Motivos de perda</CardTitle>
          </CardHeader>
          <CardContent>
            {r.lostReasons.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma cotação perdida no período.</p>
            ) : (
              <Table>
                <tbody>
                  {r.lostReasons.map((x) => (
                    <tr key={x.reason}>
                      <Td>{x.reason}</Td>
                      <Td className="text-right">{x.n}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Operadoras — respostas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Operadora</Th>
                  <Th className="text-right">Enviadas</Th>
                  <Th className="text-right">Responderam</Th>
                  <Th className="text-right">Declinaram</Th>
                </tr>
              </thead>
              <tbody>
                {r.insurerResponse.map((x) => (
                  <tr key={x.insurer}>
                    <Td>{x.insurer}</Td>
                    <Td className="text-right">{x.sent}</Td>
                    <Td className="text-right">{x.responded}</Td>
                    <Td className="text-right">{x.declined}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <p className="mt-3 text-xs text-muted">NEW: {r.byType.find((x) => x.type === "NEW")?.n ?? 0} · RENEW: {r.byType.find((x) => x.type === "RENEW")?.n ?? 0}</p>
    </>
  );
}
