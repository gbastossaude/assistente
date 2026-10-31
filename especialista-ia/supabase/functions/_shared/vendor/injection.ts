// ARQUIVO GERADO por scripts/sync-edge-shared.mjs a partir de packages/shared/src — não edite aqui.
import { normalizeText } from "./text.ts";

/**
 * Detecção de tentativas de prompt injection — na pergunta do usuário e em trechos de documentos.
 * A defesa principal continua sendo estrutural (documentos tratados como dados, saída validada);
 * esta detecção bloqueia os casos explícitos e registra o motivo.
 */
const PATTERNS: RegExp[] = [
  /ignor(e|ar|em) (todas |as |os )?(instrucoes|regras|orientacoes|comandos)( anteriores| acima)?/,
  /desconsider(e|ar) (todas |as |os )?(instrucoes|regras|orientacoes)/,
  /esqueca (todas |as )?(instrucoes|regras)/,
  /(revele|mostre|exiba|imprima|repita) (o |seu |a sua |sua )?(prompt|instrucoes do sistema|system prompt|mensagem do sistema)/,
  /\bsystem prompt\b/,
  /voce agora (e|sera|vai ser) /,
  /a partir de agora (voce|responda|ignore)/,
  /\b(jailbreak|modo desenvolvedor|developer mode|dan mode)\b/,
  /ignore (all |previous |the )?(previous |above )?instructions/,
  /disregard (all |previous |the )?instructions/,
  /\bact as\b/,
  /<\/?(system|assistant|instructions?)>/,
  /\[\/?(inst|system)\]/,
];

export interface InjectionCheck {
  suspicious: boolean;
  matches: string[];
}

export function detectPromptInjection(text: string): InjectionCheck {
  const norm = normalizeText(text);
  const matches = PATTERNS.filter((p) => p.test(norm)).map((p) => p.source);
  return { suspicious: matches.length > 0, matches };
}

/** Remove marcações que poderiam ser confundidas com delimitadores do prompt. */
export function neutralizeDelimiters(text: string): string {
  return text
    .replace(/<\/?(system|assistant|user|instructions?|documento|pergunta)[^>]*>/gi, "")
    .replace(/\[\/?(INST|SYSTEM)\]/gi, "")
    .replace(/```/g, "'''");
}
