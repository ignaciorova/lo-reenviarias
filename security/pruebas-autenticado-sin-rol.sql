-- Pruebas como usuario con sesión iniciada pero sin rol (rol authenticated, uid aleatorio, JWT con "owner" falso en metadatos).
-- Todo se revierte al final.
do $$
declare
  r text := ''; t text; n bigint; x jsonb; c text; firstcol jsonb;
  tabs text[] := array['participant_sessions','game_decisions','game_sessions_summary','survey_responses','share_decisions','source_opens',
    'leaderboard_entries','hint_events','response_codes','audit_events','admin_profiles','studies','news_items','news_bank','survey_questions',
    'radiografia_respuestas','radiografia_respuestas_backup_20261009','v_sessions','v_decisions','v_open_responses','v_share_decisions','v_share_sessions',
    'platform_settings','session_integrity'];
  admin_calls text[] := array[
    'select public.list_admins()', 'select public.grant_admin(''x@example.com'',''owner'',''x'')',
    'select public.revoke_admin(gen_random_uuid())', 'select to_jsonb(public.is_admin(''viewer''))', 'select to_jsonb(public.my_admin_profile())',
    'select public.purge_sessions(''test'',0)', 'select public.set_session_flags(gen_random_uuid(), true, null)',
    'select public.find_sessions_by_code(''ABC123'')', 'select public.log_export(''{}''::jsonb)',
    'select public.export_dataset(''v4_sesiones'', ''{}''::jsonb)', 'select public.review_automation(gen_random_uuid(), true, null)',
    'select public.recompute_automation_signals(null)', 'select to_jsonb(public.set_platform_setting(''burst_sessions_per_minute'', 10))',
    'select (select jsonb_agg(x) from public.get_platform_settings() x)',
    'select public.activate_study_version(gen_random_uuid())', 'select public.create_study_version(''9.9.9'',''x'',''x'',array[]::uuid[])',
    'select public.save_news_card(''{}''::jsonb)', 'select public.save_news_sources(gen_random_uuid(), ''[]''::jsonb)',
    'select public.set_news_card_archived(gen_random_uuid(), true)', 'select public.archive_study_draft(gen_random_uuid())',
    'select public.set_draft_leaderboard(gen_random_uuid(), true)', 'select public.set_draft_survey(gen_random_uuid(), null, null)',
    'select public.add_response_code(1, ''x'', null)', 'select public.remove_response_code(1, ''x'')',
    'select public.mark_abandoned_sessions(0)'];
begin
  select jsonb_object_agg(table_name, column_name) into firstcol from information_schema.columns where table_schema='public' and ordinal_position = 2;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'email', 'intruso@example.com',
     'app_metadata', json_build_object('role','owner'), 'user_metadata', json_build_object('role','owner'))::text, true);
  execute 'set local role authenticated';
  r := r || E'\nrol: ' || current_user || ' uid=' || auth.uid();
  foreach t in array tabs loop
    begin execute format('select count(*) from public.%I', t) into n; r := r || E'\nLEER ' || t || ': filas visibles=' || n;
    exception when others then r := r || E'\nLEER ' || t || ': bloqueado (' || sqlstate || ')'; end;
  end loop;
  foreach t in array tabs loop
    begin execute format('insert into public.%I default values', t); r := r || E'\nINSERTAR ' || t || ': PERMITIDO';
    exception when others then r := r || E'\nINSERTAR ' || t || ': bloqueado (' || sqlstate || ')'; end;
  end loop;
  foreach t in array tabs loop
    begin execute format('update public.%I set %I = %I', t, firstcol->>t, firstcol->>t); get diagnostics n = row_count;
      r := r || E'\nMODIFICAR ' || t || ': filas=' || n;
    exception when others then r := r || E'\nMODIFICAR ' || t || ': bloqueado (' || sqlstate || ')'; end;
  end loop;
  foreach c in array admin_calls loop
    begin execute c into x; r := r || E'\nRPC ' || left(c, 55) || ': devuelve ' || left(coalesce(x::text,'null'), 60);
    exception when others then r := r || E'\nRPC ' || left(c, 55) || ': bloqueado (' || sqlstate || ' ' || left(sqlerrm, 40) || ')'; end;
  end loop;
  begin select count(*) into n from storage.objects; r := r || E'\nstorage.objects visibles: ' || n;
  exception when others then r := r || E'\nstorage.objects: bloqueado (' || sqlstate || ')'; end;
  begin insert into storage.objects (bucket_id, name) values ('noticias', 'auditoria/prueba.png'); r := r || E'\nsubir a noticias: PERMITIDO';
  exception when others then r := r || E'\nsubir a noticias: bloqueado (' || sqlstate || ' ' || left(sqlerrm,50) || ')'; end;
  raise exception 'PRUEBA_REVERTIDA%', r;
end $$;
