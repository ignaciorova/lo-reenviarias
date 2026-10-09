import type { Cell, Table } from './export'
import type { DecisionRow, SessionRow } from './types'
import { computeKpis, itemStats } from './metrics'

type Var = { variable: string; dataset: string; tipo: string; unidad: string; definicion: string }

export const DICTIONARY: Var[] = [
  { dataset: 'participantes', variable: 'session_id', tipo: 'UUID', unidad: '—', definicion: 'Identificador aleatorio de la sesión anónima. No vincula a ninguna persona.' },
  { dataset: 'participantes', variable: 'instrument_version', tipo: 'texto', unidad: '—', definicion: 'Versión del instrumento (1.0.0 = HTML original migrado; 2.0.0 = plataforma actual). No mezclar sin justificación.' },
  { dataset: 'participantes', variable: 'origin', tipo: 'categórica', unidad: '—', definicion: 'app = registrada por la plataforma; legacy_import = migrada desde radiografia_respuestas.' },
  { dataset: 'participantes', variable: 'status_effective', tipo: 'categórica', unidad: '—', definicion: 'completada | en_curso (< 24 h sin terminar) | abandonada (≥ 24 h sin terminar) | excluida (marcada por QA) | prueba.' },
  { dataset: 'participantes', variable: 'is_valid', tipo: 'booleano', unidad: '—', definicion: 'Completada, no excluida, no de prueba y con 10 decisiones registradas. Base de casi todos los indicadores.' },
  { dataset: 'participantes', variable: 'started_at', tipo: 'fecha-hora ISO 8601 (UTC)', unidad: '—', definicion: 'Momento en que aceptó participar.' },
  { dataset: 'participantes', variable: 'completed_at', tipo: 'fecha-hora ISO 8601 (UTC)', unidad: '—', definicion: 'Momento en que se registró la pregunta final y se cerró la sesión.' },
  { dataset: 'participantes', variable: 'duration_seconds', tipo: 'entero', unidad: 'segundos', definicion: 'completed_at − started_at (incluye preguntas y lectura de retroalimentación). En datos 1.0.0, duración reportada por el cliente.' },
  { dataset: 'participantes', variable: 'device_class', tipo: 'categórica', unidad: '—', definicion: 'mobile | tablet | desktop | unknown, inferida del tamaño de pantalla y tipo de puntero. No es un identificador.' },
  { dataset: 'participantes', variable: 'opinion', tipo: 'texto libre (≤ 1500)', unidad: '—', definicion: 'Pregunta abierta previa: «Si te llega una noticia impactante que no puedes verificar, ¿la compartes? ¿Por qué?». Puede contener datos identificables escritos por la persona.' },
  { dataset: 'participantes', variable: 'verifica', tipo: 'ordinal', unidad: '—', definicion: '«¿Verificas una noticia antes de compartirla?» Siempre > A veces > Casi nunca. Comportamiento declarado.' },
  { dataset: 'participantes', variable: 'compartio_falso', tipo: 'categórica', unidad: '—', definicion: '«¿Has compartido algo que luego supiste que era falso?» Sí | No | No estoy seguro/a.' },
  { dataset: 'participantes', variable: 'responsable', tipo: 'categórica', unidad: '—', definicion: '«Cuando una noticia falsa se vuelve viral, ¿quién tiene más responsabilidad?»' },
  { dataset: 'participantes', variable: 'post_cambio', tipo: 'ordinal', unidad: '—', definicion: '«¿Cambiarías tu forma de compartir noticias?» Intención declarada inmediatamente después del juego; no mide conducta futura.' },
  { dataset: 'participantes', variable: 'correct_count', tipo: 'entero 0–10', unidad: 'noticias', definicion: 'Número de noticias clasificadas correctamente (calculado en servidor). Tiempo agotado cuenta como no acierto.' },
  { dataset: 'participantes', variable: 'error_count', tipo: 'entero', unidad: 'noticias', definicion: 'Clasificaciones incorrectas (excluye tiempo agotado).' },
  { dataset: 'participantes', variable: 'timeout_count', tipo: 'entero', unidad: 'noticias', definicion: 'Noticias sin respuesta dentro de 20 s.' },
  { dataset: 'participantes', variable: 'score', tipo: 'entero', unidad: 'puntos', definicion: 'Puntuación oficial calculada en servidor (regla en docs). En 1.0.0 es el valor que envió el cliente.' },
  { dataset: 'participantes', variable: 'hints_used', tipo: 'entero 0–2', unidad: 'lupas', definicion: 'Lupas usadas en la sesión.' },
  { dataset: 'participantes', variable: 'fake_accepted_count', tipo: 'entero', unidad: 'noticias', definicion: 'Noticias falsas clasificadas como reales (deslizadas a «Real / La reenvío»).' },
  { dataset: 'participantes', variable: 'real_rejected_count', tipo: 'entero', unidad: 'noticias', definicion: 'Noticias reales clasificadas como falsas.' },
  { dataset: 'participantes', variable: 'simulated_reach_total', tipo: 'entero', unidad: 'personas (ficticias)', definicion: 'Suma del alcance ILUSTRATIVO aleatorio (900–5099 por cada falsa aceptada). No es difusión real; no usar como variable de resultado.' },
  { dataset: 'decisiones', variable: 'position', tipo: 'entero 1–10', unidad: '—', definicion: 'Orden en que se presentó la noticia (aleatorio por sesión). Nulo en datos 1.0.0 (el original no lo guardaba).' },
  { dataset: 'decisiones', variable: 'item_key', tipo: 'texto', unidad: '—', definicion: 'Identificador estable de la noticia (r_ = real, f_ = falsa en el catálogo).' },
  { dataset: 'decisiones', variable: 'category', tipo: 'categórica', unidad: '—', definicion: 'Tema de la noticia.' },
  { dataset: 'decisiones', variable: 'choice', tipo: 'categórica', unidad: '—', definicion: 'real | falsa | vacío (tiempo agotado). En la interfaz «Real» se rotula también «La reenvío»: ver limitaciones.' },
  { dataset: 'decisiones', variable: 'correct_classification', tipo: 'categórica', unidad: '—', definicion: 'Clasificación correcta según la versión del instrumento evaluada.' },
  { dataset: 'decisiones', variable: 'is_correct', tipo: 'booleano', unidad: '—', definicion: 'choice = correct_classification.' },
  { dataset: 'decisiones', variable: 'timed_out', tipo: 'booleano', unidad: '—', definicion: 'Sin respuesta en 20 s (o respuesta recibida con más de 21,5 s).' },
  { dataset: 'decisiones', variable: 'hint_used', tipo: 'booleano', unidad: '—', definicion: 'Se usó lupa antes de decidir.' },
  { dataset: 'decisiones', variable: 'response_ms', tipo: 'entero', unidad: 'milisegundos', definicion: 'Tiempo desde que aparece la tarjeta hasta la decisión, medido en el dispositivo. Incluye tiempo de lectura de la pista.' },
  { dataset: 'decisiones', variable: 'points_awarded', tipo: 'entero', unidad: 'puntos', definicion: 'Puntos otorgados por el servidor. Nulo en datos 1.0.0.' },
  { dataset: 'decisiones', variable: 'streak_after', tipo: 'entero', unidad: 'aciertos consecutivos', definicion: 'Racha tras esta decisión.' },
  { dataset: 'decisiones', variable: 'validation_status', tipo: 'categórica', unidad: '—', definicion: 'Estado de verificación de la fuente de la noticia (verificada, requiere_precision, requiere_correccion, ficticia_documentada).' },
]

const bool = (b: boolean | null | undefined) => (b === null || b === undefined ? null : b ? 1 : 0)

export function sessionsTable(rows: SessionRow[]): Table {
  const cols = ['session_id', 'instrument_version', 'origin', 'status_effective', 'is_valid', 'is_test', 'exclusion_reason', 'started_at', 'completed_at', 'duration_seconds', 'device_class',
    'opinion', 'verifica', 'compartio_falso', 'responsable', 'post_cambio', 'decisions_count', 'correct_count', 'error_count', 'timeout_count', 'score', 'hints_used',
    'fake_total', 'fake_accepted_count', 'real_total', 'real_rejected_count', 'simulated_reach_total'] as const
  return { name: 'participantes', columns: [...cols], rows: rows.map((r) => cols.map((c) => { const v = r[c as keyof SessionRow]; return typeof v === 'boolean' ? bool(v) : (v as Cell) })) }
}

export function decisionsTable(rows: DecisionRow[]): Table {
  const cols = ['session_id', 'instrument_version', 'position', 'item_key', 'category', 'correct_classification', 'choice', 'is_correct', 'timed_out', 'hint_used',
    'response_ms', 'points_awarded', 'streak_after', 'validation_status', 'created_at'] as const
  return { name: 'decisiones', columns: [...cols], rows: rows.map((r) => cols.map((c) => { const v = r[c as keyof DecisionRow]; return typeof v === 'boolean' ? bool(v) : (v as Cell) })) }
}

export function summaryTable(sessions: SessionRow[], decisions: DecisionRow[]): Table {
  const k = computeKpis(sessions, decisions)
  const rows: Cell[][] = [
    ['Sesiones iniciadas (sin prueba)', k.started, 'sesiones'],
    ['Sesiones completadas', k.completed, 'sesiones'],
    ['Sesiones válidas', k.valid, 'sesiones'],
    ['Sesiones incompletas', k.incomplete, 'sesiones'],
    ['Tasa de finalización', k.completionRate, 'proporción'],
    ['Aciertos promedio (válidas)', k.meanCorrect, 'noticias'],
    ['Mediana de aciertos', k.medianCorrect, 'noticias'],
    ['Desviación estándar de aciertos', k.sdCorrect, 'noticias'],
    ['Clasificación correcta', k.accuracy, 'proporción de decisiones'],
    ['Aceptación de falsas', k.fakeAcceptance, 'proporción de decisiones sobre falsas'],
    ['Rechazo de verdaderas', k.realRejection, 'proporción de decisiones sobre reales'],
    ['Sesiones con al menos una lupa', k.sessionsWithHint, 'proporción'],
    ['Duración mediana', k.medianDuration, 'segundos'],
    ['Intención de verificar más', k.verifyMoreRate, 'proporción de quienes respondieron'],
  ]
  const items = itemStats(decisions.filter((d) => sessions.find((s) => s.session_id === d.session_id)?.is_valid))
  for (const it of items) rows.push([`Acierto en ${it.item_key}`, it.accuracy, `proporción (n=${it.n})`])
  return { name: 'resumen', columns: ['indicador', 'valor', 'unidad'], rows: rows.map((r) => r.map((v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v))) }
}

export function dictionaryTable(): Table {
  return { name: 'diccionario', columns: ['dataset', 'variable', 'tipo', 'unidad', 'definicion'], rows: DICTIONARY.map((d) => [d.dataset, d.variable, d.tipo, d.unidad, d.definicion]) }
}

export function metadataTable(meta: { extractedAt: string; filters: string; versions: string[]; nSessions: number; nDecisions: number; user?: string }): Table {
  return {
    name: 'metadatos', columns: ['campo', 'valor'], rows: [
      ['Estudio', '¿Lo reenviarías? — Radiografía Social ULACIT'],
      ['Fecha de extracción (UTC)', meta.extractedAt],
      ['Versiones del instrumento incluidas', meta.versions.join(', ') || '—'],
      ['Criterios de filtrado', meta.filters],
      ['Sesiones exportadas', meta.nSessions],
      ['Decisiones exportadas', meta.nDecisions],
      ['Advertencia', 'El alcance simulado es ilustrativo y aleatorio; no representa difusión real. Las respuestas abiertas pueden contener datos personales escritos por participantes.'],
    ],
  }
}
