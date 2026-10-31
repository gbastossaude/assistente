# Implantação realizada (31/10/2026)

O Especialista IA foi instalado no projeto Supabase **Erbe** (`yhzdwghgnobhmfitdzfb`, região São Paulo), que já hospeda
outros sistemas. A conta já tinha atingido o limite de 2 projetos gratuitos; por decisão do responsável, o sistema foi
isolado no mesmo projeto:

| Item | Situação |
|---|---|
| Schema `especialista` (24 tabelas com RLS, 62 funções, busca híbrida, fila, WhatsApp, auditoria) | ✅ aplicado (migrations `especialista_0100` … `especialista_1000`) |
| Extensões `vector`, `unaccent`, `pg_trgm` (schema `extensions`) | ✅ instaladas |
| Bucket privado `especialista-conhecimento` + políticas | ✅ |
| Realtime (perguntas, respostas, fila, worker) | ✅ |
| Retenção diária (pg_cron `especialista-retencao-diaria`, 06:17 UTC) | ✅ |
| Primeiro administrador: gbastossaude@gmail.com (conta existente do Erbe, senha inalterada) | ✅ |
| Edge Function `especialista-admin-users` | ✅ publicada |
| Edge Function `especialista-whatsapp-send` | ✅ publicada (inerte sem credenciais da Meta) |
| Edge Function `especialista-whatsapp-webhook` | ⏳ publicar quando houver credenciais da Meta |
| Projeto Netlify `especialista-ia-planos` + variáveis públicas | ✅ criado; ⏳ falta o primeiro deploy |
| **Expor o schema `especialista` na API** | ⏳ **obrigatório — passo manual** |
| Worker local + Ollama | ⏳ instalar no computador do escritório |
| Extensão Chrome | ⏳ instalar nos navegadores |

## Convivência com os sistemas existentes

- Nenhuma tabela, função ou política do Erbe/BeSmart foi alterada.
- Gatilhos próprios em `auth.users` (`especialista_on_auth_user_created/updated`) só agem em contas marcadas com
  `app_metadata.especialista_role` e absorvem qualquer erro — nunca impedem o cadastro de contas do Erbe.
- O Auth é compartilhado: uma pessoa que já usa o Erbe entra no Especialista IA com a mesma senha, depois que o
  administrador a **vincula** em *Colaboradores → Novo acesso* (o sistema detecta a conta existente e não troca a senha).
  Contas criadas pelo Especialista IA também recebem um registro "pendente" no Erbe (gatilho do próprio Erbe), sem acesso
  a dados de lá.
- Bloquear alguém no Especialista IA não bloqueia a conta no Erbe; redefinir senha pelo painel só vale para contas
  criadas pelo Especialista IA.
- O plano gratuito tem 500 MB de banco para **todos** os sistemas do projeto — acompanhe em *Database → Usage*.

## Passos restantes (na ordem)

### 1. Expor o schema na API (30 segundos)
Supabase → projeto **Erbe** → *Project Settings → Data API* (ou *API*) → **Exposed schemas** → adicione
`especialista` (mantenha os que já existem, como `public` e `graphql_public`) → **Save**.
Sem isso, painel, extensão e worker recebem o erro "The schema must be one of the following".

### 2. Publicar o painel (1 minuto)
Opção rápida: Netlify → projeto **especialista-ia-planos** → *Deploys* → arraste o arquivo
`deploy-out/painel-especialista-ia-netlify.zip` (descompactado) para a área "Drag and drop".
Opção contínua (recomendada): *Project configuration → Build & deploy → Link repository* → GitHub
`gbastossaude/assistente`, **Base directory** `especialista-ia`, branch de produção a escolhida (ex.: `main` após o merge).
As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` já estão cadastradas no projeto.
Endereço: <https://especialista-ia-planos.netlify.app> — entre com gbastossaude@gmail.com e a senha que você já usa no Erbe.

### 3. Permitir o link de redefinição de senha (opcional)
Supabase → *Authentication → URL Configuration → Redirect URLs* → adicione `https://especialista-ia-planos.netlify.app`.
Não altere o *Site URL* (ele é do Erbe).

### 4. Worker local
No painel: *Colaboradores → Novo acesso* → papel **Worker (máquina)** com um e-mail exclusivo (ex.: worker@…) → copie a
senha temporária. No computador do escritório, siga [GUIA_OLLAMA_WINDOWS.md](GUIA_OLLAMA_WINDOWS.md) usando o arquivo
`deploy-out/worker.env` (já com URL e chave pública) como `apps\local-worker\.env`, preenchendo `WORKER_EMAIL` e `WORKER_PASSWORD`.

### 5. Extensão
`deploy-out/especialista-ia-extensao-0.1.0.zip` (já aponta para o projeto) → descompacte → `chrome://extensions` →
modo do desenvolvedor → *Carregar sem compactação*. Veja [GUIA_EXTENSAO.md](GUIA_EXTENSAO.md).

### 6. WhatsApp (quando houver credenciais da Meta)
Cadastre os segredos (`WHATSAPP_*`) em *Edge Functions → Secrets* e publique o webhook:
```bash
npx supabase functions deploy especialista-whatsapp-webhook --no-verify-jwt --project-ref yhzdwghgnobhmfitdzfb
```
Callback URL: `https://yhzdwghgnobhmfitdzfb.supabase.co/functions/v1/especialista-whatsapp-webhook`. Guia: [GUIA_WHATSAPP.md](GUIA_WHATSAPP.md).
