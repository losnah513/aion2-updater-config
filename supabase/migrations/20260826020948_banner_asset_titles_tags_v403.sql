-- KINOJO banner asset title + hashtag metadata contract v403.
-- Existing display_name remains a legacy presentation field; title/tags are canonical.

create or replace function private.kinojo_banner_title_normalize_v403(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_value,'')), '[[:space:]]+', ' ', 'g')
$function$;

create or replace function private.kinojo_banner_tag_normalize_v403(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_value,'')), '^#+', ''),
    '[[:space:]]+', ' ', 'g'
  )
$function$;

create or replace function private.kinojo_banner_tags_json_valid_v403(p_tags jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, private
as $function$
  select pg_catalog.jsonb_typeof(p_tags)='array'
    and pg_catalog.jsonb_array_length(p_tags) <= 5
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(p_tags) e(value)
      cross join lateral (
        select private.kinojo_banner_tag_normalize_v403(e.value) as tag
      ) n
      where pg_catalog.char_length(n.tag) not between 1 and 20
         or n.tag !~ '^[0-9A-Za-z가-힣_-]+([ ][0-9A-Za-z가-힣_-]+)*$'
    )
$function$;

create or replace function private.kinojo_banner_tags_normalize_v403(p_tags jsonb)
returns text[]
language plpgsql
immutable
set search_path = pg_catalog, private
as $function$
declare
  v_value text;
  v_tag text;
  v_result text[] := array[]::text[];
  v_keys text[] := array[]::text[];
begin
  if not private.kinojo_banner_tags_json_valid_v403(p_tags) then
    return null;
  end if;
  for v_value in select value from pg_catalog.jsonb_array_elements_text(p_tags)
  loop
    v_tag := private.kinojo_banner_tag_normalize_v403(v_value);
    if not pg_catalog.lower(v_tag)=any(v_keys) then
      v_result := pg_catalog.array_append(v_result,v_tag);
      v_keys := pg_catalog.array_append(v_keys,pg_catalog.lower(v_tag));
    end if;
  end loop;
  return v_result;
end
$function$;

create or replace function private.kinojo_banner_tags_array_valid_v403(p_tags text[])
returns boolean
language sql
immutable
set search_path = pg_catalog, private
as $function$
  select pg_catalog.cardinality(coalesce(p_tags,array[]::text[])) <= 5
    and not exists (
      select 1
      from pg_catalog.unnest(coalesce(p_tags,array[]::text[])) e(value)
      where private.kinojo_banner_tag_normalize_v403(e.value)<>e.value
         or pg_catalog.char_length(e.value) not between 1 and 20
         or e.value !~ '^[0-9A-Za-z가-힣_-]+([ ][0-9A-Za-z가-힣_-]+)*$'
    )
    and (
      select pg_catalog.count(*)=pg_catalog.count(distinct pg_catalog.lower(e.value))
      from pg_catalog.unnest(coalesce(p_tags,array[]::text[])) e(value)
    )
$function$;

create or replace function private.kinojo_banner_legacy_display_name_v403(
  p_title text,
  p_tags text[]
) returns text
language sql
immutable
set search_path = pg_catalog, private
as $function$
  select pg_catalog.left(
    case when pg_catalog.cardinality(coalesce(p_tags,array[]::text[]))>0
      then pg_catalog.array_to_string(array(select '#'||t.tag from pg_catalog.unnest(p_tags) as t(tag)),' ')||' · '
      else ''
    end || private.kinojo_banner_title_normalize_v403(p_title),
    120
  )
$function$;

revoke all on function private.kinojo_banner_title_normalize_v403(text) from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_tag_normalize_v403(text) from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_tags_json_valid_v403(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_tags_normalize_v403(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_tags_array_valid_v403(text[]) from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_legacy_display_name_v403(text,text[]) from public, anon, authenticated, service_role;

alter table public.kinojo_banner_assets
  add column if not exists title text,
  add column if not exists tags text[] not null default array[]::text[],
  add column if not exists metadata_migration_status text not null default 'CURRENT';

with candidates as (
  select
    a.asset_id,
    a.display_name,
    a.display_name ~ '^#[^#·[:space:]]+([[:space:]]+#[^#·[:space:]]+)*[[:space:]]*·[[:space:]]*' as can_split,
    private.kinojo_banner_title_normalize_v403(
      case when a.display_name ~ '^#[^#·[:space:]]+([[:space:]]+#[^#·[:space:]]+)*[[:space:]]*·[[:space:]]*'
        then pg_catalog.regexp_replace(a.display_name,'^#[^#·[:space:]]+([[:space:]]+#[^#·[:space:]]+)*[[:space:]]*·[[:space:]]*','','g')
        else a.display_name
      end
    ) as candidate_title,
    case when a.display_name ~ '^#[^#·[:space:]]+([[:space:]]+#[^#·[:space:]]+)*[[:space:]]*·[[:space:]]*'
      then array(
        select private.kinojo_banner_tag_normalize_v403(m[1])
        from pg_catalog.regexp_matches(
          pg_catalog.split_part(a.display_name,'·',1),
          '#([^#[:space:]·]+)',
          'g'
        ) m
      )
      else array[]::text[]
    end as candidate_tags
  from public.kinojo_banner_assets a
  where a.title is null
), ranked as (
  select c.*,
    pg_catalog.count(*) over (
      partition by pg_catalog.lower(private.kinojo_banner_title_normalize_v403(c.candidate_title))
    ) as candidate_count
  from candidates c
)
update public.kinojo_banner_assets a
set
  title=case when r.candidate_title<>'' and r.candidate_count=1
    then r.candidate_title
    else pg_catalog.left(
      coalesce(
        nullif(private.kinojo_banner_title_normalize_v403(r.display_name),''),
        '배너 이미지'
      ),
      92
    )||' · 기존 '||r.asset_id::text
  end,
  tags=case when r.can_split and r.candidate_title<>'' and r.candidate_count=1
    then r.candidate_tags
    else array[]::text[]
  end,
  metadata_migration_status=case
    when r.candidate_title='' or r.candidate_count>1 then 'REVIEW_REQUIRED_DUPLICATE'
    when r.can_split then 'AUTO_SPLIT'
    else 'PRESERVED'
  end
from ranked r
where a.asset_id=r.asset_id;

create or replace function private.kinojo_banner_asset_metadata_compat_v403()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_should_sync boolean := false;
  v_legacy boolean;
  v_title text;
  v_tags text[] := array[]::text[];
begin
  if tg_op='INSERT' then
    v_should_sync:=new.title is null or private.kinojo_banner_title_normalize_v403(new.title)='';
  elsif tg_op='UPDATE' then
    v_should_sync:=new.display_name is distinct from old.display_name
      and new.title is not distinct from old.title
      and new.tags is not distinct from old.tags;
  end if;
  if v_should_sync then
    v_legacy:=new.display_name ~ '^#[^#·[:space:]]+([[:space:]]+#[^#·[:space:]]+)*[[:space:]]*·[[:space:]]*';
    v_title:=private.kinojo_banner_title_normalize_v403(
      case when v_legacy
        then pg_catalog.regexp_replace(new.display_name,'^#[^#·[:space:]]+([[:space:]]+#[^#·[:space:]]+)*[[:space:]]*·[[:space:]]*','','g')
        else new.display_name
      end
    );
    if v_title='' then v_title:='배너 이미지'; end if;
    if v_legacy then
      v_tags:=array(
        select private.kinojo_banner_tag_normalize_v403(m[1])
        from pg_catalog.regexp_matches(
          pg_catalog.split_part(new.display_name,'·',1),
          '#([^#[:space:]·]+)',
          'g'
        ) m
        limit 5
      );
      if not private.kinojo_banner_tags_array_valid_v403(v_tags) then
        v_title:=private.kinojo_banner_title_normalize_v403(new.display_name);
        v_tags:=array[]::text[];
        v_legacy:=false;
      end if;
    end if;
    new.title:=v_title;
    new.tags:=v_tags;
    new.metadata_migration_status:=case when v_legacy then 'AUTO_SPLIT' else 'PRESERVED' end;
  end if;
  return new;
end
$function$;

revoke all on function private.kinojo_banner_asset_metadata_compat_v403() from public, anon, authenticated, service_role;

drop trigger if exists kinojo_banner_asset_metadata_compat_v403_trg on public.kinojo_banner_assets;
create trigger kinojo_banner_asset_metadata_compat_v403_trg
before insert or update of display_name,title,tags on public.kinojo_banner_assets
for each row execute function private.kinojo_banner_asset_metadata_compat_v403();

alter table public.kinojo_banner_assets alter column title set not null;

do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname='kinojo_banner_assets_title_v403_chk'
      and conrelid='public.kinojo_banner_assets'::pg_catalog.regclass
  ) then
    alter table public.kinojo_banner_assets
      add constraint kinojo_banner_assets_title_v403_chk
      check (
        pg_catalog.char_length(title) between 1 and 120
        and title=private.kinojo_banner_title_normalize_v403(title)
      );
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname='kinojo_banner_assets_tags_v403_chk'
      and conrelid='public.kinojo_banner_assets'::pg_catalog.regclass
  ) then
    alter table public.kinojo_banner_assets
      add constraint kinojo_banner_assets_tags_v403_chk
      check (private.kinojo_banner_tags_array_valid_v403(tags));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname='kinojo_banner_assets_metadata_migration_v403_chk'
      and conrelid='public.kinojo_banner_assets'::pg_catalog.regclass
  ) then
    alter table public.kinojo_banner_assets
      add constraint kinojo_banner_assets_metadata_migration_v403_chk
      check (metadata_migration_status in ('CURRENT','AUTO_SPLIT','PRESERVED','REVIEW_REQUIRED_DUPLICATE'));
  end if;
end
$block$;

create unique index if not exists kinojo_banner_assets_title_key_v403_uidx
  on public.kinojo_banner_assets(
    pg_catalog.lower(private.kinojo_banner_title_normalize_v403(title))
  );

create index if not exists kinojo_banner_assets_tags_v403_gin
  on public.kinojo_banner_assets using gin(tags);

create or replace function private.kinojo_banner_asset_json_v403(
  a public.kinojo_banner_assets
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.kinojo_banner_asset_json_v384(a)
    || pg_catalog.jsonb_build_object(
      'title',a.title,
      'tags',pg_catalog.to_jsonb(a.tags),
      'metadataMigrationStatus',a.metadata_migration_status
    )
$function$;

revoke all on function private.kinojo_banner_asset_json_v403(public.kinojo_banner_assets) from public, anon, authenticated, service_role;

create or replace function public.kinojo_banner_asset_title_available_v403(
  p_session_token text,
  p_title text,
  p_exclude_asset_id bigint default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_title text := private.kinojo_banner_title_normalize_v403(p_title);
  v_available boolean;
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  if pg_catalog.char_length(v_title) not between 1 and 120 then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_ASSET_TITLE_INVALID');
  end if;
  select not exists (
    select 1 from public.kinojo_banner_assets a
    where pg_catalog.lower(a.title)=pg_catalog.lower(v_title)
      and (p_exclude_asset_id is null or a.asset_id<>p_exclude_asset_id)
  ) into v_available;
  return pg_catalog.jsonb_build_object(
    'ok',true,'apiVersion','403','contract','banner-asset-title-available-v403',
    'title',v_title,'available',v_available,
    'code',case when v_available then null else 'BANNER_ASSET_TITLE_DUPLICATE' end
  );
end
$function$;

create or replace function public.kinojo_banner_asset_list_v403(
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
  v_items jsonb;
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  select coalesce(
    pg_catalog.jsonb_agg(private.kinojo_banner_asset_json_v403(a) order by a.created_at desc,a.asset_id desc),
    '[]'::jsonb
  ) into v_items
  from public.kinojo_banner_assets a
  where coalesce(p_include_archived,true) or a.status='READY';
  return pg_catalog.jsonb_build_object(
    'ok',true,'apiVersion','403','contract','banner-asset-list-v403',
    'memberId',(v_gate->>'memberId')::bigint,'assets',v_items
  );
end
$function$;

create or replace function public.kinojo_banner_asset_update_v403(
  p_session_token text,
  p_asset_id bigint,
  p_title text,
  p_tags jsonb default '[]'::jsonb,
  p_default_alt text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_member bigint;
  v_asset public.kinojo_banner_assets;
  v_title text := private.kinojo_banner_title_normalize_v403(p_title);
  v_tags text[];
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  if pg_catalog.char_length(v_title) not between 1 and 120 then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_ASSET_TITLE_INVALID');
  end if;
  if not private.kinojo_banner_tags_json_valid_v403(coalesce(p_tags,'[]'::jsonb)) then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_ASSET_TAGS_INVALID');
  end if;
  v_tags:=private.kinojo_banner_tags_normalize_v403(coalesce(p_tags,'[]'::jsonb));
  v_member:=(v_gate->>'memberId')::bigint;
  select * into v_asset from public.kinojo_banner_assets where asset_id=p_asset_id for update;
  if v_asset.asset_id is null then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_ASSET_NOT_FOUND'); end if;
  if v_asset.delete_token is not null then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_ASSET_DELETE_IN_PROGRESS'); end if;
  update public.kinojo_banner_assets
  set title=v_title,
      tags=v_tags,
      display_name=private.kinojo_banner_legacy_display_name_v403(v_title,v_tags),
      default_alt=coalesce(p_default_alt,''),
      metadata_migration_status='CURRENT',
      updated_by_member_id=v_member,
      updated_at=pg_catalog.clock_timestamp()
  where asset_id=p_asset_id
  returning * into v_asset;
  return pg_catalog.jsonb_build_object(
    'ok',true,'apiVersion','403','contract','banner-asset-update-v403',
    'asset',private.kinojo_banner_asset_json_v403(v_asset)
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_ASSET_TITLE_DUPLICATE');
  when check_violation then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_ASSET_VALIDATION_FAILED');
end
$function$;

create or replace function public.kinojo_banner_asset_register_storage_v403(
  p_session_token text,
  p_object_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_width integer,
  p_height integer,
  p_format_code text,
  p_title text,
  p_tags jsonb default '[]'::jsonb,
  p_original_file_name text default null,
  p_default_alt text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, storage
as $function$
declare
  v_gate jsonb;
  v_member bigint;
  v_asset public.kinojo_banner_assets;
  v_aspect_matches boolean;
  v_title text := private.kinojo_banner_title_normalize_v403(p_title);
  v_tags text[];
  v_constraint text;
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  if pg_catalog.char_length(v_title) not between 1 and 120 then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_ASSET_TITLE_INVALID');
  end if;
  if not private.kinojo_banner_tags_json_valid_v403(coalesce(p_tags,'[]'::jsonb)) then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_ASSET_TAGS_INVALID');
  end if;
  v_tags:=private.kinojo_banner_tags_normalize_v403(coalesce(p_tags,'[]'::jsonb));
  v_member:=(v_gate->>'memberId')::bigint;
  if not private.kinojo_banner_storage_path_valid_v382(p_object_path,p_mime_type) then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_OBJECT_PATH_INVALID');
  end if;
  if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>5242880 then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_IMAGE_SIZE_INVALID');
  end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp') then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_IMAGE_MIME_INVALID');
  end if;
  if p_format_code not in ('MAIN_16_9','SIDE_300_715')
     or p_width is null or p_height is null or p_width<=0 or p_height<=0 then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_IMAGE_DIMENSION_INVALID');
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='kinojo-site-banners' and o.name=p_object_path
  ) then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_UPLOAD_OBJECT_NOT_FOUND');
  end if;
  v_aspect_matches:=(
    (p_format_code='MAIN_16_9' and p_width::bigint*9=p_height::bigint*16)
    or (p_format_code='SIDE_300_715' and p_width::bigint*715=p_height::bigint*300)
  );
  begin
    insert into public.kinojo_banner_assets(
      format_code,source_type,display_name,title,tags,metadata_migration_status,
      original_file_name,object_path,mime_type,size_bytes,width,height,default_alt,status,
      created_by_member_id,updated_by_member_id
    ) values (
      p_format_code,'STORAGE',private.kinojo_banner_legacy_display_name_v403(v_title,v_tags),
      v_title,v_tags,'CURRENT',nullif(p_original_file_name,''),p_object_path,p_mime_type,
      p_size_bytes,p_width,p_height,coalesce(p_default_alt,''),'READY',v_member,v_member
    ) returning * into v_asset;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint=constraint_name;
      return pg_catalog.jsonb_build_object(
        'ok',false,
        'code',case when v_constraint='kinojo_banner_assets_title_key_v403_uidx'
          then 'BANNER_ASSET_TITLE_DUPLICATE'
          else 'BANNER_ASSET_OBJECT_PATH_CONFLICT'
        end
      );
    when check_violation then
      return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_ASSET_VALIDATION_FAILED');
  end;
  return pg_catalog.jsonb_build_object(
    'ok',true,'apiVersion','403','contract','banner-asset-register-storage-v403',
    'asset',private.kinojo_banner_asset_json_v403(v_asset)
      || pg_catalog.jsonb_build_object(
        'aspectMatchesTarget',v_aspect_matches,
        'fitMode','COVER',
        'cropWarning',not v_aspect_matches
      )
  );
end
$function$;

revoke all on function public.kinojo_banner_asset_title_available_v403(text,text,bigint) from public, anon, authenticated;
revoke all on function public.kinojo_banner_asset_list_v403(text,boolean) from public, anon, authenticated;
revoke all on function public.kinojo_banner_asset_update_v403(text,bigint,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.kinojo_banner_asset_register_storage_v403(text,text,text,bigint,integer,integer,text,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.kinojo_banner_asset_title_available_v403(text,text,bigint) to service_role;
grant execute on function public.kinojo_banner_asset_list_v403(text,boolean) to service_role;
grant execute on function public.kinojo_banner_asset_update_v403(text,bigint,text,jsonb,text) to service_role;
grant execute on function public.kinojo_banner_asset_register_storage_v403(text,text,text,bigint,integer,integer,text,text,jsonb,text,text) to service_role;

revoke all on table public.kinojo_banner_assets from public, anon, authenticated;
alter table public.kinojo_banner_assets enable row level security;

do $verify$
begin
  if exists (
    select 1 from public.kinojo_banner_assets a
    where a.title is null
       or not private.kinojo_banner_tags_array_valid_v403(a.tags)
  ) then
    raise exception 'BANNER_ASSET_METADATA_MIGRATION_INVALID';
  end if;
  if exists (
    select 1 from public.kinojo_banner_assets a
    group by pg_catalog.lower(private.kinojo_banner_title_normalize_v403(a.title))
    having pg_catalog.count(*)>1
  ) then
    raise exception 'BANNER_ASSET_TITLE_MIGRATION_DUPLICATE';
  end if;
end
$verify$;
