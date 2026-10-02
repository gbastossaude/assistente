import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/inputs";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { formatCnpj } from "@/lib/domain/cnpj";
import { UFS } from "@/lib/domain/constants";
import { formatDateBR } from "@/lib/domain/dates";
import { formatNumber, sp } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { getScope } from "@/server/scope";
import { listCompanies } from "@/server/services/companies";
import { userOptions } from "@/server/services/users";
import { RestoreCompanyButton } from "@/components/companies/restore-button";

export const metadata = { title: "Empresas" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const scope = await getScope(user);
  const s = await searchParams;
  const filters = { q: sp(s.q), ownerId: sp(s.owner), uf: sp(s.uf), kind: sp(s.kind) as "cliente" | "prospect" | null, deleted: s.excluidas === "1" };
  const [rows, users] = await Promise.all([listCompanies({ ...filters, ownerIds: scope.all ? null : scope.ownerIds }), userOptions(scope)]);
  return (
    <>
      <PageHeader
        title="Empresas"
        description="Clientes, prospects, grupos econômicos e CNPJs"
        actions={
          can(user.role, "company:write") && (
            <Button asChild>
              <Link href="/empresas/nova">
                <Plus /> Nova empresa
              </Link>
            </Button>
          )
        }
      />
      <form className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <Input name="q" defaultValue={filters.q ?? ""} placeholder="Nome, grupo, CNPJ ou contato" className="lg:col-span-2" />
        <Select name="owner" defaultValue={filters.ownerId ?? ""}>
          <option value="">Todos os responsáveis</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select name="uf" defaultValue={filters.uf ?? ""}>
          <option value="">Todas as UFs</option>
          {UFS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </Select>
        <Select name="kind" defaultValue={filters.kind ?? ""}>
          <option value="">Clientes e prospects</option>
          <option value="cliente">Clientes</option>
          <option value="prospect">Prospects</option>
        </Select>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1">
            Filtrar
          </Button>
          {can(user.role, "delete") && (
            <Button asChild variant="ghost" title="Ver excluídas">
              <Link href={filters.deleted ? "/empresas" : "/empresas?excluidas=1"}>{filters.deleted ? "Ativas" : "Excluídas"}</Link>
            </Button>
          )}
        </div>
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={<Building2 />} title="Nenhuma empresa encontrada" description="Ajuste os filtros ou cadastre uma nova empresa." />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Empresa</Th>
                <Th>CNPJ principal</Th>
                <Th>Grupo</Th>
                <Th className="text-right">Vidas</Th>
                <Th>Local</Th>
                <Th>Responsável</Th>
                <Th>Próx. aniversário</Th>
                <Th className="text-right">Cotações</Th>
                {filters.deleted && <Th />}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, ownerName, cnpjCount, openQuotations, nextAnniversary }) => (
                <tr key={c.id} className="hover:bg-surface-2/50">
                  <Td>
                    <Link href={`/empresas/${c.id}`} className="font-medium hover:underline">
                      {c.tradeName ?? c.legalName}
                    </Link>
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      {c.tradeName && <span className="truncate">{c.legalName}</span>}
                      <Badge tone={c.isClient ? "emerald" : "slate"}>{c.isClient ? "Cliente" : "Prospect"}</Badge>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {c.mainCnpj ? formatCnpj(c.mainCnpj) : "—"}
                    {cnpjCount > 1 && <span className="ml-1 text-xs text-muted">+{cnpjCount - 1}</span>}
                  </Td>
                  <Td>{c.economicGroup ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(c.estimatedLives)}</Td>
                  <Td>{[c.city, c.uf].filter(Boolean).join("/") || "—"}</Td>
                  <Td>{ownerName ?? "—"}</Td>
                  <Td>{formatDateBR(nextAnniversary)}</Td>
                  <Td className="text-right">{openQuotations > 0 ? <Badge tone="indigo">{openQuotations} aberta(s)</Badge> : "—"}</Td>
                  {filters.deleted && (
                    <Td>
                      <RestoreCompanyButton id={c.id} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <p className="mt-2 text-xs text-muted">{rows.length} empresa(s)</p>
    </>
  );
}
