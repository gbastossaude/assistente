"use client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Tratamento centralizado de erros de renderização: mensagem amigável, sem detalhes técnicos. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-surface p-6 text-center">
      <AlertTriangle className="mx-auto size-8 text-amber-500" />
      <h1 className="mt-2 text-lg font-semibold">Não foi possível carregar esta tela</h1>
      <p className="mt-1 text-sm text-muted">Tente novamente. Se o problema persistir, informe o código abaixo ao suporte.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">{error.digest}</p>}
      <Button className="mt-4" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}
