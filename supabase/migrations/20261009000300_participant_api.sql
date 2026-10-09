-- ============================================================================
-- 0003: API pública para participantes (funciones RPC SECURITY DEFINER)
-- El rol anon NO tiene acceso a ninguna tabla; solo puede ejecutar estas funciones.
-- Todas las funciones validan entradas y son idempotentes ante reintentos.
-- ============================================================================

-- Configuración efectiva de un estudio (con valores por defecto)
create or replace function public._cfg(p_study public.studies, p_key text, p_default numeric)
returns numeric language sql immutable set search_path = '' as $$
  select coalesce((p_study.config ->> p_key)::numeric, p_default)
$$;

-- Carga útil (sin respuestas correctas) para reanudar o iniciar una sesión
create or replace function public._session_payload(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.participant_sessions;
  st public.studies;
  v_items jsonb;
  v_decisions jsonb;
  v_questions jsonb;
  v_answered jsonb;
  v_hints jsonb;
begin
  select * into s from public.participant_sessions where id = p_session_id;
  if not found then return null; end if;
  select * into st from public.studies where id = s.study_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'position', o.ord, 'item_id', n.id, 'headline', n.headline,
           'display', n.display - 'src_label'
         ) order by o.ord), '[]'::jsonb)
    into v_items
    from unnest(s.presentation_order) with ordinality as o(item_id, ord)
    join public.news_items n on n.id = o.item_id;

  select coalesce(jsonb_agg(public._decision_feedback(d.id) order by d.position), '[]'::jsonb)
    into v_decisions
    from public.game_decisions d where d.session_id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', q.question_key, 'phase', q.phase, 'kind', q.kind, 'prompt', q.prompt,
           'options', to_jsonb(q.options), 'required', q.required,
           'min_length', q.min_length, 'max_length', q.max_length
         ) order by q.position), '[]'::jsonb)
    into v_questions
    from public.survey_questions q where q.study_id = s.study_id;

  select coalesce(jsonb_agg(distinct r.phase), '[]'::jsonb) into v_answered
    from public.survey_responses r where r.session_id = s.id;

  select coalesce(jsonb_object_agg(o.ord::text, n.hint), '{}'::jsonb) into v_hints
    from unnest(s.presentation_order) with ordinality as o(item_id, ord)
    join public.news_items n on n.id = o.item_id
    join public.hint_events h on h.session_id = s.id and h.news_item_id = n.id;

  return jsonb_build_object(
    'session_id', s.id,
    'status', s.status,
    'instrument_version', s.instrument_version,
    'config', jsonb_build_object(
      'items_per_session', cardinality(s.presentation_order),
      'seconds_per_item', public._cfg(st, 'seconds_per_item', 20),
      'hints_per_session', public._cfg(st, 'hints_per_session', 2)
    ),
    'hints_remaining', s.hints_remaining,
    'hints_used', v_hints,
    'questions', v_questions,
    'answered_phases', v_answered,
    'items', v_items,
    'decisions', v_decisions,
    'summary', case when s.status = 'completed' then public._summary_payload(s.id) else null end
  );
end $$;

-- Retroalimentación de una decisión ya registrada (solo se revela después de decidir)
create or replace function public._decision_feedback(p_decision_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d public.game_decisions;
  n public.news_items;
  st public.studies;
  v_total int;
  v_crowd jsonb := null;
  v_n int; v_err int;
begin
  select * into d from public.game_decisions where id = p_decision_id;
  select * into n from public.news_items where id = d.news_item_id;
  select * into st from public.studies where id = n.study_id;
  select coalesce(sum(points_awarded),0) into v_total
    from public.game_decisions where session_id = d.session_id and position <= d.position;

  if coalesce((st.config ->> 'show_crowd_feedback')::boolean, false) then
    select count(*), count(*) filter (where not gd.is_correct) into v_n, v_err
      from public.game_decisions gd
      join public.participant_sessions ps on ps.id = gd.session_id
     where gd.news_item_id = n.id and ps.status = 'completed' and not ps.is_test
       and ps.exclusion_reason is null and gd.session_id <> d.session_id;
    if v_n >= public._cfg(st, 'min_crowd_n', 3) then
      v_crowd := jsonb_build_object('n', v_n, 'error_pct', round(100.0 * v_err / v_n));
    end if;
  end if;

  return jsonb_build_object(
    'position', d.position,
    'item_id', n.id,
    'choice', d.choice,
    'timed_out', d.timed_out,
    'is_correct', d.is_correct,
    'is_real', n.is_real,
    'hint_used', d.hint_used,
    'points_awarded', d.points_awarded,
    'streak', d.streak_after,
    'total_score', v_total,
    'simulated_reach', d.simulated_reach,
    'explanation', n.explanation,
    'red_flags', to_jsonb(n.red_flags),
    'source_label', n.display ->> 'src_label',
    'crowd', v_crowd
  );
end $$;

-- Resumen final para el participante
create or replace function public._summary_payload(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  g public.game_sessions_summary;
  s public.participant_sessions;
  st public.studies;
  v_n int; v_lower int; v_pct int := null;
  v_recap jsonb;
begin
  select * into g from public.game_sessions_summary where session_id = p_session_id;
  if not found then return null; end if;
  select * into s from public.participant_sessions where id = p_session_id;
  select * into st from public.studies where id = s.study_id;

  select count(*), count(*) filter (where gs.score < g.score) into v_n, v_lower
    from public.game_sessions_summary gs
    join public.participant_sessions ps on ps.id = gs.session_id
   where ps.study_id = s.study_id and ps.status = 'completed' and not ps.is_test
     and ps.exclusion_reason is null and ps.id <> s.id;
  if v_n >= public._cfg(st, 'percentile_min_n', 20) then
    v_pct := round(100.0 * v_lower / v_n);
  end if;

  select jsonb_agg(jsonb_build_object('position', d.position, 'headline', n.headline, 'is_real', n.is_real,
                                      'is_correct', d.is_correct, 'timed_out', d.timed_out, 'hint_used', d.hint_used)
                   order by d.position)
    into v_recap
    from public.game_decisions d join public.news_items n on n.id = d.news_item_id
   where d.session_id = p_session_id;

  return jsonb_build_object(
    'correct_count', g.correct_count, 'decisions_count', g.decisions_count, 'score', g.score,
    'hints_used', g.hints_used, 'simulated_reach_total', g.simulated_reach_total,
    'percentile', v_pct, 'percentile_n', v_n, 'recap', coalesce(v_recap, '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- start_session: crea (o reanuda) una sesión anónima
-- ---------------------------------------------------------------------------
create or replace function public.start_session(
  p_session_id uuid,
  p_consent boolean,
  p_device_class text default 'unknown',
  p_reduced_motion boolean default null,
  p_study_code text default 'lo-reenviarias'
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  st public.studies;
  v_recent int;
  v_order uuid[];
begin
  if p_session_id is null then raise exception 'invalid_session_id' using errcode = '22023'; end if;

  -- Reintento idempotente: si la sesión existe, se devuelve tal cual
  if exists (select 1 from public.participant_sessions where id = p_session_id) then
    return public._session_payload(p_session_id);
  end if;

  if p_consent is distinct from true then raise exception 'consent_required' using errcode = '22023'; end if;
  if p_device_class not in ('mobile','tablet','desktop','unknown') then p_device_class := 'unknown'; end if;

  select * into st from public.studies where code = p_study_code and status = 'active';
  if not found then raise exception 'study_not_active' using errcode = 'P0002'; end if;

  -- Límite global de frecuencia (no se almacena IP)
  select count(*) into v_recent from public.participant_sessions
   where study_id = st.id and started_at > now() - interval '1 minute';
  if v_recent >= public._cfg(st, 'max_sessions_per_minute', 120) then
    raise exception 'rate_limited' using errcode = '53400';
  end if;

  -- Orden aleatorio decidido en el servidor
  select array_agg(id order by random()) into v_order
    from (select id from public.news_items where study_id = st.id
          order by random() limit public._cfg(st, 'items_per_session', 10)::int) x;
  if v_order is null or cardinality(v_order) = 0 then raise exception 'study_without_items'; end if;

  insert into public.participant_sessions
    (id, study_id, instrument_version, consent_accepted, consent_at, presentation_order,
     hints_remaining, device_class, reduced_motion)
  values
    (p_session_id, st.id, st.version, true, now(), v_order,
     public._cfg(st, 'hints_per_session', 2)::smallint, p_device_class, p_reduced_motion)
  on conflict (id) do nothing;

  return public._session_payload(p_session_id);
end $$;

-- ---------------------------------------------------------------------------
-- get_session: reanudar tras recarga o falla de red
-- ---------------------------------------------------------------------------
create or replace function public.get_session(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  v := public._session_payload(p_session_id);
  if v is null then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- submit_survey: respuestas de opinión (fase pre o post)
-- p_answers: {"question_key": "valor", ...}
-- ---------------------------------------------------------------------------
create or replace function public.submit_survey(p_session_id uuid, p_phase text, p_answers jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.participant_sessions;
  q record;
  v_val text;
  v_n_decisions int;
begin
  if p_phase not in ('pre','post') then raise exception 'invalid_phase' using errcode = '22023'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'invalid_answers' using errcode = '22023'; end if;
  if octet_length(p_answers::text) > 8000 then raise exception 'payload_too_large' using errcode = '54000'; end if;

  select * into s from public.participant_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;

  -- Idempotencia: si la fase ya está registrada, no se reescribe
  if exists (select 1 from public.survey_responses where session_id = s.id and phase = p_phase) then
    return jsonb_build_object('ok', true, 'phase', p_phase, 'duplicate', true);
  end if;

  if p_phase = 'post' then
    select count(*) into v_n_decisions from public.game_decisions where session_id = s.id;
    if v_n_decisions < cardinality(s.presentation_order) then
      raise exception 'game_not_finished' using errcode = '22023';
    end if;
  end if;

  -- Claves desconocidas = error
  if exists (select 1 from jsonb_object_keys(p_answers) k
              where k not in (select question_key from public.survey_questions
                               where study_id = s.study_id and phase = p_phase)) then
    raise exception 'unknown_question' using errcode = '22023';
  end if;

  for q in select * from public.survey_questions where study_id = s.study_id and phase = p_phase order by position loop
    v_val := nullif(btrim(p_answers ->> q.question_key), '');
    if v_val is null then
      if q.required then raise exception 'missing_answer:%', q.question_key using errcode = '22023'; end if;
      continue;
    end if;
    if q.kind = 'single' then
      if not (v_val = any(q.options)) then raise exception 'invalid_option:%', q.question_key using errcode = '22023'; end if;
      insert into public.survey_responses (session_id, question_id, phase, option_value)
      values (s.id, q.id, p_phase, v_val) on conflict (session_id, question_id) do nothing;
    else
      if char_length(v_val) < q.min_length or char_length(v_val) > q.max_length then
        raise exception 'invalid_length:%', q.question_key using errcode = '22023';
      end if;
      insert into public.survey_responses (session_id, question_id, phase, text_value)
      values (s.id, q.id, p_phase, v_val) on conflict (session_id, question_id) do nothing;
    end if;
  end loop;

  if p_phase = 'pre' and s.game_started_at is null then
    update public.participant_sessions set game_started_at = now() where id = s.id;
  end if;

  return jsonb_build_object('ok', true, 'phase', p_phase, 'duplicate', false);
end $$;

-- ---------------------------------------------------------------------------
-- use_hint: consume una lupa para la noticia en curso
-- ---------------------------------------------------------------------------
create or replace function public.use_hint(p_session_id uuid, p_position int)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.participant_sessions;
  v_item uuid;
  v_done int;
  v_hint text;
begin
  select * into s from public.participant_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if s.status <> 'started' then raise exception 'session_closed' using errcode = '22023'; end if;
  if p_position is null or p_position < 1 or p_position > cardinality(s.presentation_order) then
    raise exception 'invalid_position' using errcode = '22023';
  end if;
  v_item := s.presentation_order[p_position];
  select hint into v_hint from public.news_items where id = v_item;

  if exists (select 1 from public.hint_events where session_id = s.id and news_item_id = v_item) then
    return jsonb_build_object('position', p_position, 'hint', v_hint, 'hints_remaining', s.hints_remaining, 'duplicate', true);
  end if;

  select count(*) into v_done from public.game_decisions where session_id = s.id;
  if p_position <> v_done + 1 then raise exception 'not_current_item' using errcode = '22023'; end if;
  if s.hints_remaining <= 0 then raise exception 'no_hints_left' using errcode = '22023'; end if;

  insert into public.hint_events (session_id, news_item_id) values (s.id, v_item);
  update public.participant_sessions set hints_remaining = hints_remaining - 1 where id = s.id;
  return jsonb_build_object('position', p_position, 'hint', v_hint, 'hints_remaining', s.hints_remaining - 1, 'duplicate', false);
end $$;

-- ---------------------------------------------------------------------------
-- submit_decision: registra la clasificación y calcula la puntuación oficial
-- p_choice: 'real' | 'falsa' | null (tiempo agotado)
-- Regla (idéntica al original):
--   velocidad = max(0, round(50 * (1 - t/T)))
--   multiplicador = 1 si racha < 2; si no, min(racha,4)/2 + 0.5
--   puntos = round((100 + velocidad) * multiplicador); con lupa: round(puntos * 0.8)
-- ---------------------------------------------------------------------------
create or replace function public.submit_decision(
  p_session_id uuid, p_position int, p_choice text, p_response_ms int
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.participant_sessions;
  st public.studies;
  n public.news_items;
  v_existing bigint;
  v_done int;
  v_secs numeric;
  v_limit_ms int;
  v_timed_out boolean;
  v_choice text;
  v_ms int;
  v_correct boolean;
  v_hint boolean;
  v_prev_streak int;
  v_streak int;
  v_speed int;
  v_mult numeric;
  v_points int := 0;
  v_reach int := 0;
  v_id bigint;
begin
  select * into s from public.participant_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if p_position is null or p_position < 1 or p_position > cardinality(s.presentation_order) then
    raise exception 'invalid_position' using errcode = '22023';
  end if;

  -- Reintento idempotente
  select id into v_existing from public.game_decisions where session_id = s.id and position = p_position;
  if found then return public._decision_feedback(v_existing); end if;

  if s.status <> 'started' then raise exception 'session_closed' using errcode = '22023'; end if;
  if not exists (select 1 from public.survey_responses where session_id = s.id and phase = 'pre') then
    raise exception 'pre_survey_missing' using errcode = '22023';
  end if;
  select count(*) into v_done from public.game_decisions where session_id = s.id;
  if p_position <> v_done + 1 then raise exception 'not_current_item' using errcode = '22023'; end if;
  if p_choice is not null and p_choice not in ('real','falsa') then raise exception 'invalid_choice' using errcode = '22023'; end if;
  if p_response_ms is not null and p_response_ms < 0 then raise exception 'invalid_time' using errcode = '22023'; end if;

  select * into st from public.studies where id = s.study_id;
  select * into n from public.news_items where id = s.presentation_order[p_position];

  v_secs := public._cfg(st, 'seconds_per_item', 20);
  v_limit_ms := (v_secs * 1000)::int + 1500;  -- tolerancia de red/animación
  v_ms := least(coalesce(p_response_ms, (v_secs * 1000)::int), 600000);
  v_timed_out := p_choice is null or v_ms > v_limit_ms;
  v_choice := case when v_timed_out then null else p_choice end;
  if v_timed_out then v_ms := least(v_ms, (v_secs * 1000)::int); end if;

  v_correct := v_choice is not null and ((v_choice = 'real') = n.is_real);
  v_hint := exists (select 1 from public.hint_events where session_id = s.id and news_item_id = n.id);

  select coalesce(streak_after, 0) into v_prev_streak from public.game_decisions
   where session_id = s.id and position = p_position - 1;
  v_prev_streak := coalesce(v_prev_streak, 0);
  v_streak := case when v_correct then v_prev_streak + 1 else 0 end;

  if v_correct then
    v_speed := greatest(0, round(50 * (1 - v_ms / 1000.0 / v_secs)))::int;
    v_mult := case when v_streak >= 2 then least(v_streak, 4) / 2.0 + 0.5 else 1 end;
    v_points := round((100 + v_speed) * v_mult)::int;
    if v_hint then v_points := round(v_points * 0.8)::int; end if;
  end if;

  -- Alcance ilustrativo (igual que el original: 900–5099 si se "reenvía" una falsa)
  if v_choice = 'real' and not n.is_real then
    v_reach := 900 + floor(random() * 4200)::int;
  end if;

  insert into public.game_decisions
    (session_id, news_item_id, position, choice, correct_classification, is_correct, timed_out,
     hint_used, response_ms, points_awarded, streak_after, simulated_reach, instrument_version)
  values
    (s.id, n.id, p_position, v_choice, case when n.is_real then 'real' else 'falsa' end, v_correct, v_timed_out,
     v_hint, v_ms, v_points, v_streak, v_reach, s.instrument_version)
  returning id into v_id;

  return public._decision_feedback(v_id);
end $$;

-- ---------------------------------------------------------------------------
-- Cálculo del resumen (usado por complete_session y por la migración histórica)
-- ---------------------------------------------------------------------------
create or replace function public._compute_summary(p_session_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.game_sessions_summary as g
    (session_id, decisions_count, correct_count, error_count, timeout_count, score, hints_used,
     fake_total, fake_accepted_count, real_total, real_rejected_count, simulated_reach_total,
     duration_seconds, completed_at, computed_at)
  select s.id,
         count(d.id),
         count(d.id) filter (where d.is_correct),
         count(d.id) filter (where not d.is_correct and not d.timed_out),
         count(d.id) filter (where d.timed_out),
         case when bool_or(d.points_awarded is null) then null else sum(d.points_awarded) end,
         count(d.id) filter (where d.hint_used),
         count(d.id) filter (where d.correct_classification = 'falsa'),
         count(d.id) filter (where d.correct_classification = 'falsa' and d.choice = 'real'),
         count(d.id) filter (where d.correct_classification = 'real'),
         count(d.id) filter (where d.correct_classification = 'real' and d.choice = 'falsa'),
         coalesce(sum(d.simulated_reach), 0),
         s.duration_seconds, s.completed_at, now()
    from public.participant_sessions s
    left join public.game_decisions d on d.session_id = s.id
   where s.id = p_session_id
   group by s.id
  on conflict (session_id) do update set
    decisions_count = excluded.decisions_count, correct_count = excluded.correct_count,
    error_count = excluded.error_count, timeout_count = excluded.timeout_count, score = excluded.score,
    hints_used = excluded.hints_used, fake_total = excluded.fake_total,
    fake_accepted_count = excluded.fake_accepted_count, real_total = excluded.real_total,
    real_rejected_count = excluded.real_rejected_count, simulated_reach_total = excluded.simulated_reach_total,
    duration_seconds = excluded.duration_seconds, completed_at = excluded.completed_at, computed_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- complete_session: cierra la sesión (requiere 10 decisiones y pregunta final)
-- ---------------------------------------------------------------------------
create or replace function public.complete_session(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.participant_sessions;
  v_done int;
begin
  select * into s from public.participant_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if s.status = 'completed' then return public._summary_payload(s.id); end if;

  select count(*) into v_done from public.game_decisions where session_id = s.id;
  if v_done < cardinality(s.presentation_order) then raise exception 'game_not_finished' using errcode = '22023'; end if;
  if not exists (select 1 from public.survey_responses where session_id = s.id and phase = 'post') then
    raise exception 'post_survey_missing' using errcode = '22023';
  end if;

  update public.participant_sessions
     set status = 'completed', completed_at = now(),
         duration_seconds = greatest(0, extract(epoch from (now() - started_at)))::int
   where id = s.id;
  perform public._compute_summary(s.id);
  return public._summary_payload(s.id);
end $$;

-- ---------------------------------------------------------------------------
-- public_stats: único agregado público (para el contador de la portada)
-- ---------------------------------------------------------------------------
create or replace function public.public_stats(p_study_code text default 'lo-reenviarias')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare st public.studies; v_n int; v_mean numeric;
begin
  select * into st from public.studies where code = p_study_code and status = 'active';
  if not found then return jsonb_build_object('n', null); end if;
  select count(*), avg(g.correct_count) into v_n, v_mean
    from public.game_sessions_summary g join public.participant_sessions s on s.id = g.session_id
   where s.study_id = st.id and s.status = 'completed' and not s.is_test and s.exclusion_reason is null;
  if v_n < public._cfg(st, 'public_stats_min_n', 10) then return jsonb_build_object('n', null); end if;
  return jsonb_build_object('n', v_n, 'mean_correct', round(v_mean, 1));
end $$;

-- ---------------------------------------------------------------------------
-- Permisos: solo estas funciones son invocables por visitantes anónimos
-- ---------------------------------------------------------------------------
revoke all on function public._cfg(public.studies, text, numeric) from public, anon, authenticated;
revoke all on function public._session_payload(uuid) from public, anon, authenticated;
revoke all on function public._decision_feedback(bigint) from public, anon, authenticated;
revoke all on function public._summary_payload(uuid) from public, anon, authenticated;
revoke all on function public._compute_summary(uuid) from public, anon, authenticated;
revoke all on function public.start_session(uuid, boolean, text, boolean, text) from public;
revoke all on function public.get_session(uuid) from public;
revoke all on function public.submit_survey(uuid, text, jsonb) from public;
revoke all on function public.use_hint(uuid, int) from public;
revoke all on function public.submit_decision(uuid, int, text, int) from public;
revoke all on function public.complete_session(uuid) from public;
revoke all on function public.public_stats(text) from public;

grant execute on function public.start_session(uuid, boolean, text, boolean, text) to anon, authenticated;
grant execute on function public.get_session(uuid) to anon, authenticated;
grant execute on function public.submit_survey(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.use_hint(uuid, int) to anon, authenticated;
grant execute on function public.submit_decision(uuid, int, text, int) to anon, authenticated;
grant execute on function public.complete_session(uuid) to anon, authenticated;
grant execute on function public.public_stats(text) to anon, authenticated;
