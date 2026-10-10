-- ============================================================================
-- Pruebas del banco de noticias y de las versiones armadas desde el panel (migración 20261010000200).
-- Se ejecuta después de 10_security_and_flow_tests.sql sobre la misma base local.
-- ============================================================================
\set ON_ERROR_STOP 1
truncate tst.results;
insert into public.admin_profiles (user_id, role) values ('00000000-0000-4000-8000-000000000004','analyst') on conflict do nothing;

create temp table ctx (k text primary key, v text);
grant select, insert, update on ctx to authenticated;

-- Carga inicial: el banco tiene las tarjetas de la versión más reciente (3.0.0), con su imagen
select tst.ok((select count(*) from public.news_bank) = 10, 'banco sembrado con 10 tarjetas');
select tst.ok((select count(*) from public.news_bank where display ? 'media') = 10, 'las 10 tarjetas traen su imagen o clip');

-- anon no ve ni edita el banco
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select tst.ok(tst.err('select * from public.news_bank') like '%permission denied%', 'anon no lee el banco');
select tst.ok(tst.err($$select public.save_news_card('{}'::jsonb)$$) like '%permission denied%', 'anon no guarda tarjetas');
select tst.ok(tst.err($$select public.activate_study_version(gen_random_uuid())$$) like '%permission denied%', 'anon no activa versiones');
reset role;

-- viewer lee pero no edita
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select tst.ok((select count(*) from public.news_bank) = 10, 'viewer lee el banco');
select tst.ok(tst.err($$select public.save_news_card('{"item_key":"f_x","is_real":false}'::jsonb)$$) like '%forbidden%', 'viewer no guarda tarjetas');
select tst.ok(tst.err($$select public.create_study_version('9.0.0','x','nota de prueba larga', array[]::uuid[])$$) like '%forbidden%', 'viewer no arma versiones');

-- autenticado sin rol no ve nada
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
select tst.ok((select count(*) from public.news_bank) = 0, 'cuenta sin rol no ve el banco');
reset role;

-- analyst crea y edita tarjetas
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
insert into ctx values ('nueva', (public.save_news_card($${
  "item_key": "f_peaje", "headline": "Desde mañana el peaje de la ruta 27 costará ₡5.000 para todos los carros", "is_real": false,
  "category": "Transporte", "explanation": "Es inventada para este juego.", "hint": "No hay anuncio del CONAVI ni del MOPT.",
  "red_flags": ["No cita al MOPT.", " "],
  "display": {"who": "Primo Luis", "many": true, "band": "URGENTE", "bg": "linear-gradient(135deg,#00695C,#4DB6AC)", "emo": "🚗", "emo2": "💸",
              "src_label": "Sin fuente",
              "media": {"kind": "image", "src": "/storage/v1/object/public/noticias/0b6f2a3c-1d2e-4f50-8a9b-0c1d2e3f4a5b.jpg", "alt": "Foto de una caseta de peaje", "frame": "whatsapp", "focus": "50% 40%"}}
}$$::jsonb) ->> 'id'));
select tst.ok((select revision from public.news_bank where item_key = 'f_peaje') = 1, 'tarjeta nueva con revisión 1');
select tst.ok((select red_flags from public.news_bank where item_key = 'f_peaje') = array['No cita al MOPT.'], 'señales vacías descartadas');

create function pg_temp.card(p_extra jsonb) returns jsonb language sql as $$
  select (to_jsonb(b) - 'archived' - 'created_at' - 'updated_at' - 'created_by' - 'updated_by' - 'revision') || p_extra
    from public.news_bank b where item_key = 'f_peaje'
$$;
select public.save_news_card(pg_temp.card('{"headline": "Desde mañana el peaje de la ruta 27 costará ₡6.000 para todos los carros"}'));
select tst.ok((select revision from public.news_bank where item_key = 'f_peaje') = 2, 'editar sube la revisión');

-- Validación del aspecto: nada externo ni claves desconocidas
select tst.ok(tst.err($$select public.save_news_card(pg_temp.card('{"display": {"who":"A","many":true,"band":"B","bg":"linear-gradient(135deg,#000000,#FFFFFF)","emo":"x","emo2":"y","media":{"kind":"image","src":"https://evil.example/x.jpg","alt":"abc","frame":"whatsapp"}}}'))$$) like '%medio_archivo_invalido%', 'rechaza imagen de otro dominio');
select tst.ok(tst.err($$select public.save_news_card(pg_temp.card('{"display": {"who":"A","many":true,"band":"B","bg":"url(https://evil.example/t.gif)","emo":"x","emo2":"y"}}'))$$) like '%fondo_invalido%', 'rechaza fondo con url()');
select tst.ok(tst.err($$select public.save_news_card(pg_temp.card('{"display": {"who":"A","many":true,"band":"B","bg":"linear-gradient(135deg,#000000,#FFFFFF)","emo":"x","emo2":"y","onclick":"z"}}'))$$) like '%display_clave_desconocida%', 'rechaza claves desconocidas');
select tst.ok(tst.err($$select public.save_news_card(pg_temp.card('{"display": {"who":"A","many":true,"band":"B","bg":"linear-gradient(135deg,#000000,#FFFFFF)","emo":"x","emo2":"y","media":{"kind":"image","src":"/storage/v1/object/public/noticias/../x.jpg","alt":"abc","frame":"whatsapp"}}}'))$$) like '%medio_archivo_invalido%', 'rechaza rutas con ..');
select tst.ok(tst.err($$select public.save_news_card(pg_temp.card('{"item_key": "f_peaje", "id": ""}'))$$) like '%duplicate%', 'clave repetida rechazada');
select tst.ok(tst.err($$select public.save_news_card(pg_temp.card('{"is_real": "sí"}'))$$) like '%falta_real_o_falsa%', 'real/falsa obligatorio');

-- Armar versiones
select tst.ok(tst.err($$select public.create_study_version('4.0.0','x','Nota de prueba suficiente', (select array_agg(id) from (select id from public.news_bank limit 9) x))$$) like '%pocas_noticias%', 'exige al menos 10 noticias');
select tst.ok(tst.err($$select public.create_study_version('4.0.0','x','Nota de prueba suficiente', (select array_agg(id) from public.news_bank where not is_real))$$) like '%pocas_noticias%' , 'solo falsas: también pocas');
select tst.ok(tst.err($$select public.create_study_version('3.0.0','x','Nota de prueba suficiente', (select array_agg(id) from public.news_bank))$$) like '%version_existente%', 'no reutiliza un número de versión');
select tst.ok(tst.err($$select public.create_study_version('4.0','x','Nota de prueba suficiente', (select array_agg(id) from public.news_bank))$$) like '%version_invalida%', 'formato de versión');
select tst.ok(tst.err($$select public.create_study_version('4.0.0','x','corta', (select array_agg(id) from public.news_bank))$$) like '%falta_nota_de_cambios%', 'exige nota de cambios');

insert into ctx values ('v4', (public.create_study_version('4.0.0', 'Con peaje', 'Se agrega la noticia del peaje (f_peaje).', (select array_agg(id) from public.news_bank)) ->> 'id'));
select tst.ok((select status from public.studies where id = (select v::uuid from ctx where k = 'v4')) = 'draft', 'la versión nueva queda en borrador');
select tst.ok((select count(*) from public.news_items where study_id = (select v::uuid from ctx where k = 'v4')) = 11, 'copia las 11 tarjetas');
select tst.ok((select item_version from public.news_items where study_id = (select v::uuid from ctx where k = 'v4') and item_key = 'f_peaje') = 2, 'guarda la revisión copiada');
select tst.ok((select count(*) from public.survey_questions where study_id = (select v::uuid from ctx where k = 'v4'))
            = (select count(*) from public.survey_questions q join public.studies s on s.id = q.study_id where s.status = 'active'), 'copia las preguntas de la activa');

-- Editar el banco no cambia la versión ya armada
select public.save_news_card(pg_temp.card('{"headline": "Titular cambiado después de armar la versión 4.0.0"}'));
select tst.ok((select headline from public.news_items where study_id = (select v::uuid from ctx where k = 'v4') and item_key = 'f_peaje') like '%₡6.000%', 'editar el banco no altera versiones armadas');

-- Solo owner activa
select tst.ok(tst.err($$select public.activate_study_version((select v::uuid from ctx where k = 'v4'))$$) like '%forbidden%', 'analyst no activa');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
insert into ctx values ('prev', (select version from public.studies where code = 'lo-reenviarias' and status = 'active'));
select public.activate_study_version((select v::uuid from ctx where k = 'v4'));
select tst.ok((select version from public.studies where code = 'lo-reenviarias' and status = 'active') = '4.0.0', 'owner activa la 4.0.0');
select tst.ok((select status from public.studies where code = 'lo-reenviarias' and version = (select v from ctx where k = 'prev')) = 'closed', 'la anterior queda cerrada');
select tst.ok((select count(*) from public.studies where code = 'lo-reenviarias' and status = 'active') = 1, 'una sola versión activa');
select tst.ok(tst.err($$select public.activate_study_version((select id from public.studies where version = '1.0.0'))$$) like '%historica%', 'la 1.0.0 no se reactiva');
-- Volver atrás
select public.activate_study_version((select id from public.studies where code = 'lo-reenviarias' and version = (select v from ctx where k = 'prev')));
select tst.ok((select version from public.studies where code = 'lo-reenviarias' and status = 'active') = (select v from ctx where k = 'prev'), 'se puede volver a la versión anterior');
reset role;

-- Archivar borradores
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
insert into ctx values ('v5', (public.create_study_version('4.1.0', '', 'Borrador que se descartará.', (select array_agg(id) from public.news_bank where item_key <> 'f_peaje')) ->> 'id'));
select public.archive_study_draft((select v::uuid from ctx where k = 'v5'));
select tst.ok((select status from public.studies where id = (select v::uuid from ctx where k = 'v5')) = 'archived', 'borrador archivado');
select tst.ok(tst.err($$select public.archive_study_draft((select id from public.studies where status = 'active'))$$) like '%solo_se_archivan_borradores%', 'no archiva la activa');
select public.set_news_card_archived((select v::uuid from ctx where k = 'nueva'), true);
select tst.ok(tst.err($$select public.create_study_version('4.2.0','x','Con una tarjeta archivada.', (select array_agg(id) from public.news_bank))$$) like '%tarjeta_archivada%', 'no usa tarjetas archivadas');
reset role;

-- Una sesión nueva sigue funcionando con la versión activa
select tst.ok((public.start_session(gen_random_uuid(), true) ->> 'instrument_version') = (select v from ctx where k = 'prev'), 'start_session usa la versión activa');
select tst.ok((select count(*) from public.audit_events where action in ('create_news_card','edit_news_card','create_study_version','activate_study_version')) >= 5, 'todo queda en la auditoría');

select name from tst.results where not ok;
select format('TODAS LAS PRUEBAS OK (%s aserciones)', count(*)) from tst.results where ok;
