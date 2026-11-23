-- Test-only stand-in for the parts of a hosted Supabase database that the
-- migrations depend on. Never deployed: it lives outside supabase/migrations.
--
-- Mirrors Supabase closely enough to test RLS: the anon / authenticated roles,
-- auth.users, auth.uid() reading the JWT claims, and Supabase's default grants
-- of new public tables to anon and authenticated (which the migrations revoke).

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;

create table auth.users (
  id    uuid primary key,
  email text
);

-- Same logic as Supabase's auth.uid().
create function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase's defaults for objects created in public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
