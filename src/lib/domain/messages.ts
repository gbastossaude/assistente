/**
 * Gerador de mensagens (seção 19/34). Templates com placeholders {{chave}}.
 * Regra: nunca inventar dado ausente — placeholders sem valor viram "[informar …]".
 */
export interface TemplateDef {
  key: string;
  name: string;
  audience: "cliente" | "operadora";
  channel: "email" | "whatsapp";
  tone?: string;
  subject?: string;
  body: string;
}

export const PLACEHOLDERS: Record<string, string> = {
  empresa: "Nome da empresa",
  contato: "Nome do contato do cliente",
  cotacao: "Código da cotação",
  vidas: "Número estimado de vidas",
  tipo: "NEW/RENEW",
  pendencias: "Lista de pendências reais (omitindo itens recebidos/validados)",
  operadora: "Nome da operadora",
  contato_operadora: "Responsável na operadora",
  protocolo: "Protocolo da operadora",
  data_envio: "Data de envio à operadora",
  data_retorno: "Data prevista de retorno",
  pendencias_operadora: "Pendências registradas para a operadora",
  data_renovacao: "Data de renovação",
  responsavel: "Responsável BeSmart",
  data_limite: "Data-alvo da cotação",
};

export const DEFAULT_TEMPLATES: TemplateDef[] = [
  {
    key: "cliente_solicitacao_inicial_email",
    name: "Solicitação inicial ao cliente (+99) — e-mail",
    audience: "cliente",
    channel: "email",
    tone: "formal",
    subject: "{{empresa}} — Informações para o estudo de plano de saúde",
    body:
      "Prezado(a) {{contato}},\n\nPara prosseguirmos com o estudo de plano de saúde da {{empresa}} ({{vidas}} vidas), ainda precisamos dos seguintes itens:\n\n{{pendencias}}\n\nAssim que recebermos, seguimos com a validação e o envio às operadoras. Nossa data-alvo para conclusão é {{data_limite}}.\n\nFico à disposição.\n\nAtenciosamente,\n{{responsavel}}\nBeSmart",
  },
  {
    key: "cliente_solicitacao_inicial_whatsapp",
    name: "Solicitação inicial ao cliente (+99) — WhatsApp",
    audience: "cliente",
    channel: "whatsapp",
    tone: "cordial",
    body: "Olá, {{contato}}! Tudo bem? Para avançarmos com o estudo da {{empresa}}, ainda precisamos de:\n{{pendencias}}\nConsegue nos enviar? Obrigado! — {{responsavel}} (BeSmart)",
  },
  {
    key: "cliente_cobranca_formal_email",
    name: "Cobrança de pendência — formal (e-mail)",
    audience: "cliente",
    channel: "email",
    tone: "formal",
    subject: "{{empresa}} — Pendências para continuidade do estudo",
    body:
      "Prezado(a) {{contato}},\n\nRetomando nosso contato sobre o estudo da {{empresa}}, seguem pendentes os itens abaixo:\n\n{{pendencias}}\n\nSem essas informações não conseguimos encaminhar a cotação ao mercado. Poderia, por gentileza, nos enviar até {{data_limite}}?\n\nAtenciosamente,\n{{responsavel}}\nBeSmart",
  },
  {
    key: "cliente_cobranca_whatsapp",
    name: "Cobrança de pendência — curta (WhatsApp)",
    audience: "cliente",
    channel: "whatsapp",
    tone: "curto",
    body: "Oi, {{contato}}! Ainda faltam estes itens da {{empresa}}:\n{{pendencias}}\nConsegue enviar? 🙏",
  },
  {
    key: "cliente_followup_cordial",
    name: "Follow-up cordial",
    audience: "cliente",
    channel: "whatsapp",
    tone: "cordial",
    body: "Olá, {{contato}}! Passando para saber se conseguiu separar as informações da {{empresa}}. Qualquer dúvida sobre os itens, estou à disposição:\n{{pendencias}}",
  },
  {
    key: "cliente_followup_urgente",
    name: "Follow-up urgente",
    audience: "cliente",
    channel: "email",
    tone: "urgente",
    subject: "URGENTE — {{empresa}}: pendências que impedem o envio ao mercado",
    body:
      "Prezado(a) {{contato}},\n\nO prazo do estudo da {{empresa}} ({{data_limite}}) está próximo e os itens abaixo ainda impedem o envio às operadoras:\n\n{{pendencias}}\n\nPrecisamos dessas informações com urgência para não comprometer o cronograma{{data_renovacao_frase}}.\n\nAtenciosamente,\n{{responsavel}}\nBeSmart",
  },
  // Cadência de follow-up D0 → D7 (Playbook Be Smart — Estratégia de follow-up)
  {
    key: "cliente_cadencia_d0",
    name: "Cadência D0 — envio da proposta (WhatsApp)",
    audience: "cliente",
    channel: "whatsapp",
    tone: "cadencia",
    body: "Fala, {{contato}}! Conforme conversamos, te enviei as opções de plano de saúde com melhor custo-benefício. Separei pensando no que você me falou. Dá uma olhada com calma e qualquer dúvida me chama 👍",
  },
  {
    key: "cliente_cadencia_d1",
    name: "Cadência D1 — check-in (WhatsApp)",
    audience: "cliente",
    channel: "whatsapp",
    tone: "cadencia",
    body: "Oi, {{contato}}! Conseguiu dar uma olhada nas opções que te mandei? Se quiser, posso te indicar direto a melhor escolha pra você baseado no que você precisa.",
  },
  {
    key: "cliente_cadencia_d3",
    name: "Cadência D3 — objeção silenciosa (WhatsApp)",
    audience: "cliente",
    channel: "whatsapp",
    tone: "cadencia",
    body: "{{contato}}, muitos clientes meus ficam na dúvida nessa etapa entre preço e qualidade. Se for o seu caso, me fala o que tá pesando mais aí que eu te ajudo a ajustar.",
  },
  {
    key: "cliente_cadencia_d5",
    name: "Cadência D5 — urgência (WhatsApp)",
    audience: "cliente",
    channel: "whatsapp",
    tone: "cadencia",
    body: "{{contato}}, só um ponto importante: alguns planos podem sofrer reajuste nos próximos dias. Vale a pena já garantir nessas condições. Posso te ajudar com isso agora?",
  },
  {
    key: "cliente_cadencia_d7",
    name: "Cadência D7 — despedida elegante (WhatsApp)",
    audience: "cliente",
    channel: "whatsapp",
    tone: "cadencia",
    body: "{{contato}}, não sei se você já resolveu a questão do plano de saúde. Se ainda estiver vendo isso, posso te ajudar. Se já resolveu, me avisa também 👍",
  },
  {
    key: "operadora_envio_inicial",
    name: "Operadora — envio inicial de estudo",
    audience: "operadora",
    channel: "email",
    subject: "Solicitação de cotação — {{empresa}} ({{vidas}} vidas) — {{tipo}}",
    body:
      "Prezado(a) {{contato_operadora}},\n\nEncaminhamos para cotação o estudo da {{empresa}}, com {{vidas}} vidas ({{tipo}}). Seguem anexos a base de vidas e a documentação disponível.\n\nSolicitamos, por gentileza, o protocolo de recebimento e a previsão de retorno.\n\nAtenciosamente,\n{{responsavel}}\nBeSmart",
  },
  {
    key: "operadora_cobranca_protocolo",
    name: "Operadora — cobrança de protocolo",
    audience: "operadora",
    channel: "email",
    subject: "Protocolo — cotação {{empresa}}",
    body: "Prezado(a) {{contato_operadora}},\n\nEnviamos em {{data_envio}} o estudo da {{empresa}} e ainda não recebemos o protocolo. Poderia nos confirmar o recebimento e o número do protocolo?\n\nAtenciosamente,\n{{responsavel}}",
  },
  {
    key: "operadora_cobranca_retorno",
    name: "Operadora — cobrança de retorno",
    audience: "operadora",
    channel: "email",
    subject: "Retorno da cotação {{empresa}} — protocolo {{protocolo}}",
    body: "Prezado(a) {{contato_operadora}},\n\nGostaríamos de saber o status da cotação da {{empresa}} (protocolo {{protocolo}}), com retorno previsto para {{data_retorno}}. Há alguma pendência de nossa parte?\n\nAtenciosamente,\n{{responsavel}}",
  },
  {
    key: "operadora_envio_complemento",
    name: "Operadora — envio de complemento",
    audience: "operadora",
    channel: "email",
    subject: "Complemento — cotação {{empresa}} — protocolo {{protocolo}}",
    body: "Prezado(a) {{contato_operadora}},\n\nConforme solicitado, encaminhamos o complemento referente às pendências:\n\n{{pendencias_operadora}}\n\nFicamos no aguardo do retorno.\n\nAtenciosamente,\n{{responsavel}}",
  },
  {
    key: "operadora_revisao_comercial",
    name: "Operadora — solicitação de revisão comercial",
    audience: "operadora",
    channel: "email",
    subject: "Revisão comercial — {{empresa}} — protocolo {{protocolo}}",
    body: "Prezado(a) {{contato_operadora}},\n\nAgradecemos a proposta para a {{empresa}}. Para seguirmos competitivos na apresentação ao cliente, solicitamos uma revisão das condições comerciais. Podemos conversar?\n\nAtenciosamente,\n{{responsavel}}",
  },
  {
    key: "operadora_agradecimento",
    name: "Operadora — agradecimento/encerramento",
    audience: "operadora",
    channel: "email",
    subject: "Encerramento — cotação {{empresa}}",
    body: "Prezado(a) {{contato_operadora}},\n\nAgradecemos o empenho na cotação da {{empresa}}. Informamos que o processo foi encerrado. Contamos com a parceria nas próximas oportunidades.\n\nAtenciosamente,\n{{responsavel}}",
  },
];

export function formatPendencyList(items: string[], channel: "email" | "whatsapp"): string {
  if (items.length === 0) return channel === "email" ? "(nenhuma pendência registrada)" : "(sem pendências)";
  return items.map((t, i) => (channel === "email" ? `  ${i + 1}. ${t}` : `• ${t}`)).join("\n");
}

/** Substitui placeholders; valores ausentes viram "[informar …]" (nunca inventa). */
export function renderTemplate(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => {
    const v = values[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
    if (key.endsWith("_frase")) return "";
    return `[informar ${PLACEHOLDERS[key]?.toLowerCase() ?? key}]`;
  });
}

export function missingPlaceholders(text: string, values: Record<string, string | null | undefined>): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
    const v = values[m[1]];
    if (!m[1].endsWith("_frase") && (v === undefined || v === null || String(v).trim() === "")) keys.add(m[1]);
  }
  return [...keys];
}
