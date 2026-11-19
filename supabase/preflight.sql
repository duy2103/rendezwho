-- Read-only inspection. Run in the Rendezwho dashboard before applying the migration.
-- Review the output against the schema supplied on 2026-11-16.
select tablename,indexname,indexdef from pg_indexes where schemaname='public'
 and tablename in ('cities','places','saved_places','reviews') order by tablename,indexname;
select table_name,column_name,is_generated,generation_expression from information_schema.columns
 where table_schema='public' and table_name in ('cities','places') and column_name='normalized_name';
select c.relname,t.tgname,pg_get_triggerdef(t.oid),pg_get_functiondef(t.tgfoid)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and not t.tgisinternal and c.relname in ('cities','places','profiles','check_ins','saved_places','reviews','meetups');
select tablename,policyname,cmd,qual,with_check from pg_policies where schemaname='public'
 and tablename in ('cities','places','profiles','check_ins','saved_places','reviews');
select count(*) as duplicate_bookmark_groups from (
 select user_id,place_id from public.saved_places group by user_id,place_id having count(*)>1
) d;
select 'cities' as entity,count(*) as total,count(latitude) as located,count(provider_id) as externally_identified from public.cities
union all select 'places',count(*),count(latitude),count(provider_id) from public.places;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
 has_function_privilege('anon',p.oid,'execute') as anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('resolve_city','resolve_place','link_location','save_checkin');
