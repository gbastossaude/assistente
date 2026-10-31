import { useEffect, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@especialista/ui";
import { sb, unwrap } from "./supabase.ts";

/** Lê e grava uma chave de system_settings (somente administradores gravam — garantido pela RLS). */
export function useSetting<T extends Record<string, unknown>>(key: string) {
  const [value, setValue] = useState<T | null>(null);
  const [saved, setSaved] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    sb.from("system_settings").select("value").eq("key", key).single().then(({ data, error }) => {
      if (error) return toast.error(errorMessage(error));
      setValue(data.value as T);
      setSaved(data.value as T);
    });
  }, [key]);
  const save = async (next?: T) => {
    const v = next ?? value;
    if (!v) return;
    setBusy(true);
    try {
      const rows = unwrap(await sb.from("system_settings").update({ value: v, updated_at: new Date().toISOString() }).eq("key", key).select("key"));
      if (!rows.length) throw new Error("Sem permissão para alterar configurações.");
      setSaved(v);
      setValue(v);
      toast.success("Configuração salva.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  return { value, set: (p: Partial<T>) => setValue((v) => (v ? { ...v, ...p } : v)), save, busy, dirty };
}
