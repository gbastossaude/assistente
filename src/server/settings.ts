import "server-only";
import { eq } from "drizzle-orm";
import { DEFAULT_SETTINGS, AUTOMATION_RULES, type AppSettings, type SettingKey } from "@/lib/domain/settings-defaults";
import { db, type DbOrTx } from "./db";
import { automationRules, settings } from "./db/schema";

export async function getSetting<K extends SettingKey>(key: K, tx: DbOrTx = db): Promise<AppSettings[K]> {
  const [row] = await tx.select().from(settings).where(eq(settings.key, key));
  return (row?.value as AppSettings[K]) ?? DEFAULT_SETTINGS[key];
}

export async function getAllSettings(tx: DbOrTx = db): Promise<AppSettings> {
  const rows = await tx.select().from(settings);
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as AppSettings;
}

export interface RuleConfig {
  enabled: boolean;
  params: Record<string, number>;
}

/** Configuração efetiva de uma regra de automação (banco sobrepõe padrão). */
export async function getRule(key: string, tx: DbOrTx = db): Promise<RuleConfig> {
  const def = AUTOMATION_RULES.find((r) => r.key === key);
  const [row] = await tx.select().from(automationRules).where(eq(automationRules.key, key));
  return {
    enabled: row?.enabled ?? true,
    params: { ...(def?.params ?? {}), ...((row?.params as Record<string, number>) ?? {}) },
  };
}
