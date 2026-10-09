# Privacidad y conservación de datos

## 1. Qué se recolecta

| Dato | Para qué | Identifica a la persona |
|---|---|---|
| Identificador aleatorio de sesión (UUID) | Guardar y reanudar la partida sin cuenta. | No. Se genera en el dispositivo y no se vincula a nada más. |
| Respuestas a 5 preguntas de opinión | Objetivo del estudio. | Las opciones cerradas no. **El texto abierto puede contenerlo** si la persona lo escribe. |
| Decisiones, tiempos, uso de lupas | Objetivo del estudio. | No. |
| Clase de dispositivo (móvil, tableta, escritorio) y preferencia «reducir movimiento» | Controlar diferencias de interfaz y del temporizador. | No. Se infieren del tamaño de pantalla; no se guarda el agente de usuario. |
| Fechas y horas de inicio y fin | Duración y depuración. | No. |

**No se recolectan** nombres, correos, teléfonos, carné, direcciones IP, agente de usuario, ubicación ni cookies de seguimiento. La aplicación pública no carga recursos de terceros (las fuentes están en el mismo sitio), así que ningún tercero recibe la IP del visitante por cargar la página. Supabase y el proveedor de alojamiento registran IPs en sus propias bitácoras de infraestructura; esos registros no llegan a la base del estudio.

El panel guarda, en `audit_events`, el identificador de la cuenta administrativa que realiza cada acción.

## 2. Aceptación informada

Antes de jugar se muestra para qué se usan las respuestas, que son anónimas, que se puede abandonar en cualquier momento y que no deben escribirse datos personales en el texto abierto. Sin aceptar no se crea ninguna sesión. Este texto es un mínimo técnico; **no sustituye la revisión de un comité de ética** si los resultados se publicarán (ver [revision-metodologica.md](revision-metodologica.md)).

## 3. Acceso

- Participantes: solo pueden crear y continuar su propia sesión mediante funciones del servidor. No pueden leer datos de nadie más (verificado en el proyecto remoto con el rol anónimo).
- Investigadores: solo cuentas con rol activo en `admin_profiles`. Cada exportación y cada cambio administrativo queda registrado.
- Los archivos exportados quedan fuera del control de la plataforma: guardarlos en almacenamiento institucional y no compartir los textos abiertos sin revisarlos.

## 4. Política de conservación propuesta

Es una propuesta técnica; el equipo de investigación debe confirmarla.

| Tipo de dato | Plazo propuesto | Cómo se aplica |
|---|---|---|
| Sesiones de prueba | Eliminar 1 día después de marcadas. | Panel → Calidad de datos → «Eliminar sesiones de prueba» (owner). |
| Sesiones no completadas | Marcar abandonadas a las 24 h; eliminar a los 30 días. | Calidad de datos → «Marcar abandonadas» y «Eliminar sesiones no completadas» (owner). |
| Sesiones completadas | Conservar hasta 5 años después de publicar los resultados, o lo que defina el protocolo aprobado. | Manual, por decisión del equipo. |
| Respuestas abiertas con datos personales | Anonimizar al detectarlas (excluir la sesión o editar el texto con respaldo documentado). | Calidad de datos → excluir con motivo; la edición de textos se hace en SQL por el owner y se documenta. |
| Bitácora de auditoría | Conservar mientras existan los datos. | — |
| Tabla original y su respaldo (`radiografia_respuestas*`) | Conservar hasta confirmar que la migración es correcta; después, el equipo decide si archivarlas fuera de la base. | Manual. |

Las eliminaciones son definitivas, piden confirmación y quedan auditadas. Las funciones de depuración están en el repositorio; en el proyecto remoto deben instalarse ejecutando `supabase/manual/pendiente_remoto_funciones_delete.sql` (ver [registro-despliegue.md](registro-despliegue.md)).

## 5. Derechos de las personas participantes

Como las sesiones son anónimas y no hay forma de vincular una sesión con una persona, no es posible localizar y borrar las respuestas de alguien a petición, salvo que esa persona conserve el identificador de su sesión (está en el almacenamiento local de su navegador). Esto debe explicarse en el texto de aceptación si el comité lo requiere.
