-- ============================================================================
-- Pruebas de integridad del estudio (migración 20261011000400).
-- Se ejecuta después de 10_ a 40_ sobre la misma base local (la 4.0.0 ya está activa).
-- ============================================================================
\set ON_ERROR_STOP 1
truncate tst.results;

-- Las sesiones creadas antes en esta base empezaron hace segundos: se mueven 10 minutos atrás para que
-- el techo y la ráfaga de esta prueba no dependan de cuánto tardaron las pruebas anteriores.
update public.participant_sessions set started_at = started_at - interval '10 minutes';

-- Parámetros de prueba que dependen del instrumento (solo en esta base local)
update public.studies set config = config || '{"public_stats_min_n": 1, "percentile_min_n": 1}' where status = 'active';

create temp table ig (k text primary key, v uuid);
grant select on ig to anon, authenticated;
insert into ig values ('rapida', gen_random_uuid()), ('humana', gen_random_uuid()), ('constante', gen_random_uuid()), ('lenta_agotada', gen_random_uuid());

-- Juega una partida completa por la API pública, a la velocidad de la máquina (sin cerrarla)
create or replace function tst.play_v4(p_sid uuid, p_timeout boolean default false) returns void language plpgsql as $$
declare p jsonb; i int;
begin
  p := public.start_session_v4(p_sid, true, 'mobile', false, 'qr_juego');
  perform public.submit_survey(p_sid, 'pre', '{"primera_vez":"Sí, es la primera vez"}');
  for i in 1..jsonb_array_length(p -> 'items') loop
    if p_timeout then
      perform public.submit_card(p_sid, i, '{"first_action":null,"first_action_ms":20000}');
    else
      perform public.submit_card(p_sid, i, jsonb_build_object('first_action', case when i % 2 = 0 then 'reenviar' else 'no_reenviar' end,
                                                             'first_action_ms', 3000, 'belief', case when i % 3 = 0 then 'no_se' else 'si' end));
    end if;
  end loop;
end $$;
grant execute on function tst.play_v4(uuid, boolean) to anon;

-- Hora del servidor simulada (solo superusuario en la prueba): decisiones separadas por los segundos dados
create or replace function tst.pace(p_sid uuid, p_gaps numeric[]) returns void language plpgsql as $$
declare t0 timestamptz := now() - make_interval(secs => (select sum(g) from unnest(p_gaps) g) + 30);
begin
  update public.participant_sessions set game_started_at = t0 where id = p_sid;
  update public.share_decisions d set created_at = t0 + make_interval(secs => (select sum(g) from unnest(p_gaps[1:d.position]) g))
   where d.session_id = p_sid;
end $$;

create temp table lb_before as select count(*) as n from public.leaderboard_entries;

-- ---------------------------------------------------------------------------
-- 1. Partida guiada por un script: señales, sin ranking, fuera de estadísticas y del análisis
-- ---------------------------------------------------------------------------
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select tst.play_v4((select v from ig where k = 'rapida'));
create temp table s_rapida as select public.complete_session_v4((select v from ig where k = 'rapida')) as s;
reset role;
grant select on s_rapida to anon;
select tst.ok((select automation_signals @> array['partida_rapida','decisiones_rapidas'] from public.session_integrity where session_id = (select v from ig where k = 'rapida')),
              'partida a velocidad de máquina: partida_rapida y decisiones_rapidas');
select tst.ok((select (s ->> 'score')::int = 600 + (select sum(points) from public.share_decisions where session_id = (select v from ig where k = 'rapida')) from s_rapida),
              'las señales no cambian el puntaje que ve la persona');
select tst.ok((select s ? 'percentile' and s ? 'recap' from s_rapida), 'el resumen final se entrega igual');
set role anon;
select tst.ok((public.leaderboard_status((select v from ig where k = 'rapida')) ->> 'eligible')::boolean = false
              and (public.leaderboard_status((select v from ig where k = 'rapida')) ->> 'can_join')::boolean = false, 'leaderboard_status: no elegible, no puede entrar');
select tst.ok((public.join_leaderboard((select v from ig where k = 'rapida'), 1, 1, 1) ->> 'eligible')::boolean = false, 'join_leaderboard responde eligible = false, sin error');
select tst.ok(public.join_leaderboard((select v from ig where k = 'rapida'), 1, 1, 1)::text not like '%automat%', 'la respuesta es neutra (no menciona señales)');
reset role;
select tst.ok((select count(*) from public.leaderboard_entries) = (select n from lb_before), 'no se agregó ninguna entrada al ranking');
select tst.ok(not (select leaderboard_joined from public.participant_sessions where id = (select v from ig where k = 'rapida')), 'la sesión no queda marcada como en el ranking');
select tst.ok((select not is_valid and automation_flagged from public.v_share_sessions where session_id = (select v from ig where k = 'rapida')), 'v_share_sessions: fuera de la muestra válida y marcada');
select tst.ok((select not is_valid and automation_flagged and automation_signals @> array['decisiones_rapidas'] from public.v_sessions where session_id = (select v from ig where k = 'rapida')), 'v_sessions: fuera de la muestra válida, con las señales');
select tst.ok((select count(*) from public.share_decisions where session_id = (select v from ig where k = 'rapida')) = 10, 'las filas se conservan');

-- ---------------------------------------------------------------------------
-- 2. Partida a ritmo humano: sin señales y entra al ranking
-- ---------------------------------------------------------------------------
set role anon;
select tst.play_v4((select v from ig where k = 'humana'));
reset role;
select tst.pace((select v from ig where k = 'humana'), array[6.2, 4.1, 9.8, 3.3, 12.5, 5.0, 7.7, 2.9, 8.4, 4.6]);
set role anon;
create temp table s_humana as select public.complete_session_v4((select v from ig where k = 'humana')) as s;
reset role;
select tst.ok((select automation_signals = '{}' from public.session_integrity where session_id = (select v from ig where k = 'humana')), 'ritmo humano: sin señales');
select tst.ok((select is_valid and not automation_flagged from public.v_share_sessions where session_id = (select v from ig where k = 'humana')), 'ritmo humano: válida para análisis');
set role anon;
select tst.ok((public.leaderboard_status((select v from ig where k = 'humana')) ->> 'can_join')::boolean, 'ritmo humano: puede entrar al ranking');
select tst.ok((public.join_leaderboard((select v from ig where k = 'humana'), 2, 2, 2) ->> 'alias') is not null, 'ritmo humano: entra al ranking');
reset role;

-- Una persona muy rápida pero humana (≈ 1,6 s por tarjeta, sin leer) no se marca
insert into ig values ('veloz', gen_random_uuid());
set role anon;
select tst.play_v4((select v from ig where k = 'veloz'));
reset role;
select tst.pace((select v from ig where k = 'veloz'), array[2.4, 1.5, 1.9, 1.3, 1.7, 2.2, 1.4, 1.6, 2.0, 1.5]);
set role anon;
select public.complete_session_v4((select v from ig where k = 'veloz'));
reset role;
select tst.ok((select automation_signals = '{}' from public.session_integrity where session_id = (select v from ig where k = 'veloz')), 'jugadora muy rápida (17,5 s en total): sin señales');

-- Todas las tarjetas con tiempo agotado (20 s cada una): intervalos casi iguales pero no es un script
set role anon;
select tst.play_v4((select v from ig where k = 'lenta_agotada'), true);
reset role;
select tst.pace((select v from ig where k = 'lenta_agotada'), array[21.5, 21.6, 21.4, 21.5, 21.5, 21.6, 21.5, 21.4, 21.5, 21.5]);
set role anon;
select public.complete_session_v4((select v from ig where k = 'lenta_agotada'));
reset role;
select tst.ok((select automation_signals = '{}' from public.session_integrity where session_id = (select v from ig where k = 'lenta_agotada')), 'tiempo agotado en todas: el ritmo constante no se evalúa');

-- ---------------------------------------------------------------------------
-- 3. Ritmo constante (script con pausas fijas de 5 s)
-- ---------------------------------------------------------------------------
set role anon;
select tst.play_v4((select v from ig where k = 'constante'));
reset role;
select tst.pace((select v from ig where k = 'constante'), array[5.0, 5.02, 4.98, 5.01, 5.0, 4.99, 5.03, 5.0, 4.97, 5.01]);
set role anon;
select public.complete_session_v4((select v from ig where k = 'constante'));
reset role;
select tst.ok((select automation_signals = array['ritmo_constante'] from public.session_integrity where session_id = (select v from ig where k = 'constante')), 'pausas fijas: solo ritmo_constante');
select tst.ok((select automation_flagged from public.v_share_sessions where session_id = (select v from ig where k = 'constante')), 'ritmo constante: fuera del ranking y del análisis');

-- ---------------------------------------------------------------------------
-- 4. Estadísticas públicas y percentil sin las partidas marcadas; revisión humana
-- ---------------------------------------------------------------------------
create temp table st0 as select
  (public.public_stats() ->> 'n')::int as n_public,
  (public.complete_session_v4((select v from ig where k = 'humana')) ->> 'percentile_n')::int as n_pct,
  (select count(*) from public.game_sessions_summary g join public.participant_sessions s on s.id = g.session_id
     where s.study_id = (select id from public.studies where status = 'active') and s.status = 'completed' and not s.is_test and s.exclusion_reason is null
       and not exists (select 1 from public.session_integrity i where i.session_id = s.id and i.automation_signals && array['partida_rapida','decisiones_rapidas','ritmo_constante']))::int as n_expected;
select tst.ok((select n_public = n_expected from st0), 'public_stats cuenta solo partidas sin señales', (select format('%s vs %s', n_public, n_expected) from st0));
select tst.ok((select n_pct = n_expected - 1 from st0), 'el percentil se compara solo con partidas sin señales');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select tst.ok(tst.err($$select public.review_automation((select v from ig where k = 'rapida'), true, 'x')$$) like '%forbidden%', 'viewer no revisa señales');
select tst.ok(tst.err($$select public.recompute_automation_signals()$$) like '%forbidden%', 'viewer no recalcula señales');
select tst.ok((select count(*) from public.session_integrity) > 0, 'viewer ve las señales (no son datos personales)');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select public.review_automation((select v from ig where k = 'rapida'), true, 'Revisada en clase: jugó una estudiante en el proyector');
reset role;
select tst.ok((select is_valid and not automation_flagged and automation_review = 'humana' from public.v_share_sessions where session_id = (select v from ig where k = 'rapida')), 'revisión «humana»: vuelve a la muestra válida');
select tst.ok((public.public_stats() ->> 'n')::int = (select n_public + 1 from st0), 'revisión «humana»: vuelve a contar en public_stats');
select tst.ok((select count(*) from public.audit_events where action = 'review_automation' and actor_id = '00000000-0000-4000-8000-000000000004' and target_id = (select v::text from ig where k = 'rapida')) = 1, 'la revisión queda auditada');
set role anon;
select tst.ok((public.leaderboard_status((select v from ig where k = 'rapida')) ->> 'can_join')::boolean, 'revisión «humana»: puede entrar al ranking');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select public.review_automation((select v from ig where k = 'rapida'), false);
reset role;
select tst.ok((select automation_flagged from public.v_share_sessions where session_id = (select v from ig where k = 'rapida')), 'quitar la revisión restablece la exclusión');

-- Recalcular: solo escribe en session_integrity; no toca sesiones, decisiones ni puntajes
create temp table fp as select
  (select md5(string_agg(md5(x::text), '' order by md5(x::text))) from public.participant_sessions x) as ps,
  (select md5(string_agg(md5(x::text), '' order by md5(x::text))) from public.share_decisions x) as sd,
  (select md5(string_agg(md5(x::text), '' order by md5(x::text))) from public.game_sessions_summary x) as gs;
delete from public.session_integrity where session_id = (select v from ig where k = 'constante');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
create temp table rc as select public.recompute_automation_signals() as r;
reset role;
select tst.ok((select (r ->> 'sessions')::int >= 5 and (r ->> 'with_signals')::int >= 2 from rc), 'recalcular recorre las sesiones 4.x terminadas', (select r::text from rc));
select tst.ok((select automation_signals = array['ritmo_constante'] from public.session_integrity where session_id = (select v from ig where k = 'constante')), 'recalcular reconstruye las señales');
select tst.ok((select ps = (select md5(string_agg(md5(x::text), '' order by md5(x::text))) from public.participant_sessions x)
                  and sd = (select md5(string_agg(md5(x::text), '' order by md5(x::text))) from public.share_decisions x)
                  and gs = (select md5(string_agg(md5(x::text), '' order by md5(x::text))) from public.game_sessions_summary x) from fp), 'recalcular no cambia sesiones, decisiones ni puntajes');
select tst.ok((select count(*) from public.audit_events where action = 'recompute_automation_signals') = 1, 'recalcular queda auditado');

-- ---------------------------------------------------------------------------
-- 5. Techo técnico y ráfaga (ajustes en platform_settings, solo owner)
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select tst.ok(tst.err($$select * from public.get_platform_settings()$$) like '%forbidden%', 'analyst no lee los ajustes técnicos');
select tst.ok(tst.err($$select public.set_platform_setting('burst_sessions_per_minute', 10)$$) like '%forbidden%', 'analyst no cambia los ajustes técnicos');
select tst.ok(tst.err($$select * from public.platform_settings$$) like '%permission denied%', 'nadie lee platform_settings directamente');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select tst.ok((select count(*) from public.get_platform_settings()) = 7, 'owner ve los 7 ajustes');
select tst.ok((select value from public.get_platform_settings() where key = 'sessions_per_minute_ceiling') = 600, 'techo por defecto: 600 por minuto');
select tst.ok(tst.err($$select public.set_platform_setting('sessions_per_minute_ceiling', 5)$$) like '%valor_fuera_de_rango%', 'se valida el rango');
select tst.ok(tst.err($$select public.set_platform_setting('max_ip', 5)$$) like '%ajuste_desconocido%', 'solo ajustes conocidos');
select public.set_platform_setting('sessions_per_minute_ceiling', 60);
select public.set_platform_setting('burst_sessions_per_minute', 10);
reset role;
select tst.ok((select count(*) from public.audit_events where action = 'set_platform_setting') = 2, 'los cambios de ajustes quedan auditados');
select tst.ok((select details = '{"old": 600, "new": 60}'::jsonb from public.audit_events where action = 'set_platform_setting' and target_id = 'sessions_per_minute_ceiling'), 'la auditoría guarda valor anterior y nuevo');

-- Las sesiones de esta prueba quedan fuera del minuto en curso
update public.participant_sessions set started_at = started_at - interval '10 minutes';
create temp table burst (n int, sid uuid, err text);
grant insert, select on burst to anon;
set role anon;
do $$ declare i int; v uuid; begin
  for i in 1..61 loop
    v := gen_random_uuid();
    insert into burst values (i, v, tst.err(format('select public.start_session_v4(%L, true)', v)));
  end loop;
end $$;
reset role;
select tst.ok((select count(*) from burst where err is null) = 60 and (select err from burst where n = 61) like '%rate_limited%', 'el techo técnico rechaza solo por encima de 60/min (ajustado)');
select tst.ok((select count(*) from burst b join public.session_integrity i on i.session_id = b.sid where 'rafaga' = any(i.automation_signals)) = 50, 'desde la sesión 11 en el mismo minuto: señal «rafaga»');
select tst.ok((select bool_and(not automation_flagged) from public.v_share_sessions where session_id in (select sid from burst)), 'la ráfaga sola no excluye a nadie');
-- Con los valores por defecto, 120 estudiantes de una clase entran a la vez sin rechazo
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.set_platform_setting('sessions_per_minute_ceiling', 600);
select public.set_platform_setting('burst_sessions_per_minute', 120);
reset role;
update public.participant_sessions set is_test = true where id in (select sid from burst);
update public.participant_sessions set started_at = started_at - interval '10 minutes' where id in (select sid from burst);
set role anon;
create temp table clase as select g, tst.err(format('select public.start_session_v4(%L, true)', gen_random_uuid())) as err from generate_series(1, 150) g;
reset role;
select tst.ok((select count(*) from clase where err is null) = 150, '150 sesiones en un minuto con la configuración por defecto: ninguna rechazada');

-- ---------------------------------------------------------------------------
-- 6. Exportaciones: solo analyst y owner, auditadas por el servidor
-- ---------------------------------------------------------------------------
set role anon;
select tst.ok(tst.err($$select public.export_dataset('v4_sesiones', '{}')$$) like '%permission denied%', 'anon no exporta');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
select tst.ok(tst.err($$select public.export_dataset('v4_sesiones', '{}')$$) like '%forbidden%', 'cuenta sin rol no exporta');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select tst.ok(tst.err($$select public.export_dataset('v4_sesiones', '{}')$$) like '%forbidden%', 'viewer no exporta (v4)');
select tst.ok(tst.err($$select public.export_dataset('abiertas', '{}')$$) like '%forbidden%', 'viewer no exporta respuestas abiertas');
select tst.ok(not has_function_privilege('authenticated', 'public.log_export(jsonb)', 'execute'), 'log_export ya no es invocable por authenticated');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select tst.ok(tst.err($$select public.export_dataset('participant_sessions', '{}')$$) like '%dataset_invalido%', 'solo conjuntos de la lista');
select tst.ok(tst.err($$select public.export_dataset('v4_sesiones', '{"sql":"x"}')$$) like '%filtro_desconocido%', 'filtros desconocidos rechazados');
select tst.ok(tst.err($$select public.export_dataset('v4_sesiones', '{"session_ids":["no-es-uuid"]}')$$) like '%filtros_invalidos%', 'identificadores inválidos rechazados');
create temp table ex as select public.export_dataset('v4_sesiones',
  jsonb_build_object('row_ids', jsonb_build_array((select v from ig where k = 'rapida'), (select v from ig where k = 'humana')), 'descripcion', 'dos sesiones', 'formato', 'csv')) as r;
create temp table ex2 as select public.export_dataset('abiertas', '{}') as r;
create temp table ex3 as select public.export_dataset('v4_decisiones', jsonb_build_object('session_ids', jsonb_build_array((select v from ig where k = 'humana')))) as r;
reset role;
select tst.ok((select (r ->> 'row_count')::int = 2 and jsonb_array_length(r -> 'rows') = 2 from ex), 'analyst exporta exactamente las filas pedidas');
select tst.ok((select bool_and(x ? 'automation_signals' and x ? 'automation_flagged') from ex, jsonb_array_elements(r -> 'rows') x), 'la exportación incluye las señales');
select tst.ok((select (r ->> 'row_count')::int = (select count(*) from public.v_open_responses) and (r ->> 'row_count')::int > 0 from ex2), 'analyst exporta respuestas abiertas');
select tst.ok((select (r ->> 'row_count')::int = 10 from ex3), 'decisiones de una sesión: 10');
select tst.ok((select details ->> 'dataset' = 'v4_sesiones' and (details ->> 'rows')::int = 2 and details ->> 'via' = 'export_dataset' and details ->> 'filtros' = 'dos sesiones'
                      and (details ->> 'row_ids')::int = 2 and details ->> 'seleccion_md5' is not null and actor_id = '00000000-0000-4000-8000-000000000004'
                 from public.audit_events where action = 'export' and target_id = 'v4_sesiones' order by id desc limit 1), 'auditoría escrita por el servidor con el conteo real');
select tst.ok((select (details ->> 'rows')::int = (select (r ->> 'row_count')::int from ex2) from public.audit_events where action = 'export' and target_id = 'abiertas' order by id desc limit 1), 'auditoría de abiertas con su conteo');

-- ---------------------------------------------------------------------------
-- 7. Texto libre: solo analyst y owner
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select tst.ok((select count(*) from public.v_open_responses) = 0, 'viewer no lee respuestas abiertas');
select tst.ok((select count(*) from public.survey_responses where text_value is not null) = 0, 'viewer no lee texto libre en la tabla');
select tst.ok((select count(*) from public.survey_responses where option_value is not null) > 0, 'viewer sigue leyendo respuestas de opción');
select tst.ok((select opinion is null and verifica is not null from public.v_sessions where session_id = '11111111-1111-4111-8111-111111111111'), 'v_sessions: viewer ve las opciones pero no la opinión escrita');
select tst.ok((select count(*) from public.radiografia_respuestas) = 0, 'viewer no lee la tabla original (texto libre)');
select tst.ok((select count(*) from public.v_share_sessions) > 0, 'viewer conserva el panel 4.x');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select tst.ok((select count(*) from public.v_open_responses) > 0, 'analyst lee respuestas abiertas');
select tst.ok((select opinion is not null from public.v_sessions where session_id = '11111111-1111-4111-8111-111111111111'), 'analyst ve la opinión escrita');
select tst.ok((select count(*) from public.radiografia_respuestas) = 2, 'analyst lee la tabla original');
reset role;

-- ---------------------------------------------------------------------------
-- 8. anon: nada nuevo invocable salvo lo del participante; tablas nuevas cerradas
-- ---------------------------------------------------------------------------
select tst.ok(not has_function_privilege('anon', f, 'execute'), 'anon no ejecuta ' || f)
  from unnest(array['public.get_platform_settings()','public.set_platform_setting(text,numeric)','public.recompute_automation_signals(uuid)',
                    'public.review_automation(uuid,boolean,text)','public.export_dataset(text,jsonb)','public._setting(text)','public._setting_catalog()',
                    'public._automation_signals(uuid)','public._store_automation_signals(uuid)','public._session_automation_excluded(uuid)',
                    'public._automation_excludes(text[],text)','public.log_export(jsonb)']) f;
select tst.ok(not has_function_privilege('authenticated', f, 'execute'), 'authenticated no ejecuta ' || f)
  from unnest(array['public._setting(text)','public._setting_catalog()','public._automation_signals(uuid)','public._store_automation_signals(uuid)',
                    'public._session_automation_excluded(uuid)']) f;
select tst.ok(has_function_privilege('anon', f, 'execute'), 'anon sigue jugando: ' || f)
  from unnest(array['public.start_session_v4(uuid,boolean,text,boolean,text,text,text,text,boolean)','public.complete_session_v4(uuid)',
                    'public.leaderboard_status(uuid)','public.join_leaderboard(uuid,integer,integer,integer)','public.public_stats(text)']) f;
set role anon;
select tst.ok(tst.err('select * from public.' || t) like '%permission denied%', 'anon no lee ' || t) from unnest(array['platform_settings','session_integrity']) t;
reset role;

update public.studies set config = config - 'public_stats_min_n' - 'percentile_min_n' where status = 'active';
update public.studies set config = config || '{"public_stats_min_n": 10, "percentile_min_n": 20}' where status = 'active';

select name from tst.results where not ok;
select format('TODAS LAS PRUEBAS OK (%s aserciones)', count(*)) from tst.results where ok;
