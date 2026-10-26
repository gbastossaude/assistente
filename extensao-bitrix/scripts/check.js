'use strict';
// Verificações estáticas: sintaxe, manifesto, arquivos referenciados e ausência de chamadas de rede.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const errors = [];

if (manifest.manifest_version !== 3) errors.push('manifest_version deve ser 3');
const refs = [manifest.background.service_worker, ...manifest.content_scripts.flatMap((c) => c.js), ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
for (const r of refs) if (!fs.existsSync(path.join(ROOT, r))) errors.push('arquivo ausente: ' + r);
const perms = [...(manifest.permissions || [])].sort().join(',');
if (perms !== 'scripting,storage') errors.push('permissões inesperadas: ' + perms);
if (JSON.stringify(manifest.host_permissions) !== '["https://crm.hub-bnk.com/*"]') errors.push('host_permissions fora do domínio autorizado');
for (const cs of manifest.content_scripts) if (JSON.stringify(cs.matches) !== '["https://crm.hub-bnk.com/*"]') errors.push('content_scripts.matches fora do domínio autorizado');

for (const file of refs.filter((r) => r.endsWith('.js'))) {
  const full = path.join(ROOT, file);
  try { execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' }); } catch (e) { errors.push('sintaxe: ' + file + '\n' + e.stderr); }
  const code = fs.readFileSync(full, 'utf8');
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts\(/.test(code)) errors.push('chamada de rede em ' + file);
  if (/document\.cookie|localStorage|sessionStorage|\.innerHTML\s*=|insertAdjacentHTML|eval\(|new Function\(/.test(code)) errors.push('API proibida em ' + file);
}

if (errors.length) {
  console.error('Falhas:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log('OK: manifesto válido, ' + refs.length + ' arquivos referenciados, sem chamadas de rede, cookies ou innerHTML.');
