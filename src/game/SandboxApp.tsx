import { useEffect, useMemo, useState } from 'react'
import type { FeedbackT, ItemT, SessionPayloadT } from '../lib/api'
import { GameBoard, type BoardClient } from './GameBoard'
import type { Media } from './MediaFrame'
import { Logo, PrimaryButton } from './ui'

/*
 * SANDBOX de la versión 3.0.0 (noticias ilustradas). Solo existe en la rama claude/sandbox-noticias-ilustradas.
 * Todo ocurre en el navegador: no llama a Supabase y no guarda ninguna respuesta.
 * Textos, pistas y explicaciones copiados sin cambios del instrumento 2.0.0. Medios en public/sandbox/: imágenes generadas
 * con IA (Canva) con logos de marcas e instituciones difuminados, plenario aportado por el equipo (licencia por confirmar),
 * «comunicado» de SINPE dibujado en SVG.
 */
type Demo = { key: string; headline: string; isReal: boolean; display: ItemT['display']; media: Media; explanation: string; hint: string; redFlags: string[]; source: string | null }

const DEMO: Demo[] = [
  {
    key: 'r_bus', isReal: true,
    headline: 'El pasaje de una ruta de bus en Alajuela pasó de ₡260 a ₡1.000',
    display: { who: 'Vecina Lucía', many: true, band: 'INDIGNANTE', bg: 'linear-gradient(135deg,#00695C,#4DB6AC)', emo: '🚌', emo2: '💸' },
    media: { kind: 'image', src: '/sandbox/bus.jpg', alt: 'Foto: personas caminando hacia un bus blanco y verde junto a un cartón escrito a mano que dice que el pasaje pasa de ₡260 a ₡1.000', frame: 'whatsapp', credit: 'Imagen ilustrativa · juego académico', focus: '20% 50%' },
    explanation: 'Es real. La Teja lo publicó el 2 de octubre de 2026.', hint: 'Lo publicó La Teja el 2 de octubre de 2026.', redFlags: [], source: 'La Teja',
  },
  {
    key: 'f_sinpe', isReal: false,
    headline: 'A partir del 1 de noviembre SINPE Móvil cobrará ₡150 por cada transferencia. ¡Avísale a todos!',
    display: { who: 'Tía Marielos', many: true, band: '⚠️ ATENCIÓN', bg: 'linear-gradient(135deg,#C62828,#FF8A65)', emo: '📱', emo2: '💳' },
    media: { kind: 'image', src: '/sandbox/sinpe.svg', alt: 'Imagen con aspecto de comunicado oficial que anuncia un cobro de ₡150 por transferencia y pide compartirla', frame: 'whatsapp', credit: 'Imagen ilustrativa · juego académico' },
    explanation: 'Es inventada para este juego.', hint: 'El Banco Central no ha anunciado ningún cobro así.',
    redFlags: ['Pide reenviarlo a todos.', 'Fecha cercana para que reacciones sin pensar.', 'Ningún enlace ni comunicado oficial.'], source: null,
  },
  {
    key: 'r_cuba', isReal: true,
    headline: 'Costa Rica rompe relaciones diplomáticas con Cuba y ordena cerrar su embajada',
    display: { who: 'Mamá', many: false, band: 'INTERNACIONAL', bg: 'linear-gradient(135deg,#0B3D91,#CF142B)', emo: '🏛️', emo2: '✂️' },
    media: { kind: 'video', src: '/sandbox/cuba.mp4', webm: '/sandbox/cuba.webm', poster: '/sandbox/cuba-poster.jpg', alt: 'Clip corto sin sonido: una embajada con el portón cerrado con candado, un aviso pegado en la reja y el asta sin bandera', frame: 'tiktok', credit: 'Imagen ilustrativa · juego académico' },
    explanation: 'Es real. Sucedió el 18 de marzo de 2026.', hint: 'Se publicó en medios nacionales e internacionales en marzo de 2026.', redFlags: [], source: 'CBS News',
  },
  {
    key: 'f_ejercito', isReal: false,
    headline: 'URGENTE: la Asamblea Legislativa aprobó en primer debate volver a crear el ejército',
    display: { who: 'Tío Fernando', many: true, band: 'URGENTE', bg: 'linear-gradient(135deg,#33691E,#827717)', emo: '🪖', emo2: '🇨🇷' },
    media: { kind: 'image', src: '/sandbox/plenario.jpg', alt: 'Foto del plenario vacío de la Asamblea Legislativa de Costa Rica', frame: 'facebook', credit: 'Imagen ilustrativa · juego académico' },
    explanation: 'Es inventada para este juego.', hint: 'Abolir el ejército está en la Constitución; cambiarlo sería un hecho histórico con cobertura mundial.',
    redFlags: ['Mayúsculas y "URGENTE" para generar alarma.', 'Sería una reforma constitucional: imposible que pase en silencio.', 'No hay votación registrada ni medio que lo publique.'], source: null,
  },
  {
    key: 'r_arancel', isReal: true,
    headline: 'EE.UU. impone un arancel de 12,5% a Costa Rica por presunto trabajo forzoso en la cadena de suministro',
    display: { who: 'Tío Fernando', many: true, band: 'URGENTE', bg: 'linear-gradient(135deg,#1F3B73,#B22234)', emo: '📦', emo2: '⛓️' },
    media: { kind: 'image', src: '/sandbox/puerto.jpg', alt: 'Foto: patio de contenedores de un puerto caribeño bajo la lluvia, con grúas azules y un barco cargado', frame: 'facebook', credit: 'Imagen ilustrativa · juego académico' },
    explanation: 'Es real. Ocurrió el 24 de julio de 2026.', hint: 'La reportaron agencias internacionales y medios nacionales en julio de 2026.', redFlags: [], source: 'AP / medios internacionales',
  },
  {
    key: 'f_marihuana', isReal: false,
    headline: 'Desde noviembre será legal comprar marihuana recreativa en farmacias de Costa Rica',
    display: { who: 'Grupo U 🎓', many: false, band: 'NACIONAL', bg: 'linear-gradient(135deg,#2F7D32,#A5D6A7)', emo: '🌿', emo2: '💊' },
    media: { kind: 'image', src: '/sandbox/farmacia.jpg', alt: 'Foto: mostrador de una farmacia con estantes llenos de frascos y cajas de medicamentos', frame: 'whatsapp', credit: 'Imagen ilustrativa · juego académico' },
    explanation: 'Es inventada para este juego.', hint: 'Ningún medio la reporta y un cambio de ley así pasaría por la Asamblea con mucha cobertura.',
    redFlags: ['No dice quién lo anunció ni cita ninguna ley.', 'Un cambio de ley así sería noticia en todos los medios.', 'Toca un tema polémico para que reacciones rápido.'], source: null,
  },
  {
    key: 'r_hermano', isReal: true,
    headline: 'Hermano de un ministro obtuvo una mejora salarial de ₡2 millones gracias a un puesto en el Gobierno',
    display: { who: 'Don Rigo', many: true, band: 'ESCÁNDALO', bg: 'linear-gradient(135deg,#3E2723,#8D6E63)', emo: '💰', emo2: '🏛️' },
    media: { kind: 'image', src: '/sandbox/oficina.jpg', alt: 'Foto: escritorio de una oficina pública con expedientes, un sello y la bandera de Costa Rica al fondo', frame: 'whatsapp', credit: 'Imagen ilustrativa · juego académico' },
    explanation: 'Es real. CR Hoy lo publicó en octubre de 2026.', hint: 'Lo publicó CR Hoy a inicios de octubre de 2026.', redFlags: [], source: 'CR Hoy',
  },
  {
    key: 'f_ccss', isReal: false,
    headline: 'La CCSS dejará de atender emergencias a personas que no tengan el seguro al día desde enero. ¡Pásalo!',
    display: { who: 'Mamá', many: false, band: 'SALUD', bg: 'linear-gradient(135deg,#0277BD,#81D4FA)', emo: '🏥', emo2: '⛔' },
    media: { kind: 'video', src: '/sandbox/emergencias.mp4', webm: '/sandbox/emergencias.webm', poster: '/sandbox/emergencias-poster.jpg', alt: 'Clip corto sin sonido: entrada de una sala de emergencias de noche, con una ambulancia estacionada bajo la lluvia', frame: 'tiktok', credit: 'Imagen ilustrativa · juego académico' },
    explanation: 'Es inventada para este juego.', hint: 'No hay comunicado de la CCSS y la atención de emergencias está garantizada por ley.',
    redFlags: ['Pide "pásalo": las instituciones no comunican así.', 'Genera miedo sobre un tema de salud.', 'No hay comunicado oficial.'], source: null,
  },
  {
    key: 'r_recorte', isReal: true,
    headline: 'Gremios rechazan recorte de ₡19 mil millones a educación: alertan que afectaría becas y comedores escolares',
    display: { who: 'Profe Andrea', many: false, band: 'PRESUPUESTO', bg: 'linear-gradient(135deg,#4A148C,#9575CD)', emo: '✂️', emo2: '🍽️' },
    media: { kind: 'image', src: '/sandbox/comedor.jpg', alt: 'Foto: comedor escolar con una cocinera sirviendo arroz, frijoles y verduras en bandejas', frame: 'facebook', credit: 'Imagen ilustrativa · juego académico' },
    explanation: 'Es real. Diario Extra lo publicó el 4 de septiembre de 2026.', hint: 'Lo publicó Diario Extra el 4 de septiembre de 2026.', redFlags: [], source: 'Diario Extra',
  },
  {
    key: 'f_ingles', isReal: false,
    headline: 'Por el recorte de presupuesto, el MEP eliminará las clases de inglés en primaria a partir de 2027',
    display: { who: 'Profe Andrea', many: true, band: 'EDUCACIÓN', bg: 'linear-gradient(135deg,#F2994A,#F2C94C)', emo: '📚', emo2: '🚫' },
    media: { kind: 'image', src: '/sandbox/aula.jpg', alt: 'Foto: aula de escuela vacía con pupitres de madera y una pizarra con una lección de inglés', frame: 'facebook', credit: 'Imagen ilustrativa · juego académico' },
    explanation: 'Es inventada para este juego, pero se monta sobre una noticia real: el recorte al presupuesto de educación.', hint: 'El recorte sí es real, pero no hay ningún anuncio sobre eliminar el inglés.',
    redFlags: ['Mezcla un hecho real con uno falso: es la técnica más efectiva.', 'No cita comunicado del MEP.', 'Busca indignación.'], source: null,
  },
]

const SECONDS = 20
const HINTS = 2
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`

function payloadFor(withMedia: boolean): SessionPayloadT {
  return {
    session_id: uuid(99), status: 'started', instrument_version: '3.0.0-sandbox',
    config: { items_per_session: DEMO.length, seconds_per_item: SECONDS, hints_per_session: HINTS },
    hints_remaining: HINTS, hints_used: {}, questions: [], answered_phases: ['pre'], decisions: [], summary: null,
    items: DEMO.map((d, i) => ({ position: i + 1, item_id: uuid(i), headline: d.headline, display: withMedia ? { ...d.display, media: d.media } : d.display })),
  }
}

/** Misma regla de puntaje que el servidor (participant_api: submit_decision), calculada en el navegador. */
function localClient(): BoardClient & { reset: () => void; result: () => { total: number; correct: number } } {
  let total = 0, streak = 0, hints = HINTS, correctCount = 0
  const used = new Set<number>()
  return {
    reset() { total = 0; streak = 0; hints = HINTS; correctCount = 0; used.clear() },
    result: () => ({ total, correct: correctCount }),
    async useHint(_sid, position) {
      const dup = used.has(position)
      if (!dup) { used.add(position); hints -= 1 }
      return { position, hint: DEMO[position - 1].hint, hints_remaining: hints, duplicate: dup }
    },
    async submitDecision(_sid, position, choice, ms) {
      const d = DEMO[position - 1]
      const timedOut = choice === null
      const correct = !timedOut && (choice === 'real') === d.isReal
      streak = correct ? streak + 1 : 0
      let points = 0
      if (correct) {
        const speed = Math.max(0, Math.round(50 * (1 - ms / 1000 / SECONDS)))
        const mult = streak >= 2 ? Math.min(streak, 4) / 2 + 0.5 : 1
        points = Math.round((100 + speed) * mult)
        if (used.has(position)) points = Math.round(points * 0.8)
      }
      total += points
      if (correct) correctCount += 1
      const fb: FeedbackT = {
        position, item_id: uuid(position - 1), choice, timed_out: timedOut, is_correct: correct, is_real: d.isReal, hint_used: used.has(position),
        points_awarded: points, streak, total_score: total,
        simulated_reach: choice === 'real' && !d.isReal ? 900 + Math.floor(Math.random() * 4200) : 0,
        explanation: d.explanation, red_flags: d.redFlags, source_label: d.source ? `Fuente citada: ${d.source}` : null, crowd: null,
      }
      return fb
    },
  }
}

export default function SandboxApp() {
  const reduced = useMemo(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  const [stage, setStage] = useState<'intro' | 'game' | 'done'>('intro')
  const [withMedia, setWithMedia] = useState(true)
  const [round, setRound] = useState(0)
  const client = useMemo(() => localClient(), [])

  useEffect(() => {
    document.title = 'Sandbox · noticias ilustradas'
    const m = document.createElement('meta')
    m.name = 'robots'; m.content = 'noindex'
    document.head.appendChild(m)
    return () => m.remove()
  }, [])

  const start = (media: boolean) => { client.reset(); setWithMedia(media); setRound((r) => r + 1); setStage('game') }

  return (
    <div className="min-h-dvh bg-u3 text-white">
      <p role="note" className="pointer-events-none fixed top-1 left-1/2 z-30 -translate-x-1/2 rounded-full bg-gold px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-ink">SANDBOX · no se guarda nada</p>
      {stage === 'game' ? (
        <GameBoard key={round} payload={payloadFor(withMedia)} reducedMotion={reduced} client={client} onDone={() => setStage('done')} />
      ) : (
        <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center gap-4 px-5 py-8">
          <Logo tag="Sandbox" />
          <h1 className="font-display text-[34px] leading-none font-extrabold">{stage === 'done' ? '¿Cómo se sintió?' : 'Noticias ilustradas'}</h1>
          {stage === 'done' && (
            <p className="font-display text-xl font-extrabold text-gold">
              {withMedia ? 'Con imágenes' : 'Sin imágenes'}: {client.result().correct} de {DEMO.length} correctas · {client.result().total} puntos
            </p>
          )}
          <p className="text-[#E6DCEF]">
            {stage === 'done'
              ? (withMedia ? 'Prueba la misma ronda sin imágenes para comparar. Fíjate si la imagen te hizo dudar menos o decidir más rápido.' : 'Así se ve la versión actual. Prueba con imágenes para comparar.')
              : 'Las 10 noticias del juego presentadas como llegarían por WhatsApp, Facebook o TikTok, con los mismos textos, pistas y puntaje. Los clips no tienen sonido.'}
          </p>
          <PrimaryButton onClick={() => start(true)}>{stage === 'done' && withMedia ? 'Repetir con imágenes' : 'Jugar con imágenes'}</PrimaryButton>
          <PrimaryButton alt onClick={() => start(false)}>Jugar sin imágenes (versión actual)</PrimaryButton>
        </main>
      )}
    </div>
  )
}
