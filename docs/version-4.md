# Versión 4.0.0 · Responsabilidad antes de compartir

Estado: **construida en la rama `claude/version-4`, probada en un entorno local. No está aplicada en producción.** La 3.1.0 sigue activa y sus registros no se tocan. Las dos migraciones nuevas (`20261011000100`, `20261011000200`) solo agregan columnas, tablas y funciones, y crean la 4.0.0 como **borrador**. Ninguna se aplica a la base de producción sin la aprobación explícita del equipo.

Objetivo del estudio: identificar el nivel de responsabilidad que asumen las personas antes de compartir información no verificada, a partir de sus hábitos de consumo, verificación y difusión de noticias.

## 1. Qué hace la persona

Por cada una de las 10 noticias (5 confirmadas y 5 falsas, en orden aleatorio):

1. **Decide** en 20 s: Reenviar, Reenviar con aviso, Verificar primero o No reenviar. También puede deslizar la tarjeta (derecha = reenviar, izquierda = no) o usar el teclado (→ ← V A).
2. Si elige **Verificar primero**, tiene 60 s para abrir una fuente (oficial, medio de noticias o comentarios en redes), leerla, decir qué dice («la confirma», «la desmiente», «no dice nada claro») y tomar la decisión final (reenviar, con aviso o no). Puede abrir otra fuente antes de decidir.
3. Declara su **creencia**: Sí, No o No sé. Es lo único que da puntos: +100 si acierta, −100 si falla, 0 con «No sé». Empieza con 600.
4. En 2 noticias al azar se pregunta «¿Por qué?» (7 opciones cortas).
5. Ve si la noticia era real o falsa, su explicación y, si verificó, si leyó bien la fuente.

La imagen se muestra en 5 de las 10 tarjetas de cada partida, con 2 o 3 reales entre ellas, elegidas al azar en el servidor. Así cada noticia aparece con imagen en cerca de la mitad de las partidas (comprobado en 300 sesiones simuladas: entre 40 % y 60 % por noticia).

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
- **Hipótesis prioritaria (hábitos declarados frente a decisiones):** correlación de Spearman entre cada pregunta de hábito de la encuesta y (a) la difusión sin verificación y (b) la verificación efectiva, en las personas unidas por código. Se corrige por Holm entre esos dos indicadores. Se acompaña del promedio por respuesta y de Kruskal–Wallis. Con menos de 85 personas unidas (potencia de 80 % para ρ = 0,3) se informa como exploratoria.
- **Exploratorio, sin prueba confirmatoria:**
  - Imagen frente a sin imagen: Wilcoxon de rangos con signo pareada por sesión. La imagen se asigna al azar por noticia.
  - Confirmadas frente a falsas.
  - Cambio a lo largo de la partida.
  - Repeticiones.
- El panel solo calcula p con al menos 10 pares con diferencia (Wilcoxon) o 10 personas (Spearman). La prueba de Wilcoxon coincide con `scipy.stats.wilcoxon(method="approx", correction=True)`.
- Muestra por autoselección: no se generaliza a la población. Las asociaciones no demuestran causalidad.

## 6. Encuesta en Google Forms

La vinculación es voluntaria y usa un **código seudónimo** de 8 caracteres (7 al azar más 1 de control), por ejemplo `K7M2-Q9XD`. El código no contiene datos de la persona. Se puede entrar por cualquiera de los dos QR.

### Cómo se configura (una vez, en un borrador)

1. En el formulario, agrega una pregunta de respuesta corta **«Código del juego»** (no obligatoria). En Configuración, deja **desactivada** la recolección de correos y el inicio de sesión.
2. Menú ⋮ → **Obtener vínculo prellenado**. Escribe `ABCD1234` en «Código del juego» y copia el vínculo. El número que sigue a `entry.` junto a `ABCD1234` es el **campo del código**.
3. En el panel, Versiones del juego → el borrador 4.x → «📝 Encuesta»: pega el enlace que termina en `/viewform` y el `entry.…`. Solo se puede cambiar en borradores, porque es parte del instrumento. El panel acepta solo enlaces de Google Forms.
4. En la descripción o primera sección del formulario, agrega el enlace **`https://<dominio>/codigo`**. Ahí la persona obtiene su código para escribirlo.
5. En Configuración → Presentación → **Mensaje de confirmación**, pon `https://<dominio>/?origen=encuesta`. Al terminar la encuesta, la persona entra al juego y se le ofrece usar el código guardado en ese teléfono.

### Recorridos

- **QR del juego, encuesta primero (recomendado en la portada):** «Primero la encuesta» crea el código, lo guarda en el teléfono y abre el formulario con el código ya escrito (`usp=pp_url&entry.N=CÓDIGO`). La confirmación del formulario devuelve al juego, que propone enlazar ese código.
- **QR de la encuesta:** la persona pide su código en `/codigo`, lo escribe en el formulario y luego juega desde el mismo teléfono. Si juega en otro teléfono, escribe el código a mano.
- **Juega primero:** al final, «Responder la encuesta» abre el formulario con el código escrito y guarda el enlace con el momento «después».
- **«Ya la respondí»:** escribe su código; se valida el carácter de control antes de guardarlo.

### Qué se verificó y qué no

- **Verificado en local, en pruebas automáticas:**
  - El vínculo prellenado lleva `usp=pp_url` y el código en el campo configurado; la llamada a Google se intercepta en la prueba.
  - El código queda guardado en la sesión con el momento elegido (antes, ya respondió, después).
  - Un código inválido se rechaza.
  - `/codigo` → formulario → `/?origen=encuesta` ofrece el código guardado.
  - En el panel, un CSV con el formato de Google Forms se une por código, aunque esté en minúsculas o con guion.
- **No verificado:** el formulario real. Falta su enlace y el `entry.` de «Código del juego». Cuando el equipo los tenga, se cargan en el borrador y se prueba el recorrido completo en la vista previa con un teléfono.
- Si el formulario se comparte con un enlace corto `forms.gle/…`, el código **no** se escribe solo. Usa el enlace largo `/viewform`.

### Limitaciones para quien no usa el código

- Sin código no hay unión. Esas personas aportan sus decisiones del juego, pero no entran en la hipótesis de hábitos frente a decisiones.
- No sabemos si quien usa el código se parece a quien no lo usa. El resultado de la hipótesis describe a las personas vinculadas. Para cuantificarlo, el panel muestra cuántas sesiones tienen código, y conviene comparar el indicador principal entre sesiones con y sin código.
- Un código mal escrito no une. El carácter de control detecta casi todos los errores de una letra, y O/I/L se leen como 0/1. Una respuesta del formulario con un código que no existe se cuenta como «no coincide».
- En otro teléfono el juego no recuerda el código: hay que escribirlo.
- Si un código aparece en varias respuestas del formulario, se usa la primera. Si aparece en varias partidas, se usa la primera partida completa.
- El orden encuesta–juego se infiere de las marcas de tiempo y del momento elegido en el juego. No se controla.
- El archivo de Google Forms se lee en el navegador de quien analiza y **no se sube** a la base del estudio.

## 7. Panel de investigación

- **Responsabilidad (4.x):** muestra de análisis y recorrido de exclusiones; indicador principal con IC y límites; secundarios; distribución; estados; por tipo, por imagen y por posición; tabla por noticia.
  - **Hábitos frente a decisiones:** se sube el CSV de Google Forms, se elige la columna del código y la pregunta, y se ajusta el orden de las respuestas.
  - **Exportación:** XLSX y CSV de participantes, decisiones y diccionario. Cada descarga queda en la auditoría.
- **Banco de noticias → Fuentes:** edita las tres fuentes de cada noticia y lo que dice cada una. Lo que dice cada fuente es la respuesta correcta, que el jugador nunca recibe. En la 4.x no se puede armar una versión con noticias sin sus tres fuentes.
- **Versiones del juego → Encuesta:** configura el formulario de un borrador 4.x.
- Las pantallas de 1.0.0 a 3.1.0 excluyen las sesiones 4.x, porque sus variables son otras.

## 8. Seguridad y persistencia

- La respuesta correcta (`is_real`) y lo que dice cada fuente (`says`) **nunca** llegan al teléfono antes de responder. Las pruebas SQL lo verifican.
- Todo lo que cuenta lo calcula el servidor: estado, lectura, verificación efectiva y puntos. Los envíos son idempotentes, y una tarjeta incoherente se rechaza (por ejemplo, fuentes abiertas sin haber elegido verificar).
- Al recargar, la partida se reanuda en la misma noticia, también a mitad de una verificación.
- `start_session` (1.0.0 a 3.1.0) se niega con la 4.0.0 activa. Así un teléfono con la página vieja no mezcla flujos.
- RLS: la clave anónima no lee ninguna tabla nueva. Solo el personal del estudio ve las vistas. Editar fuentes y encuesta requiere rol analyst; activar versiones requiere owner.
- No se piden nombre, correo ni IP.

## 9. Pruebas ejecutadas (entorno local, PostgreSQL 16 + PostgREST + Vite)

| Conjunto | Resultado |
|---|---|
| SQL 10 (seguridad y flujo 1.0.0 a 3.1.0) | 121 aserciones OK |
| SQL 20 (banco de noticias) | 39 OK |
| SQL 30 (ranking) | 22 OK |
| SQL 40 (4.0.0) | 72 OK |
| Unitarias (Vitest) | 30 OK |
| E2E 4.0.0: partida completa, código, código inválido, recarga a mitad de verificación (móvil y escritorio) | 8 OK |
| E2E panel 4.x: cifras contra SQL independiente, unión con la encuesta, exportación auditada, fuentes owner/viewer, vista móvil sin desborde | 3 OK |
| E2E 1.0.0 a 3.1.0 (regresión, móvil y escritorio) | 38 OK |

Ejecutadas el 10/10/2026 sobre la rama `claude/version-4`. Cómo reproducirlas: `docs/evidencia-pruebas.md`.

## 10. Para ponerla en marcha (requiere aprobación)

1. Revisar la vista previa con el equipo.
2. **Con aprobación explícita**, aplicar en producción `20261011000100_version_4_responsabilidad.sql` y `20261011000200_version_4_borrador.sql`. Son aditivas: la 3.1.0 sigue en juego y la 4.0.0 queda en borrador.
3. Cargar la encuesta en el borrador (sección 6) y probar el recorrido con un teléfono.
4. Piloto con unas 30 personas. Con la DE del panel, fijar la meta de muestra y el tiempo mínimo de lectura.
5. Activar la 4.0.0 desde Versiones del juego (owner). Para volver atrás se reactiva la 3.1.0 desde la misma pantalla. Los datos de cada versión se conservan.

## 11. Bloqueos y limitaciones de las noticias

Detalle en [expediente-noticias-v4.md](expediente-noticias-v4.md).

- **r_cuba:** no se encontró un comunicado oficial de la Cancillería. La ruptura se conoció por declaraciones del canciller y por la prensa. La fuente oficial del juego es la portada de rree.go.cr, marcada «no dice nada claro», y lo dice así. Alternativa si el equipo quiere una oficial que confirme: sustituirla por otra noticia documentada.
- Algunos textos oficiales se leyeron en copias publicadas por otros sitios (folleto de Hacienda, reglamento de la CCSS); el texto de la Constitución también se leyó en copias truncadas. Conviene confirmarlos en la fuente primaria antes de la recolección definitiva.
- El Observador bloqueó el acceso automático. Las páginas de USTR no nombran directamente la tasa de Costa Rica. No se encontró la resolución final de ARESEP.
- Los comentarios en redes son simulados y el juego lo indica.
- La foto del plenario es de CR Hoy. Se recomienda permiso escrito.
