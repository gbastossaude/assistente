import { AlertTriangle, CalendarClock, ShieldAlert, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractsManager } from "@/components/companies/managers";
import { InteractionForm } from "@/components/crm/interaction-form";
import { Timeline } from "@/components/crm/timeline";
import { DocumentsTable, UploadZone } from "@/components/documents/documents-panel";
import { InsurersPanel } from "@/components/insurers/insurers-panel";
import { LivesImporter } from "@/components/lives/importer";
import { LivesSummaryView } from "@/components/lives/summary-view";
import { LivesTable } from "@/components/lives/lives-table";
import { ComparisonView } from "@/components/proposals/comparison-view";
import { ProposalsPanel } from "@/components/proposals/proposals-panel";
import { ChecklistPanel } from "@/components/quotations/checklist-panel";
import { ConditionsForm } from "@/components/quotations/conditions-form";
import { ContributionForm } from "@/components/quotations/contribution-form";
import { QuotationHeaderActions } from "@/components/quotations/header-actions";
import { ImportHistory } from "@/components/quotations/lives-history";
import { SpecialCasesEditor } from "@/components/quotations/special-cases-editor";
import { TaskList } from "@/components/tasks/task-list";
import { toTaskViews } from "@/components/tasks/to-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, KeyValue, Progress, TabLinks } from "@/components/ui/misc";
import { CompletenessBar, PriorityBadge, QuotationStatusBadge } from "@/components/ui/status";
import { can } from "@/lib/auth/permissions";
import { formatCnpj } from "@/lib/domain/cnpj";
import { COPAY_PROCEDURE_LABELS, MANUAL_INTERACTION_TYPES, MODALITY_LABELS, QUOTATION_STATUS_LABELS, type CopayProcedure, type InteractionType } from "@/lib/domain/constants";
import { formatDateBR, formatDateTimeBR, relativeDays } from "@/lib/domain/dates";
import type { LivesSummary } from "@/lib/lives-import/summary";
import { formatNumber, formatPct } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getCompanyDetail } from "@/server/services/companies";
import { listDocuments } from "@/server/services/documents";
import { getComparison, insurerOptions, listQuotationInsurers } from "@/server/services/insurers";
import { listTimeline } from "@/server/services/interactions";
import { listImports, listLives } from "@/server/services/lives";
import { listTemplates } from "@/server/services/messages";
import { taskOptions } from "@/server/services/options";
import { getQuotationDetail } from "@/server/services/quotations";
import { redactEntries } from "@/server/services/quotation-view";
import { listTasks } from "@/server/services/tasks";
import { userOptions } from "@/server/services/users";
import { getSetting } from "@/server/settings";
import { maxUploadBytes } from "@/server/storage";

const TABS = ["visao", "checklist", "empresa", "base", "especiais", "documentos", "operadoras", "propostas", "comparativo", "tarefas", "interacoes", "timeline"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const d = await getQuotationDetail((await params).id);
  return { title: d ? `${d.q.code} · ${d.company.tradeName ?? d.company.legalName}` : "Cotação" };
}

export default async function QuotationCentral({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const s = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(s.tab ?? "") ? (s.tab as Tab) : "visao";
  const d = await getQuotationDetail(id);
  if (!d) notFound();
  const q = d.q;
  const canWrite = can(user.role, "quotation:write") && !d.closed;
  const canSensitive = can(user.role, "sensitive:read");
  const maxMb = Math.round(maxUploadBytes() / 1024 / 1024);
  const [templates, qis, users] = await Promise.all([listTemplates(), listQuotationInsurers(id), userOptions()]);
  const templateOpts = templates.map((t) => ({ key: t.key, name: t.name, audience: t.audience, channel: t.channel }));
  const qiOpts = qis.map((r) => ({ id: r.qi.id, name: r.insurer.name }));
  const docsNeeded = ["checklist", "especiais", "documentos", "propostas"].includes(tab);
  const docs = docsNeeded ? await listDocuments({ quotationId: id }) : [];
  const docOpts = docs.map((x) => ({ id: x.d.id, fileName: x.d.fileName, docType: x.d.docType }));
  const base = `/cotacoes/${id}`;

  return (
    <>
      {/* Cabeçalho fixo da cotação */}
      <div className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link href="/cotacoes" className="text-xs text-muted hover:text-foreground">
              ← Cotações
            </Link>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
              <Link href={`/empresas/${d.company.id}`} className="hover:underline">
                {d.company.tradeName ?? d.company.legalName}
              </Link>
              <Badge tone={q.processType === "NEW" ? "blue" : "violet"}>{q.processType}</Badge>
              <QuotationStatusBadge value={q.status} />
              <PriorityBadge value={q.priority} />
            </h1>
            <p className="text-sm text-muted">
              {q.code} · {formatNumber(q.estimatedLives)} vidas · estipulante {q.stipulantName ?? "—"}
            </p>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            <QuotationHeaderActions
              q={q}
              users={users}
              templates={templateOpts}
              insurers={qiOpts}
              pendingRequired={d.completeness.pendingRequired}
              canWrite={canWrite}
              canOverride={can(user.role, "quotation:override_ready")}
              canDelete={can(user.role, "delete")}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3 xl:grid-cols-6">
          <div>
            <p className="text-xs text-muted">Completude ({d.completeness.label})</p>
            <CompletenessBar pct={d.completeness.pct} />
          </div>
          <div>
            <p className="text-xs text-muted">Score de prontidão</p>
            <p className="font-semibold tabular-nums">{d.readiness.score}/100</p>
          </div>
          <div>
            <p className="text-xs text-muted">Data de renovação</p>
            <p>{q.renewalDate ? `${formatDateBR(q.renewalDate)} (${relativeDays(q.renewalDate)})` : "—"}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-muted">
              <CalendarClock className="size-3" /> Próximo prazo
            </p>
            <p className="truncate" title={d.nextDeadline?.title}>
              {d.nextDeadline ? `${formatDateBR(d.nextDeadline.date)} · ${d.nextDeadline.title}` : q.targetDate ? `Data-alvo ${formatDateBR(q.targetDate)}` : "—"}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-muted">
              <User className="size-3" /> Responsável
            </p>
            <p>{d.ownerName ?? "—"}</p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-muted">
              <ShieldAlert className="size-3" /> Pendências críticas
            </p>
            <Link href={`${base}?tab=checklist`} className={d.criticalPendencies.length ? "font-semibold text-red-700 hover:underline" : ""}>
              {d.criticalPendencies.length}
            </Link>
          </div>
        </div>
        {q.readyOverrideReason && (
          <p className="mt-3 flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="size-3.5" /> Liberada ao mercado com override em {formatDateTimeBR(q.readyOverrideAt)}: “{q.readyOverrideReason}”
          </p>
        )}
      </div>

      <TabLinks
        baseHref={base}
        active={tab}
        tabs={[
          { key: "visao", label: "Visão geral" },
          { key: "checklist", label: "Checklist", count: d.completeness.pendingRequired },
          { key: "empresa", label: "Dados da empresa" },
          { key: "base", label: "Base de vidas", count: d.activeImport?.totalRows ?? null },
          { key: "especiais", label: "Situações especiais" },
          { key: "documentos", label: "Documentos" },
          { key: "operadoras", label: "Operadoras", count: qis.length },
          { key: "propostas", label: "Propostas" },
          { key: "comparativo", label: "Comparativo" },
          { key: "tarefas", label: "Tarefas" },
          { key: "interacoes", label: "Interações" },
          { key: "timeline", label: "Timeline" },
        ]}
      />

      {tab === "visao" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Score de prontidão documental: {d.readiness.score}/100</CardTitle>
                <CardDescription>Indicador de apoio — não substitui o julgamento humano. Pesos configuráveis.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {d.readiness.components.map((c) => (
                <div key={c.key}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span>
                      {c.label} <span className="text-xs text-muted">(peso {c.weight})</span>
                    </span>
                    <span className="tabular-nums text-muted">
                      {c.points.toLocaleString("pt-BR")} / {c.weight}
                    </span>
                  </div>
                  <Progress value={c.ratio * 100} tone={c.ratio >= 1 ? "green" : c.ratio >= 0.5 ? "blue" : "amber"} label={c.label} />
                  <p className="mt-0.5 text-xs text-muted">{c.detail}</p>
                </div>
              ))}
              <p className="text-xs text-muted">
                Checklist: {d.completeness.requiredResolved}/{d.completeness.requiredTotal} obrigatórios resolvidos · opcionais {d.completeness.optionalResolved}/{d.completeness.optionalTotal}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pendências críticas</CardTitle>
              <Link href={`/pendencias?cotacao=${id}`} className="text-xs text-primary hover:underline">
                Ver todas
              </Link>
            </CardHeader>
            <CardContent>
              {d.criticalPendencies.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma pendência de prioridade alta/crítica.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {d.criticalPendencies.map((p) => (
                    <li key={p.id} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-600" />
                      <span>
                        {p.title}
                        {p.dueDate && <span className="block text-xs text-muted">Prazo {formatDateBR(p.dueDate)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Identificação e condições</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                cols={3}
                items={[
                  { label: "Abertura", value: formatDateBR(q.openedAt) },
                  { label: "Data-alvo", value: formatDateBR(q.targetDate) },
                  { label: "CNPJs participantes", value: d.cnpjs.map((c) => formatCnpj(c.cnpj)).join(", ") || "—" },
                  { label: "Motivo", value: q.reason },
                  { label: "Modalidade", value: q.modality ? MODALITY_LABELS[q.modality] : null },
                  { label: "FGTS 100%", value: q.fgts100 === null ? "—" : q.fgts100 ? "Sim" : "Não" },
                  { label: "Forma de pagamento", value: q.paymentMethod },
                  { label: "Comissão", value: formatPct(q.commissionPct) },
                  { label: "Coparticipação", value: q.hasCopay === null ? "—" : q.hasCopay ? `${formatPct(q.copayPct)} — ${q.copayProcedures.map((p) => COPAY_PROCEDURE_LABELS[p as CopayProcedure]).join(", ")}` : "Não" },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Histórico de status</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {d.history.map(({ h, userName }) => (
                  <li key={h.id}>
                    <span className="font-medium">{QUOTATION_STATUS_LABELS[h.toStatus]}</span>
                    <span className="block text-xs text-muted">
                      {formatDateTimeBR(h.changedAt)} · {userName ?? "sistema"}
                      {h.fromStatus ? ` · de ${QUOTATION_STATUS_LABELS[h.fromStatus]}` : ""}
                    </span>
                    {h.note && <span className="block text-xs italic text-muted">{h.note}</span>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "checklist" && (
        <ChecklistPanel
          quotationId={id}
          items={d.checklist}
          docs={docOpts}
          templates={templateOpts.filter((t) => t.audience === "cliente")}
          canWrite={canWrite}
        />
      )}

      {tab === "empresa" && <CompanyTab q={q} companyId={d.company.id} canWrite={canWrite} canCompany={can(user.role, "company:write")} />}

      {tab === "base" && <LivesTab id={id} s={s} canImport={can(user.role, "lives:import") && !d.closed} canSensitive={canSensitive} maxMb={maxMb} hasActive={!!d.activeImport} activeSummary={d.activeImport ? (d.activeImport.summary as LivesSummary) : null} activeImportId={d.activeImport?.id ?? null} />}

      {tab === "especiais" && (
        <SpecialCasesEditor quotationId={id} summaries={d.specialSummaries} entries={redactEntries(d.specialEntries, canSensitive)} docs={docOpts} canWrite={canWrite} canSensitive={canSensitive} maxMb={maxMb} />
      )}

      {tab === "documentos" && (
        <Card>
          <CardContent className="space-y-4">
            {can(user.role, "document:write") && <UploadZone quotationId={id} maxMb={maxMb} />}
            <DocumentsTable docs={docs.map((x) => ({ ...x.d, uploaderName: x.uploaderName }))} canWrite={can(user.role, "document:write")} canSensitive={canSensitive} />
          </CardContent>
        </Card>
      )}

      {tab === "operadoras" && (
        <InsurersPanel
          quotationId={id}
          canWrite={canWrite}
          readyForMarket={d.completeness.pendingRequired === 0}
          available={await insurerOptions()}
          templates={templateOpts.filter((t) => t.audience === "operadora")}
          rows={qis.map((r) => ({
            ...r.qi,
            insurerName: r.insurer.name,
            proposals: r.proposalCount,
            followups: r.followups.map((f) => ({ id: f.f.id, occurredAt: f.f.occurredAt, channel: f.f.channel, notes: f.f.notes, userName: f.userName })),
          }))}
        />
      )}

      {tab === "propostas" && <ProposalsPanel quotationId={id} comparison={await getComparison(id)} insurers={qiOpts} docs={docOpts} canWrite={canWrite} maxMb={maxMb} />}

      {tab === "comparativo" && <ComparisonView quotationId={id} comparison={await getComparison(id)} />}

      {tab === "tarefas" && (
        <TaskList
          tasks={toTaskViews(await listTasks({ quotationId: id, view: s.todas === "1" ? "todas" : "abertas" }))}
          options={await taskOptions()}
          canWrite={can(user.role, "task:write")}
          defaults={{ companyId: q.companyId, quotationId: id }}
          showContext={false}
        />
      )}

      {tab === "interacoes" && (
        <div className="space-y-4">
          <InteractionForm quotationId={id} companyId={q.companyId} />
          <Card>
            <CardContent>
              <Timeline rows={await listTimeline({ quotationId: id, types: [...MANUAL_INTERACTION_TYPES] as InteractionType[] })} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "timeline" && (
        <Card>
          <CardContent>
            <Timeline rows={await listTimeline({ quotationId: id, limit: 500 })} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

async function CompanyTab({ q, companyId, canWrite, canCompany }: { q: NonNullable<Awaited<ReturnType<typeof getQuotationDetail>>>["q"]; companyId: string; canWrite: boolean; canCompany: boolean }) {
  const [company, insurers, copayMax] = await Promise.all([getCompanyDetail(companyId), insurerOptions(), getSetting("copay_max_pct")]);
  if (!company) return <EmptyState title="Empresa não encontrada" />;
  const c = company.c;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
          <Link href={`/empresas/${companyId}`} className="text-xs text-primary hover:underline">
            Abrir cadastro
          </Link>
        </CardHeader>
        <CardContent>
          <KeyValue
            cols={4}
            items={[
              { label: "Razão social", value: c.legalName },
              { label: "CNPJ principal", value: c.mainCnpj ? formatCnpj(c.mainCnpj) : null },
              { label: "Grupo econômico", value: c.economicGroup },
              { label: "Segmento", value: c.segment },
              { label: "Local", value: [c.city, c.uf].filter(Boolean).join("/") || null },
              { label: "Contato principal", value: company.contacts.find((x) => x.isPrimary)?.name ?? company.contacts[0]?.name },
              { label: "E-mail", value: company.contacts.find((x) => x.isPrimary)?.email ?? company.contacts[0]?.email },
              { label: "Executivo", value: company.ownerName },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Contrato(s) atual(is)</CardTitle>
            <CardDescription>Operadoras, vigência, renovação, planos, vidas, custo e reembolso por plano.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ContractsManager companyId={companyId} contracts={company.contracts} insurers={insurers} canWrite={canCompany} />
        </CardContent>
      </Card>
      <ConditionsForm quotationId={q.id} initial={q} canWrite={canWrite} />
      <ContributionForm quotationId={q.id} initial={q} copayMax={copayMax} canWrite={canWrite} />
    </div>
  );
}

async function LivesTab({ id, s, canImport, canSensitive, maxMb, hasActive, activeSummary, activeImportId }: { id: string; s: Record<string, string | undefined>; canImport: boolean; canSensitive: boolean; maxMb: number; hasActive: boolean; activeSummary: LivesSummary | null; activeImportId: string | null }) {
  const [imports, livesData] = await Promise.all([
    listImports(id),
    activeImportId ? listLives(activeImportId, { page: Number(s.lp ?? 1), onlyIssues: s.li === "1", includeSensitive: canSensitive }) : null,
  ]);
  return (
    <div className="space-y-4">
      {activeSummary && <LivesSummaryView s={activeSummary} showCid={canSensitive} />}
      {livesData && <LivesTable data={livesData} baseHref={`/cotacoes/${id}?tab=base`} onlyIssues={s.li === "1"} />}
      {canImport && <LivesImporter quotationId={id} maxMb={maxMb} showCid={canSensitive} hasActive={hasActive} />}
      {!canImport && !activeSummary && <EmptyState title="Base de vidas não importada" />}
      <ImportHistory imports={imports.map((i) => ({ ...i.i, userName: i.userName }))} canWrite={canImport} />
    </div>
  );
}
