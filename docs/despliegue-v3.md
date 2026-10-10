# Despliegue de la versión 3.0.0 (noticias ilustradas)

La 3.0.0 usa los mismos textos, preguntas, tiempo, pistas y puntuación que la 2.0.0. Lo único nuevo es una imagen o un clip corto sin sonido en cada noticia, dentro de un marco de WhatsApp, Facebook o TikTok. Los archivos están en `public/media/v3/` y se sirven desde el mismo dominio. La tarjeta solo acepta rutas `/media/...` (ver `MediaSchema` en `src/game/MediaFrame.tsx`). Si el dato no es válido, la tarjeta se muestra sin imagen, como en la 2.0.0.

Los datos de la 3.0.0 no deben agregarse con los de la 2.0.0 sin justificación, porque las imágenes pueden cambiar la credibilidad percibida.

## Paso 1. Código (sin cambio visible)

Se fusiona esta rama en `claude/plataforma-v2`, que es la rama de producción de Vercel. Mientras la versión activa sea la 2.0.0, sus noticias no traen el campo `media` y el juego se ve igual que antes.

Comprobación: abrir https://lo-reenviarias.vercel.app y ver que las tarjetas siguen con emojis.

## Paso 2. Versión 3.0.0 en borrador

Se aplica `supabase/migrations/20261010000100_version_3_imagenes.sql` en el SQL Editor de Supabase. La migración:

- crea la 3.0.0 en estado `draft`;
- copia las preguntas de la 2.0.0;
- copia las 10 noticias, añadiendo `display.media`.

Al final, la propia migración comprueba que queden 10 noticias con medio y las mismas preguntas. Se puede volver a ejecutar sin efecto.

**Hecho en producción (2026-10-10 01:37 UTC):** el paso 1 se fusionó en el PR #1 (commit 95659da) y Vercel lo desplegó. La migración se aplicó en Supabase con `apply_migration`. Consulta posterior: la 3.0.0 está en `draft` con 10 noticias, las 10 con medio y una sola etiqueta, y 5 preguntas; la 2.0.0 sigue `active`. Los archivos de `/media/v3/` responden 200 en producción.

## Paso 3. Activación

```sql
begin;
update public.studies set status = 'closed' where code = 'lo-reenviarias' and version = '2.0.0';
update public.studies set status = 'active' where code = 'lo-reenviarias' and version = '3.0.0';
commit;
```

Solo puede haber una versión activa (índice `studies_one_active_per_code`), por eso se cierra la 2.0.0 primero en la misma transacción. Las sesiones nuevas usan la 3.0.0. Las que ya estaban en curso terminan con la versión con la que empezaron: `submit_decision` y `complete_session` no exigen que el estudio esté activo.

Comprobación: jugar una partida en el celular y marcarla como prueba en el panel.

## Vuelta atrás

```sql
begin;
update public.studies set status = 'closed' where code = 'lo-reenviarias' and version = '3.0.0';
update public.studies set status = 'active' where code = 'lo-reenviarias' and version = '2.0.0';
commit;
```

No se borra ningún dato. Las sesiones de la 3.0.0 quedan guardadas con su versión.

## Verificado en local (2026-10-10, PostgreSQL 16 + PostgREST 12)

- Migraciones completas desde cero: la 3.0.0 queda en `draft` con 10/10 noticias con medio. Ejecutar la migración una segunda vez no da error.
- Con la 2.0.0 activa: 29 de 30 E2E pasan. La que falla es la partida completa en móvil, de forma intermitente (2 de 4 repeticiones), en el gesto de deslizar. Falla igual con el código de producción sin cambios, así que no la causa esta rama.
- Con la 3.0.0 activada: 14/14 E2E del juego y 16/16 del panel pasan, y las sesiones quedan registradas como 3.0.0.
- Vuelta atrás: `start_session` vuelve a entregar la 2.0.0 sin medios, y una sesión 3.0.0 en curso se reanuda como 3.0.0.
- Pruebas unitarias de `MediaSchema`: rechaza otros dominios, `javascript:`, `data:` y rutas fuera de `/media/`.

## Pendiente antes de activar

- **Plenario (noticia falsa del ejército):** por decisión de Gerardo (2026-10-10) se usa la foto de referencia del plenario vacío publicada por CR Hoy. No tiene personas, marca de agua ni logo del medio, y lleva la misma etiqueta que las demás. Los derechos de la foto son de CR Hoy: se recomienda pedirle autorización por escrito antes de activar la 3.0.0.
- **Etiquetas (resuelto 2026-10-10):** las 10 noticias muestran la misma etiqueta, «Imagen ilustrativa · juego académico», para que el origen de la imagen no delate si la noticia es real o falsa.
- **Comité de ética:** decisión del equipo sobre si el cambio de instrumento requiere aviso.
