import { PlaybookView } from "@/components/playbook/playbook-view";
import { PageHeader } from "@/components/ui/misc";
import { can } from "@/lib/auth/permissions";
import { sp } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { listPlaybook } from "@/server/services/playbook";

export const metadata = { title: "Playbook" };

export default async function PlaybookPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("read");
  const s = await searchParams;
  const canEdit = can(user.role, "settings:manage");
  const entries = await listPlaybook({ includeInactive: canEdit });
  return (
    <>
      <PageHeader
        title="Playbook Estratégico"
        description="Regras das modalidades, coberturas, qualificação, SPIN, ganchos e cadência de follow-up — conteúdo do Arsenal Be Smart. Confirme regras de carência, reajuste e documentação com a operadora antes de citar ao cliente."
      />
      <PlaybookView
        entries={entries.map(({ id, section, key, title, subtitle, objective, kind, body, active }) => ({ id, section, key, title, subtitle, objective, kind, body, active }))}
        canEdit={canEdit}
        initialSection={sp(s.secao) ?? undefined}
      />
    </>
  );
}
