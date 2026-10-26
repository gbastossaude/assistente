// Configuração de DEMONSTRAÇÃO. Os prazos abaixo são EXEMPLOS FICTÍCIOS para exibir o
// funcionamento da extensão — não representam prazos da sua operação.
import { defaultConfig, brazilHolidays } from '../core/config.js';

export function demoConfig(now = Date.now()) {
  const c = defaultConfig();
  const y = new Date(now).getUTCFullYear();
  const d = (value, unit = 'd') => ({ value, unit });
  c.portalOrigin = 'https://demo-ficticio.bitrix24.invalid';
  c.focusPage = null; // a demonstração mostra vários funis; no modo real o foco é a página be.smart Saúde
  c.monitored = [{ entityTypeId: 2, categoryIds: [0, 3] }, { entityTypeId: 1036, categoryIds: [7, 8] }]; // o funil 8 (Pós-venda) é excluído pelo nome
  c.calendar = { timezone: 'America/Sao_Paulo', workdays: [1, 2, 3, 4, 5],
    intervals: [{ start: '08:30', end: '12:00' }, { start: '13:00', end: '18:00' }],
    holidays: [...brazilHolidays(y), ...brazilHolidays(y + 1)], dayMinutes: null, confirmed: true };
  const rule = (id, entityTypeId, categoryId, stageId, duration, mode = 'util', extra = {}) =>
    ({ id, entityTypeId, categoryId, stageId, duration, mode, warnPercent: 75, onReturn: 'reiniciar', pause: [], exceptions: [], enabled: true, example: true, ...extra });
  c.slaRules = [
    rule('ex1', 2, 0, 'NEW', d(2), 'util', { exceptions: [{ field: 'ufCrm_TIPO_ATEND', op: 'eq', value: '103', action: 'prazo', duration: d(4, 'h'), label: 'Tipo de atendimento = Urgente' }] }),
    rule('ex2', 2, 0, 'PREPARATION', d(3)),
    rule('ex3', 2, 0, 'PREPAYMENT_INVOICE', d(5), 'corrido'),
    rule('ex4', 2, 0, 'EXECUTING', d(1)),
    rule('ex5', 2, 0, 'FINAL_INVOICE', d(3), 'util', { onReturn: 'acumular', pause: [{ field: 'ufCrm_AGUARD_CLIENTE', op: 'eq', value: 'Y', label: 'Aguardando cliente = Sim' }] }),
    rule('ex6', 2, 3, 'C3:NEW', d(8, 'h')),
    rule('ex7', 2, 3, 'C3:PREPARATION', d(2)),
    rule('ex8', 2, 3, 'C3:EXECUTING', d(5)),
    rule('ex9', 2, 3, 'C3:UC_BOLETO', d(2)),
    rule('ex10', 2, 3, 'C3:UC_IMPL', d(10), 'corrido'),
    rule('ex11', 1036, 7, 'DT1036_7:NEW', d(4, 'h')),
    rule('ex12', 1036, 7, 'DT1036_7:PREPARATION', d(2)),
    rule('ex13', 1036, 7, 'DT1036_7:CLIENT', d(5))
  ];
  c.processRules = [
    { id: 'px1', entityTypeId: 2, categoryId: 3, duration: d(15), mode: 'util', warnPercent: 80, startMode: 'entrada_funil',
      pauseStages: ['C3:PREPARATION'], enabled: true, example: true }
  ];
  c.stagnationRules = [
    { id: 'st1', entityTypeId: 2, categoryId: 0, stageId: '*', limit: d(15), mode: 'corrido', enabled: true, example: true },
    { id: 'st2', entityTypeId: 2, categoryId: 3, stageId: '*', limit: d(10), mode: 'corrido', enabled: true, example: true }
  ];
  c.noFutureActivityRules = [
    { id: 'nf1', entityTypeId: 2, categoryId: 0, excludeStages: [], enabled: true },
    { id: 'nf2', entityTypeId: 2, categoryId: 3, excludeStages: ['C3:UC_IMPL'], enabled: true },
    { id: 'nf3', entityTypeId: 1036, categoryId: 7, excludeStages: [], enabled: true }
  ];
  c.noInteractionRules = [
    { id: 'ni1', entityTypeId: 2, categoryId: 0, limit: d(3), mode: 'util', excludeStages: [], enabled: true, example: true },
    { id: 'ni2', entityTypeId: 2, categoryId: 3, limit: d(5), mode: 'util', excludeStages: [], enabled: true, example: true },
    { id: 'ni3', entityTypeId: 1036, categoryId: 7, limit: d(2), mode: 'util', excludeStages: [], enabled: true, example: true }
  ];
  c.deadlineFields = { 2: { field: 'ufCrm_PRAZO_PROPOSTA', label: 'Prazo da proposta', type: 'date', warnHours: 24 } };
  c.interaction.automationUserIds = ['1'];
  c.priority.stageWeights = { '2:FINAL_INVOICE': 10, '2:C3:UC_BOLETO': 10 };
  return c;
}
