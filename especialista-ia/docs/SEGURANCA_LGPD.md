# Segurança, privacidade e LGPD

O sistema trata **regras de produtos**, não dados clínicos de beneficiários. Privacidade desde a concepção:

## Minimização de dados

- Antes de sair do navegador (extensão/painel) e novamente no banco (`redact_pii`) e no webhook do WhatsApp, são
  removidos: CPF (com validação dos dígitos), CNPJ, telefones, e-mails, cartão SUS, RG, datas de nascimento, números
  longos (carteirinhas) e nomes após termos como "cliente", "beneficiário", "paciente".
- O texto armazenado é **sempre** a versão minimizada. Mensagens de números não autorizados não têm o conteúdo gravado.
- Perguntas com descrição de saúde de uma pessoa recebem lembrete para enviar apenas a situação geral.
- O modelo roda **localmente** (Ollama): nenhuma pergunta é enviada a provedores de IA, nem usada para treinar modelos.
  RAG consulta documentos; não há treinamento com dados dos colaboradores. O modo gratuito bloqueia provedores em nuvem.

## Controle de acesso

- Supabase Auth; **cadastro público desativado**; contas novas nascem inativas e sem privilégio, a menos que criadas
  pelo administrador (Edge Function `admin-users`, com service role apenas no servidor).
- **RLS em todas as tabelas** (testado): colaborador vê só o próprio histórico; não lê documentos, trechos, mensagens do
  WhatsApp, auditoria nem configurações privadas; não altera o próprio papel; anon não acessa nada.
- Funções sensíveis com `SECURITY DEFINER` e verificação de papel; funções do WhatsApp executáveis só pela service role.
- Conta de máquina do worker com privilégio mínimo; a service role nunca fica no computador (o worker recusa iniciar se ela estiver no `.env`).
- O último administrador ativo não pode ser removido; trocar o número de WhatsApp revoga a aprovação.
- Storage privado; downloads por URL assinada de 60 s; integridade conferida por SHA-256.

## Proteções de aplicação

- Validação de entrada (tamanho, formato, contexto saneado no servidor), limites por minuto/dia por usuário.
- Prompt injection: bloqueio de padrões explícitos, trechos de documentos tratados como dados delimitados, saída em
  JSON validada (citações e números conferidos contra as fontes).
- Webhook: assinatura HMAC-SHA256 do corpo bruto com comparação em tempo constante, limite de tamanho, validação de
  estrutura e do `phone_number_id`, idempotência pelo `wamid`.
- Painel com cabeçalhos de segurança (CSP, HSTS, X-Frame-Options); extensão com CSP restrita ao projeto Supabase e sem
  scripts de conteúdo. O pacote da extensão é verificado contra segredos antes de gerar o `.zip`.
- Transporte criptografado (HTTPS/WSS); o Ollama só aceita `127.0.0.1`.

## Logs, auditoria e retenção

- Logs do worker e das funções: somente identificadores, tempos, status e códigos de erro — nunca o conteúdo.
- Auditoria automática de alterações em perfis, catálogo, documentos, versões, FAQ, regras, conflitos, configurações e
  atendimentos, além de criação/bloqueio de contas e execuções de retenção.
- Retenção configurável (padrões): perguntas 180 dias, texto de mensagens do WhatsApp 30 dias, eventos do webhook 30 dias,
  tarefas 30 dias, auditoria 730 dias. Execução diária (pg_cron ou worker) e manual pelo painel.

## Responsabilidades da corretora

Registrar a finalidade no registro de operações de tratamento, informar os colaboradores sobre o uso (inclusive do
WhatsApp corporativo), definir o encarregado (DPO) e revisar periodicamente os acessos em *Colaboradores*.
