import { z } from 'zod'
import { supabase, STUDY_CODE } from './supabase'

// ---------------------------------------------------------------------------
// Esquemas (validación de lo que devuelve el servidor)
// ---------------------------------------------------------------------------
const Display = z.object({
  who: z.string(), many: z.boolean(), band: z.string(), bg: z.string(), emo: z.string(), emo2: z.string(),
}).passthrough()

export const Item = z.object({ position: z.number().int(), item_id: z.string().uuid(), headline: z.string(), display: Display })
export const Question = z.object({
  key: z.string(), phase: z.enum(['pre', 'post']), kind: z.enum(['single', 'open']), prompt: z.string(),
  options: z.array(z.string()), required: z.boolean(), min_length: z.number(), max_length: z.number(),
})
export const Feedback = z.object({
  position: z.number().int().nullable(), item_id: z.string(), choice: z.enum(['real', 'falsa']).nullable(),
  timed_out: z.boolean(), is_correct: z.boolean(), is_real: z.boolean(), hint_used: z.boolean(),
  points_awarded: z.number().nullable(), streak: z.number().nullable(), total_score: z.number(),
  simulated_reach: z.number(), explanation: z.string(), red_flags: z.array(z.string()),
  source_label: z.string().nullable(), crowd: z.object({ n: z.number(), error_pct: z.number() }).nullable(),
})
export const Summary = z.object({
  correct_count: z.number(), decisions_count: z.number(), score: z.number().nullable(), hints_used: z.number(),
  simulated_reach_total: z.number(), percentile: z.number().nullable(), percentile_n: z.number(),
  recap: z.array(z.object({ position: z.number().nullable(), headline: z.string(), is_real: z.boolean(), is_correct: z.boolean(), timed_out: z.boolean(), hint_used: z.boolean() })),
})
export const SessionPayload = z.object({
  session_id: z.string().uuid(),
  status: z.enum(['started', 'completed', 'abandoned']),
  instrument_version: z.string(),
  config: z.object({ items_per_session: z.number(), seconds_per_item: z.number(), hints_per_session: z.number() }),
  hints_remaining: z.number(),
  hints_used: z.record(z.string()),
  questions: z.array(Question),
  answered_phases: z.array(z.enum(['pre', 'post'])),
  items: z.array(Item),
  decisions: z.array(Feedback),
  summary: Summary.nullable(),
})
export const HintResult = z.object({ position: z.number(), hint: z.string(), hints_remaining: z.number(), duplicate: z.boolean() })

const LbRow = z.object({ rank: z.number(), alias: z.string(), score: z.number(), correct: z.number() })
export const LeaderboardStatus = z.object({
  enabled: z.boolean(), joined: z.boolean().optional(), eligible: z.boolean().optional(), can_join: z.boolean().optional(), top: z.array(LbRow).optional(),
})
/** eligible = false: la partida no entra al ranking (respuesta neutra del servidor, sin apodo ni puesto). */
export const LeaderboardJoin = z.object({ eligible: z.boolean().optional(), alias: z.string().optional(), rank: z.number().optional(), top: z.array(LbRow) })
export type LbRowT = z.infer<typeof LbRow>

export type ItemT = z.infer<typeof Item>
export type QuestionT = z.infer<typeof Question>
export type FeedbackT = z.infer<typeof Feedback>
export type SummaryT = z.infer<typeof Summary>
export type SessionPayloadT = z.infer<typeof SessionPayload>

// ---------------------------------------------------------------------------
// Errores y reintentos
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  code: string
  retryable: boolean
  constructor(code: string, retryable: boolean, message?: string) { super(message ?? code); this.code = code; this.retryable = retryable }
}

const FRIENDLY: Record<string, string> = {
  consent_required: 'Necesitamos tu aceptación para continuar.',
  rate_limited: 'Hay muchas personas jugando en este momento. Espera unos segundos e inténtalo de nuevo.',
  study_not_active: 'El estudio no está recibiendo respuestas en este momento.',
  session_not_found: 'No encontramos tu partida. Empieza una nueva.',
  network: 'Sin conexión. Reintentaremos automáticamente.',
}
export function friendlyMessage(e: unknown): string {
  if (e instanceof ApiError) return FRIENDLY[e.code] ?? 'Algo salió mal al guardar. Inténtalo de nuevo.'
  return 'Algo salió mal. Inténtalo de nuevo.'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Llama una función RPC idempotente con reintentos exponenciales ante fallas de red o del servidor. */
export async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>, opts: { retries?: number; onRetry?: (n: number) => void } = {}): Promise<T> {
  const retries = opts.retries ?? 5
  let attempt = 0
  for (;;) {
    let retryable = true
    try {
      const { data, error, status } = await supabase().rpc(fn, args)
      if (error) {
        const code = (error.message ?? '').split(/[:\s]/)[0] || 'unknown'
        // 4xx = error de validación o de negocio: no se reintenta. 5xx / red: sí.
        retryable = status === 0 || status >= 500 || status === 408 || code === 'rate_limited'
        throw new ApiError(code, retryable, error.message)
      }
      const parsed = schema.safeParse(data)
      if (!parsed.success) throw new ApiError('invalid_response', false, parsed.error.message)
      return parsed.data
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('network', true, String(e))
      if (!err.retryable || attempt >= retries) throw err
      attempt++
      opts.onRetry?.(attempt)
      await sleep(Math.min(8000, 400 * 2 ** attempt) + Math.random() * 250)
    }
  }
}

// ---------------------------------------------------------------------------
// API del participante
// ---------------------------------------------------------------------------
export function deviceClass(): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown'
  const w = Math.min(window.screen?.width ?? window.innerWidth, window.innerWidth)
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  if (coarse && w < 700) return 'mobile'
  if (coarse) return 'tablet'
  return 'desktop'
}

type Opt = { onRetry?: (n: number) => void }
export const api = {
  startSession: (sessionId: string, reducedMotion: boolean, o: Opt = {}) =>
    rpc('start_session', { p_session_id: sessionId, p_consent: true, p_device_class: deviceClass(), p_reduced_motion: reducedMotion, p_study_code: STUDY_CODE }, SessionPayload, o),
  getSession: (sessionId: string, o: Opt = {}) => rpc('get_session', { p_session_id: sessionId }, SessionPayload, { retries: 2, ...o }),
  submitSurvey: (sessionId: string, phase: 'pre' | 'post', answers: Record<string, string>, o: Opt = {}) =>
    rpc('submit_survey', { p_session_id: sessionId, p_phase: phase, p_answers: answers }, z.object({ ok: z.boolean() }).passthrough(), o),
  useHint: (sessionId: string, position: number, o: Opt = {}) => rpc('use_hint', { p_session_id: sessionId, p_position: position }, HintResult, o),
  submitDecision: (sessionId: string, position: number, choice: 'real' | 'falsa' | null, responseMs: number, o: Opt = {}) =>
    rpc('submit_decision', { p_session_id: sessionId, p_position: position, p_choice: choice, p_response_ms: Math.max(0, Math.round(responseMs)) }, Feedback, o),
  completeSession: (sessionId: string, o: Opt = {}) => rpc('complete_session', { p_session_id: sessionId }, Summary, o),
  leaderboardStatus: (sessionId: string) => rpc('leaderboard_status', { p_session_id: sessionId }, LeaderboardStatus, { retries: 1 }),
  joinLeaderboard: (sessionId: string, animal: number, adj: number, num: number) =>
    rpc('join_leaderboard', { p_session_id: sessionId, p_animal: animal, p_adj: adj, p_num: num }, LeaderboardJoin, { retries: 2 }),
  publicStats: () => rpc('public_stats', { p_study_code: STUDY_CODE }, z.object({ n: z.number().nullable(), mean_correct: z.number().optional() }), { retries: 0 }),
}

// ---------------------------------------------------------------------------
// Persistencia local mínima (solo el identificador aleatorio de la partida)
// ---------------------------------------------------------------------------
const LS_KEY = 'lr_session_v2'
export const localSession = {
  get(): string | null { try { return localStorage.getItem(LS_KEY) } catch { return null } },
  set(id: string) { try { localStorage.setItem(LS_KEY, id) } catch { /* modo privado */ } },
  clear() { try { localStorage.removeItem(LS_KEY) } catch { /* noop */ } },
}

export function newSessionId(): string {
  const c: Crypto = globalThis.crypto
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  const b = c.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
