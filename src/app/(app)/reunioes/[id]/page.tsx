import Link from "next/link";
import { notFound } from "next/navigation";
import { MeetingStatusBadge, StageBadge } from "@/components/commercial/badges";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { meetingToForm } from "@/components/meetings/to-form";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { formatDateBR, formatDateTimeBR } from "@/lib/domain/dates";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getScope } from "@/server/scope";
import { getMeeting } from "@/server/services/meetings";
import { commercialOptions } from "@/server/services/options";

export const metadata = { title: "Reunião" };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let d: Awaited<ReturnType<typeof getMeeting>>;
  try {
    d = await getMeeting(id, user);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const options = await commercialOptions(await getScope(user));
  // A oportunidade vinculada pode estar encerrada (fora das opções abertas): mantém no seletor.
  if (d.opportunity && !options.opportunities.some((o) => o.id === d.opportunity!.id)) {
    options.opportunities.unshift({ id: d.opportunity.id, name: d.opportunity.clientName, companyId: d.m.companyId, contactName: d.m.clientName });
  }
  const { m } = d;
  return (
    <>
      <PageHeader
        back={{ href: "/reunioes", label: "Reuniões" }}
        title={m.title}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <MeetingStatusBadge value={m.status} /> {formatDateBR(m.date)} {m.startTime ? `· ${m.startTime.slice(0, 5)}` : ""} {m.companyName ? `· ${m.companyName}` : ""}
            {d.opportunity && (
              <Link href={`/crm/${d.opportunity.id}`} className="inline-flex items-center gap-1 hover:underline">
                · CRM <StageBadge value={d.opportunity.stage} />
              </Link>
            )}
          </span>
        }
      />
      <MeetingForm
        key={m.updatedAt.toISOString()}
        initial={meetingToForm(m)}
        options={options}
        canWrite={can(user.role, "meeting:write")}
        outputs={{ minutes: m.minutes, followupMessage: m.followupMessage, generatedAt: m.minutesGeneratedAt ? formatDateTimeBR(m.minutesGeneratedAt) : null, followupTask: d.followupTask }}
      />
    </>
  );
}
