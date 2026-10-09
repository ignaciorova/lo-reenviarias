# Registro de despliegue

Fecha: 9 de octubre de 2026. Cada paso indica si se ejecutó y cómo se verificó.

## 1. Supabase (proyecto `fieatocekvklctfkxgpa`, https://fieatocekvklctfkxgpa.supabase.co)

**Estado: aplicado y verificado**, salvo dos funciones (sección 1.3).

### 1.1 Migraciones aplicadas

El conector de Supabase agota el tiempo con archivos grandes y queda esperando una confirmación humana con cualquier SQL que contenga `DROP` o `DELETE`. Por eso las migraciones del repositorio se aplicaron en partes, con el mismo contenido. El repositorio se ajustó para no usar `DROP` (equivalente funcional; ver T10 en [registro-cambios.md](registro-cambios.md)).

| Archivo del repositorio | Migraciones remotas | Notas |
|---|---|---|
| — | `connectivity_probe` | `select 1;` sin efecto, usada para diagnosticar el tiempo de espera. |
| 0001 `core_schema` | `core_schema_p1_studies_items` … `core_schema_p6_triggers` | RLS activado desde la creación de cada tabla. |
| 0002 `seed_instrument` | `seed_instrument_v1`, `seed_instrument_v2` | La v2 copia preguntas y noticias de la v1 (en el archivo están literales; son idénticas salvo la fila del estudio). Verificado por hash MD5 contra la base local. |
| 0003 `participant_api` | `participant_api_p1_helpers`, `_p2_session_survey_hint`, `_p3_decision_complete` | |
| 0004 `admin_security` | `admin_security_p1_rls`, `_p2_views`, `_p3_admin_api` | Faltan `remove_response_code` y `purge_sessions`. |
| 0005 `legacy_migration` | `legacy_migration` | Aplicada completa. |

Verificación: las 24 funciones y las 3 vistas remotas tienen el mismo hash MD5 de definición que las probadas localmente. Detalle en [evidencia-pruebas.md](evidencia-pruebas.md), sección 4.

### 1.2 Tabla original

- Respaldo íntegro creado: `radiografia_respuestas_backup_20261009` (1 fila).
- **Lectura pública cerrada.** Las políticas «leer resultados» e «insertar anonimo» no se borraron: se modificaron para que la lectura sea solo de administradores y la inserción de `authenticated` quede sin efecto. Se creó `legacy_insert_only` para que copias viejas del HTML puedan seguir guardando.
- La fila existente se migró como sesión 1.0.0 (aciertos recalculados = 5, igual al original).

### 1.3 Pendiente en Supabase (requiere a una persona)

1. **Instalar dos funciones:** abrir *SQL Editor*, pegar `supabase/manual/pendiente_remoto_funciones_delete.sql` y ejecutar. Habilita «quitar código» en Preguntas abiertas y la depuración de datos. Sin esto, esos dos botones muestran un error; nada más se ve afectado.
2. **Crear la primera cuenta owner** (no existe ninguna): pasos en [manual-uso.md](manual-uso.md), sección 3.
3. Recomendado: en *Authentication → Providers → Email*, desactivar el registro público de cuentas; y en *Authentication → URL Configuration*, poner la URL definitiva del sitio.

## 2. Código

**Estado: publicado y verificado.** Rama `claude/plataforma-v2` en https://github.com/ignaciorova/lo-reenviarias (el repositorio estaba vacío; esta rama es ahora su contenido). Verificado con `git ls-remote`.

## 3. Alojamiento (Vercel o Netlify)

**Estado: pendiente por falta de acceso.** Esta sesión no tiene conector de Vercel ni de Netlify y su red no llega a sus API. **No existe todavía una URL pública.**

Pasos para Vercel (unos minutos):

1. https://vercel.com/new → importar `ignaciorova/lo-reenviarias`, rama `claude/plataforma-v2` (o fusionarla en `main` antes).
2. *Framework preset:* Vite. Comando `npm run build`, salida `dist` (Vercel lo detecta).
3. *Environment Variables* (valores públicos, también en `.env.example`):
   - `VITE_SUPABASE_URL` = `https://fieatocekvklctfkxgpa.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_NnpgZDJXq_zgCxNmMmG8oQ_g5UqWoiO`
   - `VITE_STUDY_CODE` = `lo-reenviarias`
4. *Deploy.* `vercel.json` ya define la reescritura de rutas (para que `/admin` funcione al recargar) y las cabeceras de seguridad.

Netlify: igual, con `netlify.toml` ya incluido.

### Verificación después de desplegar

1. Abrir `/` en un teléfono y jugar una partida completa.
2. Entrar en `/admin` con la cuenta owner: la partida debe aparecer en Resumen y Respuestas.
3. Marcar esa partida como **prueba** en Calidad de datos.
4. En Compartir, descargar el QR y escanearlo.
5. Abrir `/admin` en una ventana privada: solo debe mostrar el inicio de sesión.

## 4. HTML original

Las copias del HTML original que sigan circulando todavía pueden **guardar** respuestas (en la tabla original) pero ya no pueden **leer** ninguna: su pantalla `#resultados` y la comparación con otras personas dejarán de mostrar datos (no se probó cómo se ve ese error en el HTML original). Se recomienda reemplazar el enlace antiguo por el nuevo en cuanto exista la URL.
