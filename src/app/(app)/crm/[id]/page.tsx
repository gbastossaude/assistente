import { CalendarPlus, ClipboardList, Lightbulb, MessageCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowupBadge, MeetingStatusBadge, ProductBadge, StageBadge } from "@/components/commercial/badges";
import { FollowupEditor, OpportunityHeaderActions, OpportunityInteractionForm } from "@/components/crm/detail-client";
import { Timeline } from "@/components/crm/timeline";
import { toOpportunityViews } from "@/components/crm/to-view";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { KeyValue, PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { LEAD_SOURCE_LABELS, OPPORTUNITY_STAGE_LABELS, type LeadSource } from "@/lib/domain/commercial";
import { documentChecklist, opportunityFollowupMessage, suggestNextSteps } from "@/lib/domain/crm";
import { formatDateBR, formatDateTimeBR, todayISO } from "@/lib/domain/dates";
import { formatMoney, formatNumber } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getScope } from "@/server/scope";
import { getOpportunity } from "@/server/services/opportunities";
import { commercialOptions } from "@/server/services/options";

export const metadata = { title: "Oportunidade" };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let d: Awaited<ReturnType<typeof getOpportunity>>;
  try {
    d = await getOpportunity(id, user);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const scope = await getScope(user);
  const options = await commercialOptions(scope);
  const [o] = toOpportunityViews([{ o: d.o, brokerName: d.brokerName ?? null, companyName: d.companyName ?? null, campaignName: d.campaignName ?? null, quotationCode: d.quotationCode ?? null }]);
  const today = todayISO();
  const consultant = user.name.replace(/\s*\(.*\)$/, "");
  const steps = suggestNextSteps(o, today);
  const message = opportunityFollowupMessage(o, consultant);
  const docs = documentChecklist(o.product, o.lives);
  const canWrite = can(user.role, "crm:write");
  const tasks = d.tasks.map((t) => ({ ...t, companyName: d.companyName ?? null, quotationCode: d.quotationCode ?? null, insurerName: null, ownerName: null }));
  return (
    <>
      <PageHeader
        back={{ href: "/crm", label: "CRM" }}
        title={o.clientName}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <StageBadge value={o.stage} /> <ProductBadge value={o.product} /> <FollowupBadge date={o.nextFollowupAt} today={today} stage={o.stage} />
            {d.o.anonymizedAt && <span className="text-xs">· anonimizada em {formatDateBR(d.o.anonymizedAt)}</span>}
          </span>
        }
        actions={<OpportunityHeaderActions o={o} options={options} canWrite={canWrite} canLgpd={can(user.role, "lgpd:manage") && !d.o.anonymizedAt} />}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Dados da oportunidade</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                cols={4}
                items={[
                  { label: "Empresa cadastrada", value: o.companyId ? <Link className="text-primary hover:underline" href={`/empresas/${o.companyId}`}>{d.companyName}</Link> : "—" },
                  { label: "CNPJ / CPF", value: o.document },
                  { label: "Contato", value: o.contactName },
                  { label: "Telefone", value: o.phone },
                  { label: "E-mail", value: o.email },
                  { label: "Vidas", value: formatNumber(o.lives) },
                  { label: "Valor estimado", value: o.estimatedValue ? `${formatMoney(o.estimatedValue)}/mês` : "—" },
                  { label: "Operadora atual", value: o.currentInsurer },
                  { label: "Operadoras cotadas", value: o.quotedInsurers.join(", ") || "—" },
                  { label: "Corretor", value: o.brokerName },
                  { label: "Assessor", value: o.advisorName },
                  { label: "Comercial", value: o.salesRepName },
                  { label: "Origem", value: LEAD_SOURCE_LABELS[o.source as LeadSource] ?? o.source },
                  { label: "Campanha", value: o.campaignId ? <Link className="text-primary hover:underline" href={`/campanhas/${o.campaignId}`}>{o.campaignName}</Link> : "—" },
                  { label: "Cotação +99", value: o.quotationId ? <Link className="text-primary hover:underline" href={`/cotacoes/${o.quotationId}`}>{o.quotationCode}</Link> : "—" },
                  { label: "Motivo da perda", value: o.lostReason },
                ]}
              />
              {o.notes && <p className="mt-3 whitespace-pre-wrap rounded-md bg-surface-2/60 p-3 text-sm">{o.notes}</p>}
            </CardContent>
          </Card>
          {canWrite && (
            <Card>
              <CardHeader>
                <CardTitle>Próximo follow-up</CardTitle>
              </CardHeader>
              <CardContent>
                <FollowupEditor id={o.id} nextStep={o.nextStep} nextFollowupAt={o.nextFollowupAt} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Histórico de interações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canWrite && <OpportunityInteractionForm opportunityId={o.id} />}
              <Timeline rows={d.timeline.map((t) => ({ ...t, quotationCode: null, companyName: null }))} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tarefas</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskList tasks={tasks} options={options} canWrite={can(user.role, "task:write")} defaults={{ opportunityId: o.id, companyId: o.companyId ?? "", title: `Follow-up — ${o.clientName}`, category: "venda" }} showContext={false} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <Lightbulb className="size-4 text-amber-500" /> Próximos passos sugeridos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-sm">
                {steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <MessageCircle className="size-4 text-emerald-600" /> Mensagem de follow-up
              </CardTitle>
              <CopyButton text={message} />
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{message}</p>
              <p className="mt-2 text-xs text-muted">
                Gerada para a etapa “{OPPORTUNITY_STAGE_LABELS[o.stage]}”. Mais modelos em{" "}
                <Link className="text-primary hover:underline" href="/mensagens">
                  Mensagens prontas
                </Link>
                .
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <ClipboardList className="size-4" /> Checklist de documentos
              </CardTitle>
              <CopyButton text={docs.map((x) => `• ${x}`).join("\n")} />
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-0.5 pl-4 text-sm">
                {docs.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Ponto de partida — confirme a lista com a operadora escolhida.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Reuniões</CardTitle>
              {can(user.role, "meeting:write") && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/reunioes/nova?oportunidade=${o.id}`}>
                    <CalendarPlus /> Nova
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {d.meetings.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted">Nenhuma reunião registrada.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.meetings.map((m) => (
                    <li key={m.id}>
                      <Link href={`/reunioes/${m.id}`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-surface-2/60">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{m.title}</span>
                          <span className="text-xs text-muted">
                            {formatDateBR(m.date)}
                            {m.startTime ? ` · ${m.startTime.slice(0, 5)}` : ""}
                          </span>
                        </span>
                        <MeetingStatusBadge value={m.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Histórico de etapas</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {d.history.map(({ h, userName }) => (
                  <li key={h.id}>
                    <span className="font-medium">{h.fromStage ? `${OPPORTUNITY_STAGE_LABELS[h.fromStage]} → ` : ""}{OPPORTUNITY_STAGE_LABELS[h.toStage]}</span>
                    <span className="block text-xs text-muted">
                      {formatDateTimeBR(h.createdAt)}
                      {userName ? ` · ${userName}` : ""}
                      {h.note ? ` · ${h.note}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
