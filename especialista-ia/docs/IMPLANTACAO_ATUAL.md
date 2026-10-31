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
| Painel na Netlify: <https://especialista-ia-planos.netlify.app> | ✅ publicado (build na Netlify a partir do branch, com `_redirects`/`_headers`) |
| Schema `especialista` exposto na API (mantidos `public` e `graphql_public`) | ✅ feito via configuração do PostgREST no banco (verificado) |
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

### 1. Schema exposto na API — ✅ concluído
Feito em 31/10/2026 pela configuração do próprio PostgREST no banco, preservando os schemas do Erbe:
```sql
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, especialista';
notify pgrst, 'reload config';
```
Verificado: `especialista` responde (acesso anônimo negado, como esperado) e `public` (Erbe) continua respondendo.
**Atenção:** essa configuração no banco prevalece sobre a tela *Data API → Exposed schemas* do painel do Supabase.
Se no futuro o Erbe precisar expor outro schema, inclua-o nesta lista (ou adicione `especialista` na tela e remova a
configuração com `alter role authenticator reset pgrst.db_schemas; notify pgrst, 'reload config';`).

### 2. Painel — ✅ publicado
<https://especialista-ia-planos.netlify.app> — entre com gbastossaude@gmail.com e a senha que você já usa no Erbe.
O primeiro deploy foi enviado pela integração Netlify (build feito pela própria Netlify). Para atualizações automáticas a
cada push, vincule o repositório: *Project configuration → Build & deploy → Link repository* → `gbastossaude/assistente`,
**Base directory** `especialista-ia`. A função temporária `especialista-netlify-deploy` usada no primeiro envio foi
desativada (responde 410) e pode ser excluída em *Edge Functions*.

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
