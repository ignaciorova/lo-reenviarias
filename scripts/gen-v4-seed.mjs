// Genera supabase/migrations/20261011000200_version_4_borrador.sql a partir de supabase/seed/noticias-v4.json.
// Crea la versión 4.0.0 en BORRADOR (no la ve nadie hasta activarla) con 10 noticias corregidas y sus fuentes.
// Uso: node scripts/gen-v4-seed.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const items = JSON.parse(readFileSync(new URL('../supabase/seed/noticias-v4.json', import.meta.url), 'utf8'))
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const arr = (a) => `array[${(a ?? []).map(q).join(',')}]::text[]`
const json = (v) => `${q(JSON.stringify(v))}::jsonb`

const real = items.filter((i) => i.real).length
if (items.length !== 10 || real !== 5) throw new Error(`Se esperaban 10 noticias (5 reales): hay ${items.length} (${real} reales)`)
for (const i of items) {
  const kinds = (i.consult ?? []).map((s) => s.kind).sort().join(',')
  if (kinds !== 'comentarios,medio,oficial') throw new Error(`${i.key}: faltan fuentes (${kinds})`)
}

const config = {
  mode: 'responsabilidad', items_per_session: 10, seconds_per_item: 20, verify_seconds: 60, min_read_ms: 2000,
  start_points: 600, image_share: 0.5, why_items: 2, hints_per_session: 0, show_crowd_feedback: false,
  leaderboard: true, percentile_min_n: 20, public_stats_min_n: 10, max_sessions_per_minute: 120,
}

const sources = (i) => i.consult.map((s) => {
  const o = { kind: s.kind, label: s.label ?? s.name, excerpt: s.excerpt, says: s.says, simulated: !!s.simulated }
  if (s.url) o.url = s.url
  if (s.published) o.published = s.published
  if (s.comments) o.comments = s.comments
  return o
})

let sql = `-- 0010: versión 4.0.0 en BORRADOR (generado por scripts/gen-v4-seed.mjs desde supabase/seed/noticias-v4.json; no editar a mano)
-- 10 noticias (5 reales, 5 falsas) con titulares corregidos y tres fuentes consultables cada una.
-- Las tarjetas del banco se actualizan (sube su revisión) y la versión copia esa revisión, igual que al armarla desde el panel.
-- Las imágenes son las mismas de la 3.x (display del banco). No se activa: eso lo hace el owner desde el panel.

insert into public.studies (code, version, title, description, status, config, changelog)
values ('lo-reenviarias', '4.0.0', '¿Lo reenviarías? — responsabilidad antes de compartir',
  'Cada noticia: reenviar, reenviar con aviso, verificar primero o no reenviar; si verifica, abre una fuente, dice qué dice y decide; después declara si la cree (Sí, No, No sé). Imagen al azar en la mitad de las tarjetas. Encuesta enlazada con código seudónimo opcional.',
  'draft', ${json(config)},
  'Metodológico: la variable principal pasa a ser la difusión simulada sin verificación previa (E1+E2 sobre R). La creencia se pregunta después de decidir y es lo único que da puntos. Titulares corregidos (r_cuba, r_arancel, f_sinpe y otros). Sin lupas ni alcance simulado. No comparable con 1.0.0–3.1.0.')
on conflict (code, version) do nothing;

insert into public.survey_questions (study_id, question_key, phase, kind, prompt, options, required, position, min_length, max_length)
select id, 'primera_vez', 'pre', 'single', '¿Es la primera vez que juegas este juego?', array['Sí, es la primera vez','No, ya había jugado']::text[], true, 1, 0, 120
from public.studies where code = 'lo-reenviarias' and version = '4.0.0'
on conflict (study_id, question_key) do nothing;
`

for (const i of items) {
  const d = i.dossier ?? {}
  const src = (d.sources ?? []).find((s) => s.supports === 'confirma') ?? (d.sources ?? [])[0] ?? {}
  const status = d.status === 'verificada' ? 'verificada' : d.status === 'ficticia_documentada' ? 'ficticia_documentada' : 'pendiente'
  const notes = d.notes ?? null
  const label = i.real ? `Fuente citada: ${src.outlet ?? 'medios nacionales'}` : 'Sin fuente'
  sql += `
-- ${i.key}
update public.news_bank set
  headline = ${q(i.headline)}, is_real = ${i.real}, category = ${q(i.category)},
  source_name = ${q(i.real ? src.outlet ?? null : null)}, source_url = ${q(i.real ? src.url ?? null : null)}, source_published_on = ${q(i.real ? src.published ?? null : null)},
  explanation = ${q(i.explanation)}, hint = ${q(i.hint)}, red_flags = ${arr(i.flags)},
  display = display || jsonb_build_object('src_label', ${q(label)}),
  validation_status = ${q(status)}, validation_notes = ${q(notes)},
  consult_sources = ${json(sources(i))},
  revision = revision + 1, updated_at = now()
where item_key = ${q(i.key)}
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = ${q(i.key)});
`
}

sql += `
insert into public.news_items (study_id, bank_id, item_key, item_version, headline, body_text, is_real, category, source_name, source_url,
                               source_published_on, explanation, hint, red_flags, display, validation_status, validation_notes, consult_sources)
select st.id, b.id, b.item_key, b.revision, b.headline, b.body_text, b.is_real, b.category, b.source_name, b.source_url,
       b.source_published_on, b.explanation, b.hint, b.red_flags, b.display, b.validation_status, b.validation_notes, b.consult_sources
  from public.news_bank b cross join public.studies st
 where st.code = 'lo-reenviarias' and st.version = '4.0.0'
   and b.item_key in (${items.map((i) => q(i.key)).join(', ')})
on conflict (study_id, item_key) do nothing;
`

writeFileSync(new URL('../supabase/migrations/20261011000200_version_4_borrador.sql', import.meta.url), sql)
console.log(`OK: ${items.length} noticias (${real} reales)`)
