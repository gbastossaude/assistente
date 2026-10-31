// ARQUIVO GERADO por scripts/sync-edge-shared.mjs a partir de packages/shared/src — não edite aqui.
import { WHATSAPP_MAX_TEXT } from "./constants.ts";
import { formatDateBR, truncate } from "./text.ts";

export interface FormattableSource {
  rank: number;
  title: string;
  operator_name?: string | null;
  page_from?: number | null;
  page_to?: number | null;
  valid_until?: string | null;
}

export function formatSourceLine(s: FormattableSource): string {
  const parts = [`[${s.rank}] ${s.title}`];
  if (s.operator_name) parts.push(s.operator_name);
  if (s.page_from) parts.push(s.page_to && s.page_to !== s.page_from ? `p. ${s.page_from}-${s.page_to}` : `p. ${s.page_from}`);
  if (s.valid_until) parts.push(`vigente até ${formatDateBR(s.valid_until)}`);
  return parts.join(" — ");
}

/** Texto final para o WhatsApp (formatação nativa *negrito* / _itálico_), limitado ao tamanho permitido. */
export function formatAnswerForWhatsApp(
  answer: { content: string; warnings?: string[] | null },
  sources: FormattableSource[],
  maxChars = 3500,
): string {
  const limit = Math.min(maxChars, WHATSAPP_MAX_TEXT);
  const footer = '\n\n_Para atendimento humano, responda "falar com responsável"._';
  const sourceBlock = sources.length ? `\n\n*Fontes*\n${sources.map(formatSourceLine).join("\n")}` : "";
  const warnings = (answer.warnings ?? []).length ? `\n\n⚠️ ${(answer.warnings ?? []).join("\n⚠️ ")}` : "";
  const room = limit - footer.length - sourceBlock.length - warnings.length;
  const body = room > 200
    ? truncate(answer.content, room, "… (resposta resumida; consulte a extensão para o texto completo)")
    : truncate(answer.content, limit - footer.length);
  const full = room > 200 ? `${body}${warnings}${sourceBlock}${footer}` : `${body}${footer}`;
  return truncate(full, limit);
}
