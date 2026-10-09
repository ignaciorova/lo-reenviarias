# Informe técnico

## 1. Arquitectura

```
Navegador (participante)                 Navegador (investigador)
  /  aplicación pública                    /admin  panel (cargado aparte)
        │  clave publicable + RPC                │  clave publicable + sesión Supabase Auth
        ▼                                        ▼
  Supabase PostgREST ──► funciones SECURITY DEFINER (únicas accesibles para anon)
                     └─► vistas security_invoker + RLS (solo administradores activos)
  PostgreSQL 17: 11 tablas + respaldo + tabla original (solo INSERT anónimo)
```

- **Frontend:** Vite 8, React 19, TypeScript 6, Tailwind 4, React Router 7 (rutas diferidas), Zod (validación de respuestas del servidor), Recharts 3 (gráficos), fflate (XLSX y ZIP sin dependencias pesadas), @fontsource (fuentes locales).
- **Backend:** Supabase (PostgreSQL + PostgREST + Auth). No hay servidor propio ni funciones Edge: toda la lógica sensible vive en funciones SQL.
- **Secretos:** el frontend solo contiene la URL del proyecto y la clave publicable. `src/lib/supabase.ts` se niega a arrancar si detecta una clave `sb_secret_` o un JWT cuyo rol no sea `anon`.

## 2. Modelo de datos

| Tabla | Contenido | Clave natural / restricciones |
|---|---|---|
| `studies` | Versiones del instrumento y su configuración (`config` jsonb). | `(code, version)` único; una sola versión `active` por código. |
| `news_items` | Catálogo de noticias por versión, con `is_real`, fuente, explicación, pista, señales y estado de verificación. | `(study_id, item_key)` único; `source_url` debe ser https. |
| `survey_questions` | Preguntas pre/post con opciones. | `(study_id, question_key)` único. |
| `participant_sessions` | Una fila por participación anónima: versión, origen, estado, aceptación, orden presentado, lupas restantes, clase de dispositivo, exclusión. | `id` uuid generado en el cliente (idempotencia); `legacy_source_id` único. |
| `survey_responses` | Respuestas de opinión. | `(session_id, question_id)` único. |
| `hint_events` | Uso de lupas. | `(session_id, news_item_id)` único. |
| `game_decisions` | Una fila por noticia decidida: elección, acierto, tiempo, lupa, puntos, racha, alcance ilustrativo. | `(session_id, news_item_id)` y `(session_id, position)` únicos; tiempo agotado implica elección nula. |
| `game_sessions_summary` | Resumen calculado en servidor. | PK = `session_id`. |
| `admin_profiles` | Rol administrativo de cuentas de Supabase Auth. | `owner` > `analyst` > `viewer`. |
| `audit_events` | Bitácora de acciones administrativas y exportaciones. | Solo escritura vía funciones. |
| `response_codes` | Codificación manual de respuestas abiertas. | `(survey_response_id, code)` único. |

Vistas para el panel (`security_invoker`, respetan RLS): `v_sessions` (una fila por sesión con respuestas pivotadas, `is_valid` y `status_effective`), `v_decisions`, `v_open_responses`.

## 3. API pública (rol `anon`)

| Función | Qué hace | Idempotencia |
|---|---|---|
| `start_session(id, consent, device_class, reduced_motion, study_code)` | Exige aceptación, aplica límite de frecuencia, sortea el orden en el servidor y devuelve titulares sin respuestas. | Si el `id` existe, devuelve la sesión tal cual. |
| `get_session(id)` | Reanudar tras recarga. | Solo lectura. |
| `submit_survey(id, phase, answers)` | Valida claves, opciones y longitudes; `post` exige las 10 decisiones. | Una fase ya registrada no se reescribe. |
| `use_hint(id, position)` | Solo para la noticia en curso y con lupas disponibles. | Repetir devuelve la misma pista sin descontar. |
| `submit_decision(id, position, choice, response_ms)` | Exige orden secuencial y encuesta previa; calcula acierto, puntos, racha y alcance; tiempo > 21,5 s se registra como agotado. | Repetir la misma posición devuelve la decisión original. |
| `complete_session(id)` | Cierra y calcula el resumen; percentil solo con n ≥ 20. | Repetir devuelve el mismo resumen. |
| `public_stats(code)` | Contador de portada (solo con n ≥ 10). | Solo lectura. |

El rol `anon` no tiene privilegio alguno sobre tablas ni vistas (verificado en remoto). La tabla original conserva `INSERT` anónimo solo por compatibilidad con copias viejas del HTML.

## 4. Seguridad del panel

- Acceso: cuenta de Supabase Auth **y** fila activa en `admin_profiles`. Sin esa fila, la cuenta ve «Sin permisos» y la API devuelve cero filas.
- RLS: `admin_read` en todas las tablas (`is_admin('viewer')`); `audit_events` requiere `analyst`; `admin_profiles` muestra a cada quien su propia fila salvo a `owner`.
- Escrituras administrativas solo mediante funciones que comprueban el rol y registran en `audit_events`: `grant_admin`, `revoke_admin`, `list_admins` (owner); `set_session_flags`, `add_response_code`, `remove_response_code`, `mark_abandoned_sessions` (analyst); `purge_sessions` (owner); `log_export` (viewer).
- Los avisos del asesor de Supabase «SECURITY DEFINER ejecutable por anon/authenticated» son intencionales: esas funciones son la API y validan permisos por dentro. El aviso «RLS sin políticas» sobre el respaldo también es intencional (nadie debe leerlo por la API).

## 5. Cálculo de indicadores

Todos los indicadores del panel se calculan sobre las sesiones filtradas, con denominadores explícitos (ver [diccionario-datos.md](diccionario-datos.md)). Las descargas de datos se paginan hasta el total exacto que informa la base (`count=exact`); si no coincide, el panel muestra error en lugar de truncar.

## 6. Desarrollo local y pruebas

```bash
npm ci
cp .env.example .env.local          # valores públicos
npm run dev                          # contra Supabase remoto

# Base local con el mismo esquema (requiere PostgreSQL 16+ local)
npm run db:local                     # crea lr_test y aplica migraciones
npm run test:sql                     # 121 aserciones de seguridad y flujo
npm test                             # pruebas unitarias (Vitest)
npm run test:e2e                     # Playwright (requiere PostgREST local, ver evidencia-pruebas.md)
```

## 7. Estructura del repositorio

```
src/game/        aplicación pública
src/admin/       panel (cargado de forma diferida)
src/analytics/   métricas, estadística, exportación (con pruebas)
src/lib/         cliente Supabase y API tipada
supabase/migrations/   0001–0005
supabase/seed/instrument.json   fuente del catálogo (genera 0002)
supabase/tests/        prueba SQL de seguridad y flujo
e2e/             pruebas Playwright (móvil y escritorio)
docs/            esta documentación
```
