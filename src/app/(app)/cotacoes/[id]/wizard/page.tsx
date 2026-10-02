import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractsManager } from "@/components/companies/managers";
import { DocumentsTable, UploadZone } from "@/components/documents/documents-panel";
import { ConditionsForm } from "@/components/quotations/conditions-form";
import { ContributionForm } from "@/components/quotations/contribution-form";
import { SpecialCasesEditor } from "@/components/quotations/special-cases-editor";
import { WizardSteps } from "@/components/quotations/wizard-steps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { CompletenessBar } from "@/components/ui/status";
import { can } from "@/lib/auth/permissions";
import { inScope } from "@/lib/auth/scope";
import { requireUser } from "@/server/auth";
import { getScope } from "@/server/scope";
import { getCompanyDetail } from "@/server/services/companies";
import { listDocuments } from "@/server/services/documents";
import { insurerOptions } from "@/server/services/insurers";
import { getQuotationDetail } from "@/server/services/quotations";
import { redactEntries } from "@/server/services/quotation-view";
import { getSetting } from "@/server/settings";
import { maxUploadBytes } from "@/server/storage";

export default async function WizardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const step = Math.min(5, Math.max(2, Number((await searchParams).step ?? 2) || 2));
  const d = await getQuotationDetail(id);
  if (!d || !inScope(await getScope(user), d.q.ownerId)) notFound();
  const canWrite = can(user.role, "quotation:write") && !d.closed;
  const canSensitive = can(user.role, "sensitive:read");
  const maxMb = Math.round(maxUploadBytes() / 1024 / 1024);
  const q = d.q;
  const next = (n: number) => `/cotacoes/${id}/wizard?step=${n}`;

  return (
    <>
      <PageHeader
        title={`${q.code} — ${d.company.tradeName ?? d.company.legalName}`}
        description={`${q.processType} · ${q.estimatedLives} vidas · completude ${d.completeness.pct}% (${d.completeness.label})`}
        back={{ href: `/cotacoes/${id}`, label: "Central da cotação" }}
        actions={
          <div className="flex items-center gap-3">
            <CompletenessBar pct={d.completeness.pct} />
            <Button asChild variant="outline">
              <Link href={`/cotacoes/${id}`}>Ir para a central</Link>
            </Button>
          </div>
        }
      />
      <WizardSteps current={step} quotationId={id} reached={q.wizardStep} />
      {step === 2 && <Step2 id={id} companyId={q.companyId} canWrite={canWrite} initial={q} nextHref={next(3)} canCompany={can(user.role, "company:write")} />}
      {step === 3 && (
        <ContributionForm quotationId={id} initial={q} copayMax={await getSetting("copay_max_pct")} canWrite={canWrite} nextHref={next(4)} submitLabel="Salvar e continuar →" />
      )}
      {step === 4 && (
        <>
          <SpecialCasesEditor
            quotationId={id}
            summaries={d.specialSummaries}
            entries={redactEntries(d.specialEntries, canSensitive)}
            docs={(await listDocuments({ quotationId: id })).map((x) => ({ id: x.d.id, fileName: x.d.fileName, docType: x.d.docType }))}
            canWrite={canWrite}
            canSensitive={canSensitive}
            maxMb={maxMb}
          />
          <div className="mt-4 flex justify-end">
            <Button asChild>
              <Link href={next(5)}>Continuar para documentos →</Link>
            </Button>
          </div>
        </>
      )}
      {step === 5 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Documentos do processo</CardTitle>
                <CardDescription>Base de vidas, fatura, sinistralidade, evolução de vidas, maiores usuários, picos, relatórios médicos, liminares, contrato e proposta atuais.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {can(user.role, "document:write") && <UploadZone quotationId={id} maxMb={maxMb} defaultType="sinistralidade" />}
              <DocumentsTable
                docs={(await listDocuments({ quotationId: id })).map((x) => ({ ...x.d, uploaderName: x.uploaderName }))}
                canWrite={can(user.role, "document:write")}
                canSensitive={canSensitive}
              />
              <p className="text-xs text-muted">
                A base de vidas é importada com validação na aba{" "}
                <Link className="text-primary underline" href={`/cotacoes/${id}?tab=base`}>
                  Base de Vidas
                </Link>
                .
              </p>
            </CardContent>
          </Card>
          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <Link href={`/cotacoes/${id}?tab=base`}>Importar base de vidas</Link>
            </Button>
            <Button asChild>
              <Link href={`/cotacoes/${id}?tab=checklist`}>Concluir e ver checklist →</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

async function Step2({ id, companyId, canWrite, initial, nextHref, canCompany }: { id: string; companyId: string; canWrite: boolean; initial: Parameters<typeof ConditionsForm>[0]["initial"]; nextHref: string; canCompany: boolean }) {
  const [company, insurers] = await Promise.all([getCompanyDetail(companyId), insurerOptions()]);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Operadora(s) / seguradora(s) atual(is)</CardTitle>
            <CardDescription>Vigência, renovação, planos, vidas, custo e reembolso de consulta por plano — um contrato por operadora.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ContractsManager companyId={companyId} contracts={company?.contracts ?? []} insurers={insurers} canWrite={canCompany} />
        </CardContent>
      </Card>
      <ConditionsForm quotationId={id} initial={initial} canWrite={canWrite} nextHref={nextHref} submitLabel="Salvar e continuar →" />
    </div>
  );
}
