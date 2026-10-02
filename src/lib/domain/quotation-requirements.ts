/**
 * Informações que o cliente precisa enviar para uma cotação de Grandes Contas (+99 vidas).
 * Exibidas em Grandes Contas e copiáveis como texto pronto para e-mail/WhatsApp.
 */
export interface RequirementItem {
  label: string;
  hint?: string;
}
export interface RequirementSection {
  title: string;
  /** Aviso exibido antes dos itens. */
  note?: string;
  items: RequirementItem[];
}

/** Planilha modelo da base de vidas (layout aba "BASE SAÚDE", o mesmo lido pelo importador do sistema). */
export const LIVES_TEMPLATE_URL = "/modelos/modelo-base-de-vidas.xlsm";
export const LIVES_TEMPLATE_FILENAME = "Modelo base de vidas.xlsm";

export const SINISTRALITY_NOTICE = "ANEXAR SINISTRALIDADE COMPLETA E ATUALIZADA.";

export const QUOTATION_REQUIREMENTS: RequirementSection[] = [
  {
    title: "Dados da empresa",
    items: [
      { label: "Nome do Estipulante" },
      { label: "Número do CNPJ", hint: "Deverão ser informados todos os CNPJs participantes do processo de cotação." },
      { label: "Operadora e/ou Seguradora atual", hint: "Se houver mais de uma, todas deverão ser informadas." },
      { label: "Data da renovação do contrato atual", hint: "Se houver mais de um contrato, informar a data de todos." },
      { label: "Planos atuais e quantidade de vidas por plano", hint: "Encaminhar planilha em Excel com base no modelo anexo." },
      { label: "Modalidade de contratação (Opcional ou Compulsório)", hint: "Caso Opcional, informar se haverá encampação (tombamento das vidas da operadora atual)." },
    ],
  },
  {
    title: "Contribuição, coparticipação e custos",
    note: "Para cotação compulsória consideramos 100% do FGTS do(s) CNPJ(s) cotado(s) e 100% de seus dependentes legais.",
    items: [
      { label: "A cotação considera 100% do FGTS?" },
      { label: "Valor ou % de contribuição do funcionário descontado em folha de pagamento pelo convênio / seguro", hint: "De 0% a 100%." },
      { label: "Valor ou % de contribuição do dependente descontado em folha de pagamento pelo convênio / seguro", hint: "De 0% a 100%." },
      {
        label: "Coparticipação (limite máximo de 30%) e em quais procedimentos",
        hint: "Ex.: consultas, procedimentos seriados, atendimento em P.S., procedimentos ambulatoriais, exames tipo A e exames tipo B.",
      },
      { label: "Valores / custos atuais por plano" },
      { label: "Valor atual de reembolso de consulta por plano" },
    ],
  },
  {
    title: "Situações especiais",
    items: [
      { label: "Prestador de serviços (S/N)", hint: "Informar a quantidade, os CNPJs e a quem está ligado (Estipulante / Subestipulante)." },
      {
        label: "Demitidos e aposentados — Lei 9.656/98, arts. 30 e 31 (S/N)",
        hint: "Informar quantidade, forma de pagamento (custo médio x faixa etária), se há emissão de boleto pela operadora atual, se haverá necessidade de emissão de boleto e, em caso positivo, quem será o emissor.",
      },
      { label: "Liminares (S/N)", hint: "Em caso positivo, anexar a liminar." },
      { label: "Agregados", hint: "Se houver, informar a idade exata e o grau de parentesco." },
      { label: "Home Care", hint: "Se houver, enviar relatório médico atualizado, protocolo médico e informação de gastos mensais." },
    ],
  },
];

/** Texto da lista pronto para colar em e-mail ou WhatsApp (o cliente responde item a item). */
export function requirementsAsText(): string {
  const lines = ["INFORMAÇÕES NECESSÁRIAS PARA A COTAÇÃO", ""];
  QUOTATION_REQUIREMENTS.forEach((s, i) => {
    lines.push(s.title.toUpperCase());
    if (s.note) lines.push(s.note);
    for (const it of s.items) lines.push(`• ${it.label}:${it.hint ? ` (${it.hint})` : ""}`);
    if (i === 0) lines.push("", `* ${SINISTRALITY_NOTICE}`);
    lines.push("");
  });
  lines.push("Planilha de vidas: preencher o modelo em Excel enviado em anexo (aba BASE SAÚDE).");
  return lines.join("\n");
}
