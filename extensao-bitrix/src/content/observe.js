/*
 * Observação local da permanência na etapa.
 *
 * Quando o Bitrix não exibe a data de entrada na etapa, a extensão registra
 * apenas o que ela própria viu: intervalos em que o card esteve visível na mesma
 * etapa. Períodos sem observação (página fechada, outro funil aberto, computador
 * desligado) ficam como lacunas e, por padrão, NÃO são contados — não se presume
 * que o card permaneceu na etapa durante esse tempo.
 *
 * Armazenamento mínimo por card: chave (entidade:ID), chave da etapa e instantes.
 * Nenhum título, valor, responsável ou conteúdo do card é gravado.
 */
(function (root) {
  'use strict';
  const NS = root.BNKA || (root.BNKA = {});
  const time = NS.time || (typeof require === 'function' ? require('./time.js') : null);

  const MAX_INTERVALS = 500;
  const MAX_SEGMENTS = 6;
  const MAX_CARDS = 5000;

  function emptyStore() {
    return { v: 1, cards: {} };
  }

  function sanitizeStore(raw) {
    const store = emptyStore();
    if (!raw || typeof raw !== 'object' || !raw.cards || typeof raw.cards !== 'object') return store;
    for (const key of Object.keys(raw.cards)) {
      const rec = raw.cards[key];
      if (!/^[a-z0-9]{1,16}:\d{1,12}$/.test(key) || !rec || !Array.isArray(rec.s)) continue;
      const segs = rec.s.filter((sg) => sg && typeof sg.k === 'string' && Array.isArray(sg.iv) && sg.iv.length &&
        sg.iv.every((iv) => Array.isArray(iv) && iv.length === 2 && iv[0] <= iv[1]));
      if (!segs.length) continue;
      store.cards[key] = {
        s: segs.slice(-MAX_SEGMENTS).map((sg) => ({
          k: sg.k.slice(0, 160), f: +sg.f || sg.iv[0][0], iv: sg.iv.slice(-MAX_INTERVALS),
          br: Array.isArray(sg.br) ? sg.br.filter((i) => Number.isInteger(i)) : [],
          g: +sg.g || 0, ap: !!sg.ap, res: !!sg.res, from: typeof sg.from === 'string' ? sg.from.slice(0, 160) : null
        })),
        l: +rec.l || 0
      };
    }
    return store;
  }

  function compress(seg) {
    while (seg.iv.length > MAX_INTERVALS) {
      // Funde os dois intervalos mais antigos; a contagem passa a ser aproximada.
      seg.iv.splice(0, 2, [seg.iv[0][0], seg.iv[1][1]]);
      seg.br = seg.br.filter((i) => i !== 1).map((i) => (i > 1 ? i - 1 : i));
      seg.ap = true;
    }
  }

  /**
   * Registra que o card "key" foi visto na etapa "stageKey" no instante t.
   * opts: { continuityMs, isPaused(stageKey) }
   * Retorna o segmento atual.
   */
  function recordObservation(store, key, stageKey, t, opts) {
    const o = opts || {};
    const continuity = o.continuityMs || 15 * 60000;
    const isPaused = o.isPaused || (() => false);
    let rec = store.cards[key];
    if (!rec) rec = store.cards[key] = { s: [], l: 0 };
    const cur = rec.s[rec.s.length - 1];

    if (cur && cur.k === stageKey) {
      const last = cur.iv[cur.iv.length - 1];
      if (t >= last[1]) {
        if (t - last[1] <= continuity) last[1] = t;
        else { cur.iv.push([t, t]); cur.g += 1; }
      }
      compress(cur);
      rec.l = Math.max(rec.l, t);
      return cur;
    }

    let seg = null;
    if (cur && !isPaused(stageKey)) {
      // Retorno após etapa(s) que suspendem o SLA: retoma a contagem anterior da etapa.
      let j = -1;
      for (let i = rec.s.length - 1; i >= 0; i--) if (rec.s[i].k === stageKey) { j = i; break; }
      if (j >= 0 && j < rec.s.length - 1 && rec.s.slice(j + 1).every((sg) => isPaused(sg.k))) {
        const prev = rec.s[j];
        seg = {
          k: stageKey, f: prev.f, iv: prev.iv.map((iv) => [iv[0], iv[1]]).concat([[t, t]]),
          br: prev.br.concat([prev.iv.length]), g: prev.g, ap: prev.ap, res: true, from: cur.k
        };
      }
    }
    if (!seg) seg = { k: stageKey, f: t, iv: [[t, t]], br: [], g: 0, ap: false, res: false, from: cur ? cur.k : null };
    rec.s.push(seg);
    if (rec.s.length > MAX_SEGMENTS) rec.s.splice(0, rec.s.length - MAX_SEGMENTS);
    compress(seg);
    rec.l = Math.max(rec.l, t);
    return seg;
  }

  function currentSegment(store, key) {
    const rec = store.cards[key];
    return rec && rec.s.length ? rec.s[rec.s.length - 1] : null;
  }

  /** Segmento anterior ao atual (para informar a mudança de etapa observada). */
  function previousSegment(store, key) {
    const rec = store.cards[key];
    return rec && rec.s.length > 1 ? rec.s[rec.s.length - 2] : null;
  }

  /**
   * Tempo na etapa segundo a observação local.
   * countGaps=false: soma só os intervalos observados.
   * countGaps=true: preenche lacunas entre observações (exceto períodos em etapa de pausa).
   */
  function computeElapsed(seg, cfg, countGaps) {
    const eff = [];
    seg.iv.forEach((iv, i) => {
      const prev = eff[eff.length - 1];
      if (countGaps && prev && !seg.br.includes(i)) prev[1] = iv[1];
      else eff.push([iv[0], iv[1]]);
    });
    let ms = 0;
    for (const [a, b] of eff) ms += time.durationMs(a, b, cfg);
    let gapMs = 0;
    for (let i = 1; i < seg.iv.length; i++) {
      if (!seg.br.includes(i)) gapMs += seg.iv[i][0] - seg.iv[i - 1][1];
    }
    return { ms, intervals: eff, gaps: seg.g, gapMs, start: seg.f, approx: seg.ap, resumed: seg.res };
  }

  /** Instante em que o tempo acumulado nos intervalos atingiu "limitMs" (ou null). */
  function pointAtElapsed(intervals, limitMs, cfg) {
    let acc = 0;
    for (const [a, b] of intervals) {
      const d = time.durationMs(a, b, cfg);
      if (acc + d >= limitMs) return time.addDuration(a, limitMs - acc, cfg);
      acc += d;
    }
    return null;
  }

  function removeCard(store, key) {
    delete store.cards[key];
  }

  /** Limite de retenção e de quantidade de cards. Retorna quantos registros foram removidos. */
  function pruneStore(store, now, retentionDays) {
    const cutoff = now - retentionDays * 86400000;
    let removed = 0;
    for (const key of Object.keys(store.cards)) {
      if (store.cards[key].l < cutoff) { delete store.cards[key]; removed++; }
    }
    const keys = Object.keys(store.cards);
    if (keys.length > MAX_CARDS) {
      keys.sort((a, b) => store.cards[a].l - store.cards[b].l);
      for (const k of keys.slice(0, keys.length - MAX_CARDS)) { delete store.cards[k]; removed++; }
    }
    return removed;
  }

  /**
   * Mescla o que está salvo (possivelmente gravado por outra aba do portal) com a memória
   * desta aba: por card, prevalece o registro observado mais recentemente.
   */
  function mergeStores(stored, mine, deletedKeys) {
    const out = stored && stored.cards ? stored : emptyStore();
    for (const key of Object.keys(mine.cards)) {
      const a = out.cards[key]; const b = mine.cards[key];
      if (!a || b.l >= a.l) out.cards[key] = b;
    }
    if (deletedKeys) for (const key of deletedKeys) delete out.cards[key];
    return out;
  }

  // ---- Registro de funis/etapas vistos (somente nomes de configuração) ----

  function emptyRegistry() {
    return { v: 1, funnels: {} };
  }

  function sanitizeRegistry(raw) {
    const reg = emptyRegistry();
    if (!raw || typeof raw !== 'object' || !raw.funnels) return reg;
    for (const fk of Object.keys(raw.funnels).slice(0, 100)) {
      const f = raw.funnels[fk];
      if (!f || typeof f !== 'object' || !f.st) continue;
      const st = {};
      for (const sk of Object.keys(f.st).slice(0, 200)) {
        const s = f.st[sk];
        if (s && typeof s.n === 'string') st[sk] = { n: s.n.slice(0, 120), id: typeof s.id === 'string' ? s.id.slice(0, 80) : null, o: +s.o || 0 };
      }
      reg.funnels[fk] = { n: typeof f.n === 'string' ? f.n.slice(0, 120) : fk, l: +f.l || 0, st };
    }
    return reg;
  }

  function registerStage(reg, funnelKey, funnelName, stageKey, stageName, stageId, order, t) {
    let f = reg.funnels[funnelKey];
    if (!f) f = reg.funnels[funnelKey] = { n: funnelName || funnelKey, l: t, st: {} };
    if (funnelName) f.n = funnelName;
    f.l = Math.max(f.l, t);
    const prev = f.st[stageKey];
    f.st[stageKey] = { n: stageName || (prev && prev.n) || stageKey, id: stageId || (prev && prev.id) || null, o: typeof order === 'number' ? order : prev ? prev.o : 999 };
  }

  function mergeRegistry(stored, mine) {
    const out = stored && stored.funnels ? stored : emptyRegistry();
    for (const fk of Object.keys(mine.funnels)) {
      const a = out.funnels[fk]; const b = mine.funnels[fk];
      if (!a) { out.funnels[fk] = b; continue; }
      if (b.l >= a.l) a.n = b.n;
      a.l = Math.max(a.l, b.l);
      Object.assign(a.st, b.st);
    }
    return out;
  }

  const api = {
    mergeStores, mergeRegistry, MAX_INTERVALS, MAX_SEGMENTS, MAX_CARDS, emptyStore, sanitizeStore, recordObservation, currentSegment,
    previousSegment, computeElapsed, pointAtElapsed, removeCard, pruneStore, emptyRegistry, sanitizeRegistry,
    registerStage
  };
  NS.observe = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
