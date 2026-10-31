# Roteiro de implantação

Tempo estimado: 2 a 3 horas (sem o WhatsApp). Siga na ordem.

## 1. Supabase (gratuito)

1. Crie um projeto em <https://supabase.com> (região São Paulo, se disponível). Guarde a senha do banco.
2. Em *Database → Extensions*, confirme que `vector`, `unaccent` e `pg_trgm` estão disponíveis (as migrations as habilitam).
3. Aplique as migrations — opção A (recomendada):
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_REF
   npx supabase db push
   ```
   Opção B: copie e execute **em ordem** cada arquivo de `supabase/migrations/` no *SQL Editor*.
4. *Authentication → Providers → Email*: mantenha e-mail habilitado e **desative "Allow new users to sign up"** (as contas são criadas pelo administrador).
5. *Authentication → Users → Add user*: crie o seu usuário (marque *Auto Confirm User*). No SQL Editor rode `scripts/sql/primeiro-admin.sql` com o seu e-mail.
6. *Authentication → URL Configuration*: `Site URL` = endereço do painel na Netlify (para links de redefinição de senha).
7. Publique as Edge Functions:
   ```bash
   npx supabase functions deploy admin-users whatsapp-send whatsapp-webhook
   npx supabase secrets set ADMIN_ORIGINS=https://SEU-PAINEL.netlify.app
   ```
8. Opcional: *Database → Extensions → pg_cron* habilitado faz a retenção rodar sozinha às 06:17 UTC (o worker também executa a limpeza uma vez por dia).

## 2. Painel na Netlify (gratuito)

1. *Add new site → Import from Git* → este repositório.
2. **Base directory**: `especialista-ia` (o `netlify.toml` define build e publicação).
3. *Environment variables*: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Supabase → *Settings → API*, chave **anon/publishable**).
4. Deploy. Entre com o administrador criado no passo 1.5.

## 3. Worker local + Ollama

Siga [GUIA_OLLAMA_WINDOWS.md](GUIA_OLLAMA_WINDOWS.md). Resumo: no painel, *Colaboradores → Novo acesso* com papel
**Worker (máquina)** → copie a senha temporária → no computador, rode `scripts\windows\instalar-worker.ps1` e
preencha `apps\local-worker\.env` → `scripts\windows\registrar-inicio-automatico.ps1`. No Dashboard o worker deve
aparecer **online** com "Ollama OK".

## 4. Base de conhecimento

Cadastre operadoras/produtos que faltarem (*Configurações → Operadoras*), envie os documentos oficiais e revise as
extrações marcadas. Veja [MANUAL_BASE_CONHECIMENTO.md](MANUAL_BASE_CONHECIMENTO.md).

## 5. Extensão

Siga [GUIA_EXTENSAO.md](GUIA_EXTENSAO.md). Crie os acessos dos colaboradores no painel.

## 6. WhatsApp (opcional, por último)

Siga [GUIA_WHATSAPP.md](GUIA_WHATSAPP.md). Comece no **modo teste** com o número de testes da Meta, valide e só
depois ative o envio em produção — após conferir a tabela de preços vigente ([CUSTOS_E_LIMITES.md](CUSTOS_E_LIMITES.md)).

## 7. Validação final (checklist)

- [ ] Login de administrador, editor e colaborador; colaborador não vê menus administrativos.
- [ ] Documento de teste indexado (status *Ativo*, trechos > 0) e respondido pela extensão com fonte e página.
- [ ] Pergunta sem documento devolve a mensagem padrão.
- [ ] Documento vencido não é usado (ajuste a validade de um documento de teste para o passado).
- [ ] Worker desligado → extensão mostra "IA offline" e a pergunta fica na fila; ao religar, é respondida.
- [ ] (WhatsApp) número aprovado recebe resposta; número não aprovado é ignorado; uso aparece no Dashboard.

## O que falta configurar

| Item | Onde | Situação no código |
|---|---|---|
| Projeto Supabase + migrations | Supabase | Pronto; migrations testadas em PostgreSQL 16 + pgvector |
| Painel publicado | Netlify | Pronto (`netlify.toml`); requer as 2 variáveis públicas |
| Computador com Ollama e modelos baixados | Escritório | Pronto (scripts + diagnóstico); modelos reais **não** puderam ser baixados no ambiente de desenvolvimento |
| Conta de máquina do worker | Painel → Colaboradores | Pronto |
| Extensão instalada nos navegadores | Chrome (modo desenvolvedor ou loja) | Pronto (build + zip) |
| App na Meta, número oficial, token, App Secret, webhook | developers.facebook.com | Implementado e testado com simulação fiel da API; **não testado com a Meta real** |
| E-mail (convites/redefinição) | Supabase → Auth → SMTP | Opcional: sem SMTP próprio, use "senha temporária" no painel |
