/*
 * Motor de regras: transforma os cards lidos da página em pendências com evidência.
 * Não faz suposições: quando um dado não está disponível, registra o motivo.
 */
(function (root) {
  'use strict';
  const NS = root.BNKA || (root.BNKA = {});
  const req = (n) => (typeof require === 'function' ? require(n) : null);
  const util = NS.util || req('./util.js');
  const time = NS.time || req('./time.js');
  const settingsMod = NS.settings || req('./settings.js');
  const observe = NS.observe || req('./observe.js');

  const HOUR = 3600000;

  const TYPES = {
    sla_nativo: { label: 'SLA vencido (sinalizado pelo Bitrix)', short: 'SLA Bitrix', sev: 4 },
    sla_vencido: { label: 'SLA da etapa vencido', short: 'SLA vencido', sev: 4 },
    prazo_card: { label: 'Prazo do card vencido', short: 'Prazo vencido', sev: 4 },
    atividade_vencida: { label: 'Atividade pendente vencida', short: 'Atividade vencida', sev: 3 },
    parado: { label: 'Parado na etapa além do limite', short: 'Parado', sev: 3 },
    sem_atividade: { label: 'Sem atividade (informado pelo Bitrix)', short: 'Sem atividade', sev: 2 },
    sla_proximo: { label: 'SLA próximo do vencimento', short: 'SLA próximo', sev: 1 }
  };

  const LATE_TYPES = ['prazo_card', 'atividade_vencida'];
  const SLA_TYPES = ['sla_vencido', 'sla_nativo'];

  const PRIORITY_CRITERIA = [
    '1º Gravidade do alerta mais grave: SLA vencido (configurado ou sinalizado pelo Bitrix) e prazo do card vencido → atividade vencida e card parado além do limite → ausência de atividade informada pelo Bitrix → SLA próximo do vencimento.',
    '2º Proporção do atraso em relação ao prazo aplicado (ex.: 6 h de atraso num SLA de 4 h = 150%).',
    '3º Tempo absoluto de atraso.',
    '4º Quantidade de tipos de pendência no mesmo card.',
    '5º Valor informado no card (apenas desempate; moedas diferentes não são convertidas).',
    'A prioridade descreve urgência operacional. Ela não indica causa nem responsabilidade de nenhuma pessoa.'
  ];

  const FINAL_STAGE_RE = /(^|:)(WON|LOSE|LOST|CONVERTED|JUNK|SUCCESS|FAIL|FAILED)$/i;

  function isClosedStage(card, settings) {
    const rule = settingsMod.getRule(settings, card.funnel.key, card.stage.key);
    if (rule.final === true) return 'Etapa marcada como finalizada na configuração.';
    if (rule.final === false) return null;
    if (card.stage.id && FINAL_STAGE_RE.test(card.stage.id)) {
      return 'ID da etapa exibido pelo Bitrix indica encerramento (' + util.cleanText(card.stage.id, 40) + ').';
    }
    return null;
  }

  function findField(card, labels) {
    const wanted = labels.map(util.normKey).filter(Boolean);
    if (!wanted.length) return { configured: false };
    for (const f of card.fields || []) {
      const k = util.normKey(f.label);
      if (wanted.includes(k)) return { configured: true, field: f };
    }
    return { configured: true, field: null, wanted };
  }

  function missingFieldNote(prefix, lookup, labelsOnPage) {
    const onPage = lookup.wanted.some((w) => labelsOnPage && labelsOnPage.has(w));
    return onPage
      ? prefix + ': campo não exibido neste card.'
      : prefix + ': campo configurado não encontrado na página (não exibido nos cards carregados).';
  }

  function stageElapsed(card, ctx, notes) {
    const { settings, now } = ctx;
    const clock = settings.clock;
    const entry = findField(card, settings.stageEntryLabels);
    if (entry.configured && entry.field) {
      const p = time.parseBrDate(entry.field.value, { now, tz: clock.tz, assumeCurrentYear: settings.assumeCurrentYear });
      if (p.ok) {
        // Data sem hora: usa o fim do dia (menor tempo possível na etapa, sem superestimar).
        const start = p.dateOnly ? time.endOfLocalDay(p.ms, clock.tz) : p.ms;
        if (start <= now) {
          const intervals = [[start, now]];
          return {
            ms: time.durationMs(start, now, clock), intervals, partial: false, projectFrom: now,
            origin: 'Campo exibido pelo Bitrix: "' + util.cleanText(entry.field.label, 60) + '"',
            details: ['Entrada na etapa: ' + time.formatDateTime(p.ms, clock.tz) + (p.dateOnly ? ' (somente data; contagem a partir do fim do dia)' : '')]
          };
        }
        notes.push('Entrada na etapa: data futura no campo exibido — ignorada.');
      } else {
        notes.push('Entrada na etapa: valor "' + util.cleanText(entry.field.value, 40) + '" não utilizado (' + p.reason + ').');
      }
    } else if (entry.configured) {
      notes.push(missingFieldNote('Entrada na etapa', entry, ctx.labelsOnPage));
    }

    const seg = observe.currentSegment(ctx.obs, card.key);
    if (!seg || seg.k !== obsStageKey(card)) return null;
    const el = observe.computeElapsed(seg, clock, settings.countGaps);
    const details = ['Contagem parcial desde a observação local. Não é o histórico oficial do Bitrix.',
      'Primeira observação nesta etapa: ' + time.formatDateTime(seg.f, clock.tz) + '.'];
    if (seg.from) details.push('Mudança de etapa observada (antes: ' + stageNameFor(ctx, card.funnel.key, seg.from) + '); o momento exato da entrada não é conhecido.');
    else details.push('A entrada na etapa ocorreu antes da primeira observação; o tempo real pode ser maior.');
    if (el.resumed) details.push('Retorno após etapa que suspende o SLA: contagem anterior retomada.');
    if (el.gaps) {
      details.push(settings.countGaps
        ? el.gaps + ' período(s) sem observação (' + util.formatDuration(el.gapMs) + ') contados por opção nas configurações.'
        : el.gaps + ' período(s) sem observação (' + util.formatDuration(el.gapMs) + ') não contados.');
    }
    if (el.approx) details.push('Histórico local compactado: contagem aproximada.');
    return { ms: el.ms, intervals: el.intervals, partial: true, origin: 'Contagem parcial desde a observação local', details, projectFrom: card.present ? now : null };
  }

  /** Chave da etapa usada na observação local: funil + etapa. */
  function obsStageKey(card) {
    return card.funnel.key + '|' + card.stage.key;
  }

  function stageNameFor(ctx, funnelKey, obsKey) {
    const stageKey = String(obsKey).split('|').pop();
    const f = ctx.registry && ctx.registry.funnels[funnelKey];
    const s = f && f.st[stageKey];
    return s ? s.n : stageKey;
  }

  function timeRule(type, limitHours, elapsed, ctx) {
    const clock = ctx.settings.clock;
    const limit = limitHours * HOUR;
    const modeLabel = clock.mode === 'expediente' ? 'expediente' : 'tempo corrido';
    const base = {
      limitMs: limit, partial: elapsed.partial, origin: elapsed.origin,
      details: elapsed.details.concat(['Prazo aplicado: ' + util.formatHours(limitHours) + ' (' + modeLabel + ').'])
    };
    if (elapsed.ms >= limit) {
      return Object.assign(base, {
        type, overdueMs: elapsed.ms - limit,
        deadline: observe.pointAtElapsed(elapsed.intervals, limit, clock)
      });
    }
    if (type === 'sla_vencido' && ctx.settings.warnPct > 0 && elapsed.ms >= limit * ctx.settings.warnPct / 100) {
      const remaining = limit - elapsed.ms;
      return Object.assign(base, {
        type: 'sla_proximo', remainingMs: remaining,
        deadline: elapsed.projectFrom ? time.addDuration(elapsed.projectFrom, remaining, clock) : null,
        details: base.details.concat(['Aviso a partir de ' + ctx.settings.warnPct + '% do prazo.'])
      });
    }
    return null;
  }

  function analyzeCard(card, ctx) {
    const { settings, now } = ctx;
    const clock = settings.clock;
    const notes = [];
    const alerts = [];
    let evaluable = 0;

    const closedReason = isClosedStage(card, settings);
    if (closedReason) return { card, closed: true, closedReason, alerts, notes, maxSev: 0, status: 'encerrado' };

    const rule = settingsMod.getRule(settings, card.funnel.key, card.stage.key);

    // Sinais nativos exibidos pelo Bitrix
    const sig = card.signals || {};
    if (sig.nativeSla) {
      alerts.push({ type: 'sla_nativo', origin: 'Sinalização exibida pelo Bitrix no card', details: ['Indicador: ' + sig.nativeSla.text], deadline: null, overdueMs: null });
    }
    if (sig.activityOverdue) {
      alerts.push({ type: 'atividade_vencida', origin: 'Indicador de atividade exibido pelo Bitrix', details: ['Indicador: ' + sig.activityOverdue.text, 'Prazo e atraso da atividade não são exibidos no card.'], deadline: null, overdueMs: null });
    }
    if (sig.noActivity) {
      alerts.push({ type: 'sem_atividade', origin: 'Texto exibido pelo Bitrix no card', details: ['Indicador: ' + sig.noActivity.text], deadline: null, overdueMs: null });
    }
    if (card.signalsAvailable) evaluable++;

    // Prazo do card (campo operacional configurado)
    const dl = findField(card, settings.deadlineLabels);
    if (!dl.configured) {
      notes.push('Prazo do card: nenhum campo configurado.');
    } else if (!dl.field) {
      notes.push(missingFieldNote('Prazo do card', dl, ctx.labelsOnPage));
    } else {
      const p = time.parseBrDate(dl.field.value, { now, tz: clock.tz, assumeCurrentYear: settings.assumeCurrentYear });
      if (!p.ok) {
        notes.push('Prazo do card: valor "' + util.cleanText(dl.field.value, 40) + '" não utilizado (' + p.reason + ').' +
          (p.reason === 'data exibida sem ano' ? ' Se o Bitrix omite o ano corrente, ative essa opção nas configurações.' : ''));
      } else {
        evaluable++;
        const due = p.dateOnly ? time.endOfLocalDay(p.ms, clock.tz) : p.ms;
        const origin = 'Campo exibido pelo Bitrix: "' + util.cleanText(dl.field.label, 60) + '"';
        if (now >= due) {
          alerts.push({
            type: 'prazo_card', origin, deadline: due, overdueMs: time.durationMs(due, now, clock),
            details: ['Prazo exibido: ' + util.cleanText(dl.field.value, 40) + (p.dateOnly ? ' (vence ao fim do dia)' : '') + (p.assumedYear ? ' — ano corrente presumido por opção' : '') + '.']
          });
        } else {
          notes.push('Prazo do card: ' + time.formatDateTime(due, clock.tz) + ' (dentro do prazo).');
        }
      }
    }

    // SLA da etapa e permanência
    if (rule.pause) {
      notes.push('Etapa configurada para suspender o SLA: contagem pausada.');
    } else if (rule.sla > 0 || rule.stall > 0) {
      const elapsed = stageElapsed(card, ctx, notes);
      if (!elapsed) {
        notes.push('Tempo na etapa: sem observação nesta etapa ainda.');
      } else {
        evaluable++;
        if (rule.sla > 0) {
          const a = timeRule('sla_vencido', rule.sla, elapsed, ctx);
          if (a) alerts.push(a);
          else notes.push('SLA: ' + util.formatDuration(elapsed.ms) + ' de ' + util.formatHours(rule.sla) + (elapsed.partial ? ' (contagem parcial)' : '') + '.');
        }
        if (rule.stall > 0) {
          const a = timeRule('parado', rule.stall, elapsed, ctx);
          if (a) alerts.push(a);
        }
      }
    } else {
      notes.push('SLA e limite de permanência não configurados para esta etapa (0 = desativado).');
    }

    for (const a of alerts) {
      a.label = TYPES[a.type].label;
      a.sev = TYPES[a.type].sev;
    }
    // Mais grave primeiro; na mesma gravidade, o que tem prazo e atraso conhecidos.
    alerts.sort((x, y) => (y.sev - x.sev) || ((y.overdueMs != null ? 1 : 0) - (x.overdueMs != null ? 1 : 0)) || ((y.overdueMs || 0) - (x.overdueMs || 0)));
    const maxSev = alerts.reduce((m, a) => Math.max(m, a.sev), 0);
    const status = alerts.length ? 'pendente' : evaluable ? 'sem_pendencia' : 'sem_dados';
    return { card, closed: false, alerts, notes, maxSev, status };
  }

  function priorityTuple(r) {
    let ratio = 0; let overdue = 0;
    for (const a of r.alerts) {
      if (a.overdueMs && a.limitMs) ratio = Math.max(ratio, a.overdueMs / a.limitMs);
      if (a.overdueMs) overdue = Math.max(overdue, a.overdueMs);
    }
    const types = new Set(r.alerts.map((a) => a.type)).size;
    const amount = r.card.amount ? r.card.amount.amount : 0;
    return [r.maxSev, ratio, overdue, types, amount];
  }

  function comparePriority(a, b) {
    const ta = priorityTuple(a); const tb = priorityTuple(b);
    for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) return tb[i] - ta[i];
    return String(a.card.title).localeCompare(String(b.card.title), 'pt-BR');
  }

  function addMoney(map, amount) {
    if (!amount) return;
    const k = amount.currency || '?';
    map[k] = (map[k] || 0) + amount.amount;
  }

  function summarize(results) {
    const s = {
      recognized: results.length, closed: 0, open: 0, withAlerts: 0, late: 0, slaOverdue: 0, warnings: 0,
      stalled: 0, noActivity: 0, noData: 0, noIssue: 0, overdueValue: {}, overdueWithoutValue: 0,
      byStage: {}, byResponsible: {}, byType: {}
    };
    for (const r of results) {
      if (r.closed) { s.closed++; continue; }
      s.open++;
      if (r.status === 'sem_dados') s.noData++;
      if (r.status === 'sem_pendencia') s.noIssue++;
      if (!r.alerts.length) continue;
      s.withAlerts++;
      const types = new Set(r.alerts.map((a) => a.type));
      if (LATE_TYPES.some((t) => types.has(t))) s.late++;
      if (SLA_TYPES.some((t) => types.has(t))) s.slaOverdue++;
      if (types.has('sla_proximo')) s.warnings++;
      if (types.has('parado')) s.stalled++;
      if (types.has('sem_atividade')) s.noActivity++;
      for (const t of types) s.byType[t] = (s.byType[t] || 0) + 1;
      // Valor contado uma única vez por card, mesmo com vários alertas.
      if (r.maxSev >= 3) {
        if (r.card.amount) addMoney(s.overdueValue, r.card.amount);
        else s.overdueWithoutValue++;
      }
      const stageLabel = (r.card.funnel.name ? r.card.funnel.name + ' › ' : '') + (r.card.stage.name || 'Etapa não identificada');
      s.byStage[stageLabel] = (s.byStage[stageLabel] || 0) + 1;
      const resp = r.card.responsible || 'Responsável não exibido';
      s.byResponsible[resp] = (s.byResponsible[resp] || 0) + 1;
    }
    return s;
  }

  function analyzeAll(cards, ctx) {
    const results = cards.map((c) => analyzeCard(c, ctx));
    const queue = results.filter((r) => !r.closed).sort(comparePriority);
    return { results, queue, summary: summarize(results) };
  }

  const api = { obsStageKey, TYPES, LATE_TYPES, SLA_TYPES, PRIORITY_CRITERIA, FINAL_STAGE_RE, isClosedStage, analyzeCard, analyzeAll, comparePriority, summarize };
  NS.analyze = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
