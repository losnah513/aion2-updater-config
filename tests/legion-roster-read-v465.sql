-- Read-only production verification; raises on contract, ACL or source mismatch.
begin read only;
do $test$
declare a jsonb; b jsonb; f jsonb; row jsonb; expected integer; ids jsonb;
begin
 a:=public.kinojo_web_roster_list_v465('all','깡','',null,100);
 select count(*) into expected from public.character_master c where coalesce(c.is_active,true)
  and coalesce(c.status,'OK')<>'DELETED' and not coalesce(c.visibility_excluded,false)
  and btrim(c.legion_name)=any(array['깡','낮','밤','키나노동조합']);
 if (a->>'total')::integer<>expected then raise exception 'eligible total mismatch'; end if;
 a:=public.kinojo_web_roster_list_v465('all','깡','',null,1);
 b:=public.kinojo_web_roster_list_v465('all','깡','',a->'nextCursor',1);
 if a->'items'->0->>'characterId'=b->'items'->0->>'characterId' then raise exception 'duplicate page'; end if;
 for row in select value from jsonb_array_elements(public.kinojo_web_roster_list_v465('all','깡','',null,100)->'items') loop
  f:=public.kinojo_web_roster_family_v465((row->>'characterId')::bigint,null,50);
  if f->>'selectedCharacterId'<>row->>'characterId' then raise exception 'wrong selected identity'; end if;
  if f->>'relationshipState'='OK' and f->'items'->0->>'characterId'<>f->>'mainCharacterId' then raise exception 'root not first'; end if;
  if exists(select 1 from jsonb_array_elements(f->'items') r join public.character_master c on c.id=(r->>'characterId')::bigint
    where (r->>'itemLevel')::integer is distinct from c.latest_pve_item_level or (r->>'combatPower')::integer is distinct from c.latest_pve_combat_power
    or not coalesce(c.is_active,true) or coalesce(c.status,'OK')='DELETED' or coalesce(c.visibility_excluded,false)) then raise exception 'unsafe or stale family projection'; end if;
 end loop;
 begin perform public.kinojo_web_roster_list_v465('invalid'); raise exception 'invalid mode accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.kinojo_web_roster_list_v465('all','깡','',null,101); raise exception 'unbounded list'; exception when invalid_parameter_value then null; end;
 begin perform public.kinojo_web_roster_list_v465('all','깡','',jsonb_build_object('offset',1,'sourceToken','stale'),1); raise exception 'stale cursor accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.kinojo_web_roster_family_v465(-1); raise exception 'invalid ID accepted'; exception when invalid_parameter_value then null; end;
 if has_function_privilege('anon','private.kinojo_roster_source_v465()','EXECUTE') then raise exception 'private source exposed'; end if;
 if has_function_privilege('anon','public.kinojo_banner_asset_library_v407(text,boolean)','EXECUTE') then raise exception 'admin library exposed'; end if;
end;
$test$;
set local role anon;
select jsonb_build_object('role',current_user,'listTotal',public.kinojo_web_roster_list_v465()->'total',
 'familyAvailable',jsonb_array_length(public.kinojo_web_roster_family_v465((public.kinojo_web_roster_list_v465()->'items'->0->>'characterId')::bigint)->'items')>0) as verified;
rollback;
