/** Listas de apodos de la tabla de puntuación. Deben coincidir con public._alias (migración 20261010000300). */
export const ANIMALS = ['Búho 🦉', 'Jaguar 🐆', 'Perezoso 🦥', 'Lapa 🦜', 'Tortuga 🐢', 'Mono 🐒', 'Rana 🐸', 'Delfín 🐬', 'Ballena 🐋', 'Mariposa 🦋',
  'Cocodrilo 🐊', 'Zorro 🦊', 'Pulpo 🐙', 'Abeja 🐝', 'Tiburón 🦈', 'Mapache 🦝', 'Iguana 🦎', 'Colibrí 🐦', 'Murciélago 🦇', 'Puma 🐈'] as const
// Adjetivos que sirven igual en masculino y femenino («Tortuga Veloz», «Jaguar Veloz»)
export const ADJECTIVES = ['Veloz', 'Audaz', 'Sagaz', 'Implacable', 'Imparable', 'Valiente', 'Inteligente', 'Paciente', 'Brillante', 'Genial',
  'Tenaz', 'Alerta', 'Incansable', 'Infalible', 'Ágil', 'Elegante', 'Prudente', 'Leal', 'Capaz', 'Detective'] as const

export type AliasPick = { animal: number; adj: number; num: number }

export function aliasText({ animal, adj, num }: AliasPick): string {
  const [name, emoji] = ANIMALS[animal].split(' ')
  return `${name} ${ADJECTIVES[adj]} ${String(num).padStart(2, '0')} ${emoji}`
}

export function randomAlias(rand: () => number = Math.random): AliasPick {
  return { animal: Math.floor(rand() * ANIMALS.length), adj: Math.floor(rand() * ADJECTIVES.length), num: Math.floor(rand() * 100) }
}
