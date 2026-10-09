# Auditoría del instrumento original

**Objeto:** `¿Lo reenviarías? — Radiografía Social ULACIT`, archivo HTML único (instrumento 1.0.0) y proyecto Supabase `fieatocekvklctfkxgpa`.
**Fecha:** 9 de octubre de 2026.
**Método:** lectura completa del código fuente, consultas SQL de solo lectura al proyecto Supabase (vía conector autorizado) y búsqueda de las fuentes de las 10 noticias.

Cada hallazgo indica severidad (Crítica, Alta, Media, Baja) y cómo se resolvió en la versión 2.0.0.

## 1. Arquitectura

| Aspecto | Estado original | Resolución en 2.0.0 |
|---|---|---|
| Estructura | Un solo HTML con CSS, JS, datos de las noticias y clave de Supabase incrustados. | Proyecto Vite + React + TypeScript. Aplicación pública (`/`) y panel (`/admin`) en el mismo sitio; el panel se carga como módulo separado (code-splitting) y nunca se descarga para participantes. |
| Persistencia | Un `INSERT` a `radiografia_respuestas` al final de la partida, con todo calculado en el navegador. | Modelo relacional con 11 tablas y guardado incremental por decisión mediante funciones RPC en el servidor. |
| Panel | `#resultados` en el mismo HTML, sin autenticación, leyendo hasta 3000 filas con la clave anónima. | `/admin` con Supabase Auth, roles `owner`/`analyst`/`viewer` y RLS. |
| Dependencias externas | Google Fonts (CDN) y supabase-js por CDN. | Fuentes autoalojadas (@fontsource), dependencias fijadas en `package-lock.json`. |

## 2. Estado de Supabase antes de la migración

Consultado el 9/10/2026, antes de aplicar cambios:

- Tabla única `public.radiografia_respuestas` con 1 fila (3/10/2026). Columnas: `id` uuid, `created_at`, `opinion` (≤1500), `verifica`, `compartio_falso`, `responsable`, `post_cambio` (≤40), `aciertos` 0–10, `puntos` 0–5000, `lupas_usadas` 0–2, `alcance_simulado`, `respuestas` jsonb, `duracion_seg`.
- RLS activo, pero con la política **«leer resultados»: SELECT `using (true)` para anon y authenticated**. **Severidad: Crítica.** Cualquier persona con la clave pública (que está en el HTML) podía descargar todas las respuestas, incluidos los textos abiertos.
- Política «insertar anonimo»: INSERT `with check (true)`.
- Privilegios de tabla para anon y authenticated: todos, incluidos `UPDATE`, `DELETE` y `TRUNCATE` (las políticas impedían borrar filas, pero `TRUNCATE` no está sujeto a RLS). **Severidad: Alta.**
- La clave incrustada es la clave anónima (JWT con `role: anon`), no una clave secreta. Es pública por diseño; el problema era la política, no la clave.
- Una sola migración registrada: `20261003183524 radiografia_respuestas`.

**Resolución:** la migración 0005 crea un respaldo íntegro, retira todos los privilegios de anon salvo `INSERT` (para que el HTML original no pierda datos si sigue circulando), neutraliza las políticas abiertas y deja la lectura solo para administradores. Verificado en el proyecto remoto (ver [evidencia-pruebas.md](evidencia-pruebas.md)).

## 3. Lógica del juego

| # | Hallazgo | Severidad | Resolución |
|---|---|---|---|
| 3.1 | La puntuación, los aciertos y el alcance se calculan en el navegador y se envían al servidor. Cualquiera puede enviar `aciertos=10, puntos=5000`. | Alta | Todo se calcula en `submit_decision` y `complete_session` (servidor). El cliente solo envía la elección y el tiempo. |
| 3.2 | Las respuestas correctas (`real: true/false`) y las explicaciones están en el código del cliente desde el inicio. | Alta | El servidor revela `is_real` y la explicación solo después de registrar cada decisión. |
| 3.3 | Código muerto en el cálculo de puntos (una línea se sobrescribe con la siguiente). | Baja | Se documentó la regla efectiva y se reprodujo exactamente en SQL: velocidad = max(0, round(50·(1 − t/20))); multiplicador = 1 si racha < 2, si no min(racha,4)/2 + 0,5; puntos = round((100 + velocidad)·multiplicador); con lupa ×0,8. Paridad probada. |
| 3.4 | **El temporizador no corre si el sistema tiene «reducir movimiento»**, porque depende del evento `animationend`. Esas personas nunca agotan el tiempo. | Alta (sesgo sistemático) | El temporizador usa `setTimeout` independiente de la animación. Prueba E2E específica. |
| 3.5 | Botón «Ver mi resultado» sin bloqueo: múltiples clics generan inserciones duplicadas. Sin reintento ante fallas de red. | Alta | Identificador de sesión generado en el cliente y funciones idempotentes; reintentos con espera exponencial; reanudación tras recarga. |
| 3.6 | Orden aleatorio en el cliente y no se guarda; tampoco la posición de cada noticia. | Media | Orden aleatorio decidido en el servidor y guardado (`presentation_order`, `position`). |
| 3.7 | El «alcance simulado» es `900 + random()·4200`: un número aleatorio presentado como consecuencia. | Media (metodológica) | Se conserva por ser parte del instrumento, pero se rotula «Simulación ilustrativa» y el panel no lo presenta como indicador. |
| 3.8 | El percentil se calcula contra hasta 3000 filas descargadas al inicio (y requiere la lectura pública). | Media | Percentil calculado en servidor, solo si hay al menos 20 sesiones válidas de comparación. |
| 3.9 | La duración incluye la pregunta final y el texto promete «3 minutos» cuando el juego máximo es 200 s más preguntas. | Baja | Duración documentada como «inicio a cierre». La portada mantiene «Unos 3 minutos»; el panel muestra la duración mediana real para comprobarlo con datos. |

## 4. Validez metodológica (resumen; detalle en [revision-metodologica.md](revision-metodologica.md))

- **Retroalimentación de la multitud durante el juego** («el X% se equivocó») introduce influencia social entre ítems. Desactivada por defecto en 2.0.0 y registrada como cambio metodológico.
- El rótulo **«Real / La reenvío»** confunde dos constructos (creer que es real y decidir compartir). Se conserva en 2.0.0 para no cambiar el instrumento sin decisión del equipo; propuesta para 3.0.0.
- Sin aceptación informada explícita. 2.0.0 añade un paso «Acepto y quiero jugar» con el propósito, la anonimidad y el uso de los datos.
- Las fuentes de varias noticias no coinciden con lo que muestra la tarjeta; ver sección 7.

## 5. Seguridad del cliente

| Hallazgo | Severidad | Resolución |
|---|---|---|
| Textos de participantes insertados con `innerHTML` en `#resultados` (riesgo de XSS almacenado para quien abría el panel). | Alta | React escapa todo el texto; no se usa `dangerouslySetInnerHTML`. Prueba E2E con `<img onerror>` y CSV con protección contra inyección de fórmulas. |
| Sin cabeceras de seguridad. | Media | `vercel.json` y `netlify.toml` con CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. |
| Google Fonts transmite la IP de cada visitante a un tercero. | Media (privacidad) | Fuentes autoalojadas. |
| Sin límite de frecuencia. | Media | Límite global configurable (120 sesiones/minuto) sin almacenar IP; tamaño máximo de cargas. |

## 6. Accesibilidad

| Hallazgo | Resolución |
|---|---|
| Solo deslizamiento con el dedo o el ratón para clasificar. | Botones visibles, teclado (← falsa, → real) y gestos. |
| Temporizador solo visual. | Contador numérico con `aria-live` y aviso para lectores de pantalla cuando quedan pocos segundos. |
| Colores rojo/verde como única señal. | Cada resultado se acompaña de texto explícito (correcto, incorrecto, tiempo agotado). |
| Animaciones constantes. | Respetan `prefers-reduced-motion`; los gráficos del panel no se animan. |

## 7. Verificación de las 10 noticias (búsqueda del 9/10/2026)

| Clave | Tipo | Estado | Observación |
|---|---|---|---|
| r_arancel | Real | Requiere precisión | El arancel de 12,5% existe (La República, Infobae), pero se vincula a investigaciones de USTR sobre aplicación de prohibiciones de importación, no a trabajo forzoso comprobado en Costa Rica. No se localizó la nota de AP citada. |
| r_cuba | Real | Requiere precisión | En marzo se cerró la embajada; la ruptura formal se confirmó el 19/09/2026. No se localizó la nota de CBS citada. |
| r_hermano | Real | Verificada | CR Hoy, 03/10/2026. |
| r_bus | Real | Requiere precisión | Ruta 220, aprobada por ARESEP; La Teja informó el 07/10/2026. La fecha «2 de octubre» de la pista no se confirmó. |
| r_recorte | Real | Verificada | Diario Extra; la página muestra fechas contradictorias. |
| f_marihuana | Falsa | Requiere corrección | La afirmación es falsa, pero la pista «Ningún medio la reporta» es inexacta: existe un proyecto de ley con cobertura. |
| f_sinpe | Falsa | Requiere corrección | No hay cobro fijo de ₡150, pero desde octubre de 2025 algunos bancos cobran por encima de montos diarios. |
| f_ingles, f_ejercito, f_ccss | Falsas | Ficticia documentada | Sin anuncios oficiales; inventadas para el juego. |

Los textos de las tarjetas **no se modificaron** en 2.0.0, para no alterar el instrumento sin decisión del equipo. Las correcciones propuestas están en `news_items.validation_notes`, en el panel (sección «Noticias») y en la revisión metodológica.
