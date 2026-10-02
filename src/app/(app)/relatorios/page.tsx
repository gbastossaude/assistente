import { Download, Printer } from "lucide-react";
import Link from "next/link";
import { PrintButton } from "@/components/proposals/print-button";
import { SimpleBar } from "@/components/reports/simple-bar";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { can } from "@/lib/auth/permissions";
import { CAMPAIGN_STATUS_LABELS, LEAD_SOURCE_LABELS, OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABELS, PRODUCT_LABELS, type LeadSource } from "@/lib/domain/commercial";
import { relativeDays, todayISO } from "@/lib/domain/dates";
import { getScope, type DataScope } from "@/server/scope";
import { getCommercialReports } from "@/server/services/commercial-reports";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/inputs";
import { PageHeader, StatCard, TabLinks, Table, Td, Th } from "@/components/ui/misc";
import { PENDENCY_CATEGORY_LABELS, QUOTATION_STATUSES, QUOTATION_STATUS_LABELS, type QuotationStatus } from "@/lib/domain/constants";
import { formatDateBR } from "@/lib/domain/dates";
import { formatMoney, formatNumber, formatPct, sp } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { taskOptions } from "@/server/services/options";
import { getReports } from "@/server/services/reports";

export const metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("reports:read");
  const s = await searchParams;
  const canOps = can(user.role, "operations:read");
  const tab = s.tab === "cotacoes" && canOps ? "cotacoes" : "comercial";
  const exportQs = new URLSearchParams(Object.entries({ de: s.de ?? "", ate: s.ate ?? "" }).filter(([, v]) => v)).toString();
  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Indicadores comerciais e operacionais — exporte em CSV ou salve em PDF pela impressão"
        actions={
          <>
            {can(user.role, "data:export") && (
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Download /> Exportar CSV
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  {EXPORTS.map(([k, l]) => (
                    <DropdownItem key={k} asChild>
                      <a href={`/api/export/${k}?${exportQs}`}>{l}</a>
                    </DropdownItem>
                  ))}
                </DropdownContent>
              </Dropdown>
            )}
            <PrintButton>
              <Printer /> PDF / imprimir
            </PrintButton>
          </>
        }
      />
      <TabLinks
        baseHref={`/relatorios?${new URLSearchParams(Object.entries(s).filter(([k, v]) => v && k !== "tab") as [string, string][]).toString()}`}
        active={tab}
        tabs={[{ key: "comercial", label: "Comercial (CRM)" }, ...(canOps ? [{ key: "cotacoes", label: "Cotações e operadoras" }] : [])]}
      />
      {tab === "comercial" ? <CommercialReport s={s} scope={await getScope(user)} /> : <QuotationReport s={s} />}
    </>
  );
}

const EXPORTS = [
  ["vendas", "Vendas fechadas (período)"],
  ["oportunidades", "Oportunidades (CRM)"],
  ["reunioes", "Reuniões"],
  ["tarefas", "Tarefas"],
  ["campanhas", "Campanhas"],
] as const;

async function CommercialReport({ s, scope }: { s: Record<string, string | undefined>; scope: DataScope }) {
  const r = await getCommercialReports({ from: sp(s.de), to: sp(s.ate) }, scope);
  const today = todayISO();
  return (
    <>
      <form className="no-print mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="comercial" />
        <Field label="De">
          <Input type="date" name="de" defaultValue={s.de ?? r.period.from} />
        </Field>
        <Field label="Até">
          <Input type="date" name="ate" defaultValue={s.ate ?? r.period.to} />
        </Field>
        <Button type="submit" variant="secondary">
          Aplicar
        </Button>
        <span className="pb-2 text-xs text-muted">
          Período: {formatDateBR(r.period.from)} a {formatDateBR(r.period.to)}
        </span>
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Vendas fechadas" value={r.totals.sales} tone="green" />
        <StatCard label="Valor vendido (mensal)" value={formatMoney(r.totals.value)} />
        <StatCard label="Ticket médio" value={formatMoney(r.totals.ticket)} />
        <StatCard label="Taxa de conversão" value={r.totals.conversion === null ? "—" : formatPct(r.totals.conversion)} hint={`${r.totals.decided.won} ganhas · ${r.totals.decided.lost} perdidas`} />
        <StatCard label="Reuniões realizadas" value={r.totals.meetingsHeld} hint={`${r.totals.agendaMeetingsHeld} compromissos de reunião realizados na agenda`} />
        <StatCard label="Clientes sem follow-up" value={r.totals.noFollowup} tone={r.totals.noFollowup ? "amber" : "default"} hint="Sem data ou atrasado" />
        <StatCard label="Tarefas atrasadas" value={r.totals.overdueTasks} tone={r.totals.overdueTasks ? "red" : "default"} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SimpleBar title="Vendas por período (valor mensal, R$)" decimals={2} data={r.salesByMonth.map((x) => ({ label: x.month.split("-").reverse().join("/"), value: x.value }))} />
        <SimpleBar title="Vendas por corretor (valor mensal, R$)" decimals={2} data={r.salesByBroker.map((x) => ({ label: `${x.broker} (${x.n})`, value: x.value }))} />
        <SimpleBar title="Vendas por produto (quantidade)" data={r.salesByProduct.map((x) => ({ label: PRODUCT_LABELS[x.product], value: x.n }))} />
        <SimpleBar title="Oportunidades por etapa (atual)" data={[...r.byStage].sort((a, b) => OPPORTUNITY_STAGES.indexOf(a.stage) - OPPORTUNITY_STAGES.indexOf(b.stage)).map((x) => ({ label: OPPORTUNITY_STAGE_LABELS[x.stage], value: x.n }))} />
        <SimpleBar title="Leads por origem (criados no período)" data={r.bySource.map((x) => ({ label: LEAD_SOURCE_LABELS[x.source as LeadSource] ?? x.source, value: x.n }))} />
        <SimpleBar title="Reuniões realizadas por responsável" data={r.meetingsByOwner.map((x) => ({ label: x.owner, value: x.n }))} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Campanhas e resultados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {r.campaigns.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Nenhuma campanha no período.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Campanha</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Leads</Th>
                    <Th className="text-right">Vendas</Th>
                    <Th className="text-right">Valor</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.campaigns.map(({ c, leads, sales, value }) => (
                    <tr key={c.id}>
                      <Td>
                        <Link href={`/campanhas/${c.id}`} className="hover:underline">
                          {c.name}
                        </Link>
                        <span className="block text-xs text-muted">
                          {formatDateBR(c.startDate)} a {formatDateBR(c.endDate)}
                        </span>
                      </Td>
                      <Td>{CAMPAIGN_STATUS_LABELS[c.status]}</Td>
                      <Td className="text-right tabular-nums">
                        {leads}
                        {c.goalLeads ? `/${c.goalLeads}` : ""}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {sales}
                        {c.goalSales ? `/${c.goalSales}` : ""}
                      </Td>
                      <Td className="text-right tabular-nums">{formatMoney(value)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Clientes sem follow-up</CardTitle>
            <span className="text-xs text-muted">{r.noFollowup.length}</span>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto p-0">
            {r.noFollowup.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Todas as oportunidades abertas têm follow-up em dia.</p>
            ) : (
              <Table>
                <tbody>
                  {r.noFollowup.map(({ o, brokerName }) => (
                    <tr key={o.id}>
                      <Td>
                        <Link href={`/crm/${o.id}`} className="hover:underline">
                          {o.clientName}
                        </Link>
                        <span className="block text-xs text-muted">{OPPORTUNITY_STAGE_LABELS[o.stage]}</span>
                      </Td>
                      <Td className="text-xs">{brokerName ?? "—"}</Td>
                      <Td className="text-right text-xs">{o.nextFollowupAt ? `atrasado desde ${formatDateBR(o.nextFollowupAt)} (${relativeDays(o.nextFollowupAt, today)})` : "sem data"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Motivos de perda (CRM)</CardTitle>
          </CardHeader>
          <CardContent>
            {r.lostReasons.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma oportunidade perdida no período.</p>
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
      </div>
    </>
  );
}

async function QuotationReport({ s }: { s: Record<string, string | undefined> }) {
  const [r, opts] = await Promise.all([getReports({ from: sp(s.de), to: sp(s.ate), companyId: sp(s.empresa), insurerId: sp(s.operadora), status: sp(s.status) }), taskOptions()]);
  const order = (st: string) => QUOTATION_STATUSES.indexOf(st as QuotationStatus);
  const won = r.totals.won ?? 0;
  const lost = r.totals.lost ?? 0;
  return (
    <>
      <p className="mb-2 text-xs text-muted">Período de abertura: {formatDateBR(r.period.from)} a {formatDateBR(r.period.to)}</p>
      <form className="no-print mb-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        <input type="hidden" name="tab" value="cotacoes" />
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
