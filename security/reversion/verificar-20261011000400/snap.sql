-- (ACL normalizadas: ordenadas, el orden interno de aclitem no cambia los permisos)
-- Catálogo: funciones (definición + ACL), vistas (definición, opciones, ACL), tablas (ACL, RLS), políticas, triggers
select 'F|' || p.oid::regprocedure || '|' || md5(pg_get_functiondef(p.oid)) || '|' || coalesce((select string_agg(a::text, ',' order by a::text) from unnest(p.proacl) a), '-') || '|' || p.prosecdef
  from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1;
select 'R|' || c.relname || '|' || c.relkind::text || '|' || coalesce((select string_agg(a::text, ',' order by a::text) from unnest(c.relacl) a), '-') || '|' || coalesce(c.reloptions::text, '-') || '|' || c.relrowsecurity
       || '|' || case when c.relkind = 'v' then md5(pg_get_viewdef(c.oid)) else '' end
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m') order by 1;
select 'C|' || table_name || '|' || string_agg(column_name || ':' || data_type, ',' order by ordinal_position)
  from information_schema.columns where table_schema = 'public' group by table_name order by 1;
select 'P|' || tablename || '|' || policyname || '|' || permissive || '|' || roles::text || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  from pg_policies where schemaname = 'public' order by 1;
select 'T|' || tgrelid::regclass || '|' || tgname || '|' || md5(pg_get_triggerdef(oid)) from pg_trigger where not tgisinternal order by 1;
