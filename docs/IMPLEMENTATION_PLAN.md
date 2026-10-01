# Plano de Implementação

## Arquitetura

- **Next.js 15 (App Router) + TypeScript + React 19**; UI com Tailwind CSS 4 e componentes no padrão shadcn/ui
  (Radix + CVA) em `src/components/ui`.
- **PostgreSQL** via **Drizzle ORM** (`pg`). Compatível com Supabase Postgres (basta apontar `DATABASE_URL`).
- **Autenticação própria** (bcrypt + JWT assinado em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção) e
  RBAC por permissão. Motivo: roda em qualquer ambiente (inclusive sem Supabase); a troca por Supabase Auth fica
  isolada em `src/lib/auth`.
- **Storage** com driver plugável: `local` (pasta privada fora de `public/`) e `supabase` (bucket privado com URL
  assinada de 60 s). Downloads sempre passam por rota autenticada que audita o acesso.
- **Camadas**: `lib/domain` (regras puras, testáveis) → `server/services` (persistência + automações) →
  `server/actions` (Server Actions com Zod + RBAC) → `app/` e `components/` (UI). Nenhuma regra de negócio em
  componente.
- **Validação**: Zod em `src/lib/validation` (compartilhado cliente/servidor), React Hook Form nos formulários.
- **Tabelas** TanStack Table; **gráficos** Recharts; **planilhas** ExcelJS (SheetJS não está disponível no
  registro npm em versão sem vulnerabilidades conhecidas — ExcelJS lê XLSX/XLSM e ignora macros).
- **Assistente**: ferramentas tipadas sobre os serviços; Claude (Anthropic API, tool use) quando
  `ANTHROPIC_API_KEY` existir, senão roteador determinístico em português.

## Árvore de pastas

```
.
├── docs/                         # especificações (este diretório)
├── drizzle/                      # migrations SQL versionadas
├── scripts/                      # migrate, bootstrap (produção), seed-dev, gerador de planilha sintética
├── templates/                    # coloque aqui "EXEMPLO BASE 1.xlsm"
├── tests/
│   ├── unit/                     # regras de negócio, importação, checklist, automações de prazo
│   ├── integration/              # serviços contra PostgreSQL real (TEST_DATABASE_URL)
│   └── helpers/
└── src/
    ├── app/
    │   ├── (auth)/login/         # tela de login
    │   ├── (app)/                # área autenticada com sidebar
    │   │   ├── page.tsx          # Início — Meu Dia
    │   │   ├── central/          # Minha Central
    │   │   ├── pendencias/
    │   │   ├── empresas/[id]/...
    │   │   ├── cotacoes/[id]/    # Central da Cotação (12 abas)
    │   │   ├── cotacoes/nova/    # Wizard +99
    │   │   ├── grandes-contas/
    │   │   ├── operadoras/
    │   │   ├── comparativos/
    │   │   ├── agenda/  tarefas/  documentos/  renovacoes/  relatorios/
    │   │   ├── assistente/
    │   │   ├── busca/
    │   │   └── configuracoes/    # usuários, checklists, automações, templates, parâmetros, auditoria
    │   └── api/                  # upload/download de documentos, importação de vidas, cron, exportações
    ├── components/
    │   ├── ui/                   # design system
    │   ├── layout/               # sidebar, header, busca global, atalhos
    │   └── <módulo>/             # componentes por módulo
    ├── lib/
    │   ├── domain/               # constantes, CNPJ, datas, idade/ANS, checklist, prontidão, pipeline, renovações, mensagens
    │   ├── lives-import/         # mapeamento, validação e resumo da base de vidas
    │   ├── validation/           # schemas Zod
    │   └── auth/                 # sessão (JWT) e permissões
    └── server/
        ├── db/                   # schema e cliente
        ├── services/             # regras com persistência por módulo
        ├── actions/              # Server Actions
        ├── automation/           # motor de automações e rotina diária
        ├── assistant/            # ferramentas e orquestração do assistente
        ├── storage/              # drivers de armazenamento
        └── lives-import/         # leitura de planilhas
```

## Fases, dependências e critérios de aceite

| Fase | Entregas | Depende de | Aceite |
|---|---|---|---|
| 1 Fundação | projeto, banco, migrations, auth, RBAC, layout, sidebar, design system, empresas, CNPJs, contatos, contratos atuais | — | login/logout; CRUD de empresa com múltiplos CNPJs, contatos e contratos; soft delete; auditoria |
| 2 Cotações | wizard 5 etapas, NEW/RENEW, checklist dinâmico, pipeline Kanban/tabela, Central da Cotação, histórico, bloqueio de "Pronta para mercado" | 1 | critérios 2, 3, 4, 10 |
| 3 Base de vidas | importador XLSX/XLSM, preview, mapeamento, validações, cálculos, resumo, gráficos | 2 | critérios 6, 7, 8 |
| 4 Documentos e situações especiais | upload, status, storage privado, download auditado, 9 situações especiais, atualização automática do checklist | 2 | critério 5; pendências de Home Care/liminar |
| 5 Operadoras e propostas | distribuição, status por operadora, follow-ups, propostas, comparativo, exportação Excel/impressão | 2 | critérios 11, 12 |
| 6 Produtividade | tarefas (recorrência, lembretes, próxima ação), agenda dia/semana/mês, pendências, renovações 30/60/90/120, notificações, automações, Meu Dia | 2–5 | critérios 9, 13, 14 |
| 7 Assistente | busca contextual, resumos, e-mail/WhatsApp, ações assistidas com confirmação, histórico | 2–6 | perguntas da seção 2/18 respondidas com dados reais |
| 8 Relatórios e acabamento | relatórios, auditoria, RBAC final, segurança, testes, documentação de deploy | todas | critério 15; lint, typecheck e testes verdes |

Ao final de cada fase: `npm run lint`, `npm run typecheck`, `npm test`.

## Débitos técnicos explícitos

Mantidos atualizados em `docs/REQUIREMENTS_MATRIX.md` (matriz requisito × implementação).
