import { useEffect, useState } from "react";
import { PRODUCT_NAME_DEFAULT } from "@especialista/shared";
import { sb } from "./supabase.ts";

export interface Branding {
  product_name: string;
  company_name: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
}

const DEFAULT: Branding = { product_name: PRODUCT_NAME_DEFAULT, company_name: "", logo_url: "", primary_color: "#0B1F3A", accent_color: "#2563EB" };

export function applyBranding(b: Branding) {
  const root = document.documentElement.style;
  if (/^#[0-9a-f]{6}$/i.test(b.primary_color)) root.setProperty("--color-brand-900", b.primary_color);
  if (/^#[0-9a-f]{6}$/i.test(b.accent_color)) root.setProperty("--color-accent-600", b.accent_color);
  document.title = `${b.product_name} — Painel`;
}

/** Identidade visual (nome, logo e cores) configurável em Configurações → Identidade visual. */
export function useBranding(enabled: boolean) {
  const [branding, setBranding] = useState<Branding>(DEFAULT);
  useEffect(() => {
    if (!enabled) return;
    sb.from("system_settings").select("value").eq("key", "branding").maybeSingle().then(({ data }) => {
      const b = { ...DEFAULT, ...((data?.value as Partial<Branding>) ?? {}) };
      setBranding(b);
      applyBranding(b);
    });
  }, [enabled]);
  return branding;
}
