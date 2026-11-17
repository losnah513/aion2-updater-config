begin;

create table private.kinojo_home_bgm_covers (
  track_id uuid primary key references private.kinojo_home_bgm(id) on delete cascade,
  version uuid not null default gen_random_uuid(),
  image_webp bytea not null check (
    octet_length(image_webp) between 30 and 131072
    and substring(image_webp from 1 for 4) = decode('52494646', 'hex')
    and substring(image_webp from 9 for 4) = decode('57454250', 'hex')
  )
);
alter table private.kinojo_home_bgm_covers enable row level security;
revoke all on private.kinojo_home_bgm_covers from public, anon, authenticated, service_role;

create function public.kinojo_home_bgm_covers_v1(
  p_action text, p_id uuid default null, p_version uuid default null,
  p_session_token text default null, p_image text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog set statement_timeout = '5s' set lock_timeout = '2s'
as $$
declare
  v_cover private.kinojo_home_bgm_covers%rowtype;
  v_image bytea;
begin
  if p_action = 'catalog' then
    return jsonb_build_object('ok', true, 'covers', coalesce((
      select jsonb_object_agg(c.track_id,c.version)
      from private.kinojo_home_bgm_covers c join private.kinojo_home_bgm t on t.id=c.track_id
      where t.state='READY'
    ), '{}'::jsonb));
  end if;

  if p_action = 'get' then
    select c.* into v_cover
    from private.kinojo_home_bgm_covers c join private.kinojo_home_bgm t on t.id=c.track_id
    where c.track_id=p_id and c.version=p_version and t.state='READY';
    if not found then return jsonb_build_object('ok',false,'code','COVER_UNAVAILABLE'); end if;
    return jsonb_build_object('ok',true,'image',replace(encode(v_cover.image_webp,'base64'),chr(10),''));
  end if;

  if p_action is distinct from 'save' then
    return jsonb_build_object('ok',false,'code','INVALID_INPUT');
  end if;
  if public.kinojo_home_bgm_v1('authorize',p_session_token,'{}'::jsonb)->>'ok' is distinct from 'true' then
    return jsonb_build_object('ok',false,'code','ADMIN_ACCESS_REQUIRED');
  end if;
  if p_image is null or char_length(p_image) > 174764 or p_image !~ '^[A-Za-z0-9+/]+={0,2}$' then
    return jsonb_build_object('ok',false,'code','INVALID_COVER');
  end if;
  begin
    v_image := decode(p_image,'base64');
  exception when invalid_parameter_value then
    return jsonb_build_object('ok',false,'code','INVALID_COVER');
  end;
  if octet_length(v_image) not between 30 and 131072
      or substring(v_image from 1 for 4) <> decode('52494646', 'hex')
      or substring(v_image from 9 for 4) <> decode('57454250', 'hex') then
    return jsonb_build_object('ok',false,'code','INVALID_COVER');
  end if;
  perform 1 from private.kinojo_home_bgm where id=p_id and state='READY' for update;
  if not found then return jsonb_build_object('ok',false,'code','TRACK_UNAVAILABLE'); end if;
  insert into private.kinojo_home_bgm_covers(track_id,image_webp) values (p_id,v_image)
    on conflict (track_id) do update set image_webp=excluded.image_webp, version=gen_random_uuid()
    returning * into v_cover;
  return jsonb_build_object('ok',true,'version',v_cover.version);
end;
$$;
revoke all on function public.kinojo_home_bgm_covers_v1(text,uuid,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.kinojo_home_bgm_covers_v1(text,uuid,uuid,text,text) to service_role;

commit;
