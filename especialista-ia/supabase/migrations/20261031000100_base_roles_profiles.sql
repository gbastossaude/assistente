-- =====================================================================
-- Especialista IA — base: extensões, papéis, perfis e funções auxiliares
-- =====================================================================

create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Configuração de busca textual em português sem acentos (usada nas colunas tsvector).
do $$
begin
  if not exists (select 1 from pg_ts_config where cfgname = 'pt_unaccent') then
    create text search configuration public.pt_unaccent (copy = pg_catalog.portuguese);
    alter text search configuration public.pt_unaccent
      alter mapping for hword, hword_part, word with extensions.unaccent, pg_catalog.portuguese_stem;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Papéis (Administrador, Editor, Colaborador e a conta de máquina do worker)
-- ---------------------------------------------------------------------
create table public.roles (
  code text primary key check (code in ('admin', 'editor', 'colaborador', 'worker')),
  name text not null,
  description text not null default '',
  permissions jsonb not null default '{}'::jsonb
);

insert into public.roles (code, name, description, permissions) values
  ('admin', 'Administrador', 'Acesso total: usuários, configurações, custos, auditoria e base de conhecimento.',
    '{"usuarios": true, "configuracoes": true, "documentos": true, "faq": true, "perguntas": true, "auditoria": true, "whatsapp": true, "consultar": true}'),
  ('editor', 'Editor', 'Mantém a base de conhecimento, FAQs e regras; acompanha perguntas e feedback.',
    '{"documentos": true, "faq": true, "perguntas": true, "consultar": true, "whatsapp": false}'),
  ('colaborador', 'Colaborador', 'Consulta o especialista pela extensão, pelo painel ou pelo WhatsApp autorizado.',
    '{"consultar": true}'),
  ('worker', 'Worker local', 'Conta de máquina do computador que executa o Ollama: processa a fila e indexa documentos.',
    '{"fila": true, "indexacao": true}');

-- ---------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'colaborador' references public.roles (code),
  active boolean not null default false,
  whatsapp_phone text unique check (whatsapp_phone is null or whatsapp_phone ~ '^[0-9]{12,15}$'),
  whatsapp_approved boolean not null default false,
  whatsapp_approved_at timestamptz,
  whatsapp_approved_by uuid references public.profiles (id) on delete set null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_approval_requires_phone check (not whatsapp_approved or whatsapp_phone is not null)
);
create index profiles_role_idx on public.profiles (role) where active;

-- updated_at automático
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Novo usuário do Auth → perfil. Papel e ativação vêm SOMENTE de app_metadata (definido pelo
-- administrador via Edge Function com service role); cadastro público nasce inativo e sem privilégio.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_app_meta_data ->> 'role', 'colaborador');
begin
  if v_role not in ('admin', 'editor', 'colaborador', 'worker') then
    v_role := 'colaborador';
  end if;
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    v_role,
    coalesce((new.raw_app_meta_data ->> 'active')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Funções de autorização (SECURITY DEFINER para evitar recursão de RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function public.has_role(variadic p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = any (p_roles), false)
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role() is not null
$$;

-- Promove o primeiro administrador. Só funciona enquanto não existir nenhum administrador ativo.
-- Uso (SQL Editor do Supabase): select public.promote_first_admin('voce@empresa.com.br');
create or replace function public.promote_first_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.profiles where role = 'admin' and active) then
    raise exception 'Já existe um administrador ativo. Use o painel para gerenciar papéis.';
  end if;
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'Usuário % não encontrado em Authentication → Users.', p_email;
  end if;
  insert into public.profiles (id, email, full_name, role, active)
  values (v_id, p_email, split_part(p_email, '@', 1), 'admin', true)
  on conflict (id) do update set role = 'admin', active = true;
  return 'Administrador definido: ' || p_email;
end $$;

revoke all on function public.promote_first_admin(text) from public, anon, authenticated;

-- O Auth (GoTrue) pode gravar o app_metadata após o INSERT. Sincroniza papel/ativação quando o
-- app_metadata é alterado (somente o servidor, com service role, consegue alterar app_metadata).
create or replace function public.handle_auth_user_metadata() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if (new.raw_app_meta_data -> 'role') is distinct from (old.raw_app_meta_data -> 'role')
     or (new.raw_app_meta_data -> 'active') is distinct from (old.raw_app_meta_data -> 'active') then
    update public.profiles set
      role = case when v_role in ('admin', 'editor', 'colaborador', 'worker') then v_role else role end,
      active = coalesce((new.raw_app_meta_data ->> 'active')::boolean, active)
    where id = new.id;
  end if;
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_updated after update on auth.users
  for each row execute function public.handle_auth_user_metadata();
