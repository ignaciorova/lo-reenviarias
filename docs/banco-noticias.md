# Banco de noticias y versiones del juego

El panel `/admin` tiene dos pantallas para cambiar el contenido del juego sin tocar código.

## Banco de noticias

- Aquí se crean, editan, duplican y archivan noticias. Cada una tiene titular, si es real o falsa, categoría, quién la reenvía y la etiqueta superior. También lleva una imagen o un clip, o en su lugar los dos emojis con el fondo de la 2.0.0. Además tiene la pista, la explicación, las señales de alerta, la fuente y el estado de verificación.
- La vista previa es la misma tarjeta del juego.
- **Imágenes:** se suben al bucket público `noticias` de Supabase Storage, en el mismo proyecto. Antes de subirlas, el navegador las reduce a 1280 px y las convierte a JPEG, lo que también elimina los metadatos del archivo, como la ubicación GPS.
- **Clips:** solo MP4 de hasta 10 MB, y se suben tal cual. Si un clip viene de un celular, conviene exportarlo antes con un editor para quitarle los metadatos.
- **Nombres de archivo:** son aleatorios y no se reemplazan. Para cambiar la imagen de una noticia se sube una nueva.
- **Dónde vive cada imagen:** la tarjeta guarda solo la ruta (`/storage/v1/object/public/noticias/<uuid>.jpg`). El dominio se toma de la configuración del sitio. La base rechaza cualquier archivo de otro dominio o de otro bucket, cualquier fondo que no sea uno de los degradados y cualquier clave desconocida (función `_check_display`).
- **Revisiones:** cada edición sube la revisión de la noticia.

## Versiones del juego

- **Armar una versión:** eliges las noticias del banco, con un mínimo de `items_per_session` (10). La versión copia las preguntas, el tiempo, las pistas y el puntaje de la versión activa, y queda **en borrador**.
- **Más de 10 noticias:** cada jugador ve 10 al azar, de modo que la proporción de reales y falsas puede variar entre jugadores.
- **Copias, no enlaces:** la versión copia las noticias tal como están en ese momento, con su número de revisión (`news_items.item_version`) y la tarjeta de origen (`news_items.bank_id`). Editar el banco después no cambia ninguna versión ya armada.
- **Activar:** solo una cuenta owner puede hacerlo. La versión activa pasa a cerrada en la misma transacción, y las partidas en curso terminan con su versión.
- **Volver atrás:** la pantalla ofrece «Volver a activar» en las versiones cerradas. La 1.0.0 no se puede activar.
- **Borradores que no sirven:** se descartan (estado `archived`); no se borra nada.
- **Auditoría:** todo queda en `audit_events`: `create_news_card`, `edit_news_card`, `archive_news_card`, `create_study_version`, `archive_study_draft` y `activate_study_version`.

## Permisos

| Acción | viewer | analyst | owner |
|---|---|---|---|
| Ver banco y versiones | sí | sí | sí |
| Crear o editar noticias y subir imágenes | no | sí | sí |
| Armar o descartar borradores | no | sí | sí |
| Activar una versión | no | no | sí |

## Despliegue

1. Aplicar `supabase/migrations/20261010000200_banco_noticias.sql`. Esta migración:
   - crea `news_bank` con RLS (lectura viewer+, sin escritura directa);
   - añade `news_items.bank_id`;
   - siembra el banco con las 10 noticias de la versión más reciente (la 3.0.0);
   - crea las funciones y el bucket `noticias` con su política de subida (analyst+).

   No contiene DELETE ni DROP, no cambia la versión activa y no afecta a los jugadores.
2. Publicar el frontend. La política de seguridad de contenido (`vercel.json`) permite imágenes y video desde `https://fieatocekvklctfkxgpa.supabase.co`.
3. En `/admin`, «Banco de noticias» debe listar 10 noticias y «Versiones del juego» debe mostrar la 3.0.0 en juego.

## Pruebas

- `bash scripts/db-test.sh` corre las pruebas SQL; `supabase/tests/20_banco_noticias_tests.sql` tiene 39 aserciones.
- `e2e/banco.spec.ts` prueba el flujo completo en el navegador: crear con imagen, editar, armar, activar y volver atrás, y comprueba que viewer no puede editar.
- La base local no tiene Storage, así que en esa prueba la subida se simula. La política del bucket solo existe en Supabase.

## Registro en producción

- 2026-10-10 02:57 UTC: migración aplicada en Supabase (`fieatocekvklctfkxgpa`) con autorización de Gerardo. Verificado:
  - el banco tiene 10 noticias, las 10 con medio;
  - el bucket `noticias` es público, con límite de 10 MB y los tipos jpeg, png, webp y mp4;
  - existen las políticas `noticias_admin_upload` y `noticias_admin_read`;
  - anon no puede leer el banco ni guardar noticias;
  - la 3.0.0 sigue activa: un `start_session` revertido devolvió 3.0.0 con 10 noticias, todas con medio.
