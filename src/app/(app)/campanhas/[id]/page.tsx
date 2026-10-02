import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignStatusBadge, FollowupBadge, ProductBadge, StageBadge } from "@/components/commercial/badges";
import { CampaignDialog } from "@/components/campaigns/campaign-dialog";
import { MilestoneStrip } from "@/components/campaigns/milestones";
import { CampaignDelete, CampaignStatusSelect } from "@/components/campaigns/status-select";
import { campaignToForm } from "@/components/campaigns/to-form";
import { OpportunityCreate } from "@/components/crm/board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { KeyValue, PageHeader, Progress, StatCard, Table, Td, Th } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { campaignProgress } from "@/lib/domain/campaigns";
import { CHANNEL_LABELS, type Channel } from "@/lib/domain/commercial";
import { formatDateBR, todayISO } from "@/lib/domain/dates";
import { formatMoney, formatNumber } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getScope } from "@/server/scope";
import { getCampaign } from "@/server/services/campaigns";
import { commercialOptions } from "@/server/services/options";
import { userOptions } from "@/server/services/users";

export const metadata = { title: "Campanha" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const scope = await getScope(user);
  const d = await getCampaign(id, scope);
  if (!d) notFound();
  const { c } = d;
  const today = todayISO();
  const canWrite = can(user.role, "campaign:write");
  const [users, options] = await Promise.all([userOptions(), commercialOptions(scope)]);
  const pct = campaignProgress(c.startDate, c.endDate, today);
  return (
    <>
      <PageHeader
        back={{ href: "/campanhas", label: "Campanhas" }}
        title={c.name}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <ProductBadge value={c.product} /> <CampaignStatusBadge value={c.status} /> {formatDateBR(c.startDate)} a {formatDateBR(c.endDate)}
          </span>
        }
        actions={
          canWrite ? (
            <>
              <CampaignStatusSelect id={c.id} status={c.status} />
              <CampaignDialog trigger="edit" users={users} value={campaignToForm(c)} />
              <CampaignDelete id={c.id} />
            </>
          ) : null
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Leads gerados" value={`${d.leads}${c.goalLeads ? ` / ${c.goalLeads}` : ""}`} tone="blue" />
        <StatCard label="Vendas" value={`${d.sales}${c.goalSales ? ` / ${c.goalSales}` : ""}`} tone="green" />
        <StatCard label="Valor vendido (mês)" value={formatMoney(d.salesValue)} hint={c.goalValue ? `Meta ${formatMoney(c.goalValue)}` : undefined} />
        <StatCard label="Follow-ups pendentes" value={d.pendingFollowups} tone={d.pendingFollowups ? "red" : "default"} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lembretes automáticos</CardTitle>
              <span className="text-xs text-muted">{pct}% do período</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={pct} label="Período decorrido" />
              <MilestoneStrip milestones={d.milestones} today={today} enabled={c.remindersEnabled} />
              <p className="text-xs text-muted">Em cada marco o responsável recebe uma notificação com os leads gerados e os follow-ups pendentes. Campanhas planejadas viram “ativas” automaticamente na data de início.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Oportunidades da campanha</CardTitle>
              {can(user.role, "crm:write") && <OpportunityCreate options={options} defaults={{ campaignId: c.id, source: "campanha", product: c.product }} />}
            </CardHeader>
            <CardContent className="p-0">
              {d.opportunities.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">Nenhum lead registrado nesta campanha ainda.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Cliente</Th>
                      <Th>Etapa</Th>
                      <Th>Vidas</Th>
                      <Th>Valor/mês</Th>
                      <Th>Follow-up</Th>
                      <Th>Corretor</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.opportunities.map(({ o, brokerName }) => (
                      <tr key={o.id}>
                        <Td>
                          <Link className="font-medium hover:underline" href={`/crm/${o.id}`}>
                            {o.clientName}
                          </Link>
                        </Td>
                        <Td>
                          <StageBadge value={o.stage} />
                        </Td>
                        <Td className="tabular-nums">{formatNumber(o.lives)}</Td>
                        <Td className="tabular-nums">{formatMoney(o.estimatedValue)}</Td>
                        <Td>
                          <FollowupBadge date={o.nextFollowupAt} today={today} stage={o.stage} />
                        </Td>
                        <Td className="text-xs">{brokerName ?? "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mensagem principal</CardTitle>
              {c.mainMessage && <CopyButton text={c.mainMessage} />}
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{c.mainMessage ?? "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Planejamento</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                cols={2}
                items={[
                  { label: "Público-alvo", value: c.audience },
                  { label: "Meta", value: c.goal },
                  { label: "Canais", value: c.channels.map((ch) => CHANNEL_LABELS[ch as Channel] ?? ch).join(", ") || "—" },
                  { label: "Responsável", value: d.ownerName },
                  { label: "Outros responsáveis", value: c.responsibles },
                  { label: "Lembretes", value: c.remindersEnabled ? "Ativados" : "Desativados" },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Resultados</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{c.results ?? "Ainda não registrados — edite a campanha para informar o resultado final."}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
