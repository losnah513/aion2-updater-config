create or replace function public.kinojo_admin_member_image_work_queue_v406(
  p_session_token text,
  p_filter text default 'ACTION_REQUIRED',
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
  v_filter text := upper(pg_catalog.btrim(coalesce(p_filter, 'ACTION_REQUIRED')));
  v_search text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  v_pending_upload_count integer := 0;
  v_active_request_count integer := 0;
  v_total_uploader_count integer := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  v_master := public.kinojo_master_session_validate_v337(p_session_token);
  if coalesce((v_master ->> 'ok')::boolean, false) is not true then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'apiVersion', '406',
      'contract', 'admin-member-image-work-queue-v406',
      'masterBoundaryContract', '337',
      'code', coalesce(nullif(v_master ->> 'code', ''), 'MASTER_REQUIRED'),
      'message', coalesce(nullif(v_master ->> 'message', ''), 'MASTER 권한이 필요합니다.')
    );
  end if;

  if v_filter not in ('ACTION_REQUIRED', 'IMAGE_REVIEW', 'PRODUCTION_REQUEST', 'COMPLETED', 'ALL') then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'apiVersion', '406',
      'contract', 'admin-member-image-work-queue-v406',
      'code', 'WORK_QUEUE_FILTER_INVALID',
      'message', 'ACTION_REQUIRED, IMAGE_REVIEW, PRODUCTION_REQUEST, COMPLETED, ALL 필터만 조회할 수 있습니다.'
    );
  end if;

  select pg_catalog.count(*)::integer
    into v_total_uploader_count
    from private.member_image_admin_review_rollup_v392;

  select pg_catalog.count(*)::integer
    into v_pending_upload_count
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

  select pg_catalog.count(*)::integer
    into v_active_request_count
    from private.member_image_requests r
   where r.status in ('SUBMITTED', 'IN_PROGRESS')
     and r.metadata_expires_at > statement_timestamp();

  with review_rows as (
    select
      x.pending and not exists (
        select 1
          from private.member_image_requests linked_request
         where linked_request.member_id = x.member_id
           and linked_request.character_id = x.latest_character_id
           and linked_request.submitted_at = x.latest_uploaded_at
           and linked_request.status <> 'DRAFT'
      ) as action_required,
      x.latest_uploaded_at as activity_at,
      x.member_id as sort_id,
      pg_catalog.jsonb_build_object(
        'itemType', 'IMAGE_REVIEW',
        'memberId', x.member_id,
        'mainCharacterName', x.main_character_name,
        'role', x.role,
        'roleLabel', x.role_label,
        'level', x.level,
        'isActive', x.is_active,
        'imageCount', x.image_count,
        'profileImageCount', x.profile_image_count,
        'referenceImageCount', x.reference_image_count,
        'characterCount', x.character_count,
        'characterNames', x.character_names,
        'latestUploadedAt', x.latest_uploaded_at,
        'activityAt', x.latest_uploaded_at,
        'latestImage', pg_catalog.jsonb_build_object(
          'kind', x.latest_image_kind,
          'characterId', x.latest_character_id,
          'characterName', x.latest_character_name,
          'slot', x.latest_slot,
          'uploadedAt', x.latest_uploaded_at
        ),
        'reviewedThrough', x.reviewed_through,
        'reviewedAt', x.reviewed_at,
        'pending', x.pending
      ) as item
    from private.member_image_admin_review_rollup_v392 x
    where v_filter <> 'PRODUCTION_REQUEST'
      and (
        v_filter = 'ALL'
        or (
          v_filter in ('ACTION_REQUIRED', 'IMAGE_REVIEW')
          and x.pending
          and not exists (
            select 1
              from private.member_image_requests linked_request
             where linked_request.member_id = x.member_id
               and linked_request.character_id = x.latest_character_id
               and linked_request.submitted_at = x.latest_uploaded_at
               and linked_request.status <> 'DRAFT'
          )
        )
        or (v_filter = 'COMPLETED' and not x.pending)
      )
      and (
        v_search is null
        or x.main_character_name ilike '%' || v_search || '%'
        or x.character_names::text ilike '%' || v_search || '%'
      )
  ), request_rows as (
    select
      r.status in ('SUBMITTED', 'IN_PROGRESS') as action_required,
      coalesce(r.updated_at, r.submitted_at, r.created_at) as activity_at,
      r.request_id as sort_id,
      pg_catalog.jsonb_build_object(
        'itemType', 'PRODUCTION_REQUEST',
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
        'status', r.status,
        'submittedAt', r.submitted_at,
        'updatedAt', r.updated_at,
        'activityAt', coalesce(r.updated_at, r.submitted_at, r.created_at),
        'imageExpiresAt', r.image_expires_at,
        'metadataExpiresAt', r.metadata_expires_at,
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
    where v_filter <> 'IMAGE_REVIEW'
      and r.status <> 'DRAFT'
      and r.metadata_expires_at > statement_timestamp()
      and (
        v_filter = 'ALL'
        or (v_filter in ('ACTION_REQUIRED', 'PRODUCTION_REQUEST') and r.status in ('SUBMITTED', 'IN_PROGRESS'))
        or (v_filter = 'COMPLETED' and r.status in ('COMPLETED', 'REJECTED'))
      )
      and (
        v_search is null
        or m.main_character_name ilike '%' || v_search || '%'
        or c.character_name ilike '%' || v_search || '%'
      )
  ), queue_rows as (
    select * from review_rows
    union all
    select * from request_rows
  ), limited_rows as (
    select *
      from queue_rows
     order by action_required desc, activity_at desc, sort_id desc
     limit v_limit
  )
  select coalesce(
    pg_catalog.jsonb_agg(item order by action_required desc, activity_at desc, sort_id desc),
    '[]'::jsonb
  )
    into v_rows
    from limited_rows;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'apiVersion', '406',
    'contract', 'admin-member-image-work-queue-v406',
    'masterBoundaryContract', '337',
    'privacy', 'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',
    'filter', v_filter,
    'pendingUploadCount', coalesce(v_pending_upload_count, 0),
    'activeRequestCount', coalesce(v_active_request_count, 0),
    'actionRequiredCount', coalesce(v_pending_upload_count, 0) + coalesce(v_active_request_count, 0),
    'totalUploaderCount', coalesce(v_total_uploader_count, 0),
    'rowCount', pg_catalog.jsonb_array_length(coalesce(v_rows, '[]'::jsonb)),
    'items', coalesce(v_rows, '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.kinojo_admin_member_image_work_queue_v406(
  text, text, text, integer
) from public, anon, authenticated;
grant execute on function public.kinojo_admin_member_image_work_queue_v406(
  text, text, text, integer
) to service_role;

comment on function public.kinojo_admin_member_image_work_queue_v406(
  text, text, text, integer
) is 'MASTER-only unified action queue for pending image reviews and active image production requests without private Storage selectors.';
