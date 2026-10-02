import { and, eq, isNull, sql } from "drizzle-orm";
import { WizardSteps } from "@/components/quotations/wizard-steps";
import { Step1Form } from "@/components/quotations/step1-form";
import { PageHeader } from "@/components/ui/misc";
import { nextAnniversary, todayISO } from "@/lib/domain/dates";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { companies, companyCnpjs, currentContracts } from "@/server/db/schema";
import { userOptions } from "@/server/services/users";
import { getScope, ownerCond } from "@/server/scope";

export const metadata = { title: "Nova cotação" };

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const user = await requirePermission("quotation:write");
  const { empresa } = await searchParams;
  const today = todayISO();
  const scope = await getScope(user);
  const [cos, cnpjs, anniversaries, users] = await Promise.all([
    db
      .select({ id: companies.id, name: sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})`, legalName: companies.legalName, estimatedLives: companies.estimatedLives })
      .from(companies)
      .where(and(isNull(companies.deletedAt), ownerCond(scope, companies.ownerId)))
      .orderBy(companies.legalName),
    db.select({ companyId: companyCnpjs.companyId, cnpj: companyCnpjs.cnpj }).from(companyCnpjs),
    db
      .select({ companyId: currentContracts.companyId, date: currentContracts.anniversaryDate })
      .from(currentContracts)
      .where(and(isNull(currentContracts.deletedAt), eq(currentContracts.active, true))),
    userOptions(scope),
  ]);
  const options = cos.map((c) => {
    const dates = anniversaries.filter((a) => a.companyId === c.id && a.date).map((a) => nextAnniversary(a.date!, today)).sort();
    return { ...c, cnpjs: cnpjs.filter((x) => x.companyId === c.id).map((x) => x.cnpj), nextAnniversary: dates[0] ?? null };
  });
  return (
    <>
      <PageHeader title="Nova cotação" description="Wizard Grandes Contas +99 — cada etapa salva automaticamente e pode ser retomada" back={{ href: "/cotacoes", label: "Cotações" }} />
      <WizardSteps current={1} />
      <Step1Form companies={options} users={users} defaultCompanyId={empresa} today={today} currentUserId={user.id} />
    </>
  );
}
