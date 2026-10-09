# Sandbox: noticias ilustradas (propuesta 3.0.0)

Rama `claude/sandbox-noticias-ilustradas`. **No está en producción** y no cambia el instrumento 2.0.0.

## Qué es

La página `/sandbox` muestra 4 noticias del juego (2 reales y 2 falsas) con imagen o clip, presentadas como llegarían por WhatsApp, Facebook o TikTok. Se puede jugar la misma ronda con imágenes y sin imágenes para compararlas.

- Todo ocurre en el navegador: **no llama a Supabase y no guarda respuestas** (prueba E2E `e2e/sandbox.spec.ts`).
- Textos, pistas, explicaciones y regla de puntaje: copiados sin cambios de la 2.0.0.
- Medios en `public/sandbox/` (segunda versión, 9/10/2026, a pedido de Gerardo: «algo más real»):
  - Bus y embajada: fotos generadas con IA en Canva (sin personas reconocibles, marcas ni banderas). Llevan el aviso «Imagen generada con IA · juego académico».
  - Plenario: foto del plenario vacío de la Asamblea Legislativa aportada por Gerardo. **Licencia y fuente por confirmar antes de cualquier uso fuera del sandbox**; lleva el aviso «Foto de referencia · fuente por confirmar».
  - «Comunicado» de SINPE: imagen propia en SVG, que imita el formato de estos mensajes falsos.
  - Clip de la embajada: 5 s sin sonido hecho a partir de la foto (MP4 y WebM, unos 390 KB cada uno). Se pausa en la tarjeta de atrás y con «reducir movimiento».
- Se descartaron fotos de internet con personas identificables (diputados), marca y placa de una empresa de buses real y la embajada de otro país con su bandera.
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
