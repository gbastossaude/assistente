-- =====================================================================
-- Base de conhecimento: documentos, versões, trechos (RAG), FAQ oficial,
-- informações obrigatórias e conflitos
-- =====================================================================

-- A dimensão (1024) corresponde ao modelo de embeddings padrão bge-m3.
-- Para trocar de modelo/dimensão use scripts/sql/alterar-dimensao-embeddings.sql e reindexe.

create table especialista.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 300),
  description text,
  operator_id uuid references especialista.operators (id) on delete restrict,
  product_id uuid references especialista.products (id) on delete set null,
  administrator_id uuid references especialista.operators (id) on delete set null,
  category text not null default 'outros' check (category in (
    'manual_comercial', 'tabela_precos', 'regras_elegibilidade', 'carencias', 'rede_credenciada', 'documentacao',
    'reajuste', 'movimentacao', 'comissionamento', 'comunicado', 'contrato', 'regulatorio', 'procedimento_interno', 'outros')),
  rule_nature text not null default 'regra_contratacao'
    check (rule_nature in ('regra_contratacao', 'procedimento_interno', 'condicao_negociada', 'regulatorio')),
  contract_types text[] not null default '{}'
    check (contract_types <@ array['pme', 'empresarial', 'mei', 'adesao', 'individual', 'familiar', 'senior']),
  is_national boolean not null default false,
  states text[] not null default '{}',
  cities text[] not null default '{}',
  lives_min integer check (lives_min is null or lives_min >= 1),
  lives_max integer check (lives_max is null or lives_max >= 1),
  published_at date,
  valid_from date,
  valid_until date,
  version_label text,
  priority smallint not null default 0 check (priority between -10 and 10),
  status text not null default 'rascunho' check (status in ('rascunho', 'processando', 'revisao', 'ativo', 'inativo', 'erro')),
  current_version_id uuid,
  replaced_by_document_id uuid references especialista.knowledge_documents (id) on delete set null,
  deactivated_at timestamptz,
  deactivated_by uuid references especialista.profiles (id) on delete set null,
  deactivation_reason text,
  created_by uuid references especialista.profiles (id) on delete set null,
  updated_by uuid references especialista.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lives_range check (lives_min is null or lives_max is null or lives_min <= lives_max),
  constraint validity_range check (valid_from is null or valid_until is null or valid_until >= valid_from),
  constraint national_without_states check (not is_national or cardinality(states) = 0),
  constraint states_are_ufs check (states <@ array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
    'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])
);
create index knowledge_documents_operator_idx on especialista.knowledge_documents (operator_id, status);
create index knowledge_documents_valid_until_idx on especialista.knowledge_documents (valid_until) where status = 'ativo';
create trigger knowledge_documents_updated_at before update on especialista.knowledge_documents
  for each row execute function especialista.set_updated_at();

create table especialista.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references especialista.knowledge_documents (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  version_label text,
  change_notes text,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'enviado'
    check (status in ('enviado', 'processando', 'indexado', 'revisao', 'erro', 'substituido', 'descartado')),
  page_count integer,
  char_count integer,
  chunk_count integer,
  quality jsonb not null default '{}'::jsonb,
  needs_review boolean not null default false,
  review_reason text,
  ocr_used boolean not null default false,
  ocr_requested boolean not null default false,
  reviewed_by uuid references especialista.profiles (id) on delete set null,
  reviewed_at timestamptz,
  error_message text,
  embedding_model text,
  uploaded_by uuid references especialista.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (document_id, version_number),
  unique (document_id, sha256)
);
create index document_versions_status_idx on especialista.document_versions (status);

alter table especialista.knowledge_documents
  add constraint knowledge_documents_current_version_fk
  foreign key (current_version_id) references especialista.document_versions (id) on delete set null;

create table especialista.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references especialista.knowledge_documents (id) on delete cascade,
  version_id uuid not null references especialista.document_versions (id) on delete cascade,
  chunk_index integer not null,
  page_from integer,
  page_to integer,
  section text,
  content text not null check (length(content) > 0),
  content_tsv tsvector generated always as (to_tsvector('especialista.pt_unaccent'::regconfig, content)) stored,
  embedding extensions.vector(1024),
  embedding_model text not null,
  token_estimate integer,
  created_at timestamptz not null default now(),
  unique (version_id, chunk_index)
);
create index document_chunks_document_idx on especialista.document_chunks (document_id);
create index document_chunks_tsv_idx on especialista.document_chunks using gin (content_tsv);
create index document_chunks_embedding_idx on especialista.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- FAQ oficial (respostas aprovadas por editores; também participam da busca)
create table especialista.knowledge_faq (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(trim(question)) between 5 and 1000),
  answer text not null check (length(trim(answer)) between 2 and 6000),
  operator_id uuid references especialista.operators (id) on delete cascade,
  product_id uuid references especialista.products (id) on delete set null,
  topic text,
  contract_types text[] not null default '{}',
  states text[] not null default '{}',
  lives_min integer,
  lives_max integer,
  valid_until date,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'arquivado')),
  rule_nature text not null default 'regra_contratacao'
    check (rule_nature in ('regra_contratacao', 'procedimento_interno', 'condicao_negociada', 'regulatorio')),
  source_document_id uuid references especialista.knowledge_documents (id) on delete set null,
  source_note text,
  priority smallint not null default 0 check (priority between -10 and 10),
  origin_question_id uuid,
  embedding extensions.vector(1024),
  embedding_model text,
  content_tsv tsvector generated always as (
    to_tsvector('especialista.pt_unaccent'::regconfig, coalesce(question, '') || ' ' || coalesce(answer, ''))) stored,
  created_by uuid references especialista.profiles (id) on delete set null,
  approved_by uuid references especialista.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_faq_tsv_idx on especialista.knowledge_faq using gin (content_tsv);
create index knowledge_faq_embedding_idx on especialista.knowledge_faq using hnsw (embedding extensions.vector_cosine_ops);
create trigger knowledge_faq_updated_at before update on especialista.knowledge_faq
  for each row execute function especialista.set_updated_at();

-- Informações obrigatórias: antes de responder, o motor pede os campos faltantes.
create table especialista.required_info_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  topic text,
  operator_id uuid references especialista.operators (id) on delete cascade,
  required_fields text[] not null check (
    cardinality(required_fields) > 0
    and required_fields <@ array['operadora', 'produto', 'uf', 'cidade', 'modalidade', 'vidas', 'tempo_cnpj']),
  message text,
  active boolean not null default true,
  created_by uuid references especialista.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger required_info_rules_updated_at before update on especialista.required_info_rules
  for each row execute function especialista.set_updated_at();

-- Padrões editáveis (configuração do sistema, não regras comerciais).
insert into especialista.required_info_rules (name, topic, required_fields, message) values
  ('Rede credenciada depende de operadora e região', 'rede', array['operadora', 'uf'],
    'Para consultar rede credenciada preciso da operadora e do estado (UF).'),
  ('Elegibilidade depende da operadora', 'elegibilidade', array['operadora'],
    'Qual operadora você quer consultar?'),
  ('Quantidade de vidas depende da operadora', 'vidas', array['operadora'],
    'Qual operadora você quer consultar?'),
  ('MEI/CNPJ depende da operadora', 'mei_cnpj', array['operadora'],
    'Qual operadora você quer consultar?');

-- Conflitos entre regras: registrados para o administrador decidir (o sistema não conclui sozinho).
create table especialista.knowledge_conflicts (
  id uuid primary key default gen_random_uuid(),
  document_a_id uuid references especialista.knowledge_documents (id) on delete cascade,
  document_b_id uuid references especialista.knowledge_documents (id) on delete cascade,
  question_id uuid,
  source text not null check (source in ('cadastro', 'resposta', 'manual')),
  description text not null,
  status text not null default 'aberto' check (status in ('aberto', 'resolvido', 'descartado')),
  resolution text,
  resolved_by uuid references especialista.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index knowledge_conflicts_open_pair_idx on especialista.knowledge_conflicts (
  least(document_a_id, document_b_id), greatest(document_a_id, document_b_id)
) where status = 'aberto' and document_a_id is not null and document_b_id is not null;

-- ---------------------------------------------------------------------
-- Storage: bucket privado para os arquivos originais
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('especialista-conhecimento', 'especialista-conhecimento', false, 52428800, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain', 'text/markdown'])
on conflict (id) do nothing;
