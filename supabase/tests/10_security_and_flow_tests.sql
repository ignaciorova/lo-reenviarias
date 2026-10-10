-- ============================================================================
-- Pruebas de seguridad (RLS/privilegios) y del flujo completo de una sesión.
-- Ejecutar sobre una base con las migraciones aplicadas (local o rama de Supabase).
-- Cualquier fallo aborta con "FALLO: ...". Al final imprime "TODAS LAS PRUEBAS OK".
-- ============================================================================
\set ON_ERROR_STOP 1
create schema if not exists tst;
create table if not exists tst.results (id serial, name text, ok boolean, detail text);
truncate tst.results;
grant usage on schema tst to anon, authenticated;
grant insert, select on tst.results to anon, authenticated;
grant usage on sequence tst.results_id_seq to anon, authenticated;

create or replace function tst.ok(p_cond boolean, p_name text, p_detail text default null) returns void
language plpgsql as $$ begin
  insert into tst.results (name, ok, detail) values (p_name, coalesce(p_cond,false), p_detail);
  if not coalesce(p_cond,false) then raise exception 'FALLO: % %', p_name, coalesce(p_detail,''); end if;
end $$;
-- Devuelve el mensaje de error (o null si no hubo error) al ejecutar SQL dinámico
create or replace function tst.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return null; exception when others then return sqlerrm; end $$;
grant execute on function tst.ok(boolean,text,text), tst.err(text) to anon, authenticated;

-- Usuarios de prueba en auth.users (en Supabase real se crean desde Auth)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001','owner@test.local'),
  ('00000000-0000-4000-8000-000000000002','viewer@test.local'),
  ('00000000-0000-4000-8000-000000000003','random@test.local'),
  ('00000000-0000-4000-8000-000000000004','analyst@test.local')
on conflict do nothing;
insert into public.admin_profiles (user_id, role) values
  ('00000000-0000-4000-8000-000000000001','owner'),
  ('00000000-0000-4000-8000-000000000002','viewer')
on conflict do nothing;

-- Tabla auxiliar con la clave de respuestas, SOLO para que la prueba elija respuestas (no accesible a anon)
create temp table answer_key as select n.id, n.is_real, n.hint from public.news_items n
  join public.studies s on s.id = n.study_id where s.version = '2.0.0';
grant select on answer_key to anon;  -- tabla temporal de la sesión de prueba

-- ---------------------------------------------------------------------------
-- 1. Visitante anónimo: sin acceso a tablas ni vistas
-- ---------------------------------------------------------------------------
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select tst.ok(tst.err('select * from public.' || t) like '%permission denied%', 'anon no lee ' || t)
  from unnest(array['studies','news_items','survey_questions','participant_sessions','survey_responses','hint_events',
                    'game_decisions','game_sessions_summary','admin_profiles','audit_events','response_codes',
                    'v_sessions','v_decisions','v_open_responses','radiografia_respuestas',
                    'radiografia_respuestas_backup_20261009']) t;
select tst.ok(tst.err($$insert into public.participant_sessions (id, study_id, instrument_version) values (gen_random_uuid(), gen_random_uuid(), 'x')$$) like '%permission denied%', 'anon no inserta sesiones directamente');
select tst.ok(tst.err($$insert into public.game_decisions (session_id, news_item_id, correct_classification, is_correct, instrument_version) values (gen_random_uuid(), gen_random_uuid(), 'real', true, 'x')$$) like '%permission denied%', 'anon no inserta decisiones directamente');
select tst.ok(tst.err($$select public.grant_admin('random@test.local','owner')$$) like '%permission denied%', 'anon no ejecuta grant_admin');
select tst.ok(tst.err($$select public._compute_summary(gen_random_uuid())$$) like '%permission denied%', 'anon no ejecuta funciones internas');
select tst.ok(tst.err($$select public.purge_sessions('test', 1)$$) like '%permission denied%', 'anon no ejecuta purge_sessions');
-- Tabla original: desde la auditoría del 10/10/2026 ya no admite inserciones anónimas
select tst.ok(tst.err($$insert into public.radiografia_respuestas (opinion, aciertos) values ('legacy insert', 3)$$) like '%permission denied%', 'anon ya no inserta en la tabla original');

-- ---------------------------------------------------------------------------
-- 2. Flujo completo de un participante (rol anon)
-- ---------------------------------------------------------------------------
select tst.ok(tst.err($$select public.start_session('11111111-1111-4111-8111-111111111111', false)$$) like '%consent_required%', 'sin consentimiento no inicia');

do $$
declare
  sid uuid := '11111111-1111-4111-8111-111111111111';
  p jsonb; p2 jsonb; fb jsonb; fb2 jsonb; h jsonb;
  item jsonb; v_real boolean; i int; v_choice text; v_expected int; v_total int := 0; v_streak int := 0;
  v_ms int; v_speed int; v_mult numeric; v_pts int; v_hint boolean;
  s jsonb;
begin
  p := public.start_session(sid, true, 'mobile', false);
  perform tst.ok(p ->> 'status' = 'started', 'sesión iniciada');
  perform tst.ok(jsonb_array_length(p -> 'items') = 10, '10 noticias presentadas');
  perform tst.ok(p::text not like '%is_real%' and p::text not like '%explanation%' and p::text not like '%"hint"%',
                 'la carga inicial no expone respuestas, explicaciones ni pistas');
  perform tst.ok((select count(distinct x ->> 'item_id') from jsonb_array_elements(p -> 'items') x) = 10, 'sin noticias repetidas');
  p2 := public.start_session(sid, true, 'mobile', false);
  perform tst.ok(p2 -> 'items' = p -> 'items', 'start_session idempotente (mismo orden en reintento)');

  perform tst.ok(tst.err(format($f$select public.submit_decision(%L, 1, 'real', 1000)$f$, sid)) like '%pre_survey_missing%', 'no se decide sin encuesta inicial');
  perform tst.ok(tst.err(format($f$select public.submit_survey(%L, 'pre', '{"opinion":"hola","verifica":"Nunca","compartio_falso":"No","responsable":"Quien la crea"}')$f$, sid)) like '%invalid_option%', 'opción inválida rechazada');
  perform tst.ok(tst.err(format($f$select public.submit_survey(%L, 'pre', '{"opinion":"hola","verifica":"Siempre","compartio_falso":"No","responsable":"Quien la crea","extra":"x"}')$f$, sid)) like '%unknown_question%', 'pregunta desconocida rechazada');
  perform tst.ok(tst.err(format($f$select public.submit_survey(%L, 'pre', %L)$f$, sid, jsonb_build_object('opinion', repeat('a',1501),'verifica','Siempre','compartio_falso','No','responsable','Quien la crea')::text)) like '%invalid_length%', 'texto > 1500 caracteres rechazado');
  perform tst.ok(tst.err(format($f$select public.submit_survey(%L, 'post', '{"post_cambio":"Tal vez"}')$f$, sid)) like '%game_not_finished%', 'pregunta final bloqueada antes de terminar');
  perform public.submit_survey(sid, 'pre', '{"opinion":"<b>Depende</b> de quién la mande","verifica":"A veces","compartio_falso":"Sí","responsable":"Todos por igual"}');
  perform tst.ok((public.submit_survey(sid, 'pre', '{"opinion":"otra","verifica":"Siempre","compartio_falso":"No","responsable":"Quien la crea"}') ->> 'duplicate')::boolean, 'encuesta inicial idempotente (no se sobrescribe)');

  perform tst.ok(tst.err(format($f$select public.submit_decision(%L, 2, 'real', 1000)$f$, sid)) like '%not_current_item%', 'no se puede saltar noticias');
  perform tst.ok(tst.err(format($f$select public.use_hint(%L, 3)$f$, sid)) like '%not_current_item%', 'lupa solo para la noticia actual');
  perform tst.ok(tst.err(format($f$select public.submit_decision(%L, 1, 'tal vez', 1000)$f$, sid)) like '%invalid_choice%', 'clasificación inválida rechazada');

  -- 10 decisiones: aciertos en 1,2,3; error en 4; tiempo agotado en 5; aciertos 6..10 (lupa en 1 y 6)
  for i in 1..10 loop
    item := p -> 'items' -> (i-1);
    select is_real into v_real from answer_key where id = (item ->> 'item_id')::uuid;
    v_hint := i in (1, 6);
    if v_hint then
      h := public.use_hint(sid, i);
      perform tst.ok(h ->> 'hint' is not null, 'lupa devuelve pista en posición ' || i);
    end if;
    v_ms := 1000 * i;
    if i = 4 then v_choice := case when v_real then 'falsa' else 'real' end;
    elsif i = 5 then v_choice := null;
    else v_choice := case when v_real then 'real' else 'falsa' end; end if;

    fb := public.submit_decision(sid, i, v_choice, case when i = 5 then 20000 else v_ms end);
    fb2 := public.submit_decision(sid, i, case when v_choice = 'real' then 'falsa' else 'real' end, 1);
    perform tst.ok(fb = fb2, 'reintento de decisión ' || i || ' devuelve el mismo resultado (sin cambiarlo)');
    perform tst.ok((fb ->> 'is_real')::boolean = v_real, 'retroalimentación revela la verdad tras decidir (' || i || ')');

    -- Puntuación esperada con la regla original
    if i in (4,5) then v_streak := 0; v_expected := 0;
    else
      v_streak := v_streak + 1;
      v_speed := greatest(0, round(50 * (1 - v_ms / 1000.0 / 20)))::int;
      v_mult := case when v_streak >= 2 then least(v_streak,4)/2.0 + 0.5 else 1 end;
      v_pts := round((100 + v_speed) * v_mult)::int;
      if v_hint then v_pts := round(v_pts * 0.8)::int; end if;
      v_expected := v_pts;
    end if;
    v_total := v_total + v_expected;
    perform tst.ok((fb ->> 'points_awarded')::int = v_expected, 'puntos noticia ' || i, format('esperado %s obtenido %s', v_expected, fb ->> 'points_awarded'));
    perform tst.ok((fb ->> 'total_score')::int = v_total, 'puntaje acumulado tras noticia ' || i);
    if i = 5 then perform tst.ok((fb ->> 'timed_out')::boolean and not (fb ->> 'is_correct')::boolean, 'tiempo agotado = no acierto'); end if;
  end loop;
  perform tst.ok(tst.err(format($f$select public.use_hint(%L, 10)$f$, sid)) is not null, 'no hay lupas tras decidir');
  perform tst.ok(tst.err(format($f$select public.complete_session(%L)$f$, sid)) like '%post_survey_missing%', 'no se completa sin pregunta final');
  perform public.submit_survey(sid, 'post', '{"post_cambio":"Sí, verificaría más"}');
  s := public.complete_session(sid);
  perform tst.ok((s ->> 'correct_count')::int = 8, 'aciertos = 8', s::text);
  perform tst.ok((s ->> 'score')::int = v_total, 'puntaje oficial = suma de puntos', format('esperado %s obtenido %s', v_total, s ->> 'score'));
  perform tst.ok((s ->> 'hints_used')::int = 2, 'lupas usadas = 2');
  perform tst.ok(public.complete_session(sid) = s, 'complete_session idempotente');
  perform tst.ok(tst.err(format($f$select public.submit_decision(%L, 1, 'real', 1)$f$, sid)) is null, 'reintento tardío no falla');
  perform tst.ok(public.get_session(sid) ->> 'status' = 'completed', 'get_session refleja sesión completada');
end $$;

-- Límite de lupas y tiempo excesivo
do $$
declare sid uuid := '22222222-2222-4222-8222-222222222222'; p jsonb; fb jsonb; i int;
begin
  p := public.start_session(sid, true, 'desktop', true);
  perform public.submit_survey(sid, 'pre', '{"opinion":"nunca","verifica":"Siempre","compartio_falso":"No","responsable":"Quien la crea"}');
  perform public.use_hint(sid, 1); perform public.submit_decision(sid, 1, 'real', 500);
  perform public.use_hint(sid, 2); perform public.submit_decision(sid, 2, 'real', 500);
  perform tst.ok(tst.err(format($f$select public.use_hint(%L, 3)$f$, sid)) like '%no_hints_left%', 'máximo 2 lupas');
  fb := public.submit_decision(sid, 3, 'real', 999999);
  perform tst.ok((fb ->> 'timed_out')::boolean and (fb ->> 'points_awarded')::int = 0, 'respuesta fuera de tiempo se registra como tiempo agotado');
end $$;

-- Datos públicos agregados: con < 10 sesiones no se revela nada
select tst.ok(public.public_stats() ->> 'n' is null, 'public_stats oculto con N pequeño');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Usuario autenticado SIN rol administrativo
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
select tst.ok((select count(*) from public.participant_sessions) = 0, 'autenticado sin rol: 0 sesiones visibles');
select tst.ok((select count(*) from public.v_sessions) = 0, 'autenticado sin rol: vista vacía');
select tst.ok((select count(*) from public.survey_responses) = 0, 'autenticado sin rol: 0 respuestas visibles');
select tst.ok((select count(*) from public.news_items) = 0, 'autenticado sin rol: no ve clave de respuestas');
select tst.ok((select count(*) from public.radiografia_respuestas) = 0, 'autenticado sin rol: no ve tabla original');
select tst.ok(tst.err($$select public.grant_admin('random@test.local','owner')$$) like '%forbidden%', 'autenticado sin rol no se autoasigna admin');
select tst.ok(tst.err($$insert into public.admin_profiles (user_id, role) values ('00000000-0000-4000-8000-000000000003','owner')$$) like '%permission denied%', 'autenticado no inserta en admin_profiles');
select tst.ok(tst.err($$update public.participant_sessions set is_test = true$$) like '%permission denied%', 'autenticado no modifica sesiones');
select tst.ok(tst.err($$delete from public.game_decisions$$) like '%permission denied%', 'autenticado no borra decisiones');
select tst.ok(public.my_admin_profile() is null, 'my_admin_profile nulo sin rol');

-- ---------------------------------------------------------------------------
-- 4. Viewer: lee todo, no modifica
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select tst.ok((select count(*) from public.participant_sessions) >= 4, 'viewer ve sesiones (2 nuevas + 2 históricas)');
select tst.ok((select count(*) from public.v_decisions) >= 33, 'viewer ve decisiones');
select tst.ok(tst.err($$select public.set_session_flags('11111111-1111-4111-8111-111111111111', true, null)$$) like '%forbidden%', 'viewer no marca sesiones');
select tst.ok(tst.err($$select public.grant_admin('random@test.local','viewer')$$) like '%forbidden%', 'viewer no gestiona admins');
select tst.ok(tst.err($$select * from public.list_admins()$$) like '%forbidden%', 'viewer no lista admins');
select tst.ok((select count(*) from public.audit_events) = 0, 'viewer no ve auditoría');
select tst.ok(tst.err($$update public.game_decisions set is_correct = true$$) like '%permission denied%', 'viewer no altera decisiones');
select public.log_export('{"dataset":"decisiones","rows":10}');

-- ---------------------------------------------------------------------------
-- 5. Owner: gestiona administradores; todo queda auditado
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select tst.ok((public.grant_admin('analyst@test.local','analyst') ->> 'role') = 'analyst', 'owner concede rol analyst');
select tst.ok((select count(*) from public.list_admins()) = 3, 'owner lista 3 admins');
select tst.ok(tst.err($$select public.revoke_admin('00000000-0000-4000-8000-000000000001')$$) like '%cannot_revoke_self%', 'owner no se revoca a sí mismo');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select public.set_session_flags('22222222-2222-4222-8222-222222222222', true, null);
select tst.ok((select is_test from public.participant_sessions where id = '22222222-2222-4222-8222-222222222222'), 'analyst marca sesión de prueba');
select tst.ok((select count(*) from public.audit_events where action in ('grant_admin','set_session_flags','export')) = 3, 'acciones administrativas auditadas');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Migración histórica
-- ---------------------------------------------------------------------------
select tst.ok((select count(*) from public.game_decisions where session_id = '11111111-1111-4111-8111-111111111111') = 10, 'exactamente 10 decisiones guardadas (sin duplicados por reintentos)');
select tst.ok((select count(*) from public.hint_events where session_id = '11111111-1111-4111-8111-111111111111') = 2, 'exactamente 2 lupas registradas');
select tst.ok((select count(*) from public.participant_sessions where origin = 'legacy_import') = 2, '2 filas históricas migradas');
select tst.ok((select count(*) from public.radiografia_respuestas_backup_20261009) = 2, 'respaldo íntegro creado');
select tst.ok((select count(*) from public.game_decisions d join public.participant_sessions s on s.id = d.session_id where s.origin = 'legacy_import') = 20, '20 decisiones históricas');
select tst.ok((select g.correct_count from public.game_sessions_summary g join public.participant_sessions s on s.id = g.session_id where s.legacy_source_id = 'legacy:1') = 8, 'aciertos recalculados coinciden con el original (8)');
select tst.ok((select g.correct_count from public.game_sessions_summary g join public.participant_sessions s on s.id = g.session_id where s.legacy_source_id = 'legacy:2') = 6, 'aciertos recalculados coinciden con el original (6)');
select tst.ok((select g.timeout_count from public.game_sessions_summary g join public.participant_sessions s on s.id = g.session_id where s.legacy_source_id = 'legacy:2') = 1, 'tiempo agotado histórico preservado');

select name from tst.results where not ok;
select format('TODAS LAS PRUEBAS OK (%s aserciones)', count(*)) from tst.results where ok;
