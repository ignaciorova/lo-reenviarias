-- ============================================================================
-- 0004: seguridad (RLS), roles administrativos, vistas analíticas y API admin
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Autorización
-- ---------------------------------------------------------------------------
create or replace function public.admin_role_rank(p_role text)
returns int language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 3 when 'analyst' then 2 when 'viewer' then 1 else 0 end
$$;

create or replace function public.is_admin(p_min_role text default 'viewer')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_profiles a
     where a.user_id = (select auth.uid()) and a.active
       and public.admin_role_rank(a.role) >= public.admin_role_rank(p_min_role)
  )
$$;
revoke all on function public.is_admin(text) from public, anon;
grant execute on function public.is_admin(text) to authenticated;

create or replace function public.my_admin_profile()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', a.user_id, 'role', a.role, 'display_name', a.display_name)
    from public.admin_profiles a where a.user_id = (select auth.uid()) and a.active
$$;
revoke all on function public.my_admin_profile() from public, anon;
grant execute on function public.my_admin_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS en todas las tablas. Ningún privilegio para anon.
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['studies','news_items','survey_questions','participant_sessions','survey_responses',
                           'hint_events','game_decisions','game_sessions_summary','admin_profiles',
                           'audit_events','response_codes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Lectura solo para administradores activos
do $$ declare t text; begin
  foreach t in array array['studies','news_items','survey_questions','participant_sessions','survey_responses',
                           'hint_events','game_decisions','game_sessions_summary','response_codes'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'admin_read') then
      execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_admin(''viewer'')))', t);
    end if;
  end loop;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_events' and policyname = 'admin_read') then
    create policy admin_read on public.audit_events for select to authenticated
      using ((select public.is_admin('analyst')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_profiles' and policyname = 'admin_read') then
    create policy admin_read on public.admin_profiles for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin('owner')));
  end if;
end $$;

-- Las escrituras administrativas se hacen solo vía funciones auditadas (sin políticas INSERT/UPDATE/DELETE).

-- ---------------------------------------------------------------------------
-- Vistas analíticas (security_invoker: respetan RLS del usuario que consulta)
-- ---------------------------------------------------------------------------
create or replace view public.v_sessions with (security_invoker = true) as
select
  s.id                         as session_id,
  st.code                      as study_code,
  s.instrument_version,
  s.origin,
  s.status,
  s.is_test,
  s.exclusion_reason,
  (s.status = 'completed' and not s.is_test and s.exclusion_reason is null
     and coalesce(g.decisions_count, 0) = coalesce(nullif(cardinality(s.presentation_order), 0), 10)) as is_valid,
  case
    when s.is_test then 'prueba'
    when s.exclusion_reason is not null then 'excluida'
    when s.status = 'completed' then 'completada'
    when s.status = 'abandoned' or s.started_at < now() - interval '24 hours' then 'abandonada'
    else 'en_curso'
  end                          as status_effective,
  s.started_at,
  s.completed_at,
  s.duration_seconds,
  s.device_class,
  s.reduced_motion,
  s.consent_accepted,
  (select r.text_value   from public.survey_responses r join public.survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'opinion')         as opinion,
  (select r.option_value from public.survey_responses r join public.survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'verifica')        as verifica,
  (select r.option_value from public.survey_responses r join public.survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'compartio_falso') as compartio_falso,
  (select r.option_value from public.survey_responses r join public.survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'responsable')     as responsable,
  (select r.option_value from public.survey_responses r join public.survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'post_cambio')     as post_cambio,
  coalesce(g.decisions_count, (select count(*) from public.game_decisions d where d.session_id = s.id))::int as decisions_count,
  g.correct_count, g.error_count, g.timeout_count, g.score, g.hints_used,
  g.fake_total, g.fake_accepted_count, g.real_total, g.real_rejected_count,
  g.simulated_reach_total
from public.participant_sessions s
join public.studies st on st.id = s.study_id
left join public.game_sessions_summary g on g.session_id = s.id;

create or replace view public.v_decisions with (security_invoker = true) as
select
  d.id                 as decision_id,
  d.session_id,
  s.instrument_version,
  s.origin,
  s.status             as session_status,
  s.is_test,
  s.exclusion_reason,
  n.item_key,
  n.category,
  n.headline,
  n.validation_status,
  d.position,
  d.choice,
  d.correct_classification,
  d.is_correct,
  d.timed_out,
  d.hint_used,
  d.response_ms,
  d.points_awarded,
  d.streak_after,
  d.simulated_reach,
  d.created_at
from public.game_decisions d
join public.participant_sessions s on s.id = d.session_id
join public.news_items n on n.id = d.news_item_id;

create or replace view public.v_open_responses with (security_invoker = true) as
select r.id as response_id, r.session_id, q.question_key, r.text_value, r.created_at,
       s.instrument_version, s.status, s.is_test,
       coalesce((select array_agg(c.code order by c.code) from public.response_codes c where c.survey_response_id = r.id), '{}') as codes
from public.survey_responses r
join public.survey_questions q on q.id = r.question_id
join public.participant_sessions s on s.id = r.session_id
where q.kind = 'open';

revoke all on public.v_sessions, public.v_decisions, public.v_open_responses from anon, public;
grant select on public.v_sessions, public.v_decisions, public.v_open_responses to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------------
create or replace function public._audit(p_action text, p_target_type text, p_target_id text, p_details jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.audit_events (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function public._audit(text, text, text, jsonb) from public, anon, authenticated;

-- Registrar exportaciones (llamado por el panel)
create or replace function public.log_export(p_details jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('viewer') then raise exception 'forbidden' using errcode = '42501'; end if;
  if octet_length(coalesce(p_details, '{}'::jsonb)::text) > 4000 then raise exception 'payload_too_large'; end if;
  perform public._audit('export', 'dataset', p_details ->> 'dataset', p_details);
end $$;

-- ---------------------------------------------------------------------------
-- Gestión de administradores (solo owner)
-- ---------------------------------------------------------------------------
create or replace function public.grant_admin(p_email text, p_role text, p_display_name text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if not public.is_admin('owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('owner','analyst','viewer') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email));
  if v_uid is null then raise exception 'user_not_found: la persona debe crear su cuenta primero' using errcode = 'P0002'; end if;
  insert into public.admin_profiles (user_id, role, display_name, active, created_by)
  values (v_uid, p_role, p_display_name, true, auth.uid())
  on conflict (user_id) do update set role = excluded.role, active = true,
    display_name = coalesce(excluded.display_name, public.admin_profiles.display_name);
  perform public._audit('grant_admin', 'admin_profile', v_uid::text, jsonb_build_object('role', p_role));
  return jsonb_build_object('user_id', v_uid, 'role', p_role);
end $$;

create or replace function public.revoke_admin(p_user_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_revoke_self' using errcode = '22023'; end if;
  update public.admin_profiles set active = false where user_id = p_user_id;
  perform public._audit('revoke_admin', 'admin_profile', p_user_id::text, '{}'::jsonb);
end $$;

create or replace function public.list_admins()
returns table (user_id uuid, email text, role text, display_name text, active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin('owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select a.user_id, u.email::text, a.role, a.display_name, a.active, a.created_at
    from public.admin_profiles a join auth.users u on u.id = a.user_id order by a.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- Control de calidad (analyst+)
-- ---------------------------------------------------------------------------
create or replace function public.set_session_flags(p_session_id uuid, p_is_test boolean, p_exclusion_reason text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.participant_sessions
     set is_test = coalesce(p_is_test, is_test),
         exclusion_reason = nullif(btrim(p_exclusion_reason), '')
   where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  perform public._audit('set_session_flags', 'session', p_session_id::text,
    jsonb_build_object('is_test', p_is_test, 'exclusion_reason', p_exclusion_reason));
end $$;

create or replace function public.add_response_code(p_response_id bigint, p_code text, p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.response_codes (survey_response_id, code, note, coded_by)
  values (p_response_id, btrim(p_code), p_note, auth.uid())
  on conflict (survey_response_id, code) do nothing;
  perform public._audit('add_response_code', 'survey_response', p_response_id::text, jsonb_build_object('code', p_code));
end $$;

create or replace function public.remove_response_code(p_response_id bigint, p_code text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.response_codes where survey_response_id = p_response_id and code = p_code;
  perform public._audit('remove_response_code', 'survey_response', p_response_id::text, jsonb_build_object('code', p_code));
end $$;

-- ---------------------------------------------------------------------------
-- Conservación de datos (owner). Ver docs/privacidad-y-conservacion.md
-- ---------------------------------------------------------------------------
create or replace function public.mark_abandoned_sessions(p_older_than_hours int default 24)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v int;
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.participant_sessions set status = 'abandoned'
   where status = 'started' and started_at < now() - make_interval(hours => greatest(p_older_than_hours, 1));
  get diagnostics v = row_count;
  perform public._audit('mark_abandoned', 'session', null, jsonb_build_object('rows', v, 'hours', p_older_than_hours));
  return v;
end $$;

create or replace function public.purge_sessions(p_scope text, p_older_than_days int)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v int;
begin
  if not public.is_admin('owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_older_than_days < 1 then raise exception 'invalid_days' using errcode = '22023'; end if;
  if p_scope = 'test' then
    delete from public.participant_sessions where is_test and started_at < now() - make_interval(days => p_older_than_days);
  elsif p_scope = 'incomplete' then
    delete from public.participant_sessions where status <> 'completed' and started_at < now() - make_interval(days => p_older_than_days);
  else
    raise exception 'invalid_scope' using errcode = '22023';
  end if;
  get diagnostics v = row_count;
  perform public._audit('purge_sessions', 'session', null, jsonb_build_object('scope', p_scope, 'days', p_older_than_days, 'rows', v));
  return v;
end $$;

do $$ declare f text; begin
  foreach f in array array['log_export(jsonb)','grant_admin(text,text,text)','revoke_admin(uuid)','list_admins()',
                           'set_session_flags(uuid,boolean,text)','add_response_code(bigint,text,text)',
                           'remove_response_code(bigint,text)','mark_abandoned_sessions(int)','purge_sessions(text,int)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
