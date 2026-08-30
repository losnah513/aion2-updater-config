# KINOJO WEB HANDOFF

기준일: 2026-08-30 KST

## 저장소 / 현재 기준

- GitHub: `losnah513/aion2-updater-config`
- 운영 브랜치: `main`
- 배너 이미지 관리 2차 완료·운영 후속 안정화 기준: PR `#290` + `#295` + `#298` + `#303` + `#317` + `#319`, 진행도 `49/49`, 관리자 cache `2026082804`, Edge `kinojo-banner-media` v27(API 2.6 / DB 412 / Upload 403 / Event 407), HOF 이벤트 저장 patch `DB440 + DB441`, 참고 이미지 요청 확인 계약 `DB444 + kinojo-member-profile v29 + WEB PR #323`
- 내 정보 E-1 제품 운영 commit: `640b7eebcef1c13b0516fe2cd020df870bc23752` (PR `#194`)
- 내 정보 후속 A-1~E-2: 12/12 완료
- My Info / 관리자 이미지 모달 추가 UI 후속: PR `#197` 구현·배포·동기화 기준 CLOSED · 수동 실브라우저 sanity check는 post-close 보류
- 레기온 순위 통합 패널: PR `#164` 병합 완료
- 캐릭터 상세 모달 지연 생성 스크롤 복구: PR `#340`, main `751239c0a3646cea74dfdf71ce80bea97323a245`, Pages·custom-domain readback 완료
- Google Drive의 `00_README_FIRST.md`, `KINOJO_MASTER_RULES.md`, `KINOJO_WORKFLOW_RULES.md`, `KINOJO_COMPONENT_RULES.md`, 작업 대상별 세부 규칙과 최신 프로젝트 LOG를 작업 규칙 원본으로 사용한다. 성역 작업은 최신 `KINOJO_SANCTUARY_RULES.md`와 Stage 7 종료 문서를 추가로 읽는다.
- GitHub `main`은 WEB 코드 원본이고, 실제 Supabase·GitHub Pages 상태는 운영 원본이다.
- 성역·스케줄 관리 개편은 Stage 7-8까지 **59/59 CLOSED**다. 제품 전환·종료는 PR `#328` + `#329` + `#330` + `#337` + `#338` + `#339` + `#342`, UI 기준 main `3e8d253e818349357f171ca4b025ca9d10062ae6`, Edge `sanctuary-management` v16(API 1.8 / DB446), copy renderer v20(DB447), transition run 1 `COMPLETE`다. 최종 운영·복구 기준은 `docs/SANCTUARY_MANAGEMENT_STAGE7_CLOSEOUT_20260830.md`를 따른다.

## 성역 비로그인 공개 읽기 후속 · 2026-08-30

- PC `/sanctuary/`와 모바일 `/m/sanctuary/`는 로그인하지 않아도 성역 1~4, `ACTIVE/FULL` 팀, 포스·파티·슬롯, 월간 일정을 표시한다. `DRAFT/ARCHIVED` 팀은 공개 응답에 포함하지 않는다.
- 비로그인 bootstrap은 생성자·내 캐릭터 후보, 지원 batch, viewer 배정·대기 상태, 편집·해산·일정 관리 권한을 반환하지 않는다. 팀 생성·지원·편집·해산·캐릭터 검색/등록과 다른 쓰기 경로는 기존 opaque KWS session과 Server 권한 검사를 그대로 요구한다.
- migration `20260830051921_sanctuary_management_public_read_v448.sql`은 service-role-only 공개 읽기 RPC와 활성 팀 partial index를 추가했다. Browser 역할에는 RPC EXECUTE를 부여하지 않았고 Edge만 service role로 호출한다.
- `sanctuary-management` Edge v17은 세션이 없을 때 `bootstrap`과 `month`만 공개 읽기 RPC로 보낸다. 현재 API 1.8 / DB446 계약은 유지하며 비로그인 `command`는 HTTP 401이다.
- WEB PR `#346`은 공개/로그인 projection 전환 때 bootstrap을 다시 읽고 비로그인 상태에서도 백그라운드 변경 감지와 수동 새로고침을 유지한다. 팀 추가·지원·편집 버튼은 공개 보기에서 비활성이다.
- 운영 readback은 공개 bootstrap HTTP 200, 성역 4개, 운영 팀 2개, `writeEnabled=false`, 공개 month HTTP 200, 비로그인 command HTTP 401이었다. 공개 팀·포스 응답에서 계정 member ID와 viewer 지원·관리 상태가 제거됐음을 DB 집계로 확인했다.

## 성역·스케줄 관리 개편 Stage 7-8 종료 · 2026-08-30

- 정식 운영은 PC `/sanctuary/`, 모바일 `/m/sanctuary/`, Server DB 단일 원본이다. 구 관리·일정 주소는 쿼리·해시를 보존하는 호환 redirect이고 성역 전용 Sheet 예약·수동 동기화와 두 bridge는 운영 경로가 아니다.
- `KINOJO_SANCTUARY_RULES.md`를 DB446 이후 계약으로 교체했다. 팀=일정, 1포스=2파티=10슬롯, 최대 9포스, 팀 간 일정 충돌, 즉시·승인 참가, 임시 편성안+`SAVE_COMPOSITION`, lease·revision·ADMIN 보안 경계를 공식 규칙으로 고정했다.
- run ID 1의 exact backup 421행과 service-only `kinojo_sanctuary_management_stage7_restore_v446` 경계를 종료 문서에 기록했다. 복구는 백업 행만 되돌리며 전환 뒤 신규 운영 데이터를 자동 정리하지 않으므로 장애·승인·신규 데이터 보존 확인 없이 실행하지 않는다.
- 프로젝트 공식 계획서와 LOG는 Drive 원본까지 동기화하며, 현재 작업·다음 작업 없음, 완료 59/59, 남은 작업 0/59로 종료한다. 이후 큰 정책·화면 변경은 별도 후속 계획으로 시작한다.

## 캐릭터 상세 모달 지연 생성 스크롤 복구 · 2026-08-30

- 원인: 공용 애니메이션 CSS는 바깥 `.kinojo-character-reaction-dialog`를 `overflow:hidden`으로 잠그고 안쪽 `.kinojo-character-reaction-scroll`이 스크롤을 맡도록 정의한다. 그러나 카드 클릭 뒤 모달이 지연 생성될 때 `ui/kinojo-character-skill-bridge.js`의 시작 시점 검사에는 모달이 없었고, 이후 MutationObserver도 내부 viewport를 만들지 않아 긴 상세 정보가 모달 높이 밖에서 잘렸다.
- 수정: 기존 스크롤 소유자인 `ui/kinojo-character-skill-bridge.js`의 observer가 활성 모달을 발견할 때마다 `ensureScrollViewport`를 호출한다. 중복 구현 없이 래퍼 수를 정확히 1개로 유지하며, PC·모바일 ranking/HOF의 bridge cache는 `2026083001`이다.
- 검증: 로컬과 실서비스에서 모바일 `390x844`, 소형 모바일 `320x568`, 정확한 경계 `760x900`, PC `1280x900`을 확인했다. 모든 크기에서 dialog/document 가로 overflow 0, 내부 overflow `auto`, 래퍼 1개이며 실제 휠 스크롤이 이동했다. PR `#340` source check, main Pages 배포, custom-domain live readback이 통과했다.
- 회귀: `node --check`와 `tests/character-skill-current-state-contract.test.js`는 PASS다. 전체 Node 계약은 85개 중 83개 PASS이며 `sanctuary-permission-matrix-contract.test.js`, `sanctuary-sync-schedule-contract.test.js` 2개는 이번 파일 범위 밖에서 최신 main에도 존재하는 Sanctuary 계약 불일치로 분리했다.
- 병합·롤백: PR `#340`은 main `751239c0a3646cea74dfdf71ce80bea97323a245`로 squash 병합됐다. 롤백은 해당 커밋의 bridge observer 2줄과 4개 페이지 cache·회귀 계약·README 변경만 되돌리며 DB·Edge·운영 데이터는 변경하지 않는다.

## 성역 관리 Stage 7-7 후속 · 단일 확대 포스와 전체 포스 모달 · 2026-08-30

- 운영 팀은 PC·모바일 모두 한 번에 1포스만 표시한다. PC는 중앙 최대 700px 카드에 1·2파티를 병렬 배치하고 슬롯 48px·클래스 아이콘 34px·주요 글자 11px로 확대한다. 모바일은 화살표 여백을 없애고 390px viewport에서 카드 281px·슬롯 44px·아이콘 32px를 확보한다.
- PC 이전·다음은 첫/마지막 경계에서 비활성화되고 순환하지 않는다. 약 0.46초 동안 이동·기울기·축소·명암이 결합된 폴라로이드 전환을 사용하며 reduced-motion은 애니메이션을 제거한다. 모바일은 화살표를 숨기고 48px 이상 좌우 터치 스와이프, 키보드는 좌우 방향키를 지원한다.
- 팀별 `전체 포스 보기`는 PC 최대 1420px·2열, 980px 이하 1열, 760px 이하 전체 화면 모달이다. 운영 화면과 동일한 `createForceCard`를 재사용하므로 클래스 아이콘·본캐/부캐·내 캐릭터·포스 복사 표시가 중복 구현되지 않는다.
- 참여 포스 선택은 기존 다중 포스 지원·즉시/승인 처리 화면으로 연결하고 닫으면 최신 bootstrap으로 같은 전체 포스 모달에 복귀한다. 권한자의 `포스·캐릭터 편집`은 기존 local composition·lease·revision·`SAVE_COMPOSITION` 화면으로 연결하며 전체 보기에서 별도 즉시 저장 명령을 추가하지 않는다.
- 변경 파일은 `sanctuary-management/js/sanctuary-management.js`, `sanctuary-management/js/sanctuary-management-support.js`, `sanctuary-management/css/sanctuary-management-support.css`, PC·모바일 `sanctuary/index.html`, fixture와 roster carousel 계약이다. DB·migration·Edge·운영 팀 데이터는 변경하지 않는다.
- 로컬 fixture PC 1440×1100과 모바일 390×844에서 단일 포스, 1/5 전환, 전체 포스 5개, 지원 → 전체 모달 복귀, 편집 화면 연결, body/dialog 가로 overflow 0, 콘솔 warning/error 0을 확인했다. KINOJO Pages workflow Node 계약 49/49와 `node --check`, `git diff --check`가 통과한다.

## 성역 관리 Stage 7-1~7-6 · Server DB 정식 전환 · 2026-08-29

- 승인 ID 1과 안정 scope hash `d55690120f1e24e21c5b24981c6b55c9f5820ddcfdd97a226e418272d84b1e1e`를 fresh readback한 뒤 `BACKUP → LOCK → EXECUTE → STOP_SYNC → OPEN → COMPLETE`를 순서대로 실행했다. 전환 run ID는 1이고 exact backup은 421행이다. passkey, KWS session, credential 원문은 저장하지 않았다.
- 승인 범위만 처리했다. 신규 시험 팀 3개 ARCHIVED, 신규 규칙 3개 STOPPED, 기존 일정·연결 23+23개 canceled, public 점유 슬롯 101개와 private 점유 슬롯 6개 초기화, 만료 lease 1개 정리다. `sanctuary_master` 4행과 합의한 명령·감사·복구 이력은 보존했다.
- 성역 Sheet cron은 inactive이고 역사 sync job 171행은 status를 덮지 않은 채 `stage7Stopped` 메타데이터만 추가했다. 관리자 Sheet sync pane·preview·manual/automation listener와 browser route alias를 제거했다. 공용 lookup Sheet 기능은 유지하고 성역 전용 sheet/roster bridge는 HTTP 410 tombstone이다.
- 현재 Edge health는 API1.8/DB446, read/write true, rollout OPEN, sheet sync false, transition COMPLETE다. transition report/approve action은 공개 목록에서 제거됐고 COMPLETE bootstrap 뒤 WEB의 전환 검수 버튼도 숨겨진다.
- 성역 4 기준 DB 이름은 `비탄의 설원`, 시작일은 `2026-09-09`다. 신규 관리에는 표시하되 구 성역 화면 enabled는 false로 유지한다.
- PC 1920×1080과 모바일 390×844 모두 document 가로 overflow 0이다. PC 팀 구성 모달 오른쪽에 일정 패널, 모바일에서는 일정 패널이 팀 구성 위에 놓인다. 일정 deep link, API/DB badge, 성역 1~4, COMPLETE 안내, 콘솔 error 0을 production에서 확인했다.
- 이후 사용자 승인과 7-7 검수를 거쳐 신규 관리 화면을 PC·모바일 `/sanctuary/` 정식 페이지로 승격했다. 구 `/sanctuary-management/`는 쿼리·해시를 보존해 정식 주소로, `/sanctuary-schedule/`은 `view=schedule`을 추가해 정식 주소로 이동하며 탑바·drawer는 성역 1~4만 표시한다.
- 전체 Node 계약 80/80 PASS. Stage 7 migration은 `20260829061610`, settings hotfix `20260829063301`, sanctuary 4 name `20260829071000`, FK performance guard `20260829072000`이다. Advisor의 Stage 7 security 항목은 private service-only table의 RLS-no-policy INFO 2건, performance는 적용 직후 unused index INFO뿐이다.
- 복구는 run ID 1의 service-only `kinojo_sanctuary_management_stage7_restore_v446`으로 exact backup 범위만 되돌린다. COMPLETE 뒤 임의 복구를 실행하지 말고, 실제 장애와 승인된 대상 범위를 다시 확인한 뒤 사용한다.
- 이 항목의 기술 전환 뒤 7-7 사용자 검수와 7-8 문서 종료까지 완료되어 최종 진행도는 **59/59 CLOSED**다.

## 참고 이미지 제작 요청 1회 확인 통합 · 2026-08-29

- 원인: 같은 제출이 `캐릭터 이미지 업로드`와 `참고 이미지 제작 요청` 두 관리자 경로로 해석됐고, 제작 요청 알림의 최신 건 조회가 완료·반려 상태를 거르지 않았다. 브라우저의 확인 여부도 세션 저장소에만 있어 새 탭이나 새 로그인에서 이미 처리한 요청이 다시 나타날 수 있었다.
- DB444: migration `20260828223317_member_image_request_acknowledgement_v444.sql`은 제출 요청에 `acknowledged_at`과 확인 관리자 ID를 추가한다. 구 `IN_PROGRESS / COMPLETED / REJECTED` 값을 내부 `SUBMITTED`로 통합하되 기존 완료·반려 건은 먼저 확인 완료로 소급 처리한다. 후속 `20260828231310_member_image_request_ack_actor_index_v444.sql`은 확인 관리자 FK 보조 index를 추가한다. 관리자에게 노출되는 상태는 `확인 필요 / 확인 완료`뿐이다.
- 알림: `kinojo_web_notification_summary_v316`은 확인 전 요청만 집계하고 최신 요청도 같은 조건으로 선택한다. 일반 캐릭터 이미지 업로드 건수와 최신 업로드 필드는 0/null로 고정해 별도 알림 경로를 제거한다. 따라서 DB에 확인 시각이 기록된 요청은 브라우저 세션이 바뀌어도 다시 알리지 않는다.
- Edge/WEB: `kinojo-member-profile`은 기존 batch-bootstrap 클라이언트 호환을 위해 API 2.7을 유지하면서 `admin-image-request-ack` 한 동작만 제공하고 구 `admin-image-review-*`, `admin-image-request-status` 동작을 노출하지 않는다. 관리자 목록은 참고 이미지 제작 요청만 표시하며 필터는 `확인 필요 / 확인 완료 / 전체`다. 접수·제작 중·완료·반려 버튼과 처리 이력 UI는 제거했다.
- 보안: 새 읽기·확인 RPC는 MASTER opaque session을 다시 검증하고, 고정 `search_path`와 `service_role` 전용 실행 권한을 사용한다. 목록·상세에는 private object path나 signed URL을 포함하지 않고, 이미지 열람은 기존 60초 미리보기·명시적 다운로드 경계를 유지한다.
- 운영 배포: Supabase remote migration `20260828231225`와 FK index 후속 `20260828231422`를 적용했고, `kinojo-member-profile` v29(API 2.7 / Request 444 / Work Queue 444)을 `verify_jwt=false` 기존 custom KWS 경계로 배포했다. 배포 source는 이 브랜치와 줄바꿈 정규화 기준 exact 일치한다. WEB은 PR `#323` main 병합과 Pages/custom-domain readback을 최종 closeout 조건으로 한다.

## 관리자 대시보드 첫 진입 모듈 분리 · 2026-08-29

- 원인: 관리자 loader가 첫 화면이 대시보드여도 회원·캐릭터·공지·시스템·이미지 관리 등 17개 모듈 677,096 bytes를 모두 순차 다운로드했다. 특히 배너 이벤트 workflow 하나만 약 180 KiB라서 DB 응답 전부터 정적 파일 대기가 누적됐다.
- WEB: 관리자 cache `2026082901`은 첫 진입에 `admin-shared.js`와 `admin-bootstrap.js` 두 파일 42,350 bytes만 불러온다. 회원·캐릭터·공지·시스템/로그·이미지 그룹은 해당 탭 첫 진입 직전에 원래 의존 순서로 한 번만 로드하고, 같은 요청은 in-flight Promise를 재사용한다.
- 체감 효과: 첫 화면의 동적 관리자 JavaScript 전송량이 634,746 bytes, 93.7% 감소한다. 대시보드와 무관한 15개 모듈의 직렬 네트워크 왕복이 첫 카드 표시를 막지 않는다. 다른 탭의 최초 진입에만 그 탭 모듈 로드가 이동한다.
- 경계: 이번 단계는 권장 수정 순서 1번만 반영했다. 알림 요약 중복 호출, 카드별 점진 갱신, 요청 시간 제한·최근 정상값 대체, DB 통합 RPC는 변경하지 않았다. DB·Edge·운영 데이터·기간/보존 기준도 변경하지 않았다.
- 검증: JavaScript 구문, 전용 lazy-loader 계약, 기존 배너 의존 순서, PC/mobile 공통 cache, 전체 Node 계약 77/77을 통과했다. 로컬 브라우저 readback에서도 첫 진입 동적 관리자 모듈은 shared와 bootstrap 두 개뿐이었다.
- 롤백: `admin.js`, `admin-bootstrap.js`, `admin-shared.js`와 PC/mobile cache를 이전 `2026082811` 기준으로 되돌리면 된다. DB·Edge 롤백은 없다.

## 명예의 전당 오른쪽 사이드 배너 이벤트 저장 수정 · 2026-08-28

- 원인: DB438은 명예의 전당의 공식 SIDE 슬롯을 `LEFT + RIGHT`로 확장했지만, 실제 저장 경로 `event-save v407 → v404 → v402 → v396 → v394 → v391`의 최하위 v391에 `HOF 오른쪽 거부`와 `HOF 동시 노출은 왼쪽만`이라는 구 규칙이 남아 있었다. 따라서 관리자에서 전체 7개 페이지·좌우 별도 이벤트를 저장하면 HOF RIGHT variant에서 HTTP 400 `BANNER_EVENT_INDEPENDENT_TARGET_INVALID`가 반환됐다. 캐시·이미지 업로드·합성 문제는 아니었다.
- Server: migration `20260828115503_banner_hof_right_event_save_v440.sql`이 v391의 SIDE 대상 검증을 `private.kinojo_banner_supported_page_slots_v404` 기준으로 통일했다. 좌우 동시는 페이지의 전체 지원 슬롯과 정확히 일치해야 하고, 좌우 별도는 요청 role이 지원 슬롯에 포함돼야 한다. HOME·HOF·나머지 SIDE 페이지가 모두 같은 Server 권위 목록을 사용한다.
- 후속 원인·완결: DB440 반영 뒤 실제 재시도에서 같은 HOF RIGHT 오류가 구체적 문구로 다시 드러났다. v391이 마지막에 호출하는 공용 `private.kinojo_banner_campaign_target_valid_v386`에도 별도의 `HOF=LEFT only` 분기가 남아 있었기 때문이다. migration `20260828120843_banner_hof_right_campaign_target_v441.sql`이 HOF를 모든 PC SIDE 페이지와 같은 unique LEFT/RIGHT subset 계약으로 통일했다. 운영 exact readback은 HOF LEFT=true, RIGHT=true, LEFT+RIGHT=true, LEFT+LEFT=false, MAIN HOME=true다.
- Edge: `kinojo-banner-media` v27은 API 2.6 / DB 412 / Event 407 / Upload 403과 custom KWS MASTER 인증 경계를 유지한다. 대상 불일치 시 일반 문구 대신 좌우 동시/개별 설정이 서버 지원 범위와 맞지 않는다는 구체적 안내를 반환한다.
- 보안: 교체한 `SECURITY DEFINER` 함수는 고정 `search_path`를 유지하고 `PUBLIC/anon/authenticated` EXECUTE를 회수했으며 `service_role`만 실행 가능하다. DB readback은 service_role=true, anon=false, authenticated=false다.
- 검증: 운영 DB 트랜잭션 롤백 구문 검사, 지원 슬롯 `HOF=[LEFT,RIGHT]`, DB440·DB441의 두 구 거부 조건 제거와 새 계약 사용 exact readback, 전체 Node 계약 76/76, PR #317·#319 source check, main Pages·Banner Admin·KINOJO Pages 운영 readback, Edge health 200을 통과했다. Advisor의 배너 관련 항목은 기존 RLS-no-policy 및 index INFO뿐이며 두 함수 교체로 신규 객체나 경고를 만들지 않았다.
- 운영 데이터: 실패한 `쿠르` event group은 생성되지 않았고 업로드 asset 59~61은 READY 상태로 보존됐다. 작성 화면의 이미지·노출 페이지·좌우·문구 설정을 자동으로 다시 게시하거나 수정하지 않았다.
- 롤백: Edge는 v26 원본으로 되돌릴 수 있다. DB는 v391의 검증 두 블록을 DB440 직전 본문으로 교체하되 event group·campaign·asset·Storage 데이터는 삭제하지 않는다.

## 회원 관리 이미지·제작 요청 통합 처리 큐 · 2026-08-28

- 원인: 회원 관리 상단 배지는 `새 이미지 확인 + 진행 중 제작 요청`을 합산했지만 `이미지·제작 요청` 기본 목록은 구 `admin-image-review-list`로 새 이미지 업로더만 조회했다. 따라서 실제 운영값이 이미지 확인 0건·제작 요청 1건이면 배지는 1인데 목록은 비어 보였다. 캐시 문제가 아니라 알림과 목록의 Server 데이터셋 불일치였다.
- Server: migration `20260828070646_member_image_admin_work_queue_v406.sql`의 `kinojo_admin_member_image_work_queue_v406`가 `ACTION_REQUIRED / IMAGE_REVIEW / PRODUCTION_REQUEST / COMPLETED / ALL`을 한 번에 조회한다. 기존 알림과 동일하게 제작 요청 제출로 생긴 업로드는 별도 이미지 확인 건으로 중복 계산하지 않는다.
- 보안: v406 RPC는 MASTER opaque session을 다시 검증하는 `SECURITY DEFINER`·고정 `search_path` 함수이며 `PUBLIC/anon/authenticated` 실행 권한은 없다. `service_role`만 실행하고 응답에는 private object path나 signed URL을 포함하지 않는다.
- Edge: 별도 함수를 만들지 않고 기존 `kinojo-member-profile`을 `REUSE_WITH_DB_MODULE`로 재사용했다. 운영은 v26 ACTIVE, API 2.7 / DB 375 / 이미지 제작 요청 405 / 통합 처리 큐 406이며 custom KWS session 경계를 유지한다.
- WEB: 기본 필터를 `처리 필요`로 바꾸고 이미지 확인·제작 요청·처리 완료·전체 필터, 종류별 카드, `처리 필요 / 이미지 확인 / 진행 중 제작 요청 / 현재 이미지 업로더` 요약을 추가했다. 제작 요청 카드의 `요청 바로 보기`는 대상 회원·캐릭터·request ID를 보존해 요청 상세를 자동 선택한다. 상태 변경 뒤 처리 큐와 배지를 즉시 다시 읽는다.
- 운영 결과: PR `#303`은 main squash commit `58f46a23ecdaba4d3c942f12b0ca080c191dd705`로 병합됐다. 관리자 loader/CSS cache는 `2026082804`다. 운영 관리자에서 기본 `처리 필요 1`, `이미지 확인 0`, `진행 중 제작 요청 1`, 업로더 7과 `남 · 요청 #14` 카드, 본캐 `남`·요청 #14 상세 자동 선택을 확인했다.
- 검증: 전체 Node 계약 69개, JS/Edge 구문, diff 검사, PR 4개 source check, Pages 배포, Character Refresh 운영 exact-byte readback을 통과했다. DB ACL은 service_role=true·anon/authenticated=false, Edge health header/action 406, 무효 세션 401을 확인했고 advisor에 v406 관련 신규 보안·성능 항목은 0건이다.
- 롤백: WEB은 PR #303의 통합 목록·상세 바로가기·cache `2026082804`만 되돌린다. Edge는 v25로 되돌릴 수 있으며 v406 RPC는 additive·service-role-only라 남겨도 기존 경로에 영향이 없다. 실제 요청 #14와 첨부 이미지·상태 이력은 수정하거나 삭제하지 않았다.

## 배너 관리자 입력·알림·작성 페이지 UX 안정화 · 2026-08-28

- 이미지 관리의 메인 배너와 사이드 배너는 각각 `새 이벤트 → 이벤트 관리 → 이미지 라이브러리` 순서의 독립 하위 페이지를 사용한다. 상위 탭 진입 기본값은 `새 이벤트`이며 `#images/{main|side}/{create|events|library}` hash를 새로고침 뒤에도 유지한다. 이벤트 관리 카드의 중복 `새 이벤트` 버튼은 제거했다.
- 이미지 라이브러리와 이벤트 작성기의 캐릭터 검색은 한글 IME 조합 중 전체 카드를 다시 그리지 않는다. 조합 종료 뒤에만 조회하고 결과 영역만 교체하므로 `복숭아` 입력이 `복숭ㅇㅏ`로 갈라지거나 입력 노드가 교체되지 않는다. 제목·태그·이모지·랜덤 이벤트 검색도 같은 조합 보호 경계를 사용한다.
- 저장·연결·게시 상태는 기존 접근성 live region을 유지하면서 화면 중앙의 반투명 toast로 함께 표시하고, 성공/안내는 충분한 읽기 시간 뒤 fade out, 오류는 더 길게 유지한다. 캐릭터 연결 결과에는 hover·focus·active 피드백을 추가했다.
- 제품 PR `#298`은 main squash commit `193c1ca7513a797ea8f2c6b9669d11ce3194ae82`로 병합됐다. 로컬 JavaScript syntax 11종·Node 계약 24종, Chrome 1440×1200·768×1024·390×844 E2E, PR 4개 source check, main Pages 배포·Banner Admin exact-byte·Banner Runtime PC SIDE/mobile MAIN readback을 모두 통과했다.
- Server는 변경하지 않았다. 운영 기준은 계속 `kinojo-banner-media` v26 / API 2.6 / DB 412 / Upload 403 / Event 407이며 관리자 loader cache만 `2026082803`으로 올렸다.
- Google Drive WEB 미러는 관리자·모바일 관리자·테스트 기존 ID 26개와 신규 `admin-banner-events.js`, `banner-phase2-admin-ux-followup-contract.test.js` 2개를 raw byte exact로 동기화했다. 기존 `.github` 미러 폴더는 목록 조회 후 하위 폴더 쓰기가 404로 두 번 거절되어 workflow 2개는 GitHub main을 권위 원본으로 유지한다.
- 롤백은 PR `#298`의 관리자 WEB/CSS/JS·계약 테스트·cache `2026082803` 변경만 되돌린다. DB migration, Edge 배포, Storage 자산과 운영 이벤트 데이터는 건드리지 않는다.

## Server 응답 계약 권위 규칙 · 2026-08-28

- Edge가 DB RPC JSON을 공통 응답 봉투로 감쌀 때 DB payload를 먼저 펼치고 `service`, `apiVersion`, `databaseContract`, `schemaVersion` 같은 Edge 소유 계약 필드를 마지막에 기록한다.
- 구버전 DB wrapper가 예전 `apiVersion`을 보존할 수 있으므로 `{Edge 계약, ...DB payload}` 순서는 금지한다. 이 순서가 2026-08-28 성역관리 운영 화면의 API 1.1/DB432 계약 불일치를 일으켰다.
- `supabase/functions/sanctuary-management/index.ts`의 `EDGE_CONTRACT_AUTHORITY` 주석과 `tests/sanctuary-management-edge-contract.test.js`를 이후 Edge 응답 정규화 작업의 기준으로 사용한다.
- 계약 버전 변경 뒤에는 공개 health만 확인하지 않고, 권한 세션의 실제 bootstrap 화면에서 API/DB 표시와 오류 상태 해제를 함께 확인한다.

## 전용 ADMIN 계정 규칙 · 2026-08-28

- 원본 DB 등급 `ADMIN`은 자동화·실화면 검수 전용 비공개 등급이다. 서버 권한 판정은 `MASTER`와 동등하게 정규화하되, 회원 목록의 ADMIN 행은 원본 등급이 `MASTER`인 이용자에게만 반환한다.
- ADMIN은 일반 관리자 UI에서 생성·승급할 수 없고 코드에 하드코딩하지 않는다. 전용 패스키 원문은 소스·migration·테스트·작업 로그·Drive 문서·채팅 출력에 절대 남기지 않는다.
- 구현 기준은 migration의 `CODEX_ADMIN_ROLE` 주석, `kinojo_admin_member_list_v433`, `core/kinojo-auth-ui.js`의 동일 주석이다. 권한 로직을 수정할 때 표시용 `roleLabel=Admin`과 판정용 `role=MASTER`를 혼동하지 않는다.
- 전용 계정으로 실화면을 열 때는 사용자 브라우저 세션과 분리된 전용 브라우저 저장소를 사용한다. 인증 입력 직전 확인을 받고, 검수가 끝나면 패스키 원문을 임시 메모리에서 제거한다.

## ADMIN 회원목록 브라우저 RPC 규칙 · 2026-08-28

- 관리자 WEB의 회원목록은 브라우저가 `kinojo_admin_member_list_v433`에 원문 PASS KEY가 아닌 Server 발급 `kws_` 세션을 전달하고, v433이 위임한 v428이 세션·actor·등급을 다시 검증하는 기존 경계를 사용한다.
- 이 RPC는 PostgREST 브라우저 호출을 위해 `anon`, `authenticated`, `service_role`에만 EXECUTE를 허용하고 `PUBLIC`은 계속 revoke한다. v433을 service_role-only로 잠그면 인증된 관리자도 `permission denied`가 되어 회원목록 전체가 중단된다.
- DB 권한은 진입 허용일 뿐 행 권한 판정이 아니다. 잘못된 세션은 v428 내부에서 거부되고, ADMIN 행은 v433의 raw MASTER 검사 뒤에만 반환된다. 브라우저 ACL을 바꿀 때는 무효 세션 거부와 raw MASTER/ADMIN 가시성을 함께 검증한다.
- Supabase Advisor의 `anon_security_definer_function_executable`, `authenticated_security_definer_function_executable` 경고 2건은 이 의도적 PostgREST 진입점 때문에 예상된다. v428과 같은 opaque 세션 검증을 제거하거나 우회하지 말고, 경고를 없애기 위해 다시 service_role-only로 잠그지 않는다. 향후 전체 관리자 RPC를 Edge proxy로 전환할 때만 함께 제거한다.
- 구현 기준은 `20260828072731_sanctuary_admin_browser_rpc_v434.sql`의 `ADMIN_BROWSER_RPC_SESSION_GATE` 주석과 `tests/admin-member-v433-browser-rpc-contract.test.js`다.

## 성역관리 Stage 3 편집·레이아웃 규칙 · 2026-08-28

- 고정 팀 일정은 팀 단위이며 팀 아래 모든 포스가 같은 시작일·시각·진행 시간을 공유한다. 기본·최소 30분, 30분 단위이고 반복 일정은 종료일이 없으며 수요일~화요일 주간 맥락을 표시한다.
- DRAFT 공개는 생성자 소유 캐릭터가 최소 1개일 때 허용하고 나머지 슬롯은 비어 있어도 된다. 공개 뒤 편집은 Server `canEdit`, 2분 lease, optimistic revision을 모두 통과해야 하며 카드 이동·교환은 원자적 `MOVE_SLOT`만 사용한다.
- 레이아웃·내부 배치를 바꾸면 PC와 모바일에서 document/modal 가로 overflow 0을 확인한다. 세로 내용이 넘칠 때만 숨김 scrollbar와 하단 fade를 쓰고, 가로 넘침을 스크롤로 우회하지 않는다.

## 성역관리 Stage 4-1 참여 팀·1~9포스 · 2026-08-28

- 운영 계약은 Edge `sanctuary-management` v11, API `1.3`, DB `435`다. Migration `20260828074303_sanctuary_management_participation_forces_v435.sql`의 `PARTICIPATION_FORCE_BOUNDARY`가 첫 포스 원자 생성과 추가 포스 토폴로지 검증을 고정한다.
- 참여 팀 방식 선택 뒤에는 팀이 아직 생성되지 않은 상태로 일정·제목·즉시/승인 참가를 입력한다. 최초 `[+ 포스 추가]`가 `CREATE_TEAM`을 호출해 DRAFT·일정·1포스·2파티·10슬롯을 같은 트랜잭션으로 만들며, 이후 추가는 lease·revision·idempotency를 거쳐 9포스까지만 허용한다.
- 참여 팀의 DRAFT 수정은 `UPDATE_PARTICIPATION_TEAM_DRAFT`로 분리했다. 이 명령은 생성자 또는 관리 권한, DRAFT/PARTICIPATION 상태, 편집 lease, expected revision, 일정·진행 시간·참가 정책을 모두 다시 검증한다.
- 10번째 포스는 WEB의 `9/9` 한도 안내와 DB412 `FOR UPDATE` 직렬화·`force_no > 9` 오류, DB435 결과 토폴로지 검증의 세 경계로 차단한다. DB435 공개 RPC는 Edge 전용이므로 `service_role`만 EXECUTE하고 `PUBLIC/anon/authenticated`는 false다.
- 운영 ADMIN 실검수에서 승인 참가 DRAFT를 1→9포스로 생성했고 DB 결과는 9포스·18파티·90슬롯, force 번호 1~9였다. 10번째 클릭은 `한 팀에는 최대 9포스` 안내로 차단했다. 검수 팀 ID 6은 확인 직후 `ARCHIVED`로 해산해 운영 목록에서 제거했다.
- PC 1280px에서는 정사각형 composer 오른쪽에 일정 패널이 위치했고 document/frame 가로 overflow는 0이었다. 모바일 390×844에서는 일정 패널 top 12px, composer top 812.27px로 일정이 위에 배치됐고 document/dialog 가로 overflow는 0이었다. 두 화면 모두 세로 scrollbar는 숨기고 하단 fade 규칙을 유지한다.
- PR `#306`, main squash `20b570b85c829522f2093c420195218f2f67f205`, Pages run `33153151606`이 운영 기준이다. 다음 작업은 `4-2 포스별 생성자 캐릭터 선배치`이며, 각 포스에 서로 다른 생성자 캐릭터 한 명이 있어야 참여 팀을 공개할 수 있게 한다.

## 성역관리 Stage 4 완료 · 참여 모집·월 일정·지원 처리 · 2026-08-28

- 운영 계약은 Edge `sanctuary-management` v12, API `1.4`, DB `436`이다. Migration `20260828081822_sanctuary_management_stage4_complete_v436.sql`과 후속 공개 가드 `20260828085344_sanctuary_management_publish_guard_v436.sql`이 운영 적용됐다.
- 참여 팀 공개는 모든 포스에 생성자 소유의 서로 다른 캐릭터가 한 명씩 있어야 한다. 참여 팀과 고정 팀 모두 공개 직전에 팀 단위 일정 충돌을 다시 검증하며, 나머지 빈 슬롯은 허용한다.
- 월 조회는 팀의 1회 일정 또는 종료일 없는 주간 반복을 요청 월의 회차로 펼치고, 각 주를 수요일~화요일로 묶는다. WEB 일정 요약은 이 Server 회차만 사용한다.
- 포스 카드 전체가 hover·focus·touch 지원 진입점이다. 지원 모달은 포스마다 로그인 이용자의 캐릭터 한 명을 연결하고, 이미 연결됐거나 충돌·중복·정원 사유가 있는 캐릭터는 비활성 이유를 표시한다.
- 즉시 참가는 팀 행 잠금과 슬롯 재조회 뒤 바로 배치한다. 승인 참가는 신청 묶음과 포스별 항목을 만들고 승인·거절·신청자 취소를 지원하며, 승인 순간에 소유·일정·중복·정원 조건을 모두 다시 검증한다.
- 다중 포스 지원은 항목별 결과 코드와 메시지를 반환한다. 한 포스가 일정 충돌 또는 마지막 자리 경쟁으로 실패해도 다른 포스의 성공을 유지하고, 같은 포스·소유자 대기 신청은 unique index로 중복 생성되지 않는다.
- PC 1280×720의 팀 구성 모달은 일정 패널을 오른쪽에, 모바일 390×844는 일정 패널을 구성창 위에 배치했다. 구성창과 지원 모달, 운영 PC·모바일 페이지에서 가로 overflow 0을 확인했고 세로 영역은 숨김 scrollbar와 하단 fade 규칙을 유지한다.
- 전체 Node 계약 `72/72`, JavaScript syntax, `git diff --check`, PR 5개 source check, main Pages 배포를 통과했다. 운영 전용 ADMIN 화면에서 API1.4/DB436, read/write 활성, 루드라팟·바고트팟·칼드릭스팟·성역4, 수요일 시작 월 일정, 콘솔 오류 0을 확인했다.
- 제품 PR `#308`, main squash `0a114f7be74d9a9277de8a4175e6747a4253a4ce`, Pages run `33157778590`이 기준이다. 운영 활성 팀은 0개로 확인되어 검수용 팀을 만들거나 운영 데이터를 변경하지 않았다.
- 다음 작업은 Stage 5의 `5-1 로그인 사용자별 모집 가능 포스 요약`이다. 기존 알림의 Server summary/polling 경계를 재사용하되 중복 Queue와 이미 참여한 포스 알림을 차단한다.

## 성역관리 Stage 5 완료 · 알림·월간 달력·운영 편집·해산 · 2026-08-28

- 운영 계약은 Edge `sanctuary-management` v13, API `1.5`, DB `437`이다. Migration `20260828104017_sanctuary_management_stage5_complete_v437.sql`과 FK 성능 가드 `20260828105308_sanctuary_management_stage5_performance_guard_v437.sql`이 운영 적용됐다.
- 모집 알림은 별도 polling을 만들지 않는다. 공통 `notificationSummary`의 기존 30초 주기 한 번 안에서 기존 관리자 지원 알림과 DB437 모집 요약을 함께 읽으며, `sessionStorage` event key로 같은 웹 세션에서 팀별 한 번만 그룹 카드로 표시한다.
- DB437 모집 요약은 `kinojo_sm_support_characters_v436`의 실제 `availableForceIds`를 재사용한다. 이미 같은 포스에 참여·승인 대기 중이거나 정원 마감·일정 충돌·소유 캐릭터 없음 상태인 이용자에게는 해당 포스를 반환하지 않는다. 알림 이동은 성역/팀/포스 식별자를 포함해 지원 모달까지 연결한다.
- 일정 이력은 `private.sanctuary_management_schedule_versions_v437`에 유효 기간별로 보존한다. 이번 일정만은 MOVE/CANCEL 예외, 이후 일정은 version split, 전체 반복은 전체 교체/종료로 처리하고 저장 직전에 향후 366일 회차를 기준으로 같은 이용자·본캐 루트의 일정 충돌을 다시 확인한다.
- 월 화면은 Server month payload 하나로 수요일~화요일 7열 달력을 만들며 팀 카드의 가까운 일정도 같은 payload를 사용한다. 달력 항목을 누르면 권한 보유자는 해당 회차 일정 관리창을 열 수 있다.
- 팀 해산은 native confirm을 사용하지 않는다. 먼저 Server archive preview로 향후 366일 일정 수·승인 대기 지원 수·이력 보존 여부를 보여주고, 생성자 또는 관리 권한만 해산 명령을 실행한다. 기존 DB436 원자 명령이 팀 ARCHIVED, 일정 STOPPED, 대기 지원 CANCELLED, lease 해제를 한 트랜잭션으로 처리하고 편성·감사 이력은 삭제하지 않는다.
- PC 1440×900, 모바일 390×844, 소형 모바일 320×568에서 document/modal 가로 overflow 0을 확인했다. 소형 화면의 일정 본문은 숨김 세로 scrollbar와 하단 fade를 쓰고 버튼 영역은 유지한다. Escape 포커스 복귀, Tab 순환, 콘솔 error/warning 0을 확인했다.
- 전체 Node 계약은 `75/75`를 통과했다. DB437 공개 RPC는 `PUBLIC/anon/authenticated` EXECUTE false, `service_role` true다. advisor의 신규 FK 미인덱스는 후속 가드로 해소했으며 private service-only 테이블의 RLS-no-policy INFO는 의도된 직접 접근 차단이다.

## 성역관리 Stage 6-1 · 베타 기능 플래그와 시험 사용자 운영 · 2026-08-28

- 운영 계약은 Edge `sanctuary-management` v14, API `1.6`, DB `439`다. Migration `20260828111536_sanctuary_management_stage6_pilot_rollout_v439.sql`이 `write_rollout_mode=CLOSED/PILOT/OPEN`과 private 시험 사용자 허용 목록을 추가했다.
- 현재 모드는 `PILOT`이며 global read/write는 유지한다. 로그인 이용자는 신규 팀·월 일정 데이터를 읽을 수 있지만, 유효한 허용 목록 행이 없으면 bootstrap의 effective `writeEnabled`가 false이고 팀 추가·편집·일정 변경·해산·지원·모집 알림이 모두 읽기 전용으로 내려간다. 기존 성역·성역 일정·Sheet 경로는 변경하지 않는다.
- 최초 시험 사용자는 활성 raw `MASTER`와 전용 raw `ADMIN` 각 1명이다. 허용 목록은 member ID·승인 시각·만료/해지 상태만 보관하며 패스키·KWS 세션·브라우저 자격 증명은 소스, migration, 테스트, 문서에 남기지 않는다.
- Edge는 archive preview, command, lease, character search/register 전에 DB439 `write_access`를 확인해 미승인 요청을 HTTP 403 `SANCTUARY_PILOT_REQUIRED`로 거절한다. 최종 command/lease/materialize/archive wrapper도 `kinojo_sm_assert_pilot_write_v439`를 다시 실행하므로 UI 또는 Edge 분기를 우회해도 쓰기는 허용되지 않는다.
- DB439 public wrapper는 `PUBLIC/anon/authenticated` EXECUTE false, `service_role` true다. allowlist table은 private schema, RLS enabled, 직접 SELECT 권한 없음이며 security/performance advisor에서 이 신규 객체 관련 항목은 0건이다.
- WEB은 승인자에게 `시험 운영 · 승인됨`, 미승인자에게 `읽기 전용 · 시험 사용자만 쓰기`를 표시한다. PC 1440×900, 모바일 390×844, 최소 320×568에서 document 가로 overflow 0, 승인/미승인 버튼 상태, 콘솔 error 0을 확인했다.

## 성역관리 Stage 6-2~6-6 · 병행 비교·운영 검증·롤백·전환 범위 · 2026-08-29

- 운영 계약은 Edge `sanctuary-management` v15, API `1.7`, DB `445`다. Migration `20260829041843_sanctuary_management_stage6_transition_readiness_v445`는 private 비교 증빙·롤백 연습·전환 승인 이력과 service-role 전용 보고/제어 RPC를 추가한다.
- 6-2 카드 비교는 기존 Sheet DB 27팀·54파티·270슬롯(점유 101)과 신규 Server DB 3팀·16포스·32파티·160슬롯(점유 6)을 `EXPECTED_PARALLEL_SCOPE`로 판정했다. 건수 일치가 아니라 포스 10명·포스당 2파티·파티당 5슬롯 불변 조건을 기준으로 하며 실패 0건이다.
- 6-3 일정 비교는 2026-08 수요일 시작 범위 `2026-07-29~2026-09-01`에서 기존 일정 23개·발생 13회와 신규 활성 규칙 2개·발생 0회를 병행 범위로 판정했다. 양쪽 모두 30분 최소·단위 계약을 통과했다.
- 6-4·6-5는 운영 명령 40건과 감사 40건의 연결, 8개 실제 action 종류, 중복 요청·정원 초과·포스별 이용자 중복·대기 지원 중복·활성 lease 중복 0건을 확인했다. public/anon/authenticated는 DB445 RPC 실행 불가, service_role만 실행 가능하다.
- 6-6 운영 롤백 연습 ID 1은 `PILOT → CLOSED → PILOT`을 수행했다. CLOSED에서 읽기는 유지되고 쓰기는 비활성화됐으며 3.27초 뒤 PILOT으로 복구됐다. 최종 health는 API1.7/DB445, mode PILOT, `restored=true`다.
- 승인 안정 전환 범위 hash는 `d55690120f1e24e21c5b24981c6b55c9f5820ddcfdd97a226e418272d84b1e1e`다. 유지 85행, 이관 0행, 보관·해산 49행, 초기화 대상 점유 107행, Sheet sync 중지 171행이다. 상세 ID와 사유는 `docs/SANCTUARY_MANAGEMENT_STAGE6_TRANSITION_CHECKLIST.md`와 ADMIN/MASTER 전용 `전환 승인됨` 모달에서 확인한다.
- Stage 6 증빙 5종과 구조 검사 13종은 모두 PASS, 미해결 0건, 승인 가능 상태다. PC 1280×720, 모바일 390×844·320×568에서 document/dialog 가로 overflow 0과 콘솔 error/warning 0을 확인했다.
- 6-7 사용자 승인은 승인 ID 1, MASTER, 2026-08-29 14:36:57 KST로 기록됐다. 승인 감사가 추가되며 hash가 스스로 바뀌던 결함은 remote migration `20260829054534 / sanctuary_management_transition_approval_stability_v445`로 보정했다. 기존 승인 행·감사 행은 수정하지 않고 저장 payload를 안정 정규화해 인정하며, 감사·명령의 append-only 건수만 identity에서 제외한다. 보관·초기화·중지 대상 변경은 계속 승인을 무효화한다. 누적 진행도는 **51/59**, 다음 작업은 **7-1 전환 직전 전체 백업과 readback**이다.

## 예방적 확장성 SQL428·SQL442 · 2026-08-28

- Meter 공개 통계/내 비교의 기본 기간은 Server `WEEK`이며 DAY/WEEK/MONTH 시간 경계가 raw combat 조회에 적용된다. `ALL`은 명시적인 사용자 선택지다. 2026-08-28 기준 records 333, participants 1,753, 적격 0이며 집계 전환 Gate 미만이므로 기간·보존·집계 구조를 변경하지 않았다.
- 관리자 회원 목록은 운영 DB `428 / ADMIN_MEMBER_CURSOR_V1`이다. 기본 WEB page 20, Server hard max 100, 이름·코드 prefix/등급 filter, opaque forward cursor와 전용 index 4개를 사용한다. 구 v264는 100건 compatibility wrapper다.
- 운영 검증은 total 16, 첫/둘째 3건 페이지 overlap 0, MEMBER filter 9/9, self 원문 code leak false, warm 10.735ms다.
- WEB main `89ead17485801c9ca684ca98d5206755e47b98be`, 관리자 cache `2026082801`; PC/mobile admin live 200과 Node 계약 12종을 통과했다.
- 성역 v376은 기간 없는 과거 누적 scan이 아니라 현재 편성 JSON의 슬롯별 캐릭터·프로필 반복 lookup이 병목이었다. 운영 `20260828134721 / sanctuary_public_read_n_plus_one_v442`는 전용 identity covering index와 단일 aggregate lookup helper를 적용했고, migration 내부 guest/회원 × 활성 성역 3곳 payload digest·byte parity가 통과했다.
- `rudra` full warm은 약 343ms·shared hit 23,900에서 104.768~107.551ms·4,023으로 개선됐다. `bagot` 94.968ms, `kaldrix` 80.858ms다. 기간·로스터·권한·가시성·프로필 우선순위·WEB 호출명은 변경하지 않았다.
- 알림 v316은 fresh MASTER 16.995ms→6.572ms, 관련 대기 lock 0이며 상태·최신순·만료 index가 이미 있어 추가 snapshot/index/보존 변경 없이 감시로 닫았다.
- 재검증 조건은 성역 warm p95 300ms·max 1초·활성 slot 1,000건, 알림 warm p95 300ms·동시 대기 lock 재현·관련 표 10만 건이다. 다음 독립 작업은 7단계 Drive·GitHub·Supabase 기준본 일치 감사이며 SQL426 정기 parity는 자동 감시로 병행한다.

## Drive·GitHub·Supabase 기준본 일치 · 2026-08-28

- GitHub `main` `bd8b2263d724915187b6ad45b4355648eac88b3c` 기준으로 Drive 기존 ID를 유지해 `ranking/js/ranking-data.js` 6,634 bytes, `hof/js/hall-data.js` 12,814 bytes, `core/kinojo-supabase-features.js` 98,390 bytes를 raw exact 동기화했다.
- Supabase ACTIVE Edge는 27개, 기존 Drive 함수 폴더는 23개였다. GitHub canonical source가 존재하고 운영 v14와 newline-normalized exact인 `sanctuary-management`(API 1.6/DB439/verify_jwt=false)를 Drive source folder에 추가했다.
- `ACTIVE_MANIFEST_20260828.md`는 전체 ACTIVE name/version/verify_jwt/status를 기록한다. GitHub source가 없는 `kinojo-deploy-probe-295`, `meter-release-producer-sync`, `meter-stage85-activation`은 inventory-only 예외이며 소스를 임의 생성하지 않는다.
- 이 동기화는 Drive 기준본만 변경했다. Supabase 함수 배포·설정과 제품 WEB 코드는 변경하지 않았다. 다음 독립 작업은 8단계 통합 부하·장애·보안·배포·문서 readback이다.

## DB 조회 기준·누적 데이터 안정화 SQL427·8단계 마감 · 2026-08-28

- SQL426 이후 정기 published snapshot 20·21이 각각 본캐/부캐 × 기본/전체 레기온 네 scope exact·error 0으로 Gate를 통과했다. 운영 Migration `ranking_snapshot_bounded_input_cutover_v427`은 `kinojo_ranking_snapshot_build_step_v390`의 입력 호출 하나만 raw v390에서 bounded v426으로 전환했다.
- 적용 직후 live 네 범위 legacy/candidate payload가 모두 exact였고 `cutoverActive=true`, `successfulRegularSnapshots=2`다. 공개 ranking/HOF/my-ranking 함수명·응답·published snapshot contract는 유지한다. 당시 미확정이던 raw `character_history`·`growth_reviews` 보존 기간은 후속 SQL443의 30일 정책으로 대체됐다.
- builder는 `search_path=pg_catalog, private, public`, statement timeout 40초·lock timeout 2초, anon/authenticated EXECUTE false·service_role true다. rollback은 입력 호출만 v390으로 복구하고 SQL426 parity와 published snapshot·raw 원본을 유지한다.
- 전체 Node 계약 76/76을 통과했다. live HOME cache-bypass readback은 PC 1920px에서 양쪽 고정 배너와 main이 겹치지 않고, 모바일 390px에서 양쪽 배너가 숨김·단일 열로 전환되며 두 viewport 모두 document 가로 overflow 0이다.
- 후속 운영 표본은 HOF display warm 20/20 HTTP 200·p95 169.623ms, notification warm 20/20 200·p95 87.110ms다. 14:06 UTC 이후 API/Edge 4xx·5xx와 DB timeout은 0이다.
- SQL427 Drive Source/Deploy/Verify/Rollback ID는 `14bDFgbhF7R1VJ73DY9XSp-c1XohuhaFW` / `1n682ubd8zP6YkYeoT133Bt3Wrht2Cc03` / `1s1mW-m5i_MJgf1yRzYr8bCiCBvKhTBkE` / `1JU63QBm61UmPc49JEwkeg7gRYLs5LUMN`이며 모두 local raw bytes와 exact다. 이 안정화 프로젝트는 완료 상태다.

## 캐릭터 성장 원본 30일 보존 SQL443 · 2026-08-29

- 운영 Migration `20260828215808 / character_growth_raw_retention_v443`은 `character_history.history_date`와 `growth_reviews.review_date`를 canonical source date로 사용해 KST 현재일을 포함한 최근 30개 날짜를 유지한다. `history_date`가 NULL인 예외만 `created_at AT TIME ZONE 'Asia/Seoul'`을 사용한다. 이 정책은 두 성장 원본 표에만 적용하며 runtime event·payload·session·audit 표로 확대하지 않는다.
- 초기 dry-run은 history 8,441건, review 8,442건을 만료 대상으로 확인했다. 2,000건/표 이하의 다섯 bounded 호출로 총 16,883건을 완전 삭제했고, 최종 history 9,171건·review 9,125건, 최소 source date `260731`, 최대 `260829`, 만료 잔여 0건이다.
- `kinojo_character_growth_raw_cleanup_v443(boolean, integer)`은 dry-run 기본, 기본 5,000·최대 10,000건/표, `FOR UPDATE SKIP LOCKED`, statement timeout 10초·lock timeout 500ms, fixed empty search path를 사용한다. PUBLIC/anon/authenticated 실행 권한은 없고 service role만 실행한다.
- Cron job 21 `kinojo-character-growth-raw-cleanup-v443`은 매주 수요일 05:40 KST에 최대 5,000건/표를 정리한다. pg_cron UTC 식은 `40 20 * * 2`이며 05:10 run-report, 05:20 rollup, 05:30·05:45 회원 이미지 정리와 겹치지 않는다.
- 정리 전후 rollup, v426 history/review current state, latest published snapshot scope hash가 각각 exact했다. public ranking/HOF/hall payload와 v426 본캐/부캐 × 기본/전체 레기온 네 scope 호출도 정상이며 waiting lock·expired row·dead tuple은 모두 0이다. retained review 608건의 `previous_history_id` provenance가 제거된 raw 행을 가리키지만 각 review의 `raw_previous`와 직전 scalar 기준값은 모두 남아 있어 표시와 delta는 유지된다.
- SQL443 Source/Deploy/Verify/Rollback Drive ID는 `1MEHiRbIovgXifqDP6P4Ern8dJBihvWos` / `1vVGtzwy-NqeSBFWurUkBSqyumlk4UbwA` / `1BSg6RrHDfFyNZ0u4iABK8F3ll_jrszBR` / `1ph_q-1qcRmJGikBAW3ZpeYUvNHdveHoJ`다. Source/Deploy는 7,705 bytes·SHA-256 `63fb8849033c6c74cc19170abc8333dfe1a84f93c82314b53ecfcced8d96298e`, Verify는 4,775 bytes·`08ed864c834d9185cf46fddab5730ebca865271430ad58e31318de744f5224a9`, Rollback은 843 bytes·`a32f7ebac23cd3d6384f6449c26835464c5340d07a86e4c68b00a764f59d0e70`이며 Drive raw size가 local과 일치한다.
- SQL443 rollback은 Cron·cleanup 함수·전용 index를 제거해 미래 삭제를 중단할 뿐 이미 삭제된 raw 행을 복원하지 않는다. SQL427의 raw v390 rollback 경로는 더 이상 기능상 안전하지 않으므로 production ranking builder는 bounded v426 입력을 유지한다.

## 관리자 캐릭터 최신화 실행 기록 보존 · 2026-08-27

- 관리자 `최근 조회 기록`은 기본 3건이며 사용자가 3/5/10건 중에서 선택한다. PC·모바일은 같은 `admin-characters.js` 계약과 loader cache `2026082801`을 사용한다.
- 운영 Migration `20260827081644 / updater_run_report_retention_v421`은 목록 getter의 기본 limit을 3으로 고정하고, 누락 preview·repair를 최근 7일 안으로 제한한다. preview·repair·cleanup RPC는 `service_role`만 실행할 수 있다.
- `updater_run_reports`는 영구 감사 자료가 아닌 즉시 장애 확인용 보고서다. `finished_at <= statement_timestamp() - interval '7 days'`인 보고서 요약·상세 행만 완전 삭제하며 runtime job·event·payload·session 원본은 삭제하지 않는다.
- 정리 Cron `kinojo-updater-run-report-cleanup-v421`은 매주 수요일 05:10 KST에 최대 500건을 삭제한다. pg_cron 저장식은 GMT 기준 `10 20 * * 2`다.
- 최초 dry-run은 전체 181건 중 만료 157건·유지 24건·최근 누락 0건이었고, 승인된 157건 삭제 후 24건·만료 0건·최근 누락 0건이다. 일반 `VACUUM (ANALYZE)` 후 dead tuple은 0건이다.
- UI와 DB 계약 회귀는 전체 Node 계약, PC 1440px·모바일 390px·최소 320px overflow 0, 홈 PC 960px banner bound·모바일 overflow 0을 기준으로 한다.

## 관리자 캐릭터 최신화 진행상태 materialization · 2026-08-27

- 운영 Migration `20260827121136 / admin_server_queue_progress_current_v422`과 `20260827121313 / admin_server_queue_progress_terminal_v423`이 활성 상태다. `updater_session_progress_current`는 세션별 현재 상태·대상 수·완료/실패/잔여 수·진행률·단계·최신 이벤트·terminal 시각을 한 행으로 보관하며 writer 트랜잭션의 trigger가 갱신한다.
- 상태 조회 `kinojo_admin_server_queue_status_v289`는 집계 원본을 다시 읽거나 report를 생성하지 않고 인증된 관리자에게 해당 세션의 요약 한 행만 반환한다. 30회 운영 표본은 평균 1.814ms, p95 1.928ms, 최대 6.304ms였고 200ms 초과는 0회다.
- 조회 범위는 무기간 전체 운영 이력이 아니다. 요청한 `sessionId`, 없으면 현재 actor의 active session, 그것도 없으면 현재 actor의 가장 최근 session 한 건만 선택한다. 대상·단계·이벤트·성능 표본은 선택된 동일 세션의 상세 버튼에서만 각각 최대 200/20/40/1 범위로 조회한다.
- 기본 polling은 전경 3초, 숨김 또는 비활성 문맥 15초이며 terminal 상태를 받으면 즉시 중단한다. 완료 뒤 추가 polling은 0회다. 대상 목록과 성능 진단은 사용자가 명시적으로 열 때만 가져온다.
- PC·모바일 관리자 loader와 모든 페이지의 공통 Supabase feature module cache는 `2026082801`, 관리자 CSS는 `2026082706`이다. 동명이인 target은 target ID 또는 server+name identity로 분리한다. `tests/admin-queue-materialized-status-*.test.js`와 전체 Node 계약 60개가 이 경계를 보호한다.

## My Info 2차 · 제작 요청 업로드 장애 수정 · 2026-08-27

- PR `#282`를 merge commit `1916e7cc8201eee260c44bcca4a87bee13797212`로 병합했다. 회원 prepare 응답에서 DB404가 `items`만 반환할 때 Edge가 선택 슬롯을 잃어 `request.slots=[]`를 내보내고, 브라우저가 `IMAGE_REQUEST_RESULT_INVALID`로 signed upload 전에 중단하던 문제를 수정했다.
- `imageRequestPublic`는 DB가 명시한 `slots`를 우선하고, prepare에서만 검증이 끝난 입력 슬롯을 fallback으로 사용한다. private bucket/object path는 응답에 노출하지 않는다.
- 운영 `kinojo-member-profile`은 v25 ACTIVE(API 2.7 / DB 375 / Request 404)이며 배포 소스가 병합된 GitHub source와 exact 일치한다. health 200, 무효 세션 401, 관련 DB404 RPC의 service-role-only ACL과 기존 RLS 경계를 재확인했다.
- 신규 실제 Edge helper 회귀를 포함한 전체 Node 계약 52개가 통과했다. PR의 My Info 관련 검증은 모두 통과했고, `Verify KINOJO Pages`의 실패 1건은 동시 진행된 별도 성역 운영 Edge 414와 저장소 기대값 412 불일치로 이 변경 범위와 무관하다.
- 기존 실패 DRAFT는 수동 삭제하지 않고 기존 cleanup 수명주기를 따른다. 영향 사용자는 새 운영 코드가 반영된 뒤 My Info를 새로 열어 이미지를 다시 선택·전송한다.

## 성역·스케줄 관리 개편 · Stage 3-5 캐릭터 검색·공식 조회·관계 등록

- 신규 권한형 경로는 PC `/sanctuary-management/`, 모바일 `/m/sanctuary-management/`이며 둘 다 `noindex,nofollow,noarchive`다. 공통 Topbar·Drawer와 성역/성역 일정/성역 관리 탭은 `KinojoPermissions.canEditSanctuary(account)` 기준으로 MANAGER 이상 또는 `sanctuary_edit` 권한 계정에만 관리 진입점을 표시한다.
- WEB 진입점은 기존 bootstrap/command에 `searchSanctuaryManagementCharacter()`와 `registerSanctuaryManagementCharacter()`를 추가했다. 현재 KWS opaque session을 body의 `sessionToken`으로 `sanctuary-management` Edge에 전달하고 브라우저 직접 service-role RPC, PLAYNC 호출, legacy Sheet bridge, page mock adapter를 사용하지 않는다.
- 운영 계약은 Edge `sanctuary-management` v8 / API `1.1` / DB `432`다. DB432 bootstrap/command wrapper는 DB431/430 계약을 유지하고 캐릭터 마스터 우선 검색, 공식 조회 candidate, 관계 확정, character master materialization helper를 추가한다.
- 캐릭터 조회는 `이름`을 `지켈` 서버로, `이름[서버]`를 명시 서버로 해석하고 이름·서버 정확 일치만 허용한다. 캐릭터 마스터에 없을 때만 Edge가 PLAYNC search/info를 호출하며 브라우저에는 공식 endpoint나 lookup token을 노출하지 않는다. 공식 candidate는 private service-only table에 짧게 보관되고 prepare/gate RPC의 사용자·팀 단위 제한을 거친다.
- 운영 레기온은 private DB reference의 `깡`, `낮`, `밤`, `키나노동조합` 네 항목이다. 운영 레기온 캐릭터는 `MAIN/ALT`만 허용하고 `ALT`는 이미 등록·확인된 본캐 연결이 필수다. 외부 레기온·무레기온 캐릭터는 `GUEST`만 허용한다. 관계를 확정한 캐릭터는 기존 `character_master`에 안전하게 반영한 뒤 처음 선택한 빈 슬롯에 `SET_SLOT`하고 bootstrap을 다시 읽는다.
- v432 public wrapper 7개와 private helper/table은 고정 search path·RLS·service-role-only ACL을 사용한다. `PUBLIC/anon/authenticated` 실행 권한은 0이고 service role 실행 권한은 7이다. command v432는 기존 권한, request key idempotency, expected revision, 최대 9포스, 포스별 소유자·본캐 root 중복과 슬롯 충돌 검증을 그대로 위임한다.
- PC는 680px 정사각형 composer와 286px 세로 일정 패널을 나란히 유지한다. 모바일은 일정 패널을 composer 위에 두며 390px·350px에서 composer 비율 1:1, slot 10개, 가로 overflow 0을 확인했다. 9포스 rail은 세로 overflow와 숨김 scrollbar, 아래 내용이 있을 때만 하단 fade를 사용한다.
- 운영 `readEnabled=false`, `writeEnabled=false`는 그대로다. 운영 화면의 생성·편집·캐릭터 등록은 별도 승인 전까지 비활성이고 기존 성역·스케줄·Sheet 경로도 변경하지 않았다.
- SQL432 Source/Deploy/Verify/Rollback, FK index follow-up, Edge v8 Source의 Drive ID는 Stage 3-5 LOG와 SQL_INDEX에 기록한다. 전체 Node 계약 66종, JavaScript/Deno check, 로컬 PC 1440×1000과 모바일 390×844·350×740 검수를 통과했다. 검색 버튼·Enter, 마스터 결과 슬롯 배치, 공식 게스트 확정 배치, 중첩 form 0, 가로 overflow 0, 콘솔 오류 0을 확인했다.
- 다음 작업은 3-6 일정 입력·30분 단위 진행 시간·반복 규칙·다른 팀 충돌 검증 연결이다. 운영 `readEnabled=false`, `writeEnabled=false`는 별도 승인 전까지 유지한다.

## 레기온 트리 마-2~마-6 / 사-1~사-7 / 아-1~아-6 / 자-1~자-7

- PC·모바일 페이지가 공개 RPC `kinojo_web_get_legion_tree`의 `web-legion-tree-v1` / DB 365 계약을 읽어 깡·낮·밤·키나노동조합을 Server 순서대로 렌더링한다.
- 2026-08-24 운영 readback 기준 실제 구성원은 깡 41명, 낮 4명, 밤 2명, 키나노동조합 42명으로 총 89명이다.
- 종족 선택은 v372 Server reference의 천족/마족 각 21개 서버만 표시하며, 종족 전환 시 호환되지 않는 선택 서버를 즉시 초기화한다.
- 실제 구성원 카드는 Server `className`을 수호성→templar, 검성→gladiator, 살성→assassin, 궁성→ranger, 마도성→sorcerer, 정령성→elementalist, 치유성→cleric, 호법성→chanter, 권성→fighter의 공용 9종 아이콘으로만 연결한다. 공백·표시용 괄호 수식은 정규화하되 unknown/빈 값은 추측하지 않고 `?` fallback으로 닫는다.
- 2026-08-24 운영 readback의 89명 직업 분포는 수호성 7, 검성 6, 살성 7, 궁성 15, 마도성 10, 정령성 9, 치유성 17, 호법성 12, 권성 6이며 현재 unknown/null은 0명이다.
- 운영 89명의 Server 상태는 본캐 39명, 부캐 50명이며 characterName 누락과 부캐 mainCharacterName 누락은 각각 0명이다. WEB은 `characterName / isMain / mainCharacterName`을 그대로 렌더링하고 본캐/부캐를 재판정하거나 이름순·본캐 우선으로 재정렬하지 않는다.
- 전체 이름은 DOM text·`title`·`aria-label`에 보존한다. 5 Unicode 글자까지는 마스크 없이 표시하고 5글자 초과만 약 5글자 폭의 우측 fade를 적용하며 ellipsis는 사용하지 않는다. 현재 운영 5글자 초과 이름은 2명이다.
- 고정 124px 카드는 branch 수가 늘어도 축소하지 않는다. PC는 1/2/3+ branch에 5/3/2열, 모바일은 1~2/3+ branch에 2/1열을 사용하며 `data-branch-count`와 동일 CSS 계약을 PC·모바일이 공유한다.
- 운영 Server가 반환한 `DEFAULT_FALLBACK` 구조에는 `기본 단계` 표식을 붙이고, 배정 구성원이 0명인 role은 group 배열 유무와 관계없이 `지정 전`으로 표시한다.
- 계약 버전, 필수 4개 레기온, Server stage 구조 또는 fallback 상태가 맞지 않으면 브라우저에서 임의 fallback을 만들지 않고 오류 상태로 닫는다.
- 캐릭터 추가는 기존 인증 Server chain을 재사용한다. `core/kinojo-supabase-features.js#addLegionTreeCharacter`가 현재 `kws_` 세션을 내부 결합해 `kinojo-legion-tree`의 `character-add`만 호출하며, 페이지는 본캐명·부캐명·`serverId` 외의 mode/race/member/공식 정보/list/Queue 값을 만들지 않는다.
- 본캐만 입력하면 MAIN, 본캐+부캐는 ALT 요청이 되고, 부캐만 입력하면 본캐 오류·focus 후 network 0으로 종료한다. 실행 중에는 추가/초기화 버튼을 잠가 중복 click과 가짜 취소를 막는다.
- 진행 UI는 요청에 결합된 Server runtime `sessionId`만 추적해 `공식 확인 → 정보 반영 → list 반영 → readback → 완료`를 표시한다. 동일 세션의 `completed / SERVER_QUEUE_LIST_SYNC_DONE`만 완료로 인정하고, Google list readback 완료 뒤 공개 트리를 재조회한다.
- 초기화는 작업이 없을 때 두 이름, 종족, 서버, 오류, 진행 표시를 함께 비운다. Server 작업 실행 중에는 초기화를 거부하며 Server Queue를 취소했다고 표시하지 않는다.
- 레기온 트리 진행도는 **56/115**다. 다음 원본 단계는 **차-1 조직도 편집 Modal frame**이며 이번 변경에서는 선행하지 않는다.

## 내 정보 이미지 기존 완료 상태

- 기존 내 정보/캐릭터 이미지 Stage 1-8은 `80/80` 완료 상태이며 재구현하지 않는다.
- 운영 Edge 기준은 `kinojo-member-auth` v2, `kinojo-member-profile` v26(API 2.7 / DB 375 / Request 404 / Admin Request 405 / Work Queue 406), `kinojo-member-image-download` v2, `kinojo-member-image-cleanup` v6다.
- `kinojo-member-profile` 버킷은 공개, `kinojo-member-reference` 버킷은 비공개다.
- 참고 이미지는 최대 7일 보존하며 cleanup cron은 `*/15 * * * *`로 활성화되어 있다.
- 관리자 이미지 SQL 367/371은 `service_role` 전용이다.

## 마이페이지 모달 2차 · 1단계 Server/Storage 계약

- 2026-08-26 기준 1단계는 기존 `kinojo-member-profile` 책임을 재사용하는 `REUSE_WITH_DB_MODULE`로 확정했다. 별도 회원 이미지 Edge를 만들지 않고 요청의 원자성은 DB404 RPC가 담당한다.
- 기존 API 2.7 / DB375 bootstrap·프로필·참고 이미지 action은 유지하며 신규 `image-request-prepare`, `image-request-finalize`, `image-request-state`만 image request contract `404`로 추가한다.
- 요청은 회원 세션에서 확정한 캐릭터에 이미지 `1~3`장과 `SHONEN_MANGA / ROMANCE_MANGA / ANIMATION / REALISTIC / CUSTOM / null`, plain-text 요청문 최대 300자를 묶는다. `CUSTOM`은 요청문이 필수다.
- prepare는 회원+idempotency key로 `DRAFT`와 서버 생성 object path를 한 번만 만들고 브라우저에는 path 필드 없이 private Storage signed upload URL만 반환한다. 업로드 URL은 2시간, draft object는 2시간 뒤 cleanup 대상이다.
- finalize는 소유권을 다시 검증하고 모든 요청 object의 MIME·size·실제 WebP 픽셀을 확인한 뒤 DB 트랜잭션 하나로 `SUBMITTED`와 활성 참고 이미지를 갱신한다. 일부 실패·동시 교체 충돌에서는 기존 활성 이미지와 `DRAFT`를 보존한다.
- 이미지 bytes는 요청 생성 시각부터 최대 7일, 스타일·요청문·상태·감사 metadata는 최대 30일 보존한다. 기존 요청 이미지가 새 요청으로 교체돼도 남은 7일 동안 보존하고, legacy 교체 object는 cleanup queue로 넘긴다.
- private 요청/항목/상태 이력/cleanup queue 4개 표는 RLS default-deny이며 Browser role의 표·RPC 직접 권한은 없다. DB404 RPC 7개는 `service_role`만 실행한다.
- cleanup Edge는 v1.3 / DB404로 확장해 abandoned DRAFT, 7일 만료 요청 이미지, legacy active reference, 교체 queue를 Storage 먼저 삭제한 뒤 metadata를 확정하고, object 삭제가 끝난 30일 metadata만 제거한다.
- 완성 결과 이미지 업로드·회원 전달·프로필 자동 적용과 관리자 요청 목록·상태 처리 UI는 1단계 범위가 아니다. 관리자 요청 처리는 3단계에서 기존 MASTER signed preview/download 경계 위에 연결한다.
- 운영 반영: PR #266 / main `02d65572`, migration `20260826040254 member_image_request_batch_v404`, `kinojo-member-profile` v23, `kinojo-member-image-cleanup` v6. DB404 ACL/RLS·빈 초기 상태·기존 15분 cleanup Cron·profile health/cleanup 무인증 경계를 readback했다.


## 2026-08-24 참고 가이드 PNG 최종 에셋

- FRONT/BACK/UPPER_BODY 촬영 가이드는 사용자가 제작한 `front.png`/`back.png`/`body.png`를 각각 `front-2x3.png`/`back-2x3.png`/`upper-body-4x5.png`에 매핑했다. 운영 크기는 800×1200, 800×1200, 800×1000이다.
- PNG는 원본의 반투명 발광 프레임, 캐릭터 실루엣과 랜드마크를 유지한다. 기존 `<img>` overlay 구조를 재사용하며 가이드는 WebP 결과 픽셀에 포함되지 않는다.
- 회귀 테스트는 PNG signature·IHDR 픽셀 크기·투명도·파일 크기와 legacy SVG 제거를 검증한다. Server/Edge/Storage 계약은 변경하지 않았다.

## My Info / Admin Image Modal 추가 UI 후속 — CLOSED

- PR `#197` (`Refine My Info image UI and admin image modal`)은 head `d90ca1e93a97d284447df76c19b695b56db7a324`, merge commit `e022442be2261adfcc769bd0b34a6a766f717d9a`로 2026-08-22 병합됐다. 이후 배너 작업이 이어진 현재 기준 `main` `f3502f04dfbbba89392a44e8a1c2aaaa3b46a7eb`에서도 관련 계약은 유지된다.
- 회원 My Info는 compact 제목, 프로필 캐릭터 2열 selector/현재 이미지 좌우 pane, 내부 스크롤·hidden scrollbar·white fade, FRONT/BACK/UPPER_BODY 독립 슬롯, no-crop 미리보기, 슬롯별 선택/비공개 등록/편집 취소/삭제와 `filesBySlot`/`outputsBySlot`/`previewUrlsBySlot` 독립 pending 상태를 유지한다.
- 관리자 회원 이미지 모달은 본캐 우선 기본 선택, 회원 보유 캐릭터 selector, 선택 캐릭터 상세 1개만 교체 렌더, `data-admin-member-image-character` 기반 preview/download/privacy 계약, `#adminMemberImageModal` scoped viewport/internal-scroll 및 body scroll lock을 유지한다.
- PR #197 자체는 Supabase SQL/RPC/Edge/Storage policy/bucket/cleanup/signed upload·preview·download 계약을 변경하지 않았다. 이후 다른 프로젝트의 Supabase 변경과 구분한다.
- 자동 검증은 PR #197의 `Verify KINOJO Pages`, `Verify Character Refresh Profile`, `Verify Legion Tree Pages` PASS와 merge commit의 `kinojo/live-readback`, `legion-tree/live-readback` success를 확인했다. 2026-08-23 마감 readback에서는 현재 `main`의 관련 소스 계약 유지, Drive 전용 회귀 테스트 직접 실행 PASS, `ui/kinojo-common-ui.js`·`ui/kinojo-my-info.css`·`admin/js/admin-members.js`·`admin/css/admin.css`·`tests/my-info-admin-image-layout-contract.test.js`의 GitHub↔Drive Git blob SHA `5/5` 일치를 확인했다.
- PC `1280x900`, 모바일 `390x844`/`320x800`/`844x390`, 실제 3 reference slot 동시 pending→개별 등록, 관리자 실제 다캐릭터 selector/preview/download의 **PR #197 후속 최종 수동 sanity check는 이번 마감 회차에서 재실행하지 못했다.** 현재 실행 환경에 KINOJO 인증 브라우저 세션이 없고 headless Chromium도 사용할 수 없었으며, 2026-08-23 사용자 명시 지시로 Codex 재사용 가능 시점까지 기다리지 않고 마감한다. 이 항목은 `PASS`로 기록하지 않고 **post-close 수동 확인 보류**로 남긴다.
- 최종 상태는 **구현·자동 회귀·PR 병합·Pages/live 배포·Drive 소스 동기화 기준 CLOSED**다. 수동 sanity check에서 실제 회귀가 발견될 경우에만 최신 `main`에서 새 `codex/` 수정 브랜치를 만들어 별도 최소 수정한다. 이전 PR #197 작업 브랜치나 과거 dirty branch를 다시 병합하지 않는다.

## 레기온 순위 통합 패널 UI

- 이 작업은 WEB 표시·상호작용 변경이며 신규 SQL/RPC/Edge 계약을 추가하지 않는다. 순위는 기존 `kinojo_web_get_legion_ranking`, 로그인 캐릭터는 기존 `kinojo-member-profile`의 `characters` action을 재사용한다.
- 데스크톱 PVE/PVP는 하나의 외곽 카드 안에서 좌우 분할되고 목록만 각각 독립 스크롤된다. 스크롤바는 숨기며, 하단의 비대화형 그라데이션은 남은 내용이 있을 때만 보이고 끝에서는 사라진다.
- 모바일은 같은 패널을 PVE/PVP 탭으로 전환하고 각 목록의 스크롤 위치를 별도로 보존한다. 390×844와 320×800에서 가로 overflow 0을 확인했다.
- 2026-08-21 후속 수정에서 오류 흔적처럼 보이던 PVE/PVP 헤더 좌측 색상 inset bar를 제거했다. 중앙 구분선과 PVE/PVP 칩은 유지한다.
- Fold 펼침 화면에 해당하는 700~1220px 구간은 검색·범위 스위치를 왼쪽, 클래스 5열 필터를 오른쪽에 둔 2행 Grid를 사용한다. 768×1024 세로와 1080×960 가로에서 요소 간 겹침 0, 가로 overflow 0을 확인했다.
- 컴팩트 카드는 직업 텍스트를 제거하고 공통 직업 아이콘만 사용한다. 서버는 레기온 옆 `[지켈]` 형식이며, 전투력/아이템 레벨은 위아래 두 줄이다.
- `내 캐릭터 순위 보기`는 Server가 반환한 소유 캐릭터를 정확한 `server_id + character_name`으로만 대조하고, 현재 20명 밖이면 기존 순위 페이지를 추가로 받아 해당 카드로 부드럽게 이동한다.
- 1920×1080과 390×844 모두 카드 4장 전체와 5번째 카드 일부가 보이고, 고정 공지바가 목록을 덮지 않는다.

## 명예의 전당 동일 크기 카드 보드

- PC·태블릿의 6개 카드 보드는 기존 `hof/css/hall.css`의 단일 HOF authority에서 10열×4행 정사각형으로 관리한다. PVE·DPS·PVP·레기온 이동은 동일한 7열×1행, 강화의 신·성장의 신은 동일한 3열×2행이다.
- 10열×4행 슬롯은 위에서부터 `강화+DPS`, `강화+레기온 이동`, `PVE+성장`, `PVP+성장` 순서다. TOP3 행은 `순위 | 직업 아이콘·캐릭터명 [서버]·본캐/부캐 | 전투력 | 프로필`의 한 줄 구조다. 직업 아이콘은 원형 외곽 없이 공통 에셋 원본 형태로 표시하고, 서버는 뱃지가 아닌 대괄호 텍스트이며 TOP3의 뱃지는 본캐/부캐만 사용한다.
- Fold 펼침 세로·가로는 같은 보드 오른쪽에 140~150px `내 랭킹`을 유지한다. 제목은 `내 랭킹`만 남기고 사각 프로필과 이름, PVE/PVP/강화/성장/좋아요/싫어요 한 줄 항목을 사용한다. 보드 크기는 dynamic viewport height를 사용하지 않아 스크롤 중 변하지 않는다.
- 760px 이하의 좁은 화면은 기존 `hall-render.js` 슬롯을 DPS→PVE→PVP→강화/성장 좌우→레기온 이동 순서로 사용한다. PC `/hof/`와 모바일 `/m/hof/`는 같은 렌더러와 CSS를 공유한다.
- 기존 `tests/hof-layout-contract.test.js`가 카드 span·슬롯 순서·TOP3 한 줄·Fold 내 랭킹 압축·모바일 DOM 순서·cache key를 검증하며, 기존 `verify-kinojo-pages.yml`이 JS 구문과 이 계약 테스트를 실행한다.

## 후속 12개 작업

1. A-1 이미지 가이드/출력 계약
2. A-2 가이드 에셋
3. A-3 KINOJO 공통 슬라이더
4. B-1 편집기 기본/가이드 프레임
5. B-2 크롭/WebP/품질 경고
6. B-3 안전 업로드 연결
7. C-1 배치 bootstrap
8. C-2 preloading/background/retry
9. D-1 가변 패널 너비
10. D-2 잘림 없는 반응형 배치
11. E-1 회귀/접근성/시각 검증
12. E-2 배포/live/Drive/Supabase 마감

## A-1 계약

- A-1은 PR `#157`, 운영 commit `4c5c6ef94bae6109b39a59ed95e5ac61f78a0600`으로 반영됐다.
- `ui/kinojo-my-info-image-contract.js`가 후속 편집 결과 계약을 소유한다.
- PROFILE은 `512x512`(1:1), FRONT/BACK은 `800x1200`(2:3), UPPER_BODY는 `800x1000`(4:5)이다.
- 결과는 WebP quality `0.90`, metadata 제거, 원본 미업로드다.
- 입력은 기존과 동일한 JPEG/PNG/WebP 최대 5MiB다.
- FRONT는 머리·양손·발끝, BACK은 머리카락·의상 후면·뒤꿈치, UPPER_BODY는 머리 전체부터 허리선과 양어깨를 촬영 전에 안내한다.
- 공통 안내는 캐릭터와 겹친 채팅창·HUD·스킬 버튼은 편집으로 제거할 수 없으므로 HUD를 숨기거나 겹치지 않게 촬영하도록 설명한다.
- A-1은 `FOLLOWUP_TARGET`이며, 실제 crop과 Server 픽셀 검증은 B 단계에서 연결한다. 현재 운영 업로드 동작은 A-1에서 바꾸지 않는다.

## A-2 가이드 에셋

- A-2는 PR `#158`, 운영 commit `e6ac8358f6482b9455e1d5972987a5871d0ae26b`으로 반영됐다.
- `assets/images/my-info/guides/`에 FRONT, BACK, UPPER_BODY용 투명 PNG 3종을 둔다.
- FRONT/BACK은 2:3, UPPER_BODY는 4:5이며 A-1 출력 크기와 같은 viewBox를 사용한다.
- 각 SVG는 화면 문구를 포함하지 않는 독립 실루엣으로, 접근 가능한 title/description과 슬롯 식별자를 제공한다.
- 외부 이미지·폰트·script·embedded raster를 사용하지 않으며 각 파일은 8KiB 이하로 유지한다.
- `ui/kinojo-my-info-image-contract.js`의 `guideAssetPath`가 경로 소유권을 갖고, 실제 첨부 전 카드와 편집기 연결은 B-1에서 진행한다.

## A-3 KINOJO 공통 슬라이더

- A-3은 PR `#159`, 운영 commit `fd583f1d423b968690caa99c64aa74a5c7a975d0`으로 반영됐다.
- `ui/kinojo-range-control.js`가 연속값, 단계점, 얇은 단일값, 선택 구간의 값 동기화·키보드·접근성·이벤트 계약을 소유한다.
- `ui/kinojo-components.css`가 track, active segment, thumb, focus, disabled, mobile 44px hit area, forced colors, reduced motion 시각 계약을 소유한다.
- 성역 간편 추가의 3단계 검색 범위는 공통 컴포넌트의 첫 소비자로 이전했다. 성역 전용 CSS/JS에는 슬라이더 track/thumb/snapping/키보드 로직을 남기지 않는다.
- A-3은 WEB 공통 컴포넌트 작업이며 Supabase·이미지 업로드 운영 계약은 변경하지 않는다.

## B-1 편집기 기본 / 가이드 프레임

- B-1은 PR `#161`, 운영 commit `ec52d8d93c02a9645ab01b27ad163f6f1a2e177c`으로 반영됐다.
- `ui/kinojo-my-info-image-editor.js`가 첨부 전 3종 가이드 카드와 공통 편집기 viewport를 소유한다.
- 편집 프레임은 A-1 슬롯 비율에 고정되고 FRONT/BACK/UPPER_BODY에는 A-2 투명 PNG를 overlay한다. PROFILE은 별도 에셋 없이 정사각형 안전 영역만 제공한다.
- 원본은 브라우저 메모리의 object URL 또는 호출자가 제공한 URL로만 표시하며, 닫기·오류 시 편집기가 만든 object URL을 해제한다.
- 사진 이동, 확대, 회전, 초기화와 포인터/터치 drag, Escape 닫기, 포커스 순환·복귀를 제공한다. 확대/회전은 A-3 공통 슬라이더를 사용한다.
- 회전된 프레임의 네 모서리가 원본 밖으로 벗어나지 않도록 최소 cover scale과 이동 범위를 계산한다.
- B-1 확인 결과는 `previewOnly` 구도 상태다. canvas crop, WebP encoding, 품질 경고, Supabase 호출, 기존 Stage 1-8 업로드 교체는 포함하지 않는다.
- `tests/my-info-image-editor-harness.html`에서 3종 촬영 카드와 편집 프레임을 시각 검증한다. 실제 파일 선택 결과와 출력 생성 연결은 B-2에서 진행한다.

## B-2 크롭 / WebP / 품질 경고

- `ui/kinojo-my-info-image-editor.js`가 현재 이동·확대·회전 상태를 슬롯별 고정 크기 canvas로 렌더링한다. 가이드 SVG는 화면 overlay로만 유지하며 결과 픽셀에는 포함하지 않는다.
- PROFILE은 `512x512`, FRONT/BACK은 `800x1200`, UPPER_BODY는 `800x1000`의 WebP 결과를 만들고 quality `0.90`을 적용한다.
- canvas 재인코딩으로 원본 metadata를 승계하지 않으며 원본 파일은 업로드하지 않는다. 결과는 브라우저 메모리의 `Blob`과 지원 환경의 `File`로만 반환한다.
- 실제 출력 픽셀 대비 유효 원본 픽셀이 `1.00` 미만이면 주의, `0.75` 미만이면 낮은 해상도 경고를 표시한다. 임계값 경계의 소수점 오차를 허용하며 경고는 결과 생성을 막지 않는다.
- 결과 상태는 `outputReady: true`, `uploadConnected: false`다. fetch, Supabase, Storage, 세션 토큰과 기존 Stage 1-8 업로드 연결은 B-3 전까지 추가하지 않는다.
- 데스크톱 프레임은 슬롯 비율을 유지하도록 너비를 viewport 높이에도 맞추고, 모바일 `390x844`에서도 경고·슬라이더·하단 버튼이 함께 노출된다.
- 테스트 harness에서 FRONT `800x1200`과 UPPER_BODY `800x1000`의 실제 `image/webp` decode, 비차단 경고, 가이드가 빠진 편집 결과를 확인했다.

## B-3 안전 업로드 연결

- B-3은 PR `#165`, 운영 commit `ad428f4d0c05de4d9b649ff66c4ac8529824ef40`으로 반영됐다.
- `ui/kinojo-my-info-image-upload.js`는 편집 완료 WebP 결과만 기존 Stage 1-8의 signed upload prepare/complete 계약에 연결한다. 원본 JPEG/PNG/WebP는 편집기 object URL로만 읽고 Storage에 전송하지 않는다.
- 프로필은 신규 등록과 기존 override의 안전 교체를 지원한다. FRONT/BACK/UPPER_BODY는 Server 등록 상태를 읽고 비공개 신규 등록·안전 교체·Storage object와 metadata 동시 삭제를 제공한다.
- Storage signed upload는 `upsert: false`, 무작위 32자리 object path, publishable key만 사용한다. 사용자 세션 토큰이나 service role을 Storage 요청에 전달하지 않는다.
- 운영 `kinojo-member-profile` v19/API 2.6은 업로드된 WebP 바이트에서 실제 픽셀을 파싱한다. PROFILE `512x512`, FRONT/BACK `800x1200`, UPPER_BODY `800x1000`이 아니면 후보 object를 삭제하고 metadata를 활성화하지 않는다.
- `tests/my-info-image-upload.test.js`와 브라우저 harness가 신규 등록·교체·삭제·원본 미전송·B3 픽셀 확인을 검증한다. PR CI, Pages build/deploy, custom-domain exact live readback이 모두 성공했다.

## C-1 배치 bootstrap

- C-1은 PR `#170`, 운영 commit `5b70ee93cdecd31467162657381e34bfecd9be58`으로 반영됐다.
- `ui/kinojo-my-info-batch-bootstrap.js`가 내 정보 모달 bootstrap 계약을 소유한다. 모달을 열 때 `kinojo-member-profile`의 `batch-bootstrap` action을 정확히 한 번 호출하고 API `2.7`, DB `375`, batch contract `375`를 검증한다.
- Edge v20은 KWS 세션을 한 번 검증한 뒤 service-role 전용 `kinojo_member_image_batch_bootstrap_v375(text)` RPC를 한 번 호출한다. RPC는 소유 캐릭터 목록과 각 캐릭터의 프로필 override/공식 이미지 상태, FRONT/BACK/UPPER_BODY 비공개 참고 이미지 등록 metadata를 한 번에 반환한다.
- 브라우저는 반환된 모든 캐릭터 상태를 cache에 채우므로 캐릭터 전환 시 추가 profile/reference 요청을 보내지 않는다. 비공개 참고 이미지의 object path와 signed URL은 bootstrap 응답에 포함하지 않는다.
- 운영 인증 readback은 7개 소유 캐릭터와 7개 이미지 상태를 HTTP 200으로 확인했고, 임시 검증 세션은 즉시 폐기했다. Health는 `ONE_EDGE_REQUEST_ONE_RPC`를 반환한다.
- C-1은 선택 이미지 preload, 다음 이미지 preload, 나머지 2개 단위 background loading, 캐릭터별 retry를 구현하지 않는다. 이 범위는 C-2가 소유한다.
- PR CI와 운영 workflow가 성공했다: Pages/live readback `32451957817`, Pages build/deploy `32451957234`, Legion Tree `32451957839`, Character Refresh Profile `32451957849`.

## C-2 프로필 이미지 선로딩 / 백그라운드 / 재시도

- C-2는 PR `#175`, 운영 commit `b97d598375400d7eaac9986a6a70a9f533ddb126`으로 반영됐다.
- `ui/kinojo-my-info-image-preloader.js`가 C-1 batch cache의 실제 유효 프로필 이미지 URL만 읽는다. 선택 캐릭터와 순서상 다음 캐릭터의 이미지가 성공 또는 실패로 settle된 뒤 모달을 연다.
- 모달이 열린 뒤 남은 idle 이미지만 고정 동시성 2로 백그라운드 준비한다. 한 캐릭터의 실패는 다른 캐릭터나 모달 표시를 막지 않고, 실패한 캐릭터에만 개별 재시도 버튼을 노출한다.
- URL은 HTTP(S)만 허용하고, 준비 완료 전에는 현재 이미지 `<img>`에 URL을 넣지 않는다. FRONT/BACK/UPPER_BODY 참고 이미지는 기존처럼 비공개 등록 metadata만 사용하며 C-2 Signed URL을 만들지 않는다.
- 고정 300ms 모달 지연을 제거하고 실제 초기 이미지 gate로 교체했다. 프로필 업로드·공식 이미지 복원 뒤에도 해당 캐릭터의 새 유효 URL만 다시 준비한다.
- PR workflow의 KINOJO Pages, Character Refresh Profile, Legion Tree 검증과 로컬 Node 계약·브라우저 동작 검증이 통과했다. Supabase Edge v20/API 2.7/DB375, SQL375, Storage 상태는 변경하지 않았다.

## D-1 캐릭터명 기준 가변 패널 너비

- D-1은 PR `#179`, 운영 commit `11ca4c071d8c3d7dbf90aa374d681db0ec212ce4`로 반영됐다.
- PC 우측 내 정보 패널만 C-1 캐릭터 목록의 가장 긴 이름을 한 번 측정해 `352~420px` 범위로 정한다. 같은 이름 목록을 다시 렌더링할 때는 측정값을 재사용한다.
- 모바일 라우트와 `760px` 이하 viewport는 기존 `width: 100%`를 유지한다. 중앙 이미지 관리 모달은 이름 기반 패널 너비 변수를 사용하지 않는다.
- 실제 브라우저에서 짧은 이름 `352px`, 중간 이름 `360px`, 긴 이름 상한 `420px`, 모바일 라우트 전체 폭을 확인했다. 전체 Node 계약 테스트와 PR workflow 3종이 통과했다.
- D-1은 WEB 표시 계약만 변경했다. Supabase Edge v20/API 2.7/DB375, SQL375, Storage 및 기존 Stage 1-8 계약은 변경하지 않았다.

## D-2 잘림 없는 반응형 배치

- D-2는 PR `#192`, 운영 commit `b7132f365e4b49cae8b5f84cbb1e609571de1920`으로 반영됐다.
- D-1의 PC 패널 `352~420px` 측정값은 유지한다. 가장 긴 이름의 계산 폭이 `420px` 상한을 넘을 때만 `data-panel-layout="stacked"`를 적용해 이름과 스탯을 두 줄 배치하고, 같은 이름 목록의 캐시 경로에서도 배치 상태를 재사용한다.
- `420px` 이하 화면은 캐릭터명을 생략하지 않고 필요한 만큼 줄바꿈한다. 이미지 관리 모달은 내부 그리드를 `minmax(0,1fr)`로 제한하고 캐릭터명·파일명·상태·버튼 문구·참고 이미지 문구를 줄바꿈한다.
- 캐릭터 선택 띠의 의도된 가로 스크롤과 모달의 세로 스크롤은 유지한다. 실제 브라우저 `1280px` PC, `390x844`, `320x800`, `844x390`에서 문서와 모달의 가로 overflow `0`을 확인했다.
- `tests/my-info-responsive-layout.test.js`와 PR workflow 3종이 통과했다. Supabase Edge v20/API 2.7/DB375, SQL375, Storage 및 기존 Stage 1-8 계약은 변경하지 않았다.

## E-1 회귀 / 접근성 / 시각 검증

- E-1은 PR `#194`, 운영 commit `640b7eebcef1c13b0516fe2cd020df870bc23752`로 반영됐다.
- 우측 내 정보 패널과 중앙 이미지 관리 모달은 열릴 때 닫기 버튼으로 초점을 옮기고, Tab/Shift+Tab을 내부에서 순환하며, Escape·닫기 뒤에는 호출 버튼으로 초점을 돌려준다.
- 패널·모달의 대화상자 이름과 설명, 비동기 상태 영역, 참고 이미지 3종 그룹 이름을 보조기기에 노출한다. 닫기·캐릭터 선택·업로드 계열 조작부는 최소 `44px`, 보조 문구는 AA 대비를 유지하고 forced colors·reduced motion 규칙을 제공한다.
- 실제 시각 검증에서 계산값 안에 있던 긴 캐릭터명의 잔여 말줄임을 감지해 stacked 배치로 전환하고, 모바일 이미지 편집기의 프레임이 축소된 grid row 밖으로 잘리던 문제를 별도 스크롤 행으로 수정했다.
- `tests/my-info-e1-harness.html`과 기존 편집기 harness로 `1280x900`, `390x844`, `320x800`, `844x390`을 확인했다. 문서·패널·모달의 가로 overflow는 `0`, 주요 조작부는 `44px` 이상이며, 3종 촬영 안내와 FRONT `800x1200 image/webp` 결과 생성을 재확인했다.
- `tests/my-info-e1-accessibility.test.js`를 GitHub workflow에 추가했고 전체 Node 계약 `21/21`과 PR workflow 3종이 통과했다. Supabase Edge v20/API 2.7/DB375, SQL375, Storage 및 기존 Stage 1-8 계약은 변경하지 않았다.

## E-2 배포 / live / Drive / Supabase 마감

- 제품 운영 기준은 PR `#194`, commit `640b7eebcef1c13b0516fe2cd020df870bc23752`, merge commit `4b2901dfb9a4486c333729aeaaf9b3f6f1a99348`다. E-2에서 제품 코드와 Supabase 운영 구성을 변경하지 않았다.
- 로컬 `main`과 `origin/main` 일치, 전체 Node 계약 `21/21`, GitHub Pages 배포 성공과 `kinojo/live-readback` 성공을 확인했다. 제품 merge SHA의 내 정보 관련 공개 파일 `25/25`가 `kinojo.info`의 Git blob과 일치한다.
- 실서비스 harness에서 패널 Tab/Shift+Tab 순환, Escape 후 호출 버튼 초점 복귀, 3종 촬영 안내와 가이드 에셋, KINOJO 공통 슬라이더, 최소 `44px` 조작부, 가로 overflow `0`, FRONT `800x1200 image/webp` 결과를 재확인했다.
- Google Drive `01_WEB/GitHub_Pages`의 E-1 변경 manifest는 병합 로컬 바이트와 크기·SHA-256이 `26/26` 일치한다.
- Supabase `kinojo-production`은 `ACTIVE_HEALTHY`, Postgres `17.6.1.127`이다. `kinojo-member-profile` v20/API2.7/DB375 health, profile 공개/reference 비공개 5MiB 이미지 버킷, metadata/object 무결성, service-role 전용 이미지 RPC, 15분 cleanup cron, 활성 test-like 세션 `0`을 확인했다.
- 내 정보 후속 A-1~E-2는 `12/12` 완료됐으며 남은 후속 작업은 없다.

## 성역 Fold 도구 / 포스 제외 후속

- Fold 펼침 폭 `761~1180px`에서 성역 일정과 3개 요약 카드가 한 줄을 유지하도록 attached subbar 그리드를 재구성했다. `390px` 전화 폭에서는 기존 일정 축약 규칙을 유지한다.
- 본문 `공략 팁`·`성역 정보 수정`·`포스 편집하기` 버튼은 한 줄 액션 그룹으로 묶고, 탑바와 중복되던 본문 `마지막 시트 동기화` 카드는 제거했다.
- 포스 편집 모달의 `최신 정보`·`취소`·`저장`은 잠금 유지 상태 영역으로 이동했고 별도 하단 footer와 `닫기` 버튼은 제거했다. 닫기는 기존 우상단 X와 바깥 영역 동작이 소유한다.
- 캐릭터 카드를 클릭하면 선택 테두리와 우상단 `제외` 버튼이 나타난다. 제외는 기존 `DRAFT_SAVE` 변경 목록에 빈 슬롯으로 담기며, 저장 전에는 `취소`로 원복된다. Server·Supabase 계약은 변경하지 않았다.

## 검증 / 다음 행동

- 계약 검증: `node tests/my-info-image-contract.test.js`
- 가이드 자산 검증: `node tests/my-info-guide-assets.test.js`
- 공통 슬라이더 검증: `node tests/kinojo-range-control.test.js`
- 편집기 기본 검증: `node tests/my-info-image-editor.test.js`
- 안전 업로드 검증: `node tests/my-info-image-upload.test.js`
- 배치 bootstrap 검증: `node tests/my-info-batch-bootstrap.test.js`
- 프로필 이미지 선로딩 검증: `node tests/my-info-image-preloader.test.js`
- 가변 패널 너비 검증: `node tests/my-info-panel-width.test.js`
- 잘림 없는 반응형 배치 검증: `node tests/my-info-responsive-layout.test.js`
- 회귀·접근성·시각 계약 검증: `node tests/my-info-e1-accessibility.test.js`
- 성역 이전 회귀: `node tests/sanctuary-roster-quick-edit-contract.test.js`
- 공통 회귀: `node tests/web-shell-auth-contract.test.js`
- 레기온 순위 UI 회귀: `node tests/ranking-ui-contract.test.js`
- GitHub workflow는 공통 슬라이더·이미지 편집기·안전 업로드·배치 bootstrap·프로필 이미지 preloader·가변 패널 너비·잘림 없는 반응형 배치·E-1 접근성 회귀의 구문 검사, 계약 테스트, Pages exact live readback을 포함한다.
- 내 정보 후속 A-1~E-2는 모두 완료됐다. 다음 작업은 없다.

## 배너 관리자 리디자인 · Stage 0~5 현재 기준

- Stage 0~5 제품 기준은 PR `#241`, `#242`, `#244`, `#245`, `#246`, `#248`, `#250`, 게시 hotfix `#252`이며, 현재 제품 main은 merge `c1536603d19dfb69932b98ac18fd50022e47d1ce`다.
- 관리자 이미지 관리에는 메인/사이드 배너별 5단계 작성 흐름이 있다. Stage 1은 Event396 저장 기반, Stage 2는 최대 3장 누적 추가·새 묶음·순서, Stage 3은 좌우 동시/별도·페이지·일정·전환 효과/방향, Stage 4~5는 이미지별 콘텐츠 편집·검토·저장·게시를 소유한다.
- 이미지 라이브러리는 기본 미선택이고 전체 또는 분류 해시태그를 선택해 불러온다. 선택 수는 `N / 3`으로 표시하며 순서는 드래그 앤 드롭과 화살표로 바꾼다. 세로형 이미지는 카드 프레임 안에서 `contain`으로 전신을 표시하고 rollover 확대 미리보기를 제공한다.
- 기존 숫자 우선순위는 노출 횟수를 제어하지 않았으므로 UI에서 제거했다. 새 `기본 | ×1.5 | ×2.0`은 Server playlist 비율로 반영한다. 현재 배너 운영 계약은 API2.1/DB403/Event402/Upload403이다.
- 문구는 이미지 하나당 최대 3개, 꾸밈 콘텐츠는 이모지·이모티콘·스티커·뱃지 합계 최대 3개다. 레이어별 이미지 앞/뒤, 위치, 크기, 회전, 투명도를 설정하며 기본은 이미지 앞이다. 업로드한 꾸밈 에셋은 별도 관리자 라이브러리에서 다른 이미지에 재사용한다.
- 초안에는 원본과 편집 레이어를 유지한다. 전체 게시 시 원본과 콘텐츠를 별도 WebP 배너 한 장으로 합성·업로드·Server 검증하고, 공개 Manifest는 합성본만 반환한다. 합성본이 없거나 편집 뒤 stale이면 게시하지 않는다.
- Stage 5 검토는 메인/사이드와 좌우별 순서·콘텐츠를 요약하고, 고정 초안 저장·전체 게시와 누락 설정 자동 이동·강조를 제공한다. v396 orphan cleanup은 원본·재사용 꾸밈·합성본을 함께 보호한다.
- 사이드 `ALL` 독립 설정은 HOF 오른쪽을 제외한 13개 variant, HOF 단독은 LEFT 1개를 만든다. 좌·우 이미지는 2단계 선택 3장 안에서 별도로 제외·추가·정렬할 수 있다.
- Stage 5 캐시 기준은 `2026082411`이다. 전체 Node 테스트 `35/35`, PR source workflow 4종, 운영 파일 Git blob `4/4`, Edge health/Manifest/security 경계가 통과했다. 업데이트한 Chrome E2E harness는 이번 회차의 localhost URL 정책 때문에 실행하지 못했으므로 PASS로 기록하지 않는다.
- Stage 6에서 DB398과 Edge v16/API2.0을 적용해 합성 업로드 idempotency table check 누락을 수정했다. 관리자 cache `2026082412`는 `이벤트 관리` 탭, 전체 이벤트 검색·상태 필터, 같은 종류 내 목록 정렬, 전체 게시 중지, 이름 확인 영구 삭제를 추가한다. 세부 내용은 `docs/BANNER_EVENT_MANAGER_STAGE6_20260824.md`를 기준으로 한다.
- Stage 7은 이벤트 관리에 공통 `kinojo-filter-switch` 기반 `순차 | 랜덤` 스위치를 추가한다. DB400은 이벤트 그룹을 원본으로 삼아 연결 캠페인 전체에 `ORDERED/RANDOM`을 반영하고, RANDOM 이벤트만 5분 manifest 구간별 안정 해시 순서로 섞는다. 기존 이벤트, legacy 캠페인, 노출빈도는 유지한다. 세부 내용은 `docs/BANNER_EVENT_PLAYBACK_STAGE7_20260825.md`를 기준으로 한다.
- 최초 전체 게시의 합성 업로드 400은 v388 idempotency action 허용 목록에서 새 overlay/composite mutation 4종이 빠진 것이 원인이었다. PR `#252`와 DB397 migration으로 수정했으며 기존 초안은 보존한다.
- 이 절은 과거 Stage 0~5 기준이다. 후속 제품 상태는 아래 2차 1~8단계 절을 따르며 콘텐츠 실제 노출은 Stage 5 합성본으로 완료했다.

## 배너 이미지 관리 2차 · 1단계 페이지 셸·초기화 완료 · 2026-08-26

- 이 절이 위 `Stage 0~5 현재 기준`의 다음 구현 문구보다 최신이다. 2차 계획의 0단계 전역 이벤트 순환 교정 뒤 1단계 `1-가~1-바`를 PR `#260`으로 한 묶음 구현·배포했다. 운영 main은 `983d7d9f73082f6fab8da7efe23b2506ff1e66eb`, 관리자 cache는 `2026082601`이다.
- 메인 배너·사이드 배너·이벤트 관리·향후 이미지 라이브러리 하위 화면명을 공통 관리자 헤더의 `[이미지 관리] - …` 위치 문구로 통일했다. 작성 화면의 대형 이벤트 만들기 카드와 그 안의 새로고침은 제거했다. 기존 `admin-images.js` 위치 라벨 observer가 새 하위 문구를 `[이미지 관리]`로 되돌리지 않도록 계층 문구를 보존한다.
- 단계 지도는 정적 1~4 활성 클래스를 제거하고 실제 입력·게시 검증으로 `현재 / 완료 / 미완료 / 오류`를 계산한다. 필수 선행 입력 없이 뒤 단계를 누르면 필요한 단계로 이동해 오류 안내와 강조를 표시한다. 지도는 관리자 헤더 아래 sticky이며 모바일에서는 설명을 줄이고 가로 스크롤한다.
- 1~5단계 카드는 용도별 데스크톱·태블릿·모바일 최소 높이를 사용하고, 업로드 목록과 이미지 순서 목록은 내부 스크롤로 제한해 데이터 수·오류 문구에 따른 레이아웃 변동을 줄였다.
- 하단 고정 작업 막대에 붉은 계열 보조 동작 `내용 초기화`를 추가했다. 비울 내용이 없으면 비활성화되며, 중앙 확인 모달은 포커스 트랩·Esc·배경 클릭·포커스 복귀를 제공한다. 초기화는 현재 폼과 화면 작성 상태만 비우며 업로드된 라이브러리 자산, 게시 이벤트, 서버 기록은 삭제하지 않는다.
- 전체 게시는 Server 성공만으로 완료 처리하지 않고 `event-list`로 같은 이벤트 식별자의 `PUBLISHED/MIXED` 상태를 다시 확인한다. 확인 성공 시 작성 상태를 1단계로 자동 초기화하고 이벤트 이름·식별자·이벤트 관리 이동 버튼을 표시한다. 게시 또는 재확인 실패 시에는 재시도할 수 있도록 작성 내용을 유지한다.
- 검증은 전체 배너 Node 계약 `16/16`, PR 및 main push의 Banner Admin/Runtime 실제 Chrome E2E, KINOJO Pages, Character Refresh Profile, Pages 배포와 custom-domain live readback이 모두 통과했다. 운영 캐시 우회 읽기에서 PC 관리자 HTML, loader, workflow, bootstrap의 `2026082601` 계약을 다시 확인했다.
- 이번 1단계는 WEB 관리자 UI와 테스트만 변경했다. Supabase DB/RPC/Edge/Storage, 현재 정식 이벤트·레거시 캠페인·전역 순환 모드와 운영 게시 데이터는 변경하지 않았다.
- 다음 제품 구현은 2차 계획 2단계 `저장 이미지 제목·해시태그`이며, 시작 전 main·Drive 전용 LOG·운영 상태를 다시 읽는다.

## 배너 이미지 관리 2차 · 2단계 저장 제목·해시태그 완료 · 2026-08-26

- 2차 계획 2단계 `2-가~2-마`는 PR `#262`로 한 묶음 구현·배포했다. 운영 main은 `9d0a5bc014109274b323adf8f24886e4c6e5b195`, 관리자 cache는 `2026082602`, 운영 `kinojo-banner-media`는 v20(API 2.1 / DB 403 / Upload 403 / Event 402)이다. 누적 진행도는 **17/49**다.
- `kinojo_banner_assets`의 canonical 관리 메타데이터는 `title`과 `tags text[]`다. `display_name`은 과거 화면·RPC 호환용 표시 필드로 유지하고, 구형 insert/update가 들어오면 v403 호환 트리거가 제목·태그를 채운다. 새 RPC는 제목·태그를 저장하면서 호환 표시 이름도 함께 갱신한다.
- 기존 운영 이미지 26개를 무삭제 이전했다. `#태그 · 제목` 패턴 24개는 `AUTO_SPLIT`, 일반 이름 2개는 `PRESERVED`로 기록됐으며 이전 직후 빈/무효 메타데이터 0건, 대소문자·공백 정규화 중복 제목 0건이다. 모호한 과거 데이터는 원문을 버리지 않고 `REVIEW_REQUIRED_DUPLICATE` 경로로 보존한다.
- 제목은 이미지 추가 카드마다 `저장 이미지 제목`으로 입력한다. 파일명 stem을 기본값으로 사용하고, 현재 추가 목록과 라이브러리의 중복을 즉시 표시하며 `asset-title-check` Server 사전 확인과 업로드 직전 강제 재확인을 모두 거친다. DB unique expression index가 동시 요청 경쟁의 최종 권한이며 `BANNER_ASSET_TITLE_DUPLICATE`를 안정적으로 반환한다. 중복 경쟁으로 실패한 새 Storage 후보는 Edge가 즉시 삭제한다.
- 분류 해시태그는 선택 이미지에 공통 적용하는 최대 5개 배지 입력이다. Enter·쉼표·붙여넣기·한글 IME 조합·빈 입력 Backspace·개별 제거를 지원하고 `N / 5`와 제한 오류를 표시한다. 태그당 20자, 허용 문자, 대소문자 중복 제거 규칙은 WEB·Edge·DB가 함께 검증한다.
- 이미지 목록 API는 구조화된 `title/tags/metadataMigrationStatus`를 반환한다. 라이브러리는 계속 기본 `미선택`이며 `전체` 또는 Server 태그 배열에서 만든 필터만 펼친다. 화면 이름은 canonical title을 우선 사용하고 과거 응답에만 `displayName` fallback을 사용한다.
- 보안 경계는 기존 MASTER KWS를 재사용한다. v403 RPC는 `service_role`만 실행할 수 있고 public/anon/authenticated 권한은 철회했으며 `kinojo_banner_assets` RLS는 활성 상태다. 정책 없음 advisor는 직접 테이블 접근을 닫는 의도된 service-role-only 구조이고, 새 태그 GIN의 미사용 표시는 배포 직후라 정상이다. 기존 FK 인덱스 advisor는 이번 단계와 무관한 선행 상태다.
- 검증은 전체 banner Node 계약, 신규 v403 메타데이터 계약, 실제 Chrome 관리자 E2E, PR source CI 4종, main Pages 배포, Banner Admin byte readback, Banner Runtime Manifest ETag·PC SIDE·모바일 MAIN live 회귀를 통과했다. 로그인된 운영 Chrome에서 메인 2개·사이드 24개의 canonical 제목, 사이드 `#남/#룩북/#샤르/#여/#SITTING` 필터, 콘솔 오류 0건을 읽기 전용으로 확인했다.
- 다음 제품 구현은 2차 계획 **3단계**다. 2단계 DB/API/UI를 재작성하지 않고 운영 main·Drive 전용 LOG를 기준으로 이어간다.

## 배너 이미지 관리 2차 · 3단계 미리보기·카드·순서 UX 완료 · 2026-08-26

- 2차 계획 3단계 `3-가~3-라`는 PR `#264`로 한 묶음 구현·배포했다. 운영 main은 `83f981e5af8dd8cbc528f1040726ecf53f0a329c`, 관리자 cache는 `2026082603`, 누적 진행도는 **21/49**다.
- 업로드·라이브러리·이미지 순서·좌우별 순서의 미리보기를 공통 버튼으로 통일했다. 긴 세로 이미지는 고정된 작은 창에서 상단~중간을 빠르게 확인하고, `전체 보기`를 누르면 원본 전체를 `contain`으로 보여 주는 접근 가능한 모달을 연다. 모달은 초점 이동·Tab 순환·Escape·배경 클릭·호출 버튼 초점 복귀를 지원한다.
- 이미지 라이브러리 카드는 canonical 저장 제목을 최대 두 줄로 표시하고, 그 아래 구조화 해시태그를 세로로 최대 3개 표시한다. 나머지는 `+N`으로 축약하며 보조기기에는 전체 태그 수와 초과 개수를 전달한다. 라이브러리 기본 `미선택`과 전체/태그 필터 계약은 유지한다.
- 이미지 순서 카드는 드래그 시작 시 들림·그림자·확대를 표시하고, 대상 카드 위·아래 절반에 맞춰 삽입선을 보여 준다. 놓은 뒤에는 이동 카드 강조와 FLIP 전환을 제공한다. `prefers-reduced-motion` 환경에서는 이동 애니메이션을 생략하고 정적 강조와 `aria-live` 문장으로 결과를 알린다.
- 순서 조작은 카드 오른쪽의 확대된 `↑ / × / ↓` 세로 버튼으로 통일했다. 버튼마다 이미지 제목을 포함한 한국어 접근성 라벨을 붙였고, 카드 자체에서 `Alt+↑/↓` 이동과 `Delete/Backspace` 제거를 지원한다. 이동·제거 뒤에는 새 위치 또는 제거 결과를 음성 안내하고 다음 조작 대상으로 초점을 복원한다.
- 신규 `banner-event-phase2-stage3-preview-order-contract`와 Chrome 관리자 E2E에 긴 이미지 창/전체 모달, 태그 3개+`+N`, 세로 버튼, 키보드 이동·제거, 드래그 들림·삽입선 계약을 추가했다. 로컬 Node 계약과 headless Chrome E2E가 통과했다.
- PR과 main push의 Banner Admin, Banner Runtime, KINOJO Pages, Character Refresh Profile, Pages 배포가 모두 성공했다. Banner Admin 운영 byte readback과 Banner Runtime의 Manifest ETag·PC SIDE·모바일 MAIN live Chrome 검증도 merge commit 기준으로 통과했다.
- 재시작 뒤 인앱 브라우저에는 KINOJO 관리자 인증 세션이 없어 운영 관리자 화면은 로그인 안내로 닫혔고, 연결 가능한 외부 Chrome 세션도 없었다. 인증을 우회하거나 운영 데이터를 변경하지 않았으며, 실제 UI 동작은 동일 소스를 사용하는 Chrome E2E와 운영 exact byte readback으로 검증했다.
- 이번 3단계는 WEB 관리자 UI·테스트·검증 workflow만 변경했다. DB/RPC/Edge/Storage, 정식 이벤트·레거시 캠페인·전역 순환 모드와 운영 게시 데이터는 변경하지 않았다.
- 다음 제품 구현은 2차 계획 **4단계**다. 3단계 미리보기·카드·순서 계약을 재작성하지 않고 운영 main과 Drive 전용 LOG를 기준으로 이어간다.

## 배너 이미지 관리 2차 · 4단계 노출 페이지 다중 선택 완료 · 2026-08-26

- 2차 계획 4단계 `4-가~4-라`는 PR `#269`로 한 묶음 구현·배포했다. 운영 merge는 `d953a12acbd3afdb042f7e464abd7eec2d2d05da`, 관리자 cache는 `2026082604`, 누적 진행도는 **25/49**다.
- 노출 페이지 목록과 좌우 슬롯은 더 이상 WEB 하드코딩이 아니다. Server `event-targets` 계약이 홈·명예의 전당·레기온 순위·레기온 트리·키노조 미터·성역 메인·성역 스케줄과 지원 슬롯을 반환하며, 명예의 전당은 왼쪽만 지원한다. 메인 배너는 Server가 지정한 홈 단일 영역으로 고정한다.
- 사이드 배너는 7개 페이지 배지를 기본 미선택으로 시작한다. 여러 페이지를 개별 선택할 수 있고, `개별선택 | 전체선택` 스위치로 서버 지원 전체 페이지를 한 번에 고른다. 전체선택에서 개별선택으로 돌아오면 직전 개별 선택 집합을 복원한다. 모바일 배지는 가로 스크롤하고 데스크톱에서는 줄바꿈한다.
- 선택한 페이지와 각 페이지의 실제 슬롯 조합으로만 variant를 만든다. 예를 들어 홈·명예의 전당·레기온 순위를 좌우 별도로 고르면 홈 2개, 명예의 전당 왼쪽 1개, 레기온 순위 2개로 총 5개다. WEB payload에는 Server 계약 버전과 명시적 `targetPages`를 함께 보내며 DB가 페이지 집합·variant 일치를 최종 검증한다.
- 페이지를 고르지 않은 사이드 이벤트는 빈 variant를 가진 초안으로 저장할 수 있다. 전체 게시는 노출 페이지 누락을 차단하고 3단계 페이지 선택 영역으로 이동해 강조한다. 기존 단일 페이지·`ALL` 이벤트는 운영 호환 backfill로 명시적 페이지 집합을 얻었으며 기존 캠페인·아이템·상태는 변경하지 않았다.
- 운영 migration `20260826051623`과 `kinojo-banner-media` v21(API 2.2 / DB 404 / Event 404 / Upload 403)을 반영했다. 배포 전후 이벤트 그룹 6개, 연결 캠페인 66개, 연결 아이템 183개, 게시 상태 66개가 같고 캠페인 fingerprint `dde978969cf2b0a1994df6bef80b27fa`, 아이템 fingerprint `139eb575ff9eed2b60c394f4a4ec8353`도 일치한다. 기존 공개 Manifest와 전역 순환은 유지한다.
- 전체 Node 배너 계약과 Chrome 관리자 E2E, PR CI 4종, main Pages 배포, Banner Admin byte readback, Banner Runtime Manifest ETag·PC SIDE·모바일 MAIN live 회귀가 통과했다. 로그인된 운영 Chrome에서도 사이드 7개 기본 미선택, 개별 2개 → 전체 7개 → 개별 2개 복원, 메인 홈 고정을 읽기·화면 상태 변경만으로 확인했으며 운영 저장·게시는 실행하지 않았다.
- 다음 제품 구현은 2차 계획 **5단계**다. 4단계의 Server 소유 페이지 계약과 명시적 다중 연결을 재작성하지 않고 운영 main과 Drive 전용 LOG를 기준으로 이어간다.

## 배너 이미지 관리 2차 · 5단계 콘텐츠 편집기 완료 · 2026-08-26

- 2차 계획 5단계 `5-가~5-사`는 PR `#272`로 한 묶음 구현·배포했다. 운영 merge는 `2950d16b34da85ea97a503443dd964b2e03c9b3d`, 관리자 cache는 `2026082606`, 누적 진행도는 **32/49**다.
- 문구·이모지·스티커 레이어의 위치·크기·회전·투명도 조절은 슬라이더와 숫자 직접 입력이 하나의 상태를 공유한다. 숫자 입력은 단위를 분리해 표시하고 허용 범위로 보정하며 빈 값·`NaN`이 미리보기나 저장값으로 전파되지 않는다.
- 이모지는 실제 팝오버로 바꿨다. 기본·최근 사용·검색·직접 입력을 제공하고 방향키·Enter·Escape·바깥 클릭을 지원하며 `aria-expanded`와 초점을 실제 열림 상태에 맞춘다.
- 재사용 꾸밈 자산은 `내 스티커 보관함`에서 등록·조회한다. 등록하면서 현재 이미지에 바로 추가하거나 보관만 할 수 있고, Server 재조회 결과를 정식 상태로 사용한다. 표시 이름은 공백·대소문자를 정규화해 중복을 차단한다.
- 운영 DB에는 `banner_overlay_name_uniqueness_v405`를 적용하고 `kinojo_banner_overlay_asset_register_v405` 실행 권한을 `service_role`로 제한했다. `kinojo-banner-media` v22(API 2.3 / DB 405 / Event 404 / Upload 403)는 Storage 업로드 뒤 DB 등록이 실패하면 새 후보 객체를 즉시 정리하고 `candidateDeleted` 결과를 반환한다.
- 5단계 편집 화면은 원본 이미지, 이미지 뒤 레이어, 이미지, 이미지 앞 레이어를 실제 순서로 합성해 보여 준다. 데스크톱에서는 미리보기를 sticky로 유지하고 모바일에서는 편집 흐름 위에 자연스럽게 쌓이며, 단계 이동 버튼으로 필요한 설정 위치에 접근한다. 최종 검토용 요약과 편집 중 실시간 합성 미리보기는 서로 구분한다.
- 신규 Stage 5 계약, 전체 Node 계약, Deno Edge 구문 검사, 데스크톱·`390×844` Chrome E2E, PR·main의 Banner Admin/Runtime·KINOJO Pages·Character Refresh Profile·Pages 배포가 모두 통과했다. 운영 웹 파일은 merge source와 exact 일치했다.
- 로그인된 운영 관리자에서 기존 이벤트를 읽기 전용으로 불러와 합성 미리보기, 숫자 `41` 입력과 슬라이더·`41px` 반영, `별` 검색 결과 `⭐`, Escape 닫힘, 스티커 등록 폼의 파일 선택 전 비활성 상태를 확인했다. 저장·게시는 실행하지 않고 새로고침으로 로컬 작성 상태를 비웠으며 운영 꾸밈 자산도 등록하지 않았다.
- DB/Edge 반영 전후 이벤트 그룹 6개, 캠페인 74개, 아이템 233개, 게시 캠페인 67개, 꾸밈 자산 0개가 같았다. 캠페인 fingerprint `8f77f2ee6b8548428fc4a8b9a93b69b6`, 아이템 fingerprint `fee5948e8dfe499b2fafc2d2a1e9da51`도 일치한다.
- 다음 제품 구현은 2차 계획 **6단계**다. 5단계의 단일 편집 상태·재사용 보관함·합성 미리보기·Server 무결성 계약을 재작성하지 않고 운영 main과 Drive 전용 LOG를 기준으로 이어간다.

## 배너 이미지 관리 2차 · 6단계 이미지 라이브러리 완료 · 2026-08-26

- 2차 계획 6단계 `6-가~6-마`는 PR `#275`로 한 묶음 구현·배포했다. 운영 merge는 `71a31d6508ea53a5060e239069632ecb9dbe03e1`, 관리자 cache는 `2026082607`, 누적 진행도는 **37/49**다.
- 이미지 관리의 네 번째 하위 탭으로 `이미지 라이브러리`를 신설하고 전용 `admin-banner-library.js` 모듈로 분리했다. 화면은 기본 미선택이며 카드에서 이미지를 고른 경우에만 오른쪽 상세·편집 영역을 연다. 작성 화면의 이미지 선택 캐시와는 `kinojo:banner-assets-updated` 이벤트로 동기화한다.
- 전체 카드, 저장 제목·해시태그 검색, `라이브러리 | 해시태그` 공통 스위치, Server 집계 해시태그 묶음과 필터를 제공한다. 선택 상세는 원본 전신을 `contain`으로 표시하고 원본 파일명·MIME·용량·픽셀·등록 시각·처리 상태를 읽기 전용으로 보여 준다. 현재 정식 이벤트 이름, 연결 캠페인 수, 활성 캠페인 수, 노출 페이지와 좌우 위치도 함께 집계한다.
- 저장 이미지 제목과 분류 해시태그는 라이브러리에서 수정할 수 있다. 해시태그는 추가·제거·순서 변경·최대 5개·정규화 중복 검사를 적용하고, 제목은 Server 중복 확인을 거친다. 실제 변경이 있을 때만 저장 버튼을 활성화하며 저장 성공 후 라이브러리·작성 화면·이벤트 관리가 같은 Server 자산 목록을 다시 읽는다. 원본 파일·Storage 객체·게시 이벤트를 삭제하거나 교체하지 않는다.
- 운영 DB에는 `banner_asset_library_v406`을 적용했다. MASTER 전용 Edge action `asset-library`와 `asset-update`가 private 집계 함수를 호출하며 public RPC 실행 권한은 `service_role`만 가진다. 새 Edge를 만들지 않고 기존 `kinojo-banner-media`를 **REUSE_WITH_DB_MODULE**로 확장해 v23(API 2.4 / DB 406 / Event 404 / Upload 403)으로 배포했다. 배포 뒤 신규 v406 관련 security/performance advisor 경고는 0건이다.
- 전체 Node 테스트 `49/49`와 실제 Chrome E2E를 통과했다. PR 및 main의 Banner Admin, Banner Runtime, Character Refresh Profile, KINOJO Pages, Pages 배포가 모두 성공했고 Banner Admin 운영 exact byte readback과 Banner Runtime Manifest ETag·PC SIDE·모바일 MAIN live 검증도 통과했다.
- 로그인된 운영 관리자에서 이미지 26개, 처리 완료 26개, 연결 사용 중 19개, 해시태그 묶음 5개를 확인했다. 첫 자산의 원본 메타데이터와 정식 이벤트 1개·연결 캠페인 13개·활성 13개·페이지/좌우 사용 현황을 읽기 전용으로 확인했다. 데스크톱과 `390×844`에서 가로 넘침 0, 모바일 1열, 상세 영역 static, 원본 `contain`, console error 0건이다. 운영 자산 메타데이터 저장은 실행하지 않았다.
- DB/Edge 반영 전후 이미지 26개, 캠페인 74개, 아이템 233개, 이벤트 그룹 6개가 같았다. 이번 단계는 관리 메타데이터 조회·수정 경로만 추가했으며 기존 이미지·이벤트·게시 상태를 일괄 변경하지 않았다.
- 다음 제품 구현은 2차 계획 **7단계**다. 6단계의 전용 라이브러리·Server 사용 현황·메타데이터 편집·캐시 갱신 계약을 재작성하지 않고 운영 main과 Drive 전용 LOG를 기준으로 이어간다.

## 배너 이미지 관리 2차 · 7단계 캐릭터 이미지 풀·대표 이미지·자동 순환 완료 · 2026-08-26

- 2차 계획 7단계 `7-가~7-사`는 PR `#277`로 한 묶음 구현·배포했다. 운영 merge는 `275998aee2eb2689a11edea808e22dda5a873913`, 관리자 cache는 `2026082608`, 누적 진행도는 **44/49**다.
- 정식 이벤트 묶음의 선택 상한을 99장으로 확장했다. 작성·순서·검토 목록은 24장 단위 창 렌더링과 지연 썸네일을 사용하고, Server `event-save`도 variant당 99장을 초과하면 거부한다. 업로드 입력은 기존 요구대로 한 번에 3장까지 유지한다.
- 배너 자산은 캐릭터 이름 문자열이 아니라 `character_master.id`에 연결한다. 업로드 카드에서 검색 결과의 서버·종족·직업과 동명이인 수를 확인해 선택하며, 연결하지 않을 때는 명시적 확인이 필요하다. 운영 기준 동명이인 `조각칼`은 활성 CURRENT 2명·서버 2개로 분리 조회된다.
- 이미지 라이브러리에 캐릭터 연결/미연결/대표 이미지만 필터, 이름 검색, 연결 변경·해제와 배너 형식별 대표 이미지 지정·교체·해제를 추가했다. 대표 이미지는 캐릭터·형식 조합마다 한 장만 존재하도록 Server 원자 저장으로 닫는다.
- 같은 라이브러리 탭 아래에 `이벤트 없는 자동 순환 풀`을 추가했다. 기본 OFF이며 관리자가 명시적으로 고른 READY 자산만 최대 99장까지 포함한다. 정식 이벤트가 있으면 자동 풀은 억제되고, 정식 이벤트가 없을 때만 자동 풀 셔플 백을 사용한 뒤 기존 기본 배너로 이어진다.
- 자동 풀은 페이지·슬롯·일정·전환 설정과 선택적 `캐릭터 이름 표시`를 제공한다. 이름 표시는 원본을 바꾸지 않고 정확한 배너 크기의 WebP 파생 합성본을 순차 등록한 뒤에만 활성화할 수 있다. 풀 편집 내용이 저장되지 않았거나 합성본이 누락되면 활성화를 차단한다.
- 운영 DB에는 v407 캐릭터/대표/자동 풀 스키마, v408 정식 이벤트 우선순위 보강, v409 빈 슬롯 활성화 교정, v410 권한·외래키 인덱스 보강을 적용했다. 신규 테이블은 RLS와 직접 DML 회수 상태이고 관리 RPC는 service role 전용이다. 교체된 v407 Manifest의 anon/authenticated 실행 권한도 회수했으며 7단계 관련 security WARN과 미인덱스 외래키는 0건이다.
- 기존 `kinojo-banner-media`를 재사용해 v24(API 2.5 / DB 409 / Event 407 / Upload 403)로 배포했다. health는 variant당 최대 99장과 `SERVER_FORMAL_EVENT_EMPTY_ONLY_EXPLICIT_READY_ASSETS` 권위를 공개하며, 공개 Manifest 외 관리 action은 MASTER KWS 세션을 요구한다.
- 전체 Node 계약 51개와 로컬 Chrome 통합 E2E를 통과했다. PR 및 main의 Banner Admin, Banner Runtime, Character Refresh Profile, KINOJO Pages와 Pages 배포가 성공했고, 운영 byte readback·Manifest ETag·PC SIDE·모바일 MAIN 검증도 통과했다. 로그인된 운영 MASTER Chrome에서도 라이브러리·자동 풀·99장 작성 흐름을 읽기 전용으로 확인했다.
- 운영 UI는 이미지 26·READY 26·이벤트 사용 19·자동 풀 0·캐릭터 연결 0·대표 0을 표시했다. `조각칼` 검색은 챈가룽 천족 호법성 ID 11630과 지켈 마족 살성 ID 14023의 동명이인 2명을 분리했고, 카드·상세 미리보기는 모두 `contain`, 미변경 저장 버튼은 비활성, 메인 작성은 기본 미선택과 `0/99`·24장 분할 안내를 보였다. console error/warn은 0건이며 저장·게시·활성화·삭제는 실행하지 않았다.
- 운영 반영 후 이미지 26개, 캠페인 74개, 아이템 233개, 이벤트 그룹 6개는 그대로다. 자동 풀·캐릭터 연결·대표 지정은 모두 0개로 시작하므로 기존 자산이나 게시 결과를 자동 편입하지 않는다.
- 다음 제품 기준은 아래 7단계 후속과 8단계 완료 절이다. 7단계의 캐릭터 영구 ID·대표 이미지·명시적 READY 자동 풀·정식 이벤트 우선 계약은 유지한다.

## 배너 이미지 관리 2차 · 7단계 후속 이벤트 작업공간 정리 완료 · 2026-08-26

- PR `#279`와 `#280`으로 1차/2차 관리자 탐색 구조를 정리했다. 운영 merge 기준은 `4a37d0f1ee4ac0d22ad6c51dd5e758e2a1ba0b28`과 `4115a439832abe34c88b6274090b97cf38ebfb21`, 관리자 cache는 `2026082610`이다.
- 이미지 관리의 1차 탭은 `메인 배너 | 사이드 배너`, 각 문맥의 2차 메뉴는 `이벤트 관리 | 이미지 라이브러리`다. 이벤트 관리 안에서 상단 제어 카드를 고정하고 아래를 등록 이벤트 3 : 랜덤 이벤트 7로 나눈다. 사이드 문맥은 등록 이벤트를 전체·왼쪽·오른쪽으로 필터링한다.
- 과거 `이벤트 없는 자동 순환 풀`은 `랜덤 이벤트`로 이름과 위치를 바꿨다. 등록 이벤트가 같은 페이지·위치에 있으면 대기하고 `등록 이벤트 → 랜덤 이벤트 → 기본 배너` 순서로 노출한다. 랜덤 이벤트는 전체 페이지 선택, 전체·왼쪽·오른쪽 위치, 카드 클릭 선택, 간결한 캐릭터 이름 합성 제어를 제공한다.
- 운영 `kinojo-banner-media`는 v25(API 2.6 / DB 411 / Event 407 / Upload 403)다. DB411은 랜덤 이벤트 저장 계약과 HOF 오른쪽 입력 허용을 반영하며 공개 Manifest가 지원하지 않는 HOF 오른쪽 슬롯은 자연스럽게 반환하지 않는다.

## 배너 이미지 관리 2차 · 8단계 통합 QA·배포·문서 마감 · 2026-08-28

- 2차 계획 8단계 `8-가~8-마`는 PR `#290`으로 닫는다. 누적 진행도는 **49/49**이며 이후 예정된 제품 단계는 없다. Server/DB/Edge/Storage와 기존 게시 데이터는 변경하지 않고 `kinojo-banner-media` v25(API 2.6 / DB 411 / Event 407 / Upload 403)를 **REUSE_AS_IS** 한다.
- 관리자 loader 기본 세대와 PC·모바일 진입점은 `2026082801`로 맞췄다. 전체 페이지의 공통 `kinojo-supabase-features.js` cache도 `2026082801`로 통일해 관리자만 새 스냅샷을 읽던 분기 상태를 제거했다.
- 신규 Stage 8 통합 계약은 메인/사이드 1차 탭, 이벤트/라이브러리 2차 메뉴, 등록 이벤트 3 : 랜덤 이벤트 7, 사이드 전체·왼쪽·오른쪽 필터, 반응형 1열 전환, 상태 안내·포커스·키보드·reduced-motion 계약을 한 번에 보호한다.
- 실제 Chrome E2E는 MASTER 모의 인증 상태에서 1440×1200, 768×1024, 390×844를 각각 실행한다. 메인/사이드 탭 키보드 전환, 초안 저장과 게시 호출 분리, 게시 뒤 Server 목록 재확인·작성 상태 초기화, 이미지 라이브러리 문맥, 가로 넘침 0을 검증한다.
- Banner Admin workflow는 최신 7단계/8단계 계약을 직접 실행하고 `admin-banner-auto-pool.js`를 custom-domain exact readback 목록에 포함한다. 로컬 기준 배너 계약 `24/24`, 전체 Node 계약 `60/60`, 세 viewport Chrome E2E가 통과했다.
- 롤백은 PR `#290`의 WEB·테스트·workflow 변경만 되돌린다. DB migration·Edge 재배포·운영 이미지/이벤트 변경은 없으므로 Server 데이터 롤백은 필요 없다.

## 배너 이미지 관리 2차 · 11회차 운영 후속 — 홈 MAIN 첫 화면 교정 · 2026-08-28

- 원인은 캐시가 아니라 PC `home.html`과 모바일 `m/index.html`이 SEO·오류 fallback인 `kinojo-og.jpg`를 실제 `<img>`로 즉시 그린 뒤, 비동기 HOME:MAIN Manifest 요청과 첫 이벤트 이미지 preload가 끝나면 Server 이미지로 교체하던 초기 렌더링 순서였다.
- PC·모바일 HOME MAIN은 HTML 파싱 시 `is-manifest-pending`·`aria-busy=true` 상태로 시작하고, inline critical CSS가 fallback 이미지만 숨긴다. 활성 Manifest의 첫 이미지가 설치된 뒤 `onActive`에서 한 번에 공개하며, 비활성 Manifest·네트워크/선로딩 오류·runtime 부재 때는 `deactivate` 또는 `onError`에서 기존 fallback을 공개한다.
- Open Graph·Twitter 메타데이터와 정적 fallback `src`는 유지하고, JavaScript 비활성 환경은 `noscript` 규칙으로 fallback을 계속 표시한다. Server/DB/Edge/Storage와 게시 이벤트 데이터는 변경하지 않는다.
- 전용 first-paint 계약과 PC live E2E를 추가하고 기존 모바일 live E2E의 잘못된 `fallback first paint` 기대를 `hidden pending → Server image` 계약으로 교체했다. Manifest 응답을 2.5초 지연한 실제 Chrome에서 기존 이미지는 숨김, 여름 이미지 설치 뒤 공개를 확인했고 전체 Node 계약 `62/62`를 통과했다.
- Banner Runtime workflow는 PC·모바일 HOME 변경과 신규 계약을 직접 감시하며 Pages 배포 뒤 `home.html`·`m/index.html` exact readback, PC·모바일 delayed Manifest Chrome 검증을 수행한다.

## 배너 이미지 관리 2차 · 12회차 운영 후속 안정화 — 캐릭터 연결·업로드 즉시 동기화 · 2026-08-28

- 이미지 라이브러리의 캐릭터 연결·대표 이미지·랜덤 이벤트 저장이 `BANNER_IDEMPOTENCY_ACTION_INVALID`로 막힌 원인은 DB407에서 ledger CHECK만 확장하고 `kinojo_banner_idempotency_claim_v402`의 action allowlist는 구 DB402 상태로 남긴 계약 불일치였다. 캐시 문제가 아니며 Edge v25가 새 action을 정상 전송해도 DB gate가 실제 mutation 전에 거절했다.
- repo migration `20260828043859_banner_phase2_post_stabilization_v412.sql`과 운영 migration `20260828045730 / banner_phase2_post_stabilization_v412`가 현재 Edge mutation 전체를 allowlist에 동기화했다. 함수 서명·`CLAIMED/REPLAY/IN_PROGRESS` 재시도 계약·고정 search path는 유지하고 `PUBLIC/anon/authenticated` 실행 권한은 차단, `service_role`만 허용한다.
- 운영 `kinojo-banner-media`는 v26 ACTIVE이며 배포 source가 GitHub source와 exact 일치한다. health는 API `2.6`, DB `412`, Event `407`, Upload `403`, `verifyJwt=false` + 기존 KWS MASTER custom auth 경계를 반환한다.
- 이벤트 작성 업로드, legacy 메인 업로드, legacy 사이드 업로드가 성공하면 최신 자산 전체 스냅샷을 `kinojo:banner-assets-updated`로 알린다. 이미지 라이브러리는 자기 저장 알림의 재귀를 무시하고 다른 업로드 스냅샷을 즉시 렌더하므로 페이지 새로고침이나 추가 `asset-library` 요청 없이 새 카드가 표시된다.
- 관리자 loader·PC·모바일 진입점 cache는 `2026082802`다. 신규 계약은 Edge mutation 집합과 DB412 allowlist의 전수 일치, service-role-only ACL, 세 업로드 경로와 라이브러리 구독, cache·CI 포함을 보호한다.
- PR `#295`를 merge commit `f37aaf8ab631c38e0c24a8ea73229b466a3f16c5`로 병합했다. 로컬 Node 계약 `64/64`, 관리자 JavaScript 문법, Chrome E2E와 PR의 Banner Admin/Runtime/Character 검증이 통과했다. main push는 Pages, Banner Admin exact byte readback, Manifest ETag, PC SIDE·모바일 MAIN live Chrome까지 통과했다.
- 운영 advisor의 이번 배너 변경 관련 신규 WARN/ERROR는 없다. 표시된 배너 항목은 기존 default-deny RLS의 정책 없음 INFO와 기존 index INFO이며 이번 함수 allowlist 변경 범위에서 표·정책·index를 임의 변경하지 않았다.
- 로그인된 운영 화면에서 대상 `남 · 남_free_2`와 `남 · 지켈 · 마족 · 마도성 · ID 16`을 재확인했다. 최종 연결 클릭 시점에 기존 MASTER 세션이 만료되어 mutation 결과 확인은 로그인 후 재시도 대상으로 남겼으며, 운영 함수 정의·ACL·Edge source·health와 자동 계약에서는 구 action 차단이 제거된 것을 확인했다.
- 롤백은 Web에서 PR `#295`를 되돌리고, Edge는 v25 source로 재배포하며, DB는 직전 allowlist 함수 정의를 별도 forward migration으로 복원한다. 이미 연결·저장된 운영 데이터는 자동 삭제하지 않는다.

## My Info 2차 · 2단계 회원 제작 요청 UI · 2026-08-26

- 2단계는 PR `#268`로 구현·검증·운영 반영했다.
- 1단계의 DB404와 `image-request-prepare/finalize/state` 계약을 그대로 사용해 회원 My Info 모달에 1~3장 일괄 제작 요청 흐름을 연결했다. 프로필 이미지 기능과 기존 참고 이미지 상태·삭제는 유지하며, 슬롯별 즉시 Server 등록 버튼만 제거했다.
- FRONT/BACK/UPPER_BODY 편집 결과는 전송 전까지 로컬에 staging한다. 0장은 차단하고 1~3장을 허용하며 선택 수를 `N/3`으로 표시한다.
- 스타일은 소년만화, 순정만화, 애니메이션, 실사풍, 직접 요청 5종이다. 추가 요청은 plain text 300자이며 직접 요청은 필수다. 스타일 미선택 시 별도 alertdialog에서 명시적으로 `스타일 없이 업로드`해야 전송한다.
- `ui/kinojo-my-info-image-request.js`가 prepare, signed upload, finalize, state readback을 소유한다. 부분 실패는 finalize하지 않으며 같은 idempotency key와 새 signed URL로 재시도하고 이미 성공한 슬롯은 건너뛴다. private bucket/object path가 응답에 나타나면 fail-closed한다.
- 실제 공통 모달에서 FRONT `800×1200 WebP` 편집, 선택 `1/3`, 미선택 확인, 애니메이션 스타일·요청문, 일괄 전송과 접수 결과를 확인했다. PC와 `390×844` 가로 overflow는 `0`, console error/warn은 `0`이다.
- 전체 Node 계약 테스트가 통과했다. 상세 계약과 검증 기록은 `docs/MY_INFO_PHASE2_STAGE2_MEMBER_UI_20260826.md`를 기준으로 한다.
- Stage 2는 WEB UI·브라우저 클라이언트만 변경하며 Supabase DB/RPC/Edge/Storage/cleanup은 Stage 1 운영 상태를 유지한다. 다음은 3단계 관리자 제작 요청 확인·처리다.

## My Info 2차 · 3단계 관리자 제작 요청 확인·처리 · 2026-08-26

- 3단계는 PR `#271` (`codex/my-page-phase2-admin-20260826`)에서 구현했으며, 운영 migration `20260826055902 member_image_request_admin_workflow_v405`와 `kinojo-member-profile` v24 ACTIVE를 먼저 readback했다.
- 기존 회원별 이미지 목록과 캐릭터 선택 구조를 유지하고, 선택 캐릭터 아래에 최신순 제작 요청 카드만 출력한다. 요청 상세는 카드 한 건을 선택했을 때만 열며 스타일·요청문·실제 첨부 슬롯·보존 상태·감사 이력을 표시한다.
- MASTER 상태 처리는 `SUBMITTED → IN_PROGRESS/REJECTED`, `IN_PROGRESS → COMPLETED/REJECTED`만 허용한다. 동일 상태 재호출은 멱등이며 실제 변경은 MASTER actor로 상태 이력에 남긴다.
- 신규 list/detail/status/asset RPC 4개는 service_role 전용이다. 목록·상세에는 private path나 URL이 없고, 미리보기·다운로드를 누른 순간에만 기존 private Storage에서 최대 60초 signed URL을 발급한다.
- request ID primary key event 표와 finalize trigger가 제작 요청 하나당 관리자 event 하나만 만든다. 공통 알림은 `IMAGE_REQUEST:<requestId>` 하나로 정규화하며 slot별 업로드 알림과 중복시키지 않는다.
- 관리자 모달은 PC 요청 카드 2열·첨부 3열, 모바일 1열과 내부 스크롤을 사용한다. 실제 브라우저 mock에서 선택 전 상세 없음, 선택 후 요청 한 건 상세, `390×844`/`320×700` 가로 overflow 0을 확인했다.
- 신규·기존 Node 회귀, 운영 RLS/ACL/trigger/Edge health, 무인증 401, Supabase advisor를 통과했다. 세부 계약은 `docs/MY_INFO_PHASE2_STAGE3_ADMIN_WORKFLOW_20260826.md`를 기준으로 한다.
- 다음은 4단계 통합 검증·배포·문서 마감이다. 1~3단계의 Server·회원 UI·관리자 처리 계약을 재작성하지 않는다.

<!-- KINOJO_MY_INFO_PHASE2_STAGE4_CLOSEOUT_20260826 -->
## My Info 2차 · 4단계 통합 검증·배포·문서 마감 · 2026-08-26

- PR `#274` (`codex/my-page-phase2-closeout-20260826`)에서 1~3단계의 Server/Storage·회원 요청·MASTER 관리자 처리 계약을 재작성하지 않고 통합 회귀와 운영 readback으로 닫았다.
- 입력 경계 `0/1/2/3/4장`, 스타일 미선택·무효 스타일, 직접 요청 빈 값, 300/301자, 부분 실패·멱등 재시도와 회원 → 관리자 연결을 신규 통합 계약으로 고정했다.
- PC·모바일 개인정보 처리방침은 제작 요청 이미지 7일, 스타일·요청문·상태·감사 메타데이터 최대 30일, MASTER 전용 확인과 60초 signed URL 경계를 동일하게 고지한다. PC 래퍼의 좁은 화면 가로 넘침도 제거했다.
- 운영 Supabase는 DB404/DB405, `kinojo-member-profile` v24, cleanup v6, private bucket, 15분 cron을 유지한다. 요청 테이블 5개 RLS와 service-role-only RPC 11개 ACL, trigger, health 200, 무인증 관리자 401을 readback했다.
- 회원·관리자·개인정보 페이지를 PC/390/320에서 확인했고 가로 overflow와 관리자 console error/warn은 0이다. 전체 Node 계약은 **48/48 PASS**다.
- 상세 근거는 `docs/MY_INFO_PHASE2_STAGE4_CLOSEOUT_20260826.md`를 기준으로 한다. 진행도는 **4/4**, 다음 단계는 없다.
