-- SQL548: replace the character modal's final direct character_master reads.
-- Only a bounded, unambiguous active identity and its public display fields.
create function public.kinojo_web_character_summary_v548(p_name text,p_server_id integer default null,p_server_name text default null)
returns jsonb language sql stable security definer
set search_path=pg_catalog set statement_timeout='2s' set lock_timeout='250ms'
as $body$
 with matches as (
  select c.id,c.character_name,c.main_character_name,c.server_id,c.server_name,c.class_name,
   c.profile_image_url,c.detail_url,c.latest_pve_combat_power,c.latest_pve_item_level,
   c.latest_pvp_combat_power,c.latest_pvp_item_level
  from public.character_master c
  where length(btrim(p_name)) between 1 and 120
   and public.kinojo_normalize_character_name(c.character_name)=public.kinojo_normalize_character_name(btrim(p_name))
   and ((p_server_id is not null and c.server_id=p_server_id)
    or (p_server_id is null and nullif(btrim(p_server_name),'') is not null and c.server_name=btrim(p_server_name)))
   and coalesce(c.is_active,true) and not coalesce(c.visibility_excluded,false) and coalesce(c.status,'OK')<>'DELETED'
  order by c.id limit 2
 ) select case when count(*)=1 then jsonb_agg(to_jsonb(matches))->0 else null end from matches;
$body$;
revoke all on function public.kinojo_web_character_summary_v548(text,integer,text) from public,anon,authenticated;
grant execute on function public.kinojo_web_character_summary_v548(text,integer,text) to anon,authenticated,service_role;
