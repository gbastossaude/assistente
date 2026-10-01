import Link from "next/link";
import { InsurerFormButton } from "@/components/insurers/insurer-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/inputs";
import { PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { sp } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { listInsurers } from "@/server/services/insurers";

export const metadata = { title: "Operadoras" };

export default async function InsurersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const rows = await listInsurers({ q: sp((await searchParams).q), includeInactive: true });
  return (
    <>
      <PageHeader title="Operadoras e seguradoras" description="Cadastro e desempenho: cotações ativas, aguardando retorno e tempo médio de resposta" actions={can(user.role, "insurer:write") && <InsurerFormButton />} />
      <form className="mb-3 max-w-sm" role="search">
        <Input name="q" placeholder="Buscar operadora" />
      </form>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Operadora</Th>
              <Th>Tipo</Th>
              <Th>Contato</Th>
              <Th className="text-right">Cotações ativas</Th>
              <Th className="text-right">Aguardando retorno</Th>
              <Th className="text-right">Tempo médio de retorno</Th>
              <Th className="text-right">Declinadas / enviadas</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, activeQuotes, awaiting, avgResponseDays, totalSent, declined }) => (
              <tr key={i.id} className={i.active ? "" : "opacity-60"}>
                <Td>
                  <Link className="font-medium hover:underline" href={`/operadoras/${i.id}`}>
                    {i.name}
                  </Link>
                  {!i.active && <Badge tone="zinc" className="ml-2">Inativa</Badge>}
                </Td>
                <Td className="capitalize">{i.kind}</Td>
                <Td className="text-xs">{[i.contactName, i.email].filter(Boolean).join(" · ") || "—"}</Td>
                <Td className="text-right tabular-nums">{activeQuotes}</Td>
                <Td className="text-right tabular-nums">{awaiting ? <Badge tone="amber">{awaiting}</Badge> : 0}</Td>
                <Td className="text-right tabular-nums">{avgResponseDays === null ? "—" : `${avgResponseDays.toLocaleString("pt-BR")} dias`}</Td>
                <Td className="text-right tabular-nums">
                  {declined} / {totalSent}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
