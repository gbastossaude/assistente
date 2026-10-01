import { CompanyForm } from "@/components/companies/company-form";
import { PageHeader } from "@/components/ui/misc";
import { requirePermission } from "@/server/auth";
import { userOptions } from "@/server/services/users";

export const metadata = { title: "Nova empresa" };

export default async function NewCompanyPage() {
  await requirePermission("company:write");
  return (
    <>
      <PageHeader title="Nova empresa" back={{ href: "/empresas", label: "Empresas" }} />
      <CompanyForm users={await userOptions()} />
    </>
  );
}
