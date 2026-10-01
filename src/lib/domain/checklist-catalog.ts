/**
 * Catálogo padrão dos modelos de checklist NEW e RENEW (baseado na planilha de referência da operação e no
 * Playbook Be Smart — PJ +99 → Documentação / Análise técnica e risco).
 * É usado pelo seed para popular `checklist_templates`; a partir daí o modelo é configurável em
 * Configurações → Checklists (obrigatoriedade separada para NEW e RENEW, ordem, ativação).
 *
 * `condition` define quando o item se aplica; `autoSource` define como o motor detecta que o item
 * já foi atendido por dados existentes no sistema (ver checklist-engine.ts).
 */
import type { DocumentType } from "./constants";

export const CHECKLIST_CATEGORIES = ["empresa", "contrato", "comercial", "sinistralidade", "base_vidas", "situacoes_especiais", "documentos"] as const;
export type ChecklistCategory = (typeof CHECKLIST_CATEGORIES)[number];
export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  empresa: "Dados da empresa",
  contrato: "Contrato atual",
  comercial: "Condições comerciais",
  sinistralidade: "Sinistralidade e carteira",
  base_vidas: "Base de vidas",
  situacoes_especiais: "Situações especiais",
  documentos: "Documentos",
};

export interface ChecklistCatalogItem {
  key: string;
  label: string;
  category: ChecklistCategory;
  requiredNew: boolean;
  requiredRenew: boolean;
  /** Se ausente, o item aparece no modelo; `inNew`/`inRenew` false remove do respectivo modelo. */
  inNew?: boolean;
  inRenew?: boolean;
  condition: string;
  autoSource: string | null;
  documentType?: DocumentType;
  /** Texto usado no pedido ao cliente (seção 34). */
  requestText: string;
}

export const CHECKLIST_CATALOG: ChecklistCatalogItem[] = [
  { key: "estipulante", label: "Nome do estipulante", category: "empresa", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:stipulant", requestText: "Nome do estipulante" },
  { key: "carta_nomeacao", label: "Carta de nomeação para as operadoras/seguradoras", category: "empresa", requiredNew: true, requiredRenew: false, condition: "always", autoSource: "doc:carta_nomeacao", documentType: "carta_nomeacao", requestText: "Carta de nomeação da BeSmart para as operadoras/seguradoras, assinada pelo representante legal" },
  { key: "contrato_social", label: "Contrato social e cartão CNPJ", category: "empresa", requiredNew: true, requiredRenew: false, condition: "always", autoSource: "doc:contrato_social", documentType: "contrato_social", requestText: "Contrato social e cartão CNPJ (e RG/CPF ou CNH do representante legal)" },
  { key: "cnpj", label: "CNPJ(s) participantes", category: "empresa", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:cnpjs", requestText: "Todos os CNPJs participantes" },
  { key: "operadora", label: "Operadora/seguradora atual", category: "contrato", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:current_insurer", requestText: "Operadora/seguradora atual (incluindo múltiplas, quando houver)" },
  { key: "vigencia", label: "Vigência contratual", category: "contrato", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:contract_term", requestText: "Vigência contratual de cada contrato atual" },
  { key: "aniversario", label: "Aniversário do contrato / data de renovação", category: "contrato", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:anniversary", requestText: "Data de renovação de todos os contratos atuais" },
  { key: "planos_vidas", label: "Planos atuais e quantidade de vidas por plano", category: "contrato", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:plans", requestText: "Planos atuais e quantidade de vidas por plano" },
  { key: "custos_planos", label: "Valor atual (custo por plano)", category: "contrato", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:costs", requestText: "Valores/custos atuais por plano" },
  { key: "reembolsos", label: "Reembolsos atuais (consulta por plano)", category: "contrato", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:reimbursement", requestText: "Valor atual de reembolso de consulta por plano" },
  { key: "tipo_contratacao", label: "Tipo de contratação (Opcional/Compulsório)", category: "contrato", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:modality", requestText: "Modalidade de contratação: Opcional ou Compulsório" },
  { key: "encampacao", label: "Encampação/tombamento das vidas", category: "contrato", requiredNew: true, requiredRenew: true, condition: "modality:opcional", autoSource: "field:takeover", requestText: "Se opcional, informar se haverá encampação/tombamento das vidas" },
  { key: "fgts", label: "Cotação considera 100% do FGTS?", category: "comercial", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:fgts", requestText: "Confirmar se a cotação considera 100% do FGTS do(s) CNPJ(s)" },
  { key: "forma_pagamento", label: "Forma de pagamento", category: "comercial", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:payment_method", requestText: "Forma de pagamento" },
  { key: "remissao", label: "Remissão", category: "comercial", requiredNew: false, requiredRenew: true, condition: "always", autoSource: "field:remission", requestText: "Remissão vigente" },
  { key: "coparticipacao", label: "Modelo de coparticipação", category: "comercial", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:copay_model", requestText: "Modelo de coparticipação e procedimentos abrangidos" },
  { key: "contribuicao", label: "Detalhamento de contribuição", category: "comercial", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:contribution", requestText: "Valor ou percentual de contribuição do funcionário e dos dependentes" },
  { key: "upgrade_downgrade", label: "Regras de upgrade e downgrade", category: "comercial", requiredNew: false, requiredRenew: true, condition: "always", autoSource: "field:upgrade_rules", requestText: "Regras de upgrade e downgrade" },
  { key: "indice_reajuste", label: "Índice de reajuste", category: "comercial", requiredNew: false, requiredRenew: true, condition: "always", autoSource: "field:adjustment_index", requestText: "Índice de reajuste aplicado" },
  { key: "break_even", label: "Break-even", category: "comercial", requiredNew: false, requiredRenew: true, condition: "always", autoSource: "field:break_even", requestText: "Break-even do contrato" },
  { key: "motivo_cotacao", label: "Motivo de cotação", category: "comercial", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:reason", requestText: "Motivo da cotação" },
  { key: "alteracao_desenho", label: "Alteração de desenho atual", category: "comercial", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:design_change", requestText: "Se haverá alteração do desenho atual (e qual)" },
  { key: "comissao", label: "Comissão a ser considerada", category: "comercial", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "field:commission", requestText: "Comissão a ser considerada" },
  { key: "sinistralidade", label: "Sinistralidade completa e atualizada", category: "sinistralidade", requiredNew: false, requiredRenew: true, condition: "always", autoSource: "doc:sinistralidade", documentType: "sinistralidade", requestText: "Relatório de sinistralidade completo dos últimos 12 meses" },
  { key: "relatorio_analitico", label: "Relatório analítico de utilização", category: "sinistralidade", requiredNew: false, requiredRenew: true, condition: "always", autoSource: "doc:relatorio_analitico", documentType: "relatorio_analitico", requestText: "Relatório analítico de utilização" },
  { key: "perfil_utilizacao", label: "Perfil de utilização (alto/baixo uso, internações recorrentes, crônicos, gestantes)", category: "sinistralidade", requiredNew: false, requiredRenew: false, condition: "always", autoSource: null, requestText: "Perfil de utilização do grupo: alto ou baixo uso; existência de internações recorrentes, doenças crônicas e gestantes (sem detalhar dados sensíveis individuais)" },
  { key: "evolucao_vidas", label: "Evolução das vidas mês a mês", category: "sinistralidade", requiredNew: false, requiredRenew: true, condition: "always", autoSource: "doc:evolucao_vidas", documentType: "evolucao_vidas", requestText: "Evolução das vidas mês a mês" },
  { key: "maiores_usuarios", label: "10 maiores utilizadores do plano", category: "sinistralidade", requiredNew: false, requiredRenew: true, condition: "always", autoSource: "doc:maiores_usuarios", documentType: "maiores_usuarios", requestText: "Relatório dos 10 maiores utilizadores do plano" },
  { key: "picos_sinistralidade", label: "Detalhamento dos picos de sinistralidade", category: "sinistralidade", requiredNew: false, requiredRenew: true, condition: "always", autoSource: "doc:picos_sinistralidade", documentType: "picos_sinistralidade", requestText: "Detalhamento dos picos de sinistralidade" },
  { key: "base_vidas", label: "Base de vidas importada", category: "base_vidas", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "lives", documentType: "base_vidas", requestText: "Relação de vidas completa em Excel (layout BASE SAÚDE), incluindo sexo, município/UF, afastados (com CID), aposentados e gestantes" },
  { key: "fatura", label: "Fatura do plano atual", category: "documentos", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "doc:fatura", documentType: "fatura", requestText: "Fatura do plano atual" },
  { key: "contrato_atual", label: "Contrato atual", category: "documentos", requiredNew: false, requiredRenew: false, condition: "always", autoSource: "doc:contrato_atual", documentType: "contrato_atual", requestText: "Cópia do contrato atual" },
  { key: "situacoes_declaradas", label: "Situações especiais declaradas (Sim/Não por tipo)", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "always", autoSource: "special:declared", requestText: "Informar se há prestadores de serviço, demitidos/aposentados (arts. 30 e 31), liminares, gestantes, agregados, Home Care, afastados, aposentados por invalidez e casos crônicos" },
  { key: "afastados_cid", label: "CID para afastados", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:afastados", autoSource: "entries:afastados:cid", requestText: "CID dos afastados" },
  { key: "afastados_dados", label: "Afastados: data de afastamento, idade, sexo, plano atual e localidade", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:afastados", autoSource: "entries:afastados:data_afastamento,idade,sexo,plano_atual,localidade", requestText: "Data de afastamento, idade, sexo, plano atual e localidade de cada afastado" },
  { key: "afastados_relatorio", label: "Relatório médico dos afastados", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:afastados", autoSource: "entries:afastados:relatorio_medico", requestText: "Relatório médico dos afastados" },
  { key: "invalidez_cid", label: "CID para aposentados por invalidez", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:aposentados_invalidez", autoSource: "entries:aposentados_invalidez:cid,idade,plano_atual", requestText: "CID, idade e plano atual dos aposentados por invalidez" },
  { key: "demitidos_aposentados", label: "Demitidos e aposentados (arts. 30 e 31)", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:demitidos_aposentados", autoSource: "special:demitidos_aposentados", requestText: "Demitidos e aposentados (arts. 30 e 31 da Lei 9.656/98): quantidade, forma de pagamento, custo médio/faixa etária e emissão de boleto" },
  { key: "agregados", label: "Agregados: idade e parentesco", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:agregados", autoSource: "special:agregados", requestText: "Agregados: idade exata, grau de parentesco e plano atual" },
  { key: "prestadores", label: "Prestadores de serviço e CNPJs", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:prestadores", autoSource: "special:prestadores", requestText: "Prestadores de serviço: quantidade, CNPJ e ligação (estipulante/subestipulante)" },
  { key: "liminares", label: "Liminares e anexos", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:liminares", autoSource: "special:liminares", documentType: "liminar", requestText: "Liminares (quantidade e cópia das decisões)" },
  { key: "gestantes", label: "Gestantes", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:gestantes", autoSource: "special:gestantes", requestText: "Quantidade de gestantes e informações complementares" },
  { key: "home_care", label: "Detalhamento de Home Care", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:home_care", autoSource: "special:home_care", documentType: "relatorio_home_care", requestText: "Home Care: relatório médico atualizado, protocolo e gasto mensal" },
  { key: "cronicos", label: "Casos crônicos — relatório médico", category: "situacoes_especiais", requiredNew: true, requiredRenew: true, condition: "special:cronicos", autoSource: "special:cronicos", documentType: "relatorio_medico", requestText: "Casos crônicos: relatório médico" },
];
