import { CompanyForm } from "@/components/companies/company-form";
import { PageHeader } from "@/components/ui/misc";
import { requirePermission } from "@/server/auth";
import { userOptions } from "@/server/services/users";
import { getScope } from "@/server/scope";

export const metadata = { title: "Nova empresa" };

export default async function NewCompanyPage() {
  const user = await requirePermission("company:write");
  return (
    <>
      <PageHeader title="Nova empresa" back={{ href: "/empresas", label: "Empresas" }} />
      <CompanyForm users={await userOptions(await getScope(user))} />
    </>
  );
}
