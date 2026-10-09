# Evidencia de pruebas

Fecha de la última ejecución completa: 9 de octubre de 2026. Todas las cifras de este documento salen de ejecuciones reales; no hay resultados simulados.

## 1. Resumen

| Conjunto | Dónde se ejecutó | Resultado |
|---|---|---|
| Prueba SQL de seguridad y flujo (`npm run test:sql`) | PostgreSQL 16 local con los roles de Supabase reproducidos | **121 de 121 aserciones correctas** |
| Pruebas unitarias de estadística, indicadores y exportación (`npm test`) | Vitest | **11 de 11** |
| Pruebas de extremo a extremo (`npm run test:e2e`) | Playwright con Chromium, perfiles móvil (Pixel 7) y escritorio (1366×860), contra PostgREST 12 local | **28 de 28** (14 por perfil) |
| Compilación de producción (`npm run build`) con verificación de tipos | Vite 8 / TypeScript 6 | Correcta |
| Verificación de seguridad en el proyecto **remoto** | Supabase `fieatocekvklctfkxgpa`, dentro de una transacción revertida | Correcta (sección 4) |
| Asesor de seguridad de Supabase (remoto) | `get_advisors` | Sin hallazgos críticos; avisos intencionales explicados (sección 5) |
| Búsqueda de secretos en el repositorio y en `dist/` | `grep` de `sb_secret_`, `service_role`, JWT | Ningún secreto |

## 2. Prueba SQL (121 aserciones)

`supabase/tests/10_security_and_flow_tests.sql`, sobre una base creada desde cero con las 5 migraciones y una copia simulada de la tabla original (con su política abierta, como estaba en producción).

1. **Visitante anónimo:** no puede leer ninguna de las 11 tablas, 3 vistas, la tabla original ni el respaldo; no puede insertar sesiones ni decisiones directamente; no puede ejecutar funciones administrativas ni internas; sí puede insertar en la tabla original (compatibilidad).
2. **Flujo completo de participante:** aceptación obligatoria; orden aleatorio de 10 noticias sin respuestas visibles; encuesta previa obligatoria; decisiones secuenciales; lupas limitadas a 2 y solo en la noticia en curso; tiempo agotado; idempotencia de cada función; **paridad de puntuación** con la regla del HTML original; resumen y percentil.
3. **Usuario autenticado sin rol:** ve cero filas en todo.
4. **Viewer:** lee todo, no modifica, no ve la auditoría.
5. **Owner y analyst:** gestión de administradores, marcas de calidad, codificación; todo auditado.
6. **Migración histórica:** respaldo íntegro, 2 filas migradas, 20 decisiones, aciertos recalculados idénticos al original (8 y 6), tiempo agotado preservado, reejecutable sin duplicar.

Las migraciones también se ejecutaron dos veces seguidas sobre la misma base sin errores (idempotencia).

## 3. Pruebas de extremo a extremo (28)

Cada prueba corre en móvil y en escritorio.

**Aplicación pública**
- Sesión completa con botones, gesto de deslizar, teclado y lupa; pregunta final; guardado verificado en la base.
- Recarga a mitad de partida: continúa en la misma noticia sin duplicar.
- Falla de red simulada: reintenta solo y no duplica la decisión.
- Doble clic y envío repetido: sin duplicados.
- Sin respuesta en 20 s: se registra tiempo agotado.
- Con «reducir movimiento» el temporizador también corre (corrige el original).
- Texto con `<img src=x onerror=alert(1)>`: se guarda como texto y no se ejecuta en el panel.

**Panel**
- Sin sesión: muestra el inicio de sesión y no hace ninguna consulta de datos.
- Cuenta sin rol: «Sin permisos»; la API devuelve cero filas; la clave anónima recibe 401 en las vistas.
- **Las métricas del panel coinciden con SQL independiente:** sesiones iniciadas, completadas, válidas, aciertos promedio, clasificación correcta, aceptación de falsas y rechazo de verdaderas, calculadas por separado en SQL y comparadas con lo que muestra la pantalla.
- Una sesión recién jugada aparece en el panel y el contador sube en 1.
- Filtros, laboratorio y exportaciones: el CSV de decisiones tiene exactamente las filas que cuenta SQL con el mismo filtro; el XLSX es un archivo válido; cada exportación crea un registro de auditoría.
- Enlace y código QR: el enlace mostrado es el de la aplicación pública y el PNG descargado es válido. Además, se decodificó un QR generado con la misma biblioteca y devolvió la URL exacta.
- Depuración de sesiones de prueba: pide confirmación, elimina solo lo indicado y deja registro de auditoría.

Capturas en [evidencia/](evidencia/): `final-movil.png`, `final-escritorio.png`, `admin-resumen-movil.png`, `admin-resumen-escritorio.png` (datos de prueba locales).

### Cómo reproducir las E2E

```bash
DB=lr_e2e npm run db:local
# crear un owner local
su postgres -c "psql -d lr_e2e -c \"insert into auth.users(id,email) values ('00000000-0000-4000-8000-0000000000aa','owner-e2e@test.local'),('00000000-0000-4000-8000-0000000000bb','nobody-e2e@test.local'); insert into admin_profiles(user_id,role) values ('00000000-0000-4000-8000-0000000000aa','owner');\""
# PostgREST 12 con db-uri=postgres://authenticator:local-only@127.0.0.1:5432/lr_e2e, puerto 3001, y un secreto JWT local
S=<secreto-local>; D=<dir>
node scripts/local-jwt.mjs $S anon > $D/anon.jwt
node scripts/local-jwt.mjs $S authenticated 00000000-0000-4000-8000-0000000000aa owner-e2e@test.local > $D/owner.jwt
node scripts/local-jwt.mjs $S authenticated 00000000-0000-4000-8000-0000000000bb nobody-e2e@test.local > $D/nobody.jwt
LOCAL_POSTGREST=http://127.0.0.1:3001 VITE_SUPABASE_URL=http://localhost:5173 VITE_SUPABASE_PUBLISHABLE_KEY=$(cat $D/anon.jwt) npx vite --port 5173 &
E2E_TOKEN_DIR=$D E2E_LOCAL_DB=lr_e2e npm run test:e2e
```

Los tokens y el secreto son solo del entorno local y no están en el repositorio.

## 4. Verificación en el proyecto remoto

Ejecutada el 9/10/2026 con el conector de Supabase, en un bloque que termina con error a propósito para que **todo se revierta** (después se confirmó que la base seguía con 1 sesión, la migrada).

| Comprobación | Resultado |
|---|---|
| Rol anónimo lee alguna de las 16 tablas o vistas (incluida la original y el respaldo) | No: 16 de 16 denegadas |
| Anónimo ejecuta `grant_admin` o una función interna | No: denegado |
| Iniciar sin aceptación | Rechazado (`consent_required`) |
| Partida completa como anónimo | 10 noticias, sin `is_real` en la carga inicial; 10 decisiones; reintento de la posición 3 devolvió la decisión original; cierre con 4 aciertos |
| Aciertos según SQL independiente | 4, igual al resumen |
| Autenticado sin rol | 0 filas en `v_sessions` y en la tabla original; `log_export` prohibido |
| Privilegios de `anon` sobre tablas | Solo `INSERT` en `radiografia_respuestas` |
| Funciones remotas idénticas a las probadas localmente | 24 de 24 con el mismo hash MD5 de su definición; las 3 vistas también |
| Catálogo remoto idéntico al local | Hash MD5 igual en estudios, preguntas y las 20 noticias |
| Fila histórica migrada | 1 sesión 1.0.0 con 10 decisiones y 5 respuestas; aciertos recalculados 5 = `aciertos` original 5 |

No se probó en remoto un usuario administrador real porque aún no existe ninguna cuenta en Supabase Auth; ese caso está cubierto por las pruebas locales (secciones 2 y 3).

## 5. Asesor de seguridad de Supabase

- **Funciones SECURITY DEFINER ejecutables por anon (7) y authenticated (16):** intencional. Son la API; cada una valida entradas, y las administrativas comprueban el rol por dentro (probado).
- **RLS sin políticas en `radiografia_respuestas_backup_20261009`:** intencional; el respaldo no debe leerse por la API.
- Ningún aviso de tablas sin RLS ni de vistas que salten RLS.
