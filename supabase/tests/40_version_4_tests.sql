-- ============================================================================
-- Pruebas de la versión 4.0.0 (migraciones 20261011000100 y 20261011000200).
-- Se ejecuta después de 10_, 20_ y 30_ sobre la misma base local.
-- ============================================================================
\set ON_ERROR_STOP 1
truncate tst.results;

-- Código válido con su carácter de control (misma regla que src/lib/surveyCode.ts)
create or replace function tst.code(p7 text) returns text language plpgsql as $$
declare alpha text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; s int := 0; i int;
begin
  for i in 1..7 loop s := s + i * (strpos(alpha, substr(p7, i, 1)) - 1); end loop;
  return p7 || substr(alpha, (s % 32) + 1, 1);
end $$;
grant execute on function tst.code(text) to anon, authenticated;

create temp table v4 (k text primary key, v uuid);
grant select on v4 to anon, authenticated;
insert into v4 values ('a', gen_random_uuid()), ('b', gen_random_uuid()), ('c', gen_random_uuid()), ('old', gen_random_uuid());
create temp table key4 as select n.id, n.is_real, n.consult_sources from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0';
grant select on key4 to anon;

-- Antes de activar: la 4.0.0 es borrador y no se puede jugar
set role anon;
select tst.ok(tst.err($$select public.start_session_v4((select v from v4 where k='a'), true)$$) like '%study_not_v4%', 'con la versión anterior activa no se abre una sesión 4.0.0');
select tst.ok((public.study_info() ->> 'mode') = 'clasificacion', 'study_info informa el modo de la versión activa anterior');
reset role;

-- Una sesión de la versión anterior, empezada antes del cambio
set role anon;
select public.start_session((select v from v4 where k='old'), true);
reset role;

-- Activar la 4.0.0 (owner)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.activate_study_version((select id from public.studies where version = '4.0.0'));
reset role;

set role anon;
select set_config('request.jwt.claim.sub', '', false);
select tst.ok((public.study_info() ->> 'mode') = 'responsabilidad' and (public.study_info() ->> 'version') = '4.0.0', 'study_info: 4.0.0 activa');
select tst.ok(tst.err($$select public.start_session(gen_random_uuid(), true)$$) like '%study_is_v4%', 'un cliente anterior no abre sesiones de la 4.0.0');
select tst.ok(tst.err($$select public.start_session_v4(gen_random_uuid(), false)$$) like '%consent_required%', 'sin consentimiento no hay sesión');
select tst.ok(tst.err($$select public.start_session_v4(gen_random_uuid(), true, 'mobile', null, 'qr_juego', null, 'ABCDEFGH')$$) like '%invalid_survey_code%', 'código con control incorrecto rechazado');
select tst.ok(tst.err($$select public.start_session_v4(gen_random_uuid(), true, 'mobile', null, 'qr_juego', 'quizas')$$) like '%invalid_survey_intent%', 'intención de encuesta inválida rechazada');

-- Sesión A: entra por el QR de la encuesta con código (escrito con guion y minúsculas)
select tst.ok((public.start_session_v4((select v from v4 where k='a'), true, 'mobile', false, 'encuesta', 'antes',
               lower(substr(tst.code('K7Q4MXP'), 1, 4) || '-' || substr(tst.code('K7Q4MXP'), 5)))) ->> 'survey_code' = tst.code('K7Q4MXP'), 'código normalizado y guardado');
create temp table pa as select public.get_session_v4((select v from v4 where k='a')) as p;
reset role;
grant select on pa to anon;
set role anon;
select tst.ok((select p ->> 'mode' from pa) = 'responsabilidad', 'payload en modo responsabilidad');
select tst.ok((select jsonb_array_length(p -> 'items') from pa) = 10, '10 noticias');
select tst.ok((select p::text from pa) not like '%"says"%' and (select p::text from pa) not like '%is_real%', 'el payload no revela la respuesta ni la lectura de las fuentes');
select tst.ok((select count(*) from pa, jsonb_array_elements(p -> 'items') i where (i ->> 'image_shown')::boolean and i -> 'display' ? 'media') = 10, 'con image_share = 1 (configuración de la 4.0.0), las 10 tarjetas llevan su imagen');
select tst.ok((select count(*) from pa, jsonb_array_elements(p -> 'items') i where not (i ->> 'image_shown')::boolean and i -> 'display' ? 'media') = 0, 'sin imagen asignada no se envía el medio');
select tst.ok((select count(*) from pa, jsonb_array_elements(p -> 'items') i where (i ->> 'ask_why')::boolean) = 2, '«¿Por qué?» en 2 tarjetas');
select tst.ok((select count(*) from pa, jsonb_array_elements(p -> 'items') i where jsonb_array_length(i -> 'sources') = 3) = 10, 'cada tarjeta ofrece 3 fuentes');
select tst.ok(tst.err($$select public.submit_card((select v from v4 where k='a'), 1, '{"first_action":"reenviar","first_action_ms":3000,"belief":"si"}')$$) like '%pre_survey_missing%', 'sin la pregunta inicial no se juega');
select public.submit_survey((select v from v4 where k='a'), 'pre', '{"primera_vez":"Sí, es la primera vez"}');
reset role;

-- Balance de imágenes por noticia en muchas sesiones (cada noticia ~50 %) y reales/falsas en cada sesión
-- El mecanismo de asignación parcial se sigue probando con image_share = 0,5
update public.studies set config = config || '{"max_sessions_per_minute": 1000, "image_share": 0.5}' where version = '4.0.0';
set role anon;
create temp table many as select g, public.start_session_v4(gen_random_uuid(), true) as p from generate_series(1, 300) g;
reset role;
select tst.ok((select bool_and(c between 2 and 3) from (
  select g, count(*) filter (where (i ->> 'image_shown')::boolean and k.is_real) as c
    from many, jsonb_array_elements(p -> 'items') i join key4 k on k.id = (i ->> 'item_id')::uuid group by g) x), 'cada sesión: 2 o 3 reales con imagen');
select tst.ok((select min(r) > 0.40 and max(r) < 0.60 from (
  select avg(((i ->> 'image_shown')::boolean)::int) r from many, jsonb_array_elements(p -> 'items') i group by i ->> 'item_id') x), 'cada noticia muestra imagen cerca del 50 % de las veces');
update public.participant_sessions set is_test = true where id in (select (p ->> 'session_id')::uuid from many);

-- ---------------------------------------------------------------------------
-- Juego de la sesión A, una tarjeta por estado
-- ---------------------------------------------------------------------------
create or replace function tst.real_at(p int) returns boolean language sql as $$
  select k.is_real from key4 k where k.id = ((public.get_session_v4((select v from v4 where k='a')) -> 'items' -> (p - 1)) ->> 'item_id')::uuid $$;
create or replace function tst.says_at(p int, kind text) returns text language sql as $$
  select x ->> 'says' from key4 k, jsonb_array_elements(k.consult_sources) x
   where k.id = ((public.get_session_v4((select v from v4 where k='a')) -> 'items' -> (p - 1)) ->> 'item_id')::uuid and x ->> 'kind' = kind $$;
grant execute on function tst.real_at(int), tst.says_at(int, text) to anon;

set role anon;
-- 1: E1 reenvía sin verificar, creencia correcta
select tst.ok(tst.err($$select public.submit_card((select v from v4 where k='a'), 2, '{"first_action":"reenviar","first_action_ms":3000,"belief":"si"}')$$) like '%not_current_item%', 'solo la tarjeta en curso');
select tst.ok(tst.err($$select public.submit_card((select v from v4 where k='a'), 1, '{"first_action":"reenviar","first_action_ms":3000}')$$) like '%belief_required%', 'la creencia es obligatoria si hubo decisión');
select tst.ok((public.submit_card((select v from v4 where k='a'), 1, jsonb_build_object('first_action','reenviar','first_action_ms',3000,
               'belief', case when tst.real_at(1) then 'si' else 'no' end)) ->> 'state') = 'E1', 'estado E1');
select tst.ok((public.submit_card((select v from v4 where k='a'), 1, '{"first_action":"no_reenviar","belief":"no_se"}') ->> 'state') = 'E1', 'reintento idempotente: no reescribe');
-- 2: E2 con aviso, «No sé»
select tst.ok((public.submit_card((select v from v4 where k='a'), 2, '{"first_action":"reenviar_aviso","first_action_ms":4000,"belief":"no_se"}') ->> 'points')::int = 0, 'E2 y «No sé» = 0 puntos');
-- 3: E3 no reenvía, creencia incorrecta
select tst.ok((public.submit_card((select v from v4 where k='a'), 3, jsonb_build_object('first_action','no_reenviar','first_action_ms',5000,
               'belief', case when tst.real_at(3) then 'no' else 'si' end)) ->> 'points')::int = -100, 'E3 y creencia incorrecta = -100');
-- 4: tiempo agotado en la decisión
select tst.ok((public.submit_card((select v from v4 where k='a'), 4, '{"first_action":null,"first_action_ms":20000,"belief":"si"}') ->> 'state') = 'E7', 'sin respuesta = E7 (la creencia enviada se ignora)');
-- 5: decisión «a tiempo» según el teléfono pero fuera del límite del servidor
select tst.ok((public.submit_card((select v from v4 where k='a'), 5, '{"first_action":"reenviar","first_action_ms":25000,"belief":"si"}') ->> 'state') = 'E7', 'fuera del límite del servidor = E7');
-- 6: verificar sin abrir fuente
select tst.ok(tst.err($$select public.submit_card((select v from v4 where k='a'), 6, '{"first_action":"verificar","first_action_ms":2000,"source_kind":"oficial","evaluation":"confirma","final_action":"no_reenviar","belief":"no","read_ms":5000}')$$) like '%source_not_opened%', 'no se puede evaluar una fuente que no se abrió');
select tst.ok(tst.err($$select public.open_source((select v from v4 where k='a'), 7, 'oficial')$$) like '%not_current_item%', 'solo se abren fuentes de la tarjeta en curso');
select tst.ok(tst.err($$select public.open_source((select v from v4 where k='a'), 6, 'twitter')$$) like '%invalid_kind%', 'tipo de fuente inválido');
select tst.ok((public.open_source((select v from v4 where k='a'), 6, 'oficial'))::text not like '%"says"%', 'abrir una fuente no revela su lectura correcta');
select tst.ok((public.open_source((select v from v4 where k='a'), 6, 'oficial')) ->> 'excerpt' is not null, 'la fuente trae su extracto');
-- leyendo 5 s según el teléfono, pero el servidor registró la apertura hace instantes: la lectura se acota
select tst.ok((public.submit_card((select v from v4 where k='a'), 6, jsonb_build_object('first_action','verificar','first_action_ms',2000,'source_kind','oficial',
               'evaluation', tst.says_at(6,'oficial'),'final_action','no_reenviar','belief','no','read_ms',5000)) ->> 'effective_verification')::boolean = false, 'lectura acotada por el servidor: no cuenta como efectiva');
reset role;
select tst.ok((select read_ms < 2000 and state = 'E6' and evaluation_correct from public.share_decisions where session_id = (select v from v4 where k='a') and position = 6), 'E6 con evaluación correcta y lectura acotada');

-- 7: verificación efectiva (apertura registrada hace 10 s)
set role anon;
select public.open_source((select v from v4 where k='a'), 7, 'medio');
reset role;
update public.source_opens set opened_at = now() - interval '10 seconds' where session_id = (select v from v4 where k='a') and position = 7;
set role anon;
select tst.ok((public.submit_card((select v from v4 where k='a'), 7, jsonb_build_object('first_action','verificar','first_action_ms',1500,'source_kind','medio',
               'evaluation', tst.says_at(7,'medio'),'final_action','reenviar_aviso','belief','no_se','read_ms',6000)) ->> 'effective_verification')::boolean, 'fuente adecuada + lectura + evaluación correcta = verificación efectiva');
-- 8: verifica con los comentarios (fuente inadecuada) y reenvía
select public.open_source((select v from v4 where k='a'), 8, 'comentarios');
reset role;
update public.source_opens set opened_at = now() - interval '10 seconds' where session_id = (select v from v4 where k='a') and position = 8;
set role anon;
select tst.ok((select (f ->> 'state') = 'E4' and not (f ->> 'effective_verification')::boolean
                 from (select public.submit_card((select v from v4 where k='a'), 8, jsonb_build_object('first_action','verificar','first_action_ms',1500,'source_kind','comentarios',
                       'evaluation','nada_claro','final_action','reenviar','belief','si','read_ms',6000)) f) x), 'comentarios no cuentan como verificación efectiva (E4)');
-- 9: abrir fuente y luego decir que no verificó = inconsistente
select public.open_source((select v from v4 where k='a'), 9, 'oficial');
select tst.ok(tst.err($$select public.submit_card((select v from v4 where k='a'), 9, '{"first_action":"reenviar","first_action_ms":3000,"belief":"si"}')$$) like '%inconsistent_card%', 'no se puede abrir fuentes sin haber elegido verificar');
-- se acaba el tiempo de verificación
select tst.ok((public.submit_card((select v from v4 where k='a'), 9, '{"first_action":"verificar","first_action_ms":3000,"verify_timed_out":true,"belief":"si"}') ->> 'state') = 'E7', 'tiempo agotado al verificar = E7');
reset role;
select tst.ok((select timeout_stage = 'verificacion' and sources_opened = '{oficial}' and belief is null from public.share_decisions where session_id = (select v from v4 where k='a') and position = 9), 'E7 en verificación guarda la fuente abierta');

set role anon;
select tst.ok(tst.err($$select public.complete_session_v4((select v from v4 where k='a'))$$) like '%game_not_finished%', 'no se cierra con tarjetas pendientes');
-- 10: con «¿Por qué?» si toca
select public.submit_card((select v from v4 where k='a'), 10, jsonb_build_object('first_action','no_reenviar','first_action_ms',3000,'belief','no_se','reason','sin_fuente'));
create temp table sa as select public.complete_session_v4((select v from v4 where k='a')) as s;
reset role;
grant select on sa to anon;
select tst.ok((select (s ->> 'score')::int = 600 + (select sum(points) from public.share_decisions where session_id = (select v from v4 where k='a')) from sa), 'puntaje = 600 + puntos de creencia');
select tst.ok((select (s -> 'counts' ->> 'shared_unverified')::int = 2 and (s -> 'counts' ->> 'timed_out')::int = 3 and (s -> 'counts' ->> 'verified')::int = 4 from sa), 'conteos del resumen final');
select tst.ok((select reason is null or 10 = any(ps.why_positions) from public.share_decisions d join public.participant_sessions ps on ps.id = d.session_id
               where d.session_id = (select v from v4 where k='a') and d.position = 10), '«¿Por qué?» solo se guarda donde se preguntó');
select tst.ok((select e1 = 1 and e2 = 1 and e3 = 2 and e4 = 1 and e5 = 1 and e6 = 1 and e7 = 3 and e8 = 0 and is_valid
                 from public.v_share_sessions where session_id = (select v from v4 where k='a')), 'un estado por tarjeta: E1 E2 E3×2 E4 E5 E6 E7×3');
select tst.ok((select e7 = 3 and e1 + e2 + e3 + e4 + e5 + e6 = r_answered from public.v_share_sessions where session_id = (select v from v4 where k='a')), 'R = E1..E6 (E7 fuera del denominador)');

-- Ranking con el puntaje de la 4.0.0
set role anon;
select tst.ok((public.leaderboard_status((select v from v4 where k='a')) ->> 'can_join')::boolean, 'una partida 4.0.0 puede entrar al ranking');
select tst.ok((public.join_leaderboard((select v from v4 where k='a'), 2, 4, 11)) ->> 'alias' is not null, 'entra al ranking con su puntaje');
reset role;
select tst.ok((select score from public.leaderboard_entries order by id desc limit 1) = (select (s ->> 'score')::int from sa), 'el ranking usa el puntaje calculado en el servidor');

-- Sesión B: entra por el QR del juego sin código y lo agrega después
set role anon;
select public.start_session_v4((select v from v4 where k='b'), true, 'desktop', null, 'qr_juego', 'despues');
select tst.ok(tst.err($$select public.set_survey_code((select v from v4 where k='b'), 'ZZZZZZZZ')$$) like '%invalid_survey_code%', 'código inválido no se enlaza');
select tst.ok((public.set_survey_code((select v from v4 where k='b'), tst.code('AB12CD3'))) ->> 'survey_code' = tst.code('AB12CD3'), 'código enlazado después de jugar');
select tst.ok(tst.err($$select public.find_sessions_by_code('x')$$) like '%permission denied%', 'anon no busca sesiones por código');
-- La sesión vieja (3.x) termina con su versión; la 4.0.0 no acepta sus funciones
select tst.ok(tst.err($$select public.get_session_v4((select v from v4 where k='old'))$$) like '%study_not_v4%', 'una sesión anterior no se abre como 4.0.0');
select tst.ok(tst.err($$select public.submit_card((select v from v4 where k='old'), 1, '{}')$$) like '%study_not_v4%', 'ni recibe tarjetas 4.0.0');
select tst.ok((public.get_session((select v from v4 where k='old')) ->> 'status') = 'started', 'la sesión anterior sigue disponible con su flujo');
-- Sin acceso a tablas ni vistas nuevas
select tst.ok(tst.err('select * from public.' || t) like '%permission denied%', 'anon no lee ' || t)
  from unnest(array['share_decisions','source_opens','v_share_decisions','v_share_sessions']) t;
select tst.ok(tst.err($$select public.save_news_sources(gen_random_uuid(), '[]')$$) like '%permission denied%', 'anon no edita fuentes');
select tst.ok(tst.err($$select public.set_draft_survey(gen_random_uuid(), null, null)$$) like '%permission denied%', 'anon no configura la encuesta');
reset role;

-- Personas autenticadas sin rol y viewer
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
select tst.ok((select count(*) from public.share_decisions) = 0 and (select count(*) from public.v_share_sessions) = 0, 'cuenta sin rol no ve decisiones 4.0.0');
select tst.ok(tst.err($$select public.find_sessions_by_code('x')$$) like '%forbidden%', 'cuenta sin rol no busca por código');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select tst.ok((select count(*) from public.v_share_decisions where session_id = (select v from v4 where k='a')) = 10, 'viewer ve las decisiones');
select tst.ok(tst.err($$select public.find_sessions_by_code('x')$$) like '%forbidden%', 'viewer no busca por código');
select tst.ok(tst.err($$select public.set_draft_survey(gen_random_uuid(), null, null)$$) like '%forbidden%', 'viewer no configura la encuesta');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
reset role;
insert into public.admin_profiles (user_id, role) values ('00000000-0000-4000-8000-000000000004', 'analyst') on conflict (user_id) do update set role = 'analyst', active = true;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select tst.ok((select count(*) from public.find_sessions_by_code(lower(tst.code('AB12CD3')))) = 1, 'analyst encuentra la sesión por código');
select tst.ok(tst.err($$select public.set_draft_survey((select id from public.studies where version = '4.0.0'), null, null)$$) like '%solo_borradores%', 'la encuesta de la versión activa no se cambia');
select tst.ok(tst.err($$select public.save_news_sources((select id from public.news_bank limit 1), '[{"kind":"oficial","label":"Gobierno","excerpt":"corto","says":"confirma"}]')$$) like '%fuente_extracto_invalido%', 'se validan las fuentes');
select tst.ok(tst.err($$select public.save_news_sources((select id from public.news_bank limit 1), '[{"kind":"oficial","label":"Gobierno","excerpt":"Un extracto suficientemente largo.","says":"confirma","url":"http://x"}]')$$) like '%fuente_url_invalida%', 'solo enlaces https');
reset role;
insert into public.news_bank (item_key, headline, is_real, category, explanation, hint, red_flags, display, validation_status)
  select 'sin_fuentes', b.headline || ' (copia)', b.is_real, b.category, b.explanation, b.hint, b.red_flags, b.display, 'pendiente' from public.news_bank b where b.item_key = 'f_sinpe';
create temp table nosrc as select id from public.news_bank where item_key = 'sin_fuentes';
grant select on nosrc to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select tst.ok(tst.err($$select public.create_study_version('4.8.0', 'Prueba', 'Una noticia sin fuentes.', (select array_agg(id) from public.news_bank where not archived))$$) like '%faltan_fuentes%', 'en la 4.x no se arma una versión con noticias sin fuentes');
select public.set_news_card_archived((select id from nosrc), true);
create temp table dv as select (public.create_study_version('4.7.0', 'Prueba', 'Borrador de prueba con fuentes.', (select array_agg(id) from public.news_bank where not archived)) ->> 'id')::uuid as id;
select public.set_draft_survey((select id from dv), 'https://docs.google.com/forms/d/e/1FAIpQLSf_prueba-123/viewform', 'entry.123456789');
select tst.ok(tst.err($$select public.set_draft_survey((select id from dv), 'https://evil.example/forms', null)$$) like '%url_de_encuesta_invalida%', 'solo enlaces de Google Forms');
reset role;
select tst.ok((select config ->> 'mode' = 'responsabilidad' and config ->> 'survey_code_entry' = 'entry.123456789' from public.studies where id = (select id from dv)), 'un borrador armado desde la 4.0.0 hereda su modo y la encuesta');
select tst.ok((select count(*) = (select count(*) from public.news_bank where not archived) and bool_and(jsonb_array_length(consult_sources) = 3)
                 from public.news_items where study_id = (select id from dv) and item_key in (select item_key from key4 k join public.news_items n on n.id = k.id)), 'el borrador copia también las fuentes');

select name from tst.results where not ok;
select format('TODAS LAS PRUEBAS OK (%s aserciones)', count(*)) from tst.results where ok;
