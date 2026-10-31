import { REQUIRED_FIELD_LABELS, type ExtractedEntities, type RequiredField } from "@especialista/shared";
import type { RequiredInfoRule } from "./types.ts";

function present(field: RequiredField, e: ExtractedEntities): boolean {
  switch (field) {
    case "operadora": return e.operatorIds.length > 0;
    case "produto": return e.productIds.length > 0;
    case "uf": return !!e.uf;
    case "cidade": return !!e.city;
    case "modalidade": return !!e.contractType;
    case "vidas": return e.lives !== null;
    case "tempo_cnpj": return e.cnpjMonths !== null;
  }
}

export interface MissingInfo {
  fields: RequiredField[];
  messages: string[];
}

/** Aplica as regras de "informações obrigatórias" cadastradas no painel. */
export function evaluateRequiredInfo(rules: RequiredInfoRule[], e: ExtractedEntities): MissingInfo {
  const fields = new Set<RequiredField>();
  const messages: string[] = [];
  for (const r of rules) {
    if (!r.active) continue;
    // A regra vale para o tema principal da pergunta (ou para qualquer tema, se não tiver tema definido).
    if (r.topic && e.topics[0] !== r.topic) continue;
    if (r.operator_id && !e.operatorIds.includes(r.operator_id)) continue;
    const missing = r.required_fields.filter((f) => !present(f, e));
    if (missing.length) {
      missing.forEach((f) => fields.add(f));
      if (r.message) messages.push(r.message);
    }
  }
  return { fields: [...fields], messages: [...new Set(messages)] };
}

export function missingInfoMessage(missing: MissingInfo): string {
  const list = missing.fields.map((f) => `• ${REQUIRED_FIELD_LABELS[f]}`).join("\n");
  const intro = missing.messages[0] ?? "Para encontrar a regra correta, preciso de mais informações.";
  return `${intro}\n\nInforme, por favor:\n${list}`;
}
