-- Fixa o search_path das funções auxiliares (recomendação do Security Advisor do Supabase).
alter function especialista.redact_pii(text) set search_path = especialista;
alter function especialista.sanitize_question_context(jsonb) set search_path = especialista;
alter function especialista.or_tsquery(text) set search_path = especialista;
alter function especialista.set_updated_at() set search_path = especialista;
