// Filas de las vistas v_sessions y v_decisions (ver supabase/migrations/..._admin_security.sql)
export type SessionRow = {
  session_id: string
  study_code: string
  instrument_version: string
  origin: 'app' | 'legacy_import' | 'qa_test'
  status: 'started' | 'completed' | 'abandoned'
  is_test: boolean
  exclusion_reason: string | null
  is_valid: boolean
  status_effective: 'prueba' | 'excluida' | 'completada' | 'abandonada' | 'en_curso'
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  device_class: string
  reduced_motion: boolean | null
  consent_accepted: boolean
  opinion: string | null
  verifica: string | null
  compartio_falso: string | null
  responsable: string | null
  post_cambio: string | null
  decisions_count: number
  correct_count: number | null
  error_count: number | null
  timeout_count: number | null
  score: number | null
  hints_used: number | null
  fake_total: number | null
  fake_accepted_count: number | null
  real_total: number | null
  real_rejected_count: number | null
  simulated_reach_total: number | null
  /** Señales de actividad automatizada (servidor). Opcionales: bases sin la migración 20261011000400 no las tienen. */
  automation_signals?: string[]
  automation_review?: string | null
  automation_flagged?: boolean
}

export type DecisionRow = {
  decision_id: number
  session_id: string
  instrument_version: string
  origin: string
  session_status: string
  is_test: boolean
  exclusion_reason: string | null
  item_key: string
  category: string
  headline: string
  validation_status: string
  position: number | null
  choice: 'real' | 'falsa' | null
  correct_classification: 'real' | 'falsa'
  is_correct: boolean
  timed_out: boolean
  hint_used: boolean
  response_ms: number | null
  points_awarded: number | null
  streak_after: number | null
  simulated_reach: number
  created_at: string
}

export type OpenResponseRow = {
  response_id: number
  session_id: string
  question_key: string
  text_value: string
  created_at: string
  instrument_version: string
  status: string
  is_test: boolean
  codes: string[]
}

export const VERIFICA = ['Siempre', 'A veces', 'Casi nunca'] as const
export const COMPARTIO = ['Sí', 'No', 'No estoy seguro/a'] as const
export const RESPONSABLE = ['Quien la crea', 'Quien la comparte', 'La red social', 'Todos por igual'] as const
export const POST = ['Sí, verificaría más', 'Tal vez', 'No, seguiré igual'] as const
