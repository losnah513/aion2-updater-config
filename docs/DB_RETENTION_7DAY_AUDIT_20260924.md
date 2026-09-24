# DB 원본 7일 보존 검토 — 2026-09-24

운영 DB·현행 함수 읽기 전용 조사. 이 문서는 7일 일괄 삭제 허가가 아니다.

## 판정

교체된 조회 스냅샷과 중복 성공 원본은 새 정상본·파생 요약이 확인되면 7일보다 빨리 정리할 수 있다. 사용자가 요청한 장기 보존 대상은 주·월간 아이템 레벨과 전투력의 **수치 요약**이며, 오래된 조회 원문 자체가 아니다. 현행 코드가 7일 초과 원문을 참조하는 부분은 작은 현재 상태·비교 수치로 분리하거나 조회 실패로 처리한 뒤 원문을 정리해야 한다. 참조가 존재한다는 사실만으로 오래된 원문 보존 정책을 만들지 않는다.

| 소비자 | 현행 읽기 | 7일 초과 필요성 |
| --- | --- | --- |
| 현재 캐릭터 상세·스킬·레기온·재처리 | `character_master`의 최신 원본 및 PVE/PVP 슬롯, `character_skill_current_state`, `character_stat_sources`, 마지막 payload | 현행 참조를 먼저 분리해야 함. 운영에서 7일 초과 최신 스냅샷 참조 32개, 최신 payload 참조 60개, 스킬 스냅샷 21개, stat 스냅샷·payload 각 49개. 마지막 성공 조회가 7일 전인 Master 26개. 오래된 원문을 무기한 보존할 근거는 아님. |
| 현재 순위 생성 | `private.kinojo_ranking_snapshot_scope_payload_v426`가 캐릭터·PVE/PVP별 마지막과 직전 `character_history`를 읽어 직전 날짜·전투력·아이템레벨을 채움 | 직전 조회가 7일을 넘을 수 있음. 운영의 마지막 성공 이력 21개, 직전 성공 이력 54개가 7일 초과(총 비교쌍 178개). 7일로 줄이려면 이 값을 별도 최소 current state로 옮기거나 마지막·직전 행을 예외 보존해야 함. |
| 성장 장기 요약 | `private.character_growth_rollups`: DAY 7일, WEEK 1년, MONTH 무기한 | 숫자·기간·관측 출처가 별도 요약에 있으므로 오래된 **장비/조회 원문** 자체는 장기 성장 보관 사유가 아님. 기존 DAY/WEEK/MONTH 보존 기간은 줄이지 않음. |
| 이번 주 성장왕 후보 | `private.kinojo_ranking_hof_candidate_v476` → `public.kinojo_hof_weekly_deltas` → 현재 주 `master_sync_events`와 payload | 현재 주 계산에는 해당 주 성공 원본이 필요. `p_at`으로 과거 주 후보를 다시 만들면 그 주의 payload가 필요하므로 7일 삭제 전 게시·복원 경로를 확인해야 함. 게시된 ranking snapshot은 별도로 보존됨. |
| 운영 진단·복구 | `kinojo_reprocess_latest_character_lookup`는 이름별 최신 payload, `kinojo_repair_proven_pve_pvp_contamination`은 과거 payload를 순회. `kinojo_history_identity_backfill_v1`은 미연결 history의 출처를 조회. | 최신 payload 및 현재 PVE/PVP 출처는 예외 보존. 운영 현재 미연결 history 0, 미리뷰 정상 POWER history 0. 과거 복구 기능은 원문이 아니라 최소 진단/수치 요약을 읽도록 전환해야 7일 삭제와 양립함. |

주간 경계는 사용자 설명의 “수요일~화요일”을 정확히 구현하면 **Asia/Seoul 수요일 06:00부터 다음 수요일 06:00 직전**이다. 수요일 00:00~05:59 조회는 이전 주에 속한다. 현행 `public.kinojo_aion_week_window`가 이 경계를 사용한다.

현행 `public.kinojo_character_growth_raw_cleanup_v443`은 `character_history`와 `growth_reviews`를 KST 출처일 30일 보관한다. 7일로 바꾸려면 순위의 마지막·직전 숫자와 현재 리뷰 상태를 먼저 보존하고, HOF의 지연/과거 재생성 범위를 결정해야 한다. 단순 상수 변경은 안전하지 않다.

권장 실행 순서: ① 칭호는 마지막 공식 조회만 사용하고 실패를 그대로 표시, ② 현재 기능이 필요한 값만 별도 상태·진단 요약으로 고정하고 오래된 원문 포인터를 제거, ③ 순위 마지막·직전 숫자를 최소 current state에 고정, ④ 검증된 주간·월간 요약과 게시 HOF를 유지하면서 나머지 성공 raw/history를 7일 기준으로 정리. 각 운영 삭제 전에 정확한 대상의 외부 암호화 백업과 독립 복원 검증을 수행한다.
