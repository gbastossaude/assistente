"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { useAction } from "@/components/ui/use-action";
import { deleteCompanyAction } from "@/server/actions/companies";

export function DeleteCompanyButton({ id, name }: { id: string; name: string }) {
  const { run } = useAction();
  const router = useRouter();
  return (
    <ConfirmButton
      title="Excluir empresa?"
      description={`${name} será excluída logicamente (pode ser restaurada). Empresas com cotações em andamento não podem ser excluídas.`}
      triggerVariant="ghost"
      size="icon"
      onConfirm={async () => {
        const r = await run(() => deleteCompanyAction(id), { refresh: false });
        if (r.ok) router.push("/empresas");
      }}
    >
      <Trash2 />
    </ConfirmButton>
  );
}
