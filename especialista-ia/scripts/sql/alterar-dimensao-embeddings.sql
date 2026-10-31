-- Troca a dimensão dos vetores (ex.: de bge-m3 = 1024 para nomic-embed-text = 768).
-- 1) Ajuste "embedding_model" e "embedding_dimensions" em Configurações → IA.
-- 2) Substitua 768 abaixo pela nova dimensão e execute no SQL Editor do Supabase.
-- 3) Reindexe os documentos (Documentos → Reindexar) e republique as FAQs.
-- Os trechos antigos são apagados porque vetores de modelos diferentes não são comparáveis.
begin;
drop index if exists especialista.document_chunks_embedding_idx;
drop index if exists especialista.knowledge_faq_embedding_idx;
delete from especialista.document_chunks;
update especialista.knowledge_faq set embedding = null, embedding_model = null;
alter table especialista.document_chunks alter column embedding type extensions.vector(768);
alter table especialista.knowledge_faq alter column embedding type extensions.vector(768);
create index document_chunks_embedding_idx on especialista.document_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index knowledge_faq_embedding_idx on especialista.knowledge_faq using hnsw (embedding extensions.vector_cosine_ops);
-- Reenfileira todas as versões vigentes para indexação.
insert into especialista.processing_jobs (type, document_version_id, payload)
select 'index_document', current_version_id, '{"reindex": true}'::jsonb
  from especialista.knowledge_documents where current_version_id is not null
on conflict do nothing;
update especialista.knowledge_faq set status = status where status = 'publicado';
commit;
