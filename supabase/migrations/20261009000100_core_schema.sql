-- ============================================================================
-- ¿Lo reenviarías? — Radiografía Social ULACIT
-- 0001: esquema relacional principal
-- Idempotente en lo posible (IF NOT EXISTS). No destruye datos existentes.
-- ============================================================================
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Estudios (instrumento versionado)
-- ---------------------------------------------------------------------------
create table if not exists public.studies (
  id           uuid primary key default gen_random_uuid(),
  code         text not null check (code ~ '^[a-z0-9_-]{3,40}$'),
  version      text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  title        text not null,
  description  text,
  status       text not null default 'draft' check (status in ('draft','active','closed','archived')),
  config       jsonb not null default '{}'::jsonb,
  changelog    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (code, version)
);
comment on table public.studies is 'Versiones del instrumento. Observaciones de versiones distintas no deben mezclarse sin justificación.';

-- Solo una versión activa por código de estudio
create unique index if not exists studies_one_active_per_code
  on public.studies (code) where status = 'active';

-- ---------------------------------------------------------------------------
-- Catálogo de noticias (versionado por estudio)
-- ---------------------------------------------------------------------------
create table if not exists public.news_items (
  id                   uuid primary key default gen_random_uuid(),
  study_id             uuid not null references public.studies(id) on delete restrict,
  item_key             text not null check (item_key ~ '^[a-z0-9_]{2,40}$'),
  item_version         integer not null default 1 check (item_version > 0),
  headline             text not null check (char_length(headline) between 5 and 300),
  body_text            text,
  is_real              boolean not null,
  category             text not null,
  source_name          text,
  source_url           text check (source_url is null or source_url ~ '^https://'),
  source_published_on  date,
  explanation          text not null,
  hint                 text not null,
  red_flags            text[] not null default '{}',
  display              jsonb not null default '{}'::jsonb,
  validation_status    text not null default 'pendiente'
                       check (validation_status in ('pendiente','verificada','requiere_precision','requiere_correccion','ficticia_documentada')),
  validation_notes     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (study_id, item_key)
);
comment on column public.news_items.is_real is 'Clasificación correcta (true = real). Nunca se expone al participante antes de su decisión.';
comment on column public.news_items.display is 'Atributos visuales de la tarjeta: remitente simulado, banda, colores, emojis.';

-- ---------------------------------------------------------------------------
-- Preguntas de opinión (antes/después)
-- ---------------------------------------------------------------------------
create table if not exists public.survey_questions (
  id            uuid primary key default gen_random_uuid(),
  study_id      uuid not null references public.studies(id) on delete restrict,
  question_key  text not null check (question_key ~ '^[a-z0-9_]{2,40}$'),
  phase         text not null check (phase in ('pre','post')),
  kind          text not null check (kind in ('single','open')),
  prompt        text not null,
  options       text[] not null default '{}',
  required      boolean not null default true,
  position      smallint not null,
  min_length    smallint not null default 0,
  max_length    smallint not null default 1500,
  unique (study_id, question_key),
  check (kind = 'open' or cardinality(options) >= 2)
);

-- ---------------------------------------------------------------------------
-- Sesiones anónimas de participantes
-- ---------------------------------------------------------------------------
create table if not exists public.participant_sessions (
  id                  uuid primary key,             -- UUID v4 generado en el cliente (idempotencia)
  study_id            uuid not null references public.studies(id) on delete restrict,
  instrument_version  text not null,
  origin              text not null default 'app' check (origin in ('app','legacy_import','qa_test')),
  status              text not null default 'started' check (status in ('started','completed','abandoned')),
  is_test             boolean not null default false,
  consent_accepted    boolean not null default false,
  consent_at          timestamptz,
  started_at          timestamptz not null default now(),
  game_started_at     timestamptz,
  completed_at        timestamptz,
  duration_seconds    integer check (duration_seconds is null or duration_seconds >= 0),
  presentation_order  uuid[] not null default '{}',
  hints_remaining     smallint not null default 0 check (hints_remaining >= 0),
  device_class        text not null default 'unknown' check (device_class in ('mobile','tablet','desktop','unknown')),
  reduced_motion      boolean,
  legacy_source_id    text unique,
  exclusion_reason    text check (exclusion_reason is null or char_length(exclusion_reason) <= 300),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.participant_sessions is 'Una fila por participación. No almacena nombres, correos, IP ni identificadores personales.';
create index if not exists participant_sessions_study_status_idx on public.participant_sessions (study_id, status, started_at);
create index if not exists participant_sessions_started_idx on public.participant_sessions (started_at);

-- ---------------------------------------------------------------------------
-- Respuestas de opinión
-- ---------------------------------------------------------------------------
create table if not exists public.survey_responses (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references public.participant_sessions(id) on delete cascade,
  question_id   uuid not null references public.survey_questions(id) on delete restrict,
  phase         text not null check (phase in ('pre','post')),
  option_value  text check (option_value is null or char_length(option_value) <= 120),
  text_value    text check (text_value is null or char_length(text_value) <= 1500),
  created_at    timestamptz not null default now(),
  unique (session_id, question_id),
  check (option_value is not null or text_value is not null)
);
create index if not exists survey_responses_question_idx on public.survey_responses (question_id);

-- ---------------------------------------------------------------------------
-- Uso de pistas (lupas)
-- ---------------------------------------------------------------------------
create table if not exists public.hint_events (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references public.participant_sessions(id) on delete cascade,
  news_item_id  uuid not null references public.news_items(id) on delete restrict,
  used_at       timestamptz not null default now(),
  unique (session_id, news_item_id)
);

-- ---------------------------------------------------------------------------
-- Decisiones de juego: una fila por noticia
-- ---------------------------------------------------------------------------
create table if not exists public.game_decisions (
  id                      bigint generated always as identity primary key,
  session_id              uuid not null references public.participant_sessions(id) on delete cascade,
  news_item_id            uuid not null references public.news_items(id) on delete restrict,
  position                smallint check (position is null or position between 1 and 50),
  choice                  text check (choice is null or choice in ('real','falsa')),
  correct_classification  text not null check (correct_classification in ('real','falsa')),
  is_correct              boolean not null,
  timed_out               boolean not null default false,
  hint_used               boolean not null default false,
  response_ms             integer check (response_ms is null or response_ms between 0 and 600000),
  points_awarded          integer check (points_awarded is null or points_awarded >= 0),
  streak_after            smallint,
  simulated_reach         integer not null default 0 check (simulated_reach >= 0),
  instrument_version      text not null,
  created_at              timestamptz not null default now(),
  unique (session_id, news_item_id),
  unique (session_id, position),
  check (not timed_out or choice is null)
);
comment on column public.game_decisions.response_ms is 'Milisegundos medidos en el cliente entre la aparición de la tarjeta y la decisión. Validado en servidor.';
comment on column public.game_decisions.simulated_reach is 'Alcance ILUSTRATIVO aleatorio. No representa difusión real.';
create index if not exists game_decisions_item_idx on public.game_decisions (news_item_id);

-- ---------------------------------------------------------------------------
-- Resumen consolidado por sesión (calculado SOLO en servidor)
-- ---------------------------------------------------------------------------
create table if not exists public.game_sessions_summary (
  session_id              uuid primary key references public.participant_sessions(id) on delete cascade,
  decisions_count         smallint not null,
  correct_count           smallint not null,
  error_count             smallint not null,
  timeout_count           smallint not null,
  score                   integer,
  hints_used              smallint not null,
  fake_total              smallint not null,
  fake_accepted_count     smallint not null,
  real_total              smallint not null,
  real_rejected_count     smallint not null,
  simulated_reach_total   integer not null default 0,
  duration_seconds        integer,
  completed_at            timestamptz,
  computed_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Administración
-- ---------------------------------------------------------------------------
create table if not exists public.admin_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          text not null check (role in ('owner','analyst','viewer')),
  display_name  text check (display_name is null or char_length(display_name) <= 80),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid
);

create table if not exists public.audit_events (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  action       text not null,
  target_type  text,
  target_id    text,
  details      jsonb not null default '{}'::jsonb
);
create index if not exists audit_events_occurred_idx on public.audit_events (occurred_at desc);

-- Codificación manual de preguntas abiertas
create table if not exists public.response_codes (
  id                  bigint generated always as identity primary key,
  survey_response_id  bigint not null references public.survey_responses(id) on delete cascade,
  code                text not null check (char_length(code) between 1 and 60),
  note                text check (note is null or char_length(note) <= 500),
  coded_by            uuid,
  created_at          timestamptz not null default now(),
  unique (survey_response_id, code)
);

-- updated_at automático
create or replace function public.tg_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- create or replace trigger es idempotente y no elimina objetos
create or replace trigger set_updated_at before update on public.studies for each row execute function public.tg_set_updated_at();
create or replace trigger set_updated_at before update on public.news_items for each row execute function public.tg_set_updated_at();
create or replace trigger set_updated_at before update on public.participant_sessions for each row execute function public.tg_set_updated_at();

-- RLS activo desde la creación: ninguna tabla queda expuesta entre esta migración y la 0004,
-- que define las políticas y retira los privilegios de anon.
alter table public.studies enable row level security;
alter table public.news_items enable row level security;
alter table public.survey_questions enable row level security;
alter table public.participant_sessions enable row level security;
alter table public.survey_responses enable row level security;
alter table public.hint_events enable row level security;
alter table public.game_decisions enable row level security;
alter table public.game_sessions_summary enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.audit_events enable row level security;
alter table public.response_codes enable row level security;
