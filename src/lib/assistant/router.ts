/**
 * Roteador local de intenções (modo sem LLM). Converte perguntas em português nas mesmas
 * ferramentas controladas que o modelo usa. Determinístico e testável.
 */
export interface RoutedIntent {
  tool: string;
  input: Record<string, unknown>;
}

const NUM: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30, sessenta: 60, noventa: 90 };
const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function numberAfter(text: string, re: RegExp): number | null {
  const m = norm(text).match(re);
  if (!m) return null;
  const raw = m[1];
  if (/^\d+$/.test(raw)) return Number(raw);
  return NUM[raw] ?? null;
}

/** Extrai a referência a empresa/cotação ("da Empresa X", "COT-2026-0001"). */
export function extractEntity(text: string): string | null {
  const code = text.match(/COT-\d{4}-\d{1,4}/i);
  if (code) return code[0].toUpperCase();
  const m =
    text.match(/(?:empresa|cliente|cotação|cotacao|conta)\s+(?:da\s+|de\s+|do\s+)?(?:empresa\s+)?([^?.,;:]+?)(?:\s+(?:com|para|sobre|que|pedindo|cobrando)\b|[?.,;:]|$)/i) ??
    text.match(/\b(?:da|do|de|na|no)\s+([A-ZÀ-Ú][\wÀ-ú&.-]*(?:\s+[A-ZÀ-Ú0-9][\wÀ-ú&.-]*)*)/);
  if (!m) return null;
  const v = m[1].trim().replace(/^(a|o)\s+/i, "");
  if (!v || /^(empresa|cotação|cotacao|hoje|operadora|whatsapp|e-?mail|mensagem|novembro|dezembro|janeiro)s?$/i.test(v)) return null;
  return v;
}

function monthRef(text: string, today: string): string | null {
  const t = norm(text);
  const idx = MONTHS.findIndex((m) => t.includes(m));
  if (idx < 0) return null;
  const [y, m] = today.split("-").map(Number);
  const year = idx + 1 < m ? y + 1 : y;
  return `${year}-${String(idx + 1).padStart(2, "0")}`;
}

export function routeIntent(text: string, today: string): RoutedIntent | { clarify: string } {
  const t = norm(text);
  const entity = extractEntity(text);
  const days = numberAfter(text, /(?:ha mais de|mais de|ha|ultimos|proximos)\s+(\d+|\w+)\s+dias?/);

  if (/\b(crie|criar|gere|gerar|cadastre)\b.*\btarefas?\b/.test(t) && /(nao responderam|sem resposta|sem retorno)/.test(t)) {
    return { tool: "propor_tarefas_operadoras_sem_resposta", input: { dias: days ?? 5, prazo_dias: 0 } };
  }
  if (/(whatsapp|e-?mail|mensagem)/.test(t) && /(gere|gerar|crie|criar|escreva|redija|monte|prepare)/.test(t)) {
    if (!entity) return { clarify: "Para qual cotação/empresa devo gerar a mensagem? Ex.: “Gere um WhatsApp cobrando as pendências da Empresa X”." };
    let modelo = "cliente_cobranca_formal_email";
    if (/whatsapp/.test(t)) modelo = /cordial|lembrete/.test(t) ? "cliente_followup_cordial" : "cliente_cobranca_whatsapp";
    else if (/urgente/.test(t)) modelo = "cliente_followup_urgente";
    else if (/inicial|solicitar informa|abertura/.test(t)) modelo = "cliente_solicitacao_inicial_email";
    const op = text.match(/operadora\s+([^?.,]+)/i);
    if (op && /(cobran|retorno|protocolo|complemento|revis)/.test(t)) {
      modelo = /protocolo/.test(t) ? "operadora_cobranca_protocolo" : /complemento/.test(t) ? "operadora_envio_complemento" : /revis/.test(t) ? "operadora_revisao_comercial" : "operadora_cobranca_retorno";
      return { tool: "gerar_mensagem", input: { cotacao: entity, modelo, operadora: op[1].trim() } };
    }
    return { tool: "gerar_mensagem", input: { cotacao: entity, modelo, operadora: "" } };
  }
  if (/(nao responderam|sem resposta|sem retorno|nao retornaram)/.test(t)) {
    return { tool: "operadoras_sem_resposta", input: { dias: days ?? 0, cotacao: /\boperadoras\b/.test(t) && entity ? entity : "" } };
  }
  if (/(renov|aniversario|vencem|vence)/.test(t)) {
    const mes = monthRef(text, today);
    return { tool: "renovacoes", input: { dias: mes ? 0 : (days ?? 60), mes: mes ?? "" } };
  }
  if (/(reuniao|reunioes|agenda|compromisso).*(hoje|dia)|resumo executivo/.test(t)) {
    return { tool: "agenda_do_dia", input: {} };
  }
  if (/historico|timeline|negociacao da|negociacao de/.test(t) && entity) {
    return { tool: "historico", input: { cotacao: entity } };
  }
  const minLives = numberAfter(text, /(?:acima de|mais de|maior que|>)\s*(\d+)\s*vidas/);
  if (minLives !== null || /\bcotacoes\b.*\b(em|na|no)\b/.test(t) || /(sem movimentacao|paradas)/.test(t)) {
    const statusMap: [RegExp, string][] = [
      [/negociacao/, "negociacao"],
      [/finalista/, "finalista"],
      [/pronta/, "pronta_para_mercado"],
      [/aguardando cliente|pendencia do cliente/, "aguardando_cliente"],
      [/apresentacao/, "apresentacao_cliente"],
      [/propostas recebidas/, "propostas_recebidas"],
      [/enviada/, "enviada_operadoras"],
    ];
    const status = statusMap.find(([re]) => re.test(t))?.[1] ?? "";
    return { tool: "listar_cotacoes", input: { status, min_vidas: minLives ?? 0, sem_movimentacao_dias: /(sem movimentacao|paradas)/.test(t) ? (days ?? 7) : 0, tipo: /\brenew\b/.test(t) ? "RENEW" : /\bnew\b/.test(t) ? "NEW" : "" } };
  }
  if (/(pendente|pendencia|falta|faltam|faltando)/.test(t)) {
    return { tool: "pendencias", input: { cotacao: entity ?? "" } };
  }
  if (/(resum|status|situacao|como esta|andamento)/.test(t) && entity) {
    return { tool: "resumo_cotacao", input: { cotacao: entity } };
  }
  const term = entity ?? text.replace(/[?]/g, "").trim();
  if (term.length >= 2) return { tool: "buscar", input: { termo: term.slice(0, 80) } };
  return { clarify: "Não entendi. Exemplos: “Resuma a cotação da Empresa X”, “Quais renovações vencem nos próximos 60 dias?”, “Quais operadoras não responderam há mais de 5 dias?”." };
}
