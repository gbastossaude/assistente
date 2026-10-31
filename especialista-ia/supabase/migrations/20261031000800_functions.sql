-- =====================================================================
-- Funções (RPC) e gatilhos de negócio
-- =====================================================================

-- ---------------------------------------------------------------------
-- Minimização de dados no servidor (segunda camada; os clientes já removem antes de enviar)
-- ---------------------------------------------------------------------
create or replace function especialista.redact_pii(p_text text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text, ''),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[e-mail removido]', 'g'),
    '\y\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\y', '[CNPJ removido]', 'g'),
    '\y\d{3}\.\d{3}\.\d{3}-\d{2}\y', '[CPF removido]', 'g'),
    '(\+?55\s?)?\(?\y\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\y', '[telefone removido]', 'g'),
    '\y\d{11,20}\y', '[número removido]', 'g')
$$;

create or replace function especialista.setting(p_key text) returns jsonb
language sql stable security definer set search_path = especialista as $$
  select value from especialista.system_settings where key = p_key
$$;

-- ---------------------------------------------------------------------
-- Perfis: proteções
-- ---------------------------------------------------------------------
create or replace function especialista.profiles_guard() returns trigger
language plpgsql security definer set search_path = especialista as $$
begin
  if new.whatsapp_phone is not null then
    new.whatsapp_phone := regexp_replace(new.whatsapp_phone, '\D', '', 'g');
  end if;
  -- Trocar o número revoga a aprovação, a menos que o administrador aprove explicitamente na mesma operação.
  if new.whatsapp_phone is distinct from old.whatsapp_phone and new.whatsapp_approved = old.whatsapp_approved then
    new.whatsapp_approved := false;
  end if;
  if new.whatsapp_approved and not old.whatsapp_approved then
    new.whatsapp_approved_at := now();
    new.whatsapp_approved_by := auth.uid();
  elsif not new.whatsapp_approved then
    new.whatsapp_approved_at := null;
    new.whatsapp_approved_by := null;
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (select 1 from especialista.profiles where role = 'admin' and active and id <> old.id) then
      raise exception 'Não é possível remover o último administrador ativo.' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on especialista.profiles
  for each row execute function especialista.profiles_guard();

create or replace function especialista.update_my_profile(p_full_name text) returns void
language plpgsql security definer set search_path = especialista as $$
begin
  if not especialista.is_active_user() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_full_name, ''))) not between 2 and 120 then
    raise exception 'Nome inválido' using errcode = '22023';
  end if;
  update especialista.profiles set full_name = btrim(p_full_name) where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Enfileiramento automático
-- ---------------------------------------------------------------------
create or replace function especialista.enqueue_question() returns trigger
language plpgsql security definer set search_path = especialista as $$
declare
  v_expires timestamptz;
begin
  if new.channel = 'whatsapp' and new.whatsapp_contact_id is not null then
    select window_expires_at into v_expires from especialista.whatsapp_contacts where id = new.whatsapp_contact_id;
  end if;
  insert into especialista.processing_jobs (type, question_id, priority, max_attempts, expires_at)
  values ('answer_question', new.id, case when new.channel = 'whatsapp' then 8 else 10 end,
          coalesce((especialista.setting('worker') ->> 'max_attempts')::smallint, 3), v_expires)
  on conflict do nothing;
  return new;
end $$;

create trigger questions_enqueue after insert on especialista.questions
  for each row when (new.status = 'pendente') execute function especialista.enqueue_question();

create or replace function especialista.enqueue_document_version() returns trigger
language plpgsql security definer set search_path = especialista as $$
begin
  insert into especialista.processing_jobs (type, document_version_id, priority, payload)
  values ('index_document', new.id, 0, jsonb_build_object('ocr', new.ocr_requested))
  on conflict do nothing;
  update especialista.knowledge_documents
     set status = case when current_version_id is null and status <> 'inativo' then 'processando' else status end
   where id = new.document_id;
  return new;
end $$;

create trigger document_versions_enqueue after insert on especialista.document_versions
  for each row execute function especialista.enqueue_document_version();

create or replace function especialista.enqueue_faq() returns trigger
language plpgsql security definer set search_path = especialista as $$
begin
  if new.status = 'publicado' and (
      tg_op = 'INSERT' or old.status is distinct from new.status
      or old.question is distinct from new.question or old.answer is distinct from new.answer
      or new.embedding is null) then
    insert into especialista.processing_jobs (type, faq_id, priority) values ('index_faq', new.id, 1)
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger knowledge_faq_enqueue after insert or update of question, answer, status on especialista.knowledge_faq
  for each row execute function especialista.enqueue_faq();

-- Nova versão: número sequencial calculado no servidor (não confia no cliente)
create or replace function especialista.document_versions_before_insert() returns trigger
language plpgsql security definer set search_path = especialista as $$
begin
  perform 1 from especialista.knowledge_documents where id = new.document_id for update;
  select coalesce(max(version_number), 0) + 1 into new.version_number
    from especialista.document_versions where document_id = new.document_id;
  new.status := 'enviado';
  new.uploaded_by := coalesce(new.uploaded_by, auth.uid());
  return new;
end $$;

create trigger document_versions_number before insert on especialista.document_versions
  for each row execute function especialista.document_versions_before_insert();

-- ---------------------------------------------------------------------
-- Perguntas (extensão e painel)
-- ---------------------------------------------------------------------
create or replace function especialista.sanitize_question_context(p_context jsonb) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'operator_id', case when (p_context ->> 'operator_id') ~* '^[0-9a-f-]{36}$' then p_context ->> 'operator_id' end,
    'product_id', case when (p_context ->> 'product_id') ~* '^[0-9a-f-]{36}$' then p_context ->> 'product_id' end,
    'uf', case when upper(p_context ->> 'uf') ~ '^[A-Z]{2}$' then upper(p_context ->> 'uf') end,
    'city', nullif(left(btrim(p_context ->> 'city'), 80), ''),
    'lives', case when (p_context ->> 'lives') ~ '^\d{1,5}$' then (p_context ->> 'lives')::int end,
    'contract_type', case when (p_context ->> 'contract_type') in
      ('pme', 'empresarial', 'mei', 'adesao', 'individual', 'familiar', 'senior') then p_context ->> 'contract_type' end,
    'cnpj_months', case when (p_context ->> 'cnpj_months') ~ '^\d{1,3}$' then (p_context ->> 'cnpj_months')::int end
  ))
$$;

create or replace function especialista.submit_question(
  p_text text,
  p_context jsonb default '{}'::jsonb,
  p_channel text default 'extension',
  p_parent_question_id uuid default null
) returns uuid
language plpgsql security definer set search_path = especialista as $$
declare
  v_uid uuid := auth.uid();
  v_role text := especialista.current_app_role();
  v_sec jsonb := coalesce(especialista.setting('security'), '{}'::jsonb);
  v_text text := btrim(coalesce(p_text, ''));
  v_redacted text;
  v_id uuid;
  v_count int;
begin
  if v_role is null or v_role not in ('admin', 'editor', 'colaborador') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_channel not in ('extension', 'admin') then
    raise exception 'Canal inválido' using errcode = '22023';
  end if;
  if length(v_text) < 3 then
    raise exception 'Pergunta muito curta.' using errcode = '22023';
  end if;
  if length(v_text) > coalesce((v_sec ->> 'max_question_length')::int, 2000) then
    raise exception 'Pergunta muito longa (máximo de % caracteres).', coalesce((v_sec ->> 'max_question_length')::int, 2000)
      using errcode = '22023';
  end if;

  select count(*) into v_count from especialista.questions
   where profile_id = v_uid and created_at > now() - interval '1 minute';
  if v_count >= coalesce((v_sec ->> 'rate_limit_per_minute')::int, 6) then
    raise exception 'Muitas perguntas em pouco tempo. Aguarde um minuto e tente novamente.' using errcode = 'P0429';
  end if;
  select count(*) into v_count from especialista.questions
   where profile_id = v_uid and created_at > now() - interval '1 day';
  if v_count >= coalesce((v_sec ->> 'rate_limit_per_day')::int, 200) then
    raise exception 'Limite diário de perguntas atingido.' using errcode = 'P0429';
  end if;

  if p_parent_question_id is not null and not exists (
      select 1 from especialista.questions where id = p_parent_question_id and profile_id = v_uid) then
    raise exception 'Pergunta de origem inválida.' using errcode = '22023';
  end if;

  v_redacted := especialista.redact_pii(v_text);
  insert into especialista.questions (profile_id, channel, text_redacted, context, pii_redacted, parent_question_id)
  values (v_uid, p_channel, v_redacted, especialista.sanitize_question_context(coalesce(p_context, '{}'::jsonb)),
          v_redacted <> v_text, p_parent_question_id)
  returning id into v_id;

  update especialista.profiles set last_seen_at = now() where id = v_uid;
  return v_id;
end $$;

create or replace function especialista.toggle_favorite(p_question_id uuid, p_value boolean) returns void
language plpgsql security definer set search_path = especialista as $$
begin
  if not especialista.is_active_user() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  update especialista.questions set is_favorite = p_value where id = p_question_id and profile_id = auth.uid();
  if not found then raise exception 'Pergunta não encontrada.' using errcode = 'P0002'; end if;
end $$;

create or replace function especialista.submit_feedback(p_answer_id uuid, p_rating text, p_comment text default null)
returns uuid
language plpgsql security definer set search_path = especialista as $$
declare
  v_question uuid;
  v_id uuid;
begin
  if not especialista.is_active_user() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_rating not in ('util', 'incorreta') then raise exception 'Avaliação inválida' using errcode = '22023'; end if;
  select a.question_id into v_question from especialista.answers a join especialista.questions q on q.id = a.question_id
   where a.id = p_answer_id and (q.profile_id = auth.uid() or especialista.has_role('admin', 'editor'));
  if v_question is null then raise exception 'Resposta não encontrada.' using errcode = 'P0002'; end if;
  insert into especialista.feedback (answer_id, question_id, profile_id, rating, comment)
  values (p_answer_id, v_question, auth.uid(), p_rating, nullif(left(especialista.redact_pii(btrim(coalesce(p_comment, ''))), 1000), ''))
  on conflict (answer_id, profile_id) do update
    set rating = excluded.rating, comment = excluded.comment, status = 'novo', created_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function especialista.request_handoff(p_question_id uuid default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = especialista as $$
declare
  v_id uuid;
begin
  if not especialista.has_role('admin', 'editor', 'colaborador') then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_question_id is not null and not exists (
      select 1 from especialista.questions where id = p_question_id and profile_id = auth.uid()) then
    raise exception 'Pergunta não encontrada.' using errcode = 'P0002';
  end if;
  select id into v_id from especialista.handoff_requests
   where profile_id = auth.uid() and status <> 'resolvido' and question_id is not distinct from p_question_id;
  if v_id is not null then return v_id; end if;
  insert into especialista.handoff_requests (profile_id, channel, question_id, note)
  values (auth.uid(), 'extension', p_question_id, nullif(left(especialista.redact_pii(btrim(coalesce(p_note, ''))), 1000), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function especialista.get_service_status() returns jsonb
language plpgsql stable security definer set search_path = especialista as $$
declare
  v_offline int := coalesce((especialista.setting('worker') ->> 'offline_after_seconds')::int, 120);
  v_hb record;
begin
  if not especialista.is_active_user() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select * into v_hb from especialista.worker_heartbeats order by last_seen_at desc limit 1;
  return jsonb_build_object(
    'worker_online', coalesce(v_hb.last_seen_at > now() - make_interval(secs => v_offline) and v_hb.status <> 'parando', false),
    'worker_last_seen_at', v_hb.last_seen_at,
    'ai_ok', coalesce(v_hb.ollama_ok, false),
    'chat_model', v_hb.chat_model,
    'pending_jobs', (select count(*) from especialista.processing_jobs where type = 'answer_question' and status in ('pendente', 'processando')),
    'server_time', now()
  );
end $$;

-- ---------------------------------------------------------------------
-- Worker local: heartbeat, fila e resultados
-- ---------------------------------------------------------------------
create or replace function especialista.assert_worker() returns void
language plpgsql stable security definer set search_path = especialista as $$
begin
  if not especialista.has_role('worker') then
    raise exception 'Acesso negado: somente a conta do worker local.' using errcode = '42501';
  end if;
end $$;

create or replace function especialista.worker_heartbeat(p_worker_id text, p_info jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = especialista as $$
begin
  perform especialista.assert_worker();
  insert into especialista.worker_heartbeats as h (worker_id, profile_id, machine_name, app_version, status, ollama_ok,
    chat_model, embedding_model, jobs_running, jobs_done, last_error, info, last_seen_at)
  values (p_worker_id, auth.uid(), left(p_info ->> 'machine_name', 120), left(p_info ->> 'app_version', 40),
    coalesce(p_info ->> 'status', 'online'), coalesce((p_info ->> 'ollama_ok')::boolean, false),
    left(p_info ->> 'chat_model', 80), left(p_info ->> 'embedding_model', 80),
    coalesce((p_info ->> 'jobs_running')::int, 0), coalesce((p_info ->> 'jobs_done')::int, 0),
    left(p_info ->> 'last_error', 500), coalesce(p_info -> 'details', '{}'::jsonb), now())
  on conflict (worker_id) do update set
    profile_id = excluded.profile_id, machine_name = excluded.machine_name, app_version = excluded.app_version,
    status = excluded.status, ollama_ok = excluded.ollama_ok, chat_model = excluded.chat_model,
    embedding_model = excluded.embedding_model, jobs_running = excluded.jobs_running, jobs_done = excluded.jobs_done,
    last_error = excluded.last_error, info = excluded.info, last_seen_at = now(),
    started_at = case when h.status = 'parando' then now() else h.started_at end;
  -- Devolve a configuração central para o worker (nada de segredos).
  return jsonb_build_object(
    'ai', especialista.setting('ai'), 'worker', especialista.setting('worker'), 'documents', especialista.setting('documents'),
    'source_priority', especialista.setting('source_priority'), 'security', especialista.setting('security'),
    'whatsapp', jsonb_build_object('max_answer_chars', especialista.setting('whatsapp') -> 'max_answer_chars'),
    'server_time', now());
end $$;

create or replace function especialista.claim_jobs(
  p_worker_id text,
  p_types text[] default null,
  p_limit int default 1,
  p_lock_seconds int default 300
) returns setof especialista.processing_jobs
language plpgsql security definer set search_path = especialista as $$
declare
  r especialista.processing_jobs;
  v_question_ids uuid[] := '{}';
begin
  perform especialista.assert_worker();

  -- Respostas de WhatsApp cuja janela de 24 h acabou não são mais processadas/enviadas.
  with expired as (
    update especialista.processing_jobs
       set status = 'expirado', completed_at = now(), locked_by = null, lock_expires_at = null,
           last_error = 'Janela de atendimento do WhatsApp expirou antes do processamento.'
     where status in ('pendente', 'processando') and expires_at is not null and expires_at < now()
       and (status = 'pendente' or lock_expires_at < now())
     returning question_id)
  update especialista.questions set status = 'expirada'
   where id in (select question_id from expired where question_id is not null) and status in ('pendente', 'processando');

  -- Bloqueios vencidos sem tentativas restantes → falha definitiva.
  with dead as (
    update especialista.processing_jobs
       set status = 'falhou', completed_at = now(), locked_by = null, lock_expires_at = null,
           last_error = coalesce(last_error || ' | ', '') || 'Tempo de processamento esgotado após o número máximo de tentativas.'
     where status = 'processando' and lock_expires_at < now() and attempts >= max_attempts
     returning question_id)
  update especialista.questions set status = 'erro'
   where id in (select question_id from dead where question_id is not null) and status in ('pendente', 'processando');

  for r in
    with candidate as (
      select j.id from especialista.processing_jobs j
       where ((j.status = 'pendente' and j.available_at <= now()) or (j.status = 'processando' and j.lock_expires_at < now()))
         and j.attempts < j.max_attempts
         and (p_types is null or j.type = any (p_types))
       order by j.priority desc, j.available_at, j.created_at
       limit greatest(1, least(coalesce(p_limit, 1), 10))
       for update skip locked)
    update especialista.processing_jobs j
       set status = 'processando', attempts = j.attempts + 1, locked_by = p_worker_id, locked_at = now(),
           lock_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lock_seconds, 300), 3600)))
      from candidate c
     where j.id = c.id
    returning j.*
  loop
    if r.question_id is not null then v_question_ids := v_question_ids || r.question_id; end if;
    return next r;
  end loop;

  if cardinality(v_question_ids) > 0 then
    update especialista.questions set status = 'processando', started_at = coalesce(started_at, now())
     where id = any (v_question_ids) and status = 'pendente';
  end if;
  return;
end $$;

create or replace function especialista.lock_owned_job(p_job_id uuid, p_worker_id text) returns especialista.processing_jobs
language plpgsql security definer set search_path = especialista as $$
declare
  r especialista.processing_jobs;
begin
  perform especialista.assert_worker();
  select * into r from especialista.processing_jobs where id = p_job_id for update;
  if r.id is null then raise exception 'Tarefa inexistente.' using errcode = 'P0002'; end if;
  if r.status <> 'processando' or r.locked_by is distinct from p_worker_id then
    raise exception 'Tarefa não está bloqueada por este worker (status %).', r.status using errcode = '55P03';
  end if;
  return r;
end $$;

create or replace function especialista.extend_job_lock(p_job_id uuid, p_worker_id text, p_seconds int default 300) returns void
language plpgsql security definer set search_path = especialista as $$
begin
  perform especialista.lock_owned_job(p_job_id, p_worker_id);
  update especialista.processing_jobs
     set lock_expires_at = now() + make_interval(secs => greatest(30, least(p_seconds, 3600)))
   where id = p_job_id;
end $$;

create or replace function especialista.complete_job(p_job_id uuid, p_worker_id text, p_result jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = especialista as $$
begin
  perform especialista.lock_owned_job(p_job_id, p_worker_id);
  update especialista.processing_jobs
     set status = 'concluido', result = p_result, completed_at = now(), locked_by = null, lock_expires_at = null, last_error = null
   where id = p_job_id;
end $$;

create or replace function especialista.fail_job(p_job_id uuid, p_worker_id text, p_error text, p_retryable boolean default true)
returns text
language plpgsql security definer set search_path = especialista as $$
declare
  r especialista.processing_jobs := especialista.lock_owned_job(p_job_id, p_worker_id);
  v_error text := left(coalesce(p_error, 'erro desconhecido'), 1000);
begin
  if p_retryable and r.attempts < r.max_attempts and (r.expires_at is null or r.expires_at > now()) then
    update especialista.processing_jobs
       set status = 'pendente', last_error = v_error, locked_by = null, lock_expires_at = null,
           available_at = now() + make_interval(secs => least(30 * power(2, r.attempts - 1)::int, 900))
     where id = p_job_id;
    if r.question_id is not null then
      update especialista.questions set status = 'pendente' where id = r.question_id and status = 'processando';
    end if;
    return 'reagendada';
  end if;

  update especialista.processing_jobs
     set status = 'falhou', last_error = v_error, completed_at = now(), locked_by = null, lock_expires_at = null
   where id = p_job_id;
  if r.question_id is not null then
    update especialista.questions set status = 'erro' where id = r.question_id and status in ('pendente', 'processando');
  end if;
  if r.document_version_id is not null then
    update especialista.document_versions set status = 'erro', error_message = v_error, processed_at = now()
     where id = r.document_version_id;
    update especialista.knowledge_documents d set status = 'erro'
      from especialista.document_versions v
     where v.id = r.document_version_id and d.id = v.document_id and d.current_version_id is null and d.status <> 'inativo';
  end if;
  return 'falhou';
end $$;

-- Encerramento gracioso: devolve as tarefas à fila sem consumir tentativa.
create or replace function especialista.release_jobs(p_worker_id text) returns integer
language plpgsql security definer set search_path = especialista as $$
declare
  v_count int;
begin
  perform especialista.assert_worker();
  with released as (
    update especialista.processing_jobs
       set status = 'pendente', attempts = greatest(attempts - 1, 0), locked_by = null, lock_expires_at = null
     where locked_by = p_worker_id and status = 'processando'
     returning question_id)
  update especialista.questions set status = 'pendente'
   where id in (select question_id from released where question_id is not null) and status = 'processando';
  get diagnostics v_count = row_count;
  update especialista.worker_heartbeats set status = 'parando', last_seen_at = now() where worker_id = p_worker_id;
  return v_count;
end $$;

-- Grava a resposta, as fontes e conclui a tarefa numa única transação.
create or replace function especialista.save_answer(p_job_id uuid, p_worker_id text, p_answer jsonb, p_sources jsonb default '[]'::jsonb)
returns uuid
language plpgsql security definer set search_path = especialista as $$
declare
  r especialista.processing_jobs := especialista.lock_owned_job(p_job_id, p_worker_id);
  q especialista.questions;
  v_outcome text := p_answer ->> 'outcome';
  v_answer_id uuid;
  v_doc_ids uuid[];
begin
  if r.type <> 'answer_question' then raise exception 'Tarefa não é de resposta.' using errcode = '22023'; end if;
  if v_outcome not in ('respondida', 'sem_fonte', 'precisa_info', 'conflito', 'recusada', 'erro') then
    raise exception 'Resultado inválido: %', v_outcome using errcode = '22023';
  end if;
  select * into q from especialista.questions where id = r.question_id for update;

  insert into especialista.answers (question_id, outcome, content, confidence, warnings, missing_fields, provider, model,
    retrieval_ms, generation_ms, total_ms)
  values (q.id, v_outcome, left(p_answer ->> 'content', 12000), (p_answer ->> 'confidence')::numeric,
    coalesce(array(select jsonb_array_elements_text(p_answer -> 'warnings')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_answer -> 'missing_fields')), '{}'),
    left(p_answer ->> 'provider', 40), left(p_answer ->> 'model', 80),
    (p_answer ->> 'retrieval_ms')::int, (p_answer ->> 'generation_ms')::int, (p_answer ->> 'total_ms')::int)
  on conflict (question_id) do update set
    outcome = excluded.outcome, content = excluded.content, confidence = excluded.confidence, warnings = excluded.warnings,
    missing_fields = excluded.missing_fields, provider = excluded.provider, model = excluded.model,
    retrieval_ms = excluded.retrieval_ms, generation_ms = excluded.generation_ms, total_ms = excluded.total_ms, created_at = now()
  returning id into v_answer_id;

  delete from especialista.answer_sources where answer_id = v_answer_id;
  insert into especialista.answer_sources (answer_id, rank, document_id, version_id, chunk_id, faq_id, title, operator_name,
    page_from, page_to, excerpt, score, valid_until, rule_nature)
  select v_answer_id, s.rank, s.document_id, s.version_id, s.chunk_id, s.faq_id, left(s.title, 300), s.operator_name,
         s.page_from, s.page_to, left(s.excerpt, 1200), s.score, s.valid_until, s.rule_nature
    from jsonb_to_recordset(coalesce(p_sources, '[]'::jsonb)) as s(
      rank smallint, document_id uuid, version_id uuid, chunk_id bigint, faq_id uuid, title text, operator_name text,
      page_from int, page_to int, excerpt text, score numeric, valid_until date, rule_nature text);

  update especialista.questions set
    status = v_outcome,
    answered_at = now(),
    latency_ms = (extract(epoch from (now() - q.created_at)) * 1000)::int,
    detected = coalesce(p_answer -> 'detected', '{}'::jsonb),
    topic = left(p_answer -> 'detected' ->> 'topic', 40),
    operator_id = case when (p_answer -> 'detected' ->> 'operator_id') ~* '^[0-9a-f-]{36}$'
                       then (p_answer -> 'detected' ->> 'operator_id')::uuid end,
    injection_flag = coalesce((p_answer ->> 'injection_flag')::boolean, false)
  where id = q.id;

  -- Conflito detectado na resposta → registro para o administrador
  if v_outcome = 'conflito' then
    v_doc_ids := array(select jsonb_array_elements_text(coalesce(p_answer -> 'conflict_document_ids', '[]'::jsonb))::uuid);
    -- Já existe conflito aberto para o mesmo par? Vincula a pergunta e acrescenta a evidência.
    update especialista.knowledge_conflicts k set
      question_id = coalesce(k.question_id, q.id),
      description = left(k.description || E'\nConfirmado ao responder pergunta: ' ||
                         coalesce(p_answer ->> 'conflict_description', 'fontes divergentes'), 4000)
     where k.status = 'aberto' and cardinality(v_doc_ids) >= 2
       and least(k.document_a_id, k.document_b_id) = least(v_doc_ids[1], v_doc_ids[2])
       and greatest(k.document_a_id, k.document_b_id) = greatest(v_doc_ids[1], v_doc_ids[2]);
    if not found then
      insert into especialista.knowledge_conflicts (document_a_id, document_b_id, question_id, source, description)
      values (v_doc_ids[1], v_doc_ids[2], q.id, 'resposta',
              left(coalesce(p_answer ->> 'conflict_description', 'Fontes divergentes encontradas ao responder uma pergunta.'), 2000))
      on conflict do nothing;
    end if;
  end if;

  -- Pedido de complemento pelo WhatsApp: a próxima mensagem do colaborador completa esta pergunta.
  if q.channel = 'whatsapp' and q.whatsapp_contact_id is not null then
    update especialista.whatsapp_contacts set
      pending_question_id = case when v_outcome = 'precisa_info' then q.id else null end,
      pending_until = case when v_outcome = 'precisa_info'
        then now() + make_interval(mins => coalesce((especialista.setting('whatsapp') ->> 'clarification_minutes')::int, 30)) end
    where id = q.whatsapp_contact_id;
  end if;

  update especialista.processing_jobs
     set status = 'concluido', completed_at = now(), locked_by = null, lock_expires_at = null,
         result = jsonb_build_object('answer_id', v_answer_id, 'outcome', v_outcome)
   where id = p_job_id;
  return v_answer_id;
end $$;

-- ---------------------------------------------------------------------
-- Indexação de documentos
-- ---------------------------------------------------------------------
create or replace function especialista.activate_document_version(p_version_id uuid) returns void
language plpgsql security definer set search_path = especialista as $$
declare
  v especialista.document_versions;
  d especialista.knowledge_documents;
begin
  select * into v from especialista.document_versions where id = p_version_id for update;
  select * into d from especialista.knowledge_documents where id = v.document_id for update;
  if d.current_version_id is not null and d.current_version_id <> v.id then
    update especialista.document_versions set status = 'substituido' where id = d.current_version_id;
    delete from especialista.document_chunks where version_id = d.current_version_id;
  end if;
  update especialista.document_versions set status = 'indexado', needs_review = false where id = v.id;
  update especialista.knowledge_documents
     set current_version_id = v.id,
         status = case when status = 'inativo' then 'inativo' else 'ativo' end,
         version_label = coalesce(v.version_label, version_label)
   where id = d.id;

  -- Sobreposição com outros documentos ativos (mesma operadora, categoria, abrangência e vigência) → conflito potencial
  insert into especialista.knowledge_conflicts (document_a_id, document_b_id, source, description)
  select d.id, o.id, 'cadastro',
         format('Possível sobreposição: "%s" e "%s" têm a mesma operadora, categoria e abrangência com vigências simultâneas. '
                'Confirme se um substitui o outro ou se as regras são complementares.', d.title, o.title)
    from especialista.knowledge_documents o
   where o.id <> d.id and o.status = 'ativo' and d.status <> 'inativo'
     and o.operator_id = d.operator_id and o.category = d.category
     and o.product_id is not distinct from d.product_id
     and o.rule_nature = d.rule_nature
     and (cardinality(o.states) = 0 or cardinality(d.states) = 0 or o.states && d.states)
     and (cardinality(o.contract_types) = 0 or cardinality(d.contract_types) = 0 or o.contract_types && d.contract_types)
     and coalesce(o.valid_until, 'infinity'::date) >= coalesce(d.valid_from, '-infinity'::date)
     and coalesce(d.valid_until, 'infinity'::date) >= coalesce(o.valid_from, '-infinity'::date)
     and coalesce(o.valid_until, 'infinity'::date) >= current_date
  on conflict do nothing;
end $$;

create or replace function especialista.finalize_document_version(p_job_id uuid, p_worker_id text, p_result jsonb) returns text
language plpgsql security definer set search_path = especialista as $$
declare
  r especialista.processing_jobs := especialista.lock_owned_job(p_job_id, p_worker_id);
  v especialista.document_versions;
  v_status text := p_result ->> 'status';
begin
  if r.type <> 'index_document' then raise exception 'Tarefa não é de indexação.' using errcode = '22023'; end if;
  if v_status not in ('indexado', 'revisao') then raise exception 'Status inválido: %', v_status using errcode = '22023'; end if;
  select * into v from especialista.document_versions where id = r.document_version_id for update;

  update especialista.document_versions set
    page_count = (p_result ->> 'page_count')::int,
    char_count = (p_result ->> 'char_count')::int,
    chunk_count = (select count(*) from especialista.document_chunks where version_id = v.id),
    quality = coalesce(p_result -> 'quality', '{}'::jsonb),
    needs_review = v_status = 'revisao',
    review_reason = left(p_result ->> 'review_reason', 1000),
    ocr_used = coalesce((p_result ->> 'ocr_used')::boolean, false),
    embedding_model = left(p_result ->> 'embedding_model', 80),
    error_message = null,
    processed_at = now(),
    status = v_status
  where id = v.id;

  if v_status = 'indexado' then
    perform especialista.activate_document_version(v.id);
  else
    update especialista.knowledge_documents set status = 'revisao'
     where id = v.document_id and current_version_id is null and status <> 'inativo';
  end if;

  update especialista.processing_jobs
     set status = 'concluido', completed_at = now(), locked_by = null, lock_expires_at = null, result = p_result - 'quality'
   where id = p_job_id;
  return v_status;
end $$;

-- Editor aprova uma extração marcada para revisão (OCR, páginas ilegíveis etc.)
create or replace function especialista.approve_document_version(p_version_id uuid, p_notes text default null) returns void
language plpgsql security definer set search_path = especialista as $$
declare
  v especialista.document_versions;
begin
  if not especialista.has_role('admin', 'editor') then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select * into v from especialista.document_versions where id = p_version_id for update;
  if v.id is null or v.status <> 'revisao' then
    raise exception 'Versão não está aguardando revisão.' using errcode = '22023';
  end if;
  if not exists (select 1 from especialista.document_chunks where version_id = v.id) then
    raise exception 'Não há texto extraído para aprovar. Envie um arquivo legível ou ative o OCR.' using errcode = '22023';
  end if;
  update especialista.document_versions set reviewed_by = auth.uid(), reviewed_at = now(),
    review_reason = coalesce(review_reason, '') || coalesce(' | Aprovado: ' || p_notes, ' | Aprovado')
  where id = v.id;
  perform especialista.activate_document_version(v.id);
end $$;

create or replace function especialista.discard_document_version(p_version_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = especialista as $$
declare
  v especialista.document_versions;
begin
  if not especialista.has_role('admin', 'editor') then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select * into v from especialista.document_versions where id = p_version_id for update;
  if v.id is null then raise exception 'Versão inexistente.' using errcode = 'P0002'; end if;
  if exists (select 1 from especialista.knowledge_documents where current_version_id = v.id) then
    raise exception 'A versão vigente não pode ser descartada; envie uma nova versão ou desative o documento.' using errcode = '22023';
  end if;
  update especialista.processing_jobs set status = 'cancelado', completed_at = now(), locked_by = null
   where document_version_id = v.id and status in ('pendente', 'processando');
  delete from especialista.document_chunks where version_id = v.id;
  update especialista.document_versions set status = 'descartado',
    review_reason = coalesce(review_reason || ' | ', '') || 'Descartado: ' || coalesce(p_reason, 'sem motivo informado')
  where id = v.id;
  update especialista.knowledge_documents d set status = 'rascunho'
   where d.id = v.document_id and d.current_version_id is null and d.status in ('revisao', 'erro', 'processando')
     and not exists (select 1 from especialista.document_versions x where x.document_id = d.id and x.status in ('enviado', 'processando', 'revisao'));
end $$;

create or replace function especialista.set_document_active(p_document_id uuid, p_active boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = especialista as $$
declare
  d especialista.knowledge_documents;
begin
  if not especialista.has_role('admin', 'editor') then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select * into d from especialista.knowledge_documents where id = p_document_id for update;
  if d.id is null then raise exception 'Documento inexistente.' using errcode = 'P0002'; end if;
  if p_active then
    if d.current_version_id is null then
      raise exception 'O documento não tem versão indexada para ativar.' using errcode = '22023';
    end if;
    update especialista.knowledge_documents set status = 'ativo', deactivated_at = null, deactivated_by = null,
      deactivation_reason = null, updated_by = auth.uid() where id = d.id;
  else
    if length(btrim(coalesce(p_reason, ''))) < 3 then
      raise exception 'Informe o motivo da desativação.' using errcode = '22023';
    end if;
    update especialista.knowledge_documents set status = 'inativo', deactivated_at = now(), deactivated_by = auth.uid(),
      deactivation_reason = btrim(p_reason), updated_by = auth.uid() where id = d.id;
  end if;
end $$;

create or replace function especialista.request_reindex(p_document_id uuid) returns uuid
language plpgsql security definer set search_path = especialista as $$
declare
  v_version uuid;
  v_job uuid;
begin
  if not especialista.has_role('admin', 'editor') then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select coalesce(current_version_id,
    (select id from especialista.document_versions where document_id = p_document_id and status in ('erro', 'revisao', 'enviado')
      order by version_number desc limit 1))
    into v_version from especialista.knowledge_documents where id = p_document_id;
  if v_version is null then raise exception 'Documento sem versão para reindexar.' using errcode = '22023'; end if;
  insert into especialista.processing_jobs (type, document_version_id, priority, payload)
  values ('index_document', v_version, 0, jsonb_build_object('reindex', true))
  on conflict do nothing
  returning id into v_job;
  if v_job is null then raise exception 'Já existe uma indexação em andamento para este documento.' using errcode = '23505'; end if;
  return v_job;
end $$;

-- Reprocessar uma pergunta (ex.: após corrigir a base)
create or replace function especialista.retry_question(p_question_id uuid) returns void
language plpgsql security definer set search_path = especialista as $$
begin
  if not especialista.has_role('admin', 'editor') then raise exception 'Acesso negado' using errcode = '42501'; end if;
  update especialista.processing_jobs set status = 'pendente', attempts = 0, available_at = now(), last_error = null,
    locked_by = null, lock_expires_at = null, completed_at = null
   where question_id = p_question_id and type = 'answer_question' and status in ('falhou', 'concluido', 'cancelado')
     and (expires_at is null or expires_at > now());
  if not found then raise exception 'Não foi possível reprocessar (tarefa em andamento ou janela do WhatsApp expirada).' using errcode = '22023'; end if;
  update especialista.questions set status = 'pendente', answered_at = null where id = p_question_id;
end $$;

-- FAQ: o worker grava somente o embedding (sem permissão de editar o conteúdo)
create or replace function especialista.save_faq_embedding(p_job_id uuid, p_worker_id text, p_embedding extensions.vector, p_model text)
returns void
language plpgsql security definer set search_path = especialista, extensions as $$
declare
  r especialista.processing_jobs := especialista.lock_owned_job(p_job_id, p_worker_id);
begin
  if r.type <> 'index_faq' then raise exception 'Tarefa não é de FAQ.' using errcode = '22023'; end if;
  update especialista.knowledge_faq set embedding = p_embedding, embedding_model = left(p_model, 80) where id = r.faq_id;
  update especialista.processing_jobs set status = 'concluido', completed_at = now(), locked_by = null, lock_expires_at = null
   where id = p_job_id;
end $$;

-- Remove trechos de uma versão antes de reindexar (somente a versão da tarefa bloqueada pelo worker)
create or replace function especialista.clear_version_chunks(p_job_id uuid, p_worker_id text) returns integer
language plpgsql security definer set search_path = especialista as $$
declare
  r especialista.processing_jobs := especialista.lock_owned_job(p_job_id, p_worker_id);
  v_count int;
begin
  if r.type <> 'index_document' then raise exception 'Tarefa não é de indexação.' using errcode = '22023'; end if;
  delete from especialista.document_chunks where version_id = r.document_version_id;
  get diagnostics v_count = row_count;
  update especialista.document_versions set status = 'processando', error_message = null where id = r.document_version_id;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Busca híbrida (vetorial + textual, combinadas por Reciprocal Rank Fusion)
-- ---------------------------------------------------------------------
create or replace function especialista.or_tsquery(p_text text) returns tsquery
language sql immutable as $$
  select nullif(replace(plainto_tsquery('especialista.pt_unaccent'::regconfig, coalesce(p_text, ''))::text, ' & ', ' | '), '')::tsquery
$$;

create or replace function especialista.search_chunks(
  p_query_embedding extensions.vector,
  p_query_text text,
  p_embedding_model text,
  p_operator_ids uuid[] default null,
  p_include_general boolean default true,
  p_match_count int default 20
) returns table (
  chunk_id bigint, document_id uuid, version_id uuid, content text, page_from int, page_to int, section text,
  title text, operator_id uuid, operator_name text, product_id uuid, product_name text, category text, rule_nature text,
  contract_types text[], is_national boolean, states text[], cities text[], lives_min int, lives_max int,
  published_at date, valid_from date, valid_until date, doc_priority smallint, doc_updated_at timestamptz,
  vector_similarity double precision, text_rank double precision, rrf_score double precision
)
language plpgsql stable security definer set search_path = especialista, extensions as $$
declare
  v_tsq tsquery := especialista.or_tsquery(p_query_text);
  v_k int := greatest(1, least(coalesce(p_match_count, 20), 60));
begin
  if not especialista.has_role('worker', 'admin', 'editor') then raise exception 'Acesso negado' using errcode = '42501'; end if;
  perform set_config('hnsw.ef_search', '100', true);
  return query
  with base as (
    select c.id, c.embedding, c.content_tsv
      from especialista.document_chunks c
      join especialista.knowledge_documents d on d.id = c.document_id
     where d.status = 'ativo' and c.version_id = d.current_version_id
       and c.embedding_model = p_embedding_model
       and (p_operator_ids is null or d.operator_id = any (p_operator_ids) or (p_include_general and d.operator_id is null))
  ),
  vec as (
    select b.id, (1 - (b.embedding <=> p_query_embedding))::double precision as sim,
           row_number() over (order by b.embedding <=> p_query_embedding) as rnk
      from base b
     where p_query_embedding is not null and b.embedding is not null
     order by b.embedding <=> p_query_embedding
     limit v_k * 3
  ),
  fts as (
    select b.id, ts_rank_cd(b.content_tsv, v_tsq)::double precision as rank,
           row_number() over (order by ts_rank_cd(b.content_tsv, v_tsq) desc) as rnk
      from base b
     where v_tsq is not null and b.content_tsv @@ v_tsq
     order by rank desc
     limit v_k * 3
  ),
  merged as (
    select coalesce(vec.id, fts.id) as id, vec.sim, fts.rank,
           (coalesce(1.0 / (60 + vec.rnk), 0) + coalesce(1.0 / (60 + fts.rnk), 0))::double precision as rrf
      from vec full outer join fts on fts.id = vec.id
  )
  select c.id, c.document_id, c.version_id, c.content, c.page_from, c.page_to, c.section,
         d.title, d.operator_id, o.name, d.product_id, p.name, d.category, d.rule_nature,
         d.contract_types, d.is_national, d.states, d.cities, d.lives_min, d.lives_max,
         d.published_at, d.valid_from, d.valid_until, d.priority, d.updated_at,
         m.sim, m.rank, m.rrf
    from merged m
    join especialista.document_chunks c on c.id = m.id
    join especialista.knowledge_documents d on d.id = c.document_id
    left join especialista.operators o on o.id = d.operator_id
    left join especialista.products p on p.id = d.product_id
   order by m.rrf desc
   limit v_k;
end $$;

create or replace function especialista.search_faq(
  p_query_embedding extensions.vector,
  p_query_text text,
  p_embedding_model text,
  p_operator_ids uuid[] default null,
  p_match_count int default 5
) returns table (
  faq_id uuid, question text, answer text, operator_id uuid, operator_name text, product_id uuid, topic text,
  contract_types text[], states text[], lives_min int, lives_max int, valid_until date, rule_nature text,
  source_document_id uuid, priority smallint, updated_at timestamptz,
  vector_similarity double precision, text_rank double precision, rrf_score double precision
)
language plpgsql stable security definer set search_path = especialista, extensions as $$
declare
  v_tsq tsquery := especialista.or_tsquery(p_query_text);
  v_k int := greatest(1, least(coalesce(p_match_count, 5), 20));
begin
  if not especialista.has_role('worker', 'admin', 'editor') then raise exception 'Acesso negado' using errcode = '42501'; end if;
  return query
  with base as (
    select f.* from especialista.knowledge_faq f
     where f.status = 'publicado'
       and (p_operator_ids is null or f.operator_id = any (p_operator_ids) or f.operator_id is null)
  ),
  vec as (
    select b.id, (1 - (b.embedding <=> p_query_embedding))::double precision as sim,
           row_number() over (order by b.embedding <=> p_query_embedding) as rnk
      from base b
     where p_query_embedding is not null and b.embedding is not null and b.embedding_model = p_embedding_model
     order by b.embedding <=> p_query_embedding limit v_k * 3
  ),
  fts as (
    select b.id, ts_rank_cd(b.content_tsv, v_tsq)::double precision as rank,
           row_number() over (order by ts_rank_cd(b.content_tsv, v_tsq) desc) as rnk
      from base b where v_tsq is not null and b.content_tsv @@ v_tsq
     order by rank desc limit v_k * 3
  ),
  merged as (
    select coalesce(vec.id, fts.id) as id, vec.sim, fts.rank,
           (coalesce(1.0 / (60 + vec.rnk), 0) + coalesce(1.0 / (60 + fts.rnk), 0))::double precision as rrf
      from vec full outer join fts on fts.id = vec.id
  )
  select f.id, f.question, f.answer, f.operator_id, o.name, f.product_id, f.topic, f.contract_types, f.states,
         f.lives_min, f.lives_max, f.valid_until, f.rule_nature, f.source_document_id, f.priority, f.updated_at,
         m.sim, m.rank, m.rrf
    from merged m
    join especialista.knowledge_faq f on f.id = m.id
    left join especialista.operators o on o.id = f.operator_id
   order by m.rrf desc
   limit v_k;
end $$;

-- ---------------------------------------------------------------------
-- WhatsApp: controle de consumo (chamado SOMENTE pelas Edge Functions com service role)
-- ---------------------------------------------------------------------
create or replace function especialista.whatsapp_reserve_send(p_phone_number_id text) returns jsonb
language plpgsql security definer set search_path = especialista as $$
declare
  v_cfg jsonb := coalesce(especialista.setting('whatsapp'), '{}'::jsonb);
  v_cap int := coalesce((v_cfg ->> 'monthly_cap')::int, 900);
  v_day_cap int := coalesce((v_cfg ->> 'daily_cap')::int, v_cap);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_month_count int;
  v_day_count int;
  v_threshold numeric;
begin
  -- Serializa reservas do mesmo número para o teto nunca ser ultrapassado em concorrência.
  perform pg_advisory_xact_lock(hashtext('wa_usage:' || p_phone_number_id));

  select coalesce(sum(reserved), 0) into v_month_count from especialista.whatsapp_usage
   where phone_number_id = p_phone_number_id and usage_date >= v_month;
  select coalesce(sum(reserved), 0) into v_day_count from especialista.whatsapp_usage
   where phone_number_id = p_phone_number_id and usage_date = v_today;

  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then
    return jsonb_build_object('allowed', false, 'reason', 'desativado', 'month_count', v_month_count, 'cap', v_cap);
  end if;
  if v_month_count >= v_cap or v_day_count >= v_day_cap then
    insert into especialista.whatsapp_usage (phone_number_id, usage_date, blocked) values (p_phone_number_id, v_today, 1)
    on conflict (phone_number_id, usage_date) do update set blocked = whatsapp_usage.blocked + 1, updated_at = now();
    -- Alertas: limiares já ultrapassados e "limite atingido" (1.0) quando o bloqueio é mensal.
    for v_threshold in select jsonb_array_elements_text(coalesce(v_cfg -> 'alert_thresholds', '[0.5,0.8,0.95]'::jsonb))::numeric
                       union select 1.0 where v_month_count >= v_cap loop
      if v_month_count >= ceil(v_cap * v_threshold) then
        insert into especialista.usage_alerts (phone_number_id, period_month, threshold, count_at_alert, cap)
        values (p_phone_number_id, v_month, v_threshold, v_month_count, v_cap)
        on conflict do nothing;
      end if;
    end loop;
    return jsonb_build_object('allowed', false,
      'reason', case when v_month_count >= v_cap then 'limite_mensal' else 'limite_diario' end,
      'month_count', v_month_count, 'day_count', v_day_count, 'cap', v_cap, 'daily_cap', v_day_cap);
  end if;

  insert into especialista.whatsapp_usage (phone_number_id, usage_date, reserved) values (p_phone_number_id, v_today, 1)
  on conflict (phone_number_id, usage_date) do update set reserved = whatsapp_usage.reserved + 1, updated_at = now();

  for v_threshold in select jsonb_array_elements_text(coalesce(v_cfg -> 'alert_thresholds', '[0.5,0.8,0.95]'::jsonb))::numeric loop
    if v_month_count + 1 >= ceil(v_cap * v_threshold) then
      insert into especialista.usage_alerts (phone_number_id, period_month, threshold, count_at_alert, cap)
      values (p_phone_number_id, v_month, v_threshold, v_month_count + 1, v_cap)
      on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object('allowed', true, 'month_count', v_month_count + 1, 'day_count', v_day_count + 1,
    'cap', v_cap, 'daily_cap', v_day_cap, 'usage_date', v_today, 'remaining', v_cap - v_month_count - 1);
end $$;

-- Resultado do envio: sucesso conta como enviado; falha devolve a reserva (mensagem não saiu).
create or replace function especialista.whatsapp_record_send(p_phone_number_id text, p_usage_date date, p_success boolean) returns void
language plpgsql security definer set search_path = especialista as $$
begin
  if p_success then
    update especialista.whatsapp_usage set sent = sent + 1, updated_at = now()
     where phone_number_id = p_phone_number_id and usage_date = p_usage_date;
  else
    update especialista.whatsapp_usage set reserved = greatest(reserved - 1, 0), failed = failed + 1, updated_at = now()
     where phone_number_id = p_phone_number_id and usage_date = p_usage_date;
  end if;
end $$;

-- Status de entrega vindo do webhook (sent/delivered/read/failed). Idempotente.
create or replace function especialista.whatsapp_record_status(
  p_wa_message_id text, p_status text, p_at timestamptz default now(),
  p_pricing_category text default null, p_billable boolean default null,
  p_error_code text default null, p_error_message text default null
) returns boolean
language plpgsql security definer set search_path = especialista as $$
declare
  m especialista.whatsapp_messages;
  v_status text := case p_status when 'sent' then 'enviada' when 'delivered' then 'entregue' when 'read' then 'lida'
                                 when 'failed' then 'falhou' else null end;
begin
  if v_status is null then return false; end if;
  select * into m from especialista.whatsapp_messages where wa_message_id = p_wa_message_id and direction = 'out' for update;
  if m.id is null then return false; end if;
  update especialista.whatsapp_messages set
    status = case
      when m.status = 'lida' then m.status
      when m.status = 'entregue' and v_status = 'enviada' then m.status
      else v_status end,
    delivered_at = case when v_status in ('entregue', 'lida') then coalesce(delivered_at, p_at) else delivered_at end,
    read_at = case when v_status = 'lida' then coalesce(read_at, p_at) else read_at end,
    failed_at = case when v_status = 'falhou' then p_at else failed_at end,
    pricing_category = coalesce(p_pricing_category, pricing_category),
    billable = coalesce(p_billable, billable),
    error_code = coalesce(p_error_code, error_code),
    error_message = coalesce(left(p_error_message, 500), error_message)
  where id = m.id;
  if v_status in ('entregue', 'lida') and m.delivered_at is null and m.usage_date is not null then
    update especialista.whatsapp_usage set delivered = delivered + 1, updated_at = now()
     where phone_number_id = m.phone_number_id and usage_date = m.usage_date;
  end if;
  return true;
end $$;

create or replace function especialista.whatsapp_usage_summary(p_phone_number_id text default null) returns jsonb
language plpgsql stable security definer set search_path = especialista as $$
declare
  v_cfg jsonb := coalesce(especialista.setting('whatsapp'), '{}'::jsonb);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_res jsonb;
begin
  if auth.uid() is not null and not especialista.has_role('admin') then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select jsonb_build_object(
    'month', v_month,
    'cap', coalesce((v_cfg ->> 'monthly_cap')::int, 900),
    'daily_cap', coalesce((v_cfg ->> 'daily_cap')::int, 900),
    'enabled', coalesce((v_cfg ->> 'enabled')::boolean, false),
    'mode', coalesce(v_cfg ->> 'mode', 'teste'),
    'reserved', coalesce(sum(u.reserved), 0),
    'sent', coalesce(sum(u.sent), 0),
    'delivered', coalesce(sum(u.delivered), 0),
    'failed', coalesce(sum(u.failed), 0),
    'blocked', coalesce(sum(u.blocked), 0),
    'today_reserved', coalesce(sum(u.reserved) filter (where u.usage_date = v_today), 0),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('date', x.usage_date, 'reserved', x.r, 'delivered', x.d) order by x.usage_date)
        from (select usage_date, sum(reserved) r, sum(delivered) d from especialista.whatsapp_usage
               where usage_date >= v_month and (p_phone_number_id is null or phone_number_id = p_phone_number_id)
               group by usage_date) x), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('threshold', a.threshold, 'count', a.count_at_alert, 'created_at', a.created_at))
        from especialista.usage_alerts a where a.period_month = v_month), '[]'::jsonb))
  into v_res
  from especialista.whatsapp_usage u
  where u.usage_date >= v_month and (p_phone_number_id is null or u.phone_number_id = p_phone_number_id);
  return v_res;
end $$;

-- ---------------------------------------------------------------------
-- Painel: indicadores
-- ---------------------------------------------------------------------
create or replace function especialista.get_dashboard(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = especialista as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v_offline int := coalesce((especialista.setting('worker') ->> 'offline_after_seconds')::int, 120);
  v_alert_days int := coalesce((especialista.setting('documents') ->> 'expiry_alert_days')::int, 30);
begin
  if not especialista.has_role('admin', 'editor') then raise exception 'Acesso negado' using errcode = '42501'; end if;
  return jsonb_build_object(
    'period_days', p_days,
    'totals', (select jsonb_build_object(
        'questions', count(*),
        'answered', count(*) filter (where status = 'respondida'),
        'no_source', count(*) filter (where status = 'sem_fonte'),
        'needs_info', count(*) filter (where status = 'precisa_info'),
        'conflicts', count(*) filter (where status = 'conflito'),
        'refused', count(*) filter (where status = 'recusada'),
        'errors', count(*) filter (where status = 'erro'),
        'expired', count(*) filter (where status = 'expirada'),
        'pending', count(*) filter (where status in ('pendente', 'processando')),
        'avg_latency_ms', coalesce(avg(latency_ms) filter (where latency_ms is not null), 0)::int,
        'by_channel', jsonb_build_object(
          'extension', count(*) filter (where channel = 'extension'),
          'whatsapp', count(*) filter (where channel = 'whatsapp'),
          'admin', count(*) filter (where channel = 'admin')))
      from especialista.questions where created_at >= v_since),
    'per_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'total', t, 'no_source', ns) order by d)
      from (select (created_at at time zone 'America/Sao_Paulo')::date d, count(*) t,
                   count(*) filter (where status = 'sem_fonte') ns
              from especialista.questions where created_at >= v_since group by 1) x), '[]'::jsonb),
    'top_topics', coalesce((select jsonb_agg(jsonb_build_object('topic', topic, 'total', t) order by t desc)
      from (select topic, count(*) t from especialista.questions where created_at >= v_since and topic is not null
             group by topic order by t desc limit 8) x), '[]'::jsonb),
    'top_operators', coalesce((select jsonb_agg(jsonb_build_object('operator', name, 'total', t) order by t desc)
      from (select o.name, count(*) t from especialista.questions q join especialista.operators o on o.id = q.operator_id
             where q.created_at >= v_since group by o.name order by t desc limit 8) x), '[]'::jsonb),
    'feedback', (select jsonb_build_object('useful', count(*) filter (where rating = 'util'),
        'incorrect', count(*) filter (where rating = 'incorreta'),
        'incorrect_open', count(*) filter (where rating = 'incorreta' and status = 'novo'))
      from especialista.feedback where created_at >= v_since),
    'jobs', (select jsonb_build_object(
        'pending', count(*) filter (where status = 'pendente'),
        'processing', count(*) filter (where status = 'processando'),
        'failed_period', count(*) filter (where status = 'falhou' and updated_at >= v_since),
        'expired_period', count(*) filter (where status = 'expirado' and updated_at >= v_since))
      from especialista.processing_jobs),
    'documents', (select jsonb_build_object(
        'active', count(*) filter (where status = 'ativo'),
        'review', count(*) filter (where status = 'revisao'),
        'errors', count(*) filter (where status = 'erro'),
        'processing', count(*) filter (where status = 'processando'),
        'expired', count(*) filter (where status = 'ativo' and valid_until < current_date),
        'expiring', count(*) filter (where status = 'ativo' and valid_until between current_date and current_date + v_alert_days))
      from especialista.knowledge_documents),
    'open_conflicts', (select count(*) from especialista.knowledge_conflicts where status = 'aberto'),
    'open_handoffs', (select count(*) from especialista.handoff_requests where status <> 'resolvido'),
    'workers', coalesce((select jsonb_agg(jsonb_build_object(
        'worker_id', worker_id, 'machine_name', machine_name, 'status', status, 'ollama_ok', ollama_ok,
        'chat_model', chat_model, 'embedding_model', embedding_model, 'last_seen_at', last_seen_at,
        'online', last_seen_at > now() - make_interval(secs => v_offline) and status <> 'parando',
        'jobs_done', jobs_done, 'last_error', last_error) order by last_seen_at desc)
      from especialista.worker_heartbeats), '[]'::jsonb),
    'whatsapp', case when especialista.has_role('admin') then especialista.whatsapp_usage_summary(null) else null end
  );
end $$;

-- ---------------------------------------------------------------------
-- Retenção (LGPD)
-- ---------------------------------------------------------------------
create or replace function especialista.purge_expired_data() returns jsonb
language plpgsql security definer set search_path = especialista as $$
declare
  v_cfg jsonb := coalesce(especialista.setting('retention'), '{}'::jsonb);
  v_q int; v_m int; v_e int; v_a int; v_j int;
begin
  if auth.uid() is not null and not especialista.has_role('admin', 'worker') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  delete from especialista.questions
   where created_at < now() - make_interval(days => coalesce((v_cfg ->> 'questions_days')::int, 180))
     and status not in ('pendente', 'processando');
  get diagnostics v_q = row_count;
  update especialista.whatsapp_messages set body_redacted = null
   where body_redacted is not null
     and created_at < now() - make_interval(days => coalesce((v_cfg ->> 'whatsapp_body_days')::int, 30));
  get diagnostics v_m = row_count;
  delete from especialista.whatsapp_webhook_events
   where received_at < now() - make_interval(days => coalesce((v_cfg ->> 'webhook_events_days')::int, 30));
  get diagnostics v_e = row_count;
  delete from especialista.audit_logs
   where created_at < now() - make_interval(days => coalesce((v_cfg ->> 'audit_days')::int, 730));
  get diagnostics v_a = row_count;
  delete from especialista.processing_jobs
   where status in ('concluido', 'falhou', 'cancelado', 'expirado')
     and updated_at < now() - make_interval(days => coalesce((v_cfg ->> 'jobs_days')::int, 30));
  get diagnostics v_j = row_count;
  insert into especialista.audit_logs (actor_id, actor_role, action, entity, details)
  values (auth.uid(), coalesce(especialista.current_app_role(), 'sistema'), 'retencao', 'dados',
    jsonb_build_object('perguntas', v_q, 'mensagens_anonimizadas', v_m, 'eventos', v_e, 'auditoria', v_a, 'tarefas', v_j));
  return jsonb_build_object('questions', v_q, 'whatsapp_bodies', v_m, 'webhook_events', v_e, 'audit_logs', v_a, 'jobs', v_j);
end $$;

-- ---------------------------------------------------------------------
-- Permissões de execução: nada para anon; service_role para as funções do WhatsApp
-- ---------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'especialista' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.proname in ('whatsapp_reserve_send', 'whatsapp_record_send', 'whatsapp_record_status', 'find_auth_user_by_email') then
      execute format('revoke execute on function %s from authenticated', f.sig);
      execute format('grant execute on function %s to service_role', f.sig);
    elsif f.proname in ('promote_first_admin') then
      null;
    else
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Realtime (respostas e estado da fila para a extensão/painel) e agendamento da retenção
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table especialista.answers, especialista.questions, especialista.processing_jobs, especialista.worker_heartbeats;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('especialista-retencao-diaria', '17 6 * * *', 'select especialista.purge_expired_data()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível (%). Agende especialista.purge_expired_data() manualmente ou deixe o worker executá-la.', sqlerrm;
end $$;
