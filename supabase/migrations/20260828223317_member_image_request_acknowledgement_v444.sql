-- KINOJO My Info reference-image request acknowledgement contract v444.
-- Collapse the admin-facing upload/review and production-status workflows into
-- one submitted request that is dismissed permanently by one MASTER acknowledgement.

alter table private.member_image_requests
  add column acknowledged_at timestamptz,
  add column acknowledged_by_member_id bigint;

alter table private.member_image_requests
  add constraint member_image_requests_acknowledged_by_fkey
  foreign key (acknowledged_by_member_id)
  references public.member_codes(id)
  on delete set null;

-- Terminal legacy requests were already handled. Mark them acknowledged before
-- collapsing legacy admin lifecycle values so they never notify again.
update private.member_image_requests r
set acknowledged_at = coalesce(r.updated_at, r.submitted_at, r.created_at),
    acknowledged_by_member_id = (
      select h.actor_member_id
      from private.member_image_request_status_history h
      where h.request_id = r.request_id
        and h.actor_kind = 'MASTER'
        and h.actor_member_id is not null
      order by h.created_at desc, h.history_id desc
      limit 1
    )
where r.status in ('COMPLETED', 'REJECTED')
  and r.acknowledged_at is null;

update private.member_image_requests
set status = 'SUBMITTED'
where status in ('IN_PROGRESS', 'COMPLETED', 'REJECTED');

alter table private.member_image_requests
  drop constraint member_image_requests_status_chk;

alter table private.member_image_requests
  add constraint member_image_requests_status_chk
  check (status in ('DRAFT', 'SUBMITTED', 'CANCELLED'));

drop index if exists private.member_image_requests_active_status_idx;

create index member_image_requests_pending_ack_idx
  on private.member_image_requests (submitted_at desc, request_id desc)
  where status = 'SUBMITTED' and acknowledged_at is null;

create index member_image_requests_acknowledged_idx
  on private.member_image_requests (acknowledged_at desc, request_id desc)
  where status = 'SUBMITTED' and acknowledged_at is not null;

create or replace function public.kinojo_admin_member_image_request_ack_v444(
  p_session_token text,
  p_member_id bigint,
  p_character_id bigint,
  p_request_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_master jsonb;
  v_actor_member_id bigint;
  v_request private.member_image_requests%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  v_master := public.kinojo_master_session_validate_v337(p_session_token);
  if coalesce((v_master ->> 'ok')::boolean, false) is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'apiVersion', '444',
      'contract', 'admin-member-image-request-ack-v444',
      'masterBoundaryContract', '337',
      'code', coalesce(nullif(v_master ->> 'code', ''), 'MASTER_REQUIRED'),
      'message', coalesce(nullif(v_master ->> 'message', ''), 'MASTER 권한이 필요합니다.')
    );
  end if;
  v_actor_member_id := nullif(v_master ->> 'memberId', '')::bigint;

  if private.kinojo_member_image_request_admin_scope_v405(
    p_member_id, p_character_id
  ) is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'apiVersion', '444',
      'contract', 'admin-member-image-request-ack-v444',
      'code', 'TARGET_CHARACTER_NOT_OWNED',
      'message', '선택한 캐릭터는 대상 회원의 소유 캐릭터가 아닙니다.'
    );
  end if;

  if p_request_id is null or p_request_id <= 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'apiVersion', '444',
      'contract', 'admin-member-image-request-ack-v444',
      'code', 'REQUEST_ID_REQUIRED',
      'message', '확인할 참고 이미지 제작 요청 식별값이 필요합니다.'
    );
  end if;

  select * into v_request
  from private.member_image_requests r
  where r.request_id = p_request_id
    and r.member_id = p_member_id
    and r.character_id = p_character_id
    and r.status = 'SUBMITTED'
    and r.metadata_expires_at > v_now
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'apiVersion', '444',
      'contract', 'admin-member-image-request-ack-v444',
      'code', 'REQUEST_NOT_FOUND',
      'message', '확인할 수 있는 참고 이미지 제작 요청을 찾지 못했습니다.'
    );
  end if;

  if v_request.acknowledged_at is null then
    update private.member_image_requests
    set acknowledged_at = v_now,
        acknowledged_by_member_id = v_actor_member_id
    where request_id = v_request.request_id
    returning * into v_request;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'apiVersion', '444',
    'contract', 'admin-member-image-request-ack-v444',
    'targetMemberId', p_member_id,
    'characterId', p_character_id,
    'requestId', v_request.request_id,
    'acknowledged', true,
    'pending', false,
    'acknowledgedAt', v_request.acknowledged_at,
    'acknowledgedByMemberId', v_request.acknowledged_by_member_id,
    'idempotent', v_request.acknowledged_at < v_now
  );
end;
$function$;

create or replace function public.kinojo_admin_member_image_request_list_v444(
  p_session_token text,
  p_member_id bigint,
  p_character_id bigint,
  p_filter text default 'ALL',
  p_limit integer default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_master jsonb;
  v_filter text := upper(pg_catalog.btrim(coalesce(p_filter, 'ALL')));
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
  v_rows jsonb := '[]'::jsonb;
begin
  v_master := public.kinojo_master_session_validate_v337(p_session_token);
  if coalesce((v_master ->> 'ok')::boolean, false) is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'apiVersion', '444',
      'contract', 'admin-member-image-request-list-v444',
      'masterBoundaryContract', '337',
      'code', coalesce(nullif(v_master ->> 'code', ''), 'MASTER_REQUIRED'),
      'message', coalesce(nullif(v_master ->> 'message', ''), 'MASTER 권한이 필요합니다.')
    );
  end if;
  if p_member_id is null or p_member_id <= 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'apiVersion', '444',
      'contract', 'admin-member-image-request-list-v444',
      'code', 'TARGET_MEMBER_ID_REQUIRED',
      'message', '조회할 회원 식별값이 필요합니다.'
    );
  end if;
  if p_character_id is null or p_character_id <= 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'apiVersion', '444',
      'contract', 'admin-member-image-request-list-v444',
      'code', 'TARGET_CHARACTER_ID_REQUIRED',
      'message', '조회할 캐릭터 식별값이 필요합니다.'
    );
  end if;
  if v_filter not in ('PENDING', 'ACKNOWLEDGED', 'ALL') then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'apiVersion', '444',
      'contract', 'admin-member-image-request-list-v444',
      'code', 'REQUEST_ACK_FILTER_INVALID',
      'message', 'PENDING, ACKNOWLEDGED, ALL 필터만 조회할 수 있습니다.'
    );
  end if;
  if private.kinojo_member_image_request_admin_scope_v405(
    p_member_id, p_character_id
  ) is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'apiVersion', '444',
      'contract', 'admin-member-image-request-list-v444',
      'code', 'TARGET_CHARACTER_NOT_OWNED',
      'message', '선택한 캐릭터는 대상 회원의 소유 캐릭터가 아닙니다.'
    );
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'requestId', q.request_id,
        'styleCode', q.style_code,
        'requestNote', q.request_note,
        'submittedAt', q.submitted_at,
        'createdAt', q.created_at,
        'imageExpiresAt', q.image_expires_at,
        'metadataExpiresAt', q.metadata_expires_at,
        'acknowledged', q.acknowledged_at is not null,
        'pending', q.acknowledged_at is null,
        'acknowledgedAt', q.acknowledged_at,
        'itemCount', q.item_count,
        'availableImageCount', q.available_image_count,
        'imageAvailable', q.available_image_count > 0,
        'slots', q.slots
      )
      order by (q.acknowledged_at is null) desc, q.submitted_at desc, q.request_id desc
    ),
    '[]'::jsonb
  ) into v_rows
  from (
    select
      r.request_id, r.style_code, r.request_note,
      r.submitted_at, r.created_at,
      r.image_expires_at, r.metadata_expires_at, r.acknowledged_at,
      count(i.slot)::integer item_count,
      count(i.slot) filter (
        where i.storage_deleted_at is null
          and i.storage_verified_at is not null
          and r.image_expires_at > statement_timestamp()
      )::integer available_image_count,
      pg_catalog.jsonb_agg(
        i.slot order by case i.slot
          when 'FRONT' then 1 when 'BACK' then 2 else 3 end
      ) slots
    from private.member_image_requests r
    join private.member_image_request_items i on i.request_id = r.request_id
    where r.member_id = p_member_id
      and r.character_id = p_character_id
      and r.status = 'SUBMITTED'
      and r.metadata_expires_at > statement_timestamp()
      and (
        v_filter = 'ALL'
        or (v_filter = 'PENDING' and r.acknowledged_at is null)
        or (v_filter = 'ACKNOWLEDGED' and r.acknowledged_at is not null)
      )
    group by r.request_id
    order by (r.acknowledged_at is null) desc, r.submitted_at desc, r.request_id desc
    limit v_limit
  ) q;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'apiVersion', '444',
    'contract', 'admin-member-image-request-list-v444',
    'masterBoundaryContract', '337',
    'privacy', 'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
    'targetMemberId', p_member_id,
    'characterId', p_character_id,
    'filter', v_filter,
    'rowCount', pg_catalog.jsonb_array_length(coalesce(v_rows, '[]'::jsonb)),
    'requests', coalesce(v_rows, '[]'::jsonb)
  );
end;
$function$;

create or replace function public.kinojo_admin_member_image_request_detail_v444(
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
  v_items jsonb := '[]'::jsonb;
begin
  v_master := public.kinojo_master_session_validate_v337(p_session_token);
  if coalesce((v_master ->> 'ok')::boolean, false) is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'apiVersion', '444',
      'contract', 'admin-member-image-request-detail-v444',
      'masterBoundaryContract', '337',
      'code', coalesce(nullif(v_master ->> 'code', ''), 'MASTER_REQUIRED'),
      'message', coalesce(nullif(v_master ->> 'message', ''), 'MASTER 권한이 필요합니다.')
    );
  end if;
  if private.kinojo_member_image_request_admin_scope_v405(
    p_member_id, p_character_id
  ) is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'apiVersion', '444',
      'contract', 'admin-member-image-request-detail-v444',
      'code', 'TARGET_CHARACTER_NOT_OWNED',
      'message', '선택한 캐릭터는 대상 회원의 소유 캐릭터가 아닙니다.'
    );
  end if;
  if p_request_id is null or p_request_id <= 0 then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'apiVersion', '444',
      'contract', 'admin-member-image-request-detail-v444',
      'code', 'REQUEST_ID_REQUIRED',
      'message', '확인할 참고 이미지 제작 요청 식별값이 필요합니다.'
    );
  end if;

  select * into v_request
  from private.member_image_requests r
  where r.request_id = p_request_id
    and r.member_id = p_member_id
    and r.character_id = p_character_id
    and r.status = 'SUBMITTED'
    and r.metadata_expires_at > statement_timestamp()
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'apiVersion', '444',
      'contract', 'admin-member-image-request-detail-v444',
      'code', 'REQUEST_NOT_FOUND',
      'message', '확인할 수 있는 참고 이미지 제작 요청을 찾지 못했습니다.'
    );
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
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

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'apiVersion', '444',
    'contract', 'admin-member-image-request-detail-v444',
    'masterBoundaryContract', '337',
    'privacy', 'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
    'targetMemberId', p_member_id,
    'characterId', p_character_id,
    'requestId', v_request.request_id,
    'styleCode', v_request.style_code,
    'requestNote', v_request.request_note,
    'submittedAt', v_request.submitted_at,
    'imageExpiresAt', v_request.image_expires_at,
    'metadataExpiresAt', v_request.metadata_expires_at,
    'acknowledged', v_request.acknowledged_at is not null,
    'pending', v_request.acknowledged_at is null,
    'acknowledgedAt', v_request.acknowledged_at,
    'acknowledgedByMemberId', v_request.acknowledged_by_member_id,
    'imageAvailable', v_request.image_expires_at > statement_timestamp()
      and exists (
        select 1 from private.member_image_request_items i
        where i.request_id = v_request.request_id
          and i.storage_deleted_at is null
          and i.storage_verified_at is not null
      ),
    'items', v_items
  );
end;
$function$;

create or replace function public.kinojo_admin_member_image_work_queue_v444(
  p_session_token text,
  p_filter text default 'PENDING',
  p_search text default null,
  p_limit integer default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_master jsonb;
  v_filter text := upper(pg_catalog.btrim(coalesce(p_filter, 'PENDING')));
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  v_pending_count integer := 0;
  v_total_count integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  v_master := public.kinojo_master_session_validate_v337(p_session_token);
  if coalesce((v_master ->> 'ok')::boolean, false) is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'apiVersion', '444',
      'contract', 'admin-member-image-work-queue-v444',
      'masterBoundaryContract', '337',
      'code', coalesce(nullif(v_master ->> 'code', ''), 'MASTER_REQUIRED'),
      'message', coalesce(nullif(v_master ->> 'message', ''), 'MASTER 권한이 필요합니다.')
    );
  end if;

  if v_filter not in ('PENDING', 'ACKNOWLEDGED', 'ALL') then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'apiVersion', '444',
      'contract', 'admin-member-image-work-queue-v444',
      'code', 'WORK_QUEUE_FILTER_INVALID',
      'message', 'PENDING, ACKNOWLEDGED, ALL 필터만 조회할 수 있습니다.'
    );
  end if;

  select
    count(*) filter (where r.acknowledged_at is null)::integer,
    count(*)::integer
  into v_pending_count, v_total_count
  from private.member_image_requests r
  where r.status = 'SUBMITTED'
    and r.metadata_expires_at > statement_timestamp();

  with request_rows as (
    select
      r.acknowledged_at is null as action_required,
      coalesce(r.acknowledged_at, r.submitted_at, r.created_at) as activity_at,
      r.request_id as sort_id,
      pg_catalog.jsonb_build_object(
        'itemType', 'REFERENCE_IMAGE_REQUEST',
        'memberId', r.member_id,
        'mainCharacterName', m.main_character_name,
        'role', m.role,
        'roleLabel', coalesce(nullif(m.role_label, ''), m.role),
        'level', m.level,
        'isActive', m.is_active,
        'characterId', r.character_id,
        'characterName', c.character_name,
        'serverName', c.server_name,
        'className', c.class_name,
        'requestId', r.request_id,
        'styleCode', r.style_code,
        'submittedAt', r.submitted_at,
        'activityAt', coalesce(r.acknowledged_at, r.submitted_at, r.created_at),
        'imageExpiresAt', r.image_expires_at,
        'metadataExpiresAt', r.metadata_expires_at,
        'acknowledged', r.acknowledged_at is not null,
        'pending', r.acknowledged_at is null,
        'acknowledgedAt', r.acknowledged_at,
        'itemCount', (
          select pg_catalog.count(*)::integer
          from private.member_image_request_items i
          where i.request_id = r.request_id
        ),
        'availableImageCount', (
          select pg_catalog.count(*)::integer
          from private.member_image_request_items i
          where i.request_id = r.request_id
            and i.storage_verified_at is not null
            and i.storage_deleted_at is null
            and r.image_expires_at > statement_timestamp()
        ),
        'slots', coalesce((
          select pg_catalog.jsonb_agg(
            i.slot order by case i.slot
              when 'FRONT' then 1 when 'BACK' then 2 else 3 end
          )
          from private.member_image_request_items i
          where i.request_id = r.request_id
        ), '[]'::jsonb)
      ) as item
    from private.member_image_requests r
    join public.member_codes m on m.id = r.member_id
    join public.character_master c on c.id = r.character_id
    where r.status = 'SUBMITTED'
      and r.metadata_expires_at > statement_timestamp()
      and (
        v_filter = 'ALL'
        or (v_filter = 'PENDING' and r.acknowledged_at is null)
        or (v_filter = 'ACKNOWLEDGED' and r.acknowledged_at is not null)
      )
      and (
        v_search is null
        or m.main_character_name ilike '%' || v_search || '%'
        or c.character_name ilike '%' || v_search || '%'
      )
  ), limited_rows as (
    select *
    from request_rows
    order by action_required desc, activity_at desc, sort_id desc
    limit v_limit
  )
  select coalesce(
    pg_catalog.jsonb_agg(item order by action_required desc, activity_at desc, sort_id desc),
    '[]'::jsonb
  ) into v_rows
  from limited_rows;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'apiVersion', '444',
    'contract', 'admin-member-image-work-queue-v444',
    'masterBoundaryContract', '337',
    'privacy', 'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
    'filter', v_filter,
    'pendingRequestCount', coalesce(v_pending_count, 0),
    'actionRequiredCount', coalesce(v_pending_count, 0),
    'totalRequestCount', coalesce(v_total_count, 0),
    'rowCount', pg_catalog.jsonb_array_length(coalesce(v_rows, '[]'::jsonb)),
    'items', coalesce(v_rows, '[]'::jsonb)
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
  v_image_request_pending_count integer := 0;
  v_latest_support jsonb;
  v_latest_code jsonb;
  v_latest_image_request jsonb;
  v_master jsonb;
begin
  select * into v_member
  from public.kinojo_member_from_web_credential_v326(p_pass_key)
  limit 1;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'SESSION_INVALID', 'totalCount', 0);
  end if;

  select count(*)::integer into v_support_count
  from public.sanctuary_party_support_requests r
  where r.status = 'PENDING'
    and private.kinojo_sanctuary_roster_can_manage_force_v308(
      v_member.id, r.sanctuary_id, r.team_no
    );

  if coalesce(v_member.can_manage, false) or coalesce(v_member.level, 0) >= 3 then
    select count(*)::integer into v_code_count
    from public.code_requests cr
    where cr.status = 'PENDING';

    select pg_catalog.jsonb_build_object(
      'id', cr.id,
      'requestId', cr.request_id,
      'characterName', cr.character_name,
      'createdAt', cr.created_at
    ) into v_latest_code
    from public.code_requests cr
    where cr.status = 'PENDING'
    order by cr.created_at desc, cr.id desc
    limit 1;
  end if;

  select pg_catalog.jsonb_build_object(
    'id', r.id,
    'characterName', c.character_name,
    'sanctuaryCode', r.sanctuary_id,
    'teamNo', r.team_no,
    'partyNo', r.party_no,
    'slotNo', r.slot_no,
    'createdAt', r.created_at
  ) into v_latest_support
  from public.sanctuary_party_support_requests r
  join public.character_master c on c.id = r.character_master_id
  where r.status = 'PENDING'
    and private.kinojo_sanctuary_roster_can_manage_force_v308(
      v_member.id, r.sanctuary_id, r.team_no
    )
  order by r.created_at desc, r.id desc
  limit 1;

  v_master := public.kinojo_master_session_validate_v337(p_pass_key);
  if coalesce((v_master ->> 'ok')::boolean, false) is true then
    select count(*)::integer into v_image_request_pending_count
    from private.member_image_requests r
    where r.status = 'SUBMITTED'
      and r.acknowledged_at is null
      and r.metadata_expires_at > statement_timestamp();

    select pg_catalog.jsonb_build_object(
      'requestId', r.request_id,
      'memberId', r.member_id,
      'memberMainCharacterName', m.main_character_name,
      'characterId', r.character_id,
      'characterName', c.character_name,
      'styleCode', r.style_code,
      'itemCount', (
        select count(*)::integer
        from private.member_image_request_items i
        where i.request_id = r.request_id
      ),
      'createdAt', r.submitted_at
    ) into v_latest_image_request
    from private.member_image_requests r
    join public.member_codes m on m.id = r.member_id
    join public.character_master c on c.id = r.character_id
    where r.status = 'SUBMITTED'
      and r.acknowledged_at is null
      and r.metadata_expires_at > statement_timestamp()
    order by r.submitted_at desc, r.request_id desc
    limit 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 316,
    'notificationFeatureVersion', 444,
    'memberId', v_member.id,
    'supportRequestCount', v_support_count,
    'codeRequestCount', v_code_count,
    'memberImagePendingCount', 0,
    'memberImageRequestPendingCount', v_image_request_pending_count,
    'totalCount', v_support_count + v_code_count + v_image_request_pending_count,
    'latestSupportRequest', v_latest_support,
    'latestCodeRequest', v_latest_code,
    'latestReferenceUpload', null,
    'latestCharacterImageUpload', null,
    'latestImageRequest', v_latest_image_request
  );
end;
$function$;

revoke all on function public.kinojo_admin_member_image_request_ack_v444(
  text, bigint, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.kinojo_admin_member_image_request_ack_v444(
  text, bigint, bigint, bigint
) to service_role;

revoke all on function public.kinojo_admin_member_image_request_list_v444(
  text, bigint, bigint, text, integer
) from public, anon, authenticated;
grant execute on function public.kinojo_admin_member_image_request_list_v444(
  text, bigint, bigint, text, integer
) to service_role;

revoke all on function public.kinojo_admin_member_image_request_detail_v444(
  text, bigint, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.kinojo_admin_member_image_request_detail_v444(
  text, bigint, bigint, bigint
) to service_role;

revoke all on function public.kinojo_admin_member_image_work_queue_v444(
  text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.kinojo_admin_member_image_work_queue_v444(
  text, text, text, integer
) to service_role;

-- The old production-status mutation is intentionally unreachable after v444.
revoke all on function public.kinojo_admin_member_image_request_status_v405(
  text, bigint, bigint, bigint, text
) from service_role;

revoke all on function public.kinojo_web_notification_summary_v316(text)
  from public;
grant execute on function public.kinojo_web_notification_summary_v316(text)
  to anon, authenticated, service_role;

comment on column private.member_image_requests.acknowledged_at is
  'Permanent MASTER acknowledgement timestamp. Null means one admin confirmation is still required.';
comment on function public.kinojo_admin_member_image_request_ack_v444(
  text, bigint, bigint, bigint
) is 'MASTER-only idempotent acknowledgement for one submitted reference-image production request.';
comment on function public.kinojo_admin_member_image_work_queue_v444(
  text, text, text, integer
) is 'MASTER-only reference-image request queue; generic character-image upload reviews are excluded.';
