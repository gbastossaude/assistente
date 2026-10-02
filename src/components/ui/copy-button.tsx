"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "./button";

/** Copia o texto para a área de transferência (com fallback para navegadores sem Clipboard API). */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label = "Copiar", successMessage = "Copiado!", onCopied, ...props }: { text: string | (() => string); label?: string; successMessage?: string; onCopied?: () => void } & Omit<ButtonProps, "onClick">) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      {...props}
      onClick={async () => {
        const ok = await copyText(typeof text === "function" ? text() : text);
        if (ok) {
          toast.success(successMessage);
          setDone(true);
          onCopied?.();
          setTimeout(() => setDone(false), 1500);
        } else toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
      }}
    >
      {done ? <Check /> : <Copy />}
      {label && <span>{label}</span>}
    </Button>
  );
}
