-- Reversión de 20261011000300_seguridad_cierre_superficie.sql
-- Restaura exactamente los permisos que había en producción el 10/10/2026 a las 16:20 UTC
-- (capturados antes de aplicar; ver security/reversion/estado-previo.md). No toca datos.

-- 1. Tabla del HTML original
do $$
begin
  if to_regclass('public.radiografia_respuestas') is not null then
    grant insert on public.radiografia_respuestas to anon;
    alter policy legacy_insert_only on public.radiografia_respuestas to anon with check (true);
  end if;
end $$;

-- 2. Códigos de encuesta
grant execute on function public.set_survey_code(uuid, text, text) to anon, authenticated;
drop trigger if exists sin_codigo_encuesta on public.participant_sessions;
drop function if exists public.tg_sin_codigo_encuesta();

-- 3. Vistas del panel (estado previo: authenticated con todos los privilegios)
grant all on public.v_sessions, public.v_decisions, public.v_open_responses, public.v_share_decisions, public.v_share_sessions
  to authenticated;
