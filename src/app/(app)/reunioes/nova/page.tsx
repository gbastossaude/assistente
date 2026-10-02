import { MeetingForm, type MeetingFormValue } from "@/components/meetings/meeting-form";
import { PageHeader } from "@/components/ui/misc";
import { requirePermission } from "@/server/auth";
import { defaultQuestions } from "@/lib/domain/meetings";
import { todayISO } from "@/lib/domain/dates";
import { getScope } from "@/server/scope";
import { commercialOptions } from "@/server/services/options";

export const metadata = { title: "Nova reunião" };

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("meeting:write");
  const s = await searchParams;
  const options = await commercialOptions(await getScope(user));
  const opp = options.opportunities.find((o) => o.id === s.oportunidade);
  const company = options.companies.find((c) => c.id === (s.empresa ?? opp?.companyId));
  const initial: MeetingFormValue = {
    title: opp ? `Diagnóstico — ${opp.name}` : "Reunião de diagnóstico",
    opportunityId: opp?.id ?? "",
    companyId: company?.id ?? "",
    quotationId: "",
    clientName: opp?.contactName ?? "",
    companyName: company?.name ?? opp?.name ?? "",
    advisorName: "",
    salesRepName: "",
    ownerId: "",
    date: s.data && /^\d{4}-\d{2}-\d{2}$/.test(s.data) ? s.data : todayISO(),
    startTime: "10:00",
    endTime: "11:00",
    participants: "",
    location: "",
    objective: "Entender a necessidade do cliente e coletar os dados para a cotação",
    summary: "",
    status: "agendada",
    questions: defaultQuestions(),
    actions: [],
    addToAgenda: true,
  };
  return (
    <>
      <PageHeader back={{ href: "/reunioes", label: "Reuniões" }} title="Nova reunião" description="Preencha durante ou logo após a conversa — a ata é gerada a partir das respostas" />
      <MeetingForm initial={initial} options={options} outputs={null} canWrite />
    </>
  );
}
