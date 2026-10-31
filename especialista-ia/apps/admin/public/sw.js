// Service worker mínimo: torna o painel instalável como aplicativo.
// Não guarda respostas nem dados em cache (tudo vem sempre do servidor); sem internet, mostra um aviso.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(
    fetch(e.request).catch(() =>
      new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title>' +
          '<body style="font-family:system-ui;padding:2rem;color:#0b1f3a"><h1>Sem conexão</h1><p>Verifique a internet e tente novamente.</p></body>',
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    ),
  );
});
