# Estado final (9 de octubre de 2026)

## Implementado y verificado

| Elemento | Cómo se verificó |
|---|---|
| Auditoría del HTML original y del Supabase previo; verificación de las 10 noticias | Lectura de código, consultas SQL al proyecto, búsqueda de fuentes ([auditoria.md](auditoria.md)) |
| Cierre de la lectura pública de `radiografia_respuestas`, con respaldo y sin borrar nada | Consulta remota de políticas y privilegios; prueba remota con rol anónimo (16 de 16 denegadas) |
| Esquema relacional, catálogo 1.0.0 y 2.0.0, API de participantes, RLS, vistas y funciones administrativas en Supabase | Hash MD5 idéntico al entorno probado (24 funciones, 3 vistas, catálogo completo) |
| Migración de la fila histórica | Aciertos recalculados = 5, igual al original |
| Flujo completo de participante en el proyecto remoto | Partida anónima dentro de una transacción revertida |
| Aplicación pública (móvil y escritorio), guardado incremental, reintentos, reanudación, temporizador con «reducir movimiento», XSS | 28 pruebas E2E en local |
| Panel `/admin`: acceso por rol, métricas iguales a SQL independiente, filtros, laboratorio, exportaciones CSV/XLSX/ZIP sin truncar y auditadas, QR, depuración | 28 pruebas E2E en local |
| Seguridad de la base (anon, sin rol, viewer, analyst, owner) | 121 aserciones SQL en local |
| Estadística e indicadores | 11 pruebas unitarias |
| Compilación de producción sin secretos | `npm run build` y búsqueda de claves |
| Código publicado en GitHub | Rama `claude/plataforma-v2` de ignaciorova/lo-reenviarias, confirmada con `git ls-remote` |
| Despliegue de producción en https://lo-reenviarias.vercel.app | Despliegue READY en Vercel (commit `b1703a9`); cabeceras de seguridad leídas en `/admin` |
| Aplicación pública contra el Supabase remoto | Dos partidas reales desde la URL pública (escritorio y celular) guardadas y con puntaje igual a SQL independiente |
| Funciones `remove_response_code` y `purge_sessions` en remoto | Ejecutadas por Gerardo en el SQL Editor; cuerpo idéntico al del repositorio (MD5 igual salvo saltos de línea CRLF), `SECURITY DEFINER`, sin permiso para anon ni public |
| Primera cuenta owner (ignaciorova@gmail.com) | Usuario creado por Gerardo en Supabase Auth; rol asignado por SQL; `is_admin` devuelve verdadero para owner, analyst y viewer con su identidad (transacción revertida). Gerardo inició sesión en `/admin` en producción el 9/10 a las 22:08 UTC (`last_sign_in_at`) y confirmó que entró |
| Documentación (9 documentos) | En `docs/` del repositorio y de esta carpeta |

## Implementado pero no verificado

Nada pendiente en esta categoría.

## Pendiente por falta de acceso

Nada. Quedan solo tareas de configuración recomendadas para Gerardo: marcar como prueba sus partidas del 9/10, desactivar el registro público en Supabase Auth y decidir qué hacer con el usuario de Auth sin rol.

## Pendiente por decisión metodológica

| Decisión | Detalle |
|---|---|
| Separar «es real» de «la reenviaría» | Propuesta para 3.0.0 ([revision-metodologica.md](revision-metodologica.md), 3.1). |
| Corregir fuentes y pistas de 5 noticias | 3 reales con fuente citada no localizada o fecha imprecisa y 2 falsas con pista inexacta (auditoría, sección 7). No se cambiaron para no alterar el instrumento. |
| Política de conservación | Propuesta en [privacidad-y-conservacion.md](privacidad-y-conservacion.md); falta aprobarla. |
| Revisión por comité de ética | Necesaria si los resultados se publican. |
| Variables de contexto (facultad, edad) | Solo con aprobación del comité. |
