-- Pruebas de la partida 4.0.0 como visitante anónimo. Todo se revierte al final.
do $$
declare
  r text := ''; x jsonb; sid uuid := gen_random_uuid(); truth jsonb; i int; b text; says jsonb; k text;
begin
  execute 'set local role anon';
  r := r || E'\nrol: ' || current_user;
  begin x := public.start_session(gen_random_uuid(), true, 'desktop', false, 'lo-reenviarias'); r := r || E'\nstart_session antiguo con 4.0.0 activa: PERMITIDO';
  exception when others then r := r || E'\nstart_session antiguo con 4.0.0 activa: ' || sqlerrm; end;
  begin x := public.start_session_v4(gen_random_uuid(), false, 'desktop', false, null, null, null, 'lo-reenviarias', false); r := r || E'\nsin consentimiento: PERMITIDO';
  exception when others then r := r || E'\nsin consentimiento: ' || sqlerrm; end;
  begin x := public.start_session_v4(gen_random_uuid(), true, 'desktop', false, 'javascript:alert(1)', null, null, 'lo-reenviarias', false); r := r || E'\norigen inventado: aceptado, origen guardado=' || coalesce(x->>'entry_origin','(no se devuelve)');
  exception when others then r := r || E'\norigen inventado: ' || sqlerrm; end;
  x := public.start_session_v4(sid, true, 'desktop', false, null, null, null, 'lo-reenviarias', false);
  r := r || E'\npartida: version=' || coalesce(x->>'instrument_version','?') || ' claves=' || (select string_agg(k2, ',') from jsonb_object_keys(x) k2);
  r := r || E'\n  claves de una noticia: ' || (select string_agg(k2, ',') from jsonb_object_keys(x->'items'->0) k2);
  r := r || E'\n  ¿el payload revela la respuesta (is_real / says / explanation)? ' || (x::text ~ '"is_real"|"says"|"explanation"|"belief_correct"')::text;
  begin x := public.submit_card(sid, 1, '{"first_action":"reenviar","belief":"si"}'); r := r || E'\n  decidir sin encuesta previa: PERMITIDO';
  exception when others then r := r || E'\n  decidir sin encuesta previa: ' || sqlerrm; end;
  begin x := public.submit_survey(sid, 'pre', '{"primera_vez":"Quizás"}'); r := r || E'\n  encuesta con opción inventada: PERMITIDO';
  exception when others then r := r || E'\n  encuesta con opción inventada: ' || sqlerrm; end;
  x := public.submit_survey(sid, 'pre', '{"primera_vez":"Sí, es la primera vez"}');
  begin x := public.submit_card(sid, 2, '{"first_action":"reenviar","belief":"si"}'); r := r || E'\n  saltar a la noticia 2: PERMITIDO';
  exception when others then r := r || E'\n  saltar a la noticia 2: ' || sqlerrm; end;
  begin x := public.submit_card(sid, 1, '{"first_action":"reenviar","belief":"si","points":5000,"state":"E6"}'); r := r || E'\n  tarjeta con puntos/estado inyectados: aceptada; puntos guardados=' || coalesce(x->>'points', x->'decision'->>'points', '?') || ' estado=' || coalesce(x->>'state', x->'decision'->>'state','?');
  exception when others then r := r || E'\n  tarjeta con puntos inyectados: ' || sqlerrm; end;
  begin x := public.submit_card(sid, 2, '{"first_action":"verificar","source_kind":"oficial","evaluation":"confirma","final_action":"no_reenviar","belief":"si","read_ms":60000}'); r := r || E'\n  verificar sin abrir fuente: PERMITIDO';
  exception when others then r := r || E'\n  verificar sin abrir fuente: ' || sqlerrm; end;
  begin x := public.open_source(sid, 5, 'oficial'); r := r || E'\n  abrir fuente de otra noticia (pos 5): PERMITIDO';
  exception when others then r := r || E'\n  abrir fuente de otra noticia: ' || sqlerrm; end;
  begin x := public.open_source(sid, 2, 'inventada'); r := r || E'\n  abrir fuente inexistente: PERMITIDO';
  exception when others then r := r || E'\n  abrir fuente inexistente: ' || sqlerrm; end;
  x := public.open_source(sid, 2, 'oficial');
  r := r || E'\n  open_source devuelve: ' || (select string_agg(k2, ',') from jsonb_object_keys(x) k2) || ' ¿revela says? ' || (x::text ~ '"says"')::text;
  x := public.submit_card(sid, 2, '{"first_action":"verificar","source_kind":"oficial","evaluation":"confirma","final_action":"no_reenviar","belief":"si","read_ms":600000}');
  r := r || E'\n  read_ms declarado 600000 justo tras abrir: guardado=' || coalesce(x->>'read_ms', x->'decision'->>'read_ms', '?') || ' verificación efectiva=' || coalesce(x->>'effective_verification', x->'decision'->>'effective_verification', '?');
  begin x := public.complete_session_v4(sid); r := r || E'\n  cerrar sin terminar: PERMITIDO';
  exception when others then r := r || E'\n  cerrar sin terminar: ' || sqlerrm; end;

  -- Puntaje máximo con respuestas aprendidas (la retroalimentación del juego revela si cada noticia era real)
  execute 'reset role';
  select jsonb_agg(n.is_real order by o.ord) into truth
    from public.participant_sessions ps, unnest(ps.presentation_order) with ordinality o(item, ord) join public.news_items n on n.id = o.item where ps.id = sid;
  execute 'set local role anon';
  for i in 3..10 loop
    b := case when (truth->>(i-1))::boolean then 'si' else 'no' end;
    x := public.submit_card(sid, i, jsonb_build_object('first_action','no_reenviar','belief',b,'first_action_ms',0));
  end loop;
  r := r || E'\n  feedback trae: ' || (select string_agg(k2, ',') from jsonb_object_keys(x) k2);
  x := public.complete_session_v4(sid);
  r := r || E'\n  resumen: puntaje=' || coalesce(x->>'score','?') || ' aciertos=' || coalesce(x->>'correct_count','?') || ' (máximo posible 600+10*100=1600)';
  begin x := public.join_leaderboard(sid, 999, -1, 100000); r := r || E'\n  apodo fuera de rango: PERMITIDO';
  exception when others then r := r || E'\n  apodo fuera de rango: ' || sqlerrm; end;
  begin x := public.join_leaderboard(sid, 1, 1, 1); r := r || E'\n  ranking: alias=' || coalesce(x->>'alias','?') || ' puesto=' || coalesce(x->>'rank','?') || ' top_claves=' || coalesce((select string_agg(k2, ',') from jsonb_object_keys(x->'top'->0) k2),'(vacío)');
  exception when others then r := r || E'\n  ranking: ' || sqlerrm; end;
  begin x := public.join_leaderboard(sid, 1, 1, 1); r := r || E'\n  ranking otra vez: PERMITIDO';
  exception when others then r := r || E'\n  ranking otra vez: ' || sqlerrm; end;
  begin x := public.join_leaderboard(gen_random_uuid(), 1, 1, 1); r := r || E'\n  ranking con sesión ajena inventada: PERMITIDO';
  exception when others then r := r || E'\n  ranking con sesión ajena inventada: ' || sqlerrm; end;
  begin x := public.submit_card(sid, 10, '{"first_action":"reenviar","belief":"no"}'); r := r || E'\n  reescribir respuesta 10: devuelve la original (estado=' || coalesce(x->>'state','?') || ')';
  exception when others then r := r || E'\n  reescribir respuesta 10: ' || sqlerrm; end;
  raise exception 'PRUEBA_REVERTIDA%', r;
end $$;
