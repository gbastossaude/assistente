# Manual: cadastrar documentos e atualizar regras

O especialista **só responde o que estiver nos documentos ativos e vigentes** e nas FAQs publicadas. A qualidade das
respostas depende diretamente da qualidade e da classificação desses materiais.

## O que cadastrar

- Manuais e guias comerciais das operadoras, comunicados, tabelas de elegibilidade, regras de carência e portabilidade,
  documentação para contratação, regras de movimentação, comissionamento, reajuste etc.
- Normas da ANS e legislação (operadora em branco = "Geral", natureza **Determinação regulatória**).
- Procedimentos internos da corretora (natureza **Procedimento interno**).
- **Não** cadastre documentos com dados pessoais de clientes (propostas preenchidas, laudos, carteirinhas).

Formatos: PDF (com texto), DOCX, XLSX, CSV, TXT/MD — até 50 MB.

## Cadastrar um documento (Documentos → Novo documento)

| Campo | Como preencher |
|---|---|
| Título | Nome claro, com operadora e período. Ex.: "Manual PME Amil — 2026 rev. 3" |
| Operadora / Produto | Deixe produto em branco se vale para todos os produtos |
| Administradora | Para planos por adesão, informe a administradora de benefícios envolvida |
| Categoria | Tipo do documento (elegibilidade, carências, rede, documentação...) |
| Natureza da regra | **Regra de contratação**, **Procedimento interno**, **Condição negociada (exceção)** ou **Regulatória**. Condições negociadas nunca são apresentadas como regra geral |
| Tipos de contratação | PME, empresarial, MEI, adesão, individual, familiar, sênior |
| Abrangência | **Nacional**, **Estados/cidades específicos** (regras de outra UF são excluídas da resposta) ou **Não informada** (gera aviso) |
| Vidas mín./máx. | Faixa de vidas a que o documento se aplica, se houver |
| Publicação / Início / Válido até | **Válido até** é eliminatório: depois dessa data o documento deixa de ser usado como regra atual |
| Prioridade | Desempate manual (-10 a 10) entre fontes equivalentes |

Ao salvar, o painel calcula o hash do arquivo (impede enviar o mesmo arquivo duas vezes) e avisa se já existem
documentos ativos da mesma operadora e categoria — nesse caso, se for uma atualização, use **Nova versão**.

## Indexação e revisão

O worker local extrai o texto, avalia a qualidade, divide em trechos e gera os vetores. Status:
- **Indexando** → aguarde (minutos, conforme o tamanho e o computador).
- **Ativo** → já é usado nas respostas.
- **Aguardando revisão** → texto com problema (PDF digitalizado, pouco texto, caracteres corrompidos ou OCR). Abra o
  documento, clique **Ver texto extraído**, compare com o original e então **Aprovar extração**, **Tentar OCR** ou
  envie um arquivo melhor. Nada em revisão entra nas respostas.
- **Erro** → veja a mensagem (formato inválido, arquivo corrompido, integridade). Corrija e reenvie.

## Atualizar uma regra (nova versão)

Abra o documento → **Nova versão** → arquivo + rótulo + "o que mudou" → confirme que é mais recente. A versão anterior
continua valendo até a nova ser indexada; depois fica como **Substituída** (histórico preservado e auditado). Revise
também as datas de vigência na classificação.

## Desativar

**Desativar** exige motivo. O documento sai das respostas imediatamente, mas permanece no histórico, nas fontes de
respostas antigas e na auditoria. Pode ser reativado.

## FAQ oficial (Regras e FAQ → FAQ oficial)

Respostas aprovadas, com **fonte obrigatória para publicar**. Têm prioridade e, quando a pergunta é muito semelhante,
respondem na hora (sem gerar texto). Use para dúvidas frequentes e para preencher lacunas apontadas em
*Perguntas → Sugestões de FAQ* e *Feedback negativo*.

## Informações obrigatórias

Em *Regras e FAQ → Informações obrigatórias*, defina o que o especialista deve perguntar antes de responder — por
exemplo, "rede credenciada exige operadora e UF". Os padrões instalados são apenas configuração e podem ser editados.

## Conflitos

Quando duas regras vigentes divergem, o especialista **não escolhe**: mostra as duas, recomenda validar e registra em
*Regras e FAQ → Conflitos*. Resolva corrigindo a base (desativar a regra antiga, ajustar vigência/abrangência) e
registre a decisão. Cadastros sobrepostos também geram alerta preventivo.

## Rotina recomendada

- Semanal: Dashboard → documentos vencidos/vencendo, conflitos, feedback negativo, perguntas sem fonte.
- A cada comunicado de operadora: nova versão ou novo documento no mesmo dia.
- Mensal: revisar FAQs publicadas e suas validades.
