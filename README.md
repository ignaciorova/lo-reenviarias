# ¿Lo reenviarías? — Radiografía Social ULACIT

Juego académico sobre cómo decidimos qué noticias compartir (aplicación pública en `/`) y panel privado de investigación (`/admin`), sobre Supabase.

- **Instrumento activo:** 2.0.0. Los datos del HTML original están migrados como 1.0.0.
- **Stack:** Vite, React, TypeScript, Tailwind, Recharts, Zod, Supabase (PostgreSQL + Auth).

## Puesta en marcha

```bash
npm ci
cp .env.example .env.local   # solo valores públicos: URL y clave publicable
npm run dev
```

**Producción:** https://lo-reenviarias.vercel.app (Vercel, rama `claude/plataforma-v2`).

Para otro despliegue en Vercel o Netlify: importar el repositorio y definir las tres variables de `.env.example`. La configuración de rutas y cabeceras de seguridad ya está en `vercel.json` y `netlify.toml`. Pasos completos en [docs/registro-despliegue.md](docs/registro-despliegue.md).

## Pruebas

```bash
npm test            # unitarias
npm run test:sql    # 121 aserciones de seguridad y flujo sobre PostgreSQL local
npm run test:e2e    # Playwright, móvil y escritorio (ver docs/evidencia-pruebas.md)
```

## Documentación

| Documento | Contenido |
|---|---|
| [auditoria.md](docs/auditoria.md) | Auditoría del HTML original y del Supabase previo, y verificación de las 10 noticias. |
| [registro-cambios.md](docs/registro-cambios.md) | Cambios técnicos y metodológicos por versión. |
| [informe-tecnico.md](docs/informe-tecnico.md) | Arquitectura, modelo de datos, API y seguridad. |
| [diccionario-datos.md](docs/diccionario-datos.md) | Variables, indicadores y procedimientos estadísticos. |
| [manual-uso.md](docs/manual-uso.md) | Participar, compartir, dar acceso al panel, exportar. |
| [evidencia-pruebas.md](docs/evidencia-pruebas.md) | Resultados de las pruebas locales y remotas. |
| [registro-despliegue.md](docs/registro-despliegue.md) | Qué se aplicó, dónde y qué falta. |
| [privacidad-y-conservacion.md](docs/privacidad-y-conservacion.md) | Datos recolectados, acceso y conservación. |
| [revision-metodologica.md](docs/revision-metodologica.md) | Validez, limitaciones y propuestas para 3.0.0. |
| [estado-final.md](docs/estado-final.md) | Qué está verificado, qué falta y por qué. |

## Seguridad

El frontend solo lleva la URL del proyecto y la clave publicable. Nunca poner la clave `service_role` ni una `sb_secret_` en variables `VITE_*`: la aplicación se niega a arrancar si detecta una. El acceso al panel depende de Supabase Auth y de RLS, no de la ruta `/admin`.
