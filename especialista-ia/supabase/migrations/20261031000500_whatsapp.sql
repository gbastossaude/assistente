-- =====================================================================
-- WhatsApp Business Cloud API (oficial): contatos, mensagens e consumo
-- =====================================================================

create table public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null unique check (wa_id ~ '^[0-9]{8,15}$'),
  profile_id uuid references public.profiles (id) on delete set null,
  last_inbound_at timestamptz,
  -- Fim da janela de atendimento de 24 h aberta pela última mensagem do colaborador
  window_expires_at timestamptz,
  pending_question_id uuid references public.questions (id) on delete set null,
  pending_until timestamptz,
  last_help_sent_at timestamptz,
  last_offline_notice_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger whatsapp_contacts_updated_at before update on public.whatsapp_contacts
  for each row execute function public.set_updated_at();

alter table public.questions
  add constraint questions_whatsapp_contact_fk
  foreign key (whatsapp_contact_id) references public.whatsapp_contacts (id) on delete set null;
alter table public.handoff_requests
  add constraint handoff_whatsapp_contact_fk
  foreign key (whatsapp_contact_id) references public.whatsapp_contacts (id) on delete set null;

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in', 'out')),
  -- wamid da Meta: chave de idempotência para reentregas do webhook
  wa_message_id text unique,
  phone_number_id text,
  contact_id uuid references public.whatsapp_contacts (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'texto' check (kind in (
    'texto', 'nao_suportado', 'resposta', 'ajuda', 'confirmacao', 'pedido_info', 'encaminhamento', 'humano',
    'aviso_offline', 'aviso_limite')),
  body_redacted text,
  status text not null check (status in (
    'recebida', 'ignorada', 'nao_autorizada', 'duplicada', 'enfileirada', 'comando',
    'pendente_envio', 'enviada', 'entregue', 'lida', 'falhou', 'bloqueada_limite', 'janela_expirada', 'desativado')),
  question_id uuid references public.questions (id) on delete set null,
  handoff_id uuid references public.handoff_requests (id) on delete set null,
  attempts smallint not null default 0,
  error_code text,
  error_message text,
  pricing_category text,
  billable boolean,
  usage_date date,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
);
create index whatsapp_messages_contact_idx on public.whatsapp_messages (contact_id, created_at desc);
create index whatsapp_messages_status_idx on public.whatsapp_messages (direction, status, created_at desc);
-- No máximo uma resposta automática enviada por pergunta (impede duplicidade em retentativas do worker)
create unique index whatsapp_messages_one_answer_per_question on public.whatsapp_messages (question_id)
  where direction = 'out' and kind = 'resposta' and status in ('pendente_envio', 'enviada', 'entregue', 'lida');

-- Consumo diário por número (o mensal é a soma). "reserved" conta toda tentativa autorizada pelo teto.
create table public.whatsapp_usage (
  phone_number_id text not null,
  usage_date date not null,
  reserved integer not null default 0 check (reserved >= 0),
  sent integer not null default 0 check (sent >= 0),
  delivered integer not null default 0 check (delivered >= 0),
  failed integer not null default 0 check (failed >= 0),
  blocked integer not null default 0 check (blocked >= 0),
  updated_at timestamptz not null default now(),
  primary key (phone_number_id, usage_date)
);

-- Eventos do webhook (apenas metadados, sem conteúdo das mensagens)
create table public.whatsapp_webhook_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  signature_valid boolean not null,
  event_kind text,
  messages_count integer not null default 0,
  statuses_count integer not null default 0,
  outcome text,
  error text
);
create index whatsapp_webhook_events_received_idx on public.whatsapp_webhook_events (received_at desc);

-- Alertas de consumo já emitidos (um por limiar por mês)
create table public.usage_alerts (
  id uuid primary key default gen_random_uuid(),
  phone_number_id text not null,
  period_month date not null,
  threshold numeric not null,
  count_at_alert integer not null,
  cap integer not null,
  created_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles (id) on delete set null,
  acknowledged_at timestamptz,
  unique (phone_number_id, period_month, threshold)
);
