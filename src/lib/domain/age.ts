/** Idade e faixas etárias ANS (RN 63/2003 — 10 faixas). Faixas configuráveis via settings "ans_age_bands". */
import { diffDays, isValidISODate } from "./dates";

export interface AgeBand {
  label: string;
  min: number;
  max: number | null;
}

export const DEFAULT_ANS_AGE_BANDS: AgeBand[] = [
  { label: "00 a 18", min: 0, max: 18 },
  { label: "19 a 23", min: 19, max: 23 },
  { label: "24 a 28", min: 24, max: 28 },
  { label: "29 a 33", min: 29, max: 33 },
  { label: "34 a 38", min: 34, max: 38 },
  { label: "39 a 43", min: 39, max: 43 },
  { label: "44 a 48", min: 44, max: 48 },
  { label: "49 a 53", min: 49, max: 53 },
  { label: "54 a 58", min: 54, max: 58 },
  { label: "59 ou mais", min: 59, max: null },
];

export function ageAt(birthISO: string, referenceISO: string): number | null {
  if (!isValidISODate(birthISO) || !isValidISODate(referenceISO)) return null;
  if (diffDays(birthISO, referenceISO) < 0) return null;
  const [by, bm, bd] = birthISO.split("-").map(Number);
  const [ry, rm, rd] = referenceISO.split("-").map(Number);
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  return age;
}

export function ageBandFor(age: number | null | undefined, bands: AgeBand[] = DEFAULT_ANS_AGE_BANDS): AgeBand | null {
  if (age === null || age === undefined || Number.isNaN(age) || age < 0) return null;
  return bands.find((b) => age >= b.min && (b.max === null || age <= b.max)) ?? null;
}

/** Normaliza um rótulo de faixa para comparação ("0-18", "00 a 18", "0 A 18 ANOS" → "0-18"; "59+" → "59-"). */
export function normalizeBandLabel(label: string): string | null {
  const s = label.toLowerCase().replace(/anos?/g, "").trim();
  const range = s.match(/(\d{1,3})\s*(?:a|-|–|até|ate)\s*(\d{1,3})/);
  if (range) return `${Number(range[1])}-${Number(range[2])}`;
  const open = s.match(/(\d{1,3})\s*(?:\+|ou mais|ou\s*\+|em diante|acima)/);
  if (open) return `${Number(open[1])}-`;
  return null;
}

export function bandKey(b: AgeBand): string {
  return b.max === null ? `${b.min}-` : `${b.min}-${b.max}`;
}

export function validateAgeBands(bands: AgeBand[]): string | null {
  if (bands.length === 0) return "Informe ao menos uma faixa";
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  if (sorted[0].min !== 0) return "A primeira faixa deve começar em 0";
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (b.max !== null && b.max < b.min) return `Faixa ${b.label}: máximo menor que mínimo`;
    const next = sorted[i + 1];
    if (next) {
      if (b.max === null) return "Somente a última faixa pode ser aberta";
      if (next.min !== b.max + 1) return `Lacuna ou sobreposição entre ${b.label} e ${next.label}`;
    } else if (b.max !== null) {
      return "A última faixa deve ser aberta (sem máximo)";
    }
  }
  return null;
}
