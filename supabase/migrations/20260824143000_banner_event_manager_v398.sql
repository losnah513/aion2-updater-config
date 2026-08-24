-- Stage 6 event manager and Stage 5 upload idempotency repair.
--
-- DB397 updated the claim RPC allowlist but left the ledger table check
-- constraint on the older action set. This migration aligns both layers and
-- adds event list ordering, group pause, and permanent group deletion RPCs.

alter table private.kinojo_banner_idempotency_v388
  drop constraint if exists kinojo_banner_idempotency_action_v388_chk;

alter table private.kinojo_banner_idempotency_v388
  add constraint kinojo_banner_idempotency_action_v388_chk check (action in (
    'upload-prepare','upload-complete',
    'asset-update','asset-archive','asset-restore','asset-delete',
    'orphan-cleanup',
    'campaign-create','campaign-update','campaign-publish','campaign-pause',
    'campaign-archive','campaign-restore','campaign-delete',
    'event-save','event-publish','event-move','event-pause','event-delete',
    'overlay-upload-prepare','overlay-upload-complete',
    'composite-upload-prepare','composite-upload-complete'
  ));

create sequence if not exists private.kinojo_banner_event_manager_order_v398_seq;

alter table private.kinojo_banner_event_groups_v391
  add column if not exists manager_order bigint;

with ranked as (
  select event_group_id,
         row_number() over (order by updated_at,event_group_id)::bigint as manager_order
  from private.kinojo_banner_event_groups_v391
)
update private.kinojo_banner_event_groups_v391 g
   set manager_order=ranked.manager_order
  from ranked
 where ranked.event_group_id=g.event_group_id
   and g.manager_order is null;

select setval(
  'private.kinojo_banner_event_manager_order_v398_seq',
  greatest(coalesce((select max(manager_order) from private.kinojo_banner_event_groups_v391),0)+1,1),
  false
);

alter table private.kinojo_banner_event_groups_v391
  alter column manager_order set default nextval('private.kinojo_banner_event_manager_order_v398_seq'),
  alter column manager_order set not null;

alter sequence private.kinojo_banner_event_manager_order_v398_seq
  owned by private.kinojo_banner_event_groups_v391.manager_order;

create unique index if not exists kinojo_banner_event_manager_order_v398_uk
  on private.kinojo_banner_event_groups_v391(manager_order);

create or replace function private.kinojo_banner_event_json_v398(
  p_event_group_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_event jsonb;
  v_order bigint;
begin
  v_event := private.kinojo_banner_event_json_v396(p_event_group_id);
  if v_event is null then return null; end if;
  select manager_order into v_order
  from private.kinojo_banner_event_groups_v391
  where event_group_id=p_event_group_id;
  return v_event || jsonb_build_object('managerOrder',v_order);
end;
$function$;

create or replace function public.kinojo_banner_event_list_v398(
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
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;

  select coalesce(
    jsonb_agg(private.kinojo_banner_event_json_v398(g.event_group_id)
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
    'ok',true,'apiVersion','398','contract','banner-event-list-v398',
    'events',v_events,'legacyCampaigns',v_legacy
  );
end;
$function$;

create or replace function public.kinojo_banner_event_move_v398(
  p_session_token text,
  p_event_group_id uuid,
  p_direction text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_direction text := upper(btrim(coalesce(p_direction,'')));
  v_target private.kinojo_banner_event_groups_v391;
  v_neighbor private.kinojo_banner_event_groups_v391;
  v_temporary_order bigint;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  if v_direction not in ('UP','DOWN') then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_MOVE_DIRECTION_INVALID');
  end if;

  select * into v_target
  from private.kinojo_banner_event_groups_v391
  where event_group_id=p_event_group_id
  for update;
  if not found then return jsonb_build_object('ok',false,'code','BANNER_EVENT_NOT_FOUND'); end if;

  if v_direction='UP' then
    select * into v_neighbor
    from private.kinojo_banner_event_groups_v391
    where event_type=v_target.event_type and manager_order>v_target.manager_order
    order by manager_order asc,event_group_id
    limit 1
    for update;
  else
    select * into v_neighbor
    from private.kinojo_banner_event_groups_v391
    where event_type=v_target.event_type and manager_order<v_target.manager_order
    order by manager_order desc,event_group_id
    limit 1
    for update;
  end if;

  if not found then
    return jsonb_build_object(
      'ok',true,'apiVersion','398','contract','banner-event-move-v398',
      'eventGroupId',p_event_group_id,'direction',v_direction,'moved',false,
      'event',private.kinojo_banner_event_json_v398(p_event_group_id)
    );
  end if;

  v_temporary_order := nextval('private.kinojo_banner_event_manager_order_v398_seq');
  update private.kinojo_banner_event_groups_v391
     set manager_order=v_temporary_order
   where event_group_id=v_target.event_group_id;
  update private.kinojo_banner_event_groups_v391
     set manager_order=v_target.manager_order
   where event_group_id=v_neighbor.event_group_id;
  update private.kinojo_banner_event_groups_v391
     set manager_order=v_neighbor.manager_order
   where event_group_id=v_target.event_group_id;

  return jsonb_build_object(
    'ok',true,'apiVersion','398','contract','banner-event-move-v398',
    'eventGroupId',p_event_group_id,'direction',v_direction,'moved',true,
    'event',private.kinojo_banner_event_json_v398(p_event_group_id)
  );
end;
$function$;

create or replace function public.kinojo_banner_event_pause_v398(
  p_session_token text,
  p_event_group_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_campaign record;
  v_result jsonb;
  v_count integer := 0;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;

  perform 1 from private.kinojo_banner_event_groups_v391
  where event_group_id=p_event_group_id for update;
  if not found then return jsonb_build_object('ok',false,'code','BANNER_EVENT_NOT_FOUND'); end if;

  for v_campaign in
    select campaign_id
    from public.kinojo_banner_campaigns
    where event_group_id=p_event_group_id and status='PUBLISHED'
    order by campaign_id
    for update
  loop
    v_result := private.kinojo_banner_campaign_state_v386(
      p_session_token,v_campaign.campaign_id,'PAUSE'
    );
    if coalesce((v_result->>'ok')::boolean,false) is not true then
      raise exception using errcode='P0001',message=v_result::text;
    end if;
    v_count := v_count+1;
  end loop;

  if v_count>0 then
    update private.kinojo_banner_event_groups_v391
       set updated_by_member_id=(v_gate->>'memberId')::bigint,
           updated_at=clock_timestamp()
     where event_group_id=p_event_group_id;
  end if;

  return jsonb_build_object(
    'ok',true,'apiVersion','398','contract','banner-event-pause-v398',
    'eventGroupId',p_event_group_id,'pausedCampaignCount',v_count,
    'event',private.kinojo_banner_event_json_v398(p_event_group_id)
  );
exception
  when sqlstate 'P0001' then
    return coalesce(nullif(sqlerrm,'')::jsonb,
      jsonb_build_object('ok',false,'code','BANNER_EVENT_PAUSE_FAILED'));
end;
$function$;

create or replace function public.kinojo_banner_event_delete_v398(
  p_session_token text,
  p_event_group_id uuid,
  p_expected_name text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_group private.kinojo_banner_event_groups_v391;
  v_campaign_count integer;
  v_item_count integer;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;

  select * into v_group
  from private.kinojo_banner_event_groups_v391
  where event_group_id=p_event_group_id
  for update;
  if not found then return jsonb_build_object('ok',false,'code','BANNER_EVENT_NOT_FOUND'); end if;

  if btrim(coalesce(p_expected_name,''))=''
     or p_expected_name is distinct from v_group.event_name then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_DELETE_CONFIRMATION_MISMATCH');
  end if;
  if exists (
    select 1 from public.kinojo_banner_campaigns
    where event_group_id=p_event_group_id and status='PUBLISHED'
  ) then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_DELETE_PAUSE_REQUIRED');
  end if;

  select count(*)::integer into v_campaign_count
  from public.kinojo_banner_campaigns where event_group_id=p_event_group_id;
  select count(*)::integer into v_item_count
  from public.kinojo_banner_campaign_items i
  join public.kinojo_banner_campaigns c on c.campaign_id=i.campaign_id
  where c.event_group_id=p_event_group_id;

  delete from private.kinojo_banner_event_groups_v391
  where event_group_id=p_event_group_id;

  return jsonb_build_object(
    'ok',true,'apiVersion','398','contract','banner-event-delete-v398',
    'eventGroupId',p_event_group_id,'eventName',v_group.event_name,
    'deletedCampaignCount',v_campaign_count,'deletedItemCount',v_item_count,
    'permanent',true
  );
end;
$function$;

create or replace function public.kinojo_banner_idempotency_claim_v388(
  p_session_token text,
  p_action text,
  p_idempotency_key uuid,
  p_request_hash text,
  p_ttl_seconds integer default 86400
)
returns jsonb
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
    'event-save','event-publish','event-move','event-pause','event-delete',
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
      'ok',true,'apiVersion','388','contract','banner-idempotency-v388',
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
      'ok',true,'apiVersion','388','contract','banner-idempotency-v388',
      'disposition','REPLAY','responseStatus',v_row.response_status,
      'responseBody',v_row.response_body
    );
  end if;
  return jsonb_build_object(
    'ok',true,'apiVersion','388','contract','banner-idempotency-v388',
    'disposition','IN_PROGRESS'
  );
end;
$function$;

revoke all on function private.kinojo_banner_event_json_v398(uuid) from public, anon, authenticated, service_role;
revoke all on function public.kinojo_banner_event_list_v398(text,boolean) from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_move_v398(text,uuid,text) from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_pause_v398(text,uuid) from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_delete_v398(text,uuid,text) from public, anon, authenticated;
revoke all on function public.kinojo_banner_idempotency_claim_v388(text,text,uuid,text,integer) from public, anon, authenticated;

grant execute on function public.kinojo_banner_event_list_v398(text,boolean) to service_role;
grant execute on function public.kinojo_banner_event_move_v398(text,uuid,text) to service_role;
grant execute on function public.kinojo_banner_event_pause_v398(text,uuid) to service_role;
grant execute on function public.kinojo_banner_event_delete_v398(text,uuid,text) to service_role;
grant execute on function public.kinojo_banner_idempotency_claim_v388(text,text,uuid,text,integer) to service_role;

comment on function public.kinojo_banner_event_list_v398(text,boolean) is
  'DB398: ordered Stage 6 event manager list';
comment on function public.kinojo_banner_event_move_v398(text,uuid,text) is
  'DB398: move an event within its MAIN or SIDE manager list';
comment on function public.kinojo_banner_event_pause_v398(text,uuid) is
  'DB398: pause all published campaigns in an event group';
comment on function public.kinojo_banner_event_delete_v398(text,uuid,text) is
  'DB398: permanently delete a non-published event group after exact-name confirmation';
comment on function public.kinojo_banner_idempotency_claim_v388(text,text,uuid,text,integer) is
  'DB398: v388 ledger with Stage 5 uploads and Stage 6 event management mutations';
