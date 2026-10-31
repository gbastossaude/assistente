-- =====================================================================
-- Catálogo: operadoras, seguradoras, administradoras e produtos
-- =====================================================================

create table public.operators (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  kind text not null default 'operadora' check (kind in ('operadora', 'seguradora', 'administradora')),
  ans_registry text,
  aliases text[] not null default '{}',
  website text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger operators_updated_at before update on public.operators
  for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.operators (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 160),
  aliases text[] not null default '{}',
  contract_types text[] not null default '{}',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operator_id, name)
);
create index products_operator_idx on public.products (operator_id);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- Operadoras iniciais previstas pela corretora. Somente nomes e apelidos para reconhecimento na
-- pergunta — nenhuma regra comercial é cadastrada aqui. Ajuste o tipo/registro ANS no painel.
-- "Assim" e "Leve" não entram como apelidos isolados porque são palavras comuns em português.
insert into public.operators (name, slug, kind, aliases) values
  ('Bradesco Saúde', 'bradesco-saude', 'seguradora', array['Bradesco', 'Bradesco Saude']),
  ('SulAmérica', 'sulamerica', 'seguradora', array['Sul America', 'SulAmerica', 'Sulamérica']),
  ('Amil', 'amil', 'operadora', array['Amil Saúde', 'Amil Saude']),
  ('Klini Saúde', 'klini-saude', 'operadora', array['Klini']),
  ('Assim Saúde', 'assim-saude', 'operadora', array['Assim Saude']),
  ('MedSênior', 'medsenior', 'operadora', array['MedSenior', 'Med Senior', 'Med Sênior']),
  ('Leve Saúde', 'leve-saude', 'operadora', array['Leve Saude']),
  ('Alice', 'alice', 'operadora', array['Alice Saúde', 'Alice Saude']),
  ('Sami', 'sami', 'operadora', array['Sami Saúde', 'Sami Saude']),
  ('Transmontano', 'transmontano', 'operadora', array['Transmontano Saúde']);
