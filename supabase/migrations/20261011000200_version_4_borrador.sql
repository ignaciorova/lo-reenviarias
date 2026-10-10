-- 0010: versión 4.0.0 en BORRADOR (generado por scripts/gen-v4-seed.mjs desde supabase/seed/noticias-v4.json; no editar a mano)
-- 10 noticias (5 reales, 5 falsas) con titulares corregidos y tres fuentes consultables cada una.
-- Las tarjetas del banco se actualizan (sube su revisión) y la versión copia esa revisión, igual que al armarla desde el panel.
-- Las imágenes son las mismas de la 3.x (display del banco). No se activa: eso lo hace el owner desde el panel.

insert into public.studies (code, version, title, description, status, config, changelog)
values ('lo-reenviarias', '4.0.0', '¿Lo reenviarías? — responsabilidad antes de compartir',
  'Cada noticia: reenviar, reenviar con aviso, verificar primero o no reenviar; si verifica, abre una fuente, dice qué dice y decide; después declara si la cree (Sí, No, No sé). Imagen al azar en la mitad de las tarjetas. Encuesta enlazada con código seudónimo opcional.',
  'draft', '{"mode":"responsabilidad","items_per_session":10,"seconds_per_item":20,"verify_seconds":60,"min_read_ms":2000,"start_points":600,"image_share":0.5,"why_items":2,"hints_per_session":0,"show_crowd_feedback":false,"leaderboard":true,"percentile_min_n":20,"public_stats_min_n":10,"max_sessions_per_minute":120}'::jsonb,
  'Metodológico: la variable principal pasa a ser la difusión simulada sin verificación previa (E1+E2 sobre R). La creencia se pregunta después de decidir y es lo único que da puntos. Titulares corregidos (r_cuba, r_arancel, f_sinpe y otros). Sin lupas ni alcance simulado. No comparable con 1.0.0–3.1.0.')
on conflict (code, version) do nothing;

insert into public.survey_questions (study_id, question_key, phase, kind, prompt, options, required, position, min_length, max_length)
select id, 'primera_vez', 'pre', 'single', '¿Es la primera vez que juegas este juego?', array['Sí, es la primera vez','No, ya había jugado']::text[], true, 1, 0, 120
from public.studies where code = 'lo-reenviarias' and version = '4.0.0'
on conflict (study_id, question_key) do nothing;

-- r_arancel
update public.news_bank set
  headline = 'EE.UU. impone un arancel de 12,5% a Costa Rica por presunto trabajo forzoso en la cadena de suministro', is_real = true, category = 'Economía y comercio',
  source_name = 'La República (CR)', source_url = 'https://www.larepublica.net/noticia/ee-uu-cobrara-125-de-aranceles-a-exportaciones-ticas', source_published_on = '2026-07-23',
  explanation = 'Es real. Ocurrió el 24 de julio de 2026.', hint = 'La reportaron agencias internacionales y medios nacionales en julio de 2026.', red_flags = array[]::text[],
  display = display || jsonb_build_object('src_label', 'Fuente citada: La República (CR)'),
  validation_status = 'pendiente', validation_notes = 'PROVISIONAL (desarrollo): reemplazar por el expediente verificado.',
  consult_sources = '[{"kind":"oficial","label":"Comunicado oficial","excerpt":"Texto provisional de la fuente oficial para pruebas del flujo.","says":"confirma","simulated":false},{"kind":"medio","label":"Medio nacional","excerpt":"Texto provisional del medio para pruebas del flujo.","says":"confirma","simulated":false},{"kind":"comentarios","label":"Comentarios en redes","excerpt":"Opiniones de personas en redes sociales (simuladas).","says":"nada_claro","simulated":true,"comments":[{"who":"Usuario 1","text":"Yo lo vi en otro grupo"},{"who":"Usuario 2","text":"¿Alguien tiene la fuente?"}]}]'::jsonb,
  revision = revision + 1, updated_at = now()
where item_key = 'r_arancel'
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = 'r_arancel');

-- f_marihuana
update public.news_bank set
  headline = 'Desde noviembre será legal comprar marihuana recreativa en farmacias de Costa Rica', is_real = false, category = 'Política nacional',
  source_name = null, source_url = null, source_published_on = null,
  explanation = 'Es inventada para este juego.', hint = 'Ningún medio la reporta y un cambio de ley así pasaría por la Asamblea con mucha cobertura.', red_flags = array['No dice quién lo anunció ni cita ninguna ley.','Un cambio de ley así sería noticia en todos los medios.','Toca un tema polémico para que reacciones rápido.']::text[],
  display = display || jsonb_build_object('src_label', 'Sin fuente'),
  validation_status = 'pendiente', validation_notes = 'PROVISIONAL (desarrollo): reemplazar por el expediente verificado.',
  consult_sources = '[{"kind":"oficial","label":"Comunicado oficial","excerpt":"Texto provisional de la fuente oficial para pruebas del flujo.","says":"desmiente","simulated":false},{"kind":"medio","label":"Medio nacional","excerpt":"Texto provisional del medio para pruebas del flujo.","says":"desmiente","simulated":false},{"kind":"comentarios","label":"Comentarios en redes","excerpt":"Opiniones de personas en redes sociales (simuladas).","says":"nada_claro","simulated":true,"comments":[{"who":"Usuario 1","text":"Yo lo vi en otro grupo"},{"who":"Usuario 2","text":"¿Alguien tiene la fuente?"}]}]'::jsonb,
  revision = revision + 1, updated_at = now()
where item_key = 'f_marihuana'
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = 'f_marihuana');

-- r_cuba
update public.news_bank set
  headline = 'Costa Rica rompe relaciones diplomáticas con Cuba y ordena cerrar su embajada', is_real = true, category = 'Política internacional',
  source_name = 'ADN40 / Reuters (18/03/2026)', source_url = 'https://www.adn40.mx/internacional/2026-03-18/costa-rica-cierra-su-embajada-en-cuba-la-habana-apunta-a-presiones-trump', source_published_on = '2026-03-18',
  explanation = 'Es real. Sucedió el 18 de marzo de 2026.', hint = 'Se publicó en medios nacionales e internacionales en marzo de 2026.', red_flags = array[]::text[],
  display = display || jsonb_build_object('src_label', 'Fuente citada: ADN40 / Reuters (18/03/2026)'),
  validation_status = 'pendiente', validation_notes = 'PROVISIONAL (desarrollo): reemplazar por el expediente verificado.',
  consult_sources = '[{"kind":"oficial","label":"Comunicado oficial","excerpt":"Texto provisional de la fuente oficial para pruebas del flujo.","says":"confirma","simulated":false},{"kind":"medio","label":"Medio nacional","excerpt":"Texto provisional del medio para pruebas del flujo.","says":"confirma","simulated":false},{"kind":"comentarios","label":"Comentarios en redes","excerpt":"Opiniones de personas en redes sociales (simuladas).","says":"nada_claro","simulated":true,"comments":[{"who":"Usuario 1","text":"Yo lo vi en otro grupo"},{"who":"Usuario 2","text":"¿Alguien tiene la fuente?"}]}]'::jsonb,
  revision = revision + 1, updated_at = now()
where item_key = 'r_cuba'
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = 'r_cuba');

-- f_ingles
update public.news_bank set
  headline = 'Por el recorte de presupuesto, el MEP eliminará las clases de inglés en primaria a partir de 2027', is_real = false, category = 'Educación',
  source_name = null, source_url = null, source_published_on = null,
  explanation = 'Es inventada para este juego, pero se monta sobre una noticia real: el recorte al presupuesto de educación.', hint = 'El recorte sí es real, pero no hay ningún anuncio sobre eliminar el inglés.', red_flags = array['Mezcla un hecho real con uno falso: es la técnica más efectiva.','No cita comunicado del MEP.','Busca indignación.']::text[],
  display = display || jsonb_build_object('src_label', 'Sin fuente'),
  validation_status = 'pendiente', validation_notes = 'PROVISIONAL (desarrollo): reemplazar por el expediente verificado.',
  consult_sources = '[{"kind":"oficial","label":"Comunicado oficial","excerpt":"Texto provisional de la fuente oficial para pruebas del flujo.","says":"desmiente","simulated":false},{"kind":"medio","label":"Medio nacional","excerpt":"Texto provisional del medio para pruebas del flujo.","says":"desmiente","simulated":false},{"kind":"comentarios","label":"Comentarios en redes","excerpt":"Opiniones de personas en redes sociales (simuladas).","says":"nada_claro","simulated":true,"comments":[{"who":"Usuario 1","text":"Yo lo vi en otro grupo"},{"who":"Usuario 2","text":"¿Alguien tiene la fuente?"}]}]'::jsonb,
  revision = revision + 1, updated_at = now()
where item_key = 'f_ingles'
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = 'f_ingles');

-- r_hermano
update public.news_bank set
  headline = 'Hermano de un ministro obtuvo una mejora salarial de ₡2 millones gracias a un puesto en el Gobierno', is_real = true, category = 'Función pública',
  source_name = 'CR Hoy (03/10/2026)', source_url = 'https://crhoy.com/nacionales/hermano-de-ministro-tuvo-mejora-salarial-de-₡2-millones-gracias-a-puesto-en-el-gobierno/', source_published_on = '2026-10-03',
  explanation = 'Es real. CR Hoy lo publicó en octubre de 2026.', hint = 'Lo publicó CR Hoy a inicios de octubre de 2026.', red_flags = array[]::text[],
  display = display || jsonb_build_object('src_label', 'Fuente citada: CR Hoy (03/10/2026)'),
  validation_status = 'pendiente', validation_notes = 'PROVISIONAL (desarrollo): reemplazar por el expediente verificado.',
  consult_sources = '[{"kind":"oficial","label":"Comunicado oficial","excerpt":"Texto provisional de la fuente oficial para pruebas del flujo.","says":"confirma","simulated":false},{"kind":"medio","label":"Medio nacional","excerpt":"Texto provisional del medio para pruebas del flujo.","says":"confirma","simulated":false},{"kind":"comentarios","label":"Comentarios en redes","excerpt":"Opiniones de personas en redes sociales (simuladas).","says":"nada_claro","simulated":true,"comments":[{"who":"Usuario 1","text":"Yo lo vi en otro grupo"},{"who":"Usuario 2","text":"¿Alguien tiene la fuente?"}]}]'::jsonb,
  revision = revision + 1, updated_at = now()
where item_key = 'r_hermano'
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = 'r_hermano');

-- f_ejercito
update public.news_bank set
  headline = 'URGENTE: la Asamblea Legislativa aprobó en primer debate volver a crear el ejército', is_real = false, category = 'Política nacional',
  source_name = null, source_url = null, source_published_on = null,
  explanation = 'Es inventada para este juego.', hint = 'Abolir el ejército está en la Constitución; cambiarlo sería un hecho histórico con cobertura mundial.', red_flags = array['Mayúsculas y "URGENTE" para generar alarma.','Sería una reforma constitucional: imposible que pase en silencio.','No hay votación registrada ni medio que lo publique.']::text[],
  display = display || jsonb_build_object('src_label', 'Sin fuente'),
  validation_status = 'pendiente', validation_notes = 'PROVISIONAL (desarrollo): reemplazar por el expediente verificado.',
  consult_sources = '[{"kind":"oficial","label":"Comunicado oficial","excerpt":"Texto provisional de la fuente oficial para pruebas del flujo.","says":"desmiente","simulated":false},{"kind":"medio","label":"Medio nacional","excerpt":"Texto provisional del medio para pruebas del flujo.","says":"desmiente","simulated":false},{"kind":"comentarios","label":"Comentarios en redes","excerpt":"Opiniones de personas en redes sociales (simuladas).","says":"nada_claro","simulated":true,"comments":[{"who":"Usuario 1","text":"Yo lo vi en otro grupo"},{"who":"Usuario 2","text":"¿Alguien tiene la fuente?"}]}]'::jsonb,
  revision = revision + 1, updated_at = now()
where item_key = 'f_ejercito'
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = 'f_ejercito');

-- r_bus
update public.news_bank set
  headline = 'El pasaje de una ruta de bus en Alajuela pasó de ₡260 a ₡1.000', is_real = true, category = 'Transporte y costo de vida',
  source_name = 'La Teja (07/10/2026)', source_url = 'https://www.lateja.cr/finanzas-y-tecnologia/bus-de-ruta-de-alajuela-amanecio-este-miercoles/PYIMWBYERVCPJMHNVS4ZA3DRWA/story/', source_published_on = '2026-10-07',
  explanation = 'Es real. La Teja lo publicó el 2 de octubre de 2026.', hint = 'Lo publicó La Teja el 2 de octubre de 2026.', red_flags = array[]::text[],
  display = display || jsonb_build_object('src_label', 'Fuente citada: La Teja (07/10/2026)'),
  validation_status = 'pendiente', validation_notes = 'PROVISIONAL (desarrollo): reemplazar por el expediente verificado.',
  consult_sources = '[{"kind":"oficial","label":"Comunicado oficial","excerpt":"Texto provisional de la fuente oficial para pruebas del flujo.","says":"confirma","simulated":false},{"kind":"medio","label":"Medio nacional","excerpt":"Texto provisional del medio para pruebas del flujo.","says":"confirma","simulated":false},{"kind":"comentarios","label":"Comentarios en redes","excerpt":"Opiniones de personas en redes sociales (simuladas).","says":"nada_claro","simulated":true,"comments":[{"who":"Usuario 1","text":"Yo lo vi en otro grupo"},{"who":"Usuario 2","text":"¿Alguien tiene la fuente?"}]}]'::jsonb,
  revision = revision + 1, updated_at = now()
where item_key = 'r_bus'
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = 'r_bus');

-- f_ccss
update public.news_bank set
  headline = 'La CCSS dejará de atender emergencias a personas que no tengan el seguro al día desde enero. ¡Pásalo!', is_real = false, category = 'Salud',
  source_name = null, source_url = null, source_published_on = null,
  explanation = 'Es inventada para este juego.', hint = 'No hay comunicado de la CCSS y la atención de emergencias está garantizada por ley.', red_flags = array['Pide "pásalo": las instituciones no comunican así.','Genera miedo sobre un tema de salud.','No hay comunicado oficial.']::text[],
  display = display || jsonb_build_object('src_label', 'Sin fuente'),
  validation_status = 'pendiente', validation_notes = 'PROVISIONAL (desarrollo): reemplazar por el expediente verificado.',
  consult_sources = '[{"kind":"oficial","label":"Comunicado oficial","excerpt":"Texto provisional de la fuente oficial para pruebas del flujo.","says":"desmiente","simulated":false},{"kind":"medio","label":"Medio nacional","excerpt":"Texto provisional del medio para pruebas del flujo.","says":"desmiente","simulated":false},{"kind":"comentarios","label":"Comentarios en redes","excerpt":"Opiniones de personas en redes sociales (simuladas).","says":"nada_claro","simulated":true,"comments":[{"who":"Usuario 1","text":"Yo lo vi en otro grupo"},{"who":"Usuario 2","text":"¿Alguien tiene la fuente?"}]}]'::jsonb,
  revision = revision + 1, updated_at = now()
where item_key = 'f_ccss'
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = 'f_ccss');

-- r_recorte
update public.news_bank set
  headline = 'Gremios rechazan recorte de ₡19 mil millones a educación: alertan que afectaría becas y comedores escolares', is_real = true, category = 'Educación',
  source_name = 'Diario Extra', source_url = 'https://www.diarioextra.com/videos/ecorte-presupuesto-educativo-costa-rica/', source_published_on = '2026-09-04',
  explanation = 'Es real. Diario Extra lo publicó el 4 de septiembre de 2026.', hint = 'Lo publicó Diario Extra el 4 de septiembre de 2026.', red_flags = array[]::text[],
  display = display || jsonb_build_object('src_label', 'Fuente citada: Diario Extra'),
  validation_status = 'pendiente', validation_notes = 'PROVISIONAL (desarrollo): reemplazar por el expediente verificado.',
  consult_sources = '[{"kind":"oficial","label":"Comunicado oficial","excerpt":"Texto provisional de la fuente oficial para pruebas del flujo.","says":"confirma","simulated":false},{"kind":"medio","label":"Medio nacional","excerpt":"Texto provisional del medio para pruebas del flujo.","says":"confirma","simulated":false},{"kind":"comentarios","label":"Comentarios en redes","excerpt":"Opiniones de personas en redes sociales (simuladas).","says":"nada_claro","simulated":true,"comments":[{"who":"Usuario 1","text":"Yo lo vi en otro grupo"},{"who":"Usuario 2","text":"¿Alguien tiene la fuente?"}]}]'::jsonb,
  revision = revision + 1, updated_at = now()
where item_key = 'r_recorte'
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = 'r_recorte');

-- f_sinpe
update public.news_bank set
  headline = 'A partir del 1 de noviembre SINPE Móvil cobrará ₡150 por cada transferencia. ¡Avísale a todos!', is_real = false, category = 'Finanzas personales',
  source_name = null, source_url = null, source_published_on = null,
  explanation = 'Es inventada para este juego.', hint = 'El Banco Central no ha anunciado ningún cobro así.', red_flags = array['Pide reenviarlo a todos.','Fecha cercana para que reacciones sin pensar.','Ningún enlace ni comunicado oficial.']::text[],
  display = display || jsonb_build_object('src_label', 'Sin fuente'),
  validation_status = 'pendiente', validation_notes = 'PROVISIONAL (desarrollo): reemplazar por el expediente verificado.',
  consult_sources = '[{"kind":"oficial","label":"Comunicado oficial","excerpt":"Texto provisional de la fuente oficial para pruebas del flujo.","says":"desmiente","simulated":false},{"kind":"medio","label":"Medio nacional","excerpt":"Texto provisional del medio para pruebas del flujo.","says":"desmiente","simulated":false},{"kind":"comentarios","label":"Comentarios en redes","excerpt":"Opiniones de personas en redes sociales (simuladas).","says":"nada_claro","simulated":true,"comments":[{"who":"Usuario 1","text":"Yo lo vi en otro grupo"},{"who":"Usuario 2","text":"¿Alguien tiene la fuente?"}]}]'::jsonb,
  revision = revision + 1, updated_at = now()
where item_key = 'f_sinpe'
  and not exists (select 1 from public.news_items n join public.studies s on s.id = n.study_id where s.version = '4.0.0' and n.item_key = 'f_sinpe');

insert into public.news_items (study_id, bank_id, item_key, item_version, headline, body_text, is_real, category, source_name, source_url,
                               source_published_on, explanation, hint, red_flags, display, validation_status, validation_notes, consult_sources)
select st.id, b.id, b.item_key, b.revision, b.headline, b.body_text, b.is_real, b.category, b.source_name, b.source_url,
       b.source_published_on, b.explanation, b.hint, b.red_flags, b.display, b.validation_status, b.validation_notes, b.consult_sources
  from public.news_bank b cross join public.studies st
 where st.code = 'lo-reenviarias' and st.version = '4.0.0'
   and b.item_key in ('r_arancel', 'f_marihuana', 'r_cuba', 'f_ingles', 'r_hermano', 'f_ejercito', 'r_bus', 'f_ccss', 'r_recorte', 'f_sinpe')
on conflict (study_id, item_key) do nothing;
