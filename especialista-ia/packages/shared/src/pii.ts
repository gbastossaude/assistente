/**
 * Minimização de dados pessoais (LGPD). Remove identificadores antes de armazenar a pergunta
 * ou enviá-la ao modelo. O sistema responde dúvidas sobre regras de produtos — não precisa de
 * CPF, contatos, carteirinhas ou nomes de beneficiários.
 */

export type PiiType = "cpf" | "cnpj" | "email" | "telefone" | "cns" | "rg" | "nascimento" | "numero_longo" | "nome";

export interface PiiFinding {
  type: PiiType;
  count: number;
}

export interface RedactionResult {
  text: string;
  findings: PiiFinding[];
  /** Verdadeiro quando há identificadores pessoais removidos. */
  hasSensitive: boolean;
  /** Verdadeiro quando a pergunta parece descrever o estado de saúde de uma pessoa específica. */
  healthContext: boolean;
}

const PLACEHOLDER: Record<PiiType, string> = {
  cpf: "[CPF removido]",
  cnpj: "[CNPJ removido]",
  email: "[e-mail removido]",
  telefone: "[telefone removido]",
  cns: "[cartão SUS removido]",
  rg: "[RG removido]",
  nascimento: "[data de nascimento removida]",
  numero_longo: "[número removido]",
  nome: "[nome removido]",
};

export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

const NAME_TRIGGERS = "(?:cliente|beneficiari[oa]|paciente|segurad[oa]|titular|dependente|sr\\.?|sra\\.?|senhor|senhora)";
const NAME_WORD = "[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+";
const NAME_CONNECTOR = "(?:\\s+(?:da|de|do|dos|das|e))?";

const HEALTH_TERMS =
  /\b(diagnostic|cancer|câncer|tumor|diabet|hipertens|gestante|gravid|cirurgia|internad|tratamento|quimioterapia|hemodialise|hemodiálise|autismo|tea\b|depress|cardiac|cardíac|avc|hiv|transtorno|laudo|exame d[eo])/i;
const PERSONAL_CONTEXT =
  /\b(meu cliente|minha cliente|o cliente|a cliente|paciente|beneficiári[oa]|segurad[oa]|ele tem|ela tem|esta com|está com|foi diagnosticad|faz tratamento)/i;

export function redactSensitive(input: string): RedactionResult {
  let text = input;
  const counts = new Map<PiiType, number>();
  const hit = (type: PiiType) => {
    counts.set(type, (counts.get(type) ?? 0) + 1);
    return PLACEHOLDER[type];
  };

  // E-mails
  text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, () => hit("email"));
  // CNPJ formatado ou 14 dígitos
  text = text.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, (m) => (m.replace(/\D/g, "").length === 14 ? hit("cnpj") : m));
  // CPF formatado
  text = text.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, () => hit("cpf"));
  // RG com rótulo
  text = text.replace(/\bRG\s*[:nº°]*\s*[\d.\-xX]{5,14}/gi, () => hit("rg"));
  // Data de nascimento com contexto
  text = text.replace(
    /(nascid[oa] em|data de nascimento|nascimento|dn)\s*[:\-]?\s*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/gi,
    () => hit("nascimento"),
  );
  // Telefones (com DDD, opcionalmente +55)
  text = text.replace(/(?:\+?55\s?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length === 11 && isValidCpf(digits)) return hit("cpf");
    return digits.length >= 10 && digits.length <= 13 ? hit("telefone") : m;
  });
  // Sequências longas restantes: CPF sem máscara, CNS (15 dígitos), carteirinhas
  text = text.replace(/\b\d{11,20}\b/g, (m) => {
    if (m.length === 11 && isValidCpf(m)) return hit("cpf");
    if (m.length === 15 && /^[12789]/.test(m)) return hit("cns");
    return hit("numero_longo");
  });
  // Nomes próprios após termos como "cliente", "beneficiário"
  const nameRe = new RegExp(`(${NAME_TRIGGERS}\\s+)(${NAME_WORD}(?:${NAME_CONNECTOR}\\s+${NAME_WORD})+)`, "g");
  text = text.replace(nameRe, (_m, prefix: string) => `${prefix}${hit("nome")}`);

  const findings = [...counts.entries()].map(([type, count]) => ({ type, count }));
  return {
    text,
    findings,
    hasSensitive: findings.length > 0,
    healthContext: HEALTH_TERMS.test(input) && PERSONAL_CONTEXT.test(input),
  };
}
