/** Resumo da população após validação/importação (seção 9). */
import type { AgeBand } from "@/lib/domain/age";
import { hasErrors } from "./validate";

export interface LifeLike {
  cnpj: string | null;
  ageBand: string | null;
  holderType: string | null;
  situation: string | null;
  cid: string | null;
  city: string | null;
  uf: string | null;
  insurer: string | null;
  plan: string | null;
  sex?: string | null;
  issues: { level: string }[];
}

export interface Bucket {
  key: string;
  count: number;
}

export interface LivesSummary {
  total: number;
  titulares: number;
  dependentes: number;
  agregados: number;
  semTitularidade: number;
  byAgeBand: Bucket[];
  byPlan: Bucket[];
  byCnpj: Bucket[];
  byUf: Bucket[];
  byCity: Bucket[];
  byInsurer: Bucket[];
  bySituation: Bucket[];
  bySex: Bucket[];
  specialSituations: number;
  withCid: number;
  incomplete: number;
  withWarnings: number;
  averageAge: number | null;
}

function bucket(values: (string | null)[], order?: string[]): Bucket[] {
  const map = new Map<string, number>();
  for (const v of values) {
    const k = v ?? "(não informado)";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  const arr = [...map.entries()].map(([key, count]) => ({ key, count }));
  if (order) return arr.sort((a, b) => idx(order, a.key) - idx(order, b.key));
  return arr.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
const idx = (order: string[], k: string) => (order.includes(k) ? order.indexOf(k) : order.length);

export function summarizeLives(lives: (LifeLike & { age?: number | null })[], bands: AgeBand[]): LivesSummary {
  const ages = lives.map((l) => l.age).filter((a): a is number => typeof a === "number");
  return {
    total: lives.length,
    titulares: lives.filter((l) => l.holderType === "TITULAR").length,
    dependentes: lives.filter((l) => l.holderType === "DEPENDENTE").length,
    agregados: lives.filter((l) => l.holderType === "AGREGADO").length,
    semTitularidade: lives.filter((l) => !l.holderType).length,
    byAgeBand: bucket(
      lives.map((l) => l.ageBand),
      bands.map((b) => b.label),
    ),
    byPlan: bucket(lives.map((l) => l.plan)),
    byCnpj: bucket(lives.map((l) => l.cnpj)),
    byUf: bucket(lives.map((l) => l.uf)),
    byCity: bucket(lives.map((l) => (l.city ? `${l.city}${l.uf ? `/${l.uf}` : ""}` : null))),
    byInsurer: bucket(lives.map((l) => l.insurer)),
    bySituation: bucket(lives.filter((l) => l.situation && l.situation !== "ATIVO").map((l) => l.situation)),
    bySex: bucket(
      lives.map((l) => (l.sex === "M" ? "Masculino" : l.sex === "F" ? "Feminino" : null)),
      ["Feminino", "Masculino", "(não informado)"],
    ),
    specialSituations: lives.filter((l) => l.situation && l.situation !== "ATIVO").length,
    withCid: lives.filter((l) => !!l.cid).length,
    incomplete: lives.filter(hasErrors).length,
    withWarnings: lives.filter((l) => l.issues.some((i) => i.level === "warning")).length,
    averageAge: ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : null,
  };
}
