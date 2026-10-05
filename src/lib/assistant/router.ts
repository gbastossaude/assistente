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

const PLAYBOOK_TOPIC =
  /(carencia|reajuste|vigencia|coparticipa|copart|enfermaria|apartamento|acomodacao|adesao|\bpme\b|\bmei\b|\bspin\b|gancho|objecao|cadencia|qualifica|script|roteiro|playbook|segmentacao|ambulatorial|obstetric|plano referencia|capital global|\bcpt\b|pre-?existen|portabilidade|\bd[0-7]\b|despedida|check-?in|plano individual|pessoa fisica)/;
const PLAYBOOK_ASK = /(como funciona|o que e|qual (e )?a regra|quais (sao )?as regras|regras? d|explique|explica|me ajude|como (abordar|responder|vender|contornar|fazer|qualificar)|dica|frase|playbook|script|roteiro|gancho|spin|cadencia|exemplo)/;

/** Dúvida de produto/abordagem comercial → Playbook (não confundir com consulta a dados de uma cotação). */
export function isPlaybookQuestion(text: string): boolean {
  const t = norm(text);
  if (/COT-\d{4}-\d{1,4}/i.test(text)) return false;
  return PLAYBOOK_TOPIC.test(t) && (PLAYBOOK_ASK.test(t) || !extractEntity(text));
}

const PRODUCT_WORDS: [RegExp, string][] = [
  [/dental|odonto/, "dental"],
  [/\bvida\b|seguro de vida/, "vida"],
  [/consorcio/, "consorcio"],
  [/beneficio/, "beneficios"],
  [/\bseguros?\b/, "seguro"],
];
export function productOf(t: string): string {
  return PRODUCT_WORDS.find(([re]) => re.test(t))?.[1] ?? "plano_saude";
}

/** Comandos do módulo comercial (CRM, reuniões, campanhas, resumos). Retorna null se não for um deles. */
export function routeCommercial(text: string, today: string): RoutedIntent | { clarify: string } | null {
  const t = norm(text);
  const raw = extractEntity(text);
  const entity = raw && !/^(este|esta|esse|essa|deste|desta|meu|minha)\b/i.test(raw) ? raw : null;
  if (/resumo (do dia|diario)|meu dia|o que (eu )?tenho (hoje|pra hoje|para hoje)/.test(t)) return { tool: "resumo_diario", input: {} };
  if (/resumo (da semana|semanal)|minha semana|semana que vem/.test(t)) return { tool: "resumo_semanal", input: {} };
  if (/relatorio de vendas|vendas (do|deste|no) mes|vendas por (corretor|produto)|quanto (vendemos|vendi)/.test(t)) {
    const start = /mes/.test(t) ? `${today.slice(0, 7)}-01` : "";
    return { tool: "relatorio_vendas", input: { de: start, ate: "" } };
  }
  if (/calendario (editorial|de (conteudo|posts?|postage(m|ns)))|planejamento (editorial|de conteudo|de posts?)|\b30 posts\b|posts? (do|para o) mes/.test(t)) {
    const plataforma = /linkedin/.test(t) ? "linkedin" : /tiktok/.test(t) ? "tiktok" : /facebook/.test(t) ? "facebook" : /youtube/.test(t) ? "youtube" : "instagram";
    const frequencia = /(todo dia|todos os dias|diari|1x (por|ao) dia)/.test(t) ? "diaria" : /3x|tres vezes/.test(t) ? "3x_semana" : "5x_semana";
    const lancamento = t.match(/lancamento na semana (\d)/);
    return { tool: "calendario_editorial", input: { mes: monthRef(text, today) ?? "", plataforma, frequencia, semana_lancamento: lancamento ? Number(lancamento[1]) : 0, produto: "", publico: "" } };
  }
  if (/\bcampanhas?\b/.test(t) && /(crie|criar|sugira|sugerir|monte|montar|planeje|planejar|proponha|propor)/.test(t)) {
    const foco = /\bpme\b|pequenas empresas/.test(t) ? "pme" : /(pessoa fisica|individual|familiar|\bpf\b|familias)/.test(t) ? "pf" : "empresarial";
    return { tool: "propor_campanha", input: { produto: productOf(t), mes: monthRef(text, today) ?? today.slice(0, 7), foco } };
  }
  if (/follow-?ups? (de vendas )?atrasad|vendas com follow-?up atrasad|clientes? sem follow-?up|follow-?ups? vencid/.test(t)) {
    return { tool: "listar_oportunidades", input: { etapa: "", followup: /sem follow/.test(t) ? "sem_data" : "atrasado", produto: "" } };
  }
  if (/(roteiro|script|pauta)\s+(para|de|da)\s+(a\s+)?reuniao/.test(t)) return { tool: "roteiro_reuniao", input: { cliente: entity ?? "" } };
  if (/(resum(a|ir|e)|ata d[ae])\s+(a\s+|da\s+|desta\s+|dessa\s+|esta\s+|essa\s+)?(ultima\s+)?reuniao/.test(t)) return { tool: "resumir_reuniao", input: { reuniao: /(ultima|esta|essa|recente)/.test(t) && !entity ? "" : (entity ?? "") } };
  if ((/(checklist|lista) de documentos/.test(t) || (/(pedindo|pedir|solicitando|solicitar) (os )?documentos/.test(t) && !/pendent|e-?mail/.test(t))) && !/cotacao|COT-/i.test(text)) {
    const vidas = numberAfter(text, /(\d+)\s*vidas/) ;
    return { tool: "checklist_documentos", input: { cliente: entity ?? "", produto: /(dental|vida|consorcio|seguro|beneficio)/.test(t) ? productOf(t) : "", vidas: vidas ?? 0, mensagem: /(mensagem|whatsapp|pedindo|pedir|solicitando|solicitar|cobrando)/.test(t) } };
  }
  if (/follow-?up|acompanhamento/.test(t) && /(mensagem|whatsapp|texto)/.test(t) && !/\bd[01357]\b|COT-/i.test(text)) {
    if (!entity) return { clarify: "Para qual cliente? Ex.: “Criar mensagem de follow-up para o cliente Construtora Alfa”." };
    return { tool: "mensagem_followup_cliente", input: { cliente: entity } };
  }
  if (/proximos passos|proximo passo|o que fazer com/.test(t) && entity) return { tool: "resumo_oportunidade", input: { cliente: entity } };
  if (/\b(oportunidades|pipeline|leads|funil)\b/.test(t)) {
    const stage = [
      [/proposta enviada|propostas enviadas/, "proposta_enviada"],
      [/negociacao/, "em_negociacao"],
      [/documentos pendentes/, "documentos_pendentes"],
      [/lead novo|leads novos|novos leads/, "lead_novo"],
      [/fechad|ganh/, "fechado"],
      [/perdid/, "perdido"],
    ].find(([re]) => (re as RegExp).test(t))?.[1] as string | undefined;
    return { tool: "listar_oportunidades", input: { etapa: stage ?? "", followup: "", produto: /(dental|vida|consorcio|seguro|beneficio)/.test(t) ? productOf(t) : "" } };
  }
  return null;
}

export function routeIntent(text: string, today: string): RoutedIntent | { clarify: string } {
  const t = norm(text);
  const entity = extractEntity(text);
  const days = numberAfter(text, /(?:ha mais de|mais de|ha|ultimos|proximos)\s+(\d+|\w+)\s+dias?/);
  const commercial = routeCommercial(text, today);
  if (commercial) return commercial;

  if (/\b(crie|criar|gere|gerar|cadastre)\b.*\btarefas?\b/.test(t) && /(nao responderam|sem resposta|sem retorno)/.test(t)) {
    return { tool: "propor_tarefas_operadoras_sem_resposta", input: { dias: days ?? 5, prazo_dias: 0 } };
  }
  if (/(whatsapp|e-?mail|mensagem)/.test(t) && /(gere|gerar|crie|criar|escreva|redija|monte|prepare)/.test(t)) {
    if (!entity) return { clarify: "Para qual cotação/empresa devo gerar a mensagem? Ex.: “Gere um WhatsApp cobrando as pendências da Empresa X”." };
    let modelo = "cliente_cobranca_formal_email";
    if (/whatsapp/.test(t)) modelo = /cordial|lembrete/.test(t) ? "cliente_followup_cordial" : "cliente_cobranca_whatsapp";
    else if (/urgente/.test(t)) modelo = "cliente_followup_urgente";
    else if (/inicial|solicitar informa|abertura/.test(t)) modelo = "cliente_solicitacao_inicial_email";
    const cad = t.match(/\bd([01357])\b/);
    if (cad) modelo = `cliente_cadencia_d${cad[1]}`;
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
  if (isPlaybookQuestion(text)) {
    return { tool: "consultar_playbook", input: { pergunta: text.slice(0, 300) } };
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
  return { clarify: "Não entendi. Exemplos: “Resumo do dia”, “Mostrar vendas com follow-up atrasado”, “Criar mensagem de follow-up para o cliente X”, “Resuma a cotação da Empresa X”, “Quais renovações vencem nos próximos 60 dias?”." };
}
