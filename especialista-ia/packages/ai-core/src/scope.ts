import { normalizeText } from "@especialista/shared";

/** Pedidos fora do escopo: diagnóstico/conduta médica individual ou conclusão jurídica definitiva. */
const MEDICAL = [
  /qual (e |seria )?o diagnostico/,
  /\b(devo|deve|posso) (tomar|usar) (o |a )?(remedio|medicamento)/,
  /\bdose (de|do|da)\b/,
  /\b(e|eh) grave\b/,
  /\binterpret(e|ar) (o |este |esse )?(exame|laudo|resultado)/,
  /\bque doenca (ele|ela|o cliente|a cliente) tem\b/,
  /\bqual tratamento\b/,
];
const LEGAL = [
  /\b(processar|processo judicial|entrar na justica|acao judicial|liminar|advogado|indenizacao|danos morais)\b/,
  /\b(e|eh) (ilegal|crime|abusivo)\b/,
];

export type OutOfScope = "medico" | "juridico" | null;

export function detectOutOfScope(text: string): OutOfScope {
  const n = normalizeText(text);
  if (MEDICAL.some((r) => r.test(n))) return "medico";
  if (LEGAL.some((r) => r.test(n))) return "juridico";
  return null;
}

export const MEDICAL_REFUSAL =
  "Não posso fornecer diagnóstico médico, conduta ou interpretação clínica individual. Posso ajudar com regras de cobertura, carências, CPT, declaração de saúde e contratação. Para avaliação clínica, oriente o cliente a procurar um médico.";

export const LEGAL_NOTICE =
  "Esta orientação não constitui parecer jurídico. Para uma conclusão definitiva, encaminhe ao jurídico ou ao responsável.";

export const INJECTION_REFUSAL =
  "Não posso atender a esse tipo de solicitação. Faça uma pergunta sobre regras de planos de saúde (operadora, produto, carências, elegibilidade, documentação etc.).";
