/**
 * Endereço do projeto Supabase e chave pública (anon/publishable). Ambos são públicos por desenho —
 * o acesso é protegido por login e RLS. Nunca coloque chaves administrativas (service_role) aqui.
 */
export interface ExtensionConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const BUILT: ExtensionConfig | null =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? { supabaseUrl: import.meta.env.VITE_SUPABASE_URL, supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY }
    : null;

const KEY = "especialista.config";

export function isServiceRoleKey(key: string): boolean {
  try {
    const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch {
    return /^sb_secret_/.test(key);
  }
}

export async function loadConfig(): Promise<ExtensionConfig | null> {
  if (BUILT) return BUILT;
  const stored = await chrome.storage.local.get(KEY);
  return (stored[KEY] as ExtensionConfig | undefined) ?? null;
}

export async function saveConfig(cfg: ExtensionConfig): Promise<void> {
  const url = new URL(cfg.supabaseUrl);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Use um endereço HTTPS.");
  if (isServiceRoleKey(cfg.supabaseAnonKey)) throw new Error("Esta é uma chave administrativa (service_role). Use a chave pública (anon).");
  await chrome.storage.local.set({ [KEY]: { supabaseUrl: url.origin, supabaseAnonKey: cfg.supabaseAnonKey.trim() } });
}

export const configIsBuiltIn = BUILT !== null;
