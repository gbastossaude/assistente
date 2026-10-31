-- =====================================================================
-- Row Level Security — todas as tabelas expostas pela API exigem política
-- =====================================================================
-- Princípios:
--  * colaborador: vê apenas as próprias perguntas/respostas/feedback; não lê documentos nem trechos.
--  * editor: mantém a base de conhecimento e acompanha perguntas; não gerencia usuários nem custos.
--  * admin: tudo.
--  * worker (conta de máquina): somente o necessário para indexar e responder.
--  * anon: nada.
--  Escritas sensíveis (enviar pergunta, reservar envio, concluir tarefa) passam por funções RPC.

do $$
declare
  t text;
begin
  foreach t in array array[
    'roles', 'profiles', 'operators', 'products', 'knowledge_documents', 'document_versions', 'document_chunks',
    'knowledge_faq', 'required_info_rules', 'knowledge_conflicts', 'questions', 'answers', 'answer_sources',
    'feedback', 'handoff_requests', 'processing_jobs', 'whatsapp_contacts', 'whatsapp_messages', 'whatsapp_usage',
    'whatsapp_webhook_events', 'usage_alerts', 'system_settings', 'audit_logs', 'worker_heartbeats'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- roles ---------------------------------------------------------------
create policy roles_read on public.roles for select to authenticated using (public.is_active_user());

-- profiles ------------------------------------------------------------
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_staff_read on public.profiles for select to authenticated
  using (public.has_role('admin', 'editor'));
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
create policy profiles_admin_delete on public.profiles for delete to authenticated
  using (public.has_role('admin') and id <> auth.uid());

-- catálogo ------------------------------------------------------------
create policy operators_read on public.operators for select to authenticated using (public.is_active_user());
create policy operators_write on public.operators for all to authenticated
  using (public.has_role('admin', 'editor')) with check (public.has_role('admin', 'editor'));
create policy products_read on public.products for select to authenticated using (public.is_active_user());
create policy products_write on public.products for all to authenticated
  using (public.has_role('admin', 'editor')) with check (public.has_role('admin', 'editor'));

-- documentos ------------------------------------------------------------
create policy documents_staff_read on public.knowledge_documents for select to authenticated
  using (public.has_role('admin', 'editor', 'worker'));
create policy documents_staff_insert on public.knowledge_documents for insert to authenticated
  with check (public.has_role('admin', 'editor'));
create policy documents_staff_update on public.knowledge_documents for update to authenticated
  using (public.has_role('admin', 'editor')) with check (public.has_role('admin', 'editor'));
create policy documents_admin_delete on public.knowledge_documents for delete to authenticated
  using (public.has_role('admin'));

create policy versions_staff_read on public.document_versions for select to authenticated
  using (public.has_role('admin', 'editor', 'worker'));
create policy versions_staff_insert on public.document_versions for insert to authenticated
  with check (public.has_role('admin', 'editor'));
create policy versions_staff_update on public.document_versions for update to authenticated
  using (public.has_role('admin', 'editor')) with check (public.has_role('admin', 'editor'));

create policy chunks_staff_read on public.document_chunks for select to authenticated
  using (public.has_role('admin', 'editor', 'worker'));
create policy chunks_worker_insert on public.document_chunks for insert to authenticated
  with check (public.has_role('worker'));
create policy chunks_worker_delete on public.document_chunks for delete to authenticated
  using (public.has_role('worker', 'admin'));

-- FAQ e regras ---------------------------------------------------------
create policy faq_staff_read on public.knowledge_faq for select to authenticated
  using (public.has_role('admin', 'editor', 'worker'));
create policy faq_staff_write on public.knowledge_faq for all to authenticated
  using (public.has_role('admin', 'editor')) with check (public.has_role('admin', 'editor'));

create policy rules_read on public.required_info_rules for select to authenticated
  using (public.has_role('admin', 'editor', 'worker'));
create policy rules_write on public.required_info_rules for all to authenticated
  using (public.has_role('admin', 'editor')) with check (public.has_role('admin', 'editor'));

create policy conflicts_staff_read on public.knowledge_conflicts for select to authenticated
  using (public.has_role('admin', 'editor'));
create policy conflicts_staff_update on public.knowledge_conflicts for update to authenticated
  using (public.has_role('admin', 'editor')) with check (public.has_role('admin', 'editor'));
create policy conflicts_staff_insert on public.knowledge_conflicts for insert to authenticated
  with check (public.has_role('admin', 'editor'));

-- perguntas e respostas -----------------------------------------------
create policy questions_own_read on public.questions for select to authenticated
  using (profile_id = auth.uid() and public.is_active_user());
create policy questions_staff_read on public.questions for select to authenticated
  using (public.has_role('admin', 'editor', 'worker'));

create policy answers_own_read on public.answers for select to authenticated
  using (public.is_active_user() and exists (
    select 1 from public.questions q where q.id = answers.question_id and q.profile_id = auth.uid()));
create policy answers_staff_read on public.answers for select to authenticated
  using (public.has_role('admin', 'editor', 'worker'));

create policy sources_own_read on public.answer_sources for select to authenticated
  using (public.is_active_user() and exists (
    select 1 from public.answers a join public.questions q on q.id = a.question_id
    where a.id = answer_sources.answer_id and q.profile_id = auth.uid()));
create policy sources_staff_read on public.answer_sources for select to authenticated
  using (public.has_role('admin', 'editor'));

create policy feedback_own_read on public.feedback for select to authenticated
  using (profile_id = auth.uid() and public.is_active_user());
create policy feedback_staff_read on public.feedback for select to authenticated
  using (public.has_role('admin', 'editor'));
create policy feedback_staff_update on public.feedback for update to authenticated
  using (public.has_role('admin', 'editor')) with check (public.has_role('admin', 'editor'));

create policy handoff_own_read on public.handoff_requests for select to authenticated
  using (profile_id = auth.uid() and public.is_active_user());
create policy handoff_staff_read on public.handoff_requests for select to authenticated
  using (public.has_role('admin', 'editor'));
create policy handoff_staff_update on public.handoff_requests for update to authenticated
  using (public.has_role('admin', 'editor')) with check (public.has_role('admin', 'editor'));

-- fila -----------------------------------------------------------------
create policy jobs_staff_read on public.processing_jobs for select to authenticated
  using (public.has_role('admin', 'editor', 'worker'));
create policy jobs_admin_update on public.processing_jobs for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- WhatsApp: leitura somente para administradores (escrita via service role nas Edge Functions)
create policy wa_contacts_admin_read on public.whatsapp_contacts for select to authenticated using (public.has_role('admin'));
create policy wa_messages_admin_read on public.whatsapp_messages for select to authenticated using (public.has_role('admin'));
create policy wa_usage_admin_read on public.whatsapp_usage for select to authenticated using (public.has_role('admin'));
create policy wa_events_admin_read on public.whatsapp_webhook_events for select to authenticated using (public.has_role('admin'));
create policy usage_alerts_admin_read on public.usage_alerts for select to authenticated using (public.has_role('admin'));
create policy usage_alerts_admin_update on public.usage_alerts for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- configurações ----------------------------------------------------------
create policy settings_public_read on public.system_settings for select to authenticated
  using (is_public and public.is_active_user());
create policy settings_staff_read on public.system_settings for select to authenticated
  using (public.has_role('admin', 'editor', 'worker'));
create policy settings_admin_write on public.system_settings for update to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- auditoria --------------------------------------------------------------
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.has_role('admin'));

-- worker -----------------------------------------------------------------
create policy heartbeats_staff_read on public.worker_heartbeats for select to authenticated
  using (public.has_role('admin', 'editor', 'worker'));

-- ---------------------------------------------------------------------
-- Storage (bucket privado "knowledge")
-- ---------------------------------------------------------------------
create policy knowledge_files_read on storage.objects for select to authenticated
  using (bucket_id = 'knowledge' and public.has_role('admin', 'editor', 'worker'));
create policy knowledge_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'knowledge' and public.has_role('admin', 'editor'));
create policy knowledge_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'knowledge' and public.has_role('admin'));
