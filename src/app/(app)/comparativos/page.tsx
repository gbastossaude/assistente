import { Q_ID } from "@/server/db/qualified";
import Link from "next/link";
import { sql, and, isNull, eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { QuotationStatusBadge } from "@/components/ui/status";
import { formatDateBR } from "@/lib/domain/dates";
import { formatMoney, formatNumber } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { companies, proposals, quotations } from "@/server/db/schema";

export const metadata = { title: "Comparativos" };

export default async function ComparisonsPage() {
  await requireUser();
  const rows = await db
    .select({
      id: quotations.id,
      code: quotations.code,
      status: quotations.status,
      lives: quotations.estimatedLives,
      company: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})`,
      proposals: sql<number>`count(${proposals.id})::int`,
      highlighted: sql<number>`count(*) filter (where ${proposals.selectedForPresentation})::int`,
      lastAt: sql<string>`max(${proposals.receivedAt})::text`,
      minValue: sql<number | null>`(select min(t.total) from (select sum(pp.monthly_value) as total from proposal_plans pp join proposals p2 on p2.id = pp.proposal_id where p2.quotation_id = ${Q_ID} and p2.deleted_at is null group by p2.id) t)::float`,
    })
    .from(proposals)
    .innerJoin(quotations, eq(quotations.id, proposals.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(and(isNull(proposals.deletedAt), isNull(quotations.deletedAt)))
    .groupBy(quotations.id, companies.tradeName, companies.legalName)
    .orderBy(sql`max(${proposals.receivedAt}) desc`);
  return (
    <>
      <PageHeader title="Comparativos" description="Cotações com propostas recebidas — abra para comparar lado a lado, exportar em Excel ou imprimir/PDF" />
      {rows.length === 0 ? (
        <EmptyState title="Nenhuma proposta recebida ainda" />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Cotação</Th>
                <Th>Status</Th>
                <Th className="text-right">Vidas</Th>
                <Th className="text-right">Propostas</Th>
                <Th className="text-right">Menor total mensal</Th>
                <Th>Última proposta</Th>
                <Th>Destaque</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/cotacoes/${r.id}?tab=comparativo`} className="font-medium hover:underline">
                      {r.company}
                    </Link>
                    <span className="block text-xs text-muted">{r.code}</span>
                  </Td>
                  <Td>
                    <QuotationStatusBadge value={r.status} />
                  </Td>
                  <Td className="text-right">{formatNumber(r.lives)}</Td>
                  <Td className="text-right">{r.proposals}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(r.minValue)}</Td>
                  <Td>{formatDateBR(r.lastAt)}</Td>
                  <Td>{r.highlighted ? `${r.highlighted} destacada(s)` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
