# Diccionario de datos e indicadores

Este diccionario acompaña a cada exportación (hoja «diccionario») y se genera del mismo código que usa el panel (`src/analytics/datasets.ts`), así que ambos no pueden divergir.

## 1. Conjuntos de datos exportables

| Conjunto | Unidad de análisis | Contenido |
|---|---|---|
| participantes | sesión | Una fila por sesión filtrada, con respuestas de opinión y resumen de juego. |
| decisiones | decisión | Una fila por noticia decidida (10 por sesión completa). |
| resumen | indicador | Indicadores agregados con su unidad, calculados sobre los filtros activos. |
| diccionario | variable | Esta tabla. |
| metadatos | — | Fecha de extracción (UTC), versiones incluidas, filtros, número de filas y advertencias. |
| abiertas (desde «Preguntas abiertas») | respuesta | Texto libre con los códigos asignados. |

Formatos: CSV (UTF-8 con BOM, separador «;», coma decimal, protección contra fórmulas), XLSX con todas las hojas y ZIP con los CSV. No hay límite de filas: la descarga se pagina hasta el total exacto.

## 2. Variables

| Dataset | Variable | Tipo | Unidad | Definición |
|---|---|---|---|---|
| participantes | `session_id` | UUID | — | Identificador aleatorio de la sesión anónima. No vincula a ninguna persona. |
| participantes | `instrument_version` | texto | — | Versión del instrumento (1.0.0 = HTML original migrado; 2.0.0 = plataforma actual). No mezclar sin justificación. |
| participantes | `origin` | categórica | — | app = registrada por la plataforma; legacy_import = migrada desde radiografia_respuestas. |
| participantes | `status_effective` | categórica | — | completada / en_curso (< 24 h sin terminar) / abandonada (≥ 24 h sin terminar) / excluida (marcada por QA) / prueba. |
| participantes | `is_valid` | booleano | — | Completada, no excluida, no de prueba y con 10 decisiones registradas. Base de casi todos los indicadores. |
| participantes | `started_at` | fecha-hora ISO 8601 (UTC) | — | Momento en que aceptó participar. |
| participantes | `completed_at` | fecha-hora ISO 8601 (UTC) | — | Momento en que se registró la pregunta final y se cerró la sesión. |
| participantes | `duration_seconds` | entero | segundos | completed_at − started_at (incluye preguntas y lectura de retroalimentación). En datos 1.0.0, duración reportada por el cliente. |
| participantes | `device_class` | categórica | — | mobile / tablet / desktop / unknown, inferida del tamaño de pantalla y tipo de puntero. No es un identificador. |
| participantes | `opinion` | texto libre (≤ 1500) | — | Pregunta abierta previa: «Si te llega una noticia impactante que no puedes verificar, ¿la compartes? ¿Por qué?». Puede contener datos identificables escritos por la persona. |
| participantes | `verifica` | ordinal | — | «¿Verificas una noticia antes de compartirla?» Siempre > A veces > Casi nunca. Comportamiento declarado. |
| participantes | `compartio_falso` | categórica | — | «¿Has compartido algo que luego supiste que era falso?» Sí / No / No estoy seguro/a. |
| participantes | `responsable` | categórica | — | «Cuando una noticia falsa se vuelve viral, ¿quién tiene más responsabilidad?» |
| participantes | `post_cambio` | ordinal | — | «¿Cambiarías tu forma de compartir noticias?» Intención declarada inmediatamente después del juego; no mide conducta futura. |
| participantes | `correct_count` | entero 0–10 | noticias | Número de noticias clasificadas correctamente (calculado en servidor). Tiempo agotado cuenta como no acierto. |
| participantes | `error_count` | entero | noticias | Clasificaciones incorrectas (excluye tiempo agotado). |
| participantes | `timeout_count` | entero | noticias | Noticias sin respuesta dentro de 20 s. |
| participantes | `score` | entero | puntos | Puntuación oficial calculada en servidor (regla en docs). En 1.0.0 es el valor que envió el cliente. |
| participantes | `hints_used` | entero 0–2 | lupas | Lupas usadas en la sesión. |
| participantes | `fake_accepted_count` | entero | noticias | Noticias falsas clasificadas como reales (deslizadas a «Real / La reenvío»). |
| participantes | `real_rejected_count` | entero | noticias | Noticias reales clasificadas como falsas. |
| participantes | `simulated_reach_total` | entero | personas (ficticias) | Suma del alcance ILUSTRATIVO aleatorio (900–5099 por cada falsa aceptada). No es difusión real; no usar como variable de resultado. |
| decisiones | `position` | entero 1–10 | — | Orden en que se presentó la noticia (aleatorio por sesión). Nulo en datos 1.0.0 (el original no lo guardaba). |
| decisiones | `item_key` | texto | — | Identificador estable de la noticia (r_ = real, f_ = falsa en el catálogo). |
| decisiones | `category` | categórica | — | Tema de la noticia. |
| decisiones | `choice` | categórica | — | real / falsa / vacío (tiempo agotado). En la interfaz «Real» se rotula también «La reenvío»: ver limitaciones. |
| decisiones | `correct_classification` | categórica | — | Clasificación correcta según la versión del instrumento evaluada. |
| decisiones | `is_correct` | booleano | — | choice = correct_classification. |
| decisiones | `timed_out` | booleano | — | Sin respuesta en 20 s (o respuesta recibida con más de 21,5 s). |
| decisiones | `hint_used` | booleano | — | Se usó lupa antes de decidir. |
| decisiones | `response_ms` | entero | milisegundos | Tiempo desde que aparece la tarjeta hasta la decisión, medido en el dispositivo. Incluye tiempo de lectura de la pista. |
| decisiones | `points_awarded` | entero | puntos | Puntos otorgados por el servidor. Nulo en datos 1.0.0. |
| decisiones | `streak_after` | entero | aciertos consecutivos | Racha tras esta decisión. |
| decisiones | `validation_status` | categórica | — | Estado de verificación de la fuente de la noticia (verificada, requiere_precision, requiere_correccion, ficticia_documentada). |

## 3. Indicadores del panel

Salvo que se indique, el denominador son las **sesiones válidas** dentro de los filtros activos: completadas, no excluidas, no de prueba y con 10 decisiones. Las sesiones de prueba nunca entran salvo que se pidan expresamente en el filtro.

| Indicador | Fórmula | Notas |
|---|---|---|
| Sesiones iniciadas | Sesiones con aceptación registrada, sin prueba. | Incluye completas, en curso, abandonadas y excluidas. |
| Completadas | Sesiones con estado `completed`. | Los datos 1.0.0 solo contienen sesiones completadas: incluirlos infla la tasa. |
| Tasa de finalización | completadas ÷ iniciadas. | |
| Sesiones válidas | Ver arriba. | Base de los indicadores siguientes. |
| Aciertos promedio | media de `correct_count`. | También mediana y desviación estándar. Tiempo agotado = no acierto. |
| Clasificación correcta | decisiones correctas ÷ decisiones. | IC 95 % de Wilson; asume independencia entre decisiones, supuesto débil porque hay 10 por persona. |
| Aceptación de falsas | decisiones «Real» sobre falsas ÷ decisiones sobre falsas. | El tiempo agotado cuenta en el denominador y no en el numerador. |
| Rechazo de verdaderas | decisiones «Falsa» sobre reales ÷ decisiones sobre reales. | Igual tratamiento del tiempo agotado. |
| Uso de pistas | sesiones con ≥ 1 lupa ÷ sesiones válidas. | También proporción de decisiones con lupa. |
| Duración mediana | mediana de `duration_seconds`. | Incluye preguntas y lectura de retroalimentación. |
| Dice que verificaría más | «Sí, verificaría más» ÷ quienes respondieron la pregunta final. | Intención declarada, no conducta. |
| Tiempo agotado | decisiones con `timed_out` ÷ decisiones. | |
| Por noticia | aciertos, errores, aceptación (si es falsa), rechazo (si es real), uso de lupa, tiempo de respuesta mediano, tiempo agotado. | Cada noticia con su n. |

## 4. Laboratorio de análisis

| Procedimiento | Cuándo se calcula | Qué se informa |
|---|---|---|
| Proporciones | Siempre | n, proporción, IC 95 % de Wilson. |
| Medias | n ≥ 2 | Media, DE, IC 95 % t de Student. |
| Tabla cruzada + chi-cuadrado | Todas las frecuencias esperadas ≥ 1 y ≥ 80 % de ellas ≥ 5 (criterio de Cochran) | χ², gl, p, V de Cramér. |
| Fisher exacto | Tablas 2×2 que no cumplen Cochran | p bilateral. |
| Spearman | n ≥ 10 | ρ y n. |
| Kruskal-Wallis | ≥ 2 grupos, cada uno con n ≥ 5 | H, gl, p. |

Si no se cumplen los supuestos, el panel muestra la tabla descriptiva y explica por qué no hay prueba. Siempre se muestran N, exclusiones, método y limitaciones. Los resultados son asociaciones en una muestra no aleatoria; no permiten conclusiones causales.
