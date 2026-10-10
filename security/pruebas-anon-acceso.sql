-- Pruebas de acceso directo como visitante anónimo (rol anon): tablas, vistas, funciones de administración
-- y funciones del juego con sesiones ajenas inventadas. Todo se revierte al final.
do $$
declare
  r text := '';
  t text; n bigint; x jsonb;
  tabs text[] := array['participant_sessions','game_decisions','game_sessions_summary','survey_responses','share_decisions','source_opens',
    'leaderboard_entries','hint_events','response_codes','audit_events','admin_profiles','studies','news_items','news_bank','survey_questions',
    'radiografia_respuestas','radiografia_respuestas_backup_20261009','v_sessions','v_decisions','v_open_responses','v_share_decisions','v_share_sessions'];
  firstcol jsonb;
  admin_calls text[] := array[
    'select public.list_admins()', 'select public.grant_admin(''x@example.com'',''owner'',''x'')',
    'select public.revoke_admin(gen_random_uuid())', 'select public.is_admin(''viewer'')', 'select public.my_admin_profile()',
    'select public.purge_sessions(''test'',0)', 'select public.set_session_flags(gen_random_uuid(), true, null)',
    'select public.find_sessions_by_code(''ABC123'')', 'select public.log_export(''{}''::jsonb)',
    'select public.activate_study_version(gen_random_uuid())', 'select public.create_study_version(''9.9.9'',''x'',''x'',array[]::uuid[])',
    'select public.save_news_card(''{}''::jsonb)', 'select public.mark_abandoned_sessions(0)', 'select public._compute_summary(gen_random_uuid())'];
  c text;
begin
  select jsonb_object_agg(table_name, column_name) into firstcol from information_schema.columns
   where table_schema='public' and ordinal_position = 2;
  execute 'set local role anon';
  r := r || E'\nrol actual: ' || current_user;
  foreach t in array tabs loop
    begin execute format('select count(*) from public.%I', t) into n; r := r || E'\nLEER ' || t || ': PERMITIDO filas=' || n;
    exception when others then r := r || E'\nLEER ' || t || ': bloqueado (' || sqlstate || ')'; end;
  end loop;
  foreach t in array tabs loop
    begin execute format('insert into public.%I default values', t); r := r || E'\nINSERTAR ' || t || ': PERMITIDO';
    exception when others then r := r || E'\nINSERTAR ' || t || ': bloqueado (' || sqlstate || ')'; end;
  end loop;
  foreach t in array tabs loop
    begin execute format('update public.%I set %I = %I', t, firstcol->>t, firstcol->>t); get diagnostics n = row_count;
      r := r || E'\nMODIFICAR ' || t || ': PERMITIDO filas=' || n;
    exception when others then r := r || E'\nMODIFICAR ' || t || ': bloqueado (' || sqlstate || ')'; end;
  end loop;
  foreach c in array admin_calls loop
    begin execute c into x; r := r || E'\nRPC ' || left(c, 50) || ': PERMITIDO ' || left(coalesce(x::text,'null'), 80);
    exception when others then r := r || E'\nRPC ' || left(c, 50) || ': bloqueado (' || sqlstate || ' ' || left(sqlerrm, 50) || ')'; end;
  end loop;
  begin x := public.get_session(gen_random_uuid()); r := r || E'\nget_session(uuid inventado): DEVUELVE ' || left(x::text, 80);
  exception when others then r := r || E'\nget_session(uuid inventado): ' || sqlerrm; end;
  begin x := public.get_session_v4(gen_random_uuid()); r := r || E'\nget_session_v4(uuid inventado): DEVUELVE ' || left(x::text, 80);
  exception when others then r := r || E'\nget_session_v4(uuid inventado): ' || sqlerrm; end;
  begin x := public.submit_card(gen_random_uuid(), 1, '{"first_action":"reenviar","belief":"si"}'); r := r || E'\nsubmit_card(uuid inventado): PERMITIDO';
  exception when others then r := r || E'\nsubmit_card(uuid inventado): ' || sqlerrm; end;
  begin x := public.leaderboard_status(gen_random_uuid()); r := r || E'\nleaderboard_status(uuid inventado): ' || left(x::text, 120);
  exception when others then r := r || E'\nleaderboard_status(uuid inventado): ' || sqlerrm; end;
  begin x := public.public_stats('lo-reenviarias'); r := r || E'\npublic_stats: ' || x::text;
  exception when others then r := r || E'\npublic_stats: ' || sqlerrm; end;
  begin x := public.study_info('lo-reenviarias'); r := r || E'\nstudy_info: ' || x::text;
  exception when others then r := r || E'\nstudy_info: ' || sqlerrm; end;
  raise exception 'PRUEBA_REVERTIDA%', r;
end $$;
