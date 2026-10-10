# Estado previo a 20261011000300 (producción, 10/10/2026 ~16:20 UTC)

Permisos capturados del catálogo antes de aplicar:

| Objeto | Permisos |
|---|---|
| radiografia_respuestas | postgres=arwdDxtm, service_role=arwdDxtm, anon=a, authenticated=r |
| v_sessions, v_decisions, v_open_responses, v_share_decisions, v_share_sessions | postgres=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm |
| política legacy_insert_only | roles={anon}, INSERT, with check (true) |
| función set_survey_code | postgres=X, anon=X, authenticated=X, service_role=X |
| disparadores en participant_sessions | set_updated_at |

Sesiones con campos de encuesta (survey_code, survey_intent o survey_code_at) no nulos: 0.

Huella de datos (filas y md5 de todas las filas, ordenadas) por tabla:

| Tabla | Filas | Huella |
|---|---|---|
| admin_profiles | 6 | 448138d11d75822d3f073661dbcd0922 |
| audit_events | 14 | ee6b9c8452796c476c8bfb1c4da59b36 |
| game_decisions | 120 | cfe02bed3082e4fca32800ee686d1183 |
| game_sessions_summary | 12 | b52188e47936044e45910295e05ae8eb |
| hint_events | 3 | cd976b46a778069b3342bb022817b7c7 |
| leaderboard_entries | 1 | 0de16bf12d9667c0f5d076bde66e8667 |
| news_bank | 10 | e3d7f85f7c9fa0d81b9c55217258fd24 |
| news_items | 50 | 8d1e10ae8b986c525e81c754891acb8f |
| participant_sessions | 13 | 102d7c825ae9665d94df0af18a1ce813 |
| radiografia_respuestas | 1 | 6a9d054c0688aca81208dbdd4ea15edd |
| radiografia_respuestas_backup_20261009 | 1 | 6a9d054c0688aca81208dbdd4ea15edd |
| response_codes | 0 | d41d8cd98f00b204e9800998ecf8427e |
| share_decisions | 0 | d41d8cd98f00b204e9800998ecf8427e |
| source_opens | 0 | d41d8cd98f00b204e9800998ecf8427e |
| studies | 5 | 0761f662406bb7e770e6aa8bdabc3cbb |
| survey_questions | 21 | e8be5dc3dc1b9d5bff26090240f1f8e3 |
| survey_responses | 60 | 5a3e38373357153ab8febbb8c2549425 |

Consulta usada: `select count(*), md5(string_agg(md5(x::text), '' order by md5(x::text))) from public.<tabla> x`.
