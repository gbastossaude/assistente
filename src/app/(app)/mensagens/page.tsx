import { LibraryView } from "@/components/library/library-view";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/server/auth";
import { listLibrary } from "@/server/services/library";

export const metadata = { title: "Mensagens prontas" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ q?: string; inativas?: string }> }) {
  const user = await requireUser();
  const s = await searchParams;
  const canWrite = can(user.role, "content:write");
  const items = await listLibrary("mensagem", { includeInactive: canWrite && s.inativas === "1" });
  return (
    <>
      <PageHeader title="Mensagens prontas" description="WhatsApp e e-mail para cada etapa da venda — preencha as variáveis e copie com um clique. Nada é enviado automaticamente." />
      <LibraryView kind="mensagem" items={items.map(({ id, kind, category, title, channel, subject, body, active, sourceKey }) => ({ id, kind: kind as "mensagem", category, title, channel, subject, body, active, sourceKey }))} canWrite={canWrite} consultant={user.name.replace(/\s*\(.*\)$/, "")} initialQuery={s.q} />
    </>
  );
}
