begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kinojo-home-bgm', 'kinojo-home-bgm', true, 6291456,
        array['audio/mpeg','audio/mp4','audio/ogg']);

create table private.kinojo_home_bgm (
  id uuid primary key,
  extension text not null check (extension in ('mp3','m4a','ogg')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  bytes integer not null check (bytes between 1 and 6291456),
  sort_order integer not null check (sort_order between 0 and 9999),
  state text not null check (state in ('UPLOADING','READY','DELETING')),
  created_at timestamptz not null default now()
);
alter table private.kinojo_home_bgm enable row level security;
revoke all on private.kinojo_home_bgm from public, anon, authenticated, service_role;

create function public.kinojo_home_bgm_v1(
  p_action text, p_session_token text default null, p_track jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog set statement_timeout = '5s' set lock_timeout = '2s'
as $$
declare
  v_actor jsonb;
  v_id uuid;
  v_row private.kinojo_home_bgm%rowtype;
begin
  if p_action = 'playlist' then
    return jsonb_build_object('ok',true,'tracks',coalesce((
      select jsonb_agg(jsonb_build_object('id',id,'title',title,'extension',extension)
                       order by sort_order,created_at,id)
      from private.kinojo_home_bgm where state='READY'
    ),'[]'::jsonb));
  end if;

  begin
    v_actor := public.kinojo_web_admin_actor_v323(p_session_token);
  exception when raise_exception then
    return jsonb_build_object('ok',false,'code','ADMIN_ACCESS_REQUIRED');
  end;
  if coalesce((v_actor->>'level')::integer,0) < 3 then
    return jsonb_build_object('ok',false,'code','ADMIN_ACCESS_REQUIRED');
  end if;
  if p_action = 'list' then
    return jsonb_build_object('ok',true,'tracks',coalesce((
      select jsonb_agg(to_jsonb(t) || jsonb_build_object('canDelete',
                        state<>'UPLOADING' or created_at < now()-interval '5 minutes')
                        order by sort_order,created_at,id)
      from private.kinojo_home_bgm t
    ),'[]'::jsonb));
  end if;
  if p_action = 'authorize' then
    return jsonb_build_object('ok',true);
  end if;

  v_id := (p_track->>'id')::uuid;
  if p_action = 'reserve' then
    perform pg_advisory_xact_lock(782336201);
    if (select count(*) from private.kinojo_home_bgm) >= 20 then
      return jsonb_build_object('ok',false,'code','TRACK_LIMIT');
    end if;
    insert into private.kinojo_home_bgm(id,extension,title,bytes,sort_order,state)
      values(v_id,p_track->>'extension',btrim(p_track->>'title'),
             (p_track->>'bytes')::integer,coalesce((select least(9999,max(sort_order)+1) from private.kinojo_home_bgm),1),
             'UPLOADING') returning * into v_row;
  elsif p_action = 'publish' then
    update private.kinojo_home_bgm set state='READY' where id=v_id and state='UPLOADING'
      returning * into v_row;
  elsif p_action = 'update' then
    update private.kinojo_home_bgm set title=btrim(p_track->>'title'),sort_order=(p_track->>'sort_order')::integer
      where id=v_id and state='READY' returning * into v_row;
  elsif p_action = 'begin-delete' then
    update private.kinojo_home_bgm set state='DELETING'
      where id=v_id and (state<>'UPLOADING' or created_at < now()-interval '5 minutes')
      returning * into v_row;
  elsif p_action = 'finish-delete' then
    delete from private.kinojo_home_bgm where id=v_id and state='DELETING';
    return jsonb_build_object('ok',true);
  else
    return jsonb_build_object('ok',false,'code','INVALID_ACTION');
  end if;
  if v_row.id is null then
    return jsonb_build_object('ok',false,'code','TRACK_UNAVAILABLE');
  end if;
  return jsonb_build_object('ok',true,'track',to_jsonb(v_row));
end;
$$;
revoke all on function public.kinojo_home_bgm_v1(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.kinojo_home_bgm_v1(text,text,jsonb) to service_role;

commit;
