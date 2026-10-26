// Versão 1.6: pós-venda excluído, sem expediente, comercial pelo e-mail do especialista.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameFromEmail, extractEmail, isExcludedName, effectiveMonitored, mergeConfig, specialistFieldFor, commercialOfCard, defaultConfig } from '../src/core/config.js';

test('e-mail do especialista vira nome e sobrenome', () => {
  assert.equal(nameFromEmail('yago.barbosa@besmart.com.br'), 'Yago Barbosa');
  assert.equal(nameFromEmail('YAGO.BARBOSA@BESMART.COM.BR'), 'Yago Barbosa');
  assert.equal(nameFromEmail('maria.da.silva@x.com'), 'Maria da Silva');
  assert.equal(nameFromEmail('joao_pedro-souza2+crm@x.com'), 'Joao Pedro Souza');
  assert.equal(nameFromEmail('ana@x.com'), 'Ana');
  assert.equal(extractEmail('Especialista: Yago Barbosa <yago.barbosa@besmart.com.br>'), 'yago.barbosa@besmart.com.br');
  assert.equal(extractEmail([{ VALUE: 'x@y.com.br', VALUE_TYPE: 'WORK' }]), 'x@y.com.br');
  assert.equal(extractEmail(''), null);
  assert.equal(extractEmail('sem e-mail'), null);
});

test('comercial: e-mail do especialista primeiro, senão quem abriu o card', () => {
  const meta = { fields: { 1056: { ufCrm5_ESPEC: { type: 'string', title: 'E-mail do especialista' }, ufCrm5_OBS: { type: 'string', title: 'Observação' } } } };
  const cfg = defaultConfig();
  assert.equal(specialistFieldFor(cfg, meta, 1056).field, 'ufCrm5_ESPEC');
  const com = commercialOfCard({ entityTypeId: 1056, createdById: '7', fields: { ufCrm5_ESPEC: 'yago.barbosa@besmart.com.br' } }, cfg, meta);
  assert.deepEqual([com.name, com.email, com.source, com.ids[0]], ['Yago Barbosa', 'yago.barbosa@besmart.com.br', 'especialista', 'email:yago.barbosa@besmart.com.br']);
  const sem = commercialOfCard({ entityTypeId: 1056, createdById: '7', fields: { ufCrm5_ESPEC: '' } }, cfg, meta);
  assert.deepEqual([sem.source, sem.ids], ['criador', ['7']]);
  // campo escolhido à mão e "não usar"
  assert.equal(specialistFieldFor({ specialistFields: { 1056: { field: 'ufCrm5_OBS' } } }, meta, 1056).field, 'ufCrm5_OBS');
  assert.equal(specialistFieldFor({ specialistFields: { 1056: { field: '' } } }, meta, 1056), null);
});

test('pós-venda excluído pelo nome, em qualquer grafia', () => {
  for (const n of ['Pós-venda', 'POS VENDA', 'Pós venda', 'pos-venda', 'Pós-Venda e Assessoria', 'Posvenda']) assert.equal(isExcludedName(n, ['pós-venda']), true, n);
  for (const n of ['Vendas', 'Pré-venda', 'Comercial PME', '']) assert.equal(isExcludedName(n, ['pós-venda']), false, n);
  const meta = { entities: { 1056: { name: 'be.smart Saúde' }, 1070: { name: 'Pós-venda e Assessoria' } },
    categories: { '1056:1': { name: 'Vendas' }, '1056:2': { name: 'POS VENDA' }, '1070:1': { name: 'Geral' } } };
  const cfg = { ...defaultConfig(), focusPage: null, monitored: [{ entityTypeId: 1056, categoryIds: [1, 2] }, { entityTypeId: 1070, categoryIds: [1] }] };
  assert.deepEqual(effectiveMonitored(cfg, meta), [{ entityTypeId: 1056, categoryIds: [1] }]);
  assert.deepEqual(effectiveMonitored({ ...cfg, excludeNames: [] }, meta).length, 2, 'sem termos, nada é excluído');
});

test('sem expediente: regras salvas em horário comercial passam a tempo corrido', () => {
  const c = mergeConfig({ slaRules: [{ id: 'a', mode: 'util' }], processRules: [{ id: 'b', mode: 'util' }], stagnationRules: [{ id: 'c', mode: 'util' }],
    noInteractionRules: [{ id: 'd', mode: 'util' }] });
  for (const k of ['slaRules', 'processRules', 'stagnationRules', 'noInteractionRules']) assert.equal(c[k][0].mode, 'corrido', k);
  assert.deepEqual(defaultConfig().excludeNames, ['pós-venda']);
});
