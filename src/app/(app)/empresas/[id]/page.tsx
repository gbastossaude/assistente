import { FilePlus2, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InteractionForm } from "@/components/crm/interaction-form";
import { Timeline } from "@/components/crm/timeline";
import { CnpjManager, ContactsManager, ContractsManager } from "@/components/companies/managers";
import { DeleteCompanyButton } from "@/components/companies/delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, KeyValue, PageHeader, Table, TabLinks, Td, Th } from "@/components/ui/misc";
import { QuotationStatusBadge, RenewalStatusBadge } from "@/components/ui/status";
import { can } from "@/lib/auth/permissions";
import { inScope } from "@/lib/auth/scope";
import { formatCnpj } from "@/lib/domain/cnpj";
import { formatDateBR, relativeDays } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getScope } from "@/server/scope";
import { getCompanyDetail } from "@/server/services/companies";
import { insurerOptions } from "@/server/services/insurers";
import { listTimeline } from "@/server/services/interactions";

const TABS = ["visao", "cnpjs", "contatos", "contratos", "cotacoes", "renovacoes", "timeline"] as const;

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = (TABS as readonly string[]).includes(rawTab ?? "") ? rawTab! : "visao";
  const d = await getCompanyDetail(id);
  if (!d || !inScope(await getScope(user), d.c.ownerId)) notFound();
  const c = d.c;
  const canWrite = can(user.role, "company:write") && !c.deletedAt;
  const [timeline, insurers] = await Promise.all([tab === "timeline" || tab === "visao" ? listTimeline({ companyId: id, limit: tab === "visao" ? 8 : 300 }) : [], tab === "contratos" ? insurerOptions() : []]);
  const totalLives = d.contracts.flatMap((x) => x.plans).reduce((a, p) => a + (p.lives ?? 0), 0);

  return (
    <>
      <PageHeader
        back={{ href: "/empresas", label: "Empresas" }}
        title={
          <span className="flex items-center gap-2">
            {c.tradeName ?? c.legalName}
            <Badge tone={c.isClient ? "emerald" : "slate"}>{c.isClient ? "Cliente" : "Prospect"}</Badge>
            {c.deletedAt && <Badge tone="red">Excluída</Badge>}
          </span>
        }
        description={`${c.legalName}${c.mainCnpj ? ` · ${formatCnpj(c.mainCnpj)}` : ""}${c.economicGroup ? ` · Grupo ${c.economicGroup}` : ""}`}
        actions={
          canWrite && (
            <>
              <Button asChild variant="outline">
                <Link href={`/empresas/${id}/editar`}>
                  <Pencil /> Editar
                </Link>
              </Button>
              {can(user.role, "quotation:write") && (
                <Button asChild>
                  <Link href={`/cotacoes/nova?empresa=${id}`}>
                    <FilePlus2 /> Nova cotação
                  </Link>
                </Button>
              )}
              {can(user.role, "delete") && <DeleteCompanyButton id={id} name={c.legalName} />}
            </>
          )
        }
      />
      <TabLinks
        baseHref={`/empresas/${id}`}
        active={tab}
        tabs={[
          { key: "visao", label: "Visão geral" },
          { key: "cnpjs", label: "CNPJs", count: d.cnpjs.length },
          { key: "contatos", label: "Contatos", count: d.contacts.length },
          { key: "contratos", label: "Contratos atuais", count: d.contracts.length },
          { key: "cotacoes", label: "Cotações", count: d.quotations.length },
          { key: "renovacoes", label: "Renovações", count: d.renewals.length },
          { key: "timeline", label: "Timeline" },
        ]}
      />

      {tab === "visao" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Dados básicos</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                cols={3}
                items={[
                  { label: "Razão social", value: c.legalName },
                  { label: "Nome fantasia", value: c.tradeName },
                  { label: "CNPJ principal", value: c.mainCnpj ? formatCnpj(c.mainCnpj) : null },
                  { label: "CNPJs participantes", value: d.cnpjs.length },
                  { label: "Grupo econômico", value: c.economicGroup },
                  { label: "Segmento", value: c.segment },
                  { label: "Vidas estimadas", value: formatNumber(c.estimatedLives) },
                  { label: "Vidas em contratos atuais", value: formatNumber(totalLives) },
                  { label: "Endereço", value: c.address },
                  { label: "Local", value: [c.city, c.uf].filter(Boolean).join("/") || null },
                  { label: "Executivo responsável", value: d.ownerName },
                  { label: "Origem", value: c.origin },
                  { label: "Contato principal", value: d.contacts.find((x) => x.isPrimary)?.name ?? d.contacts[0]?.name },
                ]}
              />
              {c.notes && <p className="mt-4 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-sm">{c.notes}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Contratos atuais</CardTitle>
              <Link className="text-xs text-primary hover:underline" href={`/empresas/${id}?tab=contratos`}>
                Gerenciar
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.contracts.length === 0 && <p className="text-sm text-muted">Nenhum contrato cadastrado.</p>}
              {d.contracts.map((ct) => (
                <div key={ct.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{ct.insurerName}</span>
                    <span className="block text-xs text-muted">{ct.plans.length} plano(s) · {formatNumber(ct.plans.reduce((a, p) => a + (p.lives ?? 0), 0))} vidas</span>
                  </span>
                  <span className="text-right text-xs text-muted">
                    Aniversário
                    <span className="block text-foreground">{formatDateBR(ct.anniversaryDate)}</span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="xl:col-span-3">
            <CardHeader>
              <CardTitle>Últimas movimentações</CardTitle>
              <Link className="text-xs text-primary hover:underline" href={`/empresas/${id}?tab=timeline`}>
                Ver tudo
              </Link>
            </CardHeader>
            <CardContent>
              <Timeline rows={timeline} showContext />
            </CardContent>
          </Card>
        </div>
      )}
      {tab === "cnpjs" && (
        <Card>
          <CardContent>
            <CnpjManager companyId={id} cnpjs={d.cnpjs} canWrite={canWrite} />
          </CardContent>
        </Card>
      )}
      {tab === "contatos" && (
        <Card>
          <CardContent>
            <ContactsManager companyId={id} contacts={d.contacts} canWrite={canWrite} />
          </CardContent>
        </Card>
      )}
      {tab === "contratos" && <ContractsManager companyId={id} contracts={d.contracts} insurers={insurers} canWrite={canWrite} />}
      {tab === "cotacoes" &&
        (d.quotations.length === 0 ? (
          <EmptyState title="Nenhuma cotação para esta empresa" />
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Tipo</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Vidas</Th>
                  <Th>Abertura</Th>
                  <Th>Data-alvo</Th>
                  <Th>Responsável</Th>
                </tr>
              </thead>
              <tbody>
                {d.quotations.map(({ q, ownerName }) => (
                  <tr key={q.id}>
                    <Td>
                      <Link className="font-medium hover:underline" href={`/cotacoes/${q.id}`}>
                        {q.code}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={q.processType === "NEW" ? "blue" : "violet"}>{q.processType}</Badge>
                    </Td>
                    <Td>
                      <QuotationStatusBadge value={q.status} />
                    </Td>
                    <Td className="text-right tabular-nums">{formatNumber(q.estimatedLives)}</Td>
                    <Td>{formatDateBR(q.openedAt)}</Td>
                    <Td>{formatDateBR(q.targetDate)}</Td>
                    <Td>{ownerName ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ))}
      {tab === "renovacoes" &&
        (d.renewals.length === 0 ? (
          <EmptyState title="Nenhuma renovação cadastrada" action={<Button asChild size="sm"><Link href={`/renovacoes?nova=1&empresa=${id}`}>Cadastrar renovação</Link></Button>} />
        ) : (
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Aniversário</Th>
                  <Th>Operadora</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Vidas</Th>
                </tr>
              </thead>
              <tbody>
                {d.renewals.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/renovacoes?id=${r.id}`} className="hover:underline">
                        {formatDateBR(r.anniversaryDate)}
                      </Link>{" "}
                      <span className="text-xs text-muted">({relativeDays(r.anniversaryDate)})</span>
                    </Td>
                    <Td>{r.insurerName ?? "—"}</Td>
                    <Td>
                      <RenewalStatusBadge value={r.status} />
                    </Td>
                    <Td className="text-right">{formatNumber(r.lives)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ))}
      {tab === "timeline" && (
        <div className="space-y-4">
          {can(user.role, "read") && <InteractionForm companyId={id} />}
          <Card>
            <CardContent>
              <Timeline rows={timeline} showContext />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
