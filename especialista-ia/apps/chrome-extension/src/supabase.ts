/* eslint-disable @typescript-eslint/no-explicit-any -- cliente Supabase sem tipos gerados, schema "especialista" */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DB_SCHEMA } from "@especialista/shared";
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

export function createExtensionClient(cfg: ExtensionConfig): SupabaseClient<any, any, any> {
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { storage: chromeStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "especialista.auth" },
    db: { schema: DB_SCHEMA },
    global: { headers: { "x-client-info": "especialista-extension" } },
  });
}
