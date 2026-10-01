/** Valores padrão dos parâmetros configuráveis (tabela settings). */
import { DEFAULT_ANS_AGE_BANDS, type AgeBand } from "./age";

export interface ReadinessWeights {
  documentacao: number;
  base_vidas: number;
  comercial: number;
  casos_especiais: number;
}

export interface RetentionPolicy {
  /** Dias para expurgo definitivo de registros excluídos logicamente (0 = nunca). */
  softDeletedDays: number;
  /** Dias de retenção do histórico do assistente. */
  assistantHistoryDays: number;
  /** Dias de retenção de notificações lidas. */
  readNotificationsDays: number;
}

export interface AppSettings {
  copay_max_pct: number;
  ans_age_bands: AgeBand[];
  readiness_weights: ReadinessWeights;
  retention: RetentionPolicy;
  /** Dias até a data-alvo para considerar a cotação "crítica". */
  critical_deadline_days: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  copay_max_pct: 30,
  ans_age_bands: DEFAULT_ANS_AGE_BANDS,
  readiness_weights: { documentacao: 50, base_vidas: 25, comercial: 15, casos_especiais: 10 },
  retention: { softDeletedDays: 1825, assistantHistoryDays: 365, readNotificationsDays: 90 },
  critical_deadline_days: 5,
};

export type SettingKey = keyof AppSettings;

export interface AutomationRuleDef {
  key: string;
  name: string;
  description: string;
  params: Record<string, number>;
  paramLabels?: Record<string, string>;
}

/** Regras do motor de automações (seção 20). Prazos editáveis em Configurações → Automações. */
export const AUTOMATION_RULES: AutomationRuleDef[] = [
  { key: "checklist_on_create", name: "Gerar checklist ao criar cotação", description: "Ao criar cotação, gera o checklist NEW ou RENEW correspondente e avalia o que já está atendido.", params: {} },
  {
    key: "renewal_milestones",
    name: "Marcos de renovação",
    description: "Ao cadastrar renovação, cria tarefas: iniciar preparação, solicitar documentação, cotação no mercado e negociação final.",
    params: { preparacao: 120, documentacao: 90, mercado: 60, negociacao: 30 },
    paramLabels: { preparacao: "Iniciar preparação (dias antes)", documentacao: "Solicitar documentação (dias antes)", mercado: "Cotação no mercado (dias antes)", negociacao: "Fase final de negociação (dias antes)" },
  },
  { key: "document_updates_checklist", name: "Documento atualiza checklist", description: "Documento obrigatório recebido/validado atualiza o item correspondente do checklist.", params: {} },
  { key: "invalid_document_pendency", name: "Documento inválido gera pendência", description: "Documento marcado como inválido ou desatualizado cria pendência documental.", params: { prazo: 3 }, paramLabels: { prazo: "Prazo da pendência (dias)" } },
  { key: "ready_suggests_sending", name: "Sugerir envio ao mercado", description: "Cotação pronta para mercado gera notificação sugerindo o envio às operadoras.", params: {} },
  { key: "followup_after_send", name: "Follow-up após envio", description: "Envio a operadora cria follow-up automático em X dias.", params: { dias: 5 }, paramLabels: { dias: "Dias após o envio" } },
  { key: "proposal_cancels_followup", name: "Proposta cancela cobrança", description: "Proposta recebida cancela as tarefas de follow-up de cobrança daquela operadora.", params: {} },
  { key: "proposal_expiring", name: "Proposta próxima de vencer", description: "Alerta e pendência quando a validade da proposta estiver a X dias.", params: { dias: 7 }, paramLabels: { dias: "Dias de antecedência" } },
  { key: "stale_process", name: "Processo sem movimentação", description: "Alerta quando a cotação fica X dias sem movimentação.", params: { dias: 7 }, paramLabels: { dias: "Dias sem movimentação" } },
  { key: "insurer_no_response", name: "Operadora sem resposta", description: "Cria pendência quando a operadora passa X dias da data prevista de retorno sem resposta.", params: { dias: 0 }, paramLabels: { dias: "Tolerância após data prevista (dias)" } },
  { key: "overdue_tasks", name: "Tarefas atrasadas", description: "Destaca tarefas atrasadas no dashboard e notifica o responsável.", params: {} },
  { key: "task_reminders", name: "Lembretes de tarefas", description: "Notifica o responsável no horário de lembrete configurado na tarefa.", params: {} },
];
