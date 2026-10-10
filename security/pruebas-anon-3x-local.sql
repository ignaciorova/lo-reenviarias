-- Pruebas como visitante anónimo (rol anon). Todo ocurre en una transacción que se revierte al final.
do $$
declare
  r text := '';
  t text; n bigint; x jsonb; sid uuid := gen_random_uuid(); sid2 uuid := gen_random_uuid();
  tabs text[] := array['participant_sessions','game_decisions','game_sessions_summary','survey_responses','share_decisions','source_opens',
    'leaderboard_entries','hint_events','response_codes','audit_events','admin_profiles','studies','news_items','news_bank','survey_questions',
    'radiografia_respuestas','radiografia_respuestas_backup_20261009','v_sessions','v_decisions','v_open_responses','v_share_decisions','v_share_sessions',
    'platform_settings','session_integrity'];
  firstcol jsonb; truth jsonb; v4id uuid; pts int; i int; ch text;
  admin_calls text[] := array[
    'select public.list_admins()', 'select public.grant_admin(''x@example.com'',''owner'',''x'')',
    'select public.revoke_admin(gen_random_uuid())', 'select public.is_admin(''viewer'')', 'select public.my_admin_profile()',
    'select public.purge_sessions(''test'',0)', 'select public.set_session_flags(gen_random_uuid(), true, null)',
    'select public.find_sessions_by_code(''ABC123'')', 'select public.log_export(''{}''::jsonb)',
    'select public.export_dataset(''v4_sesiones'', ''{}''::jsonb)', 'select public.review_automation(gen_random_uuid(), true, null)',
    'select public.recompute_automation_signals(null)', 'select to_jsonb(public.set_platform_setting(''burst_sessions_per_minute'', 10))',
    'select (select jsonb_agg(x) from public.get_platform_settings() x)',
    'select public.activate_study_version(gen_random_uuid())', 'select public.create_study_version(''9.9.9'',''x'',''x'',array[]::uuid[])',
    'select public.save_news_card(''{}''::jsonb)', 'select public.mark_abandoned_sessions(0)', 'select public._compute_summary(gen_random_uuid())'];
  c text;
begin
  -- Datos de referencia leídos ANTES de cambiar de rol (lo que una persona podría aprender jugando: el juego revela la respuesta tras cada noticia)
  select jsonb_object_agg(table_name, column_name) into firstcol from information_schema.columns
   where table_schema='public' and ordinal_position = 2;
  select id into v4id from public.studies where version='4.0.0';

  execute 'set local role anon';
  r := r || E'\nrol actual: ' || current_user;

  -- 1. Lectura directa de tablas y vistas
  foreach t in array tabs loop
    begin execute format('select count(*) from public.%I', t) into n; r := r || E'\nLEER ' || t || ': PERMITIDO filas=' || n;
    exception when others then r := r || E'\nLEER ' || t || ': bloqueado (' || sqlstate || ' ' || left(sqlerrm, 60) || ')'; end;
  end loop;

  -- 2. Inserción directa
  foreach t in array tabs loop
    begin execute format('insert into public.%I default values', t); r := r || E'\nINSERTAR ' || t || ': PERMITIDO';
    exception when others then r := r || E'\nINSERTAR ' || t || ': bloqueado (' || sqlstate || ' ' || left(sqlerrm, 60) || ')'; end;
  end loop;

  -- 3. Modificación directa
  foreach t in array tabs loop
    begin execute format('update public.%I set %I = %I', t, firstcol->>t, firstcol->>t); get diagnostics n = row_count;
      r := r || E'\nMODIFICAR ' || t || ': PERMITIDO filas=' || n;
    exception when others then r := r || E'\nMODIFICAR ' || t || ': bloqueado (' || sqlstate || ' ' || left(sqlerrm, 60) || ')'; end;
  end loop;

  -- 4. Funciones de administración
  foreach c in array admin_calls loop
    begin execute c into x; r := r || E'\nRPC ' || left(c, 50) || ': PERMITIDO ' || left(coalesce(x::text,'null'), 80);
    exception when others then r := r || E'\nRPC ' || left(c, 50) || ': bloqueado (' || sqlstate || ' ' || left(sqlerrm, 60) || ')'; end;
  end loop;

  -- 5. Funciones del juego con una sesión ajena inventada
  begin x := public.get_session(gen_random_uuid()); r := r || E'\nget_session(uuid inventado): DEVUELVE ' || left(x::text, 80);
  exception when others then r := r || E'\nget_session(uuid inventado): ' || sqlerrm; end;
  begin x := public.submit_decision(gen_random_uuid(), 1, 'real', 1000); r := r || E'\nsubmit_decision(uuid inventado): PERMITIDO';
  exception when others then r := r || E'\nsubmit_decision(uuid inventado): ' || sqlerrm; end;
  begin x := public.leaderboard_status(gen_random_uuid()); r := r || E'\nleaderboard_status(uuid inventado): ' || left(x::text, 120);
  exception when others then r := r || E'\nleaderboard_status(uuid inventado): ' || sqlerrm; end;
  begin x := public.public_stats('lo-reenviarias'); r := r || E'\npublic_stats: ' || x::text;
  exception when others then r := r || E'\npublic_stats: ' || sqlerrm; end;
  begin x := public.study_info('lo-reenviarias'); r := r || E'\nstudy_info: ' || x::text;
  exception when others then r := r || E'\nstudy_info: ' || sqlerrm; end;
  begin x := public.start_session_v4(gen_random_uuid(), true, 'desktop', false, null, null, null, 'lo-reenviarias', false); r := r || E'\nstart_session_v4 con 4.0.0 en borrador: PERMITIDO ' || left(x::text,80);
  exception when others then r := r || E'\nstart_session_v4 con 4.0.0 en borrador: ' || sqlerrm; end;

  -- 6. Partida legítima propia (3.1.0) y validaciones del servidor
  x := public.start_session(sid, true, 'desktop', false, 'lo-reenviarias');
  r := r || E'\npartida propia: version=' || (x->>'instrument_version') || ' claves item=' || (select string_agg(k, ',') from jsonb_object_keys(x->'items'->0) k);
  r := r || E'\n  ¿el payload trae la respuesta correcta? ' || (x::text ~ '"is_real"|"correct_classification"|"explanation"')::text;
  begin x := public.start_session(sid, false, 'desktop', false, 'lo-reenviarias'); r := r || E'\n  start_session sin consentimiento (mismo id): ' || left(x->>'status', 40);
  exception when others then r := r || E'\n  start_session sin consentimiento: ' || sqlerrm; end;
  begin x := public.start_session(sid2, false, 'desktop', false, 'lo-reenviarias'); r := r || E'\n  start_session nueva sin consentimiento: PERMITIDO';
  exception when others then r := r || E'\n  start_session nueva sin consentimiento: ' || sqlerrm; end;
  begin x := public.submit_decision(sid, 1, 'real', 1000); r := r || E'\n  decidir sin encuesta previa: PERMITIDO';
  exception when others then r := r || E'\n  decidir sin encuesta previa: ' || sqlerrm; end;
  begin x := public.submit_survey(sid, 'pre', '{"opinion":"abc","verifica":"Siempre","compartio_falso":"No","responsable":"Todos por igual","puntos":9999}'); r := r || E'\n  encuesta con clave extra: PERMITIDO';
  exception when others then r := r || E'\n  encuesta con clave extra: ' || sqlerrm; end;
  begin x := public.submit_survey(sid, 'pre', '{"opinion":"abc","verifica":"Inventado","compartio_falso":"No","responsable":"Todos por igual"}'); r := r || E'\n  encuesta con opción inventada: PERMITIDO';
  exception when others then r := r || E'\n  encuesta con opción inventada: ' || sqlerrm; end;
  x := public.submit_survey(sid, 'pre', '{"opinion":"<script>alert(1)</script>","verifica":"Siempre","compartio_falso":"No","responsable":"Todos por igual"}');
  r := r || E'\n  encuesta válida: ok';
  begin x := public.submit_decision(sid, 3, 'real', 1000); r := r || E'\n  saltar a la noticia 3: PERMITIDO';
  exception when others then r := r || E'\n  saltar a la noticia 3: ' || sqlerrm; end;
  begin x := public.submit_decision(sid, 1, 'verdadera', 1000); r := r || E'\n  opción inventada: PERMITIDO';
  exception when others then r := r || E'\n  opción inventada: ' || sqlerrm; end;
  begin x := public.submit_decision(sid, 1, 'real', -5); r := r || E'\n  tiempo negativo: PERMITIDO';
  exception when others then r := r || E'\n  tiempo negativo: ' || sqlerrm; end;
  begin x := public.submit_card(sid, 1, '{"first_action":"reenviar","belief":"si"}'); r := r || E'\n  función 4.0.0 sobre partida 3.1.0: PERMITIDO';
  exception when others then r := r || E'\n  función 4.0.0 sobre partida 3.1.0: ' || sqlerrm; end;
  begin x := public.complete_session(sid); r := r || E'\n  cerrar partida sin terminar: PERMITIDO';
  exception when others then r := r || E'\n  cerrar partida sin terminar: ' || sqlerrm; end;
  begin x := public.join_leaderboard(sid, 1, 1, 1); r := r || E'\n  ranking sin terminar: PERMITIDO';
  exception when others then r := r || E'\n  ranking sin terminar: ' || sqlerrm; end;

  -- 7. Manipulación de puntaje: respuestas aprendidas + tiempo declarado 0 ms
  execute 'reset role';
  select jsonb_agg(n2.is_real order by o.ord) into truth
    from public.participant_sessions ps, unnest(ps.presentation_order) with ordinality o(item, ord) join public.news_items n2 on n2.id = o.item
   where ps.id = sid;
  execute 'set local role anon';
  pts := 0;
  for i in 1..10 loop
    ch := case when (truth->>(i-1))::boolean then 'real' else 'falsa' end;
    x := public.submit_decision(sid, i, ch, 0);
    pts := pts + coalesce((x->>'points_awarded')::int, (x->'decision'->>'points_awarded')::int, 0);
  end loop;
  r := r || E'\n  10 respuestas correctas declarando 0 ms: claves respuesta=' || (select string_agg(k, ',') from jsonb_object_keys(x) k);
  x := public.submit_survey(sid, 'post', '{"post_cambio":"Tal vez"}');
  x := public.complete_session(sid);
  r := r || E'\n  resumen: claves=' || (select string_agg(k, ',') from jsonb_object_keys(x) k) || ' puntaje=' || coalesce(x->>'score', x->'summary'->>'score', '?') || ' aciertos=' || coalesce(x->>'correct_count', x->'summary'->>'correct_count', '?') || ' puntos_sumados=' || pts;
  begin x := public.join_leaderboard(sid, 1, 1, 1); r := r || E'\n  ranking: ' || left(x::text, 200);
  exception when others then r := r || E'\n  ranking: ' || sqlerrm; end;
  begin x := public.join_leaderboard(sid, 2, 2, 2); r := r || E'\n  ranking otra vez: PERMITIDO';
  exception when others then r := r || E'\n  ranking otra vez: ' || sqlerrm; end;
  begin x := public.submit_decision(sid, 10, 'falsa', 0); r := r || E'\n  cambiar respuesta ya dada (pos 10): devuelve la original, puntos=' || coalesce(x->>'points_awarded', x::text);
  exception when others then r := r || E'\n  cambiar respuesta ya dada: ' || sqlerrm; end;

  raise exception 'PRUEBA_REVERTIDA%', r;
end $$;
