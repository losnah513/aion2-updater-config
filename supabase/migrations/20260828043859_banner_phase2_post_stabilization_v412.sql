-- KINOJO banner image management phase 2 post-stabilization.
--
-- DB407 expanded the idempotency ledger CHECK constraint for character links,
-- representatives and automatic pools, but the claim function retained the
-- older DB402 action allowlist.  Keep the public signature and replay contract
-- stable while bringing the gate in sync with every mutation accepted by the
-- current kinojo-banner-media Edge Function.

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
    'asset-update','asset-character-set','asset-representative-set',
    'asset-archive','asset-restore','asset-delete',
    'orphan-cleanup',
    'campaign-create','campaign-update','campaign-publish','campaign-pause',
    'campaign-archive','campaign-restore','campaign-delete',
    'event-save','event-publish','event-move','event-rotation','event-pause','event-delete',
    'overlay-upload-prepare','overlay-upload-complete',
    'composite-upload-prepare','composite-upload-complete',
    'auto-pool-save','auto-pool-state','auto-pool-delete',
    'pool-composite-upload-prepare','pool-composite-upload-complete'
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

revoke all on function public.kinojo_banner_idempotency_claim_v402(text,text,uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.kinojo_banner_idempotency_claim_v402(text,text,uuid,text,integer)
  to service_role;

comment on function public.kinojo_banner_idempotency_claim_v402(text,text,uuid,text,integer) is
  'DB412 MASTER-only banner mutation idempotency gate; action allowlist matches the current Edge mutation contract.';
