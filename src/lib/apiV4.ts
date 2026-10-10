import { z } from 'zod'
import { deviceClass, rpc, Question } from './api'
import { STUDY_CODE } from './supabase'

// ---------------------------------------------------------------------------
// Versión 4.0.0 «responsabilidad antes de compartir»
// ---------------------------------------------------------------------------
export const StudyInfo = z.object({
  active: z.boolean(),
  version: z.string().optional(),
  mode: z.string().optional(),
  items: z.number().optional(),
  survey_url: z.string().nullable().optional(),
  survey_code_entry: z.string().nullable().optional(),
})

const Display = z.object({
  who: z.string(), many: z.boolean(), band: z.string(), bg: z.string(), emo: z.string(), emo2: z.string(),
}).passthrough()

export const SourceKind = z.enum(['oficial', 'medio', 'comentarios'])
export const ItemV4 = z.object({
  position: z.number().int(),
  item_id: z.string().uuid(),
  headline: z.string(),
  body_text: z.string().nullable().optional(),
  display: Display,
  image_shown: z.boolean(),
  ask_why: z.boolean(),
  sources: z.array(z.object({ kind: SourceKind, label: z.string() })),
})

export const Action = z.enum(['reenviar', 'reenviar_aviso', 'no_reenviar', 'verificar'])
export const FinalAction = z.enum(['reenviar', 'reenviar_aviso', 'no_reenviar'])
export const Belief = z.enum(['si', 'no', 'no_se'])
export const Evaluation = z.enum(['confirma', 'desmiente', 'nada_claro'])

export const CardFeedback = z.object({
  position: z.number(),
  item_id: z.string(),
  state: z.enum(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7']),
  timed_out: z.boolean(),
  first_action: Action.nullable(),
  final_action: FinalAction.nullable(),
  belief: Belief.nullable(),
  belief_correct: z.boolean().nullable(),
  points: z.number(),
  total_score: z.number(),
  is_real: z.boolean(),
  explanation: z.string(),
  red_flags: z.array(z.string()),
  source_kind: SourceKind.nullable(),
  evaluation: Evaluation.nullable(),
  evaluation_correct: z.boolean().nullable(),
  source_says: Evaluation.nullable(),
  effective_verification: z.boolean(),
})

export const SummaryV4 = z.object({
  correct_count: z.number(), decisions_count: z.number(), score: z.number().nullable(),
  percentile: z.number().nullable(), percentile_n: z.number(),
  counts: z.object({
    shared_unverified: z.number(), not_shared_unverified: z.number(), verified: z.number(), verified_effective: z.number(),
    with_warning: z.number(), no_se: z.number(), timed_out: z.number(),
  }),
  recap: z.array(z.object({
    position: z.number(), headline: z.string(), is_real: z.boolean(), state: z.string(),
    belief: Belief.nullable(), belief_correct: z.boolean().nullable(), final_action: FinalAction.nullable(), verified: z.boolean(),
  })),
})

export const SessionV4 = z.object({
  session_id: z.string().uuid(),
  status: z.enum(['started', 'completed', 'abandoned']),
  mode: z.literal('responsabilidad'),
  instrument_version: z.string(),
  config: z.object({
    items_per_session: z.number(), seconds_per_item: z.number(), verify_seconds: z.number(), start_points: z.number(),
    leaderboard: z.boolean(), survey_url: z.string().nullable(), survey_code_entry: z.string().nullable(),
  }),
  survey_code: z.string().nullable(),
  entry_origin: z.string().nullable(),
  survey_intent: z.string().nullable(),
  questions: z.array(Question),
  answered_phases: z.array(z.enum(['pre', 'post'])),
  items: z.array(ItemV4),
  cards: z.array(CardFeedback),
  summary: SummaryV4.nullable(),
})

export const OpenedSource = z.object({
  kind: SourceKind,
  label: z.string(),
  url: z.string().optional(),
  excerpt: z.string(),
  simulated: z.boolean().optional(),
  published: z.string().optional(),
  comments: z.array(z.object({ who: z.string(), text: z.string() })).optional(),
})

export type ItemV4T = z.infer<typeof ItemV4>
export type SessionV4T = z.infer<typeof SessionV4>
export type CardFeedbackT = z.infer<typeof CardFeedback>
export type SummaryV4T = z.infer<typeof SummaryV4>
export type OpenedSourceT = z.infer<typeof OpenedSource>
export type ActionT = z.infer<typeof Action>
export type FinalActionT = z.infer<typeof FinalAction>
export type BeliefT = z.infer<typeof Belief>
export type EvaluationT = z.infer<typeof Evaluation>
export type SourceKindT = z.infer<typeof SourceKind>
export type StudyInfoT = z.infer<typeof StudyInfo>
export type SurveyIntent = 'antes' | 'ya_respondio' | 'despues' | 'no'

/** Lo que el teléfono envía al terminar una noticia (el servidor valida y calcula el estado y los puntos). */
export type CardInput = {
  first_action: ActionT | null
  first_action_ms: number
  source_kind?: SourceKindT | null
  read_ms?: number | null
  evaluation?: EvaluationT | null
  final_action?: FinalActionT | null
  verify_timed_out?: boolean
  belief?: BeliefT | null
  reason?: string | null
}

type Opt = { onRetry?: (n: number) => void }
export const apiV4 = {
  studyInfo: () => rpc('study_info', { p_study_code: STUDY_CODE }, StudyInfo, { retries: 2 }),
  startSession: (sessionId: string, reducedMotion: boolean, entry: { origin: string | null; intent: SurveyIntent | null; code: string | null; replay: boolean }, o: Opt = {}) =>
    rpc('start_session_v4', {
      p_session_id: sessionId, p_consent: true, p_device_class: deviceClass(), p_reduced_motion: reducedMotion,
      p_entry_origin: entry.origin, p_survey_intent: entry.intent, p_survey_code: entry.code, p_study_code: STUDY_CODE,
      p_device_replay: entry.replay,
    }, SessionV4, o),
  submitPre: (sessionId: string, answers: Record<string, string>, o: Opt = {}) =>
    rpc('submit_survey', { p_session_id: sessionId, p_phase: 'pre', p_answers: answers }, z.object({ ok: z.boolean() }).passthrough(), o),
  getSession: (sessionId: string, o: Opt = {}) => rpc('get_session_v4', { p_session_id: sessionId }, SessionV4, { retries: 2, ...o }),
  setSurveyCode: (sessionId: string, code: string | null, intent: SurveyIntent | null) =>
    rpc('set_survey_code', { p_session_id: sessionId, p_code: code, p_survey_intent: intent }, z.object({ ok: z.boolean() }).passthrough(), { retries: 3 }),
  openSource: (sessionId: string, position: number, kind: SourceKindT, o: Opt = {}) =>
    rpc('open_source', { p_session_id: sessionId, p_position: position, p_kind: kind }, OpenedSource, o),
  submitCard: (sessionId: string, position: number, card: CardInput, o: Opt = {}) =>
    rpc('submit_card', { p_session_id: sessionId, p_position: position, p_card: card }, CardFeedback, o),
  completeSession: (sessionId: string, o: Opt = {}) => rpc('complete_session_v4', { p_session_id: sessionId }, SummaryV4, o),
}
