# Deploy, operação, backup e segurança

## 1. Pré-requisitos

- PostgreSQL 15+ (recomendado: Supabase ou Postgres gerenciado com backup automático e PITR).
- Hospedagem Node.js 20+ com processo persistente **ou** plataforma serverless compatível com Next.js
  (Vercel, Render, Railway, Fly.io, container próprio).
- Storage privado: Supabase Storage (recomendado em serverless) ou disco persistente (driver `local`).

## 2. Banco de dados (Supabase)

1. Crie o projeto. Em *Project Settings → Database*, copie a connection string (modo *Session* para migrations;
   *Transaction pooler* pode ser usado pela aplicação). Defina `DATABASE_URL` com `sslmode=require`.
2. `npm run db:migrate` e depois
   `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:bootstrap` (idempotente; rode a cada deploy sem efeitos colaterais).
3. **Nunca** rode `db:seed-dev` em produção (o script se recusa com `NODE_ENV=production`).

## 3. Storage de documentos

- **Supabase**: crie um bucket **privado** (ex.: `documentos`), defina `STORAGE_DRIVER=supabase`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (somente no servidor) e `SUPABASE_STORAGE_BUCKET`.
  Downloads geram URL assinada de 60 s após autorização e auditoria.
- **Local**: `STORAGE_DRIVER=local`, `STORAGE_LOCAL_DIR` apontando para volume persistente fora de `public/`,
  com permissão restrita ao usuário do processo (arquivos gravados com modo 600).

## 4. Aplicação

```bash
npm ci
npm run build
NODE_ENV=production npm start   # porta 3000 (PORT para alterar)
```

Variáveis obrigatórias em produção: `DATABASE_URL`, `AUTH_SECRET` (≥ 32 caracteres aleatórios —
`openssl rand -base64 48`), `CRON_SECRET`, storage. Opcional: `ANTHROPIC_API_KEY`.

Sirva **somente via HTTPS** (o cookie de sessão é `Secure` em produção e o HSTS é enviado). Health check:
`GET /api/health`.

## 5. Agendamento

Configure um cron (Vercel Cron, GitHub Actions, cron do servidor, Supabase pg_cron + http) chamando:

```bash
curl -X POST https://SEU_DOMINIO/api/cron/sweep -H "Authorization: Bearer $CRON_SECRET"
```

Frequência sugerida: a cada hora (lembretes de tarefas) ou, no mínimo, diária às 6h.

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
