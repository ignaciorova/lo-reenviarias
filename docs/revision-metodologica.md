# Revisión metodológica

Esta revisión no modifica el instrumento. Las decisiones que cambian lo que se mide se proponen para una versión 3.0.0 y requieren aprobación del equipo de investigación. Lo que ya cambió en 2.0.0 está en [registro-cambios.md](registro-cambios.md).

## 1. Qué mide el instrumento

| Componente | Constructo que parece medir | Observación |
|---|---|---|
| Clasificación de 10 noticias | Discernimiento entre noticias reales y falsas, con presión de tiempo. | Es la medida central. Con 10 ítems la confiabilidad es limitada; conviene informar el α de Kuder-Richardson (KR-20) cuando haya datos. |
| Rótulo «Real / La reenvío» | Mezcla dos constructos: creer que es real e intención de compartir. | Es el problema de validez más importante (sección 3.1). |
| Lupas | Búsqueda de información. | Solo 2, cuestan puntos y dan una pista ya redactada: es un indicador muy débil de «verificar». |
| «¿Verificas antes de compartir?» | Conducta declarada. | Sujeta a deseabilidad social. |
| «¿Cambiarías tu forma…?» | Intención declarada inmediatamente después del juego. | No mide cambio de conducta; probable efecto de demanda. |
| Pregunta abierta inicial | Razonamiento sobre compartir sin verificar. | Requiere codificación con libro de códigos y acuerdo entre codificadores. |

## 2. Diseño

- **Tipo:** estudio descriptivo, transversal, con muestra por conveniencia (quien recibe el enlace o escanea el QR). No permite generalizar a la población estudiantil ni hacer inferencias causales.
- **Unidad de análisis:** la sesión, no la persona. Una misma persona puede jugar varias veces y no hay forma de detectarlo sin recolectar identificadores; esto debe declararse como limitación.
- **Balance de ítems:** 5 reales y 5 falsas, todas presentadas en orden aleatorio desde 2.0.0. El orden ya se registra, lo que permite estimar efectos de posición y fatiga.
- **Presión de tiempo:** 20 s por noticia. Los tiempos agotados se tratan como «no acierto» en todos los indicadores; un análisis de sensibilidad excluyéndolos es recomendable.

## 3. Problemas detectados y propuestas para 3.0.0

### 3.1 Confusión entre creencia e intención de compartir (prioridad alta)

El botón «Real / La reenvío» obliga a quien cree que una noticia es real a declarar también que la reenviaría. Un error de clasificación y una decisión de compartir no son lo mismo.

**Propuesta:** separar en dos preguntas por noticia: «¿Es real o falsa?» y luego «¿La reenviarías?» (sí/no), o rotular los botones solo «Real» y «Falsa». Esto cambia el instrumento y debe ser una versión nueva.

### 3.2 Fuentes de las noticias (prioridad alta)

Dos noticias reales citan en la tarjeta una fuente que no se pudo localizar (AP para r_arancel y CBS para r_cuba), y en tres reales el titular o la fecha simplifican lo publicado (ver [auditoria.md](auditoria.md), sección 7). En dos falsas, la pista contiene afirmaciones inexactas (f_marihuana, f_sinpe).

**Propuesta:** en 3.0.0, citar en la tarjeta solo fuentes verificadas, ajustar titulares para que coincidan con la nota publicada y corregir las dos pistas. Documentar fecha de verificación y URL archivada de cada fuente.

### 3.3 Retroalimentación inmediata y aprendizaje dentro de la partida

Después de cada noticia se revela la respuesta y las señales de alerta. Eso es valioso pedagógicamente, pero hace que las decisiones posteriores no sean independientes de las anteriores (aprendizaje). Por eso no conviene tratar las 10 decisiones como observaciones independientes.

**Propuesta analítica:** modelos de efectos mixtos con intercepto aleatorio por sesión y efecto de la posición; o como mínimo comparar aciertos de las posiciones 1–5 contra 6–10.

### 3.4 Retroalimentación de la multitud (resuelto en 2.0.0)

En 1.0.0 se mostraba «el X% se equivocó» durante el juego, lo que introduce influencia social. Desactivado por defecto en 2.0.0. Al comparar versiones, este cambio es una explicación alternativa de cualquier diferencia.

### 3.5 Temporizador y accesibilidad (resuelto en 2.0.0)

En 1.0.0 el temporizador no corría con «reducir movimiento». Los datos 1.0.0 de esas personas no son comparables. Como 1.0.0 no registraba esa preferencia, no es posible identificarlas.

### 3.6 Alcance simulado

Es un número aleatorio. Útil como recurso didáctico, pero no debe analizarse como variable. El panel no lo usa como indicador.

### 3.7 Preguntas de opinión

- «¿Has compartido algo que luego supiste que era falso?» tiene sesgo de memoria y de deseabilidad.
- «¿Quién tiene más responsabilidad?» admite «Todos por igual», que funciona como salida neutral.
- **Propuesta:** si el objetivo es medir actitudes, usar escalas validadas (por ejemplo, ítems de alfabetización mediática publicados) en lugar de preguntas únicas, y añadir una pregunta posterior equivalente a una previa para poder comparar antes y después.

### 3.8 Variables de contexto

No se pregunta carrera, año, edad ni uso de redes. Esto protege el anonimato, pero impide comparaciones por subgrupos. **Propuesta:** si el comité lo aprueba, añadir 2 o 3 variables en categorías amplias (por ejemplo, facultad y rango de edad), evitando combinaciones que permitan reidentificar en grupos pequeños; el panel ya oculta el percentil y el contador con n pequeñas.

## 4. Plan de análisis sugerido

1. Informar N de sesiones iniciadas, completadas, excluidas (con motivo) y válidas, por versión del instrumento. No mezclar 1.0.0 y 2.0.0 en un mismo indicador sin justificarlo.
2. Descriptivos de aciertos (media, mediana, DE) e IC 95 %.
3. Aceptación de falsas y rechazo de verdaderas por noticia, con n e IC de Wilson.
4. Confiabilidad del puntaje de aciertos (KR-20).
5. Comparaciones por respuesta declarada (¿verificas?) con Kruskal-Wallis o chi-cuadrado, solo cuando se cumplan supuestos, con tamaños de efecto.
6. Análisis de sensibilidad: excluir tiempos agotados; excluir sesiones con respuestas muy rápidas.
7. Codificación de la pregunta abierta con libro de códigos y acuerdo entre dos codificadores (κ de Cohen) sobre una submuestra.

El Laboratorio de análisis del panel cubre los pasos 2, 3 y 5. Los pasos 4, 6 (modelos) y 7 (κ) se hacen con los datos exportados.

## 5. Ética

- Si los resultados se publicarán o presentarán fuera del aula, el protocolo debe pasar por el comité de ética correspondiente antes de la recolección.
- Las noticias falsas son inventadas sobre temas reales (salud, finanzas, instituciones). Se recomienda un mensaje final que aclare cuáles eran falsas y enlaces a fuentes oficiales; el resumen final ya muestra cada noticia con su clasificación.
- Si se aplicará con menores de edad, se requiere asentimiento y consentimiento de responsables; el diseño actual no lo contempla.

## 6. Limitaciones que deben declararse en cualquier informe

Muestra por conveniencia; sesiones y no personas; posibles participaciones repetidas; 10 ítems de un solo momento y contexto (Costa Rica, 2026); confusión entre creer y compartir; retroalimentación inmediata que induce aprendizaje; medidas declaradas sujetas a deseabilidad social; tiempo medido en el dispositivo; diferencias entre versiones del instrumento.
