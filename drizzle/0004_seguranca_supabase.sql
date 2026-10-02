-- Segurança no Supabase: a Data API (PostgREST) expõe tabelas às roles "anon"/"authenticated", cuja chave
-- pública costuma estar no front-end de outros sistemas do mesmo projeto. Este sistema acessa o banco só pelo
-- servidor, com o usuário dono das tabelas (que ignora RLS). Portanto:
--   1) RLS habilitado SEM políticas em todas as tabelas do sistema → a Data API não lê nem grava nada;
--   2) views passam a respeitar as permissões de quem consulta (security_invoker, PostgreSQL 15+);
--   3) privilégios de anon/authenticated revogados (quando essas roles existem, isto é, no Supabase).
-- Atua apenas nas tabelas DESTE sistema, no schema corrente (public ou DATABASE_SCHEMA): tabelas de outros
-- sistemas no mesmo banco não são alteradas.
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'users','settings','companies','company_cnpjs','contacts','insurers','current_contracts','current_contract_plans',
    'quotations','quotation_cnpjs','quotation_status_history','checklist_templates','quotation_checklist_items',
    'quotation_documents','life_imports','lives','special_cases','special_case_entries','quotation_insurers',
    'insurer_followups','proposals','proposal_plans','interactions','tasks','calendar_events','renewals','pendencies',
    'notifications','activity_logs','message_templates','automation_rules','assistant_messages','assistant_actions',
    'playbook_entries','opportunities','opportunity_stage_history','meetings','campaigns','library_items'];
  views text[] := ARRAY['home_care_cases','injunction_cases','dismissed_retired_cases'];
  has_api_roles boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass(format('%I.%I', current_schema(), t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', current_schema(), t);
      IF has_api_roles THEN
        EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon, authenticated', current_schema(), t);
      END IF;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY views LOOP
    IF to_regclass(format('%I.%I', current_schema(), t)) IS NOT NULL THEN
      IF current_setting('server_version_num')::int >= 150000 THEN
        EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', current_schema(), t);
      END IF;
      IF has_api_roles THEN
        EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon, authenticated', current_schema(), t);
      END IF;
    END IF;
  END LOOP;
  -- Schema próprio (DATABASE_SCHEMA): a Data API não enxerga o schema.
  IF has_api_roles AND current_schema() <> 'public' THEN
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM anon, authenticated', current_schema());
  END IF;
END $$;
