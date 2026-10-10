-- ============================================================================
-- 0011: integridad del estudio (auditoría del 10/10/2026, hallazgos M1 y B6)
--
-- Tres ámbitos que se mantienen separados (ver docs/integridad-estudio.md):
--
--   A. SEGURIDAD DEL SISTEMA
--      · El límite global de 120 sesiones por minuto ya no rechaza a estudiantes reales: queda un techo
--        alto solo como protección de la base (600/min por defecto) y una señal informativa de ráfaga.
--      · Ajustes técnicos en una tabla aparte (platform_settings), fuera de la configuración del instrumento.
--      · Exportaciones solo para analyst y owner, servidas por export_dataset, que escribe la auditoría
--        en la misma transacción. log_export (declarado por el navegador) deja de poder invocarse.
--
--   B. INTEGRIDAD DE LOS DATOS ACADÉMICOS
--      · Señales de actividad automatizada calculadas en el servidor solo con horas del servidor
--        (session_integrity). Nunca bloquean el juego ni cambian puntos ni retroalimentación:
--        solo sacan la partida del ranking público, de las estadísticas públicas y percentiles, y de la
--        muestra «válida para análisis». Las filas no se borran y una persona del equipo puede revisarlas.
--
--   C. PRIVACIDAD DE PARTICIPANTES
--      · No se usa IP, huella del navegador, user-agent ni ningún dato que identifique a una persona.
--      · El texto libre de las preguntas abiertas pasa a ser solo para analyst y owner.
--
-- No modifica filas existentes de ninguna tabla ni la configuración de ninguna versión del instrumento.
-- Reversión: security/reversion/20261011000400_revertir.sql
-- ============================================================================

-- ===========================================================================
-- A. SEGURIDAD DEL SISTEMA: ajustes técnicos (no forman parte del instrumento)
-- ===========================================================================
create table if not exists public.platform_settings (
  key         text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
comment on table public.platform_settings is 'Ajustes técnicos de la plataforma (umbrales y techos). No forman parte del instrumento ni de sus versiones. Solo owner, vía get_platform_settings / set_platform_setting (auditado).';
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated, public;

-- Valores por defecto (si falta una fila, se usa este valor) y rango permitido para cada ajuste
create or replace function public._setting_catalog()
returns table (key text, default_value numeric, min_value numeric, max_value numeric, description text)
language sql immutable set search_path = '' as $$
  values
    ('sessions_per_minute_ceiling', 600::numeric, 60::numeric, 100000::numeric,
     'Seguridad del sistema: techo global de sesiones nuevas por minuto. Solo protege la base; por encima se responde rate_limited.'),
    ('burst_sessions_per_minute', 120, 10, 100000,
     'Integridad: si al empezar ya había al menos este número de sesiones en el último minuto, la sesión lleva la señal informativa «rafaga».'),
    ('min_game_seconds', 10, 0, 600,
     'Integridad: partida completa en menos de estos segundos (desde que empieza el juego hasta la última decisión) = «partida_rapida». 0 desactiva.'),
    ('min_decision_interval_ms', 800, 0, 10000,
     'Integridad: intervalo entre decisiones (hora del servidor) por debajo del cual una decisión cuenta como demasiado rápida.'),
    ('fast_decisions_run', 3, 2, 50,
     'Integridad: número de decisiones demasiado rápidas SEGUIDAS para la señal «decisiones_rapidas».'),
    ('constant_pace_max_cv', 0.10, 0, 1,
     'Integridad: coeficiente de variación de los intervalos por debajo del cual el ritmo es «ritmo_constante». 0 desactiva.'),
    ('constant_pace_min_intervals', 8, 3, 50,
     'Integridad: mínimo de intervalos con respuesta (sin tiempo agotado) para evaluar «ritmo_constante».')
$$;

create or replace function public._setting(p_key text)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when jsonb_typeof(p.value) = 'number' then (p.value #>> '{}')::numeric end
       from public.platform_settings p where p.key = p_key),
    (select c.default_value from public._setting_catalog() c where c.key = p_key))
$$;

insert into public.platform_settings (key, value)
select c.key, to_jsonb(c.default_value) from public._setting_catalog() c
on conflict (key) do nothing;

create or replace function public.get_platform_settings()
returns table (key text, value numeric, default_value numeric, min_value numeric, max_value numeric, description text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin('owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select c.key, public._setting(c.key), c.default_value, c.min_value, c.max_value, c.description, p.updated_at
    from public._setting_catalog() c left join public.platform_settings p on p.key = c.key order by c.key;
end $$;

create or replace function public.set_platform_setting(p_key text, p_value numeric)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare c record; v_old numeric;
begin
  if not public.is_admin('owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public._setting_catalog() x where x.key = p_key;
  if not found then raise exception 'ajuste_desconocido' using errcode = '22023'; end if;
  if p_value is null or p_value < c.min_value or p_value > c.max_value then
    raise exception 'valor_fuera_de_rango: % debe estar entre % y %', p_key, c.min_value, c.max_value using errcode = '22023';
  end if;
  v_old := public._setting(p_key);
  insert into public.platform_settings (key, value, updated_at, updated_by) values (p_key, to_jsonb(p_value), now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  perform public._audit('set_platform_setting', 'platform_setting', p_key, jsonb_build_object('old', v_old, 'new', p_value));
  return jsonb_build_object('key', p_key, 'value', p_value);
end $$;

-- ===========================================================================
-- B. INTEGRIDAD DE LOS DATOS ACADÉMICOS: señales de actividad automatizada
-- ===========================================================================
-- Tabla aparte (no columnas nuevas en participant_sessions): calcular o recalcular señales no toca
-- ninguna fila de las sesiones (ni su updated_at) y la reversión es simplemente borrar la tabla.
create table if not exists public.session_integrity (
  session_id          uuid primary key references public.participant_sessions(id) on delete cascade,
  automation_signals  text[] not null default '{}'
                      check (automation_signals <@ array['rafaga','partida_rapida','decisiones_rapidas','ritmo_constante']::text[]),
  computed_at         timestamptz not null default now(),
  review              text check (review is null or review = 'humana'),
  reviewed_at         timestamptz
);
comment on table public.session_integrity is 'Señales de actividad automatizada por sesión, calculadas en el servidor solo con horas del servidor. No contiene IP, user-agent ni datos de la persona. Las señales no bloquean el juego: solo afectan el ranking público, las estadísticas públicas y la muestra válida para análisis.';
comment on column public.session_integrity.automation_signals is 'rafaga (informativa: empezó durante una ráfaga de sesiones; por sí sola no excluye) · partida_rapida · decisiones_rapidas · ritmo_constante. Umbrales en platform_settings.';
comment on column public.session_integrity.review is 'Revisión humana del equipo: «humana» = se revisó y no se considera automatizada; anula la exclusión. Queda en audit_events.';

alter table public.session_integrity enable row level security;
revoke all on public.session_integrity from anon, authenticated, public;
grant select on public.session_integrity to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'session_integrity' and policyname = 'admin_read') then
    create policy admin_read on public.session_integrity for select to authenticated using ((select public.is_admin('viewer')));
  end if;
end $$;

-- ¿Las señales sacan a la sesión del ranking y del análisis? «rafaga» sola no; una revisión «humana» anula la exclusión.
create or replace function public._automation_excludes(p_signals text[], p_review text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_review, '') <> 'humana'
     and exists (select 1 from unnest(coalesce(p_signals, '{}'::text[])) x where x <> 'rafaga')
$$;

create or replace function public._session_automation_excluded(p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select public._automation_excludes(i.automation_signals, i.review)
                     from public.session_integrity i where i.session_id = p_session_id), false)
$$;

-- Cálculo de las señales de una sesión 4.x. Solo usa horas del servidor:
--   started_at y game_started_at de la sesión y created_at de cada decisión (share_decisions).
-- (El tiempo de lectura al verificar ya está acotado en submit_card por la hora del servidor de la
--  apertura de la fuente, así que no hace falta una señal aparte para eso.)
create or replace function public._automation_signals(p_session_id uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare
  s public.participant_sessions;
  v_sig text[] := '{}';
  v_t0 timestamptz; v_prev timestamptz; v_last timestamptz;
  v_gap numeric; v_gaps numeric[] := '{}';
  v_run int := 0; v_max_run int := 0; v_n int := 0;
  v_min_ms numeric := public._setting('min_decision_interval_ms');
  v_need_run int := public._setting('fast_decisions_run')::int;
  v_cv_max numeric := public._setting('constant_pace_max_cv');
  v_cv_n int := public._setting('constant_pace_min_intervals')::int;
  v_min_game numeric := public._setting('min_game_seconds');
  v_mean numeric; v_sd numeric; v_recent int;
  d record;
begin
  select * into s from public.participant_sessions where id = p_session_id;
  if not found then return '{}'; end if;

  -- rafaga: sesiones del mismo estudio iniciadas en el minuto anterior a esta (informativa)
  select count(*) into v_recent from public.participant_sessions o
   where o.study_id = s.study_id and o.id <> s.id
     and o.started_at > s.started_at - interval '1 minute' and o.started_at <= s.started_at;
  if v_recent >= public._setting('burst_sessions_per_minute') then v_sig := v_sig || 'rafaga'::text; end if;

  -- Intervalos entre decisiones (el primero, desde que empezó el juego)
  v_t0 := coalesce(s.game_started_at, s.started_at);
  v_prev := v_t0;
  for d in select x.created_at, x.state from public.share_decisions x where x.session_id = s.id order by x.position loop
    v_n := v_n + 1;
    v_gap := extract(epoch from (d.created_at - v_prev)) * 1000;
    if v_gap < v_min_ms then v_run := v_run + 1; else v_run := 0; end if;
    v_max_run := greatest(v_max_run, v_run);
    -- Para el ritmo constante no cuentan las tarjetas con tiempo agotado (duran siempre lo mismo)
    if d.state <> 'E7' then v_gaps := v_gaps || v_gap; end if;
    v_prev := d.created_at;
    v_last := d.created_at;
  end loop;

  if v_n > 0 and v_n >= cardinality(s.presentation_order) and v_min_game > 0
     and extract(epoch from (v_last - v_t0)) < v_min_game then
    v_sig := v_sig || 'partida_rapida'::text;
  end if;
  if v_max_run >= v_need_run then v_sig := v_sig || 'decisiones_rapidas'::text; end if;
  if v_cv_max > 0 and cardinality(v_gaps) >= v_cv_n then
    select avg(g), stddev_pop(g) into v_mean, v_sd from unnest(v_gaps) g;
    if v_mean <= 0 or v_sd / v_mean < v_cv_max then v_sig := v_sig || 'ritmo_constante'::text; end if;
  end if;
  return v_sig;
end $$;

create or replace function public._store_automation_signals(p_session_id uuid)
returns text[] language plpgsql volatile security definer set search_path = '' as $$
declare v text[] := public._automation_signals(p_session_id);
begin
  insert into public.session_integrity (session_id, automation_signals, computed_at)
  values (p_session_id, v, now())
  on conflict (session_id) do update set automation_signals = excluded.automation_signals, computed_at = now();
  return v;
end $$;

-- Recalcular señales de sesiones 4.x ya terminadas (analyst+). Solo escribe en session_integrity:
-- no cambia sesiones, decisiones, puntajes, ranking ya publicado ni revisiones humanas.
create or replace function public.recompute_automation_signals(p_session_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_n int := 0; v_flagged int := 0; r record; v text[];
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  for r in select s.id from public.participant_sessions s join public.studies st on st.id = s.study_id
            where public._is_v4(st) and s.status = 'completed' and (p_session_id is null or s.id = p_session_id) loop
    v := public._store_automation_signals(r.id);
    v_n := v_n + 1;
    if public._automation_excludes(v, null) then v_flagged := v_flagged + 1; end if;
  end loop;
  perform public._audit('recompute_automation_signals', 'session', p_session_id::text, jsonb_build_object('sessions', v_n, 'with_signals', v_flagged));
  return jsonb_build_object('sessions', v_n, 'with_signals', v_flagged);
end $$;

-- Revisión humana (analyst+): «humana» anula la exclusión por señales; false la quita. Auditada.
create or replace function public.review_automation(p_session_id uuid, p_human boolean, p_note text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'nota_demasiado_larga' using errcode = '22023'; end if;
  if not exists (select 1 from public.participant_sessions where id = p_session_id) then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  insert into public.session_integrity (session_id, automation_signals, computed_at, review, reviewed_at)
  values (p_session_id, public._automation_signals(p_session_id), now(), case when p_human then 'humana' end, now())
  on conflict (session_id) do update set review = case when p_human then 'humana' end, reviewed_at = now();
  perform public._audit('review_automation', 'session', p_session_id::text, jsonb_build_object('humana', coalesce(p_human, false), 'note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- start_session_v4: igual que en 20261011000100, salvo el control de frecuencia:
--   · antes: 120/min (configuración de la versión) rechazaba a cualquiera, incluso a una clase entera;
--   · ahora: techo técnico alto (platform_settings, 600/min por defecto) solo para proteger la base, y
--     las sesiones que empiezan durante una ráfaga llevan la señal informativa «rafaga».
--   No se usa IP ni ningún dato del dispositivo.
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

  -- Techo técnico global (protección de la base, no de los datos)
  select count(*) into v_recent from public.participant_sessions where study_id = st.id and started_at > now() - interval '1 minute';
  if v_recent >= public._setting('sessions_per_minute_ceiling') then raise exception 'rate_limited' using errcode = '53400'; end if;

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

  -- Ráfaga: señal informativa (no excluye por sí sola ni frena a nadie)
  if found and v_recent >= public._setting('burst_sessions_per_minute') then
    insert into public.session_integrity (session_id, automation_signals) values (p_session_id, array['rafaga'])
    on conflict (session_id) do nothing;
  end if;

  return public.get_session_v4(p_session_id);
end $$;

-- ---------------------------------------------------------------------------
-- complete_session_v4: igual que antes y, al cerrar, calcula las señales (no cambian el resumen).
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

  -- Integridad: señales de actividad automatizada (no cambian puntos ni retroalimentación)
  perform public._store_automation_signals(s.id);

  return public._v4_summary(s.id);
end $$;

-- Percentil («Superaste al X %»): las partidas con señales no cuentan como referencia para nadie.
-- La propia partida sigue viendo su resultado igual que siempre.
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
   where ps.study_id = s.study_id and ps.status = 'completed' and not ps.is_test and ps.exclusion_reason is null and ps.id <> s.id
     and not public._session_automation_excluded(ps.id);
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

-- Estadística pública de la portada: sin partidas con señales
create or replace function public.public_stats(p_study_code text default 'lo-reenviarias')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare st public.studies; v_n int; v_mean numeric;
begin
  select * into st from public.studies where code = p_study_code and status = 'active';
  if not found then return jsonb_build_object('n', null); end if;
  select count(*), avg(g.correct_count) into v_n, v_mean
    from public.game_sessions_summary g join public.participant_sessions s on s.id = g.session_id
   where s.study_id = st.id and s.status = 'completed' and not s.is_test and s.exclusion_reason is null
     and not public._session_automation_excluded(s.id);
  if v_n < public._cfg(st, 'public_stats_min_n', 10) then return jsonb_build_object('n', null); end if;
  return jsonb_build_object('n', v_n, 'mean_correct', round(v_mean, 1));
end $$;

-- Ranking: una partida con señales no entra. La respuesta es neutra (eligible = false) y no acusa a nadie.
create or replace function public.leaderboard_status(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.participant_sessions; st public.studies; v_ok boolean;
begin
  select * into s from public.participant_sessions where id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  select * into st from public.studies where id = s.study_id;
  if coalesce((st.config ->> 'leaderboard')::boolean, false) is not true then
    return jsonb_build_object('enabled', false);
  end if;
  v_ok := not public._session_automation_excluded(s.id);
  return jsonb_build_object('enabled', true, 'joined', s.leaderboard_joined, 'eligible', v_ok,
    'can_join', s.status = 'completed' and not s.leaderboard_joined and v_ok, 'top', public._lb_top(st.id));
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
  -- Integridad: respuesta neutra, sin error ni explicación (no se acusa a nadie)
  if public._session_automation_excluded(s.id) then
    return jsonb_build_object('eligible', false, 'top', public._lb_top(st.id));
  end if;

  v_alias := public._alias(p_animal, p_adj, p_num);
  insert into public.leaderboard_entries (study_id, week, alias, score, correct_count)
  values (st.id, public._lb_week(), v_alias, g.score, g.correct_count);
  update public.participant_sessions set leaderboard_joined = true where id = s.id;

  select count(*) + 1 into v_rank from public.leaderboard_entries
   where study_id = st.id and week = public._lb_week()
     and (score > g.score or (score = g.score and correct_count > g.correct_count));
  return jsonb_build_object('eligible', true, 'alias', v_alias, 'rank', v_rank, 'top', public._lb_top(st.id));
end $$;

-- ---------------------------------------------------------------------------
-- Vistas del panel: señales visibles y fuera de la muestra «válida» (las filas se conservan).
-- Se agregan columnas al final; is_valid excluye además las sesiones con señales no revisadas.
-- ---------------------------------------------------------------------------
create or replace view public.v_sessions with (security_invoker = true) as
select
  s.id                         as session_id,
  st.code                      as study_code,
  s.instrument_version,
  s.origin,
  s.status,
  s.is_test,
  s.exclusion_reason,
  (s.status = 'completed' and not s.is_test and s.exclusion_reason is null
     and coalesce(g.decisions_count, 0) = coalesce(nullif(cardinality(s.presentation_order), 0), 10)
     and not public._automation_excludes(i.automation_signals, i.review)) as is_valid,
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
  g.simulated_reach_total,
  coalesce(i.automation_signals, '{}'::text[])                   as automation_signals,
  i.review                                                       as automation_review,
  public._automation_excludes(i.automation_signals, i.review)    as automation_flagged
from public.participant_sessions s
join public.studies st on st.id = s.study_id
left join public.game_sessions_summary g on g.session_id = s.id
left join public.session_integrity i on i.session_id = s.id;

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
       (s.status = 'completed' and not s.is_test and s.exclusion_reason is null and count(d.id) = cardinality(s.presentation_order)
          and not public._automation_excludes(i.automation_signals, i.review)) as is_valid,
       coalesce(i.automation_signals, '{}'::text[])                as automation_signals,
       i.review                                                    as automation_review,
       public._automation_excludes(i.automation_signals, i.review) as automation_flagged
  from public.participant_sessions s
  join public.studies st on st.id = s.study_id and coalesce(st.config ->> 'mode', '') = 'responsabilidad'
  left join public.share_decisions d on d.session_id = s.id
  left join public.game_sessions_summary g on g.session_id = s.id
  left join public.session_integrity i on i.session_id = s.id
 group by s.id, g.score, i.automation_signals, i.review;

-- ===========================================================================
-- C. PRIVACIDAD DE PARTICIPANTES: el texto libre solo para analyst y owner
-- ===========================================================================
-- Políticas RESTRICTIVAS (se suman como condición a las existentes, que no se tocan):
-- viewer sigue viendo las respuestas de opción, pero no el texto libre.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'survey_responses' and policyname = 'texto_libre_solo_analyst') then
    create policy texto_libre_solo_analyst on public.survey_responses as restrictive for select to authenticated
      using (text_value is null or (select public.is_admin('analyst')));
  end if;
  -- Tabla del HTML original (solo existe en la base que venía de él): también contiene texto libre
  if to_regclass('public.radiografia_respuestas') is not null
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'radiografia_respuestas' and policyname = 'texto_libre_solo_analyst') then
    create policy texto_libre_solo_analyst on public.radiografia_respuestas as restrictive for select to authenticated
      using ((select public.is_admin('analyst')));
  end if;
end $$;

-- ===========================================================================
-- A. SEGURIDAD DEL SISTEMA: exportaciones con mínimo privilegio y auditoría del servidor
-- ===========================================================================
-- export_dataset devuelve las filas pedidas y escribe la auditoría en la MISMA transacción:
-- si no se puede registrar, no se entrega nada. El número de filas lo cuenta el servidor.
-- p_filters: { session_ids?: uuid[], row_ids?: (uuid|entero)[], descripcion?: texto, formato?: csv|xlsx|zip }
--   row_ids: clave de cada fila (session_id en sesiones, decision_id en decisiones, response_id en abiertas).
create or replace function public.export_dataset(p_dataset text, p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  k text; v_sids uuid[]; v_rows_txt text[]; v_rid_uuid uuid[]; v_rid_int bigint[];
  v_desc text; v_format text; v_rows jsonb; v_n int;
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_dataset is null or p_dataset not in ('sesiones','decisiones','abiertas','v4_sesiones','v4_decisiones') then
    raise exception 'dataset_invalido' using errcode = '22023';
  end if;
  p_filters := coalesce(p_filters, '{}'::jsonb);
  if jsonb_typeof(p_filters) <> 'object' then raise exception 'filtros_invalidos' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_filters) loop
    if k not in ('session_ids','row_ids','descripcion','formato') then raise exception 'filtro_desconocido: %', k using errcode = '22023'; end if;
  end loop;
  if p_filters ? 'descripcion' then
    if jsonb_typeof(p_filters -> 'descripcion') <> 'string' or char_length(p_filters ->> 'descripcion') > 500 then raise exception 'filtros_invalidos' using errcode = '22023'; end if;
    v_desc := p_filters ->> 'descripcion';
  end if;
  if p_filters ? 'formato' then
    v_format := p_filters ->> 'formato';
    if v_format is null or v_format not in ('csv','xlsx','zip') then raise exception 'filtros_invalidos' using errcode = '22023'; end if;
  end if;
  begin
    if p_filters ? 'session_ids' then
      if jsonb_typeof(p_filters -> 'session_ids') <> 'array' or jsonb_array_length(p_filters -> 'session_ids') > 200000 then raise exception 'filtros_invalidos'; end if;
      select coalesce(array_agg(x::uuid), '{}') into v_sids from jsonb_array_elements_text(p_filters -> 'session_ids') x;
    end if;
    if p_filters ? 'row_ids' then
      if jsonb_typeof(p_filters -> 'row_ids') <> 'array' or jsonb_array_length(p_filters -> 'row_ids') > 500000 then raise exception 'filtros_invalidos'; end if;
      select coalesce(array_agg(x), '{}') into v_rows_txt from jsonb_array_elements_text(p_filters -> 'row_ids') x;
      if p_dataset in ('sesiones','v4_sesiones') then v_rid_uuid := v_rows_txt::uuid[]; else v_rid_int := v_rows_txt::bigint[]; end if;
    end if;
  exception when others then
    raise exception 'filtros_invalidos' using errcode = '22023';
  end;

  if p_dataset = 'sesiones' then
    select coalesce(jsonb_agg(to_jsonb(v) order by v.started_at, v.session_id), '[]'::jsonb), count(*) into v_rows, v_n
      from public.v_sessions v
     where (v_sids is null or v.session_id = any(v_sids)) and (v_rid_uuid is null or v.session_id = any(v_rid_uuid));
  elsif p_dataset = 'decisiones' then
    select coalesce(jsonb_agg(to_jsonb(v) order by v.decision_id), '[]'::jsonb), count(*) into v_rows, v_n
      from public.v_decisions v
     where (v_sids is null or v.session_id = any(v_sids)) and (v_rid_int is null or v.decision_id = any(v_rid_int));
  elsif p_dataset = 'abiertas' then
    select coalesce(jsonb_agg(to_jsonb(v) order by v.response_id), '[]'::jsonb), count(*) into v_rows, v_n
      from public.v_open_responses v
     where (v_sids is null or v.session_id = any(v_sids)) and (v_rid_int is null or v.response_id = any(v_rid_int));
  elsif p_dataset = 'v4_sesiones' then
    select coalesce(jsonb_agg(to_jsonb(v) order by v.started_at, v.session_id), '[]'::jsonb), count(*) into v_rows, v_n
      from public.v_share_sessions v
     where (v_sids is null or v.session_id = any(v_sids)) and (v_rid_uuid is null or v.session_id = any(v_rid_uuid));
  else
    select coalesce(jsonb_agg(to_jsonb(v) order by v.decision_id), '[]'::jsonb), count(*) into v_rows, v_n
      from public.v_share_decisions v
     where (v_sids is null or v.session_id = any(v_sids)) and (v_rid_int is null or v.decision_id = any(v_rid_int));
  end if;

  -- Auditoría escrita por el servidor (mismo transacción que la lectura). Los identificadores pedidos
  -- no se copian: se guarda cuántos eran y una huella para poder comprobar la selección.
  perform public._audit('export', 'dataset', p_dataset, jsonb_build_object(
    'dataset', p_dataset, 'rows', v_n, 'via', 'export_dataset', 'formato', v_format, 'filtros', v_desc,
    'session_ids', cardinality(v_sids), 'row_ids', cardinality(v_rows_txt),
    'seleccion_md5', case when v_sids is null and v_rows_txt is null then null
                          else md5(coalesce(array_to_string(array(select unnest(v_sids)::text order by 1), ','), '') || '|' ||
                                   coalesce(array_to_string(array(select unnest(v_rows_txt) order by 1), ','), '')) end));
  return jsonb_build_object('dataset', p_dataset, 'row_count', v_n, 'exported_at', now(), 'rows', v_rows);
end $$;

-- El registro declarado por el navegador deja de poder invocarse (la función se conserva por historial)
revoke execute on function public.log_export(jsonb) from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones nuevas
-- ---------------------------------------------------------------------------
revoke all on function public._setting_catalog() from public, anon, authenticated;
revoke all on function public._setting(text) from public, anon, authenticated;
revoke all on function public._automation_signals(uuid) from public, anon, authenticated;
revoke all on function public._store_automation_signals(uuid) from public, anon, authenticated;
revoke all on function public._session_automation_excluded(uuid) from public, anon, authenticated;
-- Función pura que usan las vistas (security_invoker): la necesita authenticated, no anon
revoke all on function public._automation_excludes(text[], text) from public, anon;
grant execute on function public._automation_excludes(text[], text) to authenticated;

do $$ declare f text; begin
  foreach f in array array['get_platform_settings()','set_platform_setting(text,numeric)','recompute_automation_signals(uuid)',
                           'review_automation(uuid,boolean,text)','export_dataset(text,jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
