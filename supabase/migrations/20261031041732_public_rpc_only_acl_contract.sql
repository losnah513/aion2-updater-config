-- SQL545: deploy only AFTER SQL544/548 + WEB feature/modal RPC callers.
-- Browser data access is RPC-only. No rows, RLS policies or function bodies change.
do $seal$
declare r record;a record;v_priv text;v_service text[];
begin
  if to_regprocedure('public.kinojo_web_lookup_main_character_v544(text,integer)') is null
    or to_regprocedure('public.kinojo_web_hall_suggestion_submit_v544(text,text,text,text,text)') is null
    or to_regprocedure('public.kinojo_web_character_summary_v548(text,integer,text)') is null then
    raise exception 'PUBLIC_RPC_CONTRACT_544_548_REQUIRED';
  end if;
  for r in select c.oid,c.relname from pg_class c
    where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m')
  loop
    v_service:='{}';
    foreach v_priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
      if has_table_privilege('service_role',r.oid,v_priv) then v_service:=array_append(v_service,v_priv);end if;
    end loop;
    execute format('revoke all privileges on table public.%I from public,anon,authenticated',r.relname);
    for a in select attname from pg_attribute where attrelid=r.oid and attnum>0 and not attisdropped and attacl is not null loop
      execute format('revoke all privileges (%I) on table public.%I from public,anon,authenticated',a.attname,r.relname);
    end loop;
    if cardinality(v_service)>0 then execute format('grant %s on table public.%I to service_role',array_to_string(v_service,','),r.relname);end if;
  end loop;
  for r in select c.oid,c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='S'
  loop
    v_service:='{}';
    foreach v_priv in array array['USAGE','SELECT','UPDATE'] loop
      if has_sequence_privilege('service_role',r.oid,v_priv) then v_service:=array_append(v_service,v_priv);end if;
    end loop;
    execute format('revoke all privileges on sequence public.%I from public,anon,authenticated',r.relname);
    if cardinality(v_service)>0 then execute format('grant %s on sequence public.%I to service_role',array_to_string(v_service,','),r.relname);end if;
  end loop;
end;
$seal$;
-- New API functions must be reviewed and granted explicitly; no accidental
-- public table/column/sequence endpoint or SECURITY DEFINER entrypoint by default.
alter default privileges for role postgres in schema public revoke all privileges on tables from public,anon,authenticated;
alter default privileges for role postgres in schema public revoke all privileges on sequences from public,anon,authenticated;
-- PostgreSQL grants function EXECUTE globally by default. A per-schema REVOKE
-- cannot cancel that global grant; remove it at the owner level as well.
alter default privileges for role postgres revoke all privileges on functions from public,anon,authenticated;
alter default privileges for role postgres in schema public revoke all privileges on functions from public,anon,authenticated;
