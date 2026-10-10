-- Auditoría de seguridad (2026-10-10): cierra superficie anónima que ya no se usa.
-- No modifica datos existentes; solo permisos y una regla para filas nuevas.

-- 1. Tabla del HTML original: el juego actual no escribe en ella y no recibe filas desde el 3 de octubre.
--    Se retira el INSERT anónimo y la política queda neutralizada (se conserva para auditoría).
--    (La tabla solo existe en la base que venía del HTML original.)
do $$
begin
  if to_regclass('public.radiografia_respuestas') is not null then
    revoke insert on public.radiografia_respuestas from anon;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'radiografia_respuestas' and policyname = 'legacy_insert_only') then
      alter policy legacy_insert_only on public.radiografia_respuestas to anon with check (false);
    end if;
  end if;
end $$;

-- 2. Encuesta y juego son instrumentos independientes (decisión del 10/10/2026, 06:22 UTC):
--    la API deja de aceptar códigos de encuesta. set_survey_code ya no se puede invocar y las
--    sesiones nuevas se guardan siempre sin código ni intención de encuesta (solo al insertar:
--    las filas existentes no se tocan).
revoke execute on function public.set_survey_code(uuid, text, text) from anon, authenticated, public;

create or replace function public.tg_sin_codigo_encuesta()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.survey_code := null;
  new.survey_intent := null;
  new.survey_code_at := null;
  return new;
end $$;
revoke execute on function public.tg_sin_codigo_encuesta() from anon, authenticated, public;

create trigger sin_codigo_encuesta
  before insert on public.participant_sessions
  for each row execute function public.tg_sin_codigo_encuesta();

-- 3. Vistas del panel: solo lectura. (security_invoker ya impedía escribir; esto quita los privilegios sobrantes.)
revoke all on public.v_sessions, public.v_decisions, public.v_open_responses, public.v_share_decisions, public.v_share_sessions
  from authenticated, anon, public;
grant select on public.v_sessions, public.v_decisions, public.v_open_responses, public.v_share_decisions, public.v_share_sessions
  to authenticated;
