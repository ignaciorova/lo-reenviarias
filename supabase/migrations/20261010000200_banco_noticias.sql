-- ============================================================================
-- 0007: banco de noticias editable desde el panel y versiones armadas a partir de él
--
-- · news_bank guarda las tarjetas que el equipo crea o edita (texto, formato e imagen o clip).
--   Una tarjeta no pertenece a ninguna versión: se puede usar en varias.
-- · Al armar una versión se COPIAN las tarjetas elegidas a news_items (con su número de revisión).
--   Editar después una tarjeta del banco no cambia ninguna versión ya creada, y menos la activa.
-- · Las imágenes y clips subidos van al bucket público «noticias» de Supabase Storage; solo
--   analyst u owner pueden subir. Los archivos no se sobrescriben: cada subida tiene nombre nuevo.
-- · Crear borradores: analyst u owner. Activar (o volver a una versión cerrada): solo owner.
-- Sin DELETE ni DROP: un borrador que no sirve se archiva.
-- ============================================================================

create table if not exists public.news_bank (
  id                   uuid primary key default gen_random_uuid(),
  item_key             text not null unique check (item_key ~ '^[a-z0-9_]{2,40}$'),
  revision             integer not null default 1 check (revision > 0),
  headline             text not null check (char_length(headline) between 5 and 300),
  body_text            text,
  is_real              boolean not null,
  category             text not null check (char_length(category) between 2 and 60),
  source_name          text,
  source_url           text check (source_url is null or source_url ~ '^https://'),
  source_published_on  date,
  explanation          text not null check (char_length(explanation) between 3 and 600),
  hint                 text not null check (char_length(hint) between 3 and 400),
  red_flags            text[] not null default '{}',
  display              jsonb not null default '{}'::jsonb,
  validation_status    text not null default 'pendiente'
                       check (validation_status in ('pendiente','verificada','requiere_precision','requiere_correccion','ficticia_documentada')),
  validation_notes     text,
  archived             boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  updated_by           uuid
);
comment on table public.news_bank is 'Banco de tarjetas editables. Las versiones del instrumento copian de aquí; editar el banco no altera versiones existentes.';

alter table public.news_items add column if not exists bank_id uuid references public.news_bank(id) on delete restrict;
comment on column public.news_items.bank_id is 'Tarjeta del banco de la que se copió (item_version = revisión copiada). Nulo en versiones anteriores al banco.';

alter table public.news_bank enable row level security;
revoke all on public.news_bank from anon, authenticated, public;
grant select on public.news_bank to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'news_bank' and policyname = 'admin_read') then
    create policy admin_read on public.news_bank for select to authenticated using ((select public.is_admin('viewer')));
  end if;
end $$;

-- El banco arranca con las tarjetas de la versión más reciente (hoy la 3.0.0, con sus imágenes).
insert into public.news_bank (item_key, headline, body_text, is_real, category, source_name, source_url, source_published_on,
                              explanation, hint, red_flags, display, validation_status, validation_notes)
select n.item_key, n.headline, n.body_text, n.is_real, n.category, n.source_name, n.source_url, n.source_published_on,
       n.explanation, n.hint, n.red_flags, n.display, n.validation_status, n.validation_notes
from public.news_items n
where n.study_id = (select id from public.studies where code = 'lo-reenviarias'
                     order by string_to_array(version, '.')::int[] desc limit 1)
on conflict (item_key) do nothing;

-- ---------------------------------------------------------------------------
-- Validación del aspecto de la tarjeta (display). Solo claves conocidas y archivos propios.
-- ---------------------------------------------------------------------------
create or replace function public._check_display(d jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  m jsonb;
  k text;
  file_re constant text := '^(/media/[a-z0-9/_-]+\.(jpg|png|svg|webp|mp4|webm)|/storage/v1/object/public/noticias/[a-z0-9-]+\.(jpg|png|webp|mp4))$';
begin
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'display_invalido' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(d) loop
    if k not in ('who','many','band','bg','emo','emo2','src_label','media') then raise exception 'display_clave_desconocida: %', k using errcode = '22023'; end if;
  end loop;
  if jsonb_typeof(d->'who') <> 'string' or char_length(d->>'who') not between 1 and 40 then raise exception 'remitente_invalido' using errcode = '22023'; end if;
  if jsonb_typeof(d->'many') <> 'boolean' then raise exception 'reenviado_invalido' using errcode = '22023'; end if;
  if jsonb_typeof(d->'band') <> 'string' or char_length(d->>'band') not between 1 and 20 then raise exception 'banda_invalida' using errcode = '22023'; end if;
  if jsonb_typeof(d->'bg') <> 'string' or (d->>'bg') !~ '^linear-gradient\(135deg,#[0-9A-Fa-f]{6},#[0-9A-Fa-f]{6}\)$' then raise exception 'fondo_invalido' using errcode = '22023'; end if;
  if jsonb_typeof(d->'emo') <> 'string' or char_length(d->>'emo') not between 1 and 8
     or jsonb_typeof(d->'emo2') <> 'string' or char_length(d->>'emo2') not between 1 and 8 then raise exception 'emoji_invalido' using errcode = '22023'; end if;
  if d ? 'src_label' and (jsonb_typeof(d->'src_label') <> 'string' or char_length(d->>'src_label') > 80) then raise exception 'etiqueta_fuente_invalida' using errcode = '22023'; end if;

  m := d->'media';
  if m is null or jsonb_typeof(m) = 'null' then return; end if;
  if jsonb_typeof(m) <> 'object' then raise exception 'medio_invalido' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(m) loop
    if k not in ('kind','src','webm','poster','alt','credit','focus','frame') then raise exception 'medio_clave_desconocida: %', k using errcode = '22023'; end if;
  end loop;
  if coalesce(m->>'kind', '') not in ('image','video') then raise exception 'medio_tipo_invalido' using errcode = '22023'; end if;
  if coalesce(m->>'frame', '') not in ('whatsapp','facebook','tiktok') then raise exception 'medio_marco_invalido' using errcode = '22023'; end if;
  if coalesce(m->>'src', '') !~ file_re then raise exception 'medio_archivo_invalido' using errcode = '22023'; end if;
  if m ? 'webm' and coalesce(m->>'webm', '') !~ file_re then raise exception 'medio_archivo_invalido' using errcode = '22023'; end if;
  if m ? 'poster' and coalesce(m->>'poster', '') !~ file_re then raise exception 'medio_archivo_invalido' using errcode = '22023'; end if;
  if char_length(coalesce(m->>'alt', '')) not between 3 and 300 then raise exception 'medio_descripcion_invalida' using errcode = '22023'; end if;
  if m ? 'credit' and char_length(coalesce(m->>'credit', '')) > 80 then raise exception 'medio_credito_invalido' using errcode = '22023'; end if;
  if m ? 'focus' and coalesce(m->>'focus', '') !~ '^\d{1,3}% \d{1,3}%$' then raise exception 'medio_enfoque_invalido' using errcode = '22023'; end if;
end $$;
revoke all on function public._check_display(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Guardar una tarjeta (nueva si no trae id). Cada edición sube la revisión.
-- ---------------------------------------------------------------------------
create or replace function public.save_news_card(p_card jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_rev int;
  v_flags text[];
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_card is null or jsonb_typeof(p_card) <> 'object' or octet_length(p_card::text) > 16000 then raise exception 'tarjeta_invalida' using errcode = '22023'; end if;
  if jsonb_typeof(p_card->'is_real') <> 'boolean' then raise exception 'falta_real_o_falsa' using errcode = '22023'; end if;
  perform public._check_display(p_card->'display');
  select coalesce(array_agg(btrim(x)) filter (where btrim(x) <> ''), '{}') into v_flags
    from jsonb_array_elements_text(coalesce(p_card->'red_flags', '[]'::jsonb)) x;

  if nullif(p_card->>'id', '') is null then
    insert into public.news_bank (item_key, headline, body_text, is_real, category, source_name, source_url, source_published_on,
                                  explanation, hint, red_flags, display, validation_status, validation_notes, created_by, updated_by)
    values (btrim(p_card->>'item_key'), btrim(p_card->>'headline'), nullif(btrim(p_card->>'body_text'), ''), (p_card->>'is_real')::boolean,
            btrim(p_card->>'category'), nullif(btrim(p_card->>'source_name'), ''), nullif(btrim(p_card->>'source_url'), ''),
            nullif(p_card->>'source_published_on', '')::date, btrim(p_card->>'explanation'), btrim(p_card->>'hint'), v_flags,
            p_card->'display', coalesce(nullif(p_card->>'validation_status', ''), 'pendiente'), nullif(btrim(p_card->>'validation_notes'), ''),
            auth.uid(), auth.uid())
    returning id, revision into v_id, v_rev;
    perform public._audit('create_news_card', 'news_bank', v_id::text, jsonb_build_object('item_key', p_card->>'item_key'));
  else
    update public.news_bank set
      headline = btrim(p_card->>'headline'), body_text = nullif(btrim(p_card->>'body_text'), ''), is_real = (p_card->>'is_real')::boolean,
      category = btrim(p_card->>'category'), source_name = nullif(btrim(p_card->>'source_name'), ''),
      source_url = nullif(btrim(p_card->>'source_url'), ''), source_published_on = nullif(p_card->>'source_published_on', '')::date,
      explanation = btrim(p_card->>'explanation'), hint = btrim(p_card->>'hint'), red_flags = v_flags, display = p_card->'display',
      validation_status = coalesce(nullif(p_card->>'validation_status', ''), validation_status),
      validation_notes = nullif(btrim(p_card->>'validation_notes'), ''),
      revision = revision + 1, updated_at = now(), updated_by = auth.uid()
    where id = (p_card->>'id')::uuid
    returning id, revision into v_id, v_rev;
    if v_id is null then raise exception 'tarjeta_no_existe' using errcode = 'P0002'; end if;
    perform public._audit('edit_news_card', 'news_bank', v_id::text, jsonb_build_object('revision', v_rev));
  end if;
  return jsonb_build_object('id', v_id, 'revision', v_rev);
end $$;

create or replace function public.set_news_card_archived(p_id uuid, p_archived boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.news_bank set archived = coalesce(p_archived, false), updated_at = now(), updated_by = auth.uid() where id = p_id;
  if not found then raise exception 'tarjeta_no_existe' using errcode = 'P0002'; end if;
  perform public._audit(case when p_archived then 'archive_news_card' else 'restore_news_card' end, 'news_bank', p_id::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Armar una versión en borrador: copia preguntas y reglas de la versión activa y las tarjetas elegidas del banco.
-- ---------------------------------------------------------------------------
create or replace function public.create_study_version(p_version text, p_title text, p_changelog text, p_card_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  base public.studies;
  v_id uuid;
  v_n int; v_real int; v_min int;
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_version, '') !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then raise exception 'version_invalida: usa el formato 3.1.0' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_changelog, ''))) < 10 then raise exception 'falta_nota_de_cambios' using errcode = '22023'; end if;
  select * into base from public.studies where code = 'lo-reenviarias' and status = 'active';
  if not found then raise exception 'no_hay_version_activa' using errcode = 'P0002'; end if;
  if exists (select 1 from public.studies where code = base.code and version = p_version) then
    raise exception 'version_existente: % ya existe', p_version using errcode = '23505';
  end if;

  select count(*), count(*) filter (where is_real) into v_n, v_real
    from public.news_bank where id = any(p_card_ids) and not archived;
  v_min := public._cfg(base, 'items_per_session', 10)::int;
  if v_n <> cardinality(array(select distinct unnest(p_card_ids))) then raise exception 'tarjeta_archivada_o_inexistente' using errcode = '22023'; end if;
  if v_n < v_min then raise exception 'pocas_noticias: hacen falta al menos % y elegiste %', v_min, v_n using errcode = '22023'; end if;
  if v_real = 0 or v_real = v_n then raise exception 'faltan_reales_o_falsas' using errcode = '22023'; end if;

  insert into public.studies (code, version, title, description, status, config, changelog)
  values (base.code, p_version, coalesce(nullif(btrim(p_title), ''), base.title),
          format('Armada desde el banco de noticias: %s noticias (%s reales, %s falsas). Preguntas y reglas copiadas de la %s.', v_n, v_real, v_n - v_real, base.version),
          'draft', base.config, btrim(p_changelog))
  returning id into v_id;

  insert into public.survey_questions (study_id, question_key, phase, kind, prompt, options, required, position, min_length, max_length)
  select v_id, q.question_key, q.phase, q.kind, q.prompt, q.options, q.required, q.position, q.min_length, q.max_length
    from public.survey_questions q where q.study_id = base.id;

  insert into public.news_items (study_id, bank_id, item_key, item_version, headline, body_text, is_real, category, source_name, source_url,
                                 source_published_on, explanation, hint, red_flags, display, validation_status, validation_notes)
  select v_id, b.id, b.item_key, b.revision, b.headline, b.body_text, b.is_real, b.category, b.source_name, b.source_url,
         b.source_published_on, b.explanation, b.hint, b.red_flags, b.display, b.validation_status, b.validation_notes
    from public.news_bank b where b.id = any(p_card_ids);

  perform public._audit('create_study_version', 'study', v_id::text, jsonb_build_object('version', p_version, 'items', v_n, 'base', base.version));
  return jsonb_build_object('id', v_id, 'version', p_version, 'items', v_n);
end $$;

create or replace function public.archive_study_draft(p_study_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin('analyst') then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.studies set status = 'archived', updated_at = now() where id = p_study_id and status = 'draft';
  if not found then raise exception 'solo_se_archivan_borradores' using errcode = '22023'; end if;
  perform public._audit('archive_study_draft', 'study', p_study_id::text, '{}'::jsonb);
end $$;

-- Activar un borrador, o volver a una versión cerrada. La activa pasa a cerrada en la misma transacción.
-- Las sesiones en curso terminan con la versión con la que empezaron.
create or replace function public.activate_study_version(p_study_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  t public.studies;
  v_prev text;
  v_n int;
begin
  if not public.is_admin('owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into t from public.studies where id = p_study_id for update;
  if not found then raise exception 'version_no_existe' using errcode = 'P0002'; end if;
  if t.status not in ('draft','closed') then raise exception 'estado_no_activable: %', t.status using errcode = '22023'; end if;
  if t.version = '1.0.0' then raise exception 'la_1_0_0_es_historica' using errcode = '22023'; end if;
  select count(*) into v_n from public.news_items where study_id = t.id;
  if v_n < public._cfg(t, 'items_per_session', 10)::int then raise exception 'pocas_noticias' using errcode = '22023'; end if;
  if (select count(*) from public.survey_questions where study_id = t.id) = 0 then raise exception 'sin_preguntas' using errcode = '22023'; end if;

  update public.studies set status = 'closed', updated_at = now() where code = t.code and status = 'active' returning version into v_prev;
  update public.studies set status = 'active', updated_at = now() where id = t.id;
  perform public._audit('activate_study_version', 'study', t.id::text, jsonb_build_object('version', t.version, 'previous', v_prev));
  return jsonb_build_object('active', t.version, 'previous', v_prev);
end $$;

do $$ declare f text; begin
  foreach f in array array['save_news_card(jsonb)','set_news_card_archived(uuid,boolean)',
                           'create_study_version(text,text,text,uuid[])','archive_study_draft(uuid)','activate_study_version(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Almacenamiento de imágenes y clips (solo en Supabase; la base local de pruebas no tiene Storage).
-- Lectura pública por URL (el juego es anónimo). Subir: analyst u owner. Sin políticas de
-- modificación: un archivo subido no se puede reemplazar ni borrar desde el panel.
-- ---------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('noticias', 'noticias', true, 10485760, array['image/jpeg','image/png','image/webp','video/mp4'])
    on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'noticias_admin_upload') then
      create policy noticias_admin_upload on storage.objects for insert to authenticated
        with check (bucket_id = 'noticias' and (select public.is_admin('analyst')));
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'noticias_admin_read') then
      create policy noticias_admin_read on storage.objects for select to authenticated
        using (bucket_id = 'noticias' and (select public.is_admin('viewer')));
    end if;
  end if;
end $$;
