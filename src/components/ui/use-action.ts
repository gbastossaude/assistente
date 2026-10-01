"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

export type ActionResult<T = unknown> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Executa uma Server Action com toast de sucesso/erro e atualização da página.
 * Retorna o resultado para o chamador decidir (fechar diálogo, redirecionar…).
 */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const run = useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>, opts: { success?: string | false; refresh?: boolean } = {}): Promise<ActionResult<T>> => {
      let res: ActionResult<T>;
      try {
        res = await fn();
      } catch {
        res = { ok: false, error: "Falha de comunicação com o servidor. Tente novamente." };
      }
      if (res.ok) {
        setFieldErrors({});
        if (opts.success !== false) toast.success(res.message ?? opts.success ?? "Salvo com sucesso");
        if (opts.refresh !== false) startTransition(() => router.refresh());
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
      return res;
    },
    [router],
  );
  return { run, pending, fieldErrors, setFieldErrors };
}
