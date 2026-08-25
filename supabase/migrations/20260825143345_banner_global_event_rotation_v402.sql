-- Global formal-event rotation contract.
--
-- DB400 accidentally treated ORDERED/RANDOM as an event-local image order.
-- DB402 restores every formal event to item sort_order and moves the choice to
-- one MASTER-only global setting. Legacy, ungrouped campaigns keep their
-- existing playlist positions and are never included in the global shuffle.

create table if not exists private.kinojo_banner_event_rotation_v402 (
  singleton boolean primary key default true check (singleton),
  rotation_mode text not null default 'ORDERED' check (
    rotation_mode in ('ORDERED','RANDOM_CYCLE')
  ),
  updated_by_member_id bigint,
  updated_at timestamptz not null default clock_timestamp()
);

alter table private.kinojo_banner_event_rotation_v402 enable row level security;
revoke all on table private.kinojo_banner_event_rotation_v402
  from public, anon, authenticated, service_role;

insert into private.kinojo_banner_event_rotation_v402(singleton,rotation_mode)
values (true,'ORDERED')
on conflict(singleton) do nothing;

-- Retire the event-local random value without touching legacy campaign mode.
lock table private.kinojo_banner_event_groups_v391 in share row exclusive mode;
lock table public.kinojo_banner_campaigns in share row exclusive mode;

update private.kinojo_banner_event_groups_v391
   set playback_mode='ORDERED'
 where playback_mode is distinct from 'ORDERED';

update public.kinojo_banner_campaigns
   set playback_mode='ORDERED'
 where event_group_id is not null
   and playback_mode is distinct from 'ORDERED';

alter table private.kinojo_banner_event_groups_v391
  alter column playback_mode set default 'ORDERED';
alter table private.kinojo_banner_event_groups_v391
  drop constraint if exists kinojo_banner_event_group_playback_v400_chk;
alter table private.kinojo_banner_event_groups_v391
  add constraint kinojo_banner_event_group_playback_v402_chk check (
    playback_mode='ORDERED'
  );

alter table public.kinojo_banner_campaigns
  drop constraint if exists kinojo_banner_campaign_playback_v400_chk;
alter table public.kinojo_banner_campaigns
  add constraint kinojo_banner_campaign_playback_v402_chk check (
    playback_mode in ('WEIGHTED','ORDERED')
  );

create or replace function private.kinojo_banner_event_json_v402(
  p_event_group_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.kinojo_banner_event_json_v398(p_event_group_id);
$function$;

create or replace function public.kinojo_banner_event_list_v402(
  p_session_token text,
  p_include_archived boolean default true
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_events jsonb;
  v_legacy jsonb;
  v_rotation_mode text;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;

  select rotation_mode into v_rotation_mode
  from private.kinojo_banner_event_rotation_v402
  where singleton=true;

  select coalesce(
    jsonb_agg(private.kinojo_banner_event_json_v402(g.event_group_id)
      order by g.manager_order desc,g.event_group_id),
    '[]'::jsonb
  ) into v_events
  from private.kinojo_banner_event_groups_v391 g
  where coalesce(p_include_archived,true)
     or exists (
       select 1 from public.kinojo_banner_campaigns c
       where c.event_group_id=g.event_group_id and c.status<>'ARCHIVED'
     );

  select coalesce(
    jsonb_agg(private.kinojo_banner_campaign_json_v396(c)
      order by c.updated_at desc,c.campaign_id desc),
    '[]'::jsonb
  ) into v_legacy
  from public.kinojo_banner_campaigns c
  where c.event_group_id is null
    and (coalesce(p_include_archived,true) or c.status<>'ARCHIVED');

  return jsonb_build_object(
    'ok',true,'apiVersion','402','contract','banner-event-list-v402',
    'eventRotationMode',coalesce(v_rotation_mode,'ORDERED'),
    'eventRotationScope','FORMAL_EVENT_GROUPS_ONLY',
    'events',v_events,'legacyCampaigns',v_legacy
  );
end;
$function$;

create or replace function public.kinojo_banner_event_save_v402(
  p_session_token text,
  p_event_group_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_result jsonb;
  v_group_id uuid;
begin
  v_result := public.kinojo_banner_event_save_v396(
    p_session_token,p_event_group_id,p_payload
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;

  v_group_id := (v_result->>'eventGroupId')::uuid;
  update public.kinojo_banner_campaigns
     set playback_mode='ORDERED'
   where event_group_id=v_group_id
     and playback_mode is distinct from 'ORDERED';

  return v_result || jsonb_build_object(
    'apiVersion','402','contract','banner-event-save-v402',
    'event',private.kinojo_banner_event_json_v402(v_group_id)
  );
end;
$function$;

create or replace function public.kinojo_banner_event_publish_v402(
  p_session_token text,
  p_event_group_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_result jsonb;
begin
  v_result := public.kinojo_banner_event_publish_v396(
    p_session_token,p_event_group_id
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;

  update public.kinojo_banner_campaigns
     set playback_mode='ORDERED'
   where event_group_id=p_event_group_id
     and playback_mode is distinct from 'ORDERED';

  return v_result || jsonb_build_object(
    'apiVersion','402','contract','banner-event-publish-v402',
    'event',private.kinojo_banner_event_json_v402(p_event_group_id)
  );
end;
$function$;

create or replace function public.kinojo_banner_event_rotation_set_v402(
  p_session_token text,
  p_rotation_mode text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_mode text := upper(btrim(coalesce(p_rotation_mode,'')));
  v_member_id bigint;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  if v_mode not in ('ORDERED','RANDOM_CYCLE') then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_ROTATION_MODE_INVALID');
  end if;
  v_member_id := (v_gate->>'memberId')::bigint;

  perform 1
  from private.kinojo_banner_event_rotation_v402
  where singleton=true
  for update;

  update private.kinojo_banner_event_rotation_v402
     set rotation_mode=v_mode,
         updated_by_member_id=v_member_id,
         updated_at=clock_timestamp()
   where singleton=true;

  return jsonb_build_object(
    'ok',true,'apiVersion','402','contract','banner-event-rotation-v402',
    'eventRotationMode',v_mode,
    'eventRotationScope','FORMAL_EVENT_GROUPS_ONLY'
  );
end;
$function$;

create or replace function private.kinojo_banner_manifest_internal_v402(
  p_page_code text,
  p_slot_code text,
  p_now timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_page text := upper(btrim(coalesce(p_page_code,'')));
  v_slot text := upper(btrim(coalesce(p_slot_code,'')));
  v_now timestamptz := coalesce(p_now,statement_timestamp());
  v_base jsonb;
  v_playlist jsonb := '[]'::jsonb;
  v_manifest_version text;
  v_rotation_mode text;
  v_seed bigint;
begin
  v_base := private.kinojo_banner_manifest_internal_v396(
    v_page,v_slot,v_now
  );
  if coalesce((v_base->>'ok')::boolean,false) is not true then return v_base; end if;

  select rotation_mode into v_rotation_mode
  from private.kinojo_banner_event_rotation_v402
  where singleton=true;
  v_rotation_mode := coalesce(v_rotation_mode,'ORDERED');
  v_seed := floor(extract(epoch from v_now)/300.0)::bigint;

  with source as (
    select
      p.item,
      p.ordinality,
      c.campaign_id,
      c.event_group_id,
      i.item_id,
      i.sort_order,
      g.manager_order,
      row_number() over (
        partition by (p.item->>'itemId')::bigint
        order by p.ordinality
      ) as exposure_ticket
    from jsonb_array_elements(coalesce(v_base->'playlist','[]'::jsonb))
      with ordinality p(item,ordinality)
    join public.kinojo_banner_campaigns c
      on c.campaign_id=(p.item->>'campaignId')::bigint
    join public.kinojo_banner_campaign_items i
      on i.item_id=(p.item->>'itemId')::bigint
    left join private.kinojo_banner_event_groups_v391 g
      on g.event_group_id=c.event_group_id
  ),
  formal_groups as (
    select distinct event_group_id,manager_order
    from source
    where event_group_id is not null
  ),
  scored_groups as (
    select
      event_group_id,
      manager_order,
      row_number() over (
        order by md5(v_seed::text||'|'||v_page||'|'||v_slot||'|'||event_group_id::text),event_group_id
      ) as current_rank,
      row_number() over (
        order by md5((v_seed+1)::text||'|'||v_page||'|'||v_slot||'|'||event_group_id::text),event_group_id
      ) as next_rank,
      count(*) over () as group_count
    from formal_groups
  ),
  score_stats as (
    select
      max(event_group_id::text) filter(where current_rank=group_count) as raw_last,
      max(event_group_id::text) filter(where next_rank=1) as next_raw_first
    from scored_groups
  ),
  group_order as (
    select
      s.event_group_id,
      case
        when v_rotation_mode='ORDERED' then
          row_number() over (order by s.manager_order desc,s.event_group_id)
        when s.group_count<=1 then 1::bigint
        when s.group_count=2 then
          row_number() over (
            order by md5('stable|'||v_page||'|'||v_slot||'|'||s.event_group_id::text),s.event_group_id
          )
        when stats.raw_last=stats.next_raw_first and s.current_rank=s.group_count then
          s.group_count-1
        when stats.raw_last=stats.next_raw_first and s.current_rank=s.group_count-1 then
          s.group_count
        else s.current_rank
      end as event_rank
    from scored_groups s
    cross join score_stats stats
  ),
  formal_sorted as (
    select
      s.item,
      row_number() over (
        order by s.exposure_ticket,o.event_rank,s.sort_order,s.item_id,s.ordinality
      ) as formal_position
    from source s
    join group_order o on o.event_group_id=s.event_group_id
  ),
  formal_slots as (
    select
      ordinality as target_ordinality,
      row_number() over (order by ordinality) as formal_position
    from source
    where event_group_id is not null
  ),
  repositioned as (
    select s.ordinality as target_ordinality,s.item
    from source s
    where s.event_group_id is null
    union all
    select slots.target_ordinality,sorted.item
    from formal_sorted sorted
    join formal_slots slots using(formal_position)
  )
  select coalesce(jsonb_agg(item order by target_ordinality),'[]'::jsonb)
    into v_playlist
  from repositioned;

  v_manifest_version := 'bm402-'||substr(md5(
    coalesce(v_base->>'manifestVersion','')||'|'||v_rotation_mode||'|'||v_playlist::text
  ),1,24);

  return v_base || jsonb_build_object(
    'apiVersion','402',
    'contract','banner-manifest-internal-v402',
    'manifestVersion',v_manifest_version,
    'eventRotationMode',v_rotation_mode,
    'eventRotationScope','FORMAL_EVENT_GROUPS_ONLY',
    'playbackOrderMode',case
      when v_rotation_mode='RANDOM_CYCLE' then 'GLOBAL_EVENT_RANDOM_CYCLE'
      else 'GLOBAL_EVENT_ORDERED'
    end,
    'playlist',v_playlist
  );
end;
$function$;

create or replace function public.kinojo_banner_manifest_v402(
  p_page_code text,
  p_slot_code text
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.kinojo_banner_manifest_internal_v402(
    p_page_code,p_slot_code,statement_timestamp()
  );
$function$;

-- Keep event-playback in the table constraint for historical ledger rows, but
-- only the global event-rotation action can be claimed by the new Edge code.
alter table private.kinojo_banner_idempotency_v388
  drop constraint if exists kinojo_banner_idempotency_action_v388_chk;
alter table private.kinojo_banner_idempotency_v388
  add constraint kinojo_banner_idempotency_action_v388_chk check (action in (
    'upload-prepare','upload-complete',
    'asset-update','asset-archive','asset-restore','asset-delete',
    'orphan-cleanup',
    'campaign-create','campaign-update','campaign-publish','campaign-pause',
    'campaign-archive','campaign-restore','campaign-delete',
    'event-save','event-publish','event-move','event-playback','event-rotation','event-pause','event-delete',
    'overlay-upload-prepare','overlay-upload-complete',
    'composite-upload-prepare','composite-upload-complete'
  ));

create or replace function public.kinojo_banner_idempotency_claim_v402(
  p_session_token text,
  p_action text,
  p_idempotency_key uuid,
  p_request_hash text,
  p_ttl_seconds integer default 86400
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_member bigint;
  v_action text := lower(btrim(coalesce(p_action,'')));
  v_hash text := lower(btrim(coalesce(p_request_hash,'')));
  v_ttl integer := greatest(60,least(coalesce(p_ttl_seconds,86400),86400));
  v_row private.kinojo_banner_idempotency_v388;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  v_member := (v_gate->>'memberId')::bigint;

  if v_action not in (
    'upload-prepare','upload-complete',
    'asset-update','asset-archive','asset-restore','asset-delete',
    'orphan-cleanup',
    'campaign-create','campaign-update','campaign-publish','campaign-pause',
    'campaign-archive','campaign-restore','campaign-delete',
    'event-save','event-publish','event-move','event-rotation','event-pause','event-delete',
    'overlay-upload-prepare','overlay-upload-complete',
    'composite-upload-prepare','composite-upload-complete'
  ) then
    return jsonb_build_object('ok',false,'code','BANNER_IDEMPOTENCY_ACTION_INVALID');
  end if;
  if p_idempotency_key is null then
    return jsonb_build_object('ok',false,'code','BANNER_IDEMPOTENCY_KEY_REQUIRED');
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'code','BANNER_IDEMPOTENCY_HASH_INVALID');
  end if;

  delete from private.kinojo_banner_idempotency_v388
   where expires_at <= clock_timestamp();

  insert into private.kinojo_banner_idempotency_v388(
    member_id,action,idempotency_key,request_hash,state,expires_at
  ) values (
    v_member,v_action,p_idempotency_key,v_hash,'RUNNING',
    clock_timestamp()+make_interval(secs=>v_ttl)
  )
  on conflict(member_id,idempotency_key) do nothing
  returning * into v_row;

  if found then
    return jsonb_build_object(
      'ok',true,'apiVersion','402','contract','banner-idempotency-v402',
      'disposition','CLAIMED'
    );
  end if;

  select * into v_row
  from private.kinojo_banner_idempotency_v388
  where member_id=v_member and idempotency_key=p_idempotency_key;

  if not found then
    return jsonb_build_object('ok',false,'code','BANNER_IDEMPOTENCY_LEDGER_ERROR');
  end if;
  if v_row.action<>v_action or v_row.request_hash<>v_hash then
    return jsonb_build_object(
      'ok',false,'code','BANNER_IDEMPOTENCY_KEY_REUSED','action',v_row.action
    );
  end if;
  if v_row.state='DONE' then
    return jsonb_build_object(
      'ok',true,'apiVersion','402','contract','banner-idempotency-v402',
      'disposition','REPLAY','responseStatus',v_row.response_status,
      'responseBody',v_row.response_body
    );
  end if;
  return jsonb_build_object(
    'ok',true,'apiVersion','402','contract','banner-idempotency-v402',
    'disposition','IN_PROGRESS'
  );
end;
$function$;

revoke all on function private.kinojo_banner_event_json_v402(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_manifest_internal_v402(text,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.kinojo_banner_event_list_v402(text,boolean)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_save_v402(text,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_publish_v402(text,uuid)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_rotation_set_v402(text,text)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_manifest_v402(text,text)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_idempotency_claim_v402(text,text,uuid,text,integer)
  from public, anon, authenticated;

grant execute on function public.kinojo_banner_event_list_v402(text,boolean)
  to service_role;
grant execute on function public.kinojo_banner_event_save_v402(text,uuid,jsonb)
  to service_role;
grant execute on function public.kinojo_banner_event_publish_v402(text,uuid)
  to service_role;
grant execute on function public.kinojo_banner_event_rotation_set_v402(text,text)
  to service_role;
grant execute on function public.kinojo_banner_manifest_v402(text,text)
  to service_role;
grant execute on function public.kinojo_banner_idempotency_claim_v402(text,text,uuid,text,integer)
  to service_role;

-- The previous Edge version may still exist briefly during Server-first deploy.
-- It must fail closed instead of changing one event's image order.
revoke execute on function public.kinojo_banner_event_playback_v400(text,uuid,text)
  from service_role;

comment on table private.kinojo_banner_event_rotation_v402 is
  'DB402 singleton MASTER setting for global formal-event ORDERED or RANDOM_CYCLE rotation.';
comment on function public.kinojo_banner_event_list_v402(text,boolean) is
  'DB402 event manager list with one global eventRotationMode and no event-local playback setting.';
comment on function public.kinojo_banner_event_rotation_set_v402(text,text) is
  'DB402 changes one global formal-event rotation mode after MASTER session validation.';
comment on function public.kinojo_banner_manifest_v402(text,text) is
  'DB402 preserves legacy playlist positions and event item sortOrder while ordering or shuffling formal event groups per page and slot.';
