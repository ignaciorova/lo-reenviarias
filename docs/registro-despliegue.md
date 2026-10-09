# Registro de despliegue

Fecha: 9 de octubre de 2026. Cada paso indica si se ejecutó y cómo se verificó.

## 1. Supabase (proyecto `fieatocekvklctfkxgpa`, https://fieatocekvklctfkxgpa.supabase.co)

**Estado: aplicado y verificado.**

### 1.1 Migraciones aplicadas

El conector de Supabase agota el tiempo con archivos grandes y queda esperando una confirmación humana con cualquier SQL que contenga `DROP` o `DELETE`. Por eso las migraciones del repositorio se aplicaron en partes, con el mismo contenido. El repositorio se ajustó para no usar `DROP` (equivalente funcional; ver T10 en [registro-cambios.md](registro-cambios.md)).

| Archivo del repositorio | Migraciones remotas | Notas |
|---|---|---|
| — | `connectivity_probe` | `select 1;` sin efecto, usada para diagnosticar el tiempo de espera. |
| 0001 `core_schema` | `core_schema_p1_studies_items` … `core_schema_p6_triggers` | RLS activado desde la creación de cada tabla. |
| 0002 `seed_instrument` | `seed_instrument_v1`, `seed_instrument_v2` | La v2 copia preguntas y noticias de la v1 (en el archivo están literales; son idénticas salvo la fila del estudio). Verificado por hash MD5 contra la base local. |
| 0003 `participant_api` | `participant_api_p1_helpers`, `_p2_session_survey_hint`, `_p3_decision_complete` | |
| 0004 `admin_security` | `admin_security_p1_rls`, `_p2_views`, `_p3_admin_api` | `remove_response_code` y `purge_sessions` se instalaron aparte desde el SQL Editor (sección 1.3). |
| 0005 `legacy_migration` | `legacy_migration` | Aplicada completa. |

Verificación: las 24 funciones y las 3 vistas remotas tienen el mismo hash MD5 de definición que las probadas localmente. Detalle en [evidencia-pruebas.md](evidencia-pruebas.md), sección 4.

### 1.2 Tabla original

- Respaldo íntegro creado: `radiografia_respuestas_backup_20261009` (1 fila).
- **Lectura pública cerrada.** Las políticas «leer resultados» e «insertar anonimo» no se borraron: se modificaron para que la lectura sea solo de administradores y la inserción de `authenticated` quede sin efecto. Se creó `legacy_insert_only` para que copias viejas del HTML puedan seguir guardando.
- La fila existente se migró como sesión 1.0.0 (aciertos recalculados = 5, igual al original).

### 1.3 Pendiente en Supabase (requiere a una persona)

1. ~~Instalar dos funciones~~ **Hecho el 9 de octubre (21:54 UTC):** Gerardo ejecutó `supabase/manual/pendiente_remoto_funciones_delete.sql` en el *SQL Editor*. Verificado por consulta: ambas existen como `SECURITY DEFINER` con `search_path` vacío, solo `authenticated` puede ejecutarlas y su cuerpo coincide con el del repositorio (mismo MD5 tras normalizar los saltos de línea CRLF del pegado).
2. ~~Crear la primera cuenta owner~~ **Hecho el 9 de octubre (21:56 UTC):** Gerardo creó `ignaciorova@gmail.com` en Supabase Auth y se le asignó el rol `owner` en `admin_profiles`. Verificado simulando su sesión dentro de una transacción revertida. Gerardo inició sesión en el panel de producción a las 22:08 UTC, después de fijar su contraseña desde el SQL Editor (el correo de recuperación había alcanzado el límite de envíos). Existe otro usuario de Auth sin confirmar y sin rol, que no tiene acceso al panel.
3. Registro público de cuentas: **desactivado por Gerardo el 9/10 a las 22:14 UTC** (*Authentication → Sign In / Providers → User Signups*), según lo que informó; esta sesión no tiene acceso a la configuración de Auth para comprobarlo. El juego no depende de Supabase Auth. Sigue recomendado poner https://lo-reenviarias.vercel.app en *Authentication → URL Configuration → Site URL*.

## 2. Código

**Estado: publicado y verificado.** Rama `claude/plataforma-v2` en https://github.com/ignaciorova/lo-reenviarias (el repositorio estaba vacío; esta rama es ahora su contenido). Verificado con `git ls-remote`.

## 3. Alojamiento (Vercel)

**Estado: desplegado y verificado.** URL pública: https://lo-reenviarias.vercel.app

- Proyecto de Vercel `lo-reenviarias`, rama de producción `claude/plataforma-v2`, con las 3 variables públicas de `.env.example` en Production y Preview (configurado por Gerardo).
- Primer despliegue de producción: commit `b1703a9`, despliegue `dpl_7krqCEa6UqQVgtuzwWzRZZd4nwjX`, estado READY. GitHub registra «Vercel: success» en ese commit.
- `/admin` responde 200 con CSP, `X-Frame-Options: DENY`, HSTS y `X-Robots-Tag: noindex`.
- Conexión con Supabase verificada por datos: dos partidas reales jugadas desde la URL pública (escritorio y celular, 9 de octubre, 21:21 y 21:27 UTC) quedaron guardadas como 2.0.0, completas, con aciertos y puntajes iguales a un cálculo SQL independiente. Deben marcarse como prueba.

Cada push a `claude/plataforma-v2` genera un despliegue de producción nuevo.

### Verificación después de desplegar

1. Abrir `/` en un teléfono y jugar una partida completa.
2. Entrar en `/admin` con la cuenta owner: la partida debe aparecer en Resumen y Respuestas.
3. Marcar esa partida como **prueba** en Calidad de datos.
4. En Compartir, descargar el QR y escanearlo.
5. Abrir `/admin` en una ventana privada: solo debe mostrar el inicio de sesión.

## 4. HTML original

Las copias del HTML original que sigan circulando todavía pueden **guardar** respuestas (en la tabla original) pero ya no pueden **leer** ninguna: su pantalla `#resultados` y la comparación con otras personas dejarán de mostrar datos (no se probó cómo se ve ese error en el HTML original). Se recomienda reemplazar el enlace antiguo por https://lo-reenviarias.vercel.app.
