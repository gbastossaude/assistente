-- Políticas RLS explícitas (complementa a 0004). O sistema acessa o banco só pelo servidor, com o usuário dono
-- das tabelas (que não passa pelo RLS). Para as roles da Data API do Supabase ("anon"/"authenticated") fica
-- registrada uma política RESTRITIVA que nega qualquer leitura/gravação — mesmo que um GRANT seja concedido por
-- engano no futuro, nenhuma linha é exposta. Idempotente; fora do Supabase (sem essas roles) não faz nada.
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
BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')) THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass(format('%I.%I', current_schema(), t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS sem_acesso_pela_api ON %I.%I', current_schema(), t);
      EXECUTE format(
        'CREATE POLICY sem_acesso_pela_api ON %I.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        current_schema(), t);
    END IF;
  END LOOP;
END $$;
