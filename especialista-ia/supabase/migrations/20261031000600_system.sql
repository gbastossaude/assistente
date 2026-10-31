-- =====================================================================
-- Configurações, auditoria e estado do worker local
-- =====================================================================

create table public.system_settings (
  key text primary key check (key ~ '^[a-z_]+$'),
  value jsonb not null,
  description text,
  -- Somente chaves públicas (ex.: identidade visual) são legíveis por colaboradores.
  is_public boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Segredos (tokens da Meta etc.) NUNCA ficam aqui: são variáveis secretas das Edge Functions.
insert into public.system_settings (key, value, description, is_public) values
  ('ai', '{
     "mode": "gratuito",
     "provider": "ollama",
     "chat_model": "qwen3:4b",
     "embedding_model": "bge-m3",
     "embedding_dimensions": 1024,
     "temperature": 0.1,
     "num_ctx": 8192,
     "max_context_chunks": 6,
     "retrieval_candidates": 20,
     "min_vector_similarity": 0.45,
     "faq_direct_threshold": 0.9,
     "request_timeout_ms": 120000,
     "near_expiry_days": 30
   }', 'Modelos e parâmetros de IA. No modo gratuito somente provedores locais (Ollama) são permitidos.', false),
  ('source_priority', '{
     "operator_match": 0.30,
     "product_match": 0.20,
     "region_match": 0.15,
     "contract_type_match": 0.10,
     "lives_match": 0.10,
     "recency": 0.10,
     "document_priority": 0.05,
     "official_faq": 0.25,
     "negotiated_penalty": 0.25,
     "region_mismatch_penalty": 1.0
   }', 'Pesos da priorização de fontes (vigência, operadora, produto, região, modalidade, vidas, atualização).', false),
  ('whatsapp', '{
     "enabled": false,
     "mode": "teste",
     "monthly_cap": 900,
     "daily_cap": 80,
     "alert_thresholds": [0.5, 0.8, 0.95],
     "offline_ack": true,
     "reply_unauthorized": false,
     "max_answer_chars": 3500,
     "clarification_minutes": 30,
     "graph_api_version": "v23.0"
   }', 'Bot oficial do WhatsApp: teto de mensagens de serviço por mês (conservador, abaixo da franquia gratuita).', false),
  ('security', '{
     "rate_limit_per_minute": 6,
     "rate_limit_per_day": 200,
     "max_question_length": 2000,
     "block_prompt_injection": true
   }', 'Limites de uso e proteções.', false),
  ('retention', '{
     "questions_days": 180,
     "whatsapp_body_days": 30,
     "webhook_events_days": 30,
     "audit_days": 730,
     "jobs_days": 30
   }', 'Política de retenção (LGPD): dados além do prazo são excluídos/anonimizados diariamente.', false),
  ('worker', '{
     "concurrency": 1,
     "lock_seconds": 300,
     "poll_seconds": 15,
     "heartbeat_seconds": 30,
     "offline_after_seconds": 120,
     "max_attempts": 3
   }', 'Worker local (fila, bloqueios e disponibilidade).', false),
  ('documents', '{
     "chunk_size": 1200,
     "chunk_overlap": 200,
     "min_chars_per_page": 40,
     "expiry_alert_days": 30
   }', 'Extração e divisão de documentos.', false),
  ('branding', '{
     "product_name": "Especialista IA — Planos de Saúde",
     "company_name": "",
     "logo_url": "",
     "primary_color": "#0B1F3A",
     "accent_color": "#2563EB"
   }', 'Identidade visual (nome, logo e cores) — personalizável.', true);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create table public.worker_heartbeats (
  worker_id text primary key check (worker_id ~ '^[A-Za-z0-9_.-]{3,64}$'),
  profile_id uuid references public.profiles (id) on delete set null,
  machine_name text,
  app_version text,
  status text not null default 'online' check (status in ('online', 'ocupado', 'parando', 'erro')),
  ollama_ok boolean not null default false,
  chat_model text,
  embedding_model text,
  jobs_running integer not null default 0,
  jobs_done integer not null default 0,
  last_error text,
  info jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Auditoria automática das tabelas administrativas
-- ---------------------------------------------------------------------
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  -- Campos volumosos ou sensíveis não são copiados para a auditoria.
  v_skip text[] := array['embedding', 'content_tsv', 'answer', 'updated_at', 'value'];
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any (v_skip)) and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('de', v_old -> v_key, 'para', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb and tg_table_name <> 'system_settings' then
      return new;
    end if;
    if tg_table_name = 'system_settings' then
      v_changes := jsonb_build_object('chave', v_new ->> 'key', 'valor', v_new -> 'value');
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new - v_skip;
  else
    v_changes := v_old - v_skip;
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, details)
  values (
    auth.uid(),
    coalesce(public.current_app_role(), case when auth.uid() is null then 'sistema' end),
    lower(tg_op),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key'),
    v_changes
  );
  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'operators', 'products', 'knowledge_documents', 'document_versions', 'knowledge_faq',
    'required_info_rules', 'knowledge_conflicts', 'system_settings', 'handoff_requests'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function public.audit_row_change()', t || '_audit', t);
  end loop;
end $$;
