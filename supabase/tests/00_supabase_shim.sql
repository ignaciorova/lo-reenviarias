-- Simulación mínima del entorno Supabase para probar migraciones y RLS en un PostgreSQL local.
-- NO se aplica en producción.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;
create schema if not exists extensions;
create schema if not exists auth;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
create table if not exists auth.users (id uuid primary key, email text unique, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase concede privilegios por defecto en public; los revocamos explícitamente en las migraciones.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Rol de conexión de PostgREST (solo entorno local)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'local-only' noinherit;
  end if;
end $$;
grant anon, authenticated to authenticator;
