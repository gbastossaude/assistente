-- =====================================================================
-- Especialista IA — base: schema próprio, extensões, papéis, perfis e funções auxiliares
-- =====================================================================
-- Tudo fica no schema "especialista" para conviver com outros sistemas no mesmo projeto Supabase
-- (ex.: tabelas em public/besmart). Exponha o schema em Settings → API → Exposed schemas.

create schema if not exists especialista;
grant usage on schema especialista to anon, authenticated, service_role;
alter default privileges in schema especialista grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema especialista grant usage, select on sequences to authenticated, service_role;

create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Configuração de busca textual em português sem acentos (usada nas colunas tsvector).
do $$
begin
  if not exists (select 1 from pg_ts_config where cfgname = 'pt_unaccent' and cfgnamespace = 'especialista'::regnamespace) then
    create text search configuration especialista.pt_unaccent (copy = pg_catalog.portuguese);
    alter text search configuration especialista.pt_unaccent
      alter mapping for hword, hword_part, word with extensions.unaccent, pg_catalog.portuguese_stem;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Papéis (Administrador, Editor, Colaborador e a conta de máquina do worker)
-- ---------------------------------------------------------------------
create table especialista.roles (
  code text primary key check (code in ('admin', 'editor', 'colaborador', 'worker')),
  name text not null,
  description text not null default '',
  permissions jsonb not null default '{}'::jsonb
);

insert into especialista.roles (code, name, description, permissions) values
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
create table especialista.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'colaborador' references especialista.roles (code),
  active boolean not null default false,
  whatsapp_phone text unique check (whatsapp_phone is null or whatsapp_phone ~ '^[0-9]{12,15}$'),
  whatsapp_approved boolean not null default false,
  whatsapp_approved_at timestamptz,
  whatsapp_approved_by uuid references especialista.profiles (id) on delete set null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_approval_requires_phone check (not whatsapp_approved or whatsapp_phone is not null)
);
create index profiles_role_idx on especialista.profiles (role) where active;

-- updated_at automático
create or replace function especialista.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated_at before update on especialista.profiles
  for each row execute function especialista.set_updated_at();

-- Novo usuário do Auth → perfil, SOMENTE para contas criadas pelo Especialista IA (app_metadata.especialista_role).
-- O projeto pode ser compartilhado com outros sistemas: usuários deles são ignorados, e qualquer falha aqui
-- é absorvida para nunca impedir a criação de contas de outro sistema.
create or replace function especialista.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = especialista as $$
declare
  v_role text := new.raw_app_meta_data ->> 'especialista_role';
begin
  if v_role is null then
    return new;
  end if;
  if v_role not in ('admin', 'editor', 'colaborador', 'worker') then
    v_role := 'colaborador';
  end if;
  insert into especialista.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    v_role,
    coalesce((new.raw_app_meta_data ->> 'especialista_active')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'especialista.handle_new_auth_user: %', sqlerrm;
  return new;
end $$;

create trigger especialista_on_auth_user_created after insert on auth.users
  for each row execute function especialista.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Funções de autorização (SECURITY DEFINER para evitar recursão de RLS)
-- ---------------------------------------------------------------------
create or replace function especialista.current_app_role() returns text
language sql stable security definer set search_path = especialista as $$
  select p.role from especialista.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function especialista.has_role(variadic p_roles text[]) returns boolean
language sql stable security definer set search_path = especialista as $$
  select coalesce(especialista.current_app_role() = any (p_roles), false)
$$;

create or replace function especialista.is_active_user() returns boolean
language sql stable security definer set search_path = especialista as $$
  select especialista.current_app_role() is not null
$$;

-- Promove o primeiro administrador. Só funciona enquanto não existir nenhum administrador ativo.
-- Uso (SQL Editor do Supabase): select especialista.promote_first_admin('voce@empresa.com.br');
create or replace function especialista.promote_first_admin(p_email text) returns text
language plpgsql security definer set search_path = especialista as $$
declare
  v_id uuid;
begin
  if exists (select 1 from especialista.profiles where role = 'admin' and active) then
    raise exception 'Já existe um administrador ativo. Use o painel para gerenciar papéis.';
  end if;
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'Usuário % não encontrado em Authentication → Users.', p_email;
  end if;
  insert into especialista.profiles (id, email, full_name, role, active)
  values (v_id, p_email, split_part(p_email, '@', 1), 'admin', true)
  on conflict (id) do update set role = 'admin', active = true;
  return 'Administrador definido: ' || p_email;
end $$;

revoke all on function especialista.promote_first_admin(text) from public, anon, authenticated;

-- O Auth (GoTrue) pode gravar o app_metadata após o INSERT. Cria/sincroniza o perfil quando
-- app_metadata.especialista_role/especialista_active muda (só o servidor, com service role, altera app_metadata).
create or replace function especialista.handle_auth_user_metadata() returns trigger
language plpgsql security definer set search_path = especialista as $$
declare
  v_role text := new.raw_app_meta_data ->> 'especialista_role';
begin
  if (new.raw_app_meta_data -> 'especialista_role') is distinct from (old.raw_app_meta_data -> 'especialista_role')
     or (new.raw_app_meta_data -> 'especialista_active') is distinct from (old.raw_app_meta_data -> 'especialista_active') then
    if v_role in ('admin', 'editor', 'colaborador', 'worker') then
      insert into especialista.profiles (id, email, full_name, role, active)
      values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
              v_role, coalesce((new.raw_app_meta_data ->> 'especialista_active')::boolean, false))
      on conflict (id) do update set
        role = excluded.role,
        active = coalesce((new.raw_app_meta_data ->> 'especialista_active')::boolean, especialista.profiles.active);
    end if;
  end if;
  if new.email is distinct from old.email then
    update especialista.profiles set email = new.email where id = new.id;
  end if;
  return new;
exception when others then
  raise warning 'especialista.handle_auth_user_metadata: %', sqlerrm;
  return new;
end $$;

create trigger especialista_on_auth_user_updated after update on auth.users
  for each row execute function especialista.handle_auth_user_metadata();

-- Localiza uma conta já existente no Auth (projeto compartilhado). Somente service_role (Edge Function admin-users).
create or replace function especialista.find_auth_user_by_email(p_email text) returns uuid
language sql stable security definer set search_path = especialista as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;
revoke all on function especialista.find_auth_user_by_email(text) from public, anon, authenticated;
grant execute on function especialista.find_auth_user_by_email(text) to service_role;
