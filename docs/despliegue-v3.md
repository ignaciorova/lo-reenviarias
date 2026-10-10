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

- **Foto del plenario (noticia falsa del ejército):** confirmar la fuente y la licencia, o reemplazarla por una imagen de IA.
- **Etiquetas de origen:** la etiqueta del plenario («Foto de referencia · fuente por confirmar») es distinta de la de las demás, y SINPE no tiene etiqueta. Las dos son noticias falsas, así que esas diferencias podrían delatar la respuesta. Conviene igualarlas antes de activar.
- **Comité de ética:** decisión del equipo sobre si el cambio de instrumento requiere aviso.
