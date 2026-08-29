-- Supabase performance advisor: Stage 7 승인 이력 FK 조회/삭제 검사를 위한 커버링 인덱스.
create index if not exists sanctuary_management_stage7_runs_v446_approval_id_idx
  on private.sanctuary_management_stage7_runs_v446(approval_id);
