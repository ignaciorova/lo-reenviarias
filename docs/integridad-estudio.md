# Integridad del estudio (migración 20261011000400)

**Estado: no aplicada.** Está en la rama `claude/integridad-estudio` y solo se probó en una base local. Para aplicarla hace falta la aprobación de Gerardo (ver «Despliegue»).

Responde a dos hallazgos de la [auditoría del 10/10/2026](auditoria-seguridad-2026-10-10.md):

- **M1.** Un programa puede jugar a velocidad de máquina y llegar al primer lugar del ranking público (1400 puntos en la prueba). El único control era un límite **global** de 120 sesiones por minuto. Un solo atacante podía agotarlo y dejar fuera a estudiantes reales, por ejemplo a una clase entera que empieza a la vez en un evento.
- **B6.** El rol viewer podía exportar, y el registro de exportaciones lo escribía el navegador con `log_export`, así que se podía omitir o falsear.

Los cambios se agrupan en tres ámbitos que no se mezclan: **seguridad del sistema**, **integridad de los datos académicos** y **privacidad de participantes**.

Regla de diseño: **nada hace más difícil jugar a una persona real.** No hay CAPTCHA, ni pasos extra, ni esperas, ni bloqueos. Las señales solo deciden si la partida entra al ranking y a las cifras públicas, y si cuenta en la muestra de análisis. El puntaje y la retroalimentación de la persona no cambian.

Lo que no cambia:

- Ninguna versión del instrumento. No se editó el `config` de ninguna fila de `studies` ni las preguntas, noticias o reglas de puntuación.
- La encuesta y el juego siguen siendo instrumentos independientes. No se agregó nada que los vincule.

---

## 1. Seguridad del sistema

### 1.1 Límite de frecuencia que no deja fuera a nadie

| Antes | Ahora |
|---|---|
| `start_session_v4` rechazaba (`rate_limited`) a partir de **120 sesiones/minuto en todo el estudio**, leído del `config` de la versión. | **Techo técnico de 600/minuto** (`sessions_per_minute_ceiling`). Solo protege la base: con el uso real del estudio no debería alcanzarse nunca. |
| — | Si al empezar ya hay **120 o más** sesiones en el último minuto (`burst_sessions_per_minute`), la sesión lleva la señal **informativa** `rafaga`. No la excluye ni la frena. |

- En las pruebas locales, 150 sesiones en el mismo minuto entran sin ningún rechazo con los valores por defecto.
- La clave `max_sessions_per_minute` sigue en el `config` de la 4.0.0, porque las versiones no se editan. `start_session_v4` ya no la lee.
- `start_session` (1.0.0–3.1.0, inactivo) no se tocó: sigue leyendo esa clave.

**Por qué no hay límite por cliente.** Para limitar «por persona» o «por dispositivo», la base tendría que reconocer a quién llama: la IP, una huella del navegador o una cuenta. El estudio decidió no guardar nada de eso (ver §3). Sin un identificador, la base solo puede contar sesiones en total. Por eso el techo es alto y sirve únicamente para proteger la infraestructura.

**Opción futura, no implementada (requiere decisión):** limitar por cliente en el borde, antes de llegar a la base. Por ejemplo, las llamadas del juego pasarían por una función de Vercel con una regla de límite por IP en su firewall. La IP la ve Vercel, no la base del estudio, y no se guarda con los datos. Habría que revisar la política de privacidad de Vercel y el consentimiento informado antes de adoptarla.

### 1.2 Ajustes técnicos fuera del instrumento

- Nueva tabla `platform_settings` (clave/valor `jsonb`), con RLS activa y sin acceso directo para ningún rol.
- Solo el owner la lee y la cambia, con `get_platform_settings()` y `set_platform_setting(clave, valor)`.
- Cada cambio queda en `audit_events` con el valor anterior y el nuevo. Solo se aceptan claves conocidas y valores dentro de su rango.
- Si falta una fila, se usa el valor por defecto.
- No es parte del instrumento: cambiar un umbral no crea una versión nueva ni modifica las respuestas guardadas.

Ejemplo (como owner, desde el editor SQL de Supabase con la sesión del owner o desde el panel por API):

```sql
select * from public.get_platform_settings();
select public.set_platform_setting('burst_sessions_per_minute', 150);
```

### 1.3 Exportaciones con mínimo privilegio y auditoría del servidor

- **Solo analyst y owner exportan.** Para viewer, el panel desactiva los botones y explica por qué. El servidor también rechaza la llamada.
- Nueva función `export_dataset(p_dataset, p_filters)` (SECURITY DEFINER, `search_path` vacío, comprueba el rol antes que nada):
  - **Conjuntos permitidos** (los mismos que el panel exportaba): `sesiones` (`v_sessions`), `decisiones` (`v_decisions`), `abiertas` (`v_open_responses`), `v4_sesiones` (`v_share_sessions`) y `v4_decisiones` (`v_share_decisions`). Cualquier otro nombre se rechaza.
  - **Filtros validados**: `session_ids`, `row_ids` (la clave de cada fila), `descripcion` (el texto de los filtros del panel) y `formato`. Cualquier otra clave se rechaza.
  - Devuelve las filas y **escribe la auditoría en la misma transacción**. Si no se puede registrar, no se entrega nada.
  - La auditoría guarda el conjunto, las filas que contó el servidor, el formato, los filtros, la persona (`actor_id`), la hora, cuántos identificadores se pidieron y una huella md5 de la selección. No copia los identificadores.
- `log_export` ya no se puede invocar (se revocó `EXECUTE` a `authenticated`). La función se conserva por el historial.
- Lo que el servidor no puede impedir: una persona con permiso de lectura puede copiar lo que ve en pantalla. La auditoría cubre todas las descargas hechas desde el panel y cualquier llamada a `export_dataset`.

**Viewer después del cambio:**

- Pierde las exportaciones.
- Pierde el texto libre de las preguntas abiertas (ver §3).
- Conserva el resto del panel, que todavía lee filas anónimas una por una (sesiones, decisiones y respuestas de opción) para calcular los indicadores en el navegador.

**Posible siguiente paso:** un «modo viewer solo agregados», en el que el viewer recibiría únicamente cifras calculadas en el servidor. Implica rehacer varias pantallas y no se incluye aquí.

---

## 2. Integridad de los datos académicos

### 2.1 Señales de actividad automatizada

- Se calculan **en el servidor** y **solo con horas del servidor**:
  - `started_at` y `game_started_at` de la sesión;
  - `created_at` de cada decisión (`share_decisions`).
- No usan el tiempo que declara el teléfono (`first_action_ms`).
- Se guardan en una tabla aparte, `session_integrity`. Calcularlas o recalcularlas no modifica ninguna fila de `participant_sessions`, ni siquiera su `updated_at`.
- Se calculan al cerrar la partida (`complete_session_v4`). La señal de ráfaga también se marca al empezar.

| Señal | Regla (valores por defecto) | ¿Excluye? |
|---|---|---|
| `rafaga` | Al empezar ya había ≥ 120 sesiones del estudio en el minuto anterior. | **No.** Es informativa. |
| `partida_rapida` | Las 10 decisiones se tomaron en menos de **10 s**, contados desde que empezó el juego hasta la última decisión. | Sí |
| `decisiones_rapidas` | **3 o más** decisiones **seguidas** a menos de **800 ms** de la anterior. | Sí |
| `ritmo_constante` | Entre las decisiones con respuesta (sin contar tiempos agotados) hay al menos **8** intervalos y su coeficiente de variación es menor que **0,10**. | Sí |

**Por qué estos umbrales** (conservadores a propósito):

- **La interfaz impone un mínimo físico por tarjeta.** Cada tarjeta exige elegir una acción (con 260 ms de animación), contestar «¿Te la crees?», esperar la respuesta del servidor y pulsar «Siguiente».
  - En la prueba E2E, Playwright pulsa cada botón en cuanto aparece y sin latencia de red. Aun así, los intervalos entre decisiones fueron de **1,1 a 1,2 s**, y unos 11 s por partida sin verificaciones ni tiempos agotados.
  - Ninguna persona puede ir más rápido que eso usando el juego. En producción, la latencia de red sube todavía más ese mínimo.
  - Los dos umbrales de velocidad (800 ms seguidos y 10 s por partida) quedan **por debajo de lo que permite la interfaz**. Solo los alcanza quien llama a la API sin pasar por el juego.
- **Una persona muy rápida no se marca.** La prueba SQL incluye una partida de 17,5 s con intervalos de 1,3 a 2,4 s, y sale sin señales.
- **Ritmo constante.** Las personas tardan distinto en cada noticia: leen titulares de largo diferente, a veces verifican y a veces dudan. Un coeficiente de variación menor que 0,10 en 8 o más intervalos es muy improbable en una persona. Es justo lo que produce un programa que espera siempre lo mismo entre llamadas, aunque pase por la interfaz. En la prueba, pausas fijas de 5 s ± 30 ms se marcan.
  - Los intervalos que terminan en tiempo agotado (E7) no cuentan, porque duran siempre unos 20 s. En la prueba, una partida con las 10 tarjetas agotadas no se marca.
- **No hace falta una señal para la verificación.** El tiempo de lectura al verificar ya está acotado en `submit_card` por la hora en que el servidor registró la apertura de la fuente: una «lectura» más rápida que lo que el servidor midió no cuenta como verificación efectiva.

Los umbrales están en `platform_settings` y el owner puede cambiarlos con auditoría. Conviene revisarlos con la distribución real de tiempos de la 4.0.0 (ver «Decisiones para el equipo»).

### 2.2 Qué pasa con una partida marcada

Cuenta como marcada si tiene una señal distinta de `rafaga` y nadie la revisó como «humana».

| Lugar | Efecto |
|---|---|
| Juego | **Ninguno.** Juega igual y ve su puntaje, su resumen y su retroalimentación sin cambios. |
| Ranking | `leaderboard_status` devuelve `eligible: false` y `can_join: false`. `join_leaderboard` responde `{ eligible: false }` sin error y no guarda nada. El juego muestra solo «Esta partida no entra en el ranking.», sin acusar a nadie. |
| Portada | `public_stats` no la cuenta. |
| Percentil | No cuenta como referencia en el «Superaste al X %» de nadie. La propia partida sigue viendo su percentil. |
| Análisis | `is_valid = false` en `v_sessions` y `v_share_sessions`. Nuevas columnas `automation_signals`, `automation_review` y `automation_flagged`. En «Responsabilidad (4.x)» la muestra muestra una línea «con señales de actividad automatizada». |
| Panel | La sección «Actividad automatizada» muestra cuántas partidas están marcadas, cuántas se revisaron y cuántas empezaron en ráfaga, con la lista de señales de cada sesión. |
| Exportaciones | Las columnas de señales se incluyen (`senales_automatizacion`, `excluida_por_senales`, `revision_senales` en 4.x; `automation_*` en la exportación general). |
| Datos | **No se borra ni se modifica nada.** |

### 2.3 Revisión por el equipo

- `review_automation(sesión, true, nota)` (analyst+) marca la sesión como «humana» y anula la exclusión. Queda en `audit_events` con la nota.
  - En el panel es el botón «Revisada: es humana»; «Quitar revisión» la deshace.
- Siguen disponibles las herramientas de antes: `set_session_flags` (prueba o exclusión con motivo).
- `recompute_automation_signals(sesión | null)` (analyst+) recalcula las señales de las partidas 4.x terminadas.
  - Solo escribe en `session_integrity`. No cambia sesiones, decisiones, puntajes ni revisiones humanas.
  - Queda auditada. En el panel es el botón «Recalcular señales de las partidas terminadas».

### 2.4 Lo que esto no resuelve

- **Un programa lento y paciente sigue pareciendo una persona.** Si hace pausas aleatorias de varios segundos entre tarjetas, no hay forma de distinguirlo sin identificar a quien llama.
- **Un programa que maneja la interfaz con pausas variables** tampoco se detecta.
- **No hay límite por cliente** (ver §1.1). Muchas partidas lentas desde una misma máquina no se distinguen de muchas personas.
- `first_action_ms` sigue siendo un dato declarado por el teléfono (hallazgo M2 de la auditoría). No se usa para puntuar en la 4.0.0 ni para las señales.
- **Las entradas que ya están en el ranking no se pueden quitar con las señales.** Por diseño de privacidad, `leaderboard_entries` no guarda la sesión, así que recalcular no retira entradas publicadas antes. La entrada de 1400 puntos de la auditoría ya se había revertido.

---

## 3. Privacidad de participantes

- Las señales no usan IP, huella del navegador, user-agent, nombres, correos ni nada que identifique a una persona. Solo horas del servidor y datos del propio juego.
- **El texto libre pasa a ser solo para analyst y owner.** Las respuestas escritas pueden contener datos personales, aunque se pida no escribirlos.
  - Se agregó una política **restrictiva** de lectura en `survey_responses`: viewer sigue viendo las respuestas de opción, pero no las filas con `text_value`. Por eso:
    - `v_open_responses` le devuelve 0 filas;
    - la columna `opinion` de `v_sessions` le llega vacía.
  - La misma restricción se aplica a `radiografia_respuestas`, la tabla del HTML original, si existe.
  - Las políticas existentes no se tocaron. La restrictiva se suma como condición y se quita en la reversión.
  - En el panel, la página «Preguntas abiertas» explica al viewer por qué no ve los textos, y el panel ya no los descarga para ese rol.
- Ni `session_integrity` ni `platform_settings` son legibles por anon.
- `session_integrity` es legible por el personal del estudio desde viewer, porque no contiene datos personales.

---

## Impacto en los datos existentes

- **No se borra ni se cambia ninguna fila.** La migración no hace `update` ni `delete` sobre tablas existentes; solo agrega tablas, funciones, columnas de vistas y una política.
  - Verificado en local con huellas md5 de las 17 tablas antes y después: idénticas.
- **Las sesiones existentes no tienen señales** hasta que alguien con rol analyst pulse «Recalcular señales».
  - Mientras tanto siguen como estaban: válidas, en las estadísticas y elegibles para el ranking si aún están dentro de las 6 horas.
  - Al recalcular, las partidas 4.x terminadas que cumplan alguna regla salen de la muestra válida, de `public_stats` y del percentil. No se borra nada y se puede revisar caso por caso.
- Las partidas de 1.0.0–3.1.0 no reciben señales: la regla usa `share_decisions`, que solo existe en la 4.x.

## Cambios en las pruebas

Se cambiaron algunas expectativas porque el comportamiento cambió a propósito:

- `supabase/tests/10_security_and_flow_tests.sql`:
  - un viewer ya no puede llamar a `log_export` y no exporta;
  - ahora la exportación auditada la hace el analyst con `export_dataset`.
- `supabase/tests/40_version_4_tests.sql`: antes de cerrar la sesión A se simula el ritmo de una persona, porque la prueba envía las 10 tarjetas en milisegundos y ahora eso es una señal.
- `e2e/v4-panel.spec.ts`:
  - las partidas creadas por la API se cierran con ritmo humano simulado, y se agrega una partida a velocidad de máquina que debe aparecer marcada y fuera del análisis;
  - la comparación SQL independiente excluye las sesiones marcadas;
  - se agrega una prueba de viewer, que no exporta ni lee texto libre.
- `src/analytics/v4.test.ts`: el conteo de la muestra tiene un paso nuevo, `automated`.

Pruebas nuevas:

- `supabase/tests/50_integridad_tests.sql`: señales, ranking, estadísticas, percentil, revisión, recálculo, techo y ráfaga, exportaciones, texto libre y permisos.
- `e2e/v4.spec.ts`: una partida guiada por un script ve su resultado y el mensaje neutro del ranking.

## Despliegue

**No aplicado. Necesita la aprobación de Gerardo.** No se tocó ningún proyecto remoto de Supabase, ni Vercel, ni producción.

1. **Respaldo.** Hacer un respaldo de la base desde Supabase (o `pg_dump`) y anotar la hora.
2. **Estado previo.** Con consultas de solo lectura, capturar:
   - la foto del catálogo (`security/reversion/verificar-20261011000400/snap.sql`);
   - las huellas de datos (`fp.sql`, igual que en `security/reversion/estado-previo.md`).
3. **Aplicar** `supabase/migrations/20261011000400_integridad_estudio.sql` por el proceso habitual.
4. **Desplegar el frontend de esta rama justo después.** Mientras tanto:
   - el panel anterior sigue descargando, pero su `log_export` falla en silencio y esas descargas quedan sin registro;
   - en el juego anterior, una partida marcada no ve el botón para entrar al ranking, pero tampoco ve el mensaje neutro.
5. **Verificar:**
   - las huellas de datos son iguales a las del paso 2;
   - `select * from get_platform_settings()` como owner devuelve 7 filas;
   - una partida real entra al ranking;
   - un viewer no ve los botones de exportación;
   - las pruebas `security/pruebas-anon-acceso.sql` y `security/http/pruebas-http.mjs` dan todo bloqueado.
6. **Opcional y con decisión del equipo:** pulsar «Recalcular señales» para las partidas anteriores.

**Reversión:**

1. Volver al frontend anterior.
2. Ejecutar `security/reversion/20261011000400_revertir.sql`.
   - Restaura las definiciones anteriores, que son copia literal de las migraciones originales, y borra las tablas `session_integrity` y `platform_settings`. Si se quieren conservar las señales, respaldar antes esas tablas.
   - No toca los datos. Los registros de auditoría escritos mientras tanto se conservan.
3. Verificado en local con `security/reversion/verificar-20261011000400/verificar.sh`: pre-estado → migración → actividad → reversión.
   - Los datos no cambian ni con la migración ni con la reversión; la actividad solo agrega filas a `audit_events`.
   - El catálogo final es igual al previo en 122 elementos: definiciones y permisos de las 56 funciones, permisos, opciones y RLS de 22 tablas y vistas, columnas, las 18 políticas y los triggers.

## Decisiones para el equipo de investigación

- **Umbrales.** Los valores por defecto son conservadores y se justifican con el mínimo físico de la interfaz, medido en local. Conviene revisarlos con la distribución real de intervalos de la 4.0.0 antes de recalcular las partidas pasadas.
- **Recalcular las partidas existentes.** Decidir si se hace y documentarlo en el análisis, porque cambia la muestra válida.
- **Percentil propio.** Decidir si una partida marcada debe seguir viendo su propio «Superaste al X %». Hoy sí, para no cambiar la retroalimentación.
- **Ráfagas.** Decidir si se informan en el análisis; por ejemplo, una clase entera que empezó a la vez.
- **Límite por cliente en el borde** (Vercel u otro): solo con una evaluación de privacidad.
- **Modo viewer solo agregados.**
