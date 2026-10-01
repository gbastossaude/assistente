import { notFound } from "next/navigation";
import { CompanyForm } from "@/components/companies/company-form";
import { PageHeader } from "@/components/ui/misc";
import { formatCnpj } from "@/lib/domain/cnpj";
import { requirePermission } from "@/server/auth";
import { getCompanyDetail } from "@/server/services/companies";
import { userOptions } from "@/server/services/users";

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("company:write");
  const { id } = await params;
  const d = await getCompanyDetail(id);
  if (!d || d.c.deletedAt) notFound();
  const c = d.c;
  return (
    <>
      <PageHeader title={`Editar ${c.tradeName ?? c.legalName}`} back={{ href: `/empresas/${id}`, label: "Voltar" }} />
      <CompanyForm
        id={id}
        users={await userOptions()}
        initial={{
          legalName: c.legalName,
          tradeName: c.tradeName ?? "",
          mainCnpj: c.mainCnpj ? formatCnpj(c.mainCnpj) : "",
          economicGroup: c.economicGroup ?? "",
          segment: c.segment ?? "",
          estimatedLives: c.estimatedLives?.toString() ?? "",
          city: c.city ?? "",
          uf: c.uf ?? "",
          ownerId: c.ownerId ?? "",
          origin: c.origin ?? "",
          notes: c.notes ?? "",
          isClient: c.isClient,
        }}
      />
    </>
  );
}
