-- Tabla original simulada (estructura inferida del HTML original) con datos de prueba sintéticos.
create table if not exists public.radiografia_respuestas (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  opinion text, verifica text, compartio_falso text, responsable text, post_cambio text,
  aciertos int, puntos int, lupas_usadas int, alcance_simulado int, respuestas jsonb, duracion_seg int
);
alter table public.radiografia_respuestas enable row level security;
create policy "anon all" on public.radiografia_respuestas for all to anon using (true) with check (true);
grant all on public.radiografia_respuestas to anon;

insert into public.radiografia_respuestas (created_at, opinion, verifica, compartio_falso, responsable, post_cambio, aciertos, puntos, lupas_usadas, alcance_simulado, respuestas, duracion_seg) values
('2026-09-01 10:00:00+00','No, primero busco en Google','Siempre','No','Quien la crea','Tal vez',8,1450,1,0,
 '{"r_arancel":{"g":"real","ok":true,"ms":5000,"lupa":false},"f_marihuana":{"g":"falsa","ok":true,"ms":4000,"lupa":false},"r_cuba":{"g":"real","ok":true,"ms":3000,"lupa":true},"f_ingles":{"g":"real","ok":false,"ms":6000,"lupa":false},"r_hermano":{"g":"real","ok":true,"ms":7000,"lupa":false},"f_ejercito":{"g":"falsa","ok":true,"ms":2000,"lupa":false},"r_bus":{"g":"falsa","ok":false,"ms":8000,"lupa":false},"f_ccss":{"g":"falsa","ok":true,"ms":3000,"lupa":false},"r_recorte":{"g":"real","ok":true,"ms":4000,"lupa":false},"f_sinpe":{"g":"falsa","ok":true,"ms":5000,"lupa":false}}',150),
('2026-09-01 11:00:00+00','<script>alert(1)</script> a veces sí','A veces','Sí','Quien la comparte','Sí, verificaría más',6,700,2,3100,
 '{"r_arancel":{"g":null,"ok":false,"ms":20000,"lupa":false},"f_marihuana":{"g":"real","ok":false,"ms":4000,"lupa":true},"r_cuba":{"g":"real","ok":true,"ms":3000,"lupa":true},"f_ingles":{"g":"falsa","ok":true,"ms":6000,"lupa":false},"r_hermano":{"g":"falsa","ok":false,"ms":7000,"lupa":false},"f_ejercito":{"g":"falsa","ok":true,"ms":2000,"lupa":false},"r_bus":{"g":"real","ok":true,"ms":8000,"lupa":false},"f_ccss":{"g":"falsa","ok":true,"ms":3000,"lupa":false},"r_recorte":{"g":"falsa","ok":false,"ms":4000,"lupa":false},"f_sinpe":{"g":"falsa","ok":true,"ms":5000,"lupa":false}}',190);
