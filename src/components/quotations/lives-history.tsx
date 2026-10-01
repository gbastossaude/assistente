"use client";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/components/ui/use-action";
import { deactivateImportAction } from "@/server/actions/lives";
import { formatDateTimeBR } from "@/lib/domain/dates";
import { Badge } from "@/components/ui/badge";

export function ImportHistory({ imports, canWrite }: { imports: { id: string; fileName: string; sheetName: string; totalRows: number; errorRows: number; active: boolean; createdAt: Date; userName: string | null; documentId: string | null }[]; canWrite: boolean }) {
  const { run } = useAction();
  if (!imports.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface">
      <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted">Histórico de importações</p>
      <ul className="divide-y divide-border text-sm">
        {imports.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="flex-1">
              {i.fileName} <span className="text-xs text-muted">· aba {i.sheetName} · {i.totalRows} vidas · {i.errorRows} com erro · {formatDateTimeBR(i.createdAt)} · {i.userName}</span>
            </span>
            {i.active ? <Badge tone="emerald">Vigente</Badge> : <Badge tone="zinc">Substituída</Badge>}
            {i.documentId && (
              <Button asChild size="sm" variant="ghost">
                <a href={`/api/documents/${i.documentId}/download`}>Arquivo original</a>
              </Button>
            )}
            {canWrite && i.active && (
              <ConfirmButton title="Desativar importação?" description="A base deixa de valer para o checklist e o score; o histórico é preservado." onConfirm={() => run(() => deactivateImportAction(i.id))}>
                Desativar
              </ConfirmButton>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
