-- ============================================================================
-- 0005: migración NO destructiva desde la tabla original public.radiografia_respuestas
-- - Si la tabla no existe: no hace nada.
-- - Si existe: (1) crea un respaldo íntegro, (2) cierra la lectura anónima,
--   (3) copia cada fila al modelo relacional como sesión de la versión 1.0.0.
-- - Es re-ejecutable: las filas ya migradas se omiten (legacy_source_id único).
-- - La tabla original NO se borra ni se modifica (salvo permisos).
-- ============================================================================
do $$
declare
  v_study uuid;
  v_backup text := 'radiografia_respuestas_backup_20261009';
  r record;
  j jsonb;
  v_sid uuid;
  v_key text;
  a jsonb;
  v_item public.news_items;
  v_choice text;
  v_src text;
  v_cmd text;
  v_q record;
  v_val text;
begin
  if to_regclass('public.radiografia_respuestas') is null then
    raise notice 'radiografia_respuestas no existe: nada que migrar';
    return;
  end if;

  -- (1) Respaldo íntegro (solo la primera vez)
  if to_regclass('public.' || v_backup) is null then
    execute format('create table public.%I as table public.radiografia_respuestas', v_backup);
    execute format('alter table public.%I enable row level security', v_backup);
    execute format('revoke all on public.%I from anon, authenticated, public', v_backup);
    execute format('comment on table public.%I is %L', v_backup, 'Respaldo íntegro de radiografia_respuestas antes de migrar (2026-10-09). No modificar.');
  end if;

  -- (2) Cerrar la lectura pública de la tabla original. Se conserva INSERT anónimo
  --     para no perder datos si el HTML original sigue en circulación.
  execute 'alter table public.radiografia_respuestas enable row level security';
  execute 'revoke all on public.radiografia_respuestas from anon, authenticated, public';
  -- Las políticas existentes no se borran (se conservan para auditoría): se neutralizan.
  -- Las de lectura pasan a ser solo para administradores; el resto queda sin efecto.
  for v_src, v_cmd in select policyname, cmd from pg_policies
      where schemaname = 'public' and tablename = 'radiografia_respuestas'
        and policyname not in ('legacy_insert_only', 'admin_read') loop
    if v_cmd = 'SELECT' then
      execute format('alter policy %I on public.radiografia_respuestas to authenticated using ((select public.is_admin(''viewer'')))', v_src);
    elsif v_cmd = 'INSERT' then
      execute format('alter policy %I on public.radiografia_respuestas to authenticated with check (false)', v_src);
    elsif v_cmd = 'ALL' then
      execute format('alter policy %I on public.radiografia_respuestas to authenticated using (false) with check (false)', v_src);
    else
      execute format('alter policy %I on public.radiografia_respuestas to authenticated using (false)', v_src);
    end if;
  end loop;
  execute 'grant insert on public.radiografia_respuestas to anon';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'radiografia_respuestas' and policyname = 'legacy_insert_only') then
    execute $p$create policy legacy_insert_only on public.radiografia_respuestas for insert to anon with check (true)$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'radiografia_respuestas' and policyname = 'admin_read') then
    execute $p$create policy admin_read on public.radiografia_respuestas for select to authenticated using ((select public.is_admin('viewer')))$p$;
  end if;
  execute 'grant select on public.radiografia_respuestas to authenticated';

  -- (3) Copia al modelo relacional
  select id into v_study from public.studies where code = 'lo-reenviarias' and version = '1.0.0';

  for r in execute 'select * from public.radiografia_respuestas' loop
    j := to_jsonb(r);
    v_src := coalesce(j ->> 'id', md5(j::text));
    continue when exists (select 1 from public.participant_sessions where legacy_source_id = 'legacy:' || v_src);

    v_sid := gen_random_uuid();
    insert into public.participant_sessions
      (id, study_id, instrument_version, origin, status, consent_accepted, started_at, completed_at,
       duration_seconds, presentation_order, hints_remaining, legacy_source_id)
    values
      (v_sid, v_study, '1.0.0', 'legacy_import', 'completed', false,
       coalesce((j ->> 'created_at')::timestamptz - make_interval(secs => coalesce((j ->> 'duracion_seg')::int, 0)), (j ->> 'created_at')::timestamptz, now()),
       coalesce((j ->> 'created_at')::timestamptz, now()),
       nullif(j ->> 'duracion_seg', '')::int,
       '{}', 0, 'legacy:' || v_src);

    -- Respuestas de opinión
    for v_q in select * from public.survey_questions where study_id = v_study loop
      v_val := nullif(btrim(j ->> v_q.question_key), '');
      continue when v_val is null;
      if v_q.kind = 'single' then
        insert into public.survey_responses (session_id, question_id, phase, option_value, created_at)
        values (v_sid, v_q.id, v_q.phase, left(v_val, 120), coalesce((j ->> 'created_at')::timestamptz, now()));
      else
        insert into public.survey_responses (session_id, question_id, phase, text_value, created_at)
        values (v_sid, v_q.id, v_q.phase, left(v_val, 1500), coalesce((j ->> 'created_at')::timestamptz, now()));
      end if;
    end loop;

    -- Decisiones (el original no guardaba la posición ni los puntos por noticia)
    if jsonb_typeof(j -> 'respuestas') = 'object' then
      for v_key, a in select * from jsonb_each(j -> 'respuestas') loop
        select * into v_item from public.news_items where study_id = v_study and item_key = v_key;
        continue when not found;
        v_choice := case when a ->> 'g' in ('real','falsa') then a ->> 'g' else null end;
        insert into public.game_decisions
          (session_id, news_item_id, position, choice, correct_classification, is_correct, timed_out,
           hint_used, response_ms, points_awarded, streak_after, simulated_reach, instrument_version, created_at)
        values
          (v_sid, v_item.id, null, v_choice, case when v_item.is_real then 'real' else 'falsa' end,
           -- se recalcula el acierto con la clave de respuestas de la versión 1.0.0
           v_choice is not null and ((v_choice = 'real') = v_item.is_real),
           v_choice is null, coalesce((a ->> 'lupa')::boolean, false),
           case when (a ->> 'ms') ~ '^[0-9]+$' then least((a ->> 'ms')::int, 600000) else null end,
           null, null, 0, '1.0.0', coalesce((j ->> 'created_at')::timestamptz, now()))
        on conflict do nothing;
      end loop;
    end if;

    perform public._compute_summary(v_sid);
    -- Valores originales del cliente, para comparación/auditoría
    update public.game_sessions_summary
       set score = nullif(j ->> 'puntos', '')::int,
           simulated_reach_total = coalesce(nullif(j ->> 'alcance_simulado', '')::int, 0)
     where session_id = v_sid;
  end loop;
end $$;
