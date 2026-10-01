"use client";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/ui/use-action";
import { restoreCompanyAction } from "@/server/actions/companies";

export function RestoreCompanyButton({ id }: { id: string }) {
  const { run, pending } = useAction();
  return (
    <Button size="sm" variant="outline" loading={pending} onClick={() => run(() => restoreCompanyAction(id))}>
      Restaurar
    </Button>
  );
}
