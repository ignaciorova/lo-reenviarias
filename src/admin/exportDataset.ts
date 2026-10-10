import { supabase } from '../lib/supabase'
import type { AdminProfile } from './data'

/** Conjuntos que el servidor sabe exportar (lista cerrada en export_dataset). */
export type Dataset = 'sesiones' | 'decisiones' | 'abiertas' | 'v4_sesiones' | 'v4_decisiones'

/** Exportar requiere rol analyst u owner. */
export const canExport = (p: AdminProfile) => p.role === 'owner' || p.role === 'analyst'

export const VIEWER_EXPORT_NOTE = 'Tu rol (viewer) permite consultar el panel, pero no descargar datos. Las exportaciones requieren rol analyst u owner.'

/**
 * Pide las filas al servidor. export_dataset comprueba el rol, devuelve exactamente las filas pedidas y escribe
 * la auditoría (conjunto, filas contadas por el servidor, filtros, persona y hora) en la misma transacción:
 * no hay descarga sin registro.
 */
export async function exportDataset<T>(dataset: Dataset, opts: { sessionIds?: string[]; rowIds?: (string | number)[]; descripcion?: string; formato?: 'csv' | 'xlsx' | 'zip' } = {}): Promise<T[]> {
  const filters: Record<string, unknown> = {}
  if (opts.sessionIds) filters.session_ids = opts.sessionIds
  if (opts.rowIds) filters.row_ids = opts.rowIds.map(String)
  if (opts.descripcion) filters.descripcion = opts.descripcion.slice(0, 500)
  if (opts.formato) filters.formato = opts.formato
  const { data, error } = await supabase().rpc('export_dataset', { p_dataset: dataset, p_filters: filters })
  if (error) throw new Error(error.message.includes('forbidden') ? VIEWER_EXPORT_NOTE : 'No se pudo exportar. Inténtalo de nuevo.')
  return ((data as { rows: T[] }).rows ?? []) as T[]
}
