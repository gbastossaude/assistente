import { LibraryView } from "@/components/library/library-view";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/server/auth";
import { listLibrary } from "@/server/services/library";

export const metadata = { title: "Respostas rápidas" };

export default async function AnswersPage({ searchParams }: { searchParams: Promise<{ q?: string; inativas?: string }> }) {
  const user = await requireUser();
  const s = await searchParams;
  const canWrite = can(user.role, "content:write");
  const items = await listLibrary("resposta", { includeInactive: canWrite && s.inativas === "1" });
  return (
    <>
      <PageHeader
        title="Respostas rápidas"
        description="Dúvidas frequentes sobre planos de saúde, prontas para copiar. As condições variam conforme operadora, contrato, região e análise — confirme sempre com a operadora."
      />
      <LibraryView kind="resposta" items={items.map(({ id, kind, category, title, channel, subject, body, active, sourceKey }) => ({ id, kind: kind as "resposta", category, title, channel, subject, body, active, sourceKey }))} canWrite={canWrite} consultant={user.name} initialQuery={s.q} />
    </>
  );
}
