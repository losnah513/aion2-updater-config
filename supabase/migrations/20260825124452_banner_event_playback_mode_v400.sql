-- Event manager playback order: ORDERED or RANDOM.
--
-- The event group is the source of truth. Its setting is copied to every
-- campaign in the group so the manifest can shuffle each campaign without
-- changing legacy, ungrouped campaign behaviour.

alter table public.kinojo_banner_campaigns
  drop constraint if exists kinojo_banner_campaign_playback_v391_chk;

alter table public.kinojo_banner_campaigns
  add constraint kinojo_banner_campaign_playback_v400_chk check (
    playback_mode in ('WEIGHTED','ORDERED','RANDOM')
  );

alter table private.kinojo_banner_event_groups_v391
  add column if not exists playback_mode text;

update private.kinojo_banner_event_groups_v391
   set playback_mode='ORDERED'
 where playback_mode is null;

alter table private.kinojo_banner_event_groups_v391
  alter column playback_mode set default 'ORDERED',
  alter column playback_mode set not null;

alter table private.kinojo_banner_event_groups_v391
  drop constraint if exists kinojo_banner_event_group_playback_v400_chk;

alter table private.kinojo_banner_event_groups_v391
  add constraint kinojo_banner_event_group_playback_v400_chk check (
    playback_mode in ('ORDERED','RANDOM')
  );

create or replace function private.kinojo_banner_event_json_v400(
  p_event_group_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_event jsonb;
  v_playback_mode text;
begin
  v_event := private.kinojo_banner_event_json_v398(p_event_group_id);
  if v_event is null then return null; end if;

  select playback_mode into v_playback_mode
  from private.kinojo_banner_event_groups_v391
  where event_group_id=p_event_group_id;

  return v_event || jsonb_build_object(
    'playbackMode',coalesce(v_playback_mode,'ORDERED')
  );
end;
$function$;

create or replace function public.kinojo_banner_event_list_v400(
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
    jsonb_agg(private.kinojo_banner_event_json_v400(g.event_group_id)
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
    'ok',true,'apiVersion','400','contract','banner-event-list-v400',
    'events',v_events,'legacyCampaigns',v_legacy
  );
end;
$function$;

create or replace function public.kinojo_banner_event_save_v400(
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
  v_playback_mode text;
  v_member_id bigint;
begin
  v_result := public.kinojo_banner_event_save_v396(
    p_session_token,p_event_group_id,p_payload
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;

  v_group_id := (v_result->>'eventGroupId')::uuid;
  select playback_mode,updated_by_member_id
    into v_playback_mode,v_member_id
  from private.kinojo_banner_event_groups_v391
  where event_group_id=v_group_id;

  update public.kinojo_banner_campaigns
     set playback_mode=coalesce(v_playback_mode,'ORDERED'),
         updated_by_member_id=coalesce(v_member_id,updated_by_member_id),
         updated_at=clock_timestamp()
   where event_group_id=v_group_id
     and playback_mode is distinct from coalesce(v_playback_mode,'ORDERED');

  return v_result || jsonb_build_object(
    'apiVersion','400','contract','banner-event-save-v400',
    'event',private.kinojo_banner_event_json_v400(v_group_id)
  );
end;
$function$;

create or replace function public.kinojo_banner_event_publish_v400(
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

  return v_result || jsonb_build_object(
    'apiVersion','400','contract','banner-event-publish-v400',
    'event',private.kinojo_banner_event_json_v400(p_event_group_id)
  );
end;
$function$;

create or replace function public.kinojo_banner_event_playback_v400(
  p_session_token text,
  p_event_group_id uuid,
  p_playback_mode text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_mode text := upper(btrim(coalesce(p_playback_mode,'')));
  v_member_id bigint;
  v_updated_count integer := 0;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  if v_mode not in ('ORDERED','RANDOM') then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_PLAYBACK_MODE_INVALID');
  end if;
  v_member_id := (v_gate->>'memberId')::bigint;

  perform 1
  from private.kinojo_banner_event_groups_v391
  where event_group_id=p_event_group_id
  for update;
  if not found then return jsonb_build_object('ok',false,'code','BANNER_EVENT_NOT_FOUND'); end if;

  update private.kinojo_banner_event_groups_v391
     set playback_mode=v_mode,
         updated_by_member_id=v_member_id,
         updated_at=clock_timestamp()
   where event_group_id=p_event_group_id;

  update public.kinojo_banner_campaigns
     set playback_mode=v_mode,
         updated_by_member_id=v_member_id,
         updated_at=clock_timestamp()
   where event_group_id=p_event_group_id
     and playback_mode is distinct from v_mode;
  get diagnostics v_updated_count = row_count;

  return jsonb_build_object(
    'ok',true,'apiVersion','400','contract','banner-event-playback-v400',
    'eventGroupId',p_event_group_id,'playbackMode',v_mode,
    'updatedCampaignCount',v_updated_count,
    'event',private.kinojo_banner_event_json_v400(p_event_group_id)
  );
end;
$function$;

create or replace function private.kinojo_banner_manifest_internal_v400(
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
  v_now timestamptz := coalesce(p_now,statement_timestamp());
  v_base jsonb;
  v_playlist jsonb := '[]'::jsonb;
  v_manifest_version text;
  v_seed text;
begin
  v_base := private.kinojo_banner_manifest_internal_v396(
    p_page_code,p_slot_code,v_now
  );
  if coalesce((v_base->>'ok')::boolean,false) is not true then return v_base; end if;

  v_seed := floor(extract(epoch from v_now)/300.0)::bigint::text;

  with source as (
    select
      p.item,
      p.ordinality,
      c.campaign_id,
      c.priority,
      coalesce(c.published_at,c.created_at) as campaign_started_at,
      i.item_id,
      i.sort_order,
      coalesce(g.playback_mode,'ORDERED') as playback_mode,
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
  )
  select coalesce(jsonb_agg(
    source.item || jsonb_build_object('playbackMode',source.playback_mode)
    order by
      source.exposure_ticket,
      source.priority desc,
      source.campaign_started_at,
      source.campaign_id,
      case when source.playback_mode='RANDOM' then null else source.sort_order end nulls last,
      case when source.playback_mode='RANDOM' then
        md5(v_seed||'|'||source.campaign_id::text||'|'||
          source.exposure_ticket::text||'|'||source.item_id::text)
      else null end nulls last,
      source.item_id
  ),'[]'::jsonb)
  into v_playlist
  from source;

  v_manifest_version := 'bm400-'||substr(md5(
    coalesce(v_base->>'manifestVersion','')||'|'||v_playlist::text
  ),1,24);

  return v_base || jsonb_build_object(
    'apiVersion','400',
    'contract','banner-manifest-internal-v400',
    'manifestVersion',v_manifest_version,
    'playbackOrderMode','EVENT_ORDERED_RANDOM',
    'playlist',v_playlist
  );
end;
$function$;

create or replace function public.kinojo_banner_manifest_v400(
  p_page_code text,
  p_slot_code text
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.kinojo_banner_manifest_internal_v400(
    p_page_code,p_slot_code,statement_timestamp()
  );
$function$;

alter table private.kinojo_banner_idempotency_v388
  drop constraint if exists kinojo_banner_idempotency_action_v388_chk;

alter table private.kinojo_banner_idempotency_v388
  add constraint kinojo_banner_idempotency_action_v388_chk check (action in (
    'upload-prepare','upload-complete',
    'asset-update','asset-archive','asset-restore','asset-delete',
    'orphan-cleanup',
    'campaign-create','campaign-update','campaign-publish','campaign-pause',
    'campaign-archive','campaign-restore','campaign-delete',
    'event-save','event-publish','event-move','event-playback','event-pause','event-delete',
    'overlay-upload-prepare','overlay-upload-complete',
    'composite-upload-prepare','composite-upload-complete'
  ));

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
    'event-save','event-publish','event-move','event-playback','event-pause','event-delete',
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

revoke all on function private.kinojo_banner_event_json_v400(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_manifest_internal_v400(text,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.kinojo_banner_event_list_v400(text,boolean)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_save_v400(text,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_publish_v400(text,uuid)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_playback_v400(text,uuid,text)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_manifest_v400(text,text)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_idempotency_claim_v388(text,text,uuid,text,integer)
  from public, anon, authenticated;

grant execute on function public.kinojo_banner_event_list_v400(text,boolean)
  to service_role;
grant execute on function public.kinojo_banner_event_save_v400(text,uuid,jsonb)
  to service_role;
grant execute on function public.kinojo_banner_event_publish_v400(text,uuid)
  to service_role;
grant execute on function public.kinojo_banner_event_playback_v400(text,uuid,text)
  to service_role;
grant execute on function public.kinojo_banner_manifest_v400(text,text)
  to service_role;
grant execute on function public.kinojo_banner_idempotency_claim_v388(text,text,uuid,text,integer)
  to service_role;

comment on function public.kinojo_banner_event_list_v400(text,boolean) is
  'DB400: ordered event manager list with event playback mode';
comment on function public.kinojo_banner_event_save_v400(text,uuid,jsonb) is
  'DB400: event save preserving the group playback mode';
comment on function public.kinojo_banner_event_publish_v400(text,uuid) is
  'DB400: event publish returning the group playback mode';
comment on function public.kinojo_banner_event_playback_v400(text,uuid,text) is
  'DB400: switch an event and every linked campaign between ORDERED and RANDOM playback';
comment on function public.kinojo_banner_manifest_v400(text,text) is
  'DB400: five-minute deterministic random order for RANDOM event groups; existing ordered and legacy campaigns are unchanged';
