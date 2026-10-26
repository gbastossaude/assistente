'use strict';
// Gera dist/assistente-pendencias-bitrix-v<versão>.zip somente com os arquivos da extensão.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const out = path.join(ROOT, 'dist', 'assistente-pendencias-bitrix-v' + version + '.zip');
fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(out)) fs.unlinkSync(out);
execFileSync('zip', ['-X', '-r', out, 'manifest.json', 'icons', 'src', 'LEIAME-INSTALACAO.txt', '-x', '*.DS_Store'], { cwd: ROOT, stdio: 'inherit' });
console.log('ZIP gerado:', path.relative(ROOT, out));
