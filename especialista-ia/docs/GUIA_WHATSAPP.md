# Guia: número oficial do WhatsApp (Cloud API da Meta)

Integração **exclusiva** com a WhatsApp Business Cloud API oficial. Nada de bibliotecas que controlam o WhatsApp
Web ou engenharia reversa. O envio começa **desativado** e o sistema **nunca** envia templates pagos nem mensagens
proativas: só responde dentro da janela de atendimento de 24 h aberta pela mensagem do colaborador.

## Antes de começar

- Leia [CUSTOS_E_LIMITES.md](CUSTOS_E_LIMITES.md) e confira a tabela oficial de preços vigente da Meta.
- O número usado na Cloud API **não pode** estar ao mesmo tempo no aplicativo WhatsApp/WhatsApp Business do celular
  (a migração remove o número do app). Se outros sistemas usam o mesmo número, eles **também consomem a franquia**.
- Primeiro lançamento: **apenas conversas individuais** (grupos não são suportados).

## 1. Criar o app na Meta

1. Acesse <https://developers.facebook.com> → *Meus apps → Criar app* → tipo **Empresa** → produto **WhatsApp**.
2. Vincule (ou crie) o **Meta Business Portfolio** da corretora.
3. Em *WhatsApp → Configuração da API* você recebe um **número de teste** e pode cadastrar até 5 destinatários de
   teste. Anote o **Phone number ID**.

## 2. Token permanente (usuário do sistema)

*Configurações do negócio → Usuários do sistema → Adicionar* (função Administrador) → *Atribuir ativos*: o app e a conta
do WhatsApp → *Gerar token* com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
Guarde como `WHATSAPP_ACCESS_TOKEN`. **Nunca** coloque este token no painel, na extensão ou no repositório.

## 3. Segredos no Supabase

```bash
npx supabase secrets set \
  WHATSAPP_ACCESS_TOKEN="..." \
  WHATSAPP_PHONE_NUMBER_ID="..." \
  WHATSAPP_APP_SECRET="..."      `# App → Configurações → Básico → Chave secreta do app` \
  WHATSAPP_VERIFY_TOKEN="uma-frase-longa-e-aleatoria"
npx supabase functions deploy whatsapp-webhook whatsapp-send
```
`whatsapp-webhook` é publicado com `verify_jwt = false` (a Meta não envia JWT); a autenticidade de cada evento é
verificada pelo cabeçalho **X-Hub-Signature-256** (HMAC-SHA256 do corpo bruto com o App Secret).

## 4. Configurar o webhook

1. Na Meta: *WhatsApp → Configuração → Webhook → Editar*.
2. **Callback URL**: `https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook` (também exibida no painel em
   *Configurações → WhatsApp e custos*).
3. **Verify token**: o mesmo valor de `WHATSAPP_VERIFY_TOKEN` → *Verificar e salvar* (a função responde ao GET de verificação).
4. Em *Campos do webhook*, assine **messages** (mensagens e status de entrega).

## 5. Autorizar colaboradores

No painel, *Colaboradores → Editar*: informe o WhatsApp (ex.: `(11) 98765-4321`) e marque **Número aprovado**. Somente
números aprovados de contas ativas são atendidos. O sistema reconhece números com e sem o nono dígito (a Meta às vezes
entrega o `wa_id` sem ele). Mensagens de números não autorizados são registradas **sem o conteúdo** e não são respondidas.

## 6. Testar (modo teste)

1. *Configurações → WhatsApp e custos*: **Envio ativo**, modo **Teste**, teto mensal 900.
2. Cadastre seu número como destinatário de teste na Meta e aprove-o no painel.
3. Envie "oi" para o número de teste → você recebe o menu. Envie uma pergunta → a resposta chega com as fontes.
4. Envie "falar com responsável" → o pedido aparece em *Atendimento humano*, onde é possível responder pelo próprio painel.

## 7. Produção

Adicione e verifique o número comercial no Business Manager (nome de exibição aprovado), troque
`WHATSAPP_PHONE_NUMBER_ID` e o token se necessário, altere o modo para **Produção** e acompanhe o consumo no Dashboard.

## Comportamento do bot

| Situação | Resposta |
|---|---|
| "oi", "menu", "ajuda" | Menu de uso (no máximo 1 vez a cada 10 min) |
| Pergunta | Fila → worker → resposta com fontes (até 3.500 caracteres) |
| Falta informação indispensável | Pede o complemento; a próxima mensagem (em até 30 min) completa a pergunta |
| "falar com responsável" | Registra atendimento humano e confirma |
| Áudio, imagem, documento | Pede para enviar em texto |
| Worker offline | Aviso opcional (no máximo 1 por hora) e a pergunta fica na fila |
| Janela de 24 h expirada | Não envia (exigiria template pago); registra "janela expirada" |
| Teto mensal/diário atingido | Bloqueio preventivo, sem chamar a Meta; alerta no painel |
| Reentrega do mesmo evento | Ignorada (idempotência pelo `wamid`) |
| Falha temporária da Meta (429/5xx) | Até 3 tentativas (respeitando Retry-After); depois, reenvio automático a cada 5 min dentro da janela |

## Teste local do webhook (sem a Meta)

Os testes automatizados simulam a Graph API e assinam os eventos com o App Secret (`tests/db/whatsapp-e2e.test.ts`).
Com as funções rodando localmente (`npx supabase functions serve`), é possível enviar um evento assinado:
```bash
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WHATSAPP_APP_SECRET" | awk '{print $2}')
curl -X POST "http://127.0.0.1:54321/functions/v1/whatsapp-webhook" -H "x-hub-signature-256: sha256=$SIG" -d "$BODY"
```
