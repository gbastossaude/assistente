import Link from "next/link";
import { notFound } from "next/navigation";
import { InsurerFormButton } from "@/components/insurers/insurer-form";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, KeyValue, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { InsurerStatusBadge } from "@/components/ui/status";
import { can } from "@/lib/auth/permissions";
import { formatDateBR } from "@/lib/domain/dates";
import { formatNumber } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth";
import { getInsurerDetail } from "@/server/services/insurers";

export default async function InsurerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("operations:read");
  const d = await getInsurerDetail((await params).id);
  if (!d) notFound();
  const i = d.insurer;
  return (
    <>
      <PageHeader
        title={i.name}
        back={{ href: "/operadoras", label: "Operadoras" }}
        actions={
          can(user.role, "insurer:write") && (
            <InsurerFormButton
              id={i.id}
              canDelete={can(user.role, "delete")}
              initial={{ name: i.name, kind: i.kind, ansCode: i.ansCode ?? "", contactName: i.contactName ?? "", email: i.email ?? "", phone: i.phone ?? "", followupDays: i.followupDays?.toString() ?? "", active: i.active, notes: i.notes ?? "" }}
            />
          )
        }
      />
      <Card className="mb-4">
        <CardContent>
          <KeyValue
            cols={4}
            items={[
              { label: "Tipo", value: i.kind },
              { label: "Registro ANS", value: i.ansCode },
              { label: "Contato", value: i.contactName },
              { label: "E-mail", value: i.email },
              { label: "Telefone", value: i.phone },
              { label: "Follow-up padrão", value: i.followupDays ? `${i.followupDays} dias` : "Regra geral" },
              { label: "Observações", value: i.notes },
            ]}
          />
        </CardContent>
      </Card>
      {d.quotes.length === 0 ? (
        <EmptyState title="Nenhuma cotação com esta operadora" />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Cotação</Th>
                <Th className="text-right">Vidas</Th>
                <Th>Status na operadora</Th>
                <Th>Protocolo</Th>
                <Th>Envio</Th>
                <Th>Retorno previsto</Th>
                <Th>Próx. follow-up</Th>
              </tr>
            </thead>
            <tbody>
              {d.quotes.map(({ qi, code, quotationId, companyName, lives }) => (
                <tr key={qi.id}>
                  <Td>
                    <Link className="font-medium hover:underline" href={`/cotacoes/${quotationId}?tab=operadoras`}>
                      {companyName}
                    </Link>
                    <span className="block text-xs text-muted">{code}</span>
                  </Td>
                  <Td className="text-right">{formatNumber(lives)}</Td>
                  <Td>
                    <InsurerStatusBadge value={qi.status} />
                  </Td>
                  <Td>{qi.protocol ?? "—"}</Td>
                  <Td>{qi.sentAt ? formatDateBR(qi.sentAt) : "—"}</Td>
                  <Td>{formatDateBR(qi.expectedReturnAt)}</Td>
                  <Td>{formatDateBR(qi.nextFollowupAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
