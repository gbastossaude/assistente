/**
 * Validação de CNPJ numérico e alfanumérico (IN RFB 2.229/2024, vigente a partir de jul/2026).
 * Os 12 primeiros caracteres podem ser [0-9A-Z]; os 2 dígitos verificadores são numéricos.
 * Valor de cada caractere = código ASCII − 48 (dígitos mantêm o valor; 'A' = 17).
 */
const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeCnpj(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function checkDigit(base: string, weights: number[]): number {
  const sum = base.split("").reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCnpj(value: string | null | undefined): boolean {
  let cnpj = normalizeCnpj(value);
  // Planilhas costumam perder zeros à esquerda de CNPJs numéricos.
  if (/^\d{12,13}$/.test(cnpj)) cnpj = cnpj.padStart(14, "0");
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const d1 = checkDigit(cnpj.slice(0, 12), WEIGHTS_1);
  const d2 = checkDigit(cnpj.slice(0, 12) + d1, WEIGHTS_2);
  return cnpj.endsWith(`${d1}${d2}`);
}

/** Retorna o CNPJ canônico (14 caracteres, sem máscara) ou null se inválido. */
export function canonicalCnpj(value: string | null | undefined): string | null {
  let cnpj = normalizeCnpj(value);
  if (/^\d{12,13}$/.test(cnpj)) cnpj = cnpj.padStart(14, "0");
  return isValidCnpj(cnpj) ? cnpj : null;
}

export function formatCnpj(value: string | null | undefined): string {
  const c = normalizeCnpj(value);
  if (c.length !== 14) return value ?? "";
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
