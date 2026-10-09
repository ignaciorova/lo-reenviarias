-- ============================================================================
-- PENDIENTE DE APLICAR EN EL PROYECTO REMOTO (9/10/2026)
-- Estas dos funciones forman parte de la migración 0004 y ya están en el repositorio,
-- pero el conector de Supabase pide confirmación humana para cualquier SQL que contenga
-- DELETE y esa confirmación no está disponible en una sesión no interactiva.
--
-- Cómo aplicarlas: Supabase → SQL Editor → pegar este archivo completo → Run.
-- Efecto: habilita «quitar código» en Preguntas abiertas y la depuración de datos
-- (purge_sessions). Ambas exigen rol (analyst / owner) y quedan auditadas.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================
create or replace function public.remove_response_code(p_response_id bigint, p_code text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.response_codes where survey_response_id = p_response_id and code = p_code;
  perform public._audit('remove_response_code', 'survey_response', p_response_id::text, jsonb_build_object('code', p_code));
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

revoke all on function public.remove_response_code(bigint, text) from public, anon;
grant execute on function public.remove_response_code(bigint, text) to authenticated;
revoke all on function public.purge_sessions(text, int) from public, anon;
grant execute on function public.purge_sessions(text, int) to authenticated;
