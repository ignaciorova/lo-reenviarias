-- Actividad con la migración aplicada: recalcular señales, revisión humana, exportación y lectura de ajustes (como owner).
\set ON_ERROR_STOP 1
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.recompute_automation_signals();
select public.review_automation('bbbbbbbb-0000-4000-8000-000000000002', true, 'prueba');
select (public.export_dataset('v4_sesiones', '{}') ->> 'row_count');
select count(*) from public.get_platform_settings();
reset role;
