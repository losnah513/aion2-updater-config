-- Read-only production verification: every public family, canonical links, paging and ACL.
begin read only;
do $test$
declare selected jsonb; member jsonb; a jsonb; b jsonb; expected integer; asset jsonb;
begin
 for selected in select value from jsonb_array_elements(public.kinojo_web_roster_list_v465('all','깡','',null,100)->'items') loop
  for member in select value from jsonb_array_elements(public.kinojo_web_roster_family_v465((selected->>'characterId')::bigint,null,50)->'items') loop
   a:=public.kinojo_web_roster_images_v467((selected->>'characterId')::bigint,(member->>'characterId')::bigint,null,50);
   select count(*) into expected from public.kinojo_banner_asset_characters_v407 l
    join public.kinojo_banner_assets x using(asset_id) where l.character_id=(member->>'characterId')::bigint and x.status='READY';
   if (a->>'total')::integer<>expected then raise exception 'library count mismatch'; end if;
   for asset in select value from jsonb_array_elements(a->'items') loop
    if asset ?| array['objectPath','originalFileName','memberId','createdByMemberId','usageEvents'] then raise exception 'private metadata leaked'; end if;
    if (select count(*) from jsonb_object_keys(asset))<>7 then raise exception 'unexpected projection'; end if;
    if not exists(select 1 from public.kinojo_banner_asset_characters_v407 l join public.kinojo_banner_assets x using(asset_id)
      where l.character_id=(member->>'characterId')::bigint and x.asset_id=(asset->>'assetId')::bigint
      and x.status='READY' and x.mime_type=asset->>'mimeType') then raise exception 'unlinked image'; end if;
   end loop;
  end loop;
 end loop;
 a:=public.kinojo_web_roster_images_v467(96,96,null,1);
 b:=public.kinojo_web_roster_images_v467(96,96,a->'nextCursor',1);
 if a->'items'->0->>'assetId'=b->'items'->0->>'assetId' then raise exception 'duplicate image page'; end if;
 begin perform public.kinojo_web_roster_images_v467(96,96,'{"offset":1,"sourceToken":"stale"}',1); raise exception 'stale accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.kinojo_web_roster_images_v467(96,96,null,51); raise exception 'unbounded accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.kinojo_web_roster_images_v467(96,-1); raise exception 'bad id accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.kinojo_web_roster_images_v467(96,119); raise exception 'unrelated family accepted'; exception when invalid_parameter_value then null; end;
 if has_table_privilege('anon','public.kinojo_banner_assets','SELECT') or has_table_privilege('anon','public.kinojo_banner_asset_characters_v407','SELECT') then raise exception 'table exposed'; end if;
 if has_function_privilege('anon','public.kinojo_banner_asset_library_v407(text,boolean)','EXECUTE') then raise exception 'admin library exposed'; end if;
end;
$test$;
set local role anon;
select public.kinojo_web_roster_images_v467(96,96,null,1)->>'contractVersion' as anonymous_contract;
rollback;
