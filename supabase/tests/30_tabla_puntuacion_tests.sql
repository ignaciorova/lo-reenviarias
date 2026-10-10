-- ============================================================================
-- Pruebas de la tabla de puntuación con apodos (migración 20261010000300).
-- Se ejecuta después de 10_ y 20_ sobre la misma base local.
-- ============================================================================
\set ON_ERROR_STOP 1
truncate tst.results;

-- Sesiones terminadas preparadas directamente (el flujo completo ya se prueba en 10_)
create temp table lb (k text primary key, v uuid);
grant select on lb to anon, authenticated;
insert into lb values ('a', gen_random_uuid()), ('b', gen_random_uuid()), ('c', gen_random_uuid()), ('vieja', gen_random_uuid()), ('en_curso', gen_random_uuid());
insert into public.participant_sessions (id, study_id, instrument_version, status, consent_accepted, completed_at)
select lb.v, s.id, s.version, case when lb.k = 'en_curso' then 'started' else 'completed' end, true,
       case when lb.k = 'vieja' then now() - interval '7 hours' when lb.k = 'en_curso' then null else now() end
  from lb cross join public.studies s where s.code = 'lo-reenviarias' and s.status = 'active';
insert into public.game_sessions_summary (session_id, decisions_count, correct_count, error_count, timeout_count, score, hints_used,
                                          fake_total, fake_accepted_count, real_total, real_rejected_count)
select v, 10, case k when 'a' then 9 when 'b' then 6 else 9 end, 1, 0, case k when 'a' then 1800 when 'b' then 900 else 1800 end, 0, 5, 0, 5, 0
  from lb where k <> 'en_curso';

-- Sin la opción en la versión, no hay tabla
set role anon;
select tst.ok((public.leaderboard_status((select v from lb where k = 'a')) ->> 'enabled')::boolean = false, 'versión sin tabla: no se muestra');
select tst.ok(tst.err($$select public.join_leaderboard((select v from lb where k = 'a'), 1, 3, 27)$$) like '%leaderboard_disabled%', 'versión sin tabla: no se puede entrar');
reset role;

update public.studies set config = config || '{"leaderboard": true}' where code = 'lo-reenviarias' and status = 'active';

set role anon;
select tst.ok((public.leaderboard_status((select v from lb where k = 'a')) ->> 'can_join')::boolean, 'sesión terminada puede entrar');
select tst.ok(public.leaderboard_status((select v from lb where k = 'a')) -> 'top' = '[]'::jsonb, 'tabla vacía al empezar la semana');
select tst.ok(tst.err($$select public.join_leaderboard((select v from lb where k = 'a'), 20, 0, 1)$$) like '%apodo_invalido%', 'apodo fuera de la lista rechazado');
select tst.ok(tst.err($$select public.join_leaderboard((select v from lb where k = 'a'), 0, 0, 100)$$) like '%apodo_invalido%', 'número fuera de rango rechazado');
select tst.ok((public.join_leaderboard((select v from lb where k = 'a'), 1, 3, 27)) ->> 'alias' = 'Jaguar Implacable 27 🐆', 'apodo armado en el servidor');
select tst.ok(tst.err($$select public.join_leaderboard((select v from lb where k = 'a'), 2, 2, 2)$$) like '%already_joined%', 'una sola entrada por partida');
select tst.ok(((public.join_leaderboard((select v from lb where k = 'b'), 3, 0, 5)) ->> 'rank')::int = 2, 'menos puntos: segundo lugar');
select tst.ok(((public.join_leaderboard((select v from lb where k = 'c'), 4, 19, 0)) ->> 'rank')::int = 1, 'empate: comparte el primer puesto');
select tst.ok((select jsonb_agg(x ->> 'alias') from jsonb_array_elements(public.leaderboard_status((select v from lb where k = 'a')) -> 'top') x)
              = '["Jaguar Implacable 27 🐆", "Tortuga Detective 00 🐢", "Lapa Veloz 05 🦜"]'::jsonb, 'orden: puntos, aciertos y llegada');
select tst.ok((select jsonb_agg((x ->> 'rank')::int) from jsonb_array_elements(public.leaderboard_status((select v from lb where k = 'a')) -> 'top') x)
              = '[1, 1, 3]'::jsonb, 'los empates comparten puesto, igual que el mensaje al publicar');
select tst.ok(tst.err($$select public.join_leaderboard((select v from lb where k = 'en_curso'), 1, 1, 1)$$) like '%session_not_completed%', 'partida sin terminar no entra');
select tst.ok(tst.err($$select public.join_leaderboard((select v from lb where k = 'vieja'), 1, 1, 1)$$) like '%too_late%', 'partida de hace horas no entra');
select tst.ok(tst.err($$select public.join_leaderboard(gen_random_uuid(), 1, 1, 1)$$) like '%session_not_found%', 'sesión inexistente');
select tst.ok(tst.err('select * from public.leaderboard_entries') like '%permission denied%', 'anon no lee la tabla cruda');
select tst.ok(tst.err($$select public.set_draft_leaderboard(gen_random_uuid(), true)$$) like '%permission denied%', 'anon no cambia versiones');
reset role;

-- Las entradas no se pueden unir a la sesión ni a la hora
select tst.ok((select array_agg(column_name::text order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'leaderboard_entries')
              = array['alias','correct_count','id','score','study_id','week'], 'sin session_id ni marca de tiempo en la tabla');
select tst.ok((select count(*) from public.participant_sessions where leaderboard_joined) = 3, 'la sesión solo guarda que ya entró');

-- La opción se marca solo en borradores
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select tst.ok(tst.err($$select public.set_draft_leaderboard(gen_random_uuid(), true)$$) like '%forbidden%', 'viewer no cambia la opción');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select tst.ok(tst.err($$select public.set_draft_leaderboard((select id from public.studies where status = 'active'), false)$$) like '%solo_borradores%', 'la versión activa no se toca');
create temp table d as select (public.create_study_version('5.0.0', 'Con tabla', 'Se agrega la tabla de puntuación semanal.',
  (select array_agg(id) from public.news_bank where not archived)) ->> 'id')::uuid as id;
select public.set_draft_leaderboard((select id from d), true);
select tst.ok((select (config ->> 'leaderboard')::boolean from public.studies where id = (select id from d)), 'borrador con tabla');
reset role;
update public.studies set config = config - 'leaderboard' where code = 'lo-reenviarias' and status = 'active';

select name from tst.results where not ok;
select format('TODAS LAS PRUEBAS OK (%s aserciones)', count(*)) from tst.results where ok;
