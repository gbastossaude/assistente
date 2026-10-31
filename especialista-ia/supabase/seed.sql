-- DADOS FICTÍCIOS PARA DESENVOLVIMENTO LOCAL (supabase db reset). NÃO execute em produção.
-- Não contém regras comerciais reais: a operadora e a FAQ abaixo são inventadas e identificadas como tal.
insert into public.operators (name, slug, kind, aliases, notes)
values ('Operadora Demonstração (FICTÍCIA)', 'operadora-demonstracao', 'operadora', array['Operadora Demo'],
        'Cadastro fictício para testes locais. Remova antes de usar em produção.')
on conflict (slug) do nothing;

insert into public.knowledge_faq (question, answer, operator_id, topic, status, source_note)
select 'Qual o prazo de implantação da Operadora Demonstração?',
       '[DADO FICTÍCIO PARA TESTE] O prazo de implantação desta operadora de demonstração é de 5 dias úteis.',
       id, 'implantacao', 'rascunho', 'Dado fictício de teste — não usar'
  from public.operators where slug = 'operadora-demonstracao'
on conflict do nothing;
