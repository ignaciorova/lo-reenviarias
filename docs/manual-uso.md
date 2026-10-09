# Manual de uso

## 1. Para participantes

1. Abrir el enlace o escanear el código QR. No se pide cuenta, nombre ni correo.
2. Leer la explicación y pulsar «Acepto y quiero jugar».
3. Responder las cuatro preguntas de opinión.
4. Clasificar 10 noticias: deslizar a la derecha o pulsar **Real / La reenvío**; a la izquierda o **Falsa**. En computadora también funcionan las flechas ← y →. Cada noticia tiene 20 segundos y hay 2 lupas (pistas) por partida; usar una lupa reduce los puntos de esa noticia en 20 %.
5. Tras cada decisión aparece si era real o falsa y por qué.
6. Responder la pregunta final y ver el resultado.

Si se cae la conexión, el juego reintenta solo y avisa. Si se cierra o recarga la página, continúa en la misma noticia. «Iniciar partida para otra persona» deja el dispositivo listo para la siguiente participante.

## 2. Compartir

En el panel, sección **Compartir**: copiar el enlace o descargar el código QR en PNG (para proyectar) o SVG (para imprimir). Probar el QR con un teléfono antes de usarlo.

## 3. Dar acceso al panel

El acceso exige dos cosas: una cuenta de Supabase Auth y un rol en `admin_profiles`. La ruta `/admin` por sí sola no protege nada.

**Primera persona (owner), una sola vez:**

1. En Supabase: *Authentication → Users → Add user → Create new user*, con correo y contraseña, marcando *Auto Confirm User*.
2. En *SQL Editor*, ejecutar (con el correo real):
   ```sql
   insert into public.admin_profiles (user_id, role, display_name)
   select id, 'owner', 'Nombre visible' from auth.users where email = 'correo@ulacit.ac.cr';
   ```
3. Entrar en `https://<dominio>/admin` con ese correo y contraseña.

**Siguientes personas:** crear la cuenta como en el paso 1 y, desde el panel, sección **Administradores** (solo owner), asignar el rol. Roles:

| Rol | Puede |
|---|---|
| viewer | Ver todo el panel y exportar. |
| analyst | Lo anterior, más marcar sesiones de prueba o excluidas, codificar respuestas abiertas y ver la auditoría. |
| owner | Lo anterior, más gestionar administradores y ejecutar la depuración de datos (función `purge_sessions`, ver privacidad-y-conservacion.md). |

Quitar el acceso desactiva el rol (queda en la auditoría); la cuenta de Auth puede borrarse aparte en Supabase.

Recomendado en Supabase (*Authentication → Sign In / Providers → User Signups*): desactivar *Allow new users to sign up*, porque las cuentas las crea el owner (hecho el 9/10/2026). Poner también la URL del sitio en *Authentication → URL Configuration* para que el enlace de recuperación de contraseña lleve al panel.

## 4. Panel de investigación

| Sección | Para qué |
|---|---|
| Resumen | 11 indicadores, cada uno con su definición desplegable, y 8 gráficos. |
| Respuestas | Tabla de sesiones con búsqueda, orden y detalle de cada decisión. |
| Por noticia | Aciertos, errores, aceptación o rechazo, lupas y tiempos por noticia, con su estado de verificación. |
| Comportamiento | Verificación declarada frente a aciertos, uso de lupas y aceptación de falsas, con prueba de independencia; distribución de cada pregunta de opinión. |
| Laboratorio de análisis | Tablas cruzadas, pruebas e intervalos, solo cuando se cumplen supuestos. |
| Preguntas abiertas | Lectura y codificación manual. |
| Exportar | CSV, XLSX y ZIP con diccionario y metadatos. |
| Calidad de datos | Alertas heurísticas (respuestas muy rápidas, todas iguales, 5 o más tiempos agotados, decisiones faltantes, posibles duplicados del sistema original); marcar prueba o exclusión y marcar sesiones abandonadas. |
| Metodología | Versiones del instrumento, cambios y limitaciones. |
| Compartir | Enlace y QR. |
| Administradores | Solo owner. |

**Filtros** (barra superior): fechas, versión del instrumento, estado, respuesta a «¿Verificas…?», categoría de noticia, uso de lupa, resultado de la clasificación e inclusión de datos de prueba. Todas las secciones y exportaciones respetan los filtros, y cada exportación los registra en la hoja «metadatos».

## 5. Exportar

Sección **Exportar**. Cada archivo incluye la fecha de extracción, las versiones del instrumento y los filtros. No se trunca ninguna fila. Cada descarga queda en la auditoría.

Los CSV usan «;» y coma decimal, para que Excel en configuración regional de Costa Rica los abra sin asistente. En R: `read.csv2("archivo.csv", fileEncoding = "UTF-8-BOM")`. En Python: `pd.read_csv("archivo.csv", sep=";", decimal=",", encoding="utf-8-sig")`.

## 6. Datos de prueba

Antes de una aplicación real, jugar unas partidas de prueba y marcarlas como **prueba** en «Calidad de datos». Así no entran en los indicadores (salvo que se active el filtro) y pueden eliminarse con la política de conservación.

## 7. Cambiar el instrumento

No editar noticias o preguntas de la versión activa: crear una versión nueva (por ejemplo 3.0.0) en `supabase/seed/instrument.json`, generar la migración con `npm run seed:sql`, cerrar la anterior (`status = 'closed'`) y activar la nueva. Registrar el cambio en `docs/registro-cambios.md`.
