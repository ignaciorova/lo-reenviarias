-- Huella de datos por tabla (filas y md5 de todas las filas ordenadas), igual que en estado-previo.md. Excluye las tablas nuevas.
do $$ declare t text; n bigint; h text; begin
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
             and c.relname not in ('session_integrity','platform_settings') order by 1 loop
    execute format('select count(*), md5(coalesce(string_agg(md5(x::text), '''' order by md5(x::text)), '''')) from public.%I x', t) into n, h;
    raise notice 'FP|%|%|%', t, n, h;
  end loop;
end $$;
