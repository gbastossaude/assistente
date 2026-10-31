-- =====================================================================
-- WhatsApp: operações atômicas usadas pelas Edge Functions (somente service_role)
-- =====================================================================

-- Registro idempotente da mensagem recebida + autorização do número + janela de 24 h.
create or replace function public.wa_register_inbound(
  p_wa_message_id text, p_phone_number_id text, p_wa_id text, p_variants text[], p_msg_type text,
  p_body text, p_sent_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_msg uuid;
  v_profile uuid;
  v_contact public.whatsapp_contacts;
  v_at timestamptz := least(coalesce(p_sent_at, now()), now());
  v_recent int;
begin
  insert into public.whatsapp_messages (direction, wa_message_id, phone_number_id, kind, status)
  values ('in', p_wa_message_id, p_phone_number_id, case when p_msg_type = 'text' then 'texto' else 'nao_suportado' end, 'recebida')
  on conflict (wa_message_id) do nothing
  returning id into v_msg;
  if v_msg is null then
    return jsonb_build_object('duplicate', true);
  end if;

  select id into v_profile from public.profiles
   where whatsapp_phone = any (p_variants) and whatsapp_approved and active and role in ('admin', 'editor', 'colaborador')
   limit 1;
  if v_profile is null then
    -- Número não autorizado: nada do conteúdo é guardado.
    update public.whatsapp_messages set status = 'nao_autorizada' where id = v_msg;
    return jsonb_build_object('duplicate', false, 'authorized', false, 'message_id', v_msg);
  end if;

  insert into public.whatsapp_contacts as c (wa_id, profile_id, last_inbound_at, window_expires_at)
  values (p_wa_id, v_profile, v_at, v_at + interval '24 hours')
  on conflict (wa_id) do update set
    profile_id = excluded.profile_id,
    last_inbound_at = greatest(coalesce(c.last_inbound_at, excluded.last_inbound_at), excluded.last_inbound_at),
    window_expires_at = greatest(coalesce(c.window_expires_at, excluded.window_expires_at), excluded.window_expires_at)
  returning * into v_contact;

  update public.whatsapp_messages set contact_id = v_contact.id, profile_id = v_profile, body_redacted = left(p_body, 4000)
   where id = v_msg;
  select count(*) into v_recent from public.questions where profile_id = v_profile and created_at > now() - interval '1 minute';

  return jsonb_build_object(
    'duplicate', false, 'authorized', true, 'message_id', v_msg, 'profile_id', v_profile,
    'contact_id', v_contact.id, 'window_expires_at', v_contact.window_expires_at,
    'pending_question_id', case when v_contact.pending_until > now() then v_contact.pending_question_id end,
    'last_help_sent_at', v_contact.last_help_sent_at, 'last_offline_notice_at', v_contact.last_offline_notice_at,
    'recent_questions', v_recent);
end $$;

create or replace function public.wa_update_inbound(p_message_id uuid, p_status text, p_error text default null) returns void
language sql security definer set search_path = public as $$
  update public.whatsapp_messages set status = p_status, error_message = left(p_error, 500) where id = p_message_id and direction = 'in'
$$;

create or replace function public.wa_create_question(
  p_profile_id uuid, p_contact_id uuid, p_text text, p_parent_question_id uuid, p_message_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_text text := public.redact_pii(left(btrim(p_text), 4000));
begin
  insert into public.questions (profile_id, channel, text_redacted, whatsapp_contact_id, parent_question_id, pii_redacted)
  values (p_profile_id, 'whatsapp', v_text, p_contact_id, p_parent_question_id, v_text <> btrim(p_text))
  returning id into v_id;
  update public.whatsapp_contacts set pending_question_id = null, pending_until = null where id = p_contact_id;
  update public.whatsapp_messages set status = 'enfileirada', question_id = v_id where id = p_message_id;
  return v_id;
end $$;

create or replace function public.wa_create_handoff(p_profile_id uuid, p_contact_id uuid, p_message_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_existing boolean := true;
  v_last_question uuid;
begin
  select id into v_id from public.handoff_requests
   where profile_id = p_profile_id and channel = 'whatsapp' and status <> 'resolvido' order by created_at desc limit 1;
  if v_id is null then
    v_existing := false;
    select id into v_last_question from public.questions
     where profile_id = p_profile_id and channel = 'whatsapp' and created_at > now() - interval '24 hours'
     order by created_at desc limit 1;
    insert into public.handoff_requests (profile_id, channel, whatsapp_contact_id, question_id)
    values (p_profile_id, 'whatsapp', p_contact_id, v_last_question) returning id into v_id;
  end if;
  update public.whatsapp_messages set status = 'comando', handoff_id = v_id where id = p_message_id;
  return jsonb_build_object('handoff_id', v_id, 'existing', v_existing);
end $$;

create or replace function public.wa_context() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'settings', public.setting('whatsapp'),
    'security', public.setting('security'),
    'worker_online', exists (
      select 1 from public.worker_heartbeats
       where status <> 'parando' and ollama_ok
         and last_seen_at > now() - make_interval(secs => coalesce((public.setting('worker') ->> 'offline_after_seconds')::int, 120))))
$$;

create or replace function public.wa_touch_contact(p_contact_id uuid, p_field text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_field = 'help' then
    update public.whatsapp_contacts set last_help_sent_at = now() where id = p_contact_id;
  elsif p_field = 'offline' then
    update public.whatsapp_contacts set last_offline_notice_at = now() where id = p_contact_id;
  end if;
end $$;

-- Mensagem de saída "pendente" antes do envio: garante no máximo uma resposta automática por pergunta.
create or replace function public.wa_prepare_outbound(
  p_contact_id uuid, p_profile_id uuid, p_kind text, p_body text, p_question_id uuid, p_handoff_id uuid, p_phone_number_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.whatsapp_messages (direction, phone_number_id, contact_id, profile_id, kind, body_redacted, status, question_id, handoff_id)
  values ('out', p_phone_number_id, p_contact_id, p_profile_id, p_kind, left(p_body, 4096), 'pendente_envio', p_question_id, p_handoff_id)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('duplicate', true); end if;
  return jsonb_build_object('duplicate', false, 'id', v_id);
end $$;

create or replace function public.wa_finish_outbound(
  p_id uuid, p_status text, p_wa_message_id text default null, p_error_code text default null,
  p_error_message text default null, p_usage_date date default null, p_attempts int default 1
) returns void
language sql security definer set search_path = public as $$
  update public.whatsapp_messages set
    status = p_status, wa_message_id = coalesce(p_wa_message_id, wa_message_id), error_code = p_error_code,
    error_message = left(p_error_message, 500), usage_date = coalesce(p_usage_date, usage_date), attempts = p_attempts,
    sent_at = case when p_status = 'enviada' then now() else sent_at end,
    failed_at = case when p_status = 'falhou' then now() else failed_at end
  where id = p_id and direction = 'out'
$$;

-- Dados para enviar a resposta de uma pergunta
create or replace function public.wa_answer_payload(p_question_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'question_id', q.id, 'channel', q.channel, 'status', q.status,
    'contact', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'wa_id', c.wa_id, 'profile_id', c.profile_id, 'window_expires_at', c.window_expires_at) end,
    'answer', case when a.id is null then null else jsonb_build_object(
      'outcome', a.outcome, 'content', a.content, 'warnings', to_jsonb(a.warnings)) end,
    'sources', coalesce((select jsonb_agg(jsonb_build_object('rank', s.rank, 'title', s.title, 'operator_name', s.operator_name,
        'page_from', s.page_from, 'page_to', s.page_to, 'valid_until', s.valid_until) order by s.rank)
      from public.answer_sources s where s.answer_id = a.id), '[]'::jsonb))
  from public.questions q
  left join public.whatsapp_contacts c on c.id = q.whatsapp_contact_id
  left join public.answers a on a.question_id = q.id
  where q.id = p_question_id
$$;

-- Respostas do WhatsApp ainda não entregues por falha transitória (para reenvio dentro da janela)
create or replace function public.wa_pending_answers(p_limit int default 20) returns setof uuid
language sql stable security definer set search_path = public as $$
  select q.id from public.questions q
    join public.answers a on a.question_id = q.id
    join public.whatsapp_contacts c on c.id = q.whatsapp_contact_id
   where q.channel = 'whatsapp' and q.answered_at > now() - interval '24 hours' and c.window_expires_at > now()
     and not exists (select 1 from public.whatsapp_messages m where m.question_id = q.id and m.direction = 'out' and m.kind = 'resposta'
                      and m.status in ('pendente_envio', 'enviada', 'entregue', 'lida', 'bloqueada_limite', 'janela_expirada', 'desativado'))
     and (select count(*) from public.whatsapp_messages m where m.question_id = q.id and m.direction = 'out' and m.status = 'falhou') < 3
   order by q.answered_at
   limit greatest(1, least(p_limit, 100))
$$;

create or replace function public.wa_handoff_target(p_handoff_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('handoff_id', h.id, 'status', h.status, 'profile_id', h.profile_id,
    'contact', case when c.id is null then null else jsonb_build_object(
      'id', c.id, 'wa_id', c.wa_id, 'profile_id', c.profile_id, 'window_expires_at', c.window_expires_at) end)
  from public.handoff_requests h left join public.whatsapp_contacts c on c.id = h.whatsapp_contact_id
  where h.id = p_handoff_id
$$;

create or replace function public.wa_log_event(
  p_signature_valid boolean, p_kind text, p_messages int, p_statuses int, p_outcome text, p_error text default null
) returns void
language sql security definer set search_path = public as $$
  insert into public.whatsapp_webhook_events (signature_valid, event_kind, messages_count, statuses_count, outcome, error)
  values (p_signature_valid, left(p_kind, 60), coalesce(p_messages, 0), coalesce(p_statuses, 0), left(p_outcome, 60), left(p_error, 500))
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'wa\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
