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
    execute format('alter table especialista.%I enable row level security', t);
    execute format('revoke all on especialista.%I from anon', t);
  end loop;
end $$;

-- roles ---------------------------------------------------------------
create policy roles_read on especialista.roles for select to authenticated using (especialista.is_active_user());

-- profiles ------------------------------------------------------------
create policy profiles_self_read on especialista.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_staff_read on especialista.profiles for select to authenticated
  using (especialista.has_role('admin', 'editor'));
create policy profiles_admin_update on especialista.profiles for update to authenticated
  using (especialista.has_role('admin')) with check (especialista.has_role('admin'));
create policy profiles_admin_delete on especialista.profiles for delete to authenticated
  using (especialista.has_role('admin') and id <> auth.uid());

-- catálogo ------------------------------------------------------------
create policy operators_read on especialista.operators for select to authenticated using (especialista.is_active_user());
create policy operators_write on especialista.operators for all to authenticated
  using (especialista.has_role('admin', 'editor')) with check (especialista.has_role('admin', 'editor'));
create policy products_read on especialista.products for select to authenticated using (especialista.is_active_user());
create policy products_write on especialista.products for all to authenticated
  using (especialista.has_role('admin', 'editor')) with check (especialista.has_role('admin', 'editor'));

-- documentos ------------------------------------------------------------
create policy documents_staff_read on especialista.knowledge_documents for select to authenticated
  using (especialista.has_role('admin', 'editor', 'worker'));
create policy documents_staff_insert on especialista.knowledge_documents for insert to authenticated
  with check (especialista.has_role('admin', 'editor'));
create policy documents_staff_update on especialista.knowledge_documents for update to authenticated
  using (especialista.has_role('admin', 'editor')) with check (especialista.has_role('admin', 'editor'));
create policy documents_admin_delete on especialista.knowledge_documents for delete to authenticated
  using (especialista.has_role('admin'));

create policy versions_staff_read on especialista.document_versions for select to authenticated
  using (especialista.has_role('admin', 'editor', 'worker'));
create policy versions_staff_insert on especialista.document_versions for insert to authenticated
  with check (especialista.has_role('admin', 'editor'));
create policy versions_staff_update on especialista.document_versions for update to authenticated
  using (especialista.has_role('admin', 'editor')) with check (especialista.has_role('admin', 'editor'));

create policy chunks_staff_read on especialista.document_chunks for select to authenticated
  using (especialista.has_role('admin', 'editor', 'worker'));
create policy chunks_worker_insert on especialista.document_chunks for insert to authenticated
  with check (especialista.has_role('worker'));
create policy chunks_worker_delete on especialista.document_chunks for delete to authenticated
  using (especialista.has_role('worker', 'admin'));

-- FAQ e regras ---------------------------------------------------------
create policy faq_staff_read on especialista.knowledge_faq for select to authenticated
  using (especialista.has_role('admin', 'editor', 'worker'));
create policy faq_staff_write on especialista.knowledge_faq for all to authenticated
  using (especialista.has_role('admin', 'editor')) with check (especialista.has_role('admin', 'editor'));

create policy rules_read on especialista.required_info_rules for select to authenticated
  using (especialista.has_role('admin', 'editor', 'worker'));
create policy rules_write on especialista.required_info_rules for all to authenticated
  using (especialista.has_role('admin', 'editor')) with check (especialista.has_role('admin', 'editor'));

create policy conflicts_staff_read on especialista.knowledge_conflicts for select to authenticated
  using (especialista.has_role('admin', 'editor'));
create policy conflicts_staff_update on especialista.knowledge_conflicts for update to authenticated
  using (especialista.has_role('admin', 'editor')) with check (especialista.has_role('admin', 'editor'));
create policy conflicts_staff_insert on especialista.knowledge_conflicts for insert to authenticated
  with check (especialista.has_role('admin', 'editor'));

-- perguntas e respostas -----------------------------------------------
create policy questions_own_read on especialista.questions for select to authenticated
  using (profile_id = auth.uid() and especialista.is_active_user());
create policy questions_staff_read on especialista.questions for select to authenticated
  using (especialista.has_role('admin', 'editor', 'worker'));

create policy answers_own_read on especialista.answers for select to authenticated
  using (especialista.is_active_user() and exists (
    select 1 from especialista.questions q where q.id = answers.question_id and q.profile_id = auth.uid()));
create policy answers_staff_read on especialista.answers for select to authenticated
  using (especialista.has_role('admin', 'editor', 'worker'));

create policy sources_own_read on especialista.answer_sources for select to authenticated
  using (especialista.is_active_user() and exists (
    select 1 from especialista.answers a join especialista.questions q on q.id = a.question_id
    where a.id = answer_sources.answer_id and q.profile_id = auth.uid()));
create policy sources_staff_read on especialista.answer_sources for select to authenticated
  using (especialista.has_role('admin', 'editor'));

create policy feedback_own_read on especialista.feedback for select to authenticated
  using (profile_id = auth.uid() and especialista.is_active_user());
create policy feedback_staff_read on especialista.feedback for select to authenticated
  using (especialista.has_role('admin', 'editor'));
create policy feedback_staff_update on especialista.feedback for update to authenticated
  using (especialista.has_role('admin', 'editor')) with check (especialista.has_role('admin', 'editor'));

create policy handoff_own_read on especialista.handoff_requests for select to authenticated
  using (profile_id = auth.uid() and especialista.is_active_user());
create policy handoff_staff_read on especialista.handoff_requests for select to authenticated
  using (especialista.has_role('admin', 'editor'));
create policy handoff_staff_update on especialista.handoff_requests for update to authenticated
  using (especialista.has_role('admin', 'editor')) with check (especialista.has_role('admin', 'editor'));

-- fila -----------------------------------------------------------------
create policy jobs_staff_read on especialista.processing_jobs for select to authenticated
  using (especialista.has_role('admin', 'editor', 'worker'));
create policy jobs_admin_update on especialista.processing_jobs for update to authenticated
  using (especialista.has_role('admin')) with check (especialista.has_role('admin'));

-- WhatsApp: leitura somente para administradores (escrita via service role nas Edge Functions)
create policy wa_contacts_admin_read on especialista.whatsapp_contacts for select to authenticated using (especialista.has_role('admin'));
create policy wa_messages_admin_read on especialista.whatsapp_messages for select to authenticated using (especialista.has_role('admin'));
create policy wa_usage_admin_read on especialista.whatsapp_usage for select to authenticated using (especialista.has_role('admin'));
create policy wa_events_admin_read on especialista.whatsapp_webhook_events for select to authenticated using (especialista.has_role('admin'));
create policy usage_alerts_admin_read on especialista.usage_alerts for select to authenticated using (especialista.has_role('admin'));
create policy usage_alerts_admin_update on especialista.usage_alerts for update to authenticated
  using (especialista.has_role('admin')) with check (especialista.has_role('admin'));

-- configurações ----------------------------------------------------------
create policy settings_public_read on especialista.system_settings for select to authenticated
  using (is_public and especialista.is_active_user());
create policy settings_staff_read on especialista.system_settings for select to authenticated
  using (especialista.has_role('admin', 'editor', 'worker'));
create policy settings_admin_write on especialista.system_settings for update to authenticated
  using (especialista.has_role('admin')) with check (especialista.has_role('admin'));

-- auditoria --------------------------------------------------------------
create policy audit_admin_read on especialista.audit_logs for select to authenticated using (especialista.has_role('admin'));

-- worker -----------------------------------------------------------------
create policy heartbeats_staff_read on especialista.worker_heartbeats for select to authenticated
  using (especialista.has_role('admin', 'editor', 'worker'));

-- ---------------------------------------------------------------------
-- Storage (bucket privado "knowledge")
-- ---------------------------------------------------------------------
create policy especialista_knowledge_files_read on storage.objects for select to authenticated
  using (bucket_id = 'especialista-conhecimento' and especialista.has_role('admin', 'editor', 'worker'));
create policy especialista_knowledge_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'especialista-conhecimento' and especialista.has_role('admin', 'editor'));
create policy especialista_knowledge_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'especialista-conhecimento' and especialista.has_role('admin'));
