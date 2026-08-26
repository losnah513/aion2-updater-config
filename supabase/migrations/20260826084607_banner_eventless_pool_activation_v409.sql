-- Stage 7 activation hardening: an eligible automatic pool can activate an
-- otherwise empty slot, while formal events still suppress automatic pools.

create or replace function private.kinojo_banner_manifest_internal_v409(
  p_page_code text,
  p_slot_code text,
  p_now timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_base jsonb;
  v_auto jsonb;
  v_playlist jsonb;
  v_has_formal boolean:=false;
  v_next_boundary timestamptz;
  v_valid_until timestamptz;
begin
  v_base:=private.kinojo_banner_manifest_internal_v402(p_page_code,p_slot_code,p_now);
  if coalesce((v_base->>'ok')::boolean,false) is not true then return v_base; end if;

  select exists(
    select 1
    from pg_catalog.jsonb_array_elements(coalesce(v_base->'playlist','[]'::jsonb)) item
    join public.kinojo_banner_campaigns c
      on c.campaign_id=(item->>'campaignId')::bigint
    where c.event_group_id is not null
  ) into v_has_formal;
  if v_has_formal then return v_base; end if;

  v_auto:=private.kinojo_banner_auto_playlist_v407(p_page_code,p_slot_code,p_now);
  if pg_catalog.jsonb_array_length(v_auto)=0 then return v_base; end if;

  v_playlist:=v_auto||coalesce(v_base->'playlist','[]'::jsonb);
  select pg_catalog.min(boundary_at) into v_next_boundary from (
    select p.starts_at boundary_at from public.kinojo_banner_auto_pools_v407 p
    where p.is_enabled and p.starts_at>p_now
      and pg_catalog.upper(pg_catalog.btrim(p_page_code))=any(p.target_pages)
      and pg_catalog.upper(pg_catalog.btrim(p_slot_code))=any(p.slot_codes)
    union all
    select p.ends_at from public.kinojo_banner_auto_pools_v407 p
    where p.is_enabled and p.ends_at>p_now
      and pg_catalog.upper(pg_catalog.btrim(p_page_code))=any(p.target_pages)
      and pg_catalog.upper(pg_catalog.btrim(p_slot_code))=any(p.slot_codes)
  ) boundaries where boundary_at is not null;
  v_valid_until:=least(
    coalesce((v_base->>'validUntil')::timestamptz,p_now+interval '5 minutes'),
    coalesce(v_next_boundary,'infinity'::timestamptz)
  );
  return v_base||pg_catalog.jsonb_build_object(
    'active',true,
    'reason',null,
    'apiVersion','409','contract','banner-manifest-internal-v409',
    'manifestVersion','bm409-'||pg_catalog.substr(pg_catalog.md5(coalesce(v_base->>'manifestVersion','')||'|'||v_playlist::text),1,24),
    'validUntil',pg_catalog.to_char(v_valid_until at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI:SS')||'+09:00',
    'eventlessAutoPoolMode','FORMAL_EVENT_EMPTY_ONLY',
    'autoPoolPriority','BEFORE_LEGACY_DEFAULT',
    'activeAutoPoolItemCount',pg_catalog.jsonb_array_length(v_auto),
    'playlist',v_playlist
  );
end
$function$;

create or replace function public.kinojo_banner_manifest_v409(
  p_page_code text,
  p_slot_code text
) returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $function$
  select private.kinojo_banner_manifest_internal_v409(
    p_page_code,p_slot_code,statement_timestamp()
  )
$function$;

revoke all on function private.kinojo_banner_manifest_internal_v409(text,text,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function public.kinojo_banner_manifest_v409(text,text)
  from public,anon,authenticated;
grant execute on function public.kinojo_banner_manifest_v409(text,text)
  to service_role;

comment on function public.kinojo_banner_manifest_v409(text,text) is
  'Anonymous manifest: formal events suppress automatic pools; eligible eventless automatic pools activate empty slots and precede legacy/default items.';
