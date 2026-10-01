# Deploy, operação, backup e segurança

## Visão geral da instalação recomendada

| Peça | Serviço | Função |
|---|---|---|
| Banco de dados + arquivos | **Supabase** | PostgreSQL e bucket privado de documentos |
| Aplicação | **Render** (Web Service Node) | Roda o sistema; configuração pronta em `render.yaml` |
| Rotina de alertas | **GitHub Actions** | Chama a rotina de automações a cada hora (`.github/workflows/rotina-automacoes.yml`) |

> Por que não Vercel? As funções do Vercel limitam o corpo das requisições a ~4,5 MB, o que impediria o upload
> de bases de vidas e sinistralidades maiores. O Render roda um servidor Node normal (limite do sistema: 25 MB).

> **Região e LGPD.** Coloque banco e aplicação na **mesma região** (cada tela faz várias consultas; regiões
> distantes deixam o sistema lento). Padrão deste guia: Supabase *East US (North Virginia)* + Render *Virginia*.
> Isso armazena dados fora do Brasil (transferência internacional — avalie com o encarregado/DPO). Para manter
> os dados no Brasil: Supabase *South America (São Paulo)* + hospedagem com região em São Paulo (ex.: Fly.io `gru`).

## Passo 1 — Supabase (banco e arquivos)

1. Crie uma conta em https://supabase.com e clique em **New project**.
   - Nome: `besmart-health-cockpit` · defina uma **senha do banco** forte e guarde-a · Região: *East US (North Virginia)*.
2. Quando o projeto terminar de criar, clique em **Connect** (topo da página) → aba **Connection String** →
   escolha **Session pooler** → copie a URL (formato
   `postgresql://postgres.<id>:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`) e
   substitua `[YOUR-PASSWORD]` pela senha do banco. Essa é a sua `DATABASE_URL`.
   *Não acrescente `?sslmode=…`* — o sistema já usa SSL com o Supabase.
3. Menu **Storage** → **New bucket** → nome `documentos` → deixe **Public bucket desligado** (privado) → criar.
4. Menu **Project Settings → API** (ou *API Keys*): copie a **Project URL** (`SUPABASE_URL`) e a chave
   **service_role** / *secret* (`SUPABASE_SERVICE_ROLE_KEY`). Essa chave dá acesso total: nunca a compartilhe nem
   a coloque no código.
5. (Opcional, recomendado) **Project Settings → Database → SSL Configuration → Download certificate**: o conteúdo
   do arquivo vai em `DATABASE_CA_CERT` para o sistema também verificar o certificado do servidor.

## Passo 2 — Código no GitHub

O Render publica a partir do GitHub. Use o branch principal (`main`) — faça o merge do pull request deste
trabalho — ou, temporariamente, selecione o branch `claude/gerar-esse-sistema-w8z8aw` no Render.

## Passo 3 — Render (aplicação)

1. Crie uma conta em https://render.com (entre com o GitHub) e autorize o acesso ao repositório `assistente`.
2. **New → Blueprint** → selecione o repositório. O Render lê o `render.yaml` e mostra o serviço
   `besmart-health-cockpit` pedindo as variáveis abaixo:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | URL do Session pooler (Passo 1.2) |
   | `DATABASE_CA_CERT` | conteúdo do certificado (Passo 1.5) — ou deixe vazio |
   | `SUPABASE_URL` | Project URL (Passo 1.4) |
   | `SUPABASE_SERVICE_ROLE_KEY` | chave service_role (Passo 1.4) |
   | `ADMIN_EMAIL` | e-mail do primeiro administrador |
   | `ADMIN_PASSWORD` | senha do administrador — **mínimo 10 caracteres** |
   | `ADMIN_NAME` | seu nome |
   | `ANTHROPIC_API_KEY` | opcional (assistente com Claude); vazio = modo local |

   `AUTH_SECRET` e `CRON_SECRET` são gerados automaticamente pelo Render.
3. Clique em **Apply**. O primeiro deploy leva alguns minutos: instala, compila, cria as tabelas, carrega a
   configuração base (checklists NEW/RENEW, templates, automações, operadoras) e cria o administrador.
4. Quando o status ficar **Live**, abra a URL `https://besmart-health-cockpit-xxxx.onrender.com` e entre com o
   e-mail e a senha do administrador.
5. Depois do primeiro acesso:
   - troque a senha pelo menu do usuário → **Alterar senha**;
   - no Render, **Environment** → apague `ADMIN_PASSWORD` (ela só é usada na criação do primeiro usuário);
   - em **Configurações → Usuários**, crie os demais usuários com o papel adequado.

**Plano gratuito do Render:** o serviço “hiberna” após ~15 min sem acesso e leva cerca de 1 minuto para acordar.
Para uso diário, mude o plano para *Starter* (Settings → Instance Type). O Supabase gratuito pausa projetos
sem atividade por 7 dias; a rotina horária do Passo 4 mantém o banco ativo.

## Passo 4 — Rotina horária de alertas (GitHub Actions)

1. No Render, copie o valor de `CRON_SECRET` (Environment → mostrar valor).
2. No GitHub: repositório → **Settings → Secrets and variables → Actions → New repository secret**:
   - `APP_URL` = URL do sistema no Render (sem barra no final);
   - `CRON_SECRET` = valor copiado.
3. Aba **Actions** → *Rotina de automações* → **Run workflow** para testar (deve terminar em verde e mostrar um
   JSON com `quotations`, `notifications`…). Depois disso ela roda sozinha a cada hora.
   (Agendamentos do GitHub só rodam a partir do branch padrão — por isso o merge no Passo 2.)

## Passo 5 — Conferência

> **Instalação já existente?** A cada atualização rode `npm run db:migrate && npm run db:bootstrap` (no Render isso já
> acontece a cada inicialização). O bootstrap só **acrescenta** o que falta — conteúdo do Playbook, novos itens de checklist, modelos
> de mensagem e regras de automação — sem sobrescrever o que foi editado. Cotações abertas recebem os novos itens de
> checklist pelo botão "Reaplicar modelo" na aba Checklist.

- `https://SEU-ENDERECO/api/health` responde `{"ok":true}`.
- Em **Configurações → Sobre / integrações** o armazenamento aparece como `supabase`.
- Envie um PDF em uma cotação e confira o arquivo em Supabase → Storage → `documentos`.
- Importe uma base de vidas (pode usar `templates/BASE_SINTETICA_EXEMPLO.xlsm`) e veja o resumo.

### Instalação alternativa (servidor próprio / outro provedor)

```bash
npm ci --include=dev
npm run build
npm run db:migrate && ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:bootstrap
npm start   # porta 3000 (variável PORT para alterar); sirva atrás de HTTPS
```

Com `STORAGE_DRIVER=local`, aponte `STORAGE_LOCAL_DIR` para um volume persistente fora de `public/` (arquivos
gravados com permissão 600). Health check: `GET /api/health`. Rotina: `POST /api/cron/sweep` com
`Authorization: Bearer $CRON_SECRET` (ex.: cron do servidor a cada hora).

**Nunca** rode `npm run db:seed-dev` em produção (o script se recusa com `NODE_ENV=production`).

## 6. Backup e restauração

- **Banco**: habilite backups diários + PITR no provedor. Backup lógico adicional:
  ```bash
  pg_dump --format=custom --no-owner "$DATABASE_URL" > backup-$(date +%F).dump
  pg_restore --clean --no-owner -d "$DATABASE_URL_RESTORE" backup-AAAA-MM-DD.dump
  ```
  Retenção sugerida: 30 diários + 12 mensais, criptografados e fora da conta de produção.
- **Documentos**: o banco guarda apenas metadados e `storage_key`. Faça backup do bucket/pasta junto com o
  banco (mesma janela). Supabase: replicação/backup do bucket ou `rclone` periódico para storage frio
  criptografado. Local: snapshot do volume.
- **Teste de restauração** trimestral em ambiente isolado (restaurar dump + arquivos, rodar `npm run db:migrate`
  e abrir uma cotação com documentos).

## 7. Segurança e LGPD — o que está implementado

| Controle | Implementação |
|---|---|
| Autenticação obrigatória | Middleware bloqueia todas as rotas (exceto login, health e cron com segredo); sessão JWT HS256 em cookie `httpOnly`, `SameSite=Lax`, `Secure`; usuário desativado perde acesso na próxima requisição |
| Senhas | bcrypt (custo 12), mínimo 10 caracteres, limite de tentativas por e-mail, tempo constante para e-mail inexistente |
| RBAC | `src/lib/auth/permissions.ts` — permissões granulares por papel; verificado em toda Server Action e rota de API |
| Dados sensíveis | Documentos de saúde marcados `sensitive`; CID e relatórios ocultos para Comercial/Somente leitura; não exibidos em dashboards; download sensível sempre auditado (inclusive tentativa negada) |
| Logs | `activity_logs` para criação, edição, exclusão lógica, status, upload/download, importação, prazo, checklist, ação em lote e override; campos clínicos são redigidos; logs técnicos não incluem dados pessoais |
| Uploads | Lista de extensões, verificação de assinatura (magic bytes), limite de tamanho, nome sanitizado, nunca sobrescreve (`wx`), chave aleatória |
| Downloads | Somente via rota autenticada; `Content-Disposition`, `nosniff`, CSP sandbox; URLs assinadas de 60 s no Supabase |
| Injeção/XSS/CSRF | ORM parametrizado; React escapa saídas (sem `dangerouslySetInnerHTML`); CSP restritiva; Server Actions com checagem de origem do Next.js + checagem de `Origin` nas rotas `POST /api/*`; `SameSite=Lax` |
| Cabeçalhos | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS (prod) |
| Retenção | Configurável em Configurações → Parâmetros: expurgo de arquivos excluídos, histórico do assistente e notificações lidas (executado pela rotina diária e auditado) |
| Soft delete | Registros comerciais com `deleted_at`, restauráveis (empresas) |

Recomendações operacionais: restringir acesso ao banco por IP/VPC, rotacionar `AUTH_SECRET`/`CRON_SECRET`
anualmente (rotacionar `AUTH_SECRET` encerra as sessões), revisar a auditoria mensalmente (filtro “sensíveis”),
registrar o tratamento no RoPA da BeSmart (bases legais: execução de contrato e tutela da saúde/obrigação
regulatória conforme a operação).

## 8. Integração futura com Google Calendar

O modelo já reserva `calendar_events.external_provider` / `external_id`. Passos previstos: OAuth 2.0
(escopo `calendar.events`) por usuário, tokens criptografados em tabela própria, sincronização unidirecional
BeSmart → Google ao salvar/excluir compromissos e importação opcional. A agenda funciona integralmente sem isso.
