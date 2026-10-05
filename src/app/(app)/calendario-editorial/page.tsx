import { EditorialPlanner } from "@/components/editorial/editorial-planner";
import { PageHeader } from "@/components/ui/misc";
import { todayISO } from "@/lib/domain/dates";
import { defaultEditorialStart, suggestImportantDates } from "@/lib/domain/editorial-calendar";
import { requirePermission } from "@/server/auth";

export const metadata = { title: "Calendário editorial" };

export default async function EditorialCalendarPage() {
  await requirePermission("content:write");
  const startDate = defaultEditorialStart(todayISO());
  const niche = "Planos de saúde (corretora)";
  return (
    <>
      <PageHeader
        title="Calendário editorial"
        description="30 dias de posts para redes sociais com pilar, formato, tema, legenda resumida e CTA — mais resumo semanal, ideias de Stories e Reels e dicas de horário. Nada é publicado automaticamente."
      />
      <EditorialPlanner
        aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        initial={{
          startDate,
          niche,
          platform: "instagram",
          audience: "Sócios, RH e gestores de empresas e famílias que querem pagar menos sem perder rede",
          frequency: "5x_semana",
          pillars: "",
          objectives: "",
          product: "Diagnóstico gratuito do plano de saúde atual",
          launchWeek: "0",
          importantDates: suggestImportantDates(startDate, niche),
        }}
      />
    </>
  );
}
