# Guia: extensão do Google Chrome

A extensão abre um **painel lateral** ao lado de qualquer aba (por exemplo, o WhatsApp Web) para consultar o
especialista. Ela **não lê conversas, não coleta contatos e não envia mensagens** — não possui scripts de conteúdo e
pede apenas as permissões `sidePanel` e `storage`.

## Gerar a extensão

```bash
cd especialista-ia
# .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (públicos)
npm run build:extension                       # gera apps/chrome-extension/dist
npm -w @especialista/chrome-extension run package   # gera release/especialista-ia-extensao-<versão>.zip
```
Com a URL definida no build, a política de segurança da extensão só permite conexões com o seu projeto Supabase.
Sem a URL no build, a extensão pede o endereço e a chave **pública** na primeira abertura (e recusa chaves `service_role`).

## Instalar nos computadores da equipe

**Opção A — modo desenvolvedor (simples, até poucas máquinas):**
1. Copie a pasta `dist` (ou extraia o `.zip`) para uma pasta fixa, ex.: `C:\EspecialistaIA\extensao`.
2. Abra `chrome://extensions`, ative **Modo do desenvolvedor**, clique **Carregar sem compactação** e escolha a pasta.
3. Fixe o ícone (alfinete) na barra. Clique no ícone para abrir o painel lateral.

**Opção B — Chrome Web Store como item "não listado" ou "privado":** envie o `.zip` pelo
[Developer Dashboard](https://chrome.google.com/webstore/devconsole) (taxa única de registro de desenvolvedor da Google).
Atualizações chegam automaticamente.

**Opção C — Google Workspace:** publique como app privado do domínio e force a instalação via console de administração.

## Uso

1. Entre com e-mail e senha criados pelo administrador.
2. Escreva a pergunta; opcionalmente abra **Detalhes** para informar operadora, UF, modalidade e número de vidas.
3. A resposta mostra **fontes** (documento, operadora, página, vigência), avisos e botões **Copiar**, **Favoritar**,
   **Útil / Incorreta** e **Falar com responsável**.
4. Se o sistema pedir complemento, responda no campo que aparece abaixo da resposta.
5. **Histórico** e **Favoritos** ficam nas abas superiores.
6. Indicadores: **Conectado** (servidor) e **IA online** (worker + Ollama). Com a IA offline, a pergunta fica na fila
   e a resposta aparece no histórico quando o worker voltar.

## Atualizar

Gere o build novamente, substitua a pasta e clique em **Recarregar** em `chrome://extensions` (opção A), ou envie a nova
versão à loja (opção B). A versão vem de `apps/chrome-extension/package.json`.

## Personalização

- Ícones: substitua `apps/chrome-extension/public/icons/icon-{16,32,48,128}.png` (ou edite `scripts/make-icons.mjs`).
- Nome: `VITE_EXTENSION_NAME` no `.env` antes do build.
