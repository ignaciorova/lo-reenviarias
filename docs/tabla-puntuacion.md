# Tabla de puntuación semanal

- **Dónde aparece:** solo en las versiones armadas con la casilla «Tabla de puntuación semanal» (`config.leaderboard = true`). Se muestra únicamente en la pantalla final, después de la última pregunta; antes de jugar no se ve, para que nadie juegue pensando en el ranking.
- **Es opcional:** el jugador toca «Entrar a la tabla», recibe un apodo al azar armado de dos listas fijas (20 animales × 20 adjetivos × 100 números), puede pedir «Otro» y decide si lo publica. No hay texto libre, así que no se pueden poner nombres ni groserías.
- **Puntaje:** lo toma el servidor del resumen de la partida, no el navegador. Solo pueden entrar las partidas terminadas, una vez cada una y dentro de las 6 horas siguientes.
- **Privacidad:** `leaderboard_entries` guarda la versión, la semana, el apodo, los puntos y los aciertos. No guarda `session_id` ni la hora. En la sesión solo queda `leaderboard_joined = true`, que no dice qué apodo usó.
- **Semana:** empieza el lunes, en hora de Costa Rica. Se muestran los 10 mejores, y los empates comparten puesto.
- **Metodología:** la tabla puede cambiar cómo juega la gente, por eso va en una versión nueva y no se mezcla con los datos de las versiones sin tabla.

## Migración y pruebas

- La migración es `supabase/migrations/20261010000300_tabla_puntuacion.sql`. Solo agrega una tabla, una columna y funciones; no borra nada.
- Pruebas SQL: `supabase/tests/30_tabla_puntuacion_tests.sql`, con 22 aserciones.
- Pruebas en el navegador: `e2e/tabla.spec.ts`. Además, `e2e/banco.spec.ts` comprueba la casilla al armar una versión.

## Registro en producción

- 2026-10-10 03:20 UTC: migración aplicada en Supabase con autorización de Gerardo. Verificado:
  - `leaderboard_entries` está vacía y con RLS;
  - anon no puede leer la tabla cruda, pero sí ejecutar `join_leaderboard`;
  - anon no puede ejecutar `set_draft_leaderboard` ni `_alias`;
  - la 3.0.0 sigue activa y sin tabla: un `start_session` revertido devolvió 3.0.0 con 10 noticias, y `leaderboard_status` respondió `{"enabled": false}`;
  - el apodo de prueba que arma el servidor es «Jaguar Implacable 27 🐆».
