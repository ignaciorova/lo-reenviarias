-- ============================================================================
-- 0009: versión 4.0.0 «responsabilidad antes de compartir»
--
-- Solo AGREGA objetos: no cambia tablas, funciones ni datos de las versiones 1.0.0 a 3.1.0.
-- Las versiones anteriores siguen usando start_session / submit_decision / complete_session.
--
-- · Cada noticia termina en una fila de share_decisions con su estado E1..E7:
--     E1 reenvía sin verificar · E2 reenvía con aviso sin verificar · E3 no reenvía sin verificar
--     E4 verifica y reenvía    · E5 verifica y reenvía con aviso    · E6 verifica y no reenvía
--     E7 sin respuesta por tiempo (en la decisión o durante la verificación)
--   E8 (partida interrumpida) no es una fila: son las posiciones sin decisión de una sesión abandonada.
-- · Verificar = abrir fuentes dentro del juego (source_opens, con hora del servidor), decir qué dice
--   la fuente y tomar una decisión final. La verificación efectiva exige fuente adecuada (oficial o
--   medio), tiempo mínimo de lectura y evaluación correcta.
-- · La creencia («¿Te la crees?»: si / no / no_se) se pregunta DESPUÉS de decidir y es lo único que
--   suma o resta puntos (+100 / -100 / 0), desde un saldo inicial.
-- · Código seudónimo opcional para enlazar la encuesta de Google Forms (sin datos personales).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fuentes consultables por noticia (copiadas al armar la versión, igual que el resto de la tarjeta)
-- [{kind: oficial|medio|comentarios, label, url?, excerpt, says: confirma|desmiente|nada_claro,
--   simulated: bool, comments?: [{who, text}]}]
-- ---------------------------------------------------------------------------
alter table public.news_items add column if not exists consult_sources jsonb not null default '[]'::jsonb;
alter table public.news_bank  add column if not exists consult_sources jsonb not null default '[]'::jsonb;
comment on column public.news_items.consult_sources is 'Fuentes que la persona puede abrir al verificar (4.0.0). «says» es la lectura correcta y nunca se envía antes de decidir.';

-- ---------------------------------------------------------------------------
-- Datos de la sesión propios de la 4.0.0
-- ---------------------------------------------------------------------------
alter table public.participant_sessions add column if not exists survey_code   text;
alter table public.participant_sessions add column if not exists entry_origin  text;
alter table public.participant_sessions add column if not exists survey_intent text;
alter table public.participant_sessions add column if not exists image_flags   boolean[] not null default '{}';
alter table public.participant_sessions add column if not exists why_positions smallint[] not null default '{}';
alter table public.participant_sessions add column if not exists survey_code_at timestamptz;
alter table public.participant_sessions add column if not exists device_replay boolean;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'participant_sessions_survey_code_chk') then
    alter table public.participant_sessions add constraint participant_sessions_survey_code_chk
      check (survey_code is null or survey_code ~ '^[0-9A-HJKMNP-TV-Z]{8}$');
    alter table public.participant_sessions add constraint participant_sessions_entry_origin_chk
      check (entry_origin is null or entry_origin in ('encuesta','qr_juego','enlace','otro'));
    alter table public.participant_sessions add constraint participant_sessions_survey_intent_chk
      check (survey_intent is null or survey_intent in ('antes','ya_respondio','despues','no'));
  end if;
end $$;
comment on column public.participant_sessions.survey_code is 'Código seudónimo aleatorio (8 caracteres) para enlazar con la encuesta. No se deriva de ningún dato de la persona.';
comment on column public.participant_sessions.entry_origin is 'Por dónde entró: QR de la encuesta, QR del juego, enlace u otro (parámetro ?origen=).';
comment on column public.participant_sessions.survey_intent is 'Lo que la persona dijo de la encuesta al empezar: la responderá antes, ya la respondió, después o no.';
comment on column public.participant_sessions.image_flags is 'Por posición: si la tarjeta mostró imagen (asignación aleatoria balanceada).';
comment on column public.participant_sessions.device_replay is 'El navegador ya tenía una partida 4.0.0 terminada (marca local). Complementa la pregunta «¿Es la primera vez?».';
comment on column public.participant_sessions.why_positions is 'Posiciones en las que se preguntó «¿Por qué?» (2 al azar).';
create index if not exists participant_sessions_survey_code_idx on public.participant_sessions (survey_code) where survey_code is not null;

-- ---------------------------------------------------------------------------
-- Aperturas de fuentes (hora del servidor; sirve de cota para el tiempo de lectura)
-- ---------------------------------------------------------------------------
create table if not exists public.source_opens (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references public.participant_sessions(id) on delete cascade,
  position    smallint not null check (position between 1 and 50),
  kind        text not null check (kind in ('oficial','medio','comentarios')),
  opened_at   timestamptz not null default now()
);
create index if not exists source_opens_session_idx on public.source_opens (session_id, position);
comment on table public.source_opens is 'Cada vez que una persona abre una fuente al verificar (4.0.0).';

-- ---------------------------------------------------------------------------
-- Una fila por noticia decidida en la 4.0.0
-- ---------------------------------------------------------------------------
create table if not exists public.share_decisions (
  id                      bigint generated always as identity primary key,
  session_id              uuid not null references public.participant_sessions(id) on delete cascade,
  news_item_id            uuid not null references public.news_items(id) on delete restrict,
  position                smallint not null check (position between 1 and 50),
  instrument_version      text not null,
  is_real                 boolean not null,
  image_shown             boolean not null default false,
  first_action            text check (first_action in ('reenviar','reenviar_aviso','no_reenviar','verificar')),
  first_action_ms         integer check (first_action_ms between 0 and 600000),
  timed_out               boolean not null default false,
  timeout_stage           text check (timeout_stage in ('decision','verificacion')),
  sources_opened          text[] not null default '{}',
  source_kind             text check (source_kind in ('oficial','medio','comentarios')),
  read_ms                 integer check (read_ms between 0 and 600000),
  evaluation              text check (evaluation in ('confirma','desmiente','nada_claro')),
  evaluation_correct      boolean,
  effective_verification  boolean not null default false,
  final_action            text check (final_action in ('reenviar','reenviar_aviso','no_reenviar')),
  belief                  text check (belief in ('si','no','no_se')),
  belief_correct          boolean,
  reason                  text check (reason in ('parece_creible','fuente_confiable','me_importa','no_estoy_seguro','parece_exagerada','sin_fuente','otro')),
  state                   text not null check (state in ('E1','E2','E3','E4','E5','E6','E7')),
  points                  integer not null default 0,
  created_at              timestamptz not null default now(),
  unique (session_id, position),
  unique (session_id, news_item_id),
  check (timed_out = (state = 'E7')),
  check (state <> 'E7' or (belief is null and final_action is null)),
  check (state = 'E7' or (final_action is not null and belief is not null))
);
comment on table public.share_decisions is 'Decisión simulada de compartir por noticia (4.0.0). Estados E1..E7; E8 = posición sin fila en sesión abandonada.';
comment on column public.share_decisions.read_ms is 'Tiempo de lectura medido en el teléfono, acotado por la hora del servidor de la primera apertura de esa fuente.';
create index if not exists share_decisions_item_idx on public.share_decisions (news_item_id);

alter table public.source_opens enable row level security;
alter table public.share_decisions enable row level security;
revoke all on public.source_opens, public.share_decisions from anon, authenticated, public;
grant select on public.source_opens, public.share_decisions to authenticated;
do $$ declare t text; begin
  foreach t in array array['source_opens','share_decisions'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'admin_read') then
      execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_admin(''viewer'')))', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Código seudónimo: 7 caracteres al azar (base 32 de Crockford, sin I L O U) + 1 de control
-- ---------------------------------------------------------------------------
create or replace function public._survey_code_ok(p_code text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  alpha constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  s int := 0; i int; v int;
begin
  if p_code is null or p_code !~ '^[0-9A-HJKMNP-TV-Z]{8}$' then return false; end if;
  for i in 1..7 loop
    v := strpos(alpha, substr(p_code, i, 1)) - 1;
    s := s + i * v;
  end loop;
  return substr(p_code, 8, 1) = substr(alpha, (s % 32) + 1, 1);
end $$;

-- Normaliza lo que escribe la persona: mayúsculas, sin guiones ni espacios, O→0, I/L→1
create or replace function public._survey_code_norm(p_code text)
returns text language sql immutable set search_path = '' as $$
  select nullif(translate(upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')), 'OIL', '011'), '')
$$;

create or replace function public._is_v4(p_study public.studies)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_study.config ->> 'mode', '') = 'responsabilidad'
$$;

-- ---------------------------------------------------------------------------
-- study_info: qué versión está activa y cómo se juega (público, sin datos de participantes)
-- ---------------------------------------------------------------------------
create or replace function public.study_info(p_study_code text default 'lo-reenviarias')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare st public.studies;
begin
  select * into st from public.studies where code = p_study_code and status = 'active';
  if not found then return jsonb_build_object('active', false); end if;
  return jsonb_build_object(
    'active', true,
    'version', st.version,
    'mode', coalesce(st.config ->> 'mode', 'clasificacion'),
    'items', public._cfg(st, 'items_per_session', 10),
    'survey_url', st.config ->> 'survey_url',
    'survey_code_entry', st.config ->> 'survey_code_entry'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Carga útil de una sesión 4.0.0 (sin respuestas correctas ni lectura correcta de las fuentes)
-- ---------------------------------------------------------------------------
create or replace function public._v4_payload(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.participant_sessions;
  st public.studies;
  v_items jsonb; v_cards jsonb; v_questions jsonb; v_answered jsonb;
begin
  select * into s from public.participant_sessions where id = p_session_id;
  if not found then return null; end if;
  select * into st from public.studies where id = s.study_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'position', o.ord, 'item_id', n.id, 'headline', n.headline, 'body_text', n.body_text,
           'display', case when coalesce(s.image_flags[o.ord], false) then n.display - 'src_label' else n.display - 'src_label' - 'media' end,
           'image_shown', coalesce(s.image_flags[o.ord], false),
           'ask_why', o.ord = any(s.why_positions),
           'sources', (select coalesce(jsonb_agg(jsonb_build_object('kind', x ->> 'kind', 'label', x ->> 'label')), '[]'::jsonb)
                         from jsonb_array_elements(n.consult_sources) x)
         ) order by o.ord), '[]'::jsonb)
    into v_items
    from unnest(s.presentation_order) with ordinality as o(item_id, ord)
    join public.news_items n on n.id = o.item_id;

  select coalesce(jsonb_agg(public._v4_feedback(d.id) order by d.position), '[]'::jsonb)
    into v_cards from public.share_decisions d where d.session_id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', q.question_key, 'phase', q.phase, 'kind', q.kind, 'prompt', q.prompt,
           'options', to_jsonb(q.options), 'required', q.required, 'min_length', q.min_length, 'max_length', q.max_length
         ) order by q.position), '[]'::jsonb)
    into v_questions from public.survey_questions q where q.study_id = s.study_id;

  select coalesce(jsonb_agg(distinct r.phase), '[]'::jsonb) into v_answered
    from public.survey_responses r where r.session_id = s.id;

  return jsonb_build_object(
    'session_id', s.id,
    'status', s.status,
    'mode', 'responsabilidad',
    'instrument_version', s.instrument_version,
    'config', jsonb_build_object(
      'items_per_session', cardinality(s.presentation_order),
      'seconds_per_item', public._cfg(st, 'seconds_per_item', 20),
      'verify_seconds', public._cfg(st, 'verify_seconds', 60),
      'start_points', public._cfg(st, 'start_points', 600),
      'leaderboard', coalesce((st.config ->> 'leaderboard')::boolean, false),
      'survey_url', st.config ->> 'survey_url',
      'survey_code_entry', st.config ->> 'survey_code_entry'
    ),
    'survey_code', s.survey_code,
    'entry_origin', s.entry_origin,
    'survey_intent', s.survey_intent,
    'questions', v_questions,
    'answered_phases', v_answered,
    'items', v_items,
    'cards', v_cards,
    'summary', case when s.status = 'completed' then public._v4_summary(s.id) else null end
  );
end $$;

-- Lo que la persona ve después de decidir una noticia
create or replace function public._v4_feedback(p_decision_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d public.share_decisions; n public.news_items; st public.studies; v_total int; v_src jsonb;
begin
  select * into d from public.share_decisions where id = p_decision_id;
  select * into n from public.news_items where id = d.news_item_id;
  select * into st from public.studies where id = n.study_id;
  select public._cfg(st, 'start_points', 600)::int + coalesce(sum(points), 0) into v_total
    from public.share_decisions where session_id = d.session_id and position <= d.position;
  if d.source_kind is not null then
    select x into v_src from jsonb_array_elements(n.consult_sources) x where x ->> 'kind' = d.source_kind limit 1;
  end if;
  return jsonb_build_object(
    'position', d.position, 'item_id', n.id, 'state', d.state, 'timed_out', d.timed_out,
    'first_action', d.first_action, 'final_action', d.final_action,
    'belief', d.belief, 'belief_correct', d.belief_correct, 'points', d.points, 'total_score', v_total,
    'is_real', n.is_real, 'explanation', n.explanation, 'red_flags', to_jsonb(n.red_flags),
    'source_kind', d.source_kind, 'evaluation', d.evaluation, 'evaluation_correct', d.evaluation_correct,
    'source_says', v_src ->> 'says', 'effective_verification', d.effective_verification
  );
end $$;

-- Resumen final de una sesión 4.0.0
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

-- ---------------------------------------------------------------------------
-- start_session_v4: crea (o reanuda) una sesión de la versión activa si es 4.0.0
-- ---------------------------------------------------------------------------
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

create or replace function public.get_session_v4(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.participant_sessions; st public.studies;
begin
  select * into s from public.participant_sessions where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into st from public.studies where id = s.study_id;
  if not public._is_v4(st) then raise exception 'study_not_v4' using errcode = '22023'; end if;
  return public._v4_payload(p_session_id);
end $$;

-- ---------------------------------------------------------------------------
-- set_survey_code: enlazar (o corregir) el código de la encuesta en una sesión 4.0.0
-- ---------------------------------------------------------------------------
create or replace function public.set_survey_code(p_session_id uuid, p_code text, p_survey_intent text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s public.participant_sessions; st public.studies; v_code text;
begin
  select * into s from public.participant_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into st from public.studies where id = s.study_id;
  if not public._is_v4(st) then raise exception 'study_not_v4' using errcode = '22023'; end if;
  if s.started_at < now() - interval '24 hours' then raise exception 'too_late' using errcode = '22023'; end if;
  v_code := public._survey_code_norm(p_code);
  if v_code is not null and not public._survey_code_ok(v_code) then raise exception 'invalid_survey_code' using errcode = '22023'; end if;
  if p_survey_intent is not null and p_survey_intent not in ('antes','ya_respondio','despues','no') then
    raise exception 'invalid_survey_intent' using errcode = '22023';
  end if;
  update public.participant_sessions
     set survey_code = coalesce(v_code, survey_code),
         survey_code_at = case when v_code is not null and v_code is distinct from survey_code then now() else survey_code_at end,
         survey_intent = coalesce(p_survey_intent, survey_intent)
   where id = s.id;
  return jsonb_build_object('ok', true, 'survey_code', coalesce(v_code, s.survey_code));
end $$;

-- ---------------------------------------------------------------------------
-- open_source: la persona abre una fuente al verificar. Se registra la hora del servidor.
-- ---------------------------------------------------------------------------
create or replace function public.open_source(p_session_id uuid, p_position int, p_kind text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.participant_sessions; st public.studies; n public.news_items; v_done int; v_src jsonb; v_opens int;
begin
  select * into s from public.participant_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into st from public.studies where id = s.study_id;
  if not public._is_v4(st) then raise exception 'study_not_v4' using errcode = '22023'; end if;
  if s.status <> 'started' then raise exception 'session_closed' using errcode = '22023'; end if;
  if p_kind not in ('oficial','medio','comentarios') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if p_position is null or p_position < 1 or p_position > cardinality(s.presentation_order) then raise exception 'invalid_position' using errcode = '22023'; end if;
  select count(*) into v_done from public.share_decisions where session_id = s.id;
  if p_position <> v_done + 1 then raise exception 'not_current_item' using errcode = '22023'; end if;
  select count(*) into v_opens from public.source_opens where session_id = s.id and position = p_position;
  if v_opens >= 20 then raise exception 'too_many_opens' using errcode = '53400'; end if;

  select * into n from public.news_items where id = s.presentation_order[p_position];
  select x into v_src from jsonb_array_elements(n.consult_sources) x where x ->> 'kind' = p_kind limit 1;
  if v_src is null then raise exception 'source_not_found' using errcode = 'P0002'; end if;

  insert into public.source_opens (session_id, position, kind) values (s.id, p_position, p_kind);
  -- Nunca se envía «says»: es la lectura correcta de la fuente.
  return v_src - 'says';
end $$;

-- ---------------------------------------------------------------------------
-- submit_card: registra todo lo que pasó con una noticia y devuelve la retroalimentación.
-- p_card: {first_action, first_action_ms, source_kind, read_ms, evaluation, final_action,
--          verify_timed_out, belief, reason}
-- ---------------------------------------------------------------------------
create or replace function public.submit_card(p_session_id uuid, p_position int, p_card jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.participant_sessions; st public.studies; n public.news_items;
  v_existing bigint; v_done int; v_id bigint;
  v_first text; v_first_ms int; v_limit_ms int; v_timed_out boolean := false; v_stage text;
  v_kind text; v_read int; v_eval text; v_eval_ok boolean; v_final text; v_belief text; v_belief_ok boolean;
  v_reason text; v_eff boolean := false; v_state text; v_points int := 0; v_src jsonb;
  v_first_open timestamptz; v_opened text[]; v_bound int; v_min_read int;
begin
  if p_card is null or jsonb_typeof(p_card) <> 'object' or octet_length(p_card::text) > 2000 then raise exception 'invalid_card' using errcode = '22023'; end if;
  select * into s from public.participant_sessions where id = p_session_id for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into st from public.studies where id = s.study_id;
  if not public._is_v4(st) then raise exception 'study_not_v4' using errcode = '22023'; end if;
  if p_position is null or p_position < 1 or p_position > cardinality(s.presentation_order) then raise exception 'invalid_position' using errcode = '22023'; end if;

  -- Reintento idempotente
  select id into v_existing from public.share_decisions where session_id = s.id and position = p_position;
  if found then return public._v4_feedback(v_existing); end if;

  if s.status <> 'started' then raise exception 'session_closed' using errcode = '22023'; end if;
  if not exists (select 1 from public.survey_responses where session_id = s.id and phase = 'pre')
     and exists (select 1 from public.survey_questions where study_id = s.study_id and phase = 'pre') then
    raise exception 'pre_survey_missing' using errcode = '22023';
  end if;
  select count(*) into v_done from public.share_decisions where session_id = s.id;
  if p_position <> v_done + 1 then raise exception 'not_current_item' using errcode = '22023'; end if;
  select * into n from public.news_items where id = s.presentation_order[p_position];

  v_first := nullif(p_card ->> 'first_action', '');
  if v_first is not null and v_first not in ('reenviar','reenviar_aviso','no_reenviar','verificar') then raise exception 'invalid_action' using errcode = '22023'; end if;
  v_first_ms := least(greatest(coalesce((p_card ->> 'first_action_ms')::numeric, 0), 0), 600000)::int;
  v_limit_ms := (public._cfg(st, 'seconds_per_item', 20) * 1000)::int + 1500;  -- tolerancia de red/animación
  v_belief := nullif(p_card ->> 'belief', '');
  v_reason := nullif(p_card ->> 'reason', '');
  if v_belief is not null and v_belief not in ('si','no','no_se') then raise exception 'invalid_belief' using errcode = '22023'; end if;
  if v_reason is not null and not (p_position = any(s.why_positions)) then v_reason := null; end if;
  if v_reason is not null and v_reason not in ('parece_creible','fuente_confiable','me_importa','no_estoy_seguro','parece_exagerada','sin_fuente','otro') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct o.kind), '{}') , min(o.opened_at) filter (where o.kind = p_card ->> 'source_kind')
    into v_opened, v_first_open
    from public.source_opens o where o.session_id = s.id and o.position = p_position;

  if v_first is null or v_first_ms > v_limit_ms then
    -- Sin respuesta a tiempo en la decisión
    v_timed_out := true; v_stage := 'decision'; v_first := null;
    v_first_ms := least(v_first_ms, (public._cfg(st, 'seconds_per_item', 20) * 1000)::int);
  elsif v_first <> 'verificar' then
    if cardinality(v_opened) > 0 then raise exception 'inconsistent_card' using errcode = '22023'; end if;
    if v_belief is null then raise exception 'belief_required' using errcode = '22023'; end if;
    v_final := v_first;
  else
    v_kind := nullif(p_card ->> 'source_kind', '');
    if coalesce((p_card ->> 'verify_timed_out')::boolean, false) then
      v_timed_out := true; v_stage := 'verificacion';
    else
      if v_kind is null or v_first_open is null then raise exception 'source_not_opened' using errcode = '22023'; end if;
      v_eval := nullif(p_card ->> 'evaluation', '');
      if v_eval is null or v_eval not in ('confirma','desmiente','nada_claro') then raise exception 'evaluation_required' using errcode = '22023'; end if;
      v_final := nullif(p_card ->> 'final_action', '');
      if v_final is null or v_final not in ('reenviar','reenviar_aviso','no_reenviar') then raise exception 'final_action_required' using errcode = '22023'; end if;
      if v_belief is null then raise exception 'belief_required' using errcode = '22023'; end if;
      -- El tiempo de lectura no puede superar lo que pasó desde que el servidor registró la apertura
      v_bound := least(600000, greatest(0, extract(epoch from (now() - v_first_open)) * 1000))::int;
      v_read := least(greatest(coalesce((p_card ->> 'read_ms')::numeric, 0), 0)::int, v_bound);
      select x into v_src from jsonb_array_elements(n.consult_sources) x where x ->> 'kind' = v_kind limit 1;
      v_eval_ok := v_eval = (v_src ->> 'says');
      v_min_read := public._cfg(st, 'min_read_ms', 2000)::int;
      v_eff := v_kind in ('oficial','medio') and v_read >= v_min_read and v_eval_ok;
    end if;
    if v_timed_out then
      v_kind := case when v_kind = any(v_opened) then v_kind else null end;
      v_eval := null; v_final := null; v_belief := null; v_reason := null;
    end if;
  end if;

  if v_timed_out then
    v_state := 'E7'; v_belief := null; v_final := null; v_reason := null;
  else
    v_state := case
      when v_first = 'reenviar' then 'E1' when v_first = 'reenviar_aviso' then 'E2' when v_first = 'no_reenviar' then 'E3'
      when v_final = 'reenviar' then 'E4' when v_final = 'reenviar_aviso' then 'E5' else 'E6' end;
    v_belief_ok := case when v_belief = 'no_se' then null else (v_belief = 'si') = n.is_real end;
    v_points := case when v_belief_ok then 100 when not v_belief_ok then -100 else 0 end;
  end if;

  insert into public.share_decisions
    (session_id, news_item_id, position, instrument_version, is_real, image_shown, first_action, first_action_ms,
     timed_out, timeout_stage, sources_opened, source_kind, read_ms, evaluation, evaluation_correct,
     effective_verification, final_action, belief, belief_correct, reason, state, points)
  values
    (s.id, n.id, p_position, s.instrument_version, n.is_real, coalesce(s.image_flags[p_position], false), v_first, v_first_ms,
     v_timed_out, v_stage, v_opened, v_kind, v_read, v_eval, v_eval_ok,
     v_eff, v_final, v_belief, v_belief_ok, v_reason, v_state, v_points)
  returning id into v_id;

  return public._v4_feedback(v_id);
end $$;

-- ---------------------------------------------------------------------------
-- complete_session_v4: cierra la sesión y calcula el resumen (para el ranking y el percentil)
-- correct_count = creencias correctas; error_count = creencias incorrectas; score = saldo inicial + puntos
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Vistas para el panel (security_invoker: respetan la RLS de quien consulta)
-- ---------------------------------------------------------------------------
create or replace view public.v_share_decisions with (security_invoker = true) as
select d.id as decision_id, d.session_id, s.instrument_version, s.status as session_status, s.is_test, s.exclusion_reason,
       s.entry_origin, s.survey_intent, s.survey_code, s.device_class, s.device_replay,
       n.item_key, n.category, n.headline, d.is_real, d.position, d.image_shown,
       d.first_action, d.first_action_ms, d.timed_out, d.timeout_stage, d.sources_opened, d.source_kind, d.read_ms,
       d.evaluation, d.evaluation_correct, d.effective_verification, d.final_action, d.belief, d.belief_correct,
       d.reason, d.state, d.points, d.created_at
  from public.share_decisions d
  join public.participant_sessions s on s.id = d.session_id
  join public.news_items n on n.id = d.news_item_id;

-- Una fila por sesión 4.0.0 con sus conteos. R = decisiones con respuesta (E1..E6).
create or replace view public.v_share_sessions with (security_invoker = true) as
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

revoke all on public.v_share_decisions, public.v_share_sessions from anon, public;
grant select on public.v_share_decisions, public.v_share_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Guardar las fuentes consultables de una tarjeta del banco (analyst+). Se validan forma y largo.
-- ---------------------------------------------------------------------------
create or replace function public._check_sources(p jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare x jsonb; k text; kinds text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 3 then raise exception 'fuentes_invalidas' using errcode = '22023'; end if;
  for x in select * from jsonb_array_elements(p) loop
    for k in select jsonb_object_keys(x) loop
      if k not in ('kind','label','url','excerpt','says','simulated','comments','published') then raise exception 'fuente_clave_desconocida: %', k using errcode = '22023'; end if;
    end loop;
    if coalesce(x ->> 'kind', '') not in ('oficial','medio','comentarios') or (x ->> 'kind') = any(kinds) then raise exception 'fuente_tipo_invalido' using errcode = '22023'; end if;
    kinds := kinds || (x ->> 'kind');
    if char_length(coalesce(x ->> 'label', '')) not between 2 and 80 then raise exception 'fuente_nombre_invalido' using errcode = '22023'; end if;
    if char_length(coalesce(x ->> 'excerpt', '')) not between 10 and 600 then raise exception 'fuente_extracto_invalido' using errcode = '22023'; end if;
    if coalesce(x ->> 'says', '') not in ('confirma','desmiente','nada_claro') then raise exception 'fuente_lectura_invalida' using errcode = '22023'; end if;
    if x ? 'url' and jsonb_typeof(x -> 'url') <> 'null' and coalesce(x ->> 'url', '') !~ '^https://' then raise exception 'fuente_url_invalida' using errcode = '22023'; end if;
    if x ? 'comments' and (jsonb_typeof(x -> 'comments') <> 'array' or jsonb_array_length(x -> 'comments') > 4) then raise exception 'fuente_comentarios_invalidos' using errcode = '22023'; end if;
  end loop;
end $$;

create or replace function public.save_news_sources(p_bank_id uuid, p_sources jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_rev int;
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public._check_sources(p_sources);
  update public.news_bank set consult_sources = p_sources, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
   where id = p_bank_id returning revision into v_rev;
  if v_rev is null then raise exception 'tarjeta_no_existe' using errcode = 'P0002'; end if;
  perform public._audit('edit_news_sources', 'news_bank', p_bank_id::text, jsonb_build_object('revision', v_rev, 'n', jsonb_array_length(p_sources)));
  return jsonb_build_object('id', p_bank_id, 'revision', v_rev);
end $$;

-- Configuración de la encuesta de un borrador (forma parte del instrumento: solo borradores)
create or replace function public.set_draft_survey(p_study_id uuid, p_survey_url text, p_code_entry text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_survey_url is not null and p_survey_url !~ '^https://(docs\.google\.com/forms/d/e/[A-Za-z0-9_-]+/viewform|forms\.gle/[A-Za-z0-9]+)$' then
    raise exception 'url_de_encuesta_invalida' using errcode = '22023';
  end if;
  if p_code_entry is not null and p_code_entry !~ '^entry\.[0-9]{3,15}$' then raise exception 'campo_de_codigo_invalido' using errcode = '22023'; end if;
  update public.studies set config = config || jsonb_build_object('survey_url', p_survey_url, 'survey_code_entry', p_code_entry), updated_at = now()
   where id = p_study_id and status = 'draft';
  if not found then raise exception 'solo_borradores' using errcode = '22023'; end if;
  perform public._audit('set_draft_survey', 'study', p_study_id::text, jsonb_build_object('survey_url', p_survey_url, 'survey_code_entry', p_code_entry));
end $$;

-- Buscar las sesiones con un código (para enlazar con la hoja de la encuesta o atender una solicitud de borrado)
create or replace function public.find_sessions_by_code(p_code text)
returns table (session_id uuid, instrument_version text, status text, started_at timestamptz, survey_code_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select s.id, s.instrument_version, s.status, s.started_at, s.survey_code_at
    from public.participant_sessions s where s.survey_code = public._survey_code_norm(p_code) order by s.started_at;
end $$;

-- ---------------------------------------------------------------------------
-- start_session (versiones 1.0.0–3.1.0): misma función, con un único cambio: si la versión activa es
-- 4.0.0, se niega (un teléfono con la página anterior abierta no puede mezclar flujos).
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
  -- La 4.0.0 se juega con start_session_v4; un cliente anterior no puede abrir sesiones de ella.
  if coalesce(st.config ->> 'mode', '') = 'responsabilidad' then raise exception 'study_is_v4' using errcode = '22023'; end if;

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
-- create_study_version: igual que antes, pero copia también las fuentes consultables.
-- (Las preguntas y reglas siguen copiándose de la versión activa.)
-- ---------------------------------------------------------------------------
create or replace function public.create_study_version(p_version text, p_title text, p_changelog text, p_card_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  base public.studies;
  v_id uuid;
  v_n int; v_real int; v_min int;
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_version, '') !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then raise exception 'version_invalida: usa el formato 3.1.0' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_changelog, ''))) < 10 then raise exception 'falta_nota_de_cambios' using errcode = '22023'; end if;
  select * into base from public.studies where code = 'lo-reenviarias' and status = 'active';
  if not found then raise exception 'no_hay_version_activa' using errcode = 'P0002'; end if;
  if exists (select 1 from public.studies where code = base.code and version = p_version) then
    raise exception 'version_existente: % ya existe', p_version using errcode = '23505';
  end if;

  select count(*), count(*) filter (where is_real) into v_n, v_real
    from public.news_bank where id = any(p_card_ids) and not archived;
  v_min := public._cfg(base, 'items_per_session', 10)::int;
  if v_n <> cardinality(array(select distinct unnest(p_card_ids))) then raise exception 'tarjeta_archivada_o_inexistente' using errcode = '22023'; end if;
  if v_n < v_min then raise exception 'pocas_noticias: hacen falta al menos % y elegiste %', v_min, v_n using errcode = '22023'; end if;
  if v_real = 0 or v_real = v_n then raise exception 'faltan_reales_o_falsas' using errcode = '22023'; end if;

  insert into public.studies (code, version, title, description, status, config, changelog)
  values (base.code, p_version, coalesce(nullif(btrim(p_title), ''), base.title),
          format('Armada desde el banco de noticias: %s noticias (%s reales, %s falsas). Preguntas y reglas copiadas de la %s.', v_n, v_real, v_n - v_real, base.version),
          'draft', base.config, btrim(p_changelog))
  returning id into v_id;

  insert into public.survey_questions (study_id, question_key, phase, kind, prompt, options, required, position, min_length, max_length)
  select v_id, q.question_key, q.phase, q.kind, q.prompt, q.options, q.required, q.position, q.min_length, q.max_length
    from public.survey_questions q where q.study_id = base.id;

  insert into public.news_items (study_id, bank_id, item_key, item_version, headline, body_text, is_real, category, source_name, source_url,
                                 source_published_on, explanation, hint, red_flags, display, validation_status, validation_notes, consult_sources)
  select v_id, b.id, b.item_key, b.revision, b.headline, b.body_text, b.is_real, b.category, b.source_name, b.source_url,
         b.source_published_on, b.explanation, b.hint, b.red_flags, b.display, b.validation_status, b.validation_notes, b.consult_sources
    from public.news_bank b where b.id = any(p_card_ids);

  perform public._audit('create_study_version', 'study', v_id::text, jsonb_build_object('version', p_version, 'items', v_n, 'base', base.version));
  return jsonb_build_object('id', v_id, 'version', p_version, 'items', v_n);
end $$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function public._survey_code_ok(text) from public, anon, authenticated;
revoke all on function public._survey_code_norm(text) from public, anon, authenticated;
revoke all on function public._is_v4(public.studies) from public, anon, authenticated;
revoke all on function public._v4_payload(uuid) from public, anon, authenticated;
revoke all on function public._v4_feedback(bigint) from public, anon, authenticated;
revoke all on function public._v4_summary(uuid) from public, anon, authenticated;
revoke all on function public._check_sources(jsonb) from public, anon, authenticated;

do $$ declare f text; begin
  foreach f in array array['study_info(text)','start_session_v4(uuid,boolean,text,boolean,text,text,text,text,boolean)','get_session_v4(uuid)',
                           'set_survey_code(uuid,text,text)','open_source(uuid,int,text)','submit_card(uuid,int,jsonb)','complete_session_v4(uuid)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  foreach f in array array['save_news_sources(uuid,jsonb)','set_draft_survey(uuid,text,text)','find_sessions_by_code(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
