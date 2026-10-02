import Link from "next/link";
import { CampaignStatusBadge, ProductBadge } from "@/components/commercial/badges";
import { CampaignDialog } from "@/components/campaigns/campaign-dialog";
import { MilestoneStrip } from "@/components/campaigns/milestones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/inputs";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { campaignMilestones, campaignProgress } from "@/lib/domain/campaigns";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS, CHANNEL_LABELS, type CampaignStatus, type Channel } from "@/lib/domain/commercial";
import { formatDateBR, todayISO } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getScope } from "@/server/scope";
import { listCampaigns } from "@/server/services/campaigns";
import { userOptions } from "@/server/services/users";

export const metadata = { title: "Campanhas" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const s = await searchParams;
  const scope = await getScope(user);
  const status = (CAMPAIGN_STATUSES as readonly string[]).includes(s.status ?? "") ? (s.status as CampaignStatus) : null;
  const month = /^\d{4}-\d{2}$/.test(s.mes ?? "") ? s.mes! : null;
  const [rows, users] = await Promise.all([listCampaigns({ status, month }, scope), userOptions()]);
  const today = todayISO();
  return (
    <>
      <PageHeader
        title="Campanhas do mês"
        description="Campanhas comerciais com metas, canais e lembretes automáticos de início, meio, últimos dias e resultado"
        actions={can(user.role, "campaign:write") ? <CampaignDialog trigger="new" users={users} /> : null}
      />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="status" defaultValue={s.status ?? ""} className="w-44" aria-label="Status">
          <option value="">Todos os status</option>
          {CAMPAIGN_STATUSES.map((st) => (
            <option key={st} value={st}>
              {CAMPAIGN_STATUS_LABELS[st]}
            </option>
          ))}
        </Select>
        <Input type="month" name="mes" defaultValue={s.mes ?? ""} className="w-44" aria-label="Mês" />
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="Nenhuma campanha" description="Cadastre a campanha do mês — o sistema lembra você do início, do meio, dos últimos dias e do resultado final. O Assistente IA também sugere campanhas." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map(({ c, ownerName, leads, sales, salesValue, pendingFollowups }) => {
            const pct = campaignProgress(c.startDate, c.endDate, today);
            return (
              <Card key={c.id}>
                <CardContent className="space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/campanhas/${c.id}`} className="font-semibold hover:underline">
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {formatDateBR(c.startDate)} a {formatDateBR(c.endDate)} · {ownerName ?? "sem responsável"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <ProductBadge value={c.product} />
                      <CampaignStatusBadge value={c.status} />
                    </div>
                  </div>
                  {c.status !== "planejada" && <Progress value={pct} tone={pct >= 85 ? "amber" : "blue"} label="Período decorrido" />}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-lg font-semibold tabular-nums">
                        {leads}
                        {c.goalLeads ? <span className="text-xs text-muted">/{c.goalLeads}</span> : null}
                      </p>
                      <p className="text-[11px] text-muted">leads</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold tabular-nums">
                        {sales}
                        {c.goalSales ? <span className="text-xs text-muted">/{c.goalSales}</span> : null}
                      </p>
                      <p className="text-[11px] text-muted">vendas</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{formatMoney(salesValue)}</p>
                      <p className="text-[11px] text-muted">vendido/mês</p>
                    </div>
                    <div>
                      <p className={`text-lg font-semibold tabular-nums ${pendingFollowups ? "text-red-600" : ""}`}>{pendingFollowups}</p>
                      <p className="text-[11px] text-muted">follow-ups pendentes</p>
                    </div>
                  </div>
                  {c.channels.length > 0 && <p className="text-xs text-muted">Canais: {c.channels.map((ch) => CHANNEL_LABELS[ch as Channel] ?? ch).join(", ")}</p>}
                  <MilestoneStrip milestones={campaignMilestones(c.startDate, c.endDate)} today={today} enabled={c.remindersEnabled} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
