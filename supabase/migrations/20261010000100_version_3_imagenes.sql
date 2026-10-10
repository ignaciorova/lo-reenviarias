-- Versión 3.0.0: «noticias ilustradas». Mismos textos, preguntas, tiempo, pistas y puntuación que la 2.0.0;
-- cada noticia muestra además una imagen o un clip corto sin sonido dentro de un marco de WhatsApp, Facebook o TikTok.
-- Se crea en estado 'draft': no la ve ningún participante hasta activarla (ver docs/despliegue-v3.md).
-- Los archivos están en public/media/v3/ y se sirven desde el mismo dominio.

insert into public.studies (code, version, title, description, status, config, changelog)
select code, '3.0.0', '¿Lo reenviarías? — noticias ilustradas',
       'Mismas 10 noticias, preguntas y reglas que la 2.0.0, con una imagen o clip por noticia. Imágenes generadas con IA (Canva) o dibujadas para el juego, todas con la misma etiqueta «Imagen ilustrativa · juego académico»; logos de marcas e instituciones difuminados.',
       'draft', config,
       'Metodológico: se añade un medio visual por noticia (8 imágenes y 2 clips; 5 reales y 5 falsas, un clip en cada grupo). Las observaciones no deben agregarse con las de 2.0.0 sin justificación, porque las imágenes pueden cambiar la credibilidad percibida.'
from public.studies where code = 'lo-reenviarias' and version = '2.0.0'
on conflict (code, version) do nothing;

insert into public.survey_questions (study_id, question_key, phase, kind, prompt, options, required, position, min_length, max_length)
select v3.id, q.question_key, q.phase, q.kind, q.prompt, q.options, q.required, q.position, q.min_length, q.max_length
from public.survey_questions q
join public.studies v2 on v2.id = q.study_id and v2.code = 'lo-reenviarias' and v2.version = '2.0.0'
join public.studies v3 on v3.code = 'lo-reenviarias' and v3.version = '3.0.0'
on conflict (study_id, question_key) do nothing;

with media(m) as (select '{
  "r_bus": {
    "kind": "image",
    "src": "/media/v3/bus.jpg",
    "alt": "Foto: personas caminando hacia un bus blanco y verde junto a un cartón escrito a mano que dice que el pasaje pasa de ₡260 a ₡1.000",
    "frame": "whatsapp",
    "credit": "Imagen ilustrativa · juego académico",
    "focus": "20% 50%"
  },
  "f_sinpe": {
    "kind": "image",
    "src": "/media/v3/sinpe.svg",
    "alt": "Imagen con aspecto de comunicado oficial que anuncia un cobro de ₡150 por transferencia y pide compartirla",
    "credit": "Imagen ilustrativa · juego académico",
    "frame": "whatsapp"
  },
  "r_cuba": {
    "kind": "video",
    "src": "/media/v3/cuba.mp4",
    "webm": "/media/v3/cuba.webm",
    "poster": "/media/v3/cuba-poster.jpg",
    "alt": "Clip corto sin sonido: una embajada con el portón cerrado con candado, un aviso pegado en la reja y el asta sin bandera",
    "frame": "tiktok",
    "credit": "Imagen ilustrativa · juego académico"
  },
  "f_ejercito": {
    "kind": "image",
    "src": "/media/v3/plenario.jpg",
    "alt": "Foto del plenario vacío de la Asamblea Legislativa de Costa Rica",
    "frame": "facebook",
    "credit": "Imagen ilustrativa · juego académico"
  },
  "r_arancel": {
    "kind": "image",
    "src": "/media/v3/puerto.jpg",
    "alt": "Foto: patio de contenedores de un puerto caribeño bajo la lluvia, con grúas azules y un barco cargado",
    "frame": "facebook",
    "credit": "Imagen ilustrativa · juego académico"
  },
  "f_marihuana": {
    "kind": "image",
    "src": "/media/v3/farmacia.jpg",
    "alt": "Foto: mostrador de una farmacia con estantes llenos de frascos y cajas de medicamentos",
    "frame": "whatsapp",
    "credit": "Imagen ilustrativa · juego académico"
  },
  "r_hermano": {
    "kind": "image",
    "src": "/media/v3/oficina.jpg",
    "alt": "Foto: escritorio de una oficina pública con expedientes, un sello y la bandera de Costa Rica al fondo",
    "frame": "whatsapp",
    "credit": "Imagen ilustrativa · juego académico"
  },
  "f_ccss": {
    "kind": "video",
    "src": "/media/v3/emergencias.mp4",
    "webm": "/media/v3/emergencias.webm",
    "poster": "/media/v3/emergencias-poster.jpg",
    "alt": "Clip corto sin sonido: entrada de una sala de emergencias de noche, con una ambulancia estacionada bajo la lluvia",
    "frame": "tiktok",
    "credit": "Imagen ilustrativa · juego académico"
  },
  "r_recorte": {
    "kind": "image",
    "src": "/media/v3/comedor.jpg",
    "alt": "Foto: comedor escolar con una cocinera sirviendo arroz, frijoles y verduras en bandejas",
    "frame": "facebook",
    "credit": "Imagen ilustrativa · juego académico"
  },
  "f_ingles": {
    "kind": "image",
    "src": "/media/v3/aula.jpg",
    "alt": "Foto: aula de escuela vacía con pupitres de madera y una pizarra con una lección de inglés",
    "frame": "facebook",
    "credit": "Imagen ilustrativa · juego académico"
  }
}'::jsonb)
insert into public.news_items (study_id, item_key, item_version, headline, body_text, is_real, category, source_name, source_url,
                               source_published_on, explanation, hint, red_flags, display, validation_status, validation_notes)
select v3.id, n.item_key, n.item_version, n.headline, n.body_text, n.is_real, n.category, n.source_name, n.source_url,
       n.source_published_on, n.explanation, n.hint, n.red_flags,
       n.display || jsonb_build_object('media', media.m -> n.item_key),
       n.validation_status, n.validation_notes
from public.news_items n
join public.studies v2 on v2.id = n.study_id and v2.code = 'lo-reenviarias' and v2.version = '2.0.0'
join public.studies v3 on v3.code = 'lo-reenviarias' and v3.version = '3.0.0'
cross join media
where media.m ? n.item_key
on conflict (study_id, item_key) do nothing;

-- Comprobación: la 3.0.0 debe quedar con las 10 noticias, todas con medio, y las mismas preguntas que la 2.0.0.
do $$
declare v3 uuid; n_items int; n_media int; n_q2 int; n_q3 int;
begin
  select id into v3 from public.studies where code = 'lo-reenviarias' and version = '3.0.0';
  select count(*), count(*) filter (where display ? 'media') into n_items, n_media from public.news_items where study_id = v3;
  select count(*) into n_q3 from public.survey_questions where study_id = v3;
  select count(*) into n_q2 from public.survey_questions q join public.studies s on s.id = q.study_id where s.code = 'lo-reenviarias' and s.version = '2.0.0';
  if n_items <> 10 or n_media <> 10 or n_q3 <> n_q2 then
    raise exception 'Versión 3.0.0 incompleta: % noticias, % con medio, % de % preguntas', n_items, n_media, n_q3, n_q2;
  end if;
end $$;
