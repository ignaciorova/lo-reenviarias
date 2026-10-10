# Aplicación en producción: migración de seguridad (PR #7)

- Autorización: Gerardo, 10/10/2026 16:12 UTC, «aplicar exclusivamente las correcciones de seguridad del PR #7 tras superar las comprobaciones anteriores».
- Proyecto: producción (`fieatocekvklctfkxgpa`). Aplicada el 10/10/2026 a las 16:31 UTC.
- Contenido: exactamente `supabase/migrations/20261011000300_seguridad_cierre_superficie.sql` (md5 `8b9dc9c984e71f7dfe39d6a5a815504b`). Supabase la registró como versión `20261010163136`, nombre `seguridad_cierre_superficie`.
- Reversión: `security/reversion/20261011000300_revertir.sql`. Estado previo: `security/reversion/estado-previo.md`.

## Comprobaciones previas

- Inmediatamente antes de aplicar, los permisos, la política, los disparadores y los conteos coincidían con `estado-previo.md`. La versión activa era 4.0.0 (modo `responsabilidad`).
- Pruebas SQL locales: 121, 39, 22 y 71 aserciones, todas correctas.
- Pruebas E2E: juego 4.0.0 y panel correctos. El `admin.spec` del juego antiguo dio 16/16 con la migración, con la versión antigua activa.
- Ida y vuelta (aplicar, revertir y comparar) en local: permisos idénticos.
- Base de pruebas (`vdrawwbgpxcpbtazjbxz`): migración aplicada y API HTTP 55/55, incluida una partida completa (código de encuesta guardado como nulo, puntaje 600, estado completado).

## Validación posterior en producción

**Permisos**

- `radiografia_respuestas`: anon ya no tiene permisos; authenticated conserva lectura (`r`). La política `legacy_insert_only` pasa a `with check (false)`.
- Las 5 vistas del panel: authenticated solo tiene `r` (antes `arwdDxtm`).
- `set_survey_code`: solo postgres y service_role.
- Nuevo disparador `sin_codigo_encuesta`, solo al insertar.

**Datos**

Las huellas md5 y los conteos de las 17 tablas son idénticos a `estado-previo.md`, antes y después de las pruebas.

**Visitante anónimo (SQL, transacción revertida)**

- No puede leer, insertar ni modificar ninguna de las 22 tablas o vistas.
- Las 15 funciones administrativas devuelven «permission denied», incluida `set_survey_code`.

**Partida 4.0.0 anónima completa (transacción revertida)**

- Inicio con 10 noticias; el contenido inicial no revela las respuestas.
- Los puntos inyectados se ignoran.
- La verificación queda registrada.
- El cierre da puntaje 1400 y estado completado.
- El ranking funciona.
- Un código de encuesta enviado por la API se guarda como nulo.

**Usuario con sesión pero sin rol (transacción revertida)**

- Ve 0 filas en todo.
- No puede modificar las vistas.
- Las funciones administrativas devuelven «forbidden».

**Propietario simulado (transacción revertida)**

- `is_admin(owner)` es verdadero.
- Ve todas las tablas y vistas del panel.
- `list_admins` devuelve 6 perfiles.
- `log_export` funciona.
- No puede escribir en las vistas, como estaba previsto.

**API HTTP real con la clave publicable, sin jugar partida**

- 49/49 correctas.
- Lectura de 22 tablas y vistas, el insert en `radiografia_respuestas`, las modificaciones, borrados y el ranking: todos 401.
- Las funciones administrativas: 401.
- Las funciones de juego con una sesión inventada responden `session_not_found`.
- GraphQL está desactivado.
- El bucket `noticias` no se puede listar.
- Registro abierto: no.

`set_survey_code` por HTTP se probó en la base de pruebas (401); en producción se comprobó como anon por SQL.
