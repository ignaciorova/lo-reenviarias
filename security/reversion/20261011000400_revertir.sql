-- Reversión de 20261011000400_integridad_estudio.sql
-- Devuelve funciones, vistas, políticas y permisos al estado anterior (el de 20261011000300).
-- Las definiciones restauradas son copia literal de las migraciones originales:
--   public_stats (20261009000300), leaderboard_status y join_leaderboard (20261010000300),
--   _v4_summary, start_session_v4, complete_session_v4 y v_share_sessions (20261011000100), v_sessions (20261009000400).
-- No toca filas de sesiones, decisiones, puntajes, ranking ni auditoría. Se pierden solo las tablas nuevas
-- (session_integrity: señales y revisiones; platform_settings: ajustes técnicos). Si se quieren conservar,
-- respaldarlas antes:  create table public.session_integrity_respaldo as table public.session_integrity;
-- Los registros de audit_events escritos por las funciones nuevas (export, review_automation, ...) se conservan.

begin;

-- 1. Funciones del participante y del ranking: definiciones anteriores (ya no usan las tablas nuevas)
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

create or replace function public.leaderboard_status(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.participant_sessions; st public.studies;
begin
  select * into s from public.participant_sessions where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into st from public.studies where id = s.study_id;
  if coalesce((st.config ->> 'leaderboard')::boolean, false) is not true then
    return jsonb_build_object('enabled', false);
  end if;
  return jsonb_build_object('enabled', true, 'joined', s.leaderboard_joined,
    'can_join', s.status = 'completed' and not s.leaderboard_joined, 'top', public._lb_top(st.id));
end $$;

create or replace function public.join_leaderboard(p_session_id uuid, p_animal int, p_adj int, p_num int)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.participant_sessions; st public.studies; g public.game_sessions_summary;
  v_alias text; v_rank int;
begin
  select * into s from public.participant_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into st from public.studies where id = s.study_id;
  if coalesce((st.config ->> 'leaderboard')::boolean, false) is not true then raise exception 'leaderboard_disabled' using errcode = '22023'; end if;
  if s.status <> 'completed' then raise exception 'session_not_completed' using errcode = '22023'; end if;
  if s.leaderboard_joined then raise exception 'already_joined' using errcode = '22023'; end if;
  if s.completed_at < now() - interval '6 hours' then raise exception 'too_late' using errcode = '22023'; end if;
  select * into g from public.game_sessions_summary where session_id = s.id;
  if not found or g.score is null then raise exception 'summary_missing' using errcode = 'P0002'; end if;

  v_alias := public._alias(p_animal, p_adj, p_num);
  insert into public.leaderboard_entries (study_id, week, alias, score, correct_count)
  values (st.id, public._lb_week(), v_alias, g.score, g.correct_count);
  update public.participant_sessions set leaderboard_joined = true where id = s.id;

  select count(*) + 1 into v_rank from public.leaderboard_entries
   where study_id = st.id and week = public._lb_week()
     and (score > g.score or (score = g.score and correct_count > g.correct_count));
  return jsonb_build_object('alias', v_alias, 'rank', v_rank, 'top', public._lb_top(st.id));
end $$;

create or replace function public._v4_summary(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  g public.game_sessions_summary; s public.participant_sessions; st public.studies;
  v_n int; v_lower int; v_pct int := null; v_recap jsonb; v_counts jsonb;
begin
  select * into g from public.game_sessions_summary where session_id = p_session_id;
  if not found then return null; end if;
  select * into s from public.participant_sessions where id = p_session_id;
  select * into st from public.studies where id = s.study_id;

  select count(*), count(*) filter (where gs.score < g.score) into v_n, v_lower
    from public.game_sessions_summary gs join public.participant_sessions ps on ps.id = gs.session_id
   where ps.study_id = s.study_id and ps.status = 'completed' and not ps.is_test and ps.exclusion_reason is null and ps.id <> s.id;
  if v_n >= public._cfg(st, 'percentile_min_n', 20) then v_pct := round(100.0 * v_lower / v_n); end if;

  select jsonb_build_object(
           'shared_unverified', count(*) filter (where state in ('E1','E2')),
           'not_shared_unverified', count(*) filter (where state = 'E3'),
           'verified', count(*) filter (where first_action = 'verificar'),
           'verified_effective', count(*) filter (where effective_verification),
           'with_warning', count(*) filter (where final_action = 'reenviar_aviso'),
           'no_se', count(*) filter (where belief = 'no_se'),
           'timed_out', count(*) filter (where timed_out))
    into v_counts from public.share_decisions where session_id = p_session_id;

  select jsonb_agg(jsonb_build_object('position', d.position, 'headline', n.headline, 'is_real', n.is_real, 'state', d.state,
                                      'belief', d.belief, 'belief_correct', d.belief_correct, 'final_action', d.final_action,
                                      'verified', coalesce(d.first_action = 'verificar', false)) order by d.position)
    into v_recap from public.share_decisions d join public.news_items n on n.id = d.news_item_id where d.session_id = p_session_id;

  return jsonb_build_object(
    'correct_count', g.correct_count, 'decisions_count', g.decisions_count, 'score', g.score,
    'hints_used', 0, 'simulated_reach_total', 0, 'percentile', v_pct, 'percentile_n', v_n,
    'counts', v_counts, 'recap', coalesce(v_recap, '[]'::jsonb)
  );
end $$;

create or replace function public.start_session_v4(
  p_session_id uuid,
  p_consent boolean,
  p_device_class text default 'unknown',
  p_reduced_motion boolean default null,
  p_entry_origin text default null,
  p_survey_intent text default null,
  p_survey_code text default null,
  p_study_code text default 'lo-reenviarias',
  p_device_replay boolean default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  st public.studies;
  v_recent int; v_order uuid[]; v_flags boolean[]; v_why smallint[];
  v_code text; v_n int; v_real_img int; v_img uuid[]; v_media int; v_media_real int; v_nimg int;
begin
  if p_session_id is null then raise exception 'invalid_session_id' using errcode = '22023'; end if;
  if exists (select 1 from public.participant_sessions where id = p_session_id) then
    return public.get_session_v4(p_session_id);
  end if;
  if p_consent is distinct from true then raise exception 'consent_required' using errcode = '22023'; end if;
  if p_device_class not in ('mobile','tablet','desktop','unknown') then p_device_class := 'unknown'; end if;
  if p_entry_origin is not null and p_entry_origin not in ('encuesta','qr_juego','enlace','otro') then p_entry_origin := 'otro'; end if;
  if p_survey_intent is not null and p_survey_intent not in ('antes','ya_respondio','despues','no') then
    raise exception 'invalid_survey_intent' using errcode = '22023';
  end if;
  v_code := public._survey_code_norm(p_survey_code);
  if v_code is not null and not public._survey_code_ok(v_code) then raise exception 'invalid_survey_code' using errcode = '22023'; end if;

  select * into st from public.studies where code = p_study_code and status = 'active';
  if not found then raise exception 'study_not_active' using errcode = 'P0002'; end if;
  if not public._is_v4(st) then raise exception 'study_not_v4' using errcode = '22023'; end if;

  select count(*) into v_recent from public.participant_sessions where study_id = st.id and started_at > now() - interval '1 minute';
  if v_recent >= public._cfg(st, 'max_sessions_per_minute', 120) then raise exception 'rate_limited' using errcode = '53400'; end if;

  -- Orden aleatorio decidido en el servidor
  select array_agg(id order by random()) into v_order
    from (select id from public.news_items where study_id = st.id order by random()
          limit public._cfg(st, 'items_per_session', 10)::int) x;
  if v_order is null or cardinality(v_order) = 0 then raise exception 'study_without_items'; end if;
  v_n := cardinality(v_order);

  -- Imágenes: en la mitad de las tarjetas con imagen, balanceando reales y falsas.
  -- Con 5 reales y 5 falsas con imagen: 2 o 3 reales al azar y el resto falsas → cada noticia, 50 %.
  select count(*), count(*) filter (where n.is_real) into v_media, v_media_real
    from public.news_items n where n.id = any(v_order) and jsonb_typeof(n.display -> 'media') = 'object';
  v_nimg := floor(v_media * public._cfg(st, 'image_share', 0.5))::int;
  v_real_img := v_nimg / 2 + case when v_nimg % 2 = 1 and random() < 0.5 then 1 else 0 end;
  v_real_img := least(v_real_img, v_media_real);
  v_real_img := greatest(v_real_img, v_nimg - (v_media - v_media_real));
  select coalesce(array_agg(id), '{}') into v_img from (
    (select n.id from public.news_items n where n.id = any(v_order) and n.is_real and jsonb_typeof(n.display -> 'media') = 'object'
      order by random() limit v_real_img)
    union all
    (select n.id from public.news_items n where n.id = any(v_order) and not n.is_real and jsonb_typeof(n.display -> 'media') = 'object'
      order by random() limit v_nimg - v_real_img)) x;

  select array_agg(o.item_id = any(v_img) order by o.ord) into v_flags
    from unnest(v_order) with ordinality as o(item_id, ord);

  -- «¿Por qué?» en 2 posiciones al azar
  select coalesce(array_agg(p::smallint), '{}') into v_why
    from (select p from generate_series(1, v_n) p order by random()
          limit least(v_n, public._cfg(st, 'why_items', 2)::int)) x;

  insert into public.participant_sessions
    (id, study_id, instrument_version, consent_accepted, consent_at, presentation_order, hints_remaining,
     device_class, reduced_motion, survey_code, survey_code_at, entry_origin, survey_intent, image_flags, why_positions, device_replay)
  values
    (p_session_id, st.id, st.version, true, now(), v_order, 0,
     p_device_class, p_reduced_motion, v_code, case when v_code is null then null else now() end,
     p_entry_origin, p_survey_intent, v_flags, v_why, p_device_replay)
  on conflict (id) do nothing;

  return public.get_session_v4(p_session_id);
end $$;

create or replace function public.complete_session_v4(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s public.participant_sessions; st public.studies; v_done int;
begin
  select * into s from public.participant_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into st from public.studies where id = s.study_id;
  if not public._is_v4(st) then raise exception 'study_not_v4' using errcode = '22023'; end if;
  if s.status = 'completed' then return public._v4_summary(s.id); end if;
  select count(*) into v_done from public.share_decisions where session_id = s.id;
  if v_done < cardinality(s.presentation_order) then raise exception 'game_not_finished' using errcode = '22023'; end if;

  update public.participant_sessions
     set status = 'completed', completed_at = now(), duration_seconds = greatest(0, extract(epoch from (now() - started_at)))::int
   where id = s.id;

  insert into public.game_sessions_summary as g
    (session_id, decisions_count, correct_count, error_count, timeout_count, score, hints_used,
     fake_total, fake_accepted_count, real_total, real_rejected_count, simulated_reach_total, duration_seconds, completed_at, computed_at)
  select s.id, count(*), count(*) filter (where d.belief_correct), count(*) filter (where d.belief_correct = false),
         count(*) filter (where d.timed_out), public._cfg(st, 'start_points', 600)::int + coalesce(sum(d.points), 0), 0,
         count(*) filter (where not d.is_real), count(*) filter (where not d.is_real and d.belief = 'si'),
         count(*) filter (where d.is_real), count(*) filter (where d.is_real and d.belief = 'no'),
         0, greatest(0, extract(epoch from (now() - s.started_at)))::int, now(), now()
    from public.share_decisions d where d.session_id = s.id
  on conflict (session_id) do update set
    decisions_count = excluded.decisions_count, correct_count = excluded.correct_count, error_count = excluded.error_count,
    timeout_count = excluded.timeout_count, score = excluded.score, fake_total = excluded.fake_total,
    fake_accepted_count = excluded.fake_accepted_count, real_total = excluded.real_total,
    real_rejected_count = excluded.real_rejected_count, duration_seconds = excluded.duration_seconds,
    completed_at = excluded.completed_at, computed_at = now();

  return public._v4_summary(s.id);
end $$;

-- 2. Vistas del panel: sin las columnas de señales (no se pueden quitar columnas con create or replace)
drop view public.v_sessions;
drop view public.v_share_sessions;
create view public.v_sessions with (security_invoker = true) as
select
  s.id                         as session_id,
  st.code                      as study_code,
  s.instrument_version,
  s.origin,
  s.status,
  s.is_test,
  s.exclusion_reason,
  (s.status = 'completed' and not s.is_test and s.exclusion_reason is null
     and coalesce(g.decisions_count, 0) = coalesce(nullif(cardinality(s.presentation_order), 0), 10)) as is_valid,
  case
    when s.is_test then 'prueba'
    when s.exclusion_reason is not null then 'excluida'
    when s.status = 'completed' then 'completada'
    when s.status = 'abandoned' or s.started_at < now() - interval '24 hours' then 'abandonada'
    else 'en_curso'
  end                          as status_effective,
  s.started_at,
  s.completed_at,
  s.duration_seconds,
  s.device_class,
  s.reduced_motion,
  s.consent_accepted,
  (select r.text_value   from public.survey_responses r join public.survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'opinion')         as opinion,
  (select r.option_value from public.survey_responses r join public.survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'verifica')        as verifica,
  (select r.option_value from public.survey_responses r join public.survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'compartio_falso') as compartio_falso,
  (select r.option_value from public.survey_responses r join public.survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'responsable')     as responsable,
  (select r.option_value from public.survey_responses r join public.survey_questions q on q.id = r.question_id where r.session_id = s.id and q.question_key = 'post_cambio')     as post_cambio,
  coalesce(g.decisions_count, (select count(*) from public.game_decisions d where d.session_id = s.id))::int as decisions_count,
  g.correct_count, g.error_count, g.timeout_count, g.score, g.hints_used,
  g.fake_total, g.fake_accepted_count, g.real_total, g.real_rejected_count,
  g.simulated_reach_total
from public.participant_sessions s
join public.studies st on st.id = s.study_id
left join public.game_sessions_summary g on g.session_id = s.id;

create view public.v_share_sessions with (security_invoker = true) as
select s.id as session_id, s.instrument_version, s.status, s.is_test, s.exclusion_reason,
       s.entry_origin, s.survey_intent, s.survey_code, s.survey_code_at, s.device_class, s.started_at, s.completed_at, s.duration_seconds,
       (select r.option_value from public.survey_responses r join public.survey_questions q on q.id = r.question_id
         where r.session_id = s.id and q.question_key = 'primera_vez') as primera_vez,
       s.device_replay,
       cardinality(s.presentation_order) as items_total,
       count(d.id)::int as cards_done,
       count(d.id) filter (where d.state in ('E1','E2','E3','E4','E5','E6'))::int as r_answered,
       count(d.id) filter (where d.state = 'E1')::int as e1, count(d.id) filter (where d.state = 'E2')::int as e2,
       count(d.id) filter (where d.state = 'E3')::int as e3, count(d.id) filter (where d.state = 'E4')::int as e4,
       count(d.id) filter (where d.state = 'E5')::int as e5, count(d.id) filter (where d.state = 'E6')::int as e6,
       count(d.id) filter (where d.state = 'E7')::int as e7,
       case when s.status = 'abandoned' or (s.status = 'started' and s.started_at < now() - interval '24 hours')
            then greatest(0, cardinality(s.presentation_order) - count(d.id))::int else 0 end as e8,
       count(d.id) filter (where d.effective_verification)::int as verified_effective,
       count(d.id) filter (where d.evaluation_correct)::int as evaluation_correct,
       count(d.id) filter (where d.belief = 'no_se')::int as belief_no_se,
       count(d.id) filter (where d.belief_correct)::int as belief_correct,
       count(d.id) filter (where d.belief is not null and d.belief <> 'no_se')::int as belief_decided,
       count(d.id) filter (where d.is_real and d.belief = 'si')::int as real_si,
       count(d.id) filter (where d.is_real and d.belief is not null)::int as real_answered,
       count(d.id) filter (where not d.is_real and d.belief = 'si')::int as fake_si,
       count(d.id) filter (where not d.is_real and d.belief is not null)::int as fake_answered,
       g.score,
       (s.status = 'completed' and not s.is_test and s.exclusion_reason is null and count(d.id) = cardinality(s.presentation_order)) as is_valid
  from public.participant_sessions s
  join public.studies st on st.id = s.study_id and coalesce(st.config ->> 'mode', '') = 'responsabilidad'
  left join public.share_decisions d on d.session_id = s.id
  left join public.game_sessions_summary g on g.session_id = s.id
 group by s.id, g.score;

-- Permisos de las vistas como quedaron en 20261011000300
revoke all on public.v_sessions, public.v_share_sessions from authenticated, anon, public;
grant select on public.v_sessions, public.v_share_sessions to authenticated;

-- 3. Texto libre: quitar las políticas restrictivas (las permisivas originales nunca se tocaron)
drop policy if exists texto_libre_solo_analyst on public.survey_responses;
do $$ begin
  if to_regclass('public.radiografia_respuestas') is not null then
    drop policy if exists texto_libre_solo_analyst on public.radiografia_respuestas;
  end if;
end $$;

-- 4. Exportaciones: log_export vuelve a ser invocable por authenticated (estado anterior)
grant execute on function public.log_export(jsonb) to authenticated;

-- 5. Funciones y tablas nuevas
drop function if exists public.export_dataset(text, jsonb);
drop function if exists public.review_automation(uuid, boolean, text);
drop function if exists public.recompute_automation_signals(uuid);
drop function if exists public._store_automation_signals(uuid);
drop function if exists public._automation_signals(uuid);
drop function if exists public._session_automation_excluded(uuid);
drop function if exists public._automation_excludes(text[], text);
drop function if exists public.set_platform_setting(text, numeric);
drop function if exists public.get_platform_settings();
drop function if exists public._setting(text);
drop function if exists public._setting_catalog();
drop table if exists public.session_integrity;
drop table if exists public.platform_settings;

commit;
