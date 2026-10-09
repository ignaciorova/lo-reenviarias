// Genera supabase/migrations/20261009000200_seed_instrument.sql a partir de supabase/seed/instrument.json
// Uso: node scripts/gen-seed-sql.mjs
import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../supabase/seed/instrument.json", import.meta.url), "utf8"));
const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => `array[${a.map(q).join(",")}]::text[]`;
const json = (o) => `${q(JSON.stringify(o))}::jsonb`;

let sql = `-- 0002: catálogo del instrumento (generado por scripts/gen-seed-sql.mjs; no editar a mano)
-- Inserta versiones 1.0.0 (original, cerrada) y 2.0.0 (activa). ON CONFLICT DO NOTHING: no sobrescribe cambios posteriores.
`;
for (const v of data.versions) {
  sql += `
insert into public.studies (code, version, title, description, status, config, changelog)
values (${q(data.study_code)}, ${q(v.version)}, ${q(v.title)}, ${q(v.description)}, ${q(v.status)}, ${json(v.config)}, ${q(v.changelog)})
on conflict (code, version) do nothing;
`;
  for (const qu of data.questions) {
    sql += `insert into public.survey_questions (study_id, question_key, phase, kind, prompt, options, position, min_length, max_length)
select id, ${q(qu.key)}, ${q(qu.phase)}, ${q(qu.kind)}, ${q(qu.prompt)}, ${arr(qu.options)}, ${qu.position}, ${qu.min_length ?? 0}, ${qu.max_length ?? 120}
from public.studies where code = ${q(data.study_code)} and version = ${q(v.version)}
on conflict (study_id, question_key) do nothing;
`;
  }
  for (const it of data.items) {
    sql += `insert into public.news_items (study_id, item_key, headline, is_real, category, source_name, source_url, source_published_on, explanation, hint, red_flags, display, validation_status, validation_notes)
select id, ${q(it.key)}, ${q(it.headline)}, ${it.real}, ${q(it.category)}, ${q(it.source_name)}, ${q(it.source_url)}, ${it.source_date ? q(it.source_date) + "::date" : "null"}, ${q(it.explanation)}, ${q(it.hint)}, ${arr(it.flags)}, ${json(it.display)}, ${q(it.validation_status)}, ${q(it.validation_notes)}
from public.studies where code = ${q(data.study_code)} and version = ${q(v.version)}
on conflict (study_id, item_key) do nothing;
`;
  }
}
writeFileSync(new URL("../supabase/migrations/20261009000200_seed_instrument.sql", import.meta.url), sql);
console.log("ok", sql.length, "bytes");
