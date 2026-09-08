-- Generation fencing for late writers. Apply after the stage-2 foundation migration.
alter table private.character_identity_scan_checkpoints add column if not exists generation bigint not null default 1;
create or replace function public.kinojo_identity_scan_checkpoint_v2(
  p_character_id bigint, p_char_key text, p_servers jsonb,
  p_completed jsonb default null, p_matches jsonb default null, p_generation text default null
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog, public, private, pg_temp
set lock_timeout = '1s'
as $fn$
declare
  c public.character_master%rowtype;
  s private.character_identity_scan_checkpoints%rowtype;
  all_servers jsonb;
begin
  select * into c from public.character_master where id=p_character_id;
  if not found or nullif(c.char_key,'') is distinct from p_char_key then
    return jsonb_build_object('ok',false,'code','STALE_IDENTITY');
  end if;
  select jsonb_agg(jsonb_build_object('serverId',sm.server_id,'serverName',sm.server_name,
    'serverShortName',sm.server_short_name,'raceId',sm.race_id) order by sm.server_id)
    into all_servers from public.server_master sm
    where coalesce(sm.is_active,true)
      and sm.race_id=(select race_id from public.server_master where server_id=c.server_id);
  if all_servers is distinct from p_servers then
    return jsonb_build_object('ok',false,'code','STALE_SERVER_CATALOG');
  end if;
  insert into private.character_identity_scan_checkpoints(character_id,char_key,servers,class_name,expires_at)
    values(c.id,p_char_key,all_servers,coalesce(c.class_name,''),clock_timestamp()+interval '5 minutes')
    on conflict(character_id) do nothing;
  select * into s from private.character_identity_scan_checkpoints where character_id=c.id for update;
  if s.expires_at<clock_timestamp() or s.char_key<>p_char_key or s.servers<>all_servers
     or s.class_name<>coalesce(c.class_name,'') then
    update private.character_identity_scan_checkpoints set char_key=p_char_key,servers=all_servers,
      generation=s.generation+1,class_name=coalesce(c.class_name,''),completed='[]',matches='[]',expires_at=clock_timestamp()+interval '5 minutes'
      where character_id=c.id returning * into s;
    if p_completed is not null then
      return jsonb_build_object('ok',false,'code','SCAN_EXPIRED_RESTART_REQUIRED');
    end if;
  end if;
  if p_completed is not null then
    if p_generation is distinct from s.generation::text then
      return jsonb_build_object('ok',false,'code','STALE_SCAN_GENERATION');
    end if;
    if jsonb_typeof(p_completed)<>'array' or jsonb_typeof(p_matches) is distinct from 'array'
       or exists(select 1 from jsonb_array_elements(p_completed) x
          where not exists(select 1 from jsonb_array_elements(all_servers) y where y->'serverId'=x))
       or exists(select 1 from jsonb_array_elements(p_matches) x
          where x->>'charKey' is distinct from p_char_key
             or not exists(select 1 from jsonb_array_elements(all_servers) y where y->'serverId'=x->'serverId'))
    then return jsonb_build_object('ok',false,'code','INVALID_SCAN_CHECKPOINT'); end if;
    update private.character_identity_scan_checkpoints set
      completed=(select coalesce(jsonb_agg(distinct x),'[]') from jsonb_array_elements(s.completed||p_completed) x),
      matches=(select coalesce(jsonb_agg(distinct x),'[]') from jsonb_array_elements(s.matches||p_matches) x)
      where character_id=c.id returning * into s;
  end if;
  return jsonb_build_object('ok',true,'generation',s.generation::text,'completed',s.completed,'matches',s.matches);
end;
$fn$;
revoke all on function public.kinojo_identity_scan_checkpoint_v2(bigint,text,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.kinojo_identity_scan_checkpoint_v2(bigint,text,jsonb,jsonb,jsonb,text) to service_role;

revoke execute on function public.kinojo_identity_scan_checkpoint_v1(bigint,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
