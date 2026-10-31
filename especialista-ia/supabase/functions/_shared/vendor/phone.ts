// ARQUIVO GERADO por scripts/sync-edge-shared.mjs a partir de packages/shared/src — não edite aqui.
/**
 * Telefones no formato usado pela WhatsApp Cloud API (apenas dígitos, com DDI, sem "+").
 * Para celulares brasileiros a Meta pode entregar o wa_id sem o nono dígito; por isso a
 * autorização compara todas as variantes.
 */

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Normaliza um telefone digitado (ex.: "(11) 98765-4321") para "5511987654321". */
export function normalizePhoneBR(value: string): string | null {
  let d = digitsOnly(value);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 12 || d.length > 15) return null;
  return d;
}

/** Variantes equivalentes (com e sem o nono dígito) para números móveis brasileiros. */
export function phoneVariants(value: string): string[] {
  const d = normalizePhoneBR(value);
  if (!d) return [];
  const out = new Set([d]);
  if (d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const local = d.slice(4);
    if (local.length === 9 && local.startsWith("9")) out.add(`55${ddd}${local.slice(1)}`);
    if (local.length === 8 && /^[6-9]/.test(local)) out.add(`55${ddd}9${local}`);
  }
  return [...out];
}

/** Mascara o telefone para exibição/logs: 55119****4321. */
export function maskPhone(value: string): string {
  const d = digitsOnly(value);
  if (d.length < 8) return "****";
  return `${d.slice(0, 5)}****${d.slice(-4)}`;
}
