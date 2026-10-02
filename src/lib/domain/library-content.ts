/**
 * Conteúdo padrão da biblioteca (inserido pelo bootstrap; edições feitas no sistema não são sobrescritas).
 * Mensagens com variáveis {{cliente}}, {{empresa}}, {{operadora}}, {{valor}}, {{data}}, {{horario}}, {{consultor}}…
 * Respostas rápidas sempre lembram que as condições variam por operadora, contrato, região e análise.
 */
import type { AnswerTopic, MessageCategory, MessageChannel } from "./commercial";

export interface LibraryDefault {
  sourceKey: string;
  kind: "mensagem" | "resposta";
  category: MessageCategory | AnswerTopic;
  title: string;
  channel: MessageChannel;
  subject?: string;
  body: string;
}

const msg = (sourceKey: string, category: MessageCategory, title: string, body: string, channel: MessageChannel = "whatsapp", subject?: string): LibraryDefault => ({
  sourceKey,
  kind: "mensagem",
  category,
  title,
  channel,
  subject,
  body,
});

export const DISCLAIMER = "As condições podem variar conforme operadora, contrato, região e análise de cada caso.";

const ans = (sourceKey: string, category: AnswerTopic, title: string, body: string): LibraryDefault => ({
  sourceKey,
  kind: "resposta",
  category,
  title,
  channel: "geral",
  body: `${body}\n\n${DISCLAIMER}`,
});

export const DEFAULT_MESSAGES: LibraryDefault[] = [
  msg(
    "msg_primeiro_contato_empresa",
    "primeiro_contato",
    "Primeiro contato — empresa",
    "Olá, {{cliente}}! Tudo bem? Aqui é {{consultor}}, da BeSmart. Trabalhamos com planos de saúde e benefícios para empresas e ajudamos a reduzir custo sem perder rede. Faz sentido conversarmos 15 minutos sobre o plano da {{empresa}}?",
  ),
  msg(
    "msg_primeiro_contato_indicacao",
    "primeiro_contato",
    "Primeiro contato — indicação",
    "Olá, {{cliente}}! Tudo bem? Sou {{consultor}}, da BeSmart. Recebi seu contato por indicação e gostaria de entender como está o plano de saúde de vocês hoje. Qual o melhor horário para uma conversa rápida?",
  ),
  msg(
    "msg_agendamento",
    "agendamento",
    "Proposta de horário para reunião",
    "{{cliente}}, para preparar uma análise completa da {{empresa}}, proponho uma reunião de 30 minutos. Pode ser {{data}} às {{horario}}? Se preferir outro horário, me diga que ajusto.",
  ),
  msg(
    "msg_agendamento_email",
    "agendamento",
    "Convite de reunião (e-mail)",
    "Olá, {{cliente}},\n\nConforme conversamos, gostaria de agendar uma reunião para entender as necessidades da {{empresa}} em relação ao plano de saúde (rede, valores e prazos).\n\nSugestão: {{data}} às {{horario}} — {{link}}\n\nFico à disposição para ajustar.\n\nAtenciosamente,\n{{consultor}}\nBeSmart",
    "email",
    "{{empresa}} — Reunião sobre plano de saúde",
  ),
  msg(
    "msg_confirmacao_reuniao",
    "confirmacao_reuniao",
    "Confirmação de reunião",
    "Olá, {{cliente}}! Confirmando nossa reunião de {{data}} às {{horario}}. Link/local: {{link}}. Se possível, tenha em mãos a última fatura do plano atual. Até lá!",
  ),
  msg(
    "msg_lembrete_reuniao",
    "confirmacao_reuniao",
    "Lembrete no dia da reunião",
    "Bom dia, {{cliente}}! Passando para lembrar da nossa conversa hoje às {{horario}}. Segue o link: {{link}}. Até já!",
  ),
  msg(
    "msg_pedido_documentos",
    "pedido_documentos",
    "Pedido de documentos para cotação",
    "{{cliente}}, para cotarmos o plano da {{empresa}} com as operadoras, preciso dos documentos abaixo:\n{{documentos}}\nPode me enviar por aqui mesmo. Qualquer dúvida, estou à disposição!",
  ),
  msg(
    "msg_cobranca_documentos",
    "pedido_documentos",
    "Cobrança gentil de documentos",
    "Oi, {{cliente}}! Tudo bem? Ainda estamos aguardando alguns documentos da {{empresa}} para enviar a cotação às operadoras:\n{{documentos}}\nConsegue me mandar até {{data}}? Assim garantimos as condições atuais.",
  ),
  msg(
    "msg_envio_cotacao",
    "envio_cotacao",
    "Envio de cotação",
    "{{cliente}}, segue a cotação do plano da {{empresa}} ({{vidas}} vidas). A melhor condição ficou com a {{operadora}}: {{valor}}/mês. Posso te explicar os detalhes em uma ligação rápida hoje?",
  ),
  msg(
    "msg_envio_cotacao_email",
    "envio_cotacao",
    "Envio de cotação (e-mail)",
    "Olá, {{cliente}},\n\nSegue em anexo o comparativo de planos de saúde da {{empresa}}, com as opções das operadoras consultadas.\n\nDestaque: {{operadora}} — {{valor}}/mês.\n\nSugiro uma conversa de 20 minutos para apresentar as diferenças de rede, coparticipação e carência. Que tal {{data}} às {{horario}}?\n\nAtenciosamente,\n{{consultor}}",
    "email",
    "{{empresa}} — Comparativo de planos de saúde",
  ),
  msg(
    "msg_followup_d1",
    "followup_proposta",
    "Follow-up de proposta — check-in (D+1)",
    "Oi, {{cliente}}! Conseguiu dar uma olhada na proposta da {{operadora}} que enviei? Se surgir qualquer dúvida, me chama que eu explico.",
  ),
  msg(
    "msg_followup_d3",
    "followup_proposta",
    "Follow-up de proposta — objeção silenciosa (D+3)",
    "{{cliente}}, fiquei pensando na proposta da {{empresa}}: o que está pesando mais na decisão — valor, rede ou algum detalhe do contrato? Consigo buscar ajustes com a operadora.",
  ),
  msg(
    "msg_followup_d7",
    "followup_proposta",
    "Follow-up de proposta — última chamada (D+7)",
    "{{cliente}}, as condições da proposta da {{operadora}} são válidas até {{data}}. Quer que eu reserve para a {{empresa}} ou prefere encerrarmos por agora?",
  ),
  msg(
    "msg_objecao_preco",
    "objecao",
    "Objeção: “está caro”",
    "Entendo, {{cliente}}. Vamos olhar juntos: comparando com o plano atual, a diferença está na rede e na coparticipação. Posso montar uma opção com coparticipação para reduzir o valor mensal mantendo os hospitais que vocês mais usam. Faz sentido?",
  ),
  msg(
    "msg_objecao_rede",
    "objecao",
    "Objeção: “não quero perder meu hospital”",
    "Faz todo sentido, {{cliente}}. Me diga quais hospitais e laboratórios são indispensáveis para vocês que eu filtro apenas as opções que mantêm essa rede. Assim a decisão fica segura.",
  ),
  msg(
    "msg_objecao_pensar",
    "objecao",
    "Objeção: “vou pensar”",
    "Claro, {{cliente}}! Para te ajudar a decidir, o que ficou em dúvida? Se for algum ponto da proposta, resolvo hoje mesmo com a {{operadora}}.",
  ),
  msg(
    "msg_fechamento",
    "fechamento",
    "Fechamento de venda",
    "Ótima decisão, {{cliente}}! 🎉 Para seguirmos com a implantação na {{operadora}}, vou te enviar a proposta para assinatura e a lista final de documentos. Previsão de início de vigência: {{data}}.",
  ),
  msg(
    "msg_fechamento_urgencia",
    "fechamento",
    "Fechamento com prazo de condição",
    "{{cliente}}, a {{operadora}} confirmou a condição de {{valor}}/mês para a {{empresa}} até {{data}}. Posso dar andamento à proposta?",
  ),
  msg(
    "msg_pos_venda_boas_vindas",
    "pos_venda",
    "Pós-venda — boas-vindas",
    "Olá, {{cliente}}! Seja bem-vindo(a) à {{operadora}}. Já está tudo certo com as carteirinhas e o acesso ao aplicativo? Qualquer necessidade de inclusão, rede ou reembolso, conte comigo!",
  ),
  msg(
    "msg_pos_venda_30d",
    "pos_venda",
    "Pós-venda — 30 dias",
    "Oi, {{cliente}}! Passando para saber como está a experiência com o novo plano da {{empresa}}. Alguma dificuldade com rede, autorizações ou fatura?",
  ),
  msg(
    "msg_reativacao",
    "reativacao",
    "Reativação de cliente",
    "Olá, {{cliente}}! Faz um tempo que conversamos sobre o plano da {{empresa}}. As operadoras lançaram condições novas este mês e posso fazer uma análise gratuita do contrato atual. Vamos conversar?",
  ),
  msg(
    "msg_reativacao_reajuste",
    "reativacao",
    "Reativação — reajuste chegando",
    "{{cliente}}, o aniversário do contrato da {{empresa}} está chegando e com ele o reajuste. Quer que eu faça uma análise de mercado antes, para negociarmos com dados?",
  ),
  msg(
    "msg_campanha",
    "campanha",
    "Divulgação da campanha do mês",
    "Olá, {{cliente}}! Este mês estamos com a campanha {{campanha}}: diagnóstico gratuito do plano de saúde da {{empresa}} e comparação com as principais operadoras. Posso agendar 15 minutos com você?",
  ),
  msg(
    "msg_campanha_ultimos_dias",
    "campanha",
    "Campanha — últimos dias",
    "{{cliente}}, últimos dias da campanha {{campanha}} (até {{data}}). Ainda dá tempo de garantir sua análise gratuita. Posso reservar um horário?",
  ),
];

export const DEFAULT_ANSWERS: LibraryDefault[] = [
  ans(
    "ans_carencia",
    "carencia",
    "O que é carência e quais os prazos?",
    "Carência é o período entre a contratação e o direito de usar determinados serviços. Os prazos máximos definidos pela ANS são: 24 horas para urgência e emergência, 300 dias para parto a termo, 24 meses para doenças e lesões preexistentes (CPT) e até 180 dias para os demais procedimentos. Em planos empresariais, as operadoras costumam reduzir ou isentar carências, especialmente com redução por tempo de plano anterior ou a partir de determinado número de vidas.",
  ),
  ans(
    "ans_coparticipacao",
    "coparticipacao",
    "Como funciona a coparticipação?",
    "Na coparticipação, o beneficiário paga uma parte do custo de alguns procedimentos (consultas, exames, pronto-socorro) quando utiliza o plano, em troca de uma mensalidade menor. O percentual e os limites por procedimento são definidos em contrato. É uma boa opção para grupos que usam pouco o plano; para grupos de uso frequente, vale simular o custo total anual.",
  ),
  ans(
    "ans_acomodacao",
    "acomodacao",
    "Enfermaria ou apartamento?",
    "Na enfermaria, a internação é em quarto coletivo; no apartamento, em quarto privativo com direito a acompanhante. A rede de hospitais e o reembolso podem mudar conforme a acomodação. É comum a empresa oferecer enfermaria como plano base e apartamento como upgrade opcional.",
  ),
  ans(
    "ans_rede",
    "rede",
    "Como avaliar a rede credenciada?",
    "A rede credenciada é o conjunto de hospitais, laboratórios, clínicas e médicos atendidos pelo plano. Antes de decidir, liste os hospitais e laboratórios indispensáveis para o grupo e confirme no guia da operadora para o produto e a região contratados. A rede pode variar entre produtos da mesma operadora.",
  ),
  ans(
    "ans_reembolso",
    "reembolso",
    "Como funciona o reembolso?",
    "O reembolso permite usar médicos e serviços fora da rede credenciada e receber de volta parte do valor pago, conforme a tabela e o múltiplo previstos no contrato. Os valores variam por produto e acomodação. O pedido é feito pelo aplicativo ou site da operadora, com nota fiscal/recibo e, em alguns casos, relatório médico.",
  ),
  ans(
    "ans_pme",
    "pme",
    "Quem pode contratar plano PME?",
    "O plano PME é voltado a empresas com 2 a 29 vidas (o mínimo pode variar por operadora), inclusive MEI em alguns produtos. É necessário ter CNPJ ativo há um tempo mínimo e comprovar o vínculo dos beneficiários (sócios, funcionários e dependentes). Costuma ter valores menores que o plano individual e carências reduzidas.",
  ),
  ans(
    "ans_empresarial",
    "empresarial",
    "Como funciona o plano empresarial (30+ vidas)?",
    "O plano empresarial é contratado pela empresa para sócios, funcionários e dependentes. A partir de 30 vidas, a precificação tende a considerar o perfil do grupo; acima de 99 vidas, a sinistralidade e a base de vidas são analisadas em detalhe. Pode ser compulsório (todos entram) ou opcional (adesão livre), com ou sem contribuição do colaborador.",
  ),
  ans(
    "ans_individual",
    "individual",
    "Plano individual: como funciona?",
    "O plano individual é contratado diretamente pela pessoa física com a operadora. O reajuste anual é limitado pelo índice autorizado pela ANS. A oferta de planos individuais é restrita em várias regiões; como alternativa, avaliamos planos por adesão (entidade de classe) ou PME, quando houver CNPJ.",
  ),
  ans(
    "ans_familiar",
    "familiar",
    "Plano familiar: quem pode ser incluído?",
    "No plano familiar, o titular inclui dependentes como cônjuge/companheiro(a) e filhos, conforme as regras de parentesco e idade da operadora. Cada beneficiário tem valor por faixa etária. Dependendo do perfil, um plano PME ou por adesão pode ter custo menor que o individual/familiar.",
  ),
  ans(
    "ans_reducao_custo",
    "reducao_custo",
    "Como reduzir o custo do plano?",
    "As principais alavancas são: comparar operadoras para o mesmo perfil de rede, adotar coparticipação, revisar a acomodação do plano base, ajustar a abrangência (regional × nacional), negociar o reajuste com dados de sinistralidade e oferecer upgrade opcional em vez de plano único mais caro. A BeSmart faz esse diagnóstico sem custo.",
  ),
  ans(
    "ans_portabilidade",
    "portabilidade",
    "O que é portabilidade de carências?",
    "A portabilidade permite trocar de plano sem cumprir novas carências, desde que atendidos os requisitos da ANS: plano atual regulamentado e em dia, tempo mínimo de permanência (em geral 2 anos, ou 3 anos em caso de CPT) e plano de destino com faixa de preço compatível. Para planos empresariais, as operadoras costumam aplicar redução de carência pelo tempo de plano anterior.",
  ),
  ans(
    "ans_vigencia",
    "vigencia",
    "Quando o plano começa a valer?",
    "A data de início de vigência é definida pela operadora após a aprovação da proposta e o pagamento/aceite. Em planos empresariais, as datas costumam seguir um calendário mensal de implantação. Programe a contratação com antecedência para não ficar descoberto na troca.",
  ),
  ans(
    "ans_documentos",
    "documentos",
    "Quais documentos são necessários?",
    "Empresa: cartão CNPJ, contrato social e alterações, comprovante de endereço e documento do representante legal. Beneficiários: documento com foto, CPF e comprovante de vínculo (funcionários: ficha de registro/GFIP; dependentes: certidão de casamento/nascimento). Para redução de carência: carteirinha e comprovantes de pagamento do plano anterior. Acima de 99 vidas: base de vidas e relatórios de sinistralidade.",
  ),
  ans(
    "ans_dependentes",
    "dependentes",
    "Como incluir dependentes?",
    "Dependentes (cônjuge/companheiro(a) e filhos, conforme regras de idade) podem ser incluídos na contratação ou posteriormente. Recém-nascidos incluídos em até 30 dias do nascimento aproveitam as carências já cumpridas pelo titular. Inclusões fora das janelas podem gerar novas carências.",
  ),
  ans(
    "ans_cancelamento",
    "cancelamento",
    "Como funciona o cancelamento?",
    "No plano individual, o pedido de cancelamento pode ser feito pelo titular a qualquer momento, com efeito imediato. No empresarial, a rescisão segue o contrato (aviso prévio e eventuais multas antes de 12 meses de vigência). Ex-funcionários podem ter direito a manter o plano (arts. 30 e 31 da Lei 9.656/98) conforme as condições legais.",
  ),
  ans(
    "ans_implantacao",
    "implantacao",
    "Como é o processo de implantação?",
    "Após a assinatura: envio de documentos e da relação de vidas, análise e aceite da operadora, cadastro dos beneficiários, emissão de carteirinhas/acesso ao app e primeira fatura. A BeSmart acompanha cada etapa e confere a primeira fatura com a proposta aprovada.",
  ),
];

export const LIBRARY_DEFAULTS: LibraryDefault[] = [...DEFAULT_MESSAGES, ...DEFAULT_ANSWERS];
