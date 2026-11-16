begin;

alter table private.kinojo_home_bgm
  add column like_count bigint not null default 0 check (like_count >= 0);

create table private.kinojo_home_bgm_daily_like (
  track_id uuid not null references private.kinojo_home_bgm(id) on delete cascade,
  like_day date not null,
  fingerprint bytea not null check (octet_length(fingerprint) = 32),
  primary key (track_id, like_day, fingerprint)
);
alter table private.kinojo_home_bgm_daily_like enable row level security;
revoke all on private.kinojo_home_bgm_daily_like from public, anon, authenticated, service_role;

create function public.kinojo_home_bgm_likes_v1(p_id uuid, p_ip_key text, p_vote boolean)
returns jsonb language plpgsql security definer
set search_path = pg_catalog set statement_timeout = '5s' set lock_timeout = '2s'
as $$
declare
  v_day date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
  v_reset timestamptz := (v_day+1)::timestamp at time zone 'Asia/Seoul';
  v_fingerprint bytea;
  v_count bigint;
  v_liked boolean;
begin
  if p_vote is null or (p_ip_key is not null and p_ip_key !~ '^[a-f0-9]{64}$') then
    return jsonb_build_object('ok',false,'code','INVALID_INPUT');
  end if;
  if p_vote and p_ip_key is null then
    return jsonb_build_object('ok',false,'code','LIKE_IP_UNAVAILABLE');
  end if;
  v_fingerprint := sha256(convert_to(p_ip_key || ':' || p_id::text || ':' || (v_day - date '2000-01-01')::text, 'UTF8'));

  if p_vote then
    -- Serialize with other votes and the existing track delete/update paths.
    select like_count into v_count from private.kinojo_home_bgm
      where id=p_id and state='READY' for update;
    if not found then
      return jsonb_build_object('ok',false,'code','TRACK_UNAVAILABLE');
    end if;
    insert into private.kinojo_home_bgm_daily_like(track_id,like_day,fingerprint)
      values (p_id,v_day,v_fingerprint) on conflict do nothing;
    if found then
      update private.kinojo_home_bgm set like_count=like_count+1
        where id=p_id returning like_count into v_count;
      -- Removing expired fingerprints never changes the lifetime count.
      delete from private.kinojo_home_bgm_daily_like
        where (track_id,like_day,fingerprint) in (
          select track_id,like_day,fingerprint from private.kinojo_home_bgm_daily_like
          where track_id=p_id and like_day<v_day-1
          order by like_day,fingerprint limit 200
        );
    end if;
    v_liked := true;
  else
    select t.like_count, exists(
      select 1 from private.kinojo_home_bgm_daily_like d
      where d.track_id=t.id and d.like_day=v_day and d.fingerprint=v_fingerprint
    ) into v_count,v_liked
    from private.kinojo_home_bgm t where t.id=p_id and t.state='READY';
    if not found then
      return jsonb_build_object('ok',false,'code','TRACK_UNAVAILABLE');
    end if;
  end if;
  return jsonb_build_object('ok',true,'count',v_count,'liked',v_liked,
    'available',p_ip_key is not null,'resetsAt',v_reset,
    'resetAfterMs',floor(extract(epoch from v_reset-statement_timestamp()) * 1000)::integer);
end;
$$;

revoke all on function public.kinojo_home_bgm_likes_v1(uuid,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.kinojo_home_bgm_likes_v1(uuid,text,boolean) to service_role;

commit;
