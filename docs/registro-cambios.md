# Registro de cambios

Los cambios se separan en **técnicos** (no alteran lo que se mide) y **metodológicos** (pueden alterar las respuestas o su interpretación). Los datos de versiones distintas del instrumento no deben combinarse sin justificarlo en el análisis.

## Instrumento 2.0.0 (activo desde el 9/10/2026)

### Cambios metodológicos

| # | Cambio | Motivo | Efecto esperado en los datos |
|---|---|---|---|
| M1 | Se **desactiva** el porcentaje de la multitud («el X% se equivocó») durante el juego. Configurable con `studies.config.show_crowd_feedback`. | Influencia social entre ítems: la respuesta a la noticia *n* puede depender de lo que hicieron otras personas en noticias anteriores. | Comparaciones 1.0.0 vs 2.0.0 de aciertos pueden reflejar este cambio. |
| M2 | Paso de **aceptación informada** explícita antes de jugar. | Requisito ético mínimo para recolectar opiniones. | Puede reducir la participación de quienes no leen; las sesiones sin aceptación no se crean. |
| M3 | El **temporizador corre siempre**, también con «reducir movimiento». | En 1.0.0 esas personas tenían tiempo ilimitado (sesgo sistemático). | Más tiempos agotados en ese grupo frente a 1.0.0. |
| M4 | El **percentil** final solo se muestra con ≥ 20 sesiones de comparación; el contador público, con ≥ 10. | Evitar comparaciones con muestras mínimas. | Ninguno sobre las respuestas. |
| M5 | El alcance simulado se rotula «Simulación ilustrativa» en la retroalimentación. | Evitar que se interprete como dato real. | Posible menor impacto emocional de la retroalimentación. |

**Sin cambios:** las 10 noticias (textos, pistas y clasificación correcta), las 5 preguntas y sus opciones, 20 s por noticia, 2 lupas, la regla de puntuación y el rótulo «Real / La reenvío».

### Cambios técnicos

| # | Cambio |
|---|---|
| T1 | Puntuación, aciertos, rachas y alcance calculados en el servidor (`submit_decision`, `complete_session`). |
| T2 | Respuestas correctas y explicaciones enviadas solo después de cada decisión. |
| T3 | Orden aleatorio de noticias decidido y guardado en el servidor (`presentation_order`, `position`). |
| T4 | Guardado por decisión con reintentos automáticos e idempotencia (un mismo envío repetido no duplica). Reanudación tras recarga o cierre. |
| T5 | Modelo relacional (11 tablas) en lugar de una fila con JSON. |
| T6 | Panel de investigación con Supabase Auth, roles y RLS; la ruta `/admin` no es en sí un mecanismo de seguridad. |
| T7 | Cierre de la lectura pública de `radiografia_respuestas`, respaldo íntegro y migración de su fila a la versión 1.0.0. |
| T8 | Fuentes autoalojadas; cabeceras de seguridad; protección contra XSS e inyección de fórmulas en CSV. |
| T9 | Accesibilidad: botones y teclado además del gesto; contador anunciado a lectores de pantalla. |
| T10 | Migraciones sin sentencias `DROP`: los objetos se crean con `if not exists` / `create or replace`, y las políticas antiguas se neutralizan con `alter policy` en lugar de borrarse. |

## Instrumento 1.0.0 (cerrado)

HTML único original. Se conserva como versión de referencia para los datos migrados (`origin = legacy_import`). Particularidades conocidas de esos datos:

- Sin posición de las noticias ni puntos por decisión (`position` y `points_awarded` nulos).
- `score` y `simulated_reach_total` son los valores que envió el navegador; `correct_count` se recalculó en el servidor con la clave de respuestas (coincide con el original en la fila migrada: 5 y 5).
- Sin registro de aceptación informada (`consent_accepted = false`).
- Retroalimentación de la multitud activa y temporizador detenido con «reducir movimiento».
