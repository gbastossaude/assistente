import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ExtensionConfig } from "./config.ts";

/** Sessão guardada em chrome.storage.local (apenas os tokens de sessão; a senha nunca é armazenada). */
const chromeStorage = {
  async getItem(key: string) {
    const r = await chrome.storage.local.get(key);
    return (r[key] as string | undefined) ?? null;
  },
  async setItem(key: string, value: string) {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string) {
    await chrome.storage.local.remove(key);
  },
};

export function createExtensionClient(cfg: ExtensionConfig): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { storage: chromeStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "especialista.auth" },
    global: { headers: { "x-client-info": "especialista-extension" } },
  });
}
