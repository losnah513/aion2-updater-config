# 캐릭터 최신화 4차 · 2단계 배포·복구 계약

진행 상태·검사 결과·다음 작업은 [프로젝트 LOG](https://drive.google.com/file/d/1k0R6heq6ttLl9IKFm_q1_EGm4FCxmVbQ/view)만 따른다. 이 문서는 운영 실행 승인이 아니다.

## 기준 및 파일

### 공개 스냅샷 분리 후속 계약

- 후속 상태 표시 migration `20260908141651_character_refresh_completion_status.sql`은 기존 인증 status RPC에 read-only 공개 상태만 추가한다. 기존 권한/캐시 요약/생성·공개 경계는 유지한다. WEB 완료 행·최근 기록·별도 생성 상태를 함께 검증한다. rollback은 기존 함수 정의만 복원하며 데이터/예약 작업을 변경하지 않는다.
- `20260908143736_character_payload_identity_index.sql`은 공식 사전 검증의 기존 세 번 최신 원본 조회를 위한 서버·정규화 이름·최신순 인덱스다. 판정/Parser/이력/권한은 변경하지 않는다. 적용 시 기존 제어로 조회를 일시정지하고 짧은 lock timeout을 사용한다. rollback은 해당 인덱스만 제거한다.

- 기존 11개에 이어 `20260908130417_character_automation_cron_api_save.sql`, `20260908131116_character_weekly_identity_query_plan.sql`, `20260908131706_character_deferred_ranking_snapshot.sql` 순서로 적용한다. 적용된 migration을 중복 실행하지 않는다. 진행 상태는 LOG를 따른다.
- 조회의 공식 원시 Snapshot·Master·이력·선택적 list 반영은 유지한다. 공개 Ranking/HOF만 기존 builder/validate/publish를 재사용하는 별도 pg_cron 작업으로 분리한다. 새 Edge/Parser 없음.
- 이어 `20260908134927_character_listless_completion_lease.sql`을 적용한다. 단계 완료로 해제된 Worker lease는 list OFF 종료 함수 안에서 기존 claim RPC로 다시 획득한다. 다른 Worker/일시정지/취소 검사와 정상 소유권 검사는 유지한다.
- 성공 세션의 시작+30분 이후 생성한다. 미완료 조회/상세 작업은 기다리며, 여러 대기 요청은 최신 요청의 30분을 지킨 후 합친다. 한 tick에 한 범위, 네 범위 생성 후 검증·원자 공개한다. 1분 tick이므로 정확히 30분에 완성되는 계약은 아니다.
- 실패/만료/취소도 세대를 변경해 진행 중 후보 재사용을 차단한다. 생성 중에는 refresh 시작을 잠그지 않는다. 최종 공개 직전에 dispatch 행 잠금 아래 세대·활성 작업을 재확인한다. 기존 heartbeat 만료 함수를 재사용한다.
- 실패는 5분 간격 재시도, 동일 세대 3회 실패하면 dispatcher를 정지한다. 기존 공개 pointer와 요청/감사 자료를 보존한다. 새 조회가 실패를 자동 성공으로 덮어쓰지 않는다.
- rollback은 동명의 `supabase/rollbacks/` 파일을 역순으로 적용한다. 분리 rollback은 자체 cron/트리거만 해제하고 큐/공개 데이터는 보존한다. 진행 중 조회가 없을 때 수행하며 기존 detached batch를 강제로 변경하지 않는다.
- 재검증: `node tests/character-deferred-snapshot.test.cjs`, `node tests/character-weekly-growth-identity.test.cjs`, `node tests/character-automation-cron-save.test.cjs`. 실제 builder 네 범위 검증은 BEGIN/ROLLBACK으로 공개 포인터를 보존하고 수행한다.

- 기준 main: `71a37795` (DB477/478, DB479 PVP 판정, DB480 성역 등록 및 list 재시도 보완 포함). 실제 배포 직전 main·운영 함수·트리거·ACL·SQL_INDEX를 다시 대조한다.
- DB479는 별도 선행 반영이다. 장비 조건은 유지하며 PVP 피해 증폭 또는 피해 내성 칭호를 인정한다. 아래 11개 배포/rollback은 DB479를 되돌리지 않는다.
- 정확한 제품 파일(공유 Edge 설정 포함)의 UTF-8 LF SHA-256: `CHARACTER_REFRESH_STAGE2_MANIFEST.json`.
- `supabase/migrations/`가 SQL 원본이다. Source/Deploy 복사본을 각각 실행하지 않는다.
- 로컬 패키지: `.codex-tmp/character-refresh-stage2-release/LOG24/{Source,Deploy}`. 11쌍은 원본 LF와 바이트 동일해야 한다. 운영 SQL 번호는 예약하지 않는다.
- 운영 DB478을 포함한 선행 계약을 유지한다. 아래 파일만 지정 순서로 적용하며 무관 migration을 포함한 전체 `db push`는 금지한다.

| 순서 | CLI migration basename | 역할 |
|---|---|---|
| 1 | 20260908053907_character_refresh_identity_and_list_guards.sql | 신원·후보·Queue |
| 2 | 20260908060546_character_refresh_retry_generation_guards.sql | 탐색 세대·재시도 |
| 3 | 20260908062618_character_refresh_eligibility_and_restore.sql | 조회 자격·DB-only·충돌·list |
| 4 | 20260908073247_character_refresh_list_write_preference.sql | 수동/자동 list 설정·실제 관리자 요약·생략 완료 |
| 5 | 20260908080303_character_refresh_audit_safety.sql | 만료·진행 요약·권한·스킬·랭킹 검증 |
| 6 | 20260908082028_character_detail_identity_write_fence.sql | 상세 신원·Worker 원자 저장 |
| 7 | 20260908083301_character_history_stable_identity.sql | Master·이력·성장/현재 랭킹 ID |
| 8 | 20260908085012_character_weekly_growth_stable_identity.sql | 주간 HOF ID |
| 9 | 20260908090023_character_rollup_identity_writer.sql | 일/주/월 연결 집계 |
| 10 | 20260908091051_character_rollup_write_guard.sql | 원본·집계 표식 보호 |
| 11 | 20260908095125_character_refresh_dispatch_completion_guards.sql | canonical 종료·늦은 인계·상세 인계 진단 |

4→5 순서를 유지한다. 두 파일이 공유하는 자동화 window는 5번에서 만료 판정과 list 설정을 모두 보존한다. 기존 table/이력은 삭제하지 않는다.

## 기존 서비스 책임 및 호환 배포

| 기존 서비스 | 패키지 API | 책임 / 변경 |
|---|---|---|
| character-identity-recovery | 295.5 | 직접 key 관측·같은 종족 서버 탐색·옛/새 이름 충돌 증거 수집 |
| lookup-list-prepare | 1.1 | 기존 Bridge 읽기·완전성 확인·DB Target 구성 전달 |
| character-refresh-worker | 295.11 | 기존 Queue/후처리 실행·시간 예산·종료·list 선택 |
| lookup-list-sync | 1.2.8 | 기존 syncList와 DB480 syncSanctuary 통합; metadata 쓰기·readback·완료; 최신화 OFF는 외부 쓰기0 |
| character-detail-refresh | 305.4 | 저장 Master 주소 수집·원자 저장·제한된 인계 재시도 |
| lookup-sheet-bridge / scheduled-maintenance-control | 기존 유지 | 라우터 / 예약 실행 재사용. 새 Edge를 만들지 않는다 |
| AppsScript_MASTER BRIDGE.gs | MASTER_ID_V1 | A/G/H 명시 쓰기·Master ID metadata·행 매핑·부분 성공 보존 |
| 관리자 WEB | character=2026090802 | 수동/자동 설정과 현재 결과·진단, PC/mobile 동일 STEP 구조 |

1. 운영 지시 후 신규 시작을 막고 진행 중 Queue/lease·관리자 변경을 확인한다. 활성 작업 중 SQL/Edge 혼합 배포 금지.
2. DB 위 11개 → AppsScript_MASTER 기존 프로젝트 → 위 5개 기존 Edge → 관리자 WEB의 호환 묶음. Edge가 요구하는 DB RPC가 준비되기 전 활성화하지 않는다.
3. Bridge 기존 Drive ID `1fXpvnVoALky9ceQ-1Hn97IEyRB9HJBkT`를 유지하고 Sheets API/OAuth·MASTER_ID_V1 health를 검증한다. 새 Apps Script 프로젝트 없음.
   - 기본 GCP 프로젝트에서는 Apps Script 고급 서비스 `Google Sheets API` v4(식별자 `Sheets`)를 활성화한다. HTTP 호출에 필요한 `script.external_request`와 기존 Sheets 접근 권한을 확인한다. Cloud 프로젝트 교체·IAM 확대·새 계정 생성으로 대체하지 않는다.
   - `developerMetadata:search` 읽기 전용 HTTP200은 API 연결 확인일 뿐 metadata 쓰기/행 readback 검증을 대신하지 않는다. 임시 진단 함수는 실제 배포 소스에서 제거한다. 서비스 활성화와 편집기 저장은 기존 웹앱 배포 갱신과 구분한다.
4. WEB 캐시의 배너/성역/명부 revision은 보존하고 캐릭터 revision만 반영한다.
5. Extension은 RETIRED/FROZEN이다. `tests/fixtures/extension-reference/`는 manifest 순서 재현용이며 배포 자산이 아니다. 설치·재로드·재활성화·Drive 보존본 교체 없음.

### 공유 성역 list 경계

- `syncSanctuary`는 service bearer와 apikey를 모두 검증하고 DB480 등록 이벤트/Queue 범위를 확인한다. 일반 `syncList`의 updater-session 인증과 실행별 ON/OFF 정책은 별개로 보존한다.
- 성역 등록도 character_id를 MASTER_ID_V1에 전달한다. 위치 기반 legacy fallback은 재활성화하지 않는다. 부분 검증 행은 보존하며, 최종 행 연결/등록 결과 저장 실패를 완료로 표시하지 않는다.
- DB480 prepare가 event 미완료일 때 synced Queue까지 재검증하도록 보완된 후 배포한다. 마지막 응답 유실 뒤 Queue 전부 synced인 경우도 복구해야 한다. 이 선행 보완은 성역 작업이 소유한다.
- 공유 Edge/config/통합 검수는 이 PR이 소유하며 성역 PR은 중복 파일을 제외한다. 실제 배포 전 성역 최신 main과 SQL_INDEX/운영 함수 기준을 병합하고, 양쪽 배포 순서를 조율한다.
- rollback 시 성역 syncSanctuary action을 제거하는 Stage2 이전 준비본을 사용하지 않는다. 확보한 운영 v7 또는 양쪽 호환 복구본을 기준으로 한다. DB480 성역 변경은 이 프로젝트의11개 rollback 범위 밖이다.

## 설정·종료 계약

- 기본 ON. 수동은 실행별 선택, 자동은 MASTER 전용 독립 저장 설정이다. 자동 실행 자체 ON/OFF와 다르다.
- `updater_sessions.list_sheet_sync_enabled`가 시작 시 값을 고정한다. 진행 payload가 값을 바꿔도 원래 값을 유지하고 직접 열 변경은 거절한다. 실패 대상 새 세션은 원래 세션의 설정을 상속한다.
- OFF도 list 읽기/Target 대조, 공식 조회, DB·관계·성장·랭킹을 수행한다. 초기 신원 Queue·최종 list Queue·복원 쓰기·readback·marker는 생략한다.
- OFF의 list 단계는 `skipped`, DB 정상 종결은 completed, 일부 최종 실패는 partial_success다. 전원 실패/미종결/후처리 미완료는 생략 완료로 바꾸지 않는다.
- 실제 관리자 materialized 7 Phase 요약도 같은 생략 계약을 사용한다. 전체100%는 처리 종결을 뜻하며 성공률100%와 다르다.
- 자동 종료 callback은 canonical session/batch terminal을 확인한다. 응답 유실만으로 활성 세션을 실패로 만들거나 완료를 실패로 뒤집지 않는다.
- 상세 인계 실패 진단은 queued/waiting·worker 없음·동일 updated_at일 때만 기록한다. 수신 Worker가 진행한 작업은 건드리지 않는다.

## 검증 명령과 한계

```text
node scripts/verify-character-refresh-stage2.cjs --browser
node tests/character-refresh-release-manifest.test.cjs --package
```

Node24, PGlite0.5.8, Playwright1.62.1. CI는 동일 고정 명령을 사용한다. 로컬 브라우저는 실제 페이지 구조/JS/CSS와 합성 표시 데이터를 쓰며 외부 통신·방문 집계를 차단한다.

실제 Worker 원본 변환→운영 SQL Parser→Master/신원 연결/이력/집계/리뷰 transaction을 검사한다. 공식 HTTP와 Snapshot intake 전달은 합성 입력이다. PGlite 일부 auth/의존 경계는 fixture다. 운영 전체 RLS/트리거, PLAYNC/Google 인증, Edge 배포 타입검사·Gateway·실제 동시 편집과 실제 CODEX_ADMIN 로그인은 3-가에서 확인한다. 로컬 PASS는 이 항목을 대체하지 않는다.

## 3-가 카나리 및 복구 판정

- 실데이터 대상은 시작 직전 Master ID·현재 key/서버·행을 고정한다. 과거 이름만으로 지정하지 않는다.
- 최소 정상 대조군2, 같은 서버 rename1, 이전+rename1, 동명 충돌 양쪽, DB-only1, list OFF1, 밤의 당시 누락 경로1. 이미 정정된 캐릭터를 다시 이전시키거나 _D로 만들지 않는다. 파괴적인 충돌 시험은 합성 환경에서만 한다.
- CODEX_ADMIN 정상 로그인과 서버 확인 권한으로 검수한다. 익명/가짜 역할 브라우저는 인증 증거가 아니다.
- DB/list의 exact key·클래스·서버·관계·수치·행/metadata를 readback한다. OFF에서는 쓰기/완료 marker0, 다음 ON에서는 최신 DB값으로 새 Queue가 만들어져야 한다.
- 완료 대상에 늦은 오류 전달, 중복 실행, 실패 행 재시도, 다른 세션 잠금 보존은 제한 카나리로 확인한다. 오연결·원본 오염·정상 값 삭제·중복 append·잘못된 완료가 1건이라도 발생하면 전체 실행 금지.

## 3-나 시간 예산 및 계측

아래는 조기 탐지·검증 기준이지 운영 SLA 확정이 아니다. Provider 장애/예약 대기와 설명되지 않는 idle을 분리한다.

- RPC: 본문까지45초; 공식 HTTP: 본문까지15초; identity receiver55초 checkpoint / caller65초; 캐릭터 처리105초. 시간 부족이면 새 탐색을 시작하지 않는다. 실패 기록/락 정리는 이 처리 예산 밖에서 수행한다.
- Queue tick 새 Target 시작 예산150초/최대5건, 상세 Server 호출30초·인계15초×최대3회, 자동 종료 callback최대3회. 늦은 응답은 DB 소유권/신원/세대 fence로 보호한다.
- `character_refresh_official`은 INFO/equipment/search 및 예약 대기 포함 구간, `character_refresh_stage`는 identity/precheck/submit/finalize/후처리다. Target ID와 실행 시각으로 기존 DB 성능 profile·이벤트를 대조한다. 중첩 구간을 합산하지 않는다.
- 초기 정상 표본10건 이상에서 p50/p95를 수집한다. 정상 Target 인계 idle p95>3초, 단일 설명 불가 idle>10초, 전체 예상 초과율>1.5이면 대량 실행을 확대하지 않고 구간을 재분류한다.
- 전체 예산은 표본당 평균시간×실제 적격 N + 실제 신원 탐색 수×관측 탐색시간 + 후처리/Google 표본시간 + 기록된 Provider 대기 + 20% 여유로 실행 전에 LOG에 수치화한다. N·표본 없이 고정 완료시간을 약속하지 않는다.
- 공식429는 미발견/삭제 근거가 아니며 예약 시각보다 먼저 호출하지 않는다. 같은 단계에서10분 이상 새 처리 진전 없이 대기하면 운영 검증을 중단·관리자 확인한다. 영구적 Provider 장애를 자동 성공으로 끝내지 않는다.
- 과거 약35/43분 실행은 대부분 후처리 이전이다. list3건 실패의 G 쓰기 누락은 별도 확정 원인이다. 새 계측 전에는 오래 걸린 세부 원인이나 개선 시간을 확정하지 않는다.

## 롤백·원본 정정·재적용

- 신규 시작·Worker를 먼저 멈추고, 새 Edge/Web를 이전 버전과 함께 복구한다. SQL은 같은 basename의 rollback을 **11→1 역순**으로 적용한다. DB477/478의 다른 프로젝트 함수·관계 override는 건드리지 않는다.
- 신원·상태·원본 key/수치·정책 열·감사 이력·성공 Queue·Master ID 연결·집계 표식은 자동 역변경하지 않는다. positional writer를 다시 켜거나 _D/제외를 일괄 해제하지 않는다.
- 이미 집계한 원본의 신원/수치/일자는 직접 UPDATE하지 않는다. 기존 성장 리뷰 메모/상태와 보관 cleanup은 허용한다. 원본 정정은 별도 정확한 이력 ID·영향 DAY/WEEK/MONTH와 보관 원본 복구 범위를 승인받은 다음 동일 transaction의 재집계 절차를 준비해야 한다. 해당 요구가 있는 운영 writer가 발견되면 배포 차단이다.
- 조사된 기존 정상 저장은 INSERT+멱등 skip, 이력 연결은 미연결 근거의 최초 연결, 리뷰는 비원본 필드 갱신이다. 로컬 실제 Master/리뷰/cleanup 회귀가 이를 검사한다. 조사 범위 밖 직접 SQL writer는 배포 전 재확인한다.
- rollback 중 생긴 기록은 기존 name-key 집계로 남을 수 있다. 재적용 시 전체 표식을 false로 되돌리지 않는다. dry-run으로 미연결/미집계 범위만 목록화하고, 검증된 ID 연결과 `growth_identity_rolled_up=false`의 제한 범위를 처리한다. 기존 true 기록은 재집계하지 않는다.
- cleanup으로 제거한 오래된 DAY/WEEK는 자동 부활시키지 않고 보존 MONTH/원본과 정책을 따른다. legacy+ID 집계를 더해 중복 합산하지 않는다. 근거 없는 과거 이름 기반 귀속·대량 backfill 금지.
- 실제 복구 후 Source/Deploy·운영 함수·소스·LOG를 같은 ID로 readback한다.

## 관련 규칙 반영안 — 실제 배포 회차에 소유 문서만 수정

SERVER_DATABASE의 옛 이름 힌트 제한을 관측 기반 직접 key 조회 계약으로 한정 수정한다. key를 search keyword로 보내지 않는다. 조회 자격/신원/Queue/저장은 DB, 외부 수집·실행은 기존 Edge, 시트 입출력은 Apps Script, WEB은 설정·표시 역할이다. 운영 소스는 미배포 준비본으로 덮지 않는다. Extension의 중단 규칙은 유지한다.
