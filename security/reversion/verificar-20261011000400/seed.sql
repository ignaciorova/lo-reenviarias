-- Datos de prueba para la verificación de la reversión (sesión 3.x excluida, 4.0.0 activa, 3 partidas 4.0.0 terminadas, 1 en curso, una en el ranking).
\set ON_ERROR_STOP 1
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000001','owner@test.local') on conflict do nothing;
insert into public.admin_profiles (user_id, role) values ('00000000-0000-4000-8000-000000000001','owner') on conflict do nothing;
-- sesión 3.x empezada antes del cambio
set role anon;
select public.start_session('aaaaaaaa-0000-4000-8000-000000000001', true);
select public.submit_survey('aaaaaaaa-0000-4000-8000-000000000001', 'pre', '{"opinion":"Busco la fuente primero","verifica":"Siempre","compartio_falso":"No","responsable":"Quien la crea"}');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.activate_study_version((select id from public.studies where version = '4.0.0'));
select public.set_session_flags('aaaaaaaa-0000-4000-8000-000000000001', false, 'prueba de exclusión');
reset role;
set role anon;
do $$ declare p jsonb; i int; k int; sid uuid; begin
  for k in 1..4 loop
    sid := ('bbbbbbbb-0000-4000-8000-00000000000' || k)::uuid;
    p := public.start_session_v4(sid, true, 'mobile', false, 'qr_juego');
    perform public.submit_survey(sid, 'pre', '{"primera_vez":"Sí, es la primera vez"}');
    if k = 4 then continue; end if;
    for i in 1..10 loop
      if i = 2 then perform public.open_source(sid, i, 'medio'); perform public.submit_card(sid, i, '{"first_action":"verificar","first_action_ms":2000,"source_kind":"medio","evaluation":"confirma","final_action":"no_reenviar","belief":"no","read_ms":100}');
      else perform public.submit_card(sid, i, jsonb_build_object('first_action', 'reenviar', 'first_action_ms', 3000, 'belief', 'si')); end if;
    end loop;
    perform public.complete_session_v4(sid);
  end loop;
  perform public.join_leaderboard('bbbbbbbb-0000-4000-8000-000000000001', 1, 2, 3);
end $$;
reset role;
