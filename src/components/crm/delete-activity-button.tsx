"use client";
import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/components/ui/use-action";
import { deleteInteractionAction } from "@/server/actions/interactions";

export function DeleteActivityButton({ id, label }: { id: string; label: string }) {
  const { run } = useAction();
  return (
    <ConfirmButton
      title="Excluir atividade?"
      description={`“${label}” será removida da linha do tempo. A exclusão fica registrada na auditoria.`}
      confirmLabel="Excluir"
      size="icon-sm"
      className="size-6 text-muted hover:text-red-600"
      ariaLabel="Excluir atividade"
      onConfirm={() => run(() => deleteInteractionAction(id))}
    >
      <Trash2 className="size-3.5" />
    </ConfirmButton>
  );
}
