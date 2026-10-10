// Pruebas por la API HTTP real de Supabase con la clave publicable (rol anon).
// Uso: node pruebas-http.mjs <url-del-proyecto> <clave-publicable> [--partida]
// Sin --partida solo hace lecturas y escrituras que deben ser rechazadas: nunca crea ni cambia datos
// (las escrituras usan filtros que no coinciden con ninguna fila o valores que violan restricciones).
// Con --partida juega una partida completa (solo para la base de PRUEBAS).
const [base, key, flag] = process.argv.slice(2);
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const results = [];
const ok = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'OK  ' : 'FALLA'} ${name} — ${detail}`); };
const req = async (method, path, body, extra = {}) => {
  const r = await fetch(base + path, { method, headers: { ...H, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  let t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t.slice(0, 160) };
};
const denied = (r) => r.status === 401 || r.status === 403 || (r.json && r.json.code === '42501');
const ZERO = '00000000-0000-4000-8000-000000000000';

const tables = ['participant_sessions','game_decisions','game_sessions_summary','survey_responses','share_decisions','source_opens',
  'leaderboard_entries','hint_events','response_codes','audit_events','admin_profiles','studies','news_items','news_bank','survey_questions',
  'radiografia_respuestas','radiografia_respuestas_backup_20261009','v_sessions','v_decisions','v_open_responses','v_share_decisions','v_share_sessions',
  'platform_settings','session_integrity'];

for (const t of tables) {
  const r = await req('GET', `/rest/v1/${t}?select=*&limit=1`);
  const exists = !(r.json && r.json.code === 'PGRST205');
  ok(`leer ${t}`, denied(r) || !exists, `HTTP ${r.status} ${r.json?.code ?? ''}${exists ? '' : ' (no existe en esta base)'}`);
}
// Escrituras que deben rechazarse (y que no cambiarían nada aunque se aceptaran)
{ const r = await req('POST', '/rest/v1/radiografia_respuestas', { opinion: 'auditoria', aciertos: -999 }, { Prefer: 'return=minimal' });
  ok('insertar en radiografia_respuestas', denied(r) || r.json?.code === 'PGRST205', `HTTP ${r.status} ${r.json?.code ?? ''} ${r.json?.message ?? ''}`.trim()); }
{ const r = await req('PATCH', `/rest/v1/participant_sessions?id=eq.${ZERO}`, { is_test: true });
  ok('modificar participant_sessions', denied(r), `HTTP ${r.status} ${r.json?.code ?? ''}`); }
{ const r = await req('PATCH', `/rest/v1/game_sessions_summary?session_id=eq.${ZERO}`, { score: 999999 });
  ok('modificar puntajes', denied(r), `HTTP ${r.status} ${r.json?.code ?? ''}`); }
{ const r = await req('DELETE', `/rest/v1/share_decisions?id=eq.-1`);
  ok('borrar decisiones', denied(r), `HTTP ${r.status} ${r.json?.code ?? ''}`); }
{ const r = await req('POST', '/rest/v1/leaderboard_entries', { alias: 'x', score: 999999 });
  ok('insertar en el ranking', denied(r), `HTTP ${r.status} ${r.json?.code ?? ''}`); }
{ const r = await req('PATCH', `/rest/v1/v_sessions?session_id=eq.${ZERO}`, { is_test: true });
  ok('modificar vista v_sessions', denied(r) || r.json?.code === '55000', `HTTP ${r.status} ${r.json?.code ?? ''}`); }

// Funciones de administración (argumentos inofensivos)
const adminCalls = [
  ['list_admins', {}], ['grant_admin', { p_email: 'auditoria@example.com', p_role: 'owner', p_display_name: 'x' }],
  ['revoke_admin', { p_user_id: ZERO }], ['is_admin', { p_min_role: 'viewer' }], ['purge_sessions', { p_scope: 'ninguno', p_older_than_days: 36500 }],
  ['set_session_flags', { p_session_id: ZERO, p_is_test: true, p_exclusion_reason: null }], ['find_sessions_by_code', { p_code: 'ABC' }],
  ['log_export', { p_details: {} }], ['activate_study_version', { p_study_id: ZERO }], ['save_news_card', { p_card: {} }],
  ['set_survey_code', { p_session_id: ZERO, p_code: '1234567C', p_survey_intent: 'despues' }], ['_compute_summary', { p_session_id: ZERO }],
  ['export_dataset', { p_dataset: 'v4_sesiones', p_filters: {} }], ['review_automation', { p_session_id: ZERO, p_human: true, p_note: null }],
  ['recompute_automation_signals', { p_session_id: null }], ['get_platform_settings', {}], ['set_platform_setting', { p_key: 'burst_sessions_per_minute', p_value: 10 }],
  ['_automation_signals', { p_session_id: ZERO }], ['_setting', { p_key: 'sessions_per_minute_ceiling' }],
];
for (const [fn, args] of adminCalls) {
  const r = await req('POST', `/rest/v1/rpc/${fn}`, args);
  ok(`rpc ${fn}`, denied(r) || r.status === 404, `HTTP ${r.status} ${r.json?.code ?? ''} ${(r.json?.message ?? '').slice(0, 60)}`.trim());
}
// Funciones del juego con sesión ajena inventada
for (const [fn, args] of [['get_session_v4', { p_session_id: ZERO }], ['submit_card', { p_session_id: ZERO, p_position: 1, p_card: { first_action: 'reenviar', belief: 'si' } }],
  ['leaderboard_status', { p_session_id: ZERO }], ['join_leaderboard', { p_session_id: ZERO, p_animal: 1, p_adj: 1, p_num: 1 }]]) {
  const r = await req('POST', `/rest/v1/rpc/${fn}`, args);
  ok(`rpc ${fn} con sesión inventada`, r.status >= 400 && /session_not_found/.test(r.text), `HTTP ${r.status} ${(r.json?.message ?? '').slice(0, 40)}`);
}
{ const r = await req('POST', '/rest/v1/rpc/study_info', { p_study_code: 'lo-reenviarias' }); ok('rpc study_info', r.status === 200, `${r.text}`); }
{ const r = await req('POST', '/rest/v1/rpc/public_stats', { p_study_code: 'lo-reenviarias' }); ok('rpc public_stats', r.status === 200, `${r.text}`); }
{ const r = await req('POST', '/graphql/v1', { query: '{ __schema { queryType { fields { name } } } }' });
  ok('GraphQL no expone tablas', !(r.text.includes('participant') || r.text.includes('decision')), `HTTP ${r.status} ${r.text.slice(0, 100)}`); }
{ const r = await req('POST', '/storage/v1/object/list/noticias', { prefix: '', limit: 5 });
  ok('listar bucket noticias', Array.isArray(r.json) ? r.json.length === 0 : r.status >= 400, `HTTP ${r.status} ${r.text.slice(0, 80)}`); }
{ const r = await req('GET', '/auth/v1/settings');
  ok('configuración pública de Auth (informativa)', r.status === 200, `registro abierto=${r.json ? !r.json.disable_signup : '?'} correo autoconfirmado=${r.json?.mailer_autoconfirm}`); }

if (flag === '--partida') {
  const sid = crypto.randomUUID();
  let r = await req('POST', '/rest/v1/rpc/start_session_v4', { p_session_id: sid, p_consent: true, p_device_class: 'desktop', p_reduced_motion: false,
    p_entry_origin: 'qr', p_survey_intent: 'despues', p_survey_code: '1234567C', p_study_code: 'lo-reenviarias', p_device_replay: false });
  ok('iniciar partida 4.0.0', r.status === 200, `HTTP ${r.status} versión=${r.json?.instrument_version} código_encuesta_guardado=${r.json?.survey_code ?? 'null'}`);
  ok('el código de encuesta no se guarda', r.json && r.json.survey_code == null && r.json.survey_intent == null, `survey_code=${r.json?.survey_code} survey_intent=${r.json?.survey_intent}`);
  r = await req('POST', '/rest/v1/rpc/submit_survey', { p_session_id: sid, p_phase: 'pre', p_answers: { primera_vez: 'Sí, es la primera vez' } });
  ok('encuesta previa', r.status === 200, `HTTP ${r.status}`);
  for (let i = 1; i <= 10; i++) {
    r = await req('POST', '/rest/v1/rpc/submit_card', { p_session_id: sid, p_position: i, p_card: { first_action: i % 2 ? 'no_reenviar' : 'reenviar_aviso', belief: 'no_se', first_action_ms: 4000 } });
    if (r.status !== 200) { ok(`tarjeta ${i}`, false, `HTTP ${r.status} ${r.text}`); break; }
  }
  ok('10 tarjetas', r.status === 200, `última: estado=${r.json?.state} puntos=${r.json?.points}`);
  r = await req('POST', '/rest/v1/rpc/complete_session_v4', { p_session_id: sid });
  ok('cerrar partida y puntaje del servidor', r.status === 200 && Number(r.json?.score) === 600, `HTTP ${r.status} puntaje=${r.json?.score}`);
  r = await req('POST', '/rest/v1/rpc/get_session_v4', { p_session_id: sid });
  ok('recuperar la propia partida', r.status === 200 && r.json?.status === 'completed', `estado=${r.json?.status}`);
}
const fails = results.filter((x) => !x.pass).length;
console.log(`\nRESUMEN: ${results.length - fails} OK, ${fails} con problema`);
