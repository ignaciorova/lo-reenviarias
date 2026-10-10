# Auditoría de seguridad — 10 de octubre de 2026

Alcance: repositorio público `ignaciorova/lo-reenviarias` (todas las ramas y PR, 46 commits), sitio publicado `lo-reenviarias.vercel.app` (despliegue `dpl_A2LRE5wpAUzYndfTkxrZ92zbFn1P`, commit `d1e674e`) y base Supabase de producción `fieatocekvklctfkxgpa`.

Estado de la base durante la auditoría: la 4.0.0 estaba **activa** (la activó la cuenta owner a las 15:54:50 UTC, según `audit_events` id 14) y la 3.1.0 cerrada.

## Resumen

No se encontró ningún secreto en el repositorio, en su historial ni en el sitio publicado. Tampoco se encontró ninguna forma de que un visitante anónimo o una cuenta sin rol lea o modifique respuestas de otras personas, ni de que se salte la autorización de las funciones de administración. Por eso **no hay nada que rotar ni historial que reescribir por secretos**.

Sí hay hallazgos de severidad media y baja. El más importante es que la API anónima permite **partidas automatizadas**: con respuestas aprendidas se puede llegar al primer lugar del ranking y llenar el estudio de partidas falsas. Además, el límite de frecuencia es global, así que alguien podría bloquear el juego a los demás. Esto no se corrige con permisos; abajo se proponen opciones.

Esto no equivale a declarar el sistema seguro. Es lo que se comprobó con las pruebas descritas, con las limitaciones indicadas al final.

## Cómo se probó

- **Secretos en Git:** `git grep` sobre todos los commits de todas las ramas y PR. Se buscaron `service_role`, `sb_secret_`, JWT (`eyJ…`), `ghp_`, `github_pat_`, `gho_`/`ghs_`/`ghu_`, `sbp_`, `sk-`, `AKIA`, `vercel_`, enlaces `_vercel_share`, URI `postgres://usuario:clave@`, `password = "…"` y claves privadas. También se revisaron los nombres de archivo en todo el historial (`.env`, `.pem`, `.key`, respaldos, CSV).
- **Sitio publicado:** se reconstruyó el commit `d1e674e` con los tres valores públicos. El archivo principal resultante (`index-D6YGA3hi.js`) tiene **el mismo hash** que el publicado, así que el bundle analizado es idéntico al de producción. Sobre ese bundle se repitió la búsqueda de secretos.
- **Vercel:** se listaron las variables del proyecto sin descifrarlas. Producción solo tiene `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_STUDY_CODE`.
- **Supabase, catálogo:** permisos (`GRANT`) de `anon` y `authenticated` sobre cada tabla y vista, RLS y políticas, funciones `SECURITY DEFINER` con su `search_path`, permiso de ejecución y comprobación de rol, buckets de Storage, extensiones y avisos de seguridad de Supabase.
- **Supabase, pruebas en vivo:** se usaron los mismos roles que obtiene la clave publicable (`anon`) y una sesión iniciada sin rol (`authenticated`, con un JWT que además dice falsamente `owner` en sus metadatos). Cada prueba corrió dentro de un bloque que termina con un error forzado, así que **toda la transacción se revirtió**. Al terminar seguían igual las 13 sesiones, la entrada del ranking, la fila de la tabla original y las 60 respuestas de encuesta. Los guiones están en `security/`:
  - `pruebas-anon-acceso.sql`: tablas, vistas, funciones de administración y sesiones ajenas.
  - `pruebas-anon-v4.sql`: partida 4.0.0 completa y manipulación de puntaje.
  - `pruebas-autenticado-sin-rol.sql`: cuenta sin rol.
  - `pruebas-anon-3x-local.sql`: partida 3.x. Solo se ejecutó en la base local, porque la 3.1.0 ya estaba cerrada en producción.

## Resultados por punto

### 1. Secretos en código e historial: no se encontraron

- Las únicas coincidencias son texto de documentación («nunca pongas la `service_role`…»), la protección de `src/lib/supabase.ts` que impide arrancar con una clave `sb_secret_`, y roles creados en la base de pruebas local (`supabase/tests/00_supabase_shim.sql`). Ninguna es un secreto.
- No hay JWT, tokens de GitHub, tokens de Supabase ni contraseñas reales. La única contraseña es un valor de prueba E2E local (`'una-contraseña-larga'`), y `local-only` aparece en un ejemplo de PostgREST local.
- En el historial no hay archivos `.env`, solo `.env.example`. `.gitignore` excluye `.env` y `.env.local`.
- El sitio publicado solo contiene la URL del proyecto y la clave `sb_publishable_…`, que es pública por diseño.

**No hay secretos que rotar.** El hallazgo B4 trata la exposición de un correo.

### 2. La clave pública solo permite lo previsto: sí

Con `anon` se comprobaron estas operaciones:

| Operación | Resultado |
|---|---|
| Leer cualquiera de las 17 tablas y 5 vistas del panel | Bloqueado (42501) en las 22 |
| Insertar en tablas y vistas | Bloqueado en 21 de 22. **Permitido en `radiografia_respuestas`** (hallazgo B1) |
| Modificar tablas y vistas | Bloqueado en las 22 |
| Borrar o vaciar | `anon` no tiene permiso `DELETE` ni `TRUNCATE` en ninguna tabla (catálogo) |
| 14 funciones de administración e internas | Bloqueado: «permission denied for function» |
| `public_stats` | `{"n": null}`: no publica nada por debajo de n = 10 |
| `study_info` | Solo modo, versión y número de noticias |

`pg_graphql` no está instalado, así que no hay una segunda vía de acceso por GraphQL.

### 3. Un visitante anónimo no puede consultar ni modificar respuestas de otras personas: confirmado

- No hay lectura directa de ninguna tabla (punto 2).
- Las funciones del juego exigen el identificador de la sesión, un UUID aleatorio que genera el navegador. Con un UUID inventado, `get_session`, `get_session_v4`, `submit_card`, `submit_decision`, `leaderboard_status` y `join_leaderboard` devuelven `session_not_found`.
- Ninguna función pública devuelve identificadores de otras sesiones. El ranking solo expone apodo, puntaje, aciertos y puesto.
- Una respuesta ya enviada no se puede cambiar: reenviar la noticia 10 con otra decisión devuelve la decisión original (estado E3).

### 4. Funciones `SECURITY DEFINER`: no se encontró forma de saltarse la autorización

- Las 45 funciones `SECURITY DEFINER` de `public` tienen `search_path = ''`, así que no se pueden secuestrar con objetos falsos en otro esquema.
- Las 18 funciones de administración que actúan sobre datos son ejecutables por `authenticated`, pero empiezan comprobando `is_admin(rol mínimo)`. Las otras dos ejecutables por `authenticated` (`is_admin` y `my_admin_profile`) solo responden sobre la propia cuenta. `is_admin` consulta la tabla `admin_profiles` con `auth.uid()` y **no confía en los metadatos del JWT**. Con un JWT que decía `role: owner` en `app_metadata` y `user_metadata`, las 18 devolvieron `forbidden`, `is_admin` devolvió `false` y `my_admin_profile`, `null`.
- Las funciones internas (`_compute_summary`, `_v4_payload` y similares) no son ejecutables por `anon` ni por `authenticated`.
- Las 16 funciones anónimas validan todo en el servidor:
  - Consentimiento: sin él, `consent_required`.
  - Encuesta previa obligatoria: sin ella, `pre_survey_missing`.
  - Orden de las noticias: saltar una devuelve `not_current_item`.
  - Valores permitidos: `invalid_choice`, `invalid_action`, `invalid_kind` y `invalid_option`.
  - Claves desconocidas en la encuesta: `unknown_question`.
  - Fuentes: verificar sin haber abierto una fuente devuelve `source_not_opened`, y abrir la fuente de otra noticia, `not_current_item`.
  - Cierre y ranking: cerrar una partida sin terminar devuelve `game_not_finished`; entrar dos veces al ranking, `already_joined`; un apodo fuera de rango, `apodo_invalido`.
  - Versión: una función 4.0.0 sobre una partida 3.x devuelve `study_not_v4`, y el inicio antiguo con la 4.0.0 activa, `study_is_v4`.

### 5. Panel y exportaciones: protegidos por rol, pero no solo por owner

- Una cuenta sin rol ve 0 filas en todas las tablas y vistas, no puede subir archivos al bucket (la RLS lo rechaza) y recibe `forbidden` en las 18 funciones de administración.
- Las exportaciones se generan en el navegador a partir de las vistas `v_*`. Esas vistas usan `security_invoker`, así que aplican la RLS de quien consulta, y la RLS exige **viewer o superior**, no owner.
- Hoy hay 1 owner y 5 viewers, todos activos. Los 5 viewers son del dominio `ulacit.ed.cr` y los creó la cuenta owner el 9/10 entre 23:13 y 23:23 UTC, según `audit_events`. Cualquiera de ellos puede leer y exportar todas las respuestas, incluidas las abiertas.
- Solo owner puede activar versiones, gestionar cuentas y purgar datos. Analyst y owner pueden crear borradores, marcar sesiones y codificar respuestas.
- El registro de exportaciones (`log_export`) lo envía el propio panel. Un viewer que consulte la API directamente lee los mismos datos sin dejar ese registro (hallazgo B6).

### 6. Las funciones de inserción no permiten fijar puntajes ni enviar respuestas arbitrarias, pero sí partidas automatizadas

- El puntaje se calcula en el servidor. Una tarjeta enviada con `"points": 5000` y `"state": "E6"` se guardó con los puntos y el estado calculados por el servidor (−100, E1).
- Un `read_ms` declarado de 600 000 justo después de abrir la fuente no contó como verificación efectiva, porque el servidor lo limita al tiempo que pasó desde que registró la apertura.
- La partida no revela las respuestas antes de decidir: el payload inicial no contiene `is_real`, `says` ni `explanation`, y `open_source` tampoco devuelve `says`.
- Lo que sí se puede hacer está en los hallazgos M1 y M2.

## Hallazgos

| Id | Severidad | Hallazgo | Estado |
|---|---|---|---|
| M1 | Media | Partidas automatizadas y límite de frecuencia global | Pendiente: decisión de diseño |
| M2 | Media (inactivo) | 3.x: la bonificación por rapidez confía en el tiempo que envía el navegador | Sin efecto mientras la 3.x esté cerrada |
| B1 | Baja | `anon` puede insertar en `radiografia_respuestas` | Corregido en la migración propuesta |
| B2 | Baja | La API sigue aceptando y guardando códigos de encuesta | Corregido en la migración propuesta |
| B3 | Baja | Vistas del panel con privilegios de escritura sobrantes | Corregido en la migración propuesta |
| B4 | Baja | Correo personal de la cuenta owner en el repositorio público | Quitado de los documentos actuales; sigue en el historial |
| B5 | Baja | Supabase Auth: protección contra contraseñas filtradas desactivada | Pendiente: ajuste en el panel de Supabase |
| B6 | Baja | Las exportaciones están abiertas a viewer y su registro depende del navegador | Pendiente: decisión |
| I1 | Informativo | CSP con `connect-src https://*.supabase.co` | Aceptado: la vista previa usa otra base |

**M1. Partidas automatizadas y límite global.**
- Cualquiera puede llamar a la API anónima con un programa. Las respuestas correctas se aprenden jugando una vez, porque la retroalimentación las muestra.
- En la prueba, una partida 4.0.0 completada por guion obtuvo 1400 puntos (9 de 10) y quedó primera en el ranking. Se revirtió.
- El límite `max_sessions_per_minute = 120` cuenta todas las sesiones del estudio, no por cliente. Un guion que abra 2 partidas por segundo bloquearía a las demás personas (`rate_limited`) y llenaría el estudio de partidas falsas.
- Que no se guarde la IP es una decisión de privacidad. Opciones:
  1. Marcar como sospechosas en el panel las partidas imposiblemente rápidas y excluirlas del ranking y del análisis. No requiere servicios nuevos.
  2. Añadir Cloudflare Turnstile, verificado en una Edge Function antes de `start_session_v4`.
  3. Pasar las llamadas por una función de Vercel con límite por cliente en su firewall.

**M2. Tiempo declarado en la 3.x.**
- `submit_decision` usa el `p_response_ms` que envía el navegador. Declarando 0 ms se obtiene la bonificación máxima por rapidez: 3300 puntos con 10 aciertos en la prueba local.
- No tiene efecto mientras la 3.1.0 esté cerrada. La 4.0.0 no usa el tiempo para puntuar.
- En la 4.0.0, `first_action_ms` sigue siendo un dato declarado por el navegador. Es una limitación de medición que conviene mencionar en el análisis.

**B1. Tabla del HTML original.**
- La migración del 9/10 dejó `INSERT` anónimo «por si el HTML original seguía en circulación».
- No llegan filas desde el 3/10 y el juego actual no la usa. La prueba en producción confirmó que la inserción se acepta.
- Se retira en la migración propuesta.

**B2. Códigos de encuesta.**
- Tras la decisión del 10/10 de no vincular encuesta y juego, el panel ya no los pide. Aun así, `start_session_v4` sigue guardando un código bien formado (`1234567C`, probado y revertido) y `set_survey_code` sigue siendo invocable.
- La migración propuesta revoca `set_survey_code` y anula esos campos en sesiones nuevas.

**B3. Vistas.** `authenticated` tiene permisos `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` y `TRIGGER` sobre las 5 vistas `v_*`. No se pueden explotar (cualquier escritura falla con 55000), pero sobran y se retiran.

**B4. Correo de la cuenta owner.**
- Aparecía en `docs/estado-final.md` y `docs/registro-despliegue.md`, 80 coincidencias en el historial. No es una credencial, pero identifica la cuenta con más privilegios y facilita el phishing o el relleno de credenciales.
- Ya se quitó de los documentos actuales.
- Quitarlo del historial obliga a reescribirlo. Los pasos están en «Si se quisiera limpiar el historial».

**B5. Auth.**
- El asesor de Supabase marca desactivada la protección contra contraseñas filtradas.
- Recomendado: activarla, activar MFA en la cuenta owner y, si nadie debe registrarse solo, desactivar los registros abiertos.
- No se pudo comprobar desde aquí si el registro abierto está activo. Las cuentas nuevas no obtienen ningún permiso (punto 5).

**B6. Exportaciones.**
- Si las exportaciones deben ser solo de owner (o analyst), hay que subir el rol mínimo de las políticas de lectura, lo que deja a los viewers sin ver datos. La otra opción es mover la exportación a una función del servidor que registre y limite.
- Mientras tanto, el registro de exportaciones es informativo, no un control.

## Correcciones propuestas (no aplicadas)

En la rama `claude/seguridad-auditoria` está la migración `supabase/migrations/20261011000300_seguridad_cierre_superficie.sql`:

1. Revoca el `INSERT` anónimo en `radiografia_respuestas` y deja su política en `with check (false)` (B1).
2. Revoca `set_survey_code` y añade un disparador que guarda las sesiones nuevas sin código ni intención de encuesta (B2).
3. Deja solo lectura en las vistas del panel (B3).

No borra ni modifica datos existentes. Las pruebas SQL pasan: 121, 39, 22 y 71 aserciones, ajustadas a las nuevas reglas. **Aplicarla en producción requiere tu aprobación.**

## Si se quisiera limpiar el historial (solo por B4)

No hace falta por secretos. Para quitar el correo del historial:

1. `git filter-repo --replace-text <(echo 'correo-a-quitar==>[correo retirado]')` en un clon completo.
2. `git push --force --all` y `git push --force --tags`.
3. Pedir a GitHub Support que purgue las vistas en caché de los PR (#1–#6), porque las referencias `refs/pull/*` no se reescriben con un push.
4. Quien tenga clones debe volver a clonar.

Como el repositorio ya es público, hay que dar por hecho que el correo pudo copiarse; por eso pesa más reforzar la cuenta (MFA, B5) que reescribir el historial.

## Limitaciones

- La red de este entorno no permite conectarse a `*.supabase.co`, así que las pruebas no viajaron por HTTP. Corrieron dentro de la base con los mismos roles que asigna la API (`anon` con la clave publicable y `authenticated` con un JWT simulado). No se probaron por HTTP la API de Storage ni la de Auth. En Storage se probaron las políticas de `storage.objects`.
- No se revisaron las cuentas de GitHub, Vercel y Supabase (MFA, colaboradores, tokens personales). Eso se gestiona en cada servicio.
- No se hizo una prueba de carga. El riesgo de M1 se deduce del código del límite, no de un ataque real.
