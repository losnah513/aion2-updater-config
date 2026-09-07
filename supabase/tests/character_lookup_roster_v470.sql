-- Rollback-only regression, no Worker/PLAYNC/Google Sheet requests.
-- A live updater run is never replaced: abort if the global lock is busy.
begin;
set local lock_timeout='2s';
set local statement_timeout='60s';
do $test$
declare
  v_sid text := 'v470-test-'||md5(clock_timestamp()::text);
  v_token text := md5(random()::text||clock_timestamp()::text);
  v_id bigint;
  v_target bigint;
  v_list jsonb;
  v_with_night jsonb;
  v_result jsonb;
  v_before jsonb;
  v_after jsonb;
  v_report jsonb := '[]'::jsonb;
  v_count integer;
  v_expected integer;
  v_lock boolean;
begin
  begin
    select is_locked into v_lock from public.updater_lock_state where id='global' for update nowait;
    if v_lock then raise exception 'Updater busy; abort test'; end if;
    insert into public.updater_sessions(session_id,session_token,tool_name,client_id,status)
      values(v_sid,v_token,'v470_regression','v470_regression','running');
    update public.updater_lock_state set is_locked=true,session_id=v_sid,session_token=v_token,
      tool_name='v470_regression',client_id='v470_regression',status='running',
      expires_at=now()+interval '15 minutes',last_heartbeat_at=now(),started_at=now()
      where id='global';

    select id into strict v_id from public.character_master
      where character_name='밤' and server_id=2002 and char_key='563512903374739083';
    -- Simulate the user's normal restore inside the rollback-only fixture.
    update public.character_master set is_active=true,status='OK',lookup_excluded=false,
      visibility_excluded=false,inactive_reason=null,inactive_memo=null,inactivated_at=null,
      exclusion_reason=null,exclusion_memo=null,restored_at=now(),sync_status='admin_status_restored'
      where id=v_id;
    select jsonb_build_object('id',id,'name',character_name,'server',server_id,'key',char_key,
      'url',detail_url,'mainId',main_character_id,'mainName',main_character_name,'isMain',is_main,
      'listRow',list_row,'legion',legion_name,'restoredAt',restored_at) into v_before
      from public.character_master where id=v_id;
    select coalesce(jsonb_agg(jsonb_build_object('row',cm.list_row,'name',cm.character_name,
      'serverId',cm.server_id,'className',cm.class_name,'mainCharacterName',cm.main_character_name)), '[]'::jsonb)
      into v_list from public.character_master cm
      where cm.id<>v_id and coalesce(cm.is_active,true) and cm.status not in ('DELETED','INACTIVE')
        and cm.list_row is not null;
    select v_list||jsonb_build_array(jsonb_build_object('row',list_row,'name',character_name,
      'serverId',server_id,'className',class_name,'mainCharacterName',main_character_name))
      into v_with_night from public.character_master where id=v_id;

    for v_count in 1..2 loop
      v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_list,
        '{"characterName":"밤","servers":[2002],"lookupMode":"all"}'::jsonb);
      if v_result->>'ok' is distinct from 'true' or v_result->>'queueCount' is distinct from '1' then
        raise exception 'single repeat %: expected exactly one night target, got %',v_count,
          jsonb_build_object('ok',v_result->'ok','queueCount',v_result->'queueCount','code',v_result->'code');
      end if;
      if not exists(select 1 from public.character_master where id=v_id and is_active
        and status='OK' and not lookup_excluded and not visibility_excluded and restored_at is not null) then
        raise exception 'night re-excluded during single prepare';
      end if;
      select id into strict v_target from public.lookup_session_targets
        where session_id=v_sid and character_name='밤' and server_id=2002;
    end loop;
    v_report:=v_report||jsonb_build_array('single repeat: 1 target, active');

    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_list,'{}'::jsonb);
    select count(*) into v_expected from public.character_master cm where coalesce(cm.is_active,true)
      and coalesce(cm.status,'') not in ('DELETED','INACTIVE')
      and public.kinojo_lookup_admin_exclusion_reason(cm.server_id,cm.character_name) is null;
    if v_result->>'ok' is distinct from 'true' or (v_result->>'queueCount')::integer<>v_expected then
      raise exception 'full roster count mismatch: got %, expected %',v_result->>'queueCount',v_expected;
    end if;
    if (select count(*) from public.lookup_session_targets where session_id=v_sid
      and server_id=2002 and character_name='밤')<>1 then raise exception 'full night missing/duplicate'; end if;
    if exists(select 1 from public.lookup_session_targets where session_id=v_sid
      and public.kinojo_is_list_absent_target_v300(target_source)) then raise exception 'legacy absent target created'; end if;
    v_report:=v_report||jsonb_build_array(jsonb_build_object('fullRoster',v_expected));

    select id into strict v_target from public.lookup_session_targets
      where session_id=v_sid and server_id=2002 and character_name='밤';
    update public.lookup_session_targets set target_source='server:list_absent_identity_check_v297',
      target_status='lookup_done' where id=v_target;
    perform public.kinojo_finalize_list_absent_session_v297(v_sid);
    perform public.kinojo_finalize_list_absent_failure_v297(v_sid,v_target,'PROVIDER_RETRY_REQUIRED','rollback-only test');
    if not exists(select 1 from public.character_master where id=v_id and is_active
      and status='OK' and not lookup_excluded and not visibility_excluded) then
      raise exception 'legacy finalize re-excluded night'; end if;
    select jsonb_build_object('id',id,'name',character_name,'server',server_id,'key',char_key,
      'url',detail_url,'mainId',main_character_id,'mainName',main_character_name,'isMain',is_main,
      'listRow',list_row,'legion',legion_name,'restoredAt',restored_at) into v_after
      from public.character_master where id=v_id;
    if v_before is distinct from v_after then raise exception 'identity/family/restoration state changed'; end if;
    v_report:=v_report||jsonb_build_array('legacy success/failure finalize: preserved','identity/family/list row/restoredAt: identical');

    update public.character_master set lookup_excluded=true,exclusion_reason='기타' where id=v_id;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_with_night,
      '{"characterName":"밤","servers":[2002]}'::jsonb);
    if v_result->>'queueCount' is distinct from '0'
      or not (select lookup_excluded from public.character_master where id=v_id) then
      raise exception 'manual lookup exclusion lost'; end if;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_list,
      '{"characterName":"밤","servers":[2002]}'::jsonb);
    if v_result->>'queueCount' is distinct from '0' then raise exception 'listless manual exclusion lost'; end if;
    v_report:=v_report||jsonb_build_array('manual exclusion: preserved with/without list row');

    update public.character_master set lookup_excluded=false,exclusion_reason=null where id=v_id;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_list,
      '{"characterName":"밤","servers":[2008]}'::jsonb);
    if exists(select 1 from public.lookup_session_targets where session_id=v_sid and server_id=2002) then
      raise exception 'server filter crossed server identity'; end if;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,'[]'::jsonb,
      '{"characterName":"밤","servers":[2002]}'::jsonb);
    if v_result->>'queueCount' is distinct from '1' then raise exception 'empty list suppressed master'; end if;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,v_list,
      '{"characterName":"밤","servers":[2002],"lookupMode":"missing_only"}'::jsonb);
    if v_result->>'queueCount' is distinct from '0' then raise exception 'existing night counted as new'; end if;
    v_report:=v_report||jsonb_build_array('server filter/empty list/missing-only: passed');

    select to_jsonb(cm) into v_before from public.character_master cm where id=v_id;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,'invalid',v_list,'{}'::jsonb);
    if v_result->>'ok' is distinct from 'false' then raise exception 'invalid session accepted'; end if;
    select to_jsonb(cm) into v_after from public.character_master cm where id=v_id;
    if v_before is distinct from v_after then raise exception 'invalid session mutated master'; end if;
    v_result:=public.kinojo_prepare_lookup_queue_from_list(v_sid,v_token,null,'{}'::jsonb);
    if v_result->>'code' is distinct from 'INVALID_LIST' then raise exception 'null list accepted'; end if;
    v_report:=v_report||jsonb_build_array('invalid session/null list: rejected');
    raise exception using errcode='Z0470',message='rollback all test data';
  exception when sqlstate 'Z0470' then null;
  end;
  perform set_config('kinojo.test_v470',v_report::text,true);
end;
$test$;
select current_setting('kinojo.test_v470')::jsonb as regression_results;
rollback;
