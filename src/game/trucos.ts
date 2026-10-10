/**
 * Repaso final (prototipo en el sandbox): los trucos que usan las noticias falsas del juego, explicados.
 * Para cada truco: por qué funciona en nuestra cabeza y cómo pillarlo en pocos segundos.
 * Para cada noticia falsa se indica, por truco, qué frases del titular se resaltan para que el jugador vea dónde estaba.
 * Una lista vacía significa que el truco es una ausencia (por ejemplo, que nadie firma la noticia).
 */
export type Truco = { id: string; emoji: string; nombre: string; porQue: string; comoPillarlo: string }

export const TRUCOS: Record<string, Truco> = {
  urgencia: {
    id: 'urgencia', emoji: '⏰', nombre: 'La prisa',
    porQue: 'Cuando algo parece urgente, reaccionamos antes de pensar. Por eso los bulos gritan «URGENTE» o ponen una fecha muy cercana: quieren que lo compartas antes de dudar.',
    comoPillarlo: 'Si un mensaje te apura, frena. Espera un minuto y busca la frase exacta en Google antes de reenviar.',
  },
  pasalo: {
    id: 'pasalo', emoji: '📢', nombre: '«¡Pásalo!»',
    porQue: 'Las instituciones publican en sus sitios y redes oficiales, no en cadenas de WhatsApp. Pedirte que lo reenvíes es justo lo que hace que un bulo llegue lejos.',
    comoPillarlo: 'Busca el comunicado en la página oficial (Banco Central, CCSS, MEP). Si no está ahí, no existe.',
  },
  sin_fuente: {
    id: 'sin_fuente', emoji: '🤷', nombre: 'Nadie lo firma',
    porQue: 'Sin un medio o una institución que dé la cara, nadie responde si es falso. Los bulos se apoyan en «dicen que…» o en quien te lo mandó.',
    comoPillarlo: 'Pregúntate «¿quién lo dice?». Si no hay nombre ni enlace a un medio conocido, trátalo como rumor.',
  },
  miedo: {
    id: 'miedo', emoji: '😨', nombre: 'El miedo',
    porQue: 'Con la salud o el dinero de por medio compartimos «por si acaso», para proteger a los nuestros. El miedo apaga la duda.',
    comoPillarlo: 'Cuanto más miedo te dé un mensaje, más vale verificarlo. Llama a la institución o revisa su sitio antes de asustar a otros.',
  },
  media_verdad: {
    id: 'media_verdad', emoji: '🧩', nombre: 'Mitad verdad',
    porQue: 'Pegar un dato falso a un hecho real (el recorte a educación sí ocurrió) hace que lo falso se vea creíble. Es una de las técnicas que mejor funcionan.',
    comoPillarlo: 'Separa las piezas: ¿qué parte está confirmada en un medio y cuál no? Que una parte sea cierta no hace cierto lo demás.',
  },
  imposible: {
    id: 'imposible', emoji: '🌋', nombre: 'Demasiado grande para ser secreto',
    porQue: 'Un cambio histórico, como volver a tener ejército o legalizar algo en farmacias, estaría en todos los medios. Que solo te llegue por un chat ya es la pista.',
    comoPillarlo: 'Si fuera cierto, ¿por qué no sale en ningún noticiero? Búscalo en dos medios grandes antes de creerlo.',
  },
  polemico: {
    id: 'polemico', emoji: '🔥', nombre: 'Tema caliente',
    porQue: 'Los temas que dividen opiniones nos emocionan, a favor o en contra, y la emoción comparte primero y pregunta después.',
    comoPillarlo: 'Si sientes ganas de reenviarlo para darle la razón a alguien, es el momento de verificar.',
  },
  todo_falso: {
    id: 'todo_falso', emoji: '🙅', nombre: 'Desconfiar de todo',
    porQue: 'Rechazar una noticia real también es caer. Si dejamos de creer en todo, los bulos ganan igual: ya nadie sabe qué es cierto.',
    comoPillarlo: 'Busca el titular en dos medios conocidos. Si aparece con fecha y fuente, es real aunque suene increíble.',
  },
}

/** Trucos de cada noticia falsa y, para cada uno, las frases del titular donde se ve. Las reales que se rechazan cuentan como «todo_falso». */
export const TRUCOS_POR_NOTICIA: Record<string, Record<string, string[]>> = {
  f_sinpe: { urgencia: ['A partir del 1 de noviembre'], pasalo: ['¡Avísale a todos!'], sin_fuente: [] },
  f_ejercito: { urgencia: ['URGENTE'], imposible: ['volver a crear el ejército'], sin_fuente: [] },
  f_marihuana: { polemico: ['marihuana recreativa'], imposible: ['será legal', 'en farmacias'], sin_fuente: [] },
  f_ccss: { miedo: ['dejará de atender emergencias'], pasalo: ['¡Pásalo!'], urgencia: ['desde enero'] },
  f_ingles: { media_verdad: ['Por el recorte de presupuesto'], sin_fuente: [] },
}

export type Resultado = { key: string; headline: string; isReal: boolean; correct: boolean; thumb?: string }

/**
 * Los trucos en los que cayó el jugador, ordenados por cuántas veces le funcionaron (máximo 3).
 * Si no cayó en ninguno, devuelve los que esquivó, para que el repaso nunca quede vacío.
 */
export function repaso(resultados: Resultado[]): { cayo: boolean; items: { truco: Truco; ejemplos: Resultado[] }[] } {
  const fallos = resultados.filter((r) => !r.correct)
  const fuente = fallos.length > 0 ? fallos : resultados.filter((r) => !r.isReal)
  const porTruco = new Map<string, Resultado[]>()
  for (const r of fuente) {
    const ids = r.isReal ? ['todo_falso'] : Object.keys(TRUCOS_POR_NOTICIA[r.key] ?? {})
    for (const id of ids) porTruco.set(id, [...(porTruco.get(id) ?? []), r])
  }
  const items = [...porTruco.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
    // Primero el ejemplo donde el truco se ve en el titular
    .map(([id, ejemplos]) => ({ truco: TRUCOS[id], ejemplos: [...ejemplos].sort((a, b) => marcasDe(b.key, id).length - marcasDe(a.key, id).length) }))
  return { cayo: fallos.length > 0, items }
}

export const marcasDe = (key: string, truco: string) => TRUCOS_POR_NOTICIA[key]?.[truco] ?? []

/** Parte el titular en trozos para resaltar las frases donde está el truco. */
export function resaltar(headline: string, key: string, truco: string): { text: string; mark: boolean }[] {
  let parts: { text: string; mark: boolean }[] = [{ text: headline, mark: false }]
  for (const m of marcasDe(key, truco)) {
    parts = parts.flatMap((p) => {
      if (p.mark || !p.text.includes(m)) return [p]
      const [a, ...rest] = p.text.split(m)
      return [{ text: a, mark: false }, { text: m, mark: true }, { text: rest.join(m), mark: false }].filter((x) => x.text)
    })
  }
  return parts
}
