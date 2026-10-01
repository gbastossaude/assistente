# Especificação — Importação da Base de Vidas

Implementação: `src/lib/lives-import/*` (regras puras), `src/server/lives-import/parse-workbook.ts` (leitura),
`src/server/services/lives.ts` (persistência), UI em `src/components/lives/*`. Testes: `tests/unit/lives-import.test.ts`.

## Layout de referência

Arquivo `EXEMPLO BASE 1.xlsm`, aba **BASE SAÚDE**, 13 colunas:

| # | Coluna | Campo interno | Obrigatório |
|---|---|---|---|
| 1 | EMPRESA | `empresa` | não |
| 2 | CNPJ | `cnpj` | **sim** (formato e dígito verificador) |
| 3 | DATA DE NASCIMENTO | `data_nascimento` | sim, ou IDADE |
| 4 | IDADE | `idade` | calculada se vazia |
| 5 | FAIXA ETÁRIA | `faixa_etaria` | calculada se vazia (faixas ANS configuráveis) |
| 6 | TITULARIDADE | `titularidade` | **sim** — TITULAR / DEPENDENTE / AGREGADO |
| 7 | GRAU DE PARENTESCO | `grau_parentesco` | **sim** para dependente/agregado |
| 8 | SITUAÇÃO | `situacao` | não (valores conhecidos: ATIVO, AFASTADO, DEMITIDO, APOSENTADO, APOSENTADO POR INVALIDEZ, GESTANTE, HOME CARE, LIMINAR, AGREGADO, CRONICO, PRESTADOR) |
| 9 | CID | `cid` | não (dado sensível) |
| 10 | CIDADE | `cidade` | **sim** |
| 11 | UF | `uf` | **sim** (UF válida) |
| 12 | SEGURADORA ATUAL | `seguradora_atual` | **sim** |
| 13 | PLANO ATUAL | `plano_atual` | **sim** |
| + | SEXO | `sexo` | não — **recomendada** (Playbook PJ +99: "relação de vidas com sexo"). Aceita M/F, Masculino/Feminino, Homem/Mulher; valor desconhecido gera aviso. Se a coluna não for mapeada, o preview mostra um aviso. |

> O arquivo real `EXEMPLO BASE 1.xlsm` deve ser colocado em `templates/`. O repositório traz apenas um gerador de
> planilha sintética no mesmo layout (`npm run sample:base`) para testes e demonstração.

## Fluxo

1. **Upload** (drag-and-drop) de `.xlsx`/`.xlsm` até `UPLOAD_MAX_MB`. O original é gravado no storage privado
   como documento `base_vidas` somente na confirmação; durante o preview fica em área temporária. Nunca é
   sobrescrito.
2. **Leitura**: macros são ignoradas. Seleciona a aba `BASE SAÚDE` (comparação sem acento); se não existir,
   escolhe a aba cujo cabeçalho melhor casa com o layout. Localiza a linha de cabeçalho nas 15 primeiras linhas.
   Usuário pode trocar a aba.
3. **Mapeamento automático** por nome e sinônimos (ex.: "Município" → CIDADE, "Operadora" → SEGURADORA ATUAL).
   Usuário pode corrigir o mapeamento manualmente; a validação é refeita.
4. **Preview**: totais, primeiras linhas, lista completa de erros/avisos por linha e campo, resumo da população.
5. **Confirmação**: só então os registros são gravados (`life_imports` + `lives`). Opção de importar todas as
   linhas (registros com erro ficam marcados como incompletos) ou somente as válidas. A importação anterior da
   cotação é desativada (histórico preservado).
6. Pós-importação: resumo gravado, checklist (`base_vidas`) e pendências reavaliados, timeline e auditoria.

## Regras de validação

| Regra | Nível |
|---|---|
| Linha totalmente vazia | ignorada (contabilizada) |
| CNPJ vazio ou inválido (DV, numérico ou alfanumérico; zeros à esquerda recompostos) | erro |
| Data de nascimento inválida / no futuro / idade > 120 | erro |
| Sem data de nascimento e sem idade | erro |
| Sem data de nascimento, com idade | aviso |
| Idade informada ≠ calculada na data de referência | aviso (vale a calculada) |
| Faixa informada ≠ faixa da idade / não reconhecida | aviso (vale a calculada) |
| Titularidade vazia ou desconhecida | erro |
| Parentesco vazio para dependente/agregado | erro |
| Situação desconhecida | aviso |
| CID em formato não reconhecido | aviso |
| Cidade vazia; UF vazia ou inválida | erro |
| Seguradora atual ou plano atual vazio | erro |
| Linha idêntica a outra (todos os campos mapeados) | aviso de duplicidade |
| Coluna obrigatória não mapeada | bloqueia a confirmação até ser mapeada |

Data de referência para idade: data da importação (fuso America/Sao_Paulo).

## Resumo gerado

Inclui também a distribuição **por sexo** (Feminino / Masculino / não informado).

Total de vidas, titulares, dependentes, agregados, idade média, vidas por faixa etária (ordem das faixas ANS), por
plano, CNPJ, UF, cidade, operadora, situação; quantidade de situações especiais, de registros com CID e de
registros incompletos (com erro) e com aviso. Exibido em cards e gráficos (Recharts).

## Segurança

- CID visível apenas para papéis com `sensitive:read`; nunca exibido em dashboards gerais.
- Limite de 50.000 linhas por arquivo.
- Tipo validado por extensão **e** assinatura ZIP; nome de arquivo sanitizado.
