# Versión 4.0.0 · Responsabilidad antes de compartir

Estado: **construida en la rama `claude/version-4`, probada en un entorno local. No está aplicada en producción.** La 3.1.0 sigue activa y sus registros no se tocan. Las dos migraciones nuevas (`20261011000100`, `20261011000200`) solo agregan columnas, tablas y funciones, y crean la 4.0.0 como **borrador**. Ninguna se aplica a la base de producción sin la aprobación explícita del equipo.

Objetivo del estudio: identificar el nivel de responsabilidad que asumen las personas antes de compartir información no verificada, a partir de sus hábitos de consumo, verificación y difusión de noticias.

## 1. Qué hace la persona

Por cada una de las 10 noticias (5 confirmadas y 5 falsas, en orden aleatorio):

1. **Decide** en 20 s: Reenviar, Reenviar con aviso, Verificar primero o No reenviar. También puede deslizar la tarjeta (derecha = reenviar, izquierda = no) o usar el teclado (→ ← V A).
   - **Reenviar con aviso** reenvía la noticia agregando un texto fijo: «Ojo, no sé si es cierto». Se muestra bajo el botón y en la portada, para que todas las personas le den el mismo significado. Es el mismo texto antes y después de verificar. Cuenta como reenviar: la tarjeta sale hacia la derecha y entra en la difusión (E2 sin verificar, E5 verificada).
2. Si elige **Verificar primero**, tiene 60 s para abrir una fuente (oficial, medio de noticias o comentarios en redes), leerla, decir qué dice («la confirma», «la desmiente», «no dice nada claro») y tomar la decisión final (reenviar, con aviso o no). Puede abrir otra fuente antes de decidir.
3. Declara su **creencia**: Sí, No o No sé. Es lo único que da puntos: +100 si acierta, −100 si falla, 0 con «No sé». Empieza con 600.
4. En 2 noticias al azar se pregunta «¿Por qué?» (7 opciones cortas).
5. Ve si la noticia era real o falsa, su explicación y, si verificó, si leyó bien la fuente.

Cada noticia se muestra con la misma imagen o clip que en la 3.x, en todas las tarjetas (`image_share = 1`). Decisión del 10/10/2026 (Gerardo): no se usan tarjetas sin foto. Por eso la 4.0.0 **no estima el efecto de la imagen**. El mecanismo para mostrar la imagen solo en una parte de las tarjetas, al azar y equilibrando reales y falsas, sigue en el servidor y está probado con `image_share = 0,5` (300 sesiones simuladas: entre 40 % y 60 % por noticia), por si una versión futura quiere medirlo.

Antes de jugar se pregunta «¿Es la primera vez que juegas este juego?». El navegador además recuerda si ya terminó otra partida de la 4.x (`device_replay`).

## 2. Estados por noticia

| Estado | Primera acción | Después |
|---|---|---|
| E1 | Reenviar | — |
| E2 | Reenviar con aviso | — |
| E3 | No reenviar | — |
| E4 | Verificar | Reenviar |
| E5 | Verificar | Reenviar con aviso |
| E6 | Verificar | No reenviar |
| E7 | Se acabó el tiempo al decidir o durante la verificación | — |
| E8 | Noticias no alcanzadas en una sesión interrumpida | Solo en sesiones incompletas |

El estado lo calcula el servidor (`submit_card`). El teléfono no puede elegirlo.

**Consulta frente a verificación efectiva.** Elegir «Verificar primero» es *iniciar una consulta* (E4 a E6). La verificación es *efectiva* solo si se cumplen las tres condiciones:

- La fuente leída es oficial o un medio. Los comentarios en redes no cuentan.
- Se leyó al menos 2 s. El tiempo lo mide el servidor desde la primera apertura de esa fuente (`source_opens`), así que el teléfono no puede inflarlo.
- La persona dijo lo mismo que dice la fuente.

## 3. Indicadores

Todos se calculan **por sesión** y se promedian entre sesiones, así cada persona pesa igual. R = E1 + … + E6 (noticias respondidas).

| Indicador | Fórmula por sesión | Papel |
|---|---|---|
| **Difusión sin verificación previa** | (E1 + E2) / R | **Principal** |
| Límite inferior por tiempo agotado | (E1 + E2) / (R + E7) | Sensibilidad: todo E7 como «no reenvió» |
| Límite superior por tiempo agotado | (E1 + E2 + E7) / (R + E7) | Sensibilidad: todo E7 como «reenvió sin verificar» |
| Inició una consulta | (E4 + E5 + E6) / R | Secundario |
| Verificación efectiva | verificaciones efectivas / R | Secundario |
| Evaluó bien la fuente | evaluaciones correctas / (E4 + E5 + E6) | Secundario |
| Compartió con aviso | (E2 + E5) / (E1 + E2 + E4 + E5) | Secundario |
| Reconoció incertidumbre | respuestas «No sé» / R | Secundario |
| Precisión de la creencia | creencias correctas / respuestas Sí o No | Secundario |
| Discernimiento | P(Sí \| real) − P(Sí \| falsa) | Secundario |
| No reenvió sin verificar | E3 / R | Descriptivo. Con el principal y la consulta suma 100 % |
| Difusión total | (E1 + E2 + E4 + E5) / R | Descriptivo |
| Tiempo agotado | E7 / noticias presentadas | Calidad y diseño |

Las proporciones sin denominador (por ejemplo, «con aviso» en quien no reenvió nada) quedan vacías; no se imputan.

**La creencia se declara después de decidir.** Puede ajustarse para justificar la decisión (quien reenvió tiende a decir «Sí»). Por eso no se usa como causa («compartió porque creía») y la difusión sin verificar declarando «No sé» se lee como un mínimo. La incertidumbre también se mide con la conducta, que no tiene ese sesgo: verificar o reenviar con aviso.

## 4. Muestra y reglas de datos

- **Análisis principal:** sesiones completas, no de prueba, sin exclusión, primera partida (respondió «Sí, es la primera vez» y el navegador no tenía otra partida terminada) y con al menos una noticia respondida.
- Cada sesión que queda fuera cae en un solo motivo, en este orden: prueba, exclusión por calidad, incompleta, repetición, todo agotado. El panel muestra ese recorrido.
- Las incompletas (E8) se informan aparte. Los tiempos cortos se incluyen, porque son conducta. No se imputan datos faltantes.
- Tamaño de muestra por precisión: n = (1,96 × DE ÷ margen)². La DE entre sesiones del indicador principal aparece en el panel. Con DE de 0,20 a 0,30 y margen de ±5 puntos hacen falta de 62 a 139 primeras partidas completas. La meta definitiva se fija con el piloto.

## 5. Estadística

- **Estimación principal:** promedio entre sesiones de la difusión sin verificación previa, con IC 95 % (t de Student sobre las medias por sesión). Se acompaña de su distribución, los dos límites por tiempo agotado y el desglose por tipo de noticia.
- **Hábitos declarados y decisiones simuladas:** se analizan por separado. La encuesta (hábitos declarados) y el juego (decisiones simuladas) son instrumentos independientes y **no se vinculan persona a persona**. No se calcula ninguna correlación individual entre ellos. Si se incorporan los resultados agregados de la encuesta, se comparan solo a nivel de grupo y de forma descriptiva (sección 6).
- **Exploratorio, sin prueba confirmatoria:**
  - Imagen frente a sin imagen: no aplica en la 4.0.0, porque todas las tarjetas llevan imagen. El panel solo lo calcula si una versión asigna la imagen a una parte de las tarjetas.
  - Confirmadas frente a falsas.
  - Cambio a lo largo de la partida.
  - Repeticiones.
- El panel solo calcula p con al menos 10 pares con diferencia (Wilcoxon) . La prueba de Wilcoxon coincide con `scipy.stats.wilcoxon(method="approx", correction=True)`.
- Muestra por autoselección: no se generaliza a la población. Las asociaciones no demuestran causalidad.

## 6. Encuesta y juego: dos instrumentos independientes

Decisión del 10/10/2026: la encuesta de Google Forms ya se envió a los participantes y no se puede modificar. Por eso la 4.0.0 **no** incluye ninguna vinculación con ella (sin código, sin enlaces prellenados, sin página `/codigo`).

| | Encuesta (Google Forms) | Juego 4.0.0 |
|---|---|---|
| Qué mide | Hábitos **declarados** de consumo, verificación, difusión y responsabilidad | Decisiones **simuladas**: compartir, verificar fuentes, actuar ante la incertidumbre |
| Unidad | Respuesta al formulario | Sesión de juego anónima |
| Dónde se analiza | Fuera de esta plataforma | Panel → Responsabilidad (4.x) |

Reglas para combinarlos:

- No se vinculan respuestas individuales ni se infieren correspondencias que no se puedan demostrar.
- Cada instrumento se resume por separado, con su propia muestra y su propio n.
- Si más adelante se incorporan los resultados **agregados** de la encuesta, se muestran en una sección aparte, rotulada como otro instrumento, junto con estas limitaciones.

Limitaciones de la comparación entre instrumentos:

- No se sabe si las dos muestras son las mismas personas, ni en qué proporción. Pueden diferir en quién participó, cuándo y cuántas veces.
- Una coincidencia o una diferencia entre lo declarado y lo simulado describe a los grupos. No permite concluir que quien declara un hábito actúa de cierta forma (falacia ecológica).
- Lo declarado puede tener sesgo de deseabilidad social. Lo simulado ocurre en un juego, no en un chat real.

Lo que queda en la base sin uso: las columnas `survey_code`, `survey_intent` y `survey_code_at` de `participant_sessions`, y las funciones `set_survey_code` y `set_draft_survey`, creadas por la migración 20261011000100. El juego y el panel ya no las usan; siempre quedan vacías. Se mantienen para no cambiar una migración ya probada; se pueden quitar en una versión futura. El parámetro `?origen=` (por ejemplo `qr_juego` o `enlace`) solo registra el canal de entrada.

## 7. Panel de investigación

- **Responsabilidad (4.x):** muestra de análisis y recorrido de exclusiones; indicador principal con IC y límites; secundarios; distribución; estados; por tipo y por posición (y por imagen, si la versión la asigna al azar); tabla por noticia.
  - **Encuesta de hábitos:** un recuadro aparte recuerda que es un instrumento independiente, sin vinculación persona a persona, con sus limitaciones.
  - **Exportación:** XLSX y CSV de participantes, decisiones y diccionario. Cada descarga queda en la auditoría.
- **Banco de noticias → Fuentes:** edita las tres fuentes de cada noticia y lo que dice cada una. Lo que dice cada fuente es la respuesta correcta, que el jugador nunca recibe. En la 4.x no se puede armar una versión con noticias sin sus tres fuentes.
- Las pantallas de 1.0.0 a 3.1.0 excluyen las sesiones 4.x, porque sus variables son otras.

## 8. Seguridad y persistencia

- La respuesta correcta (`is_real`) y lo que dice cada fuente (`says`) **nunca** llegan al teléfono antes de responder. Las pruebas SQL lo verifican.
- Todo lo que cuenta lo calcula el servidor: estado, lectura, verificación efectiva y puntos. Los envíos son idempotentes, y una tarjeta incoherente se rechaza (por ejemplo, fuentes abiertas sin haber elegido verificar).
- Al recargar, la partida se reanuda en la misma noticia, también a mitad de una verificación.
- `start_session` (1.0.0 a 3.1.0) se niega con la 4.0.0 activa. Así un teléfono con la página vieja no mezcla flujos.
- RLS: la clave anónima no lee ninguna tabla nueva. Solo el personal del estudio ve las vistas. Editar fuentes requiere rol analyst; activar versiones requiere owner.
- No se piden nombre, correo ni IP.

## 9. Pruebas ejecutadas (entorno local, PostgreSQL 16 + PostgREST + Vite)

| Conjunto | Resultado |
|---|---|
| SQL 10 (seguridad y flujo 1.0.0 a 3.1.0) | 121 aserciones OK |
| SQL 20 (banco de noticias) | 39 OK |
| SQL 30 (ranking) | 22 OK |
| SQL 40 (4.0.0) | 72 OK |
| Unitarias (Vitest) | 27 OK |
| E2E 4.0.0: partida completa, portada sin código ni encuesta, recarga a mitad de verificación (móvil y escritorio) | 6 OK |
| E2E panel 4.x: cifras contra SQL independiente, encuesta aparte y sin vincular, exportación auditada, fuentes owner/viewer, vista móvil sin desborde | 3 OK |
| E2E 1.0.0 a 3.1.0 (regresión, móvil y escritorio) | 38 OK |

Ejecutadas el 10/10/2026 sobre la rama `claude/version-4`. Cómo reproducirlas: `docs/evidencia-pruebas.md`.

## 10. Para ponerla en marcha (requiere aprobación)

1. Revisar la vista previa con el equipo.
2. **Con aprobación explícita**, aplicar en producción `20261011000100_version_4_responsabilidad.sql` y `20261011000200_version_4_borrador.sql`. Son aditivas: la 3.1.0 sigue en juego y la 4.0.0 queda en borrador.
3. Probar el recorrido con un teléfono en la vista previa (base de pruebas).
4. Piloto con unas 30 personas. Con la DE del panel, fijar la meta de muestra y el tiempo mínimo de lectura.
5. Activar la 4.0.0 desde Versiones del juego (owner). Para volver atrás se reactiva la 3.1.0 desde la misma pantalla. Los datos de cada versión se conservan.

## 11. Bloqueos y limitaciones de las noticias

Detalle en [expediente-noticias-v4.md](expediente-noticias-v4.md).

- **r_cuba:** no se encontró un comunicado oficial de la Cancillería. La ruptura se conoció por declaraciones del canciller y por la prensa. La fuente oficial del juego es la portada de rree.go.cr, marcada «no dice nada claro», y lo dice así. Alternativa si el equipo quiere una oficial que confirme: sustituirla por otra noticia documentada.
- Algunos textos oficiales se leyeron en copias publicadas por otros sitios (folleto de Hacienda, reglamento de la CCSS); el texto de la Constitución también se leyó en copias truncadas. Conviene confirmarlos en la fuente primaria antes de la recolección definitiva.
- El Observador bloqueó el acceso automático. Las páginas de USTR no nombran directamente la tasa de Costa Rica. No se encontró la resolución final de ARESEP.
- Los comentarios en redes son simulados y el juego lo indica.
- La foto del plenario es de CR Hoy. Se recomienda permiso escrito.
