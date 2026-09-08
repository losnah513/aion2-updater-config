-- Retry all registration rows after a lost finalize/result response. Queue
-- success alone is not the registration's completed readback boundary.
create or replace function public.kinojo_sanctuary_list_sync_prepare_v480(
  p_registration_id uuid,
  p_queue_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event private.sanctuary_character_registration_events_v480%rowtype;
  v_queue_count integer;
begin
  select * into v_event
  from private.sanctuary_character_registration_events_v480
  where registration_id=p_registration_id
  for update;
  if not found or not v_event.list_sync_requested
     or v_event.list_queue_session_id is distinct from p_queue_session_id then
    return jsonb_build_object('ok',false,'code','REGISTRATION_NOT_FOUND','message','List 반영 등록 정보를 찾지 못했습니다.');
  end if;
  if v_event.list_sync_status='SYNCED' then
    return jsonb_build_object('ok',true,'alreadySynced',true,'registrationId',p_registration_id,
      'queueSessionId',v_event.list_queue_session_id,'expectedCount',v_event.list_queue_count);
  end if;
  select count(*) into v_queue_count
  from public.google_list_sheet_sync_queue
  where session_id=v_event.list_queue_session_id;
  if v_queue_count<1 then
    return jsonb_build_object('ok',false,'code','LIST_QUEUE_EMPTY','message','반영할 List Queue가 없습니다.');
  end if;
  update private.sanctuary_character_registration_events_v480
     set list_sync_status='SYNCING',updated_at=clock_timestamp()
   where registration_id=p_registration_id;
  return jsonb_build_object('ok',true,'registrationId',p_registration_id,
    'queueSessionId',v_event.list_queue_session_id,'expectedCount',v_queue_count);
end
$function$;
revoke all on function public.kinojo_sanctuary_list_sync_prepare_v480(uuid,text) from public,anon,authenticated;
grant execute on function public.kinojo_sanctuary_list_sync_prepare_v480(uuid,text) to service_role;
notify pgrst,'reload schema';
