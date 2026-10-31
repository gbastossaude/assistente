-- =====================================================================
-- Perguntas, respostas, fontes, feedback e fila de processamento
-- =====================================================================

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  channel text not null check (channel in ('extension', 'whatsapp', 'admin')),
  -- Texto já minimizado (identificadores pessoais removidos antes de gravar).
  text_redacted text not null check (length(text_redacted) between 1 and 4000),
  context jsonb not null default '{}'::jsonb,
  detected jsonb not null default '{}'::jsonb,
  topic text,
  operator_id uuid references public.operators (id) on delete set null,
  status text not null default 'pendente' check (status in (
    'pendente', 'processando', 'respondida', 'sem_fonte', 'precisa_info', 'conflito', 'recusada', 'erro', 'expirada')),
  pii_redacted boolean not null default false,
  injection_flag boolean not null default false,
  is_favorite boolean not null default false,
  parent_question_id uuid references public.questions (id) on delete set null,
  whatsapp_contact_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  answered_at timestamptz,
  latency_ms integer
);
create index questions_profile_idx on public.questions (profile_id, created_at desc);
create index questions_status_idx on public.questions (status, created_at desc);
create index questions_created_idx on public.questions (created_at desc);

alter table public.knowledge_faq
  add constraint knowledge_faq_origin_question_fk
  foreign key (origin_question_id) references public.questions (id) on delete set null;
alter table public.knowledge_conflicts
  add constraint knowledge_conflicts_question_fk
  foreign key (question_id) references public.questions (id) on delete set null;

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.questions (id) on delete cascade,
  outcome text not null check (outcome in ('respondida', 'sem_fonte', 'precisa_info', 'conflito', 'recusada', 'erro')),
  content text not null,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  warnings text[] not null default '{}',
  missing_fields text[] not null default '{}',
  provider text,
  model text,
  retrieval_ms integer,
  generation_ms integer,
  total_ms integer,
  created_at timestamptz not null default now()
);
create index answers_outcome_idx on public.answers (outcome, created_at desc);

create table public.answer_sources (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers (id) on delete cascade,
  rank smallint not null,
  document_id uuid references public.knowledge_documents (id) on delete set null,
  version_id uuid references public.document_versions (id) on delete set null,
  chunk_id bigint references public.document_chunks (id) on delete set null,
  faq_id uuid references public.knowledge_faq (id) on delete set null,
  title text not null,
  operator_name text,
  page_from integer,
  page_to integer,
  excerpt text,
  score numeric,
  valid_until date,
  rule_nature text,
  created_at timestamptz not null default now()
);
create index answer_sources_answer_idx on public.answer_sources (answer_id, rank);
create index answer_sources_document_idx on public.answer_sources (document_id);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.answers (id) on delete cascade,
  question_id uuid references public.questions (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  rating text not null check (rating in ('util', 'incorreta')),
  comment text check (comment is null or length(comment) <= 1000),
  status text not null default 'novo' check (status in ('novo', 'analisado', 'faq_criada', 'descartado')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (answer_id, profile_id)
);
create index feedback_rating_idx on public.feedback (rating, status, created_at desc);

-- Solicitações de atendimento humano ("Falar com responsável")
create table public.handoff_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  channel text not null check (channel in ('extension', 'whatsapp', 'admin')),
  question_id uuid references public.questions (id) on delete set null,
  whatsapp_contact_id uuid,
  note text check (note is null or length(note) <= 1000),
  status text not null default 'aberto' check (status in ('aberto', 'em_atendimento', 'resolvido')),
  assigned_to uuid references public.profiles (id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index handoff_requests_status_idx on public.handoff_requests (status, created_at desc);
create trigger handoff_requests_updated_at before update on public.handoff_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Fila de processamento (consumida pelo worker local)
-- ---------------------------------------------------------------------
create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('answer_question', 'index_document', 'index_faq')),
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'concluido', 'falhou', 'cancelado', 'expirado')),
  priority smallint not null default 0,
  question_id uuid references public.questions (id) on delete cascade,
  document_version_id uuid references public.document_versions (id) on delete cascade,
  faq_id uuid references public.knowledge_faq (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  attempts smallint not null default 0,
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  expires_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint job_target check (
    (type = 'answer_question' and question_id is not null)
    or (type = 'index_document' and document_version_id is not null)
    or (type = 'index_faq' and faq_id is not null))
);
-- Uma única tarefa de resposta por pergunta (idempotência)
create unique index processing_jobs_one_per_question on public.processing_jobs (question_id)
  where type = 'answer_question';
create unique index processing_jobs_one_active_per_version on public.processing_jobs (document_version_id)
  where type = 'index_document' and status in ('pendente', 'processando');
create unique index processing_jobs_one_active_per_faq on public.processing_jobs (faq_id)
  where type = 'index_faq' and status in ('pendente', 'processando');
create index processing_jobs_queue_idx on public.processing_jobs (status, priority desc, available_at)
  where status in ('pendente', 'processando');
create trigger processing_jobs_updated_at before update on public.processing_jobs
  for each row execute function public.set_updated_at();
