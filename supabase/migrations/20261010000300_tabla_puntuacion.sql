-- ============================================================================
-- 0008: tabla de puntuación semanal con apodos (opcional, al final de la partida)
--
-- · Solo funciona en versiones cuyo config tenga "leaderboard": true (se marca al armar la versión).
-- · El apodo se compone en el servidor a partir de dos listas fijas y un número: no hay texto libre,
--   así que nadie puede escribir su nombre ni groserías.
-- · Las entradas NO guardan la sesión ni la hora: solo versión, semana, apodo, puntos y aciertos.
--   En la sesión solo queda que ya entró a la tabla (para no entrar dos veces).
-- · Entrar es voluntario y solo después de terminar la partida.
-- ============================================================================

create table if not exists public.leaderboard_entries (
  id             bigint generated always as identity primary key,
  study_id       uuid not null references public.studies(id),
  week           date not null,
  alias          text not null check (char_length(alias) between 3 and 60),
  score          integer not null,
  correct_count  smallint not null
);
comment on table public.leaderboard_entries is 'Tabla de puntuación semanal. Sin relación con la sesión ni con las respuestas: no se guarda session_id ni marca de tiempo.';
create index if not exists leaderboard_week_idx on public.leaderboard_entries (study_id, week, score desc, correct_count desc, id);

alter table public.participant_sessions add column if not exists leaderboard_joined boolean not null default false;
comment on column public.participant_sessions.leaderboard_joined is 'La persona puso un apodo en la tabla. No indica cuál.';

alter table public.leaderboard_entries enable row level security;
revoke all on public.leaderboard_entries from anon, authenticated, public;
grant select on public.leaderboard_entries to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'leaderboard_entries' and policyname = 'admin_read') then
    create policy admin_read on public.leaderboard_entries for select to authenticated using ((select public.is_admin('viewer')));
  end if;
end $$;

-- Listas de apodos (las mismas que src/game/aliases.ts). Adjetivos que sirven en masculino y femenino.
create or replace function public._alias(p_animal int, p_adj int, p_num int)
returns text language plpgsql immutable set search_path = '' as $$
declare
  animals constant text[] := array['Búho 🦉','Jaguar 🐆','Perezoso 🦥','Lapa 🦜','Tortuga 🐢','Mono 🐒','Rana 🐸','Delfín 🐬','Ballena 🐋','Mariposa 🦋',
                                   'Cocodrilo 🐊','Zorro 🦊','Pulpo 🐙','Abeja 🐝','Tiburón 🦈','Mapache 🦝','Iguana 🦎','Colibrí 🐦','Murciélago 🦇','Puma 🐈'];
  adjs constant text[] := array['Veloz','Audaz','Sagaz','Implacable','Imparable','Valiente','Inteligente','Paciente','Brillante','Genial',
                                'Tenaz','Alerta','Incansable','Infalible','Ágil','Elegante','Prudente','Leal','Capaz','Detective'];
begin
  if p_animal is null or p_adj is null or p_num is null
     or p_animal not between 0 and 19 or p_adj not between 0 and 19 or p_num not between 0 and 99 then
    raise exception 'apodo_invalido' using errcode = '22023';
  end if;
  -- «Jaguar Implacable 27 🐆»: animal, adjetivo, número y el emoji al final
  return format('%s %s %s %s', split_part(animals[p_animal + 1], ' ', 1), adjs[p_adj + 1], lpad(p_num::text, 2, '0'), split_part(animals[p_animal + 1], ' ', 2));
end $$;
revoke all on function public._alias(int, int, int) from public, anon, authenticated;

-- Semana en hora de Costa Rica (empieza el lunes)
create or replace function public._lb_week()
returns date language sql stable set search_path = '' as $$
  select date_trunc('week', now() at time zone 'America/Costa_Rica')::date
$$;
revoke all on function public._lb_week() from public, anon, authenticated;

create or replace function public._lb_top(p_study_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('rank', r, 'alias', alias, 'score', score, 'correct', correct_count) order by r, id), '[]'::jsonb)
    from (select id, alias, score, correct_count, rank() over (order by score desc, correct_count desc) as r
            from public.leaderboard_entries where study_id = p_study_id and week = public._lb_week()
           order by score desc, correct_count desc, id limit 10) t
$$;
revoke all on function public._lb_top(uuid) from public, anon, authenticated;

-- Estado de la tabla para una sesión: si la versión la tiene, si la sesión puede entrar y los 10 mejores.
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

-- Entrar a la tabla con el apodo elegido. El puntaje sale del servidor, no del navegador.
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

-- Marcar en un borrador si tendrá tabla de puntuación (forma parte del instrumento: solo en borradores).
create or replace function public.set_draft_leaderboard(p_study_id uuid, p_enabled boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.studies set config = config || jsonb_build_object('leaderboard', coalesce(p_enabled, false)), updated_at = now()
   where id = p_study_id and status = 'draft';
  if not found then raise exception 'solo_borradores' using errcode = '22023'; end if;
  perform public._audit('set_draft_leaderboard', 'study', p_study_id::text, jsonb_build_object('leaderboard', p_enabled));
end $$;

revoke all on function public.leaderboard_status(uuid) from public;
revoke all on function public.join_leaderboard(uuid, int, int, int) from public;
revoke all on function public.set_draft_leaderboard(uuid, boolean) from public, anon;
grant execute on function public.leaderboard_status(uuid) to anon, authenticated;
grant execute on function public.join_leaderboard(uuid, int, int, int) to anon, authenticated;
grant execute on function public.set_draft_leaderboard(uuid, boolean) to authenticated;
