-- KINOJO My Info phase 2 / stage 3
-- MASTER-only request review, status transition, private asset resolver,
-- and one durable notification event per submitted request.

create table private.member_image_request_admin_events (
  request_id bigint primary key
    references private.member_image_requests(request_id) on delete cascade,
  member_id bigint not null references public.member_codes(id) on delete cascade,
  character_id bigint not null references public.character_master(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp()
);

create index member_image_request_admin_events_member_created_idx
  on private.member_image_request_admin_events (member_id, created_at desc);
create index member_image_request_admin_events_character_created_idx
  on private.member_image_request_admin_events (character_id, created_at desc);

alter table private.member_image_request_admin_events enable row level security;
revoke all on table private.member_image_request_admin_events from public, anon, authenticated;

create or replace function private.kinojo_member_image_request_admin_event_v405()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  if new.status = 'SUBMITTED' and old.status is distinct from new.status then
    insert into private.member_image_request_admin_events(
      request_id, member_id, character_id, created_at
    ) values (
      new.request_id, new.member_id, new.character_id,
      coalesce(new.submitted_at, statement_timestamp())
    )
    on conflict (request_id) do nothing;
  end if;
  return new;
end;
$function$;

revoke all on function private.kinojo_member_image_request_admin_event_v405()
  from public, anon, authenticated;

drop trigger if exists member_image_request_admin_event_v405
  on private.member_image_requests;
create trigger member_image_request_admin_event_v405
after update of status on private.member_image_requests
for each row
when (new.status = 'SUBMITTED' and old.status is distinct from new.status)
execute function private.kinojo_member_image_request_admin_event_v405();

insert into private.member_image_request_admin_events(
  request_id, member_id, character_id, created_at
)
select r.request_id, r.member_id, r.character_id,
       coalesce(r.submitted_at, r.updated_at, r.created_at)
from private.member_image_requests r
where r.status <> 'DRAFT'
on conflict (request_id) do nothing;

create or replace function private.kinojo_member_image_request_admin_scope_v405(
  p_member_id bigint,
  p_character_id bigint
) returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_list jsonb;
begin
  if p_member_id is null or p_member_id <= 0
     or p_character_id is null or p_character_id <= 0 then
    return false;
  end if;
  v_list := public.kinojo_member_character_list_v334(p_member_id);
  if coalesce((v_list ->> 'ok')::boolean, false) is not true
     or nullif(v_list ->> 'memberId', '')::bigint is distinct from p_member_id then
    return false;
  end if;
  return exists (
    select 1
    from jsonb_array_elements(coalesce(v_list -> 'characters', '[]'::jsonb)) value
    where nullif(value ->> 'characterId', '')::bigint = p_character_id
  );
exception when others then
  return false;
end;
$function$;

revoke all on function private.kinojo_member_image_request_admin_scope_v405(bigint,bigint)
  from public, anon, authenticated;

create or replace function public.kinojo_admin_member_image_request_list_v405(
  p_session_token text,
  p_member_id bigint,
  p_character_id bigint,
  p_status text default 'ALL',
  p_limit integer default 50
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_master jsonb;
  v_status text := upper(btrim(coalesce(p_status, 'ALL')));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_rows jsonb;
begin
  v_master := public.kinojo_master_session_validate_v337(p_session_token);
  if coalesce((v_master ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-list-v405',
      'masterBoundaryContract', '337',
      'code', coalesce(nullif(v_master ->> 'code', ''), 'MASTER_REQUIRED'),
      'message', coalesce(nullif(v_master ->> 'message', ''), 'MASTER 권한이 필요합니다.')
    );
  end if;
  if p_member_id is null or p_member_id <= 0 then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-list-v405',
      'code', 'TARGET_MEMBER_ID_REQUIRED',
      'message', '조회할 회원 식별값이 필요합니다.'
    );
  end if;
  if p_character_id is null or p_character_id <= 0 then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-list-v405',
      'code', 'TARGET_CHARACTER_ID_REQUIRED',
      'message', '조회할 캐릭터 식별값이 필요합니다.'
    );
  end if;
  if v_status not in ('ALL','SUBMITTED','IN_PROGRESS','COMPLETED','REJECTED') then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-list-v405',
      'code', 'REQUEST_STATUS_FILTER_INVALID',
      'message', '지원하지 않는 제작 요청 상태 필터입니다.'
    );
  end if;
  if private.kinojo_member_image_request_admin_scope_v405(
    p_member_id, p_character_id
  ) is not true then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-list-v405',
      'code', 'TARGET_CHARACTER_NOT_OWNED',
      'message', '선택한 캐릭터는 대상 회원의 소유 캐릭터가 아닙니다.'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requestId', q.request_id,
        'styleCode', q.style_code,
        'requestNote', q.request_note,
        'status', q.status,
        'submittedAt', q.submitted_at,
        'createdAt', q.created_at,
        'updatedAt', q.updated_at,
        'imageExpiresAt', q.image_expires_at,
        'metadataExpiresAt', q.metadata_expires_at,
        'itemCount', q.item_count,
        'availableImageCount', q.available_image_count,
        'imageAvailable', q.available_image_count > 0,
        'slots', q.slots
      )
      order by q.submitted_at desc, q.request_id desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      r.request_id, r.style_code, r.request_note, r.status,
      r.submitted_at, r.created_at, r.updated_at,
      r.image_expires_at, r.metadata_expires_at,
      count(i.slot)::integer item_count,
      count(i.slot) filter (
        where i.storage_deleted_at is null
          and i.storage_verified_at is not null
          and r.image_expires_at > statement_timestamp()
      )::integer available_image_count,
      jsonb_agg(
        i.slot order by case i.slot
          when 'FRONT' then 1 when 'BACK' then 2 else 3 end
      ) slots
    from private.member_image_requests r
    join private.member_image_request_items i on i.request_id = r.request_id
    where r.member_id = p_member_id
      and r.character_id = p_character_id
      and r.status <> 'DRAFT'
      and r.metadata_expires_at > statement_timestamp()
      and (v_status = 'ALL' or r.status = v_status)
    group by r.request_id
    order by r.submitted_at desc, r.request_id desc
    limit v_limit
  ) q;

  return jsonb_build_object(
    'ok', true,
    'apiVersion', '405',
    'contract', 'admin-member-image-request-list-v405',
    'masterBoundaryContract', '337',
    'privacy', 'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
    'targetMemberId', p_member_id,
    'characterId', p_character_id,
    'status', v_status,
    'rowCount', jsonb_array_length(coalesce(v_rows, '[]'::jsonb)),
    'requests', coalesce(v_rows, '[]'::jsonb)
  );
end;
$function$;

create or replace function public.kinojo_admin_member_image_request_detail_v405(
  p_session_token text,
  p_member_id bigint,
  p_character_id bigint,
  p_request_id bigint
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_master jsonb;
  v_request private.member_image_requests%rowtype;
  v_items jsonb;
  v_history jsonb;
  v_allowed jsonb := '[]'::jsonb;
begin
  v_master := public.kinojo_master_session_validate_v337(p_session_token);
  if coalesce((v_master ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-detail-v405',
      'masterBoundaryContract', '337',
      'code', coalesce(nullif(v_master ->> 'code', ''), 'MASTER_REQUIRED'),
      'message', coalesce(nullif(v_master ->> 'message', ''), 'MASTER 권한이 필요합니다.')
    );
  end if;
  if private.kinojo_member_image_request_admin_scope_v405(
    p_member_id, p_character_id
  ) is not true then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-detail-v405',
      'code', 'TARGET_CHARACTER_NOT_OWNED',
      'message', '선택한 캐릭터는 대상 회원의 소유 캐릭터가 아닙니다.'
    );
  end if;
  if p_request_id is null or p_request_id <= 0 then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-detail-v405',
      'code', 'REQUEST_ID_REQUIRED',
      'message', '확인할 제작 요청 식별값이 필요합니다.'
    );
  end if;

  select * into v_request
  from private.member_image_requests r
  where r.request_id = p_request_id
    and r.member_id = p_member_id
    and r.character_id = p_character_id
    and r.status <> 'DRAFT'
    and r.metadata_expires_at > statement_timestamp()
  limit 1;
  if not found then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-detail-v405',
      'code', 'REQUEST_NOT_FOUND',
      'message', '확인할 수 있는 제작 요청을 찾지 못했습니다.'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slot', i.slot,
        'mimeType', i.mime_type,
        'sizeBytes', i.size_bytes,
        'createdAt', i.created_at,
        'storageVerifiedAt', i.storage_verified_at,
        'available',
          i.storage_deleted_at is null
          and i.storage_verified_at is not null
          and v_request.image_expires_at > statement_timestamp()
      )
      order by case i.slot when 'FRONT' then 1 when 'BACK' then 2 else 3 end
    ),
    '[]'::jsonb
  ) into v_items
  from private.member_image_request_items i
  where i.request_id = v_request.request_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'previousStatus', h.previous_status,
        'newStatus', h.new_status,
        'actorKind', h.actor_kind,
        'createdAt', h.created_at
      )
      order by h.created_at asc, h.history_id asc
    ),
    '[]'::jsonb
  ) into v_history
  from private.member_image_request_status_history h
  where h.request_id = v_request.request_id;

  if v_request.status = 'SUBMITTED' then
    v_allowed := jsonb_build_array('IN_PROGRESS', 'REJECTED');
  elsif v_request.status = 'IN_PROGRESS' then
    v_allowed := jsonb_build_array('COMPLETED', 'REJECTED');
  end if;

  return jsonb_build_object(
    'ok', true,
    'apiVersion', '405',
    'contract', 'admin-member-image-request-detail-v405',
    'masterBoundaryContract', '337',
    'privacy', 'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
    'targetMemberId', p_member_id,
    'characterId', p_character_id,
    'requestId', v_request.request_id,
    'styleCode', v_request.style_code,
    'requestNote', v_request.request_note,
    'status', v_request.status,
    'submittedAt', v_request.submitted_at,
    'updatedAt', v_request.updated_at,
    'imageExpiresAt', v_request.image_expires_at,
    'metadataExpiresAt', v_request.metadata_expires_at,
    'imageAvailable', v_request.image_expires_at > statement_timestamp()
      and exists (
        select 1 from private.member_image_request_items i
        where i.request_id = v_request.request_id
          and i.storage_deleted_at is null
          and i.storage_verified_at is not null
      ),
    'allowedNextStatuses', v_allowed,
    'items', v_items,
    'history', v_history
  );
end;
$function$;

create or replace function public.kinojo_admin_member_image_request_status_v405(
  p_session_token text,
  p_member_id bigint,
  p_character_id bigint,
  p_request_id bigint,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_master jsonb;
  v_actor_member_id bigint;
  v_next text := upper(btrim(coalesce(p_status, '')));
  v_request private.member_image_requests%rowtype;
  v_previous text;
  v_allowed jsonb := '[]'::jsonb;
begin
  v_master := public.kinojo_master_session_validate_v337(p_session_token);
  if coalesce((v_master ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-status-v405',
      'masterBoundaryContract', '337',
      'code', coalesce(nullif(v_master ->> 'code', ''), 'MASTER_REQUIRED'),
      'message', coalesce(nullif(v_master ->> 'message', ''), 'MASTER 권한이 필요합니다.')
    );
  end if;
  v_actor_member_id := nullif(v_master ->> 'memberId', '')::bigint;
  if private.kinojo_member_image_request_admin_scope_v405(
    p_member_id, p_character_id
  ) is not true then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-status-v405',
      'code', 'TARGET_CHARACTER_NOT_OWNED',
      'message', '선택한 캐릭터는 대상 회원의 소유 캐릭터가 아닙니다.'
    );
  end if;
  if p_request_id is null or p_request_id <= 0 then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-status-v405',
      'code', 'REQUEST_ID_REQUIRED',
      'message', '처리할 제작 요청 식별값이 필요합니다.'
    );
  end if;
  if v_next not in ('IN_PROGRESS', 'COMPLETED', 'REJECTED') then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-status-v405',
      'code', 'REQUEST_STATUS_INVALID',
      'message', '지원하지 않는 제작 요청 상태입니다.'
    );
  end if;

  select * into v_request
  from private.member_image_requests r
  where r.request_id = p_request_id
    and r.member_id = p_member_id
    and r.character_id = p_character_id
    and r.status <> 'DRAFT'
    and r.metadata_expires_at > statement_timestamp()
  for update;
  if not found then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-status-v405',
      'code', 'REQUEST_NOT_FOUND',
      'message', '처리할 수 있는 제작 요청을 찾지 못했습니다.'
    );
  end if;

  if v_request.status = v_next then
    if v_request.status = 'SUBMITTED' then
      v_allowed := jsonb_build_array('IN_PROGRESS', 'REJECTED');
    elsif v_request.status = 'IN_PROGRESS' then
      v_allowed := jsonb_build_array('COMPLETED', 'REJECTED');
    end if;
    return jsonb_build_object(
      'ok', true, 'apiVersion', '405',
      'contract', 'admin-member-image-request-status-v405',
      'targetMemberId', p_member_id,
      'characterId', p_character_id,
      'requestId', v_request.request_id,
      'status', v_request.status,
      'updatedAt', v_request.updated_at,
      'allowedNextStatuses', v_allowed,
      'idempotent', true
    );
  end if;

  if not (
    (v_request.status = 'SUBMITTED' and v_next in ('IN_PROGRESS', 'REJECTED'))
    or
    (v_request.status = 'IN_PROGRESS' and v_next in ('COMPLETED', 'REJECTED'))
  ) then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-status-v405',
      'code', 'REQUEST_STATUS_TRANSITION_INVALID',
      'message', '현재 상태에서 선택한 상태로 변경할 수 없습니다.',
      'requestId', v_request.request_id,
      'status', v_request.status
    );
  end if;

  v_previous := v_request.status;
  update private.member_image_requests
  set status = v_next, updated_at = statement_timestamp()
  where request_id = v_request.request_id
  returning * into v_request;

  insert into private.member_image_request_status_history(
    request_id, previous_status, new_status,
    actor_kind, actor_member_id, created_at
  ) values (
    v_request.request_id, v_previous, v_next,
    'MASTER', v_actor_member_id, statement_timestamp()
  );

  if v_request.status = 'IN_PROGRESS' then
    v_allowed := jsonb_build_array('COMPLETED', 'REJECTED');
  end if;

  return jsonb_build_object(
    'ok', true,
    'apiVersion', '405',
    'contract', 'admin-member-image-request-status-v405',
    'masterBoundaryContract', '337',
    'targetMemberId', p_member_id,
    'characterId', p_character_id,
    'requestId', v_request.request_id,
    'previousStatus', v_previous,
    'status', v_request.status,
    'updatedAt', v_request.updated_at,
    'allowedNextStatuses', v_allowed,
    'idempotent', false
  );
end;
$function$;

create or replace function public.kinojo_admin_member_image_request_asset_v405(
  p_session_token text,
  p_member_id bigint,
  p_character_id bigint,
  p_request_id bigint,
  p_slot text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_master jsonb;
  v_slot text := upper(btrim(coalesce(p_slot, '')));
  v_request private.member_image_requests%rowtype;
  v_item private.member_image_request_items%rowtype;
begin
  v_master := public.kinojo_master_session_validate_v337(p_session_token);
  if coalesce((v_master ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-asset-v405',
      'masterBoundaryContract', '337',
      'code', coalesce(nullif(v_master ->> 'code', ''), 'MASTER_REQUIRED'),
      'message', coalesce(nullif(v_master ->> 'message', ''), 'MASTER 권한이 필요합니다.')
    );
  end if;
  if private.kinojo_member_image_request_admin_scope_v405(
    p_member_id, p_character_id
  ) is not true then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-asset-v405',
      'code', 'TARGET_CHARACTER_NOT_OWNED',
      'message', '선택한 캐릭터는 대상 회원의 소유 캐릭터가 아닙니다.'
    );
  end if;
  if p_request_id is null or p_request_id <= 0 then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-asset-v405',
      'code', 'REQUEST_ID_REQUIRED',
      'message', '확인할 제작 요청 식별값이 필요합니다.'
    );
  end if;
  if v_slot not in ('FRONT','BACK','UPPER_BODY') then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-asset-v405',
      'code', 'REQUEST_SLOT_INVALID',
      'message', 'FRONT, BACK, UPPER_BODY 이미지만 확인할 수 있습니다.'
    );
  end if;

  select * into v_request
  from private.member_image_requests r
  where r.request_id = p_request_id
    and r.member_id = p_member_id
    and r.character_id = p_character_id
    and r.status <> 'DRAFT'
    and r.metadata_expires_at > statement_timestamp()
  limit 1;
  if not found then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-asset-v405',
      'code', 'REQUEST_NOT_FOUND',
      'message', '확인할 수 있는 제작 요청을 찾지 못했습니다.'
    );
  end if;
  if v_request.image_expires_at <= statement_timestamp() then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-asset-v405',
      'code', 'REQUEST_IMAGE_EXPIRED',
      'message', '참고 이미지 보존 기간이 끝났습니다.'
    );
  end if;

  select * into v_item
  from private.member_image_request_items i
  where i.request_id = v_request.request_id
    and i.slot = v_slot
    and i.storage_verified_at is not null
    and i.storage_deleted_at is null
  limit 1;
  if not found then
    return jsonb_build_object(
      'ok', false, 'apiVersion', '405',
      'contract', 'admin-member-image-request-asset-v405',
      'code', 'REQUEST_IMAGE_NOT_FOUND',
      'message', '선택한 요청 이미지를 찾지 못했습니다.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'apiVersion', '405',
    'contract', 'admin-member-image-request-asset-v405',
    'masterBoundaryContract', '337',
    'targetMemberId', p_member_id,
    'characterId', p_character_id,
    'requestId', v_request.request_id,
    'slot', v_item.slot,
    'bucket', 'kinojo-member-reference',
    'objectPath', v_item.object_path,
    'mimeType', v_item.mime_type,
    'sizeBytes', v_item.size_bytes,
    'uploadedAt', v_item.storage_verified_at,
    'expiresAt', v_request.image_expires_at
  );
end;
$function$;

create or replace function public.kinojo_web_notification_summary_v316(
  p_pass_key text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_member public.member_codes%rowtype;
  v_support_count integer := 0;
  v_code_count integer := 0;
  v_image_pending_count integer := 0;
  v_image_request_pending_count integer := 0;
  v_latest_support jsonb;
  v_latest_code jsonb;
  v_latest_reference jsonb;
  v_latest_character_image jsonb;
  v_latest_image_request jsonb;
  v_master jsonb;
begin
  select * into v_member
  from public.kinojo_member_from_web_credential_v326(p_pass_key)
  limit 1;
  if not found then
    return jsonb_build_object('ok',false,'code','SESSION_INVALID','totalCount',0);
  end if;

  select count(*)::integer into v_support_count
  from public.sanctuary_party_support_requests r
  where r.status='PENDING'
    and private.kinojo_sanctuary_roster_can_manage_force_v308(
      v_member.id,r.sanctuary_id,r.team_no
    );

  if coalesce(v_member.can_manage,false) or coalesce(v_member.level,0)>=3 then
    select count(*)::integer into v_code_count
    from public.code_requests cr where cr.status='PENDING';

    select jsonb_build_object(
      'id',cr.id,'requestId',cr.request_id,
      'characterName',cr.character_name,'createdAt',cr.created_at
    ) into v_latest_code
    from public.code_requests cr
    where cr.status='PENDING'
    order by cr.created_at desc,cr.id desc
    limit 1;
  end if;

  select jsonb_build_object(
    'id',r.id,'characterName',c.character_name,'sanctuaryCode',r.sanctuary_id,
    'teamNo',r.team_no,'partyNo',r.party_no,'slotNo',r.slot_no,
    'createdAt',r.created_at
  ) into v_latest_support
  from public.sanctuary_party_support_requests r
  join public.character_master c on c.id=r.character_master_id
  where r.status='PENDING'
    and private.kinojo_sanctuary_roster_can_manage_force_v308(
      v_member.id,r.sanctuary_id,r.team_no
    )
  order by r.created_at desc,r.id desc
  limit 1;

  v_master := public.kinojo_master_session_validate_v337(p_pass_key);
  if coalesce((v_master->>'ok')::boolean,false) is true then
    select count(*)::integer into v_image_pending_count
    from private.member_image_admin_review_rollup_v392 x
    where x.pending
      and not exists (
        select 1
        from private.member_image_requests r
        where r.member_id = x.member_id
          and r.character_id = x.latest_character_id
          and r.submitted_at = x.latest_uploaded_at
          and r.status <> 'DRAFT'
      );

    select jsonb_build_object(
      'memberId',x.member_id,
      'memberMainCharacterName',x.main_character_name,
      'characterId',x.latest_character_id,
      'characterName',x.latest_character_name,
      'imageType',x.latest_image_kind,
      'slot',x.latest_slot,
      'uploadedAt',x.latest_uploaded_at
    ) into v_latest_character_image
    from private.member_image_admin_review_rollup_v392 x
    where x.pending
      and not exists (
        select 1
        from private.member_image_requests r
        where r.member_id = x.member_id
          and r.character_id = x.latest_character_id
          and r.submitted_at = x.latest_uploaded_at
          and r.status <> 'DRAFT'
      )
    order by x.latest_uploaded_at desc,x.member_id desc
    limit 1;

    select count(*)::integer into v_image_request_pending_count
    from private.member_image_requests r
    where r.status in ('SUBMITTED','IN_PROGRESS')
      and r.metadata_expires_at > statement_timestamp();

    select jsonb_build_object(
      'requestId',e.request_id,
      'memberId',e.member_id,
      'memberMainCharacterName',m.main_character_name,
      'characterId',e.character_id,
      'characterName',c.character_name,
      'styleCode',r.style_code,
      'status',r.status,
      'itemCount',(
        select count(*)::integer
        from private.member_image_request_items i
        where i.request_id=e.request_id
      ),
      'createdAt',e.created_at
    ) into v_latest_image_request
    from private.member_image_request_admin_events e
    join private.member_image_requests r on r.request_id=e.request_id
    join public.member_codes m on m.id=e.member_id
    join public.character_master c on c.id=e.character_id
    where r.metadata_expires_at > statement_timestamp()
    order by e.created_at desc,e.request_id desc
    limit 1;

    select jsonb_build_object(
      'characterId',r.character_id,'characterName',c.character_name,
      'slot',r.slot,'uploadedAt',r.uploaded_at
    ) into v_latest_reference
    from private.member_character_reference_images r
    join public.character_master c on c.id=r.character_id
    where r.expires_at > statement_timestamp()
      and r.slot in ('FRONT','BACK','UPPER_BODY')
    order by r.uploaded_at desc,r.character_id desc,r.slot desc
    limit 1;
  end if;

  return jsonb_build_object(
    'ok',true,
    'contractVersion',316,
    'notificationFeatureVersion',405,
    'memberId',v_member.id,
    'supportRequestCount',v_support_count,
    'codeRequestCount',v_code_count,
    'memberImagePendingCount',v_image_pending_count,
    'memberImageRequestPendingCount',v_image_request_pending_count,
    'totalCount',
      v_support_count+v_code_count+v_image_pending_count+
      v_image_request_pending_count,
    'latestSupportRequest',v_latest_support,
    'latestCodeRequest',v_latest_code,
    'latestReferenceUpload',v_latest_reference,
    'latestCharacterImageUpload',v_latest_character_image,
    'latestImageRequest',v_latest_image_request
  );
end;
$function$;

revoke all on function public.kinojo_admin_member_image_request_list_v405(
  text,bigint,bigint,text,integer
) from public, anon, authenticated;
revoke all on function public.kinojo_admin_member_image_request_detail_v405(
  text,bigint,bigint,bigint
) from public, anon, authenticated;
revoke all on function public.kinojo_admin_member_image_request_status_v405(
  text,bigint,bigint,bigint,text
) from public, anon, authenticated;
revoke all on function public.kinojo_admin_member_image_request_asset_v405(
  text,bigint,bigint,bigint,text
) from public, anon, authenticated;

grant execute on function public.kinojo_admin_member_image_request_list_v405(
  text,bigint,bigint,text,integer
) to service_role;
grant execute on function public.kinojo_admin_member_image_request_detail_v405(
  text,bigint,bigint,bigint
) to service_role;
grant execute on function public.kinojo_admin_member_image_request_status_v405(
  text,bigint,bigint,bigint,text
) to service_role;
grant execute on function public.kinojo_admin_member_image_request_asset_v405(
  text,bigint,bigint,bigint,text
) to service_role;

revoke all on function public.kinojo_web_notification_summary_v316(text)
  from public;
grant execute on function public.kinojo_web_notification_summary_v316(text)
  to anon, authenticated, service_role;

comment on table private.member_image_request_admin_events is
  'Exactly one durable MASTER notification event per submitted member image request.';
comment on function public.kinojo_admin_member_image_request_list_v405(
  text,bigint,bigint,text,integer
) is 'MASTER-only request metadata list without private Storage selectors.';
comment on function public.kinojo_admin_member_image_request_detail_v405(
  text,bigint,bigint,bigint
) is 'MASTER-only request detail and audit history without private Storage selectors.';
comment on function public.kinojo_admin_member_image_request_status_v405(
  text,bigint,bigint,bigint,text
) is 'MASTER-only audited SUBMITTED to IN_PROGRESS/REJECTED and IN_PROGRESS to COMPLETED/REJECTED transition.';
comment on function public.kinojo_admin_member_image_request_asset_v405(
  text,bigint,bigint,bigint,text
) is 'MASTER-only private request image resolver for Edge signed preview or download.';
