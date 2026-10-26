// Servidor HTTP local que imita um portal Bitrix24 com os DADOS FICTÍCIOS da demonstração.
// Uso: node tools/mock-server.mjs [porta] [--wrong-auth-type]
//  - Webhook:  http://127.0.0.1:PORTA/rest/1/teste123/
//  - Login:    http://127.0.0.1:PORTA/login  (cria a sessão e abre /stream/)
//  - Páginas:  /stream/, /page/besmart/seguros/ … (com BX.bitrix_sessid(), como no Bitrix24)
//  - REST pela sessão: POST /rest/<método>.json com cookie de sessão + sessid (como BX.rest.callMethod)
// --wrong-auth-type simula um portal que recusa consultas pela sessão (WRONG_AUTH_TYPE).
import http from 'node:http';
import { createMockPortal, parseQuery } from '../src/demo/mock-portal.js';

const port = Number(process.argv[2] || 8787);
const wrongAuthType = process.argv.includes('--wrong-auth-type');
const mock = createMockPortal({ now: Date.now() });
const log = [];
const SESSID = 'sess123';

const page = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:14px system-ui;margin:0;background:#eef2f4} header{background:#2fc6f6;color:#fff;padding:14px 20px;font-weight:600}
main{padding:20px} .card{background:#fff;border-radius:8px;padding:16px;max-width:720px}</style></head><body>${body}</body></html>`;

function loggedIn(req) { return /(?:^|;\s*)BX_SESSION=ok/.test(req.headers.cookie || ''); }

http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/__log') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ log, writeAttempts: mock.state.writeAttempts })); }
  if (url.pathname === '/login') { res.writeHead(302, { 'Set-Cookie': 'BX_SESSION=ok; Path=/; HttpOnly; SameSite=Lax', Location: '/stream/' }); return res.end(); }
  if (url.pathname === '/logout') { res.writeHead(302, { 'Set-Cookie': 'BX_SESSION=; Path=/; Max-Age=0', Location: '/stream/' }); return res.end(); }

  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const json = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    // REST por webhook
    let m = url.pathname.match(/^\/rest\/(\d+)\/([A-Za-z0-9]+)\/([^/]+?)(?:\.json)?$/);
    if (m) {
      if (m[2] !== 'teste123') return json(401, { error: 'INVALID_CREDENTIALS', error_description: 'Invalid request credentials' });
      log.push({ at: Date.now(), method: m[3], auth: 'webhook' });
      const r = mock.handle(m[3], body ? JSON.parse(body) : {});
      return json(r.status, r.body);
    }
    // REST pela sessão do usuário logado
    m = url.pathname.match(/^\/rest\/([^/]+?)\.json$/);
    if (m) {
      const params = parseQuery(body);
      if (!loggedIn(req)) return json(401, { error: 'NO_AUTH_FOUND', error_description: 'Wrong authorization data' });
      if (params.sessid !== SESSID) return json(401, { error: 'NO_AUTH_FOUND', error_description: 'Wrong session id' });
      if (wrongAuthType) return json(401, { error: 'WRONG_AUTH_TYPE', error_description: 'Access for this method not allowed by session authorization.' });
      delete params.sessid;
      log.push({ at: Date.now(), method: m[1], auth: 'session' });
      const r = mock.handle(m[1], params);
      return json(r.status, r.body);
    }
    // Páginas do portal
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (!loggedIn(req)) return res.end(page('Autorização', '<header>Bitrix24 (simulado)</header><main><div class="card"><h2>Entrar</h2><a href="/login">Entrar com usuário de teste</a></div></main>'));
    // Página de espaço digital: o "kanban" carrega depois (como no Bitrix) com links para os cards do processo 1036.
    const ws = url.pathname.match(/^\/page\/([^/]+)\/([^/]+)\/?$/);
    const kanban = ws ? `<div id="kanban">carregando…</div><script>setTimeout(function () { document.getElementById('kanban').innerHTML = ${JSON.stringify(
      mock.data.items[1036].map(i => `<p><a href="${ws[2] === 'generico' ? '/crm' : `/page/${ws[1]}/${ws[2]}`}/type/1036/details/${i.id}/">${i.title}</a></p>`).join(''))}; }, 1200);</script>` : '';
    res.end(page('Bitrix24 (simulado)', `<header>Bitrix24 simulado — dados fictícios</header>
      <main><div class="card"><h2>${url.pathname}</h2><p>Página de teste do portal. <a href="/logout">Sair</a></p>${kanban}</div></main>
      <script>window.BX = { bitrix_sessid: function () { return '${SESSID}'; }, message: function (k) { return k === 'USER_ID' ? '11' : ''; } };</script>`));
  });
}).listen(port, '127.0.0.1', () => console.log(`Bitrix24 simulado em http://127.0.0.1:${port}/ (webhook /rest/1/teste123/, login /login)${wrongAuthType ? ' [WRONG_AUTH_TYPE]' : ''}`));
