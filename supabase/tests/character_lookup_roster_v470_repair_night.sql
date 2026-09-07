-- Explicit user-requested one-row repair after SQL470. Compare-and-set protects later manual changes.
with repaired as (
 update public.character_master cm
 set is_active=true,status='OK',inactive_reason=null,inactive_memo=null,inactivated_at=null,
     restored_at=now(),sync_status='admin_status_restored',lookup_failure_streak=0,
     status_updated_at=now(),updated_at=now()
 where cm.character_name='밤' and cm.server_id=2002 and cm.char_key='563512903374739083'
   and cm.is_active=false and cm.status='INACTIVE'
   and cm.sync_status='list_absent_auto_inactive'
   and cm.inactive_memo='Google list 원본에서 삭제되어 조회 시작 시 자동 탈퇴 처리'
   and not coalesce(cm.lookup_excluded,false) and not coalesce(cm.visibility_excluded,false)
   and cm.exclusion_reason is null
 returning cm.id,cm.character_name,cm.server_id,cm.char_key,cm.detail_url,cm.is_active,cm.status,
   cm.lookup_excluded,cm.visibility_excluded,cm.restored_at
), audit as (
 insert into public.character_status_history(character_name,server_id,action,reason,memo,admin_pass_key)
 select character_name,server_id,'RESTORE_AUTO_LIST_ABSENT_BUGFIX','정상 복구',
   '사용자 요청: 밤 자동 제외 재발 수정 · SQL470 · Google list 누락 자동 탈퇴 해제 · 기존 신원/관계 보존',
   'SERVER_ENGINE' from repaired returning 1
)
select jsonb_build_object('repairedCount',(select count(*) from repaired),'auditCount',(select count(*) from audit),
 'characters',(select jsonb_agg(to_jsonb(r)) from repaired r)) result;
