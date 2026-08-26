-- KINOJO My Info phase 2 / stage 1
-- Member image production request batch contract v404.

create table private.member_image_requests (
  request_id bigint generated always as identity primary key,
  member_id bigint not null references public.member_codes(id) on delete cascade,
  character_id bigint not null references public.character_master(id) on delete cascade,
  idempotency_key text not null,
  style_code text,
  request_note text not null default '',
  status text not null default 'DRAFT',
  draft_expires_at timestamptz not null,
  image_expires_at timestamptz not null,
  metadata_expires_at timestamptz not null,
  submitted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint member_image_requests_member_idempotency_key unique (member_id, idempotency_key),
  constraint member_image_requests_idempotency_key_chk check (
    char_length(idempotency_key) between 16 and 96
    and idempotency_key ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint member_image_requests_style_code_chk check (
    style_code is null or style_code in ('SHONEN_MANGA','ROMANCE_MANGA','ANIMATION','REALISTIC','CUSTOM')
  ),
  constraint member_image_requests_note_chk check (char_length(request_note) <= 300),
  constraint member_image_requests_custom_note_chk check (
    style_code is distinct from 'CUSTOM' or char_length(btrim(request_note)) > 0
  ),
  constraint member_image_requests_status_chk check (
    status in ('DRAFT','SUBMITTED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED')
  ),
  constraint member_image_requests_retention_chk check (
    draft_expires_at > created_at
    and draft_expires_at <= created_at + interval '2 hours'
    and image_expires_at > created_at
    and image_expires_at <= created_at + interval '7 days'
    and metadata_expires_at > image_expires_at
    and metadata_expires_at <= created_at + interval '30 days'
  ),
  constraint member_image_requests_submit_state_chk check (
    (status = 'DRAFT' and submitted_at is null)
    or (status <> 'DRAFT' and submitted_at is not null)
  )
);

create table private.member_image_request_items (
  request_id bigint not null references private.member_image_requests(request_id) on delete cascade,
  slot text not null,
  object_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  expected_previous_object_path text,
  storage_verified_at timestamptz,
  storage_deleted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  primary key (request_id, slot),
  constraint member_image_request_items_object_path_key unique (object_path),
  constraint member_image_request_items_slot_chk check (slot in ('FRONT','BACK','UPPER_BODY')),
  constraint member_image_request_items_path_chk check (
    char_length(btrim(object_path)) between 1 and 1024
  ),
  constraint member_image_request_items_previous_path_chk check (
    expected_previous_object_path is null
    or char_length(btrim(expected_previous_object_path)) between 1 and 1024
  ),
  constraint member_image_request_items_mime_chk check (mime_type = 'image/webp'),
  constraint member_image_request_items_size_chk check (size_bytes between 1 and 5242880)
);

create table private.member_image_request_status_history (
  history_id bigint generated always as identity primary key,
  request_id bigint not null references private.member_image_requests(request_id) on delete cascade,
  previous_status text,
  new_status text not null,
  actor_kind text not null,
  actor_member_id bigint references public.member_codes(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  constraint member_image_request_status_history_previous_chk check (
    previous_status is null or previous_status in ('DRAFT','SUBMITTED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED')
  ),
  constraint member_image_request_status_history_new_chk check (
    new_status in ('DRAFT','SUBMITTED','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED')
  ),
  constraint member_image_request_status_history_actor_chk check (
    actor_kind in ('MEMBER','MASTER','SYSTEM')
  )
);

create table private.member_image_object_cleanup_queue (
  cleanup_id bigint generated always as identity primary key,
  character_id bigint not null references public.character_master(id) on delete cascade,
  slot text not null,
  object_path text not null,
  mime_type text not null,
  delete_after timestamptz not null,
  reason text not null,
  storage_deleted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint member_image_object_cleanup_queue_path_key unique (object_path),
  constraint member_image_object_cleanup_queue_slot_chk check (slot in ('FRONT','BACK','UPPER_BODY')),
  constraint member_image_object_cleanup_queue_path_chk check (char_length(btrim(object_path)) between 1 and 1024),
  constraint member_image_object_cleanup_queue_mime_chk check (
    mime_type in ('image/jpeg','image/png','image/webp')
  ),
  constraint member_image_object_cleanup_queue_reason_chk check (
    reason in ('REPLACED_LEGACY_REFERENCE','REPLACED_REQUEST_REFERENCE','EXPIRED_REQUEST','ABANDONED_DRAFT')
  )
);

create index member_image_requests_member_created_idx
  on private.member_image_requests (member_id, created_at desc);
create index member_image_requests_character_created_idx
  on private.member_image_requests (character_id, created_at desc);
create index member_image_requests_active_status_idx
  on private.member_image_requests (status, created_at asc)
  where status in ('DRAFT','SUBMITTED','IN_PROGRESS');
create index member_image_requests_metadata_expiry_idx
  on private.member_image_requests (metadata_expires_at);
create index member_image_request_status_history_request_created_idx
  on private.member_image_request_status_history (request_id, created_at asc);
create index member_image_request_status_history_actor_idx
  on private.member_image_request_status_history (actor_member_id)
  where actor_member_id is not null;
create index member_image_object_cleanup_due_idx
  on private.member_image_object_cleanup_queue (delete_after, cleanup_id)
  where storage_deleted_at is null;
create index member_image_object_cleanup_character_idx
  on private.member_image_object_cleanup_queue (character_id)
  where storage_deleted_at is null;

alter table private.member_image_requests enable row level security;
alter table private.member_image_request_items enable row level security;
alter table private.member_image_request_status_history enable row level security;
alter table private.member_image_object_cleanup_queue enable row level security;

revoke all on table private.member_image_requests from public, anon, authenticated;
revoke all on table private.member_image_request_items from public, anon, authenticated;
revoke all on table private.member_image_request_status_history from public, anon, authenticated;
revoke all on table private.member_image_object_cleanup_queue from public, anon, authenticated;
revoke all on sequence private.member_image_requests_request_id_seq from public, anon, authenticated;
revoke all on sequence private.member_image_request_status_history_history_id_seq from public, anon, authenticated;
revoke all on sequence private.member_image_object_cleanup_queue_cleanup_id_seq from public, anon, authenticated;

create or replace function public.kinojo_member_image_request_prepare_v404(
  p_session_token text,
  p_character_id bigint,
  p_idempotency_key text,
  p_style_code text,
  p_request_note text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_access jsonb;
  v_member_id bigint;
  v_key text := btrim(coalesce(p_idempotency_key,''));
  v_style text := nullif(btrim(coalesce(p_style_code,'')), '');
  v_note text := btrim(coalesce(p_request_note,''));
  v_now timestamptz := statement_timestamp();
  v_request private.member_image_requests%rowtype;
  v_item jsonb;
  v_slot text;
  v_path text;
  v_mime text;
  v_size bigint;
  v_expected text;
  v_count integer;
begin
  v_access := public.kinojo_member_character_access_v336(p_session_token, p_character_id);
  if coalesce((v_access ->> 'ok')::boolean,false) is not true then
    return v_access || jsonb_build_object('apiVersion','404','contract','member-image-request-prepare-v404');
  end if;
  v_member_id := nullif(v_access ->> 'memberId','')::bigint;

  if char_length(v_key) not between 16 and 96 or v_key !~ '^[A-Za-z0-9_-]+$' then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_IDEMPOTENCY_KEY_INVALID');
  end if;
  if v_style is not null and v_style not in ('SHONEN_MANGA','ROMANCE_MANGA','ANIMATION','REALISTIC','CUSTOM') then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_STYLE_INVALID');
  end if;
  if char_length(v_note) > 300 then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_NOTE_TOO_LONG');
  end if;
  if v_style = 'CUSTOM' and v_note = '' then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_CUSTOM_NOTE_REQUIRED');
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_ITEMS_INVALID');
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 3 then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_IMAGE_COUNT_INVALID');
  end if;
  if (select count(distinct btrim(value ->> 'slot')) from jsonb_array_elements(p_items)) <> v_count then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_SLOT_DUPLICATE');
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_slot := btrim(coalesce(v_item ->> 'slot',''));
    v_path := btrim(coalesce(v_item ->> 'objectPath',''));
    v_mime := lower(btrim(coalesce(v_item ->> 'mimeType','')));
    begin v_size := nullif(v_item ->> 'sizeBytes','')::bigint; exception when others then v_size := null; end;
    if v_slot not in ('FRONT','BACK','UPPER_BODY') then
      return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_SLOT_INVALID');
    end if;
    if v_mime <> 'image/webp' or v_size is null or v_size < 1 or v_size > 5242880 then
      return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_IMAGE_FILE_INVALID','slot',v_slot);
    end if;
    if char_length(v_path) > 1024 or v_path !~ ('^characters/' || p_character_id::text || '/' || v_slot || '/[0-9a-f]{32}[.]webp$') then
      return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_OBJECT_PATH_INVALID','slot',v_slot);
    end if;
  end loop;

  select * into v_request
    from private.member_image_requests r
   where r.member_id = v_member_id and r.idempotency_key = v_key
   for update;

  if found then
    if v_request.character_id <> p_character_id
       or v_request.style_code is distinct from v_style
       or v_request.request_note <> v_note
       or (select count(*) from private.member_image_request_items i where i.request_id=v_request.request_id) <> v_count
       or exists (
         select 1 from private.member_image_request_items i
         where i.request_id=v_request.request_id
           and not exists (
             select 1 from jsonb_array_elements(p_items) as x(value)
              where btrim(x.value ->> 'slot')=i.slot
                and lower(btrim(x.value ->> 'mimeType'))=i.mime_type
                and (x.value ->> 'sizeBytes')::bigint=i.size_bytes
           )
       ) then
      return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_IDEMPOTENCY_CONFLICT');
    end if;
  else
    insert into private.member_image_requests(
      member_id,character_id,idempotency_key,style_code,request_note,status,
      draft_expires_at,image_expires_at,metadata_expires_at,created_at,updated_at
    ) values (
      v_member_id,p_character_id,v_key,v_style,v_note,'DRAFT',
      v_now + interval '2 hours',v_now + interval '7 days',v_now + interval '30 days',v_now,v_now
    ) returning * into v_request;

    for v_item in select value from jsonb_array_elements(p_items)
    loop
      v_slot := btrim(v_item ->> 'slot');
      v_path := btrim(v_item ->> 'objectPath');
      v_mime := lower(btrim(v_item ->> 'mimeType'));
      v_size := (v_item ->> 'sizeBytes')::bigint;
      select r.object_path into v_expected
        from private.member_character_reference_images r
       where r.character_id=p_character_id and r.slot=v_slot and r.expires_at > v_now;
      insert into private.member_image_request_items(
        request_id,slot,object_path,mime_type,size_bytes,expected_previous_object_path,created_at
      ) values (v_request.request_id,v_slot,v_path,v_mime,v_size,v_expected,v_now);
    end loop;
    insert into private.member_image_request_status_history(
      request_id,previous_status,new_status,actor_kind,actor_member_id,created_at
    ) values (v_request.request_id,null,'DRAFT','MEMBER',v_member_id,v_now);
  end if;

  if v_request.status <> 'DRAFT' then
    return jsonb_build_object('ok',true,'apiVersion','404','contract','member-image-request-prepare-v404','idempotent',true,'requestId',v_request.request_id,'status',v_request.status,'memberId',v_member_id,'characterId',p_character_id,'styleCode',v_request.style_code,'requestNote',v_request.request_note,'imageExpiresAt',v_request.image_expires_at,'metadataExpiresAt',v_request.metadata_expires_at,'items','[]'::jsonb);
  end if;
  if v_request.draft_expires_at <= v_now then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_DRAFT_EXPIRED','requestId',v_request.request_id);
  end if;

  return jsonb_build_object(
    'ok',true,'apiVersion','404','contract','member-image-request-prepare-v404',
    'idempotent',v_request.created_at < v_now,'requestId',v_request.request_id,'status',v_request.status,
    'memberId',v_member_id,'member',v_access -> 'member','owner',v_access -> 'owner',
    'characterId',p_character_id,'character',v_access -> 'character',
    'styleCode',v_request.style_code,'requestNote',v_request.request_note,
    'draftExpiresAt',v_request.draft_expires_at,'imageExpiresAt',v_request.image_expires_at,'metadataExpiresAt',v_request.metadata_expires_at,
    'items',(select jsonb_agg(jsonb_build_object('slot',i.slot,'objectPath',i.object_path,'mimeType',i.mime_type,'sizeBytes',i.size_bytes) order by case i.slot when 'FRONT' then 1 when 'BACK' then 2 else 3 end) from private.member_image_request_items i where i.request_id=v_request.request_id)
  );
exception when unique_violation then
  return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-prepare-v404','code','REQUEST_CONCURRENT_RETRY','message','동일 요청이 처리 중입니다. 같은 키로 다시 시도해 주세요.');
end;
$function$;

create or replace function public.kinojo_member_image_request_draft_v404(
  p_session_token text,
  p_request_id bigint,
  p_idempotency_key text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_auth jsonb;
  v_access jsonb;
  v_member_id bigint;
  v_request private.member_image_requests%rowtype;
begin
  v_auth := public.kinojo_web_session_validate_v320(p_session_token,false);
  if coalesce((v_auth ->> 'ok')::boolean,false) is not true then
    return v_auth || jsonb_build_object('apiVersion','404','contract','member-image-request-draft-v404');
  end if;
  v_member_id := nullif(v_auth #>> '{profile,id}','')::bigint;
  select * into v_request from private.member_image_requests r
   where r.request_id=p_request_id and r.member_id=v_member_id and r.idempotency_key=btrim(coalesce(p_idempotency_key,''));
  if not found then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-draft-v404','code','REQUEST_NOT_FOUND');
  end if;
  v_access := public.kinojo_member_character_access_v336(p_session_token,v_request.character_id);
  if coalesce((v_access ->> 'ok')::boolean,false) is not true then
    return v_access || jsonb_build_object('apiVersion','404','contract','member-image-request-draft-v404');
  end if;
  if nullif(v_access ->> 'memberId','')::bigint <> v_member_id then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-draft-v404','code','MEMBER_BINDING_MISMATCH');
  end if;
  if v_request.status='DRAFT' and v_request.draft_expires_at <= statement_timestamp() then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-draft-v404','code','REQUEST_DRAFT_EXPIRED','requestId',v_request.request_id);
  end if;
  return jsonb_build_object(
    'ok',true,'apiVersion','404','contract','member-image-request-draft-v404',
    'requestId',v_request.request_id,'status',v_request.status,'memberId',v_member_id,'characterId',v_request.character_id,
    'styleCode',v_request.style_code,'requestNote',v_request.request_note,
    'draftExpiresAt',v_request.draft_expires_at,'imageExpiresAt',v_request.image_expires_at,'metadataExpiresAt',v_request.metadata_expires_at,
    'items',(select jsonb_agg(jsonb_build_object('slot',i.slot,'objectPath',i.object_path,'mimeType',i.mime_type,'sizeBytes',i.size_bytes) order by case i.slot when 'FRONT' then 1 when 'BACK' then 2 else 3 end) from private.member_image_request_items i where i.request_id=v_request.request_id)
  );
end;
$function$;

create or replace function public.kinojo_member_image_request_finalize_v404(
  p_session_token text,
  p_request_id bigint,
  p_idempotency_key text,
  p_verified_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_auth jsonb;
  v_access jsonb;
  v_member_id bigint;
  v_request private.member_image_requests%rowtype;
  v_item private.member_image_request_items%rowtype;
  v_current private.member_character_reference_images%rowtype;
  v_now timestamptz := statement_timestamp();
  v_payload jsonb;
  v_retain_until timestamptz;
  v_count integer;
begin
  v_auth := public.kinojo_web_session_validate_v320(p_session_token,false);
  if coalesce((v_auth ->> 'ok')::boolean,false) is not true then
    return v_auth || jsonb_build_object('apiVersion','404','contract','member-image-request-finalize-v404');
  end if;
  v_member_id := nullif(v_auth #>> '{profile,id}','')::bigint;
  select * into v_request from private.member_image_requests r
   where r.request_id=p_request_id and r.member_id=v_member_id and r.idempotency_key=btrim(coalesce(p_idempotency_key,''))
   for update;
  if not found then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-finalize-v404','code','REQUEST_NOT_FOUND');
  end if;
  v_access := public.kinojo_member_character_access_v336(p_session_token,v_request.character_id);
  if coalesce((v_access ->> 'ok')::boolean,false) is not true then
    return v_access || jsonb_build_object('apiVersion','404','contract','member-image-request-finalize-v404');
  end if;
  if nullif(v_access ->> 'memberId','')::bigint <> v_member_id then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-finalize-v404','code','MEMBER_BINDING_MISMATCH');
  end if;
  if v_request.status='SUBMITTED' then
    return jsonb_build_object('ok',true,'apiVersion','404','contract','member-image-request-finalize-v404','idempotent',true,'requestId',v_request.request_id,'status',v_request.status,'memberId',v_member_id,'characterId',v_request.character_id,'styleCode',v_request.style_code,'requestNote',v_request.request_note,'submittedAt',v_request.submitted_at,'imageExpiresAt',v_request.image_expires_at,'metadataExpiresAt',v_request.metadata_expires_at,'slots',(select jsonb_agg(i.slot order by case i.slot when 'FRONT' then 1 when 'BACK' then 2 else 3 end) from private.member_image_request_items i where i.request_id=v_request.request_id));
  end if;
  if v_request.status <> 'DRAFT' then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-finalize-v404','code','REQUEST_STATUS_CONFLICT','status',v_request.status);
  end if;
  if v_request.draft_expires_at <= v_now then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-finalize-v404','code','REQUEST_DRAFT_EXPIRED');
  end if;
  if jsonb_typeof(p_verified_items) is distinct from 'array' then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-finalize-v404','code','REQUEST_VERIFICATION_INVALID');
  end if;
  select count(*) into v_count from private.member_image_request_items i where i.request_id=v_request.request_id;
  if jsonb_array_length(p_verified_items) <> v_count then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-finalize-v404','code','REQUEST_VERIFICATION_INCOMPLETE');
  end if;
  for v_item in select * from private.member_image_request_items i where i.request_id=v_request.request_id order by i.slot for update
  loop
    select value into v_payload from jsonb_array_elements(p_verified_items)
     where btrim(value ->> 'slot')=v_item.slot limit 1;
    if v_payload is null
       or btrim(coalesce(v_payload ->> 'objectPath','')) <> v_item.object_path
       or lower(btrim(coalesce(v_payload ->> 'mimeType',''))) <> v_item.mime_type
       or coalesce((v_payload ->> 'sizeBytes')::bigint,0) <> v_item.size_bytes
       or coalesce((v_payload ->> 'storageVerified')::boolean,false) is not true
       or coalesce((v_payload ->> 'pixelVerified')::boolean,false) is not true then
      return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-finalize-v404','code','REQUEST_VERIFICATION_MISMATCH','slot',v_item.slot);
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('kinojo-member-image-request:' || v_request.character_id::text,404));

  for v_item in select * from private.member_image_request_items i where i.request_id=v_request.request_id order by i.slot for update
  loop
    select * into v_current from private.member_character_reference_images r
     where r.character_id=v_request.character_id and r.slot=v_item.slot for update;
    if found and v_current.expires_at > v_now and v_current.object_path is distinct from v_item.expected_previous_object_path then
      return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-finalize-v404','code','REQUEST_REFERENCE_CONFLICT','slot',v_item.slot);
    end if;
    if not found and v_item.expected_previous_object_path is not null then
      return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-request-finalize-v404','code','REQUEST_REFERENCE_CONFLICT','slot',v_item.slot);
    end if;
    if found and v_current.object_path <> v_item.object_path then
      select max(r.image_expires_at) into v_retain_until
        from private.member_image_request_items i
        join private.member_image_requests r on r.request_id=i.request_id
       where i.object_path=v_current.object_path and i.storage_deleted_at is null;
      if v_retain_until is null then
        insert into private.member_image_object_cleanup_queue(
          character_id,slot,object_path,mime_type,delete_after,reason
        ) values (
          v_request.character_id,v_item.slot,v_current.object_path,v_current.mime_type,
          v_now,'REPLACED_LEGACY_REFERENCE'
        ) on conflict (object_path) do update set delete_after=greatest(private.member_image_object_cleanup_queue.delete_after,excluded.delete_after);
      end if;
    end if;

    insert into private.member_character_reference_images(
      character_id,slot,object_path,mime_type,size_bytes,uploaded_at,expires_at
    ) values (
      v_request.character_id,v_item.slot,v_item.object_path,v_item.mime_type,v_item.size_bytes,v_now,v_request.image_expires_at
    ) on conflict (character_id,slot) do update set
      object_path=excluded.object_path,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,
      uploaded_at=excluded.uploaded_at,expires_at=excluded.expires_at;
    update private.member_image_request_items set storage_verified_at=v_now
     where request_id=v_item.request_id and slot=v_item.slot;
  end loop;

  update private.member_image_requests set status='SUBMITTED',submitted_at=v_now,updated_at=v_now
   where request_id=v_request.request_id returning * into v_request;
  insert into private.member_image_request_status_history(
    request_id,previous_status,new_status,actor_kind,actor_member_id,created_at
  ) values (v_request.request_id,'DRAFT','SUBMITTED','MEMBER',v_member_id,v_now);

  return jsonb_build_object(
    'ok',true,'apiVersion','404','contract','member-image-request-finalize-v404','idempotent',false,
    'requestId',v_request.request_id,'status',v_request.status,'memberId',v_member_id,'characterId',v_request.character_id,
    'styleCode',v_request.style_code,'requestNote',v_request.request_note,'submittedAt',v_request.submitted_at,
    'imageExpiresAt',v_request.image_expires_at,'metadataExpiresAt',v_request.metadata_expires_at,
    'slots',(select jsonb_agg(i.slot order by case i.slot when 'FRONT' then 1 when 'BACK' then 2 else 3 end) from private.member_image_request_items i where i.request_id=v_request.request_id)
  );
end;
$function$;

create or replace function public.kinojo_member_image_request_state_v404(
  p_session_token text,
  p_character_id bigint
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_access jsonb;
begin
  v_access := public.kinojo_member_character_access_v336(p_session_token,p_character_id);
  if coalesce((v_access ->> 'ok')::boolean,false) is not true then
    return v_access || jsonb_build_object('apiVersion','404','contract','member-image-request-state-v404');
  end if;
  return jsonb_build_object(
    'ok',true,'apiVersion','404','contract','member-image-request-state-v404',
    'memberId',nullif(v_access ->> 'memberId','')::bigint,'characterId',p_character_id,
    'metadataRetentionDays',30,'imageRetentionDays',7,
    'requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId',r.request_id,'styleCode',r.style_code,'requestNote',r.request_note,'status',r.status,
        'createdAt',r.created_at,'submittedAt',r.submitted_at,'imageExpiresAt',r.image_expires_at,
        'metadataExpiresAt',r.metadata_expires_at,'slots',(select jsonb_agg(i.slot order by case i.slot when 'FRONT' then 1 when 'BACK' then 2 else 3 end) from private.member_image_request_items i where i.request_id=r.request_id)
      ) order by r.created_at desc)
      from private.member_image_requests r
      where r.member_id=nullif(v_access ->> 'memberId','')::bigint
        and r.character_id=p_character_id and r.metadata_expires_at > statement_timestamp()
        and (r.status <> 'DRAFT' or r.draft_expires_at > statement_timestamp())
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.kinojo_member_image_cleanup_candidates_v404(p_limit integer default 100)
returns table(
  source_kind text, request_id bigint, character_id bigint, slot text,
  object_path text, mime_type text, size_bytes bigint, delete_after timestamptz
)
language sql
security definer
set search_path = pg_catalog, public, private
as $function$
  with candidates as (
    select
      'REQUEST_ITEM'::text source_kind,r.request_id,r.character_id,i.slot,i.object_path,i.mime_type,i.size_bytes,
      case when r.status='DRAFT' then r.draft_expires_at else r.image_expires_at end delete_after
    from private.member_image_requests r
    join private.member_image_request_items i on i.request_id=r.request_id
    where i.storage_deleted_at is null
      and ((r.status='DRAFT' and r.draft_expires_at <= statement_timestamp()) or r.image_expires_at <= statement_timestamp())
    union all
    select
      'QUEUED_OBJECT',null::bigint,q.character_id,q.slot,q.object_path,q.mime_type,1::bigint,q.delete_after
    from private.member_image_object_cleanup_queue q
    where q.storage_deleted_at is null and q.delete_after <= statement_timestamp()
    union all
    select
      'ACTIVE_REFERENCE',null::bigint,r.character_id,r.slot,r.object_path,r.mime_type,r.size_bytes,r.expires_at
    from private.member_character_reference_images r
    where r.expires_at <= statement_timestamp()
      and not exists (
        select 1 from private.member_image_request_items i
        where i.object_path=r.object_path and i.storage_deleted_at is null
      )
  )
  select * from candidates
  order by delete_after asc, character_id asc, slot asc
  limit least(greatest(coalesce(p_limit,100),1),200);
$function$;

create or replace function public.kinojo_member_image_cleanup_finalize_v404(
  p_source_kind text,
  p_request_id bigint,
  p_character_id bigint,
  p_slot text,
  p_expected_object_path text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_kind text := btrim(coalesce(p_source_kind,''));
  v_request private.member_image_requests%rowtype;
begin
  if p_character_id is null or p_character_id <= 0
     or p_slot not in ('FRONT','BACK','UPPER_BODY')
     or char_length(btrim(coalesce(p_expected_object_path,''))) not between 1 and 1024 then
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-cleanup-v404','code','CLEANUP_TARGET_INVALID');
  end if;
  if v_kind='REQUEST_ITEM' then
    select r.* into v_request from private.member_image_requests r
    join private.member_image_request_items i on i.request_id=r.request_id
    where r.request_id=p_request_id and r.character_id=p_character_id and i.slot=p_slot and i.object_path=p_expected_object_path
    for update of r;
    if not found then
      return jsonb_build_object('ok',true,'apiVersion','404','contract','member-image-cleanup-v404','alreadyFinalized',true);
    end if;
    if not ((v_request.status='DRAFT' and v_request.draft_expires_at <= v_now) or v_request.image_expires_at <= v_now) then
      return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-cleanup-v404','code','CLEANUP_NOT_DUE');
    end if;
    update private.member_image_request_items set storage_deleted_at=v_now
     where request_id=p_request_id and slot=p_slot and object_path=p_expected_object_path and storage_deleted_at is null;
    delete from private.member_character_reference_images
     where character_id=p_character_id and slot=p_slot and object_path=p_expected_object_path
       and expires_at <= v_now;
  elsif v_kind='QUEUED_OBJECT' then
    update private.member_image_object_cleanup_queue set storage_deleted_at=v_now
     where character_id=p_character_id and slot=p_slot and object_path=p_expected_object_path
       and storage_deleted_at is null and delete_after <= v_now;
    if not found then
      return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-cleanup-v404','code','CLEANUP_QUEUE_CONFLICT');
    end if;
  elsif v_kind='ACTIVE_REFERENCE' then
    delete from private.member_character_reference_images
     where character_id=p_character_id and slot=p_slot and object_path=p_expected_object_path
       and expires_at <= v_now;
    if not found then
      return jsonb_build_object('ok',true,'apiVersion','404','contract','member-image-cleanup-v404','alreadyFinalized',true);
    end if;
  else
    return jsonb_build_object('ok',false,'apiVersion','404','contract','member-image-cleanup-v404','code','CLEANUP_SOURCE_INVALID');
  end if;
  return jsonb_build_object('ok',true,'apiVersion','404','contract','member-image-cleanup-v404','alreadyFinalized',false,'sourceKind',v_kind);
end;
$function$;

create or replace function public.kinojo_member_image_request_metadata_cleanup_v404(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_deleted bigint;
begin
  with due as (
    select r.request_id from private.member_image_requests r
    where r.metadata_expires_at <= statement_timestamp()
      and not exists (
        select 1 from private.member_image_request_items i
        where i.request_id=r.request_id and i.storage_deleted_at is null
      )
    order by r.metadata_expires_at asc
    limit least(greatest(coalesce(p_limit,100),1),200)
    for update skip locked
  )
  delete from private.member_image_requests r using due
   where r.request_id=due.request_id;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok',true,'apiVersion','404','contract','member-image-request-metadata-cleanup-v404','metadataDeleted',v_deleted);
end;
$function$;

revoke all on function public.kinojo_member_image_request_prepare_v404(text,bigint,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.kinojo_member_image_request_draft_v404(text,bigint,text) from public, anon, authenticated;
revoke all on function public.kinojo_member_image_request_finalize_v404(text,bigint,text,jsonb) from public, anon, authenticated;
revoke all on function public.kinojo_member_image_request_state_v404(text,bigint) from public, anon, authenticated;
revoke all on function public.kinojo_member_image_cleanup_candidates_v404(integer) from public, anon, authenticated;
revoke all on function public.kinojo_member_image_cleanup_finalize_v404(text,bigint,bigint,text,text) from public, anon, authenticated;
revoke all on function public.kinojo_member_image_request_metadata_cleanup_v404(integer) from public, anon, authenticated;

grant execute on function public.kinojo_member_image_request_prepare_v404(text,bigint,text,text,text,jsonb) to service_role;
grant execute on function public.kinojo_member_image_request_draft_v404(text,bigint,text) to service_role;
grant execute on function public.kinojo_member_image_request_finalize_v404(text,bigint,text,jsonb) to service_role;
grant execute on function public.kinojo_member_image_request_state_v404(text,bigint) to service_role;
grant execute on function public.kinojo_member_image_cleanup_candidates_v404(integer) to service_role;
grant execute on function public.kinojo_member_image_cleanup_finalize_v404(text,bigint,bigint,text,text) to service_role;
grant execute on function public.kinojo_member_image_request_metadata_cleanup_v404(integer) to service_role;

comment on table private.member_image_requests is 'KINOJO member image production requests; image bytes expire within 7 days and request metadata within 30 days.';
comment on function public.kinojo_member_image_request_prepare_v404(text,bigint,text,text,text,jsonb) is 'Service-role-only atomic DRAFT and batch upload contract for 1-3 edited reference images.';
comment on function public.kinojo_member_image_request_finalize_v404(text,bigint,text,jsonb) is 'Service-role-only atomic DRAFT to SUBMITTED transition after Edge Storage and pixel verification.';
