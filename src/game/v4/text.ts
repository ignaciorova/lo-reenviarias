import type { ActionT, BeliefT, EvaluationT, SourceKindT } from '../../lib/apiV4'

export const ACTION_LABEL: Record<ActionT, string> = {
  reenviar: 'Reenviar',
  reenviar_aviso: 'Reenviar con aviso',
  no_reenviar: 'No reenviar',
  verificar: 'Verificar primero',
}

export const STATE_TEXT: Record<string, string> = {
  E1: 'La reenviaste sin verificar.',
  E2: 'La reenviaste con aviso, sin verificar.',
  E3: 'No la reenviaste.',
  E4: 'La verificaste y la reenviaste.',
  E5: 'La verificaste y la reenviaste con aviso.',
  E6: 'La verificaste y no la reenviaste.',
  E7: 'Se acabó el tiempo antes de decidir.',
}

export const BELIEF_LABEL: Record<BeliefT, string> = { si: 'Sí, me la creo', no: 'No, no me la creo', no_se: 'No sé' }

export const SOURCE_KIND: Record<SourceKindT, { icon: string; name: string }> = {
  oficial: { icon: '🏛️', name: 'Fuente oficial' },
  medio: { icon: '📰', name: 'Medio de noticias' },
  comentarios: { icon: '💬', name: 'Comentarios en redes' },
}

export const EVAL_LABEL: Record<EvaluationT, string> = {
  confirma: 'La confirma',
  desmiente: 'La desmiente',
  nada_claro: 'No dice nada claro',
}

export const REASONS: { key: string; label: string }[] = [
  { key: 'parece_creible', label: 'Parece creíble' },
  { key: 'fuente_confiable', label: 'La fuente parece confiable' },
  { key: 'me_importa', label: 'El tema me importa' },
  { key: 'no_estoy_seguro', label: 'No estoy seguro/a' },
  { key: 'parece_exagerada', label: 'Parece exagerada' },
  { key: 'sin_fuente', label: 'No tiene fuente' },
  { key: 'otro', label: 'Otra razón' },
]
