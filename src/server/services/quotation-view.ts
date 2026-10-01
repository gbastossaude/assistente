import "server-only";
import { SPECIAL_CASES, type SpecialCaseKind } from "@/lib/domain/special-cases";

/** Remove campos sensíveis (CID, relatórios, observações clínicas) para perfis sem sensitive:read. */
export function redactEntries<T extends { kind: SpecialCaseKind; data: Record<string, unknown> }>(entries: T[], canSensitive: boolean): T[] {
  if (canSensitive) return entries;
  return entries.map((e) => {
    const sensitive = new Set(SPECIAL_CASES[e.kind].entryFields.filter((f) => f.sensitive).map((f) => f.key));
    return { ...e, data: Object.fromEntries(Object.entries(e.data).map(([k, v]) => [k, sensitive.has(k) && v ? "•••" : v])) };
  });
}
