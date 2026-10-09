# Sandbox: noticias ilustradas (propuesta 3.0.0)

Rama `claude/sandbox-noticias-ilustradas`. **No está en producción** y no cambia el instrumento 2.0.0.

## Qué es

La página `/sandbox` muestra 4 noticias del juego (2 reales y 2 falsas) con imagen o clip, presentadas como llegarían por WhatsApp, Facebook o TikTok. Se puede jugar la misma ronda con imágenes y sin imágenes para compararlas.

- Todo ocurre en el navegador: **no llama a Supabase y no guarda respuestas** (prueba E2E `e2e/sandbox.spec.ts`).
- Textos, pistas, explicaciones y regla de puntaje: copiados sin cambios de la 2.0.0.
- Medios propios, sin derechos de terceros: 3 ilustraciones SVG y un clip de 5 s sin sonido (MP4 + WebM, 68–76 KB), en `public/sandbox/`. El clip se pausa en la tarjeta de atrás y con «reducir movimiento».
- Cambio en el código del juego: `NewsCard` muestra `display.media` si existe (si no, se ve igual que hoy) y `GameBoard` acepta un cliente inyectable (por defecto, el de Supabase).

| Noticia | Real | Formato |
|---|---|---|
| Pasaje de bus en Alajuela | Sí | Imagen reenviada por WhatsApp |
| Cobro de SINPE Móvil | No | «Comunicado» reenviado por WhatsApp |
| Embajada en Cuba | Sí | Clip corto estilo TikTok |
| Volver a crear el ejército | No | Publicación compartida en Facebook |

## Antes de llevarlo a producción (decisiones del equipo)

1. Las imágenes cambian la percepción de veracidad; hay que equilibrarlas entre reales y falsas y documentarlo como versión 3.0.0, no comparable directamente con la 2.0.0.
2. Medios para las 10 noticias: propios, con licencia libre o generados. No descargar ni incrustar videos de YouTube (términos de servicio, derechos de autor, rastreo y política de seguridad del sitio).
3. Guardar `media` dentro de `news_items.display` de la nueva versión (no requiere cambiar el esquema).
4. Texto alternativo de cada imagen revisado, para lectores de pantalla.
