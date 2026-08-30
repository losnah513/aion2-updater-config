# 성역·스케줄 관리 개편 Stage 7 종료·운영·복구 기준

기준일: 2026-08-30 KST
프로젝트 상태: **CLOSED · 59/59**

이 문서는 성역·스케줄 관리 개편 프로젝트의 최종 운영 계약과 장애 대응 경계를 고정한다. 구현 이력은 `docs/HANDOFF.md`와 Drive 프로젝트 LOG를 함께 보되, 현재 성역 운영·복구 판단은 이 문서를 우선한다.

## 1. 종료 기준

- 정식 PC 경로는 `/sanctuary/`, 모바일 경로는 `/m/sanctuary/`다.
- `/sanctuary-management/`와 모바일 대응 경로는 쿼리·해시를 보존해 정식 성역으로 이동한다.
- `/sanctuary-schedule/`와 모바일 대응 경로는 기존 쿼리·해시를 보존하고 `view=schedule`을 추가해 정식 성역으로 이동한다.
- 탑바와 모바일 Drawer의 성역 메뉴는 성역 1~4를 정식 성역 경로로 연다. 별도 `성역 관리`, `성역 일정` 메뉴는 사용하지 않는다.
- 성역 4의 Server 기준 이름은 `비탄의 설원`, 최초 일정 가능일은 `2026-09-09`다.
- 성역 운영 원본은 Server DB다. 성역 전용 Sheet 예약·수동 동기화와 Sheet/roster bridge는 운영 경로가 아니다.
- 활성 계약은 `sanctuary-management` Edge API `1.8` / DB `446`이다. 구 성역 포스 이미지 호환 렌더러는 `sanctuary-copy-render` v20 / DB `447` 읽기 계약을 사용한다.
- Stage 7 전환 run ID 1은 `COMPLETE`, 읽기·쓰기 활성, rollout `OPEN`, Sheet sync 비활성 상태로 종료됐다.

## 2. 운영 도메인 불변식

- 팀 하나가 하나의 일정 단위다. 같은 팀의 모든 포스는 같은 시작 시각과 진행 시간을 공유한다.
- 포스는 최대 9개이며, 포스 하나는 2파티·10슬롯, 파티 하나는 5슬롯이다.
- 한 이용자는 같은 포스에 본캐·부캐를 합쳐 캐릭터 하나만 참가할 수 있다.
- 여러 포스에 지원할 때는 포스마다 서로 다른 소유 캐릭터 하나를 1:1로 배정한다.
- 같은 팀 안의 포스끼리는 일정 충돌로 보지 않는다. 다른 팀의 시간이 겹치면 Server가 소유 캐릭터 관계까지 확인해 충돌을 거부하고 참가 중 캐릭터를 안내한다.
- 일정은 1회 또는 종료일 없는 요일 반복이며, 아이온 주간 경계는 수요일부터 화요일이다.
- 기본 진행 시간은 30분이다. 화면 선택지는 30분·1시간·2시간·무제한이며 팀 생성 이후에도 팀 단위로 해석한다.
- 참여 팀은 `INSTANT`가 기본이며 `APPROVAL`을 선택할 수 있다. 지원·승인·정원·중복 판정의 최종 권위는 Server다.
- 팀 생성자는 여러 포스를 만들고 전체 중 본인 소유 캐릭터 하나 이상만 배치해도 팀을 생성할 수 있다. 빈 슬롯과 불완전 포스는 유효하다.
- 팀 생성자 또는 권한 관리자는 팀을 해산할 수 있다. 해산은 hard delete가 아니라 `ARCHIVED`이며 과거 편성·일정·지원·감사 이력은 보존한다.

## 3. WEB·Server 책임 경계

- Browser는 opaque KWS session을 Edge에 전달한다. service-role RPC, PLAYNC, 폐기된 Sheet bridge를 직접 호출하지 않는다.
- Edge 응답은 DB payload 뒤에 `service`, `apiVersion`, `databaseContract`, `schemaVersion`을 기록해 Edge 소유 계약이 구 wrapper 값에 덮이지 않게 한다.
- 팀 구성 모달의 포스·슬롯·캐릭터 이동은 브라우저 임시 편성안에서 처리하고 사용자가 저장할 때 `SAVE_COMPOSITION` 한 번으로 원자 반영한다.
- 기존 팀 편집은 lease·revision·request key를 사용한다. lease 획득 실패, revision 충돌, 재전송은 Server가 fail-closed로 판정한다.
- 캐릭터 검색은 `이름` 또는 `이름[서버]`를 받고, 이름만 있으면 지켈을 기본값으로 사용한다. 캐릭터 마스터를 먼저 조회하고 정확히 없을 때만 Edge가 공식 조회를 수행한다.
- 운영 레기온 캐릭터는 Server가 MAIN/ALT 관계를 요구한다. 외부 레기온·레기온 없음 캐릭터는 GUEST로만 등록한다.
- raw `ADMIN`은 자동 실화면 검수 전용 등급이다. 권한 판정은 MASTER와 동등하지만 MASTER 외 회원 목록에는 원본 ADMIN 행을 노출하지 않는다. 전용 패스키·세션 원문은 소스, 주석, migration, fixture, LOG, Drive 문서, 채팅에 기록하지 않는다.

## 4. 현재 화면 계약

- 운영 팀은 한 번에 1포스를 확대 표시한다. PC 화살표·키보드 방향키와 모바일 좌우 스와이프로 포스를 이동하며 처음·마지막에서 순환하지 않는다.
- 폴라로이드 전환은 약 0.46초이고 `prefers-reduced-motion`에서는 제거한다.
- `전체 포스 보기`는 같은 포스 카드 렌더러를 재사용하며 지원, 포스 이미지 복사, 권한자 편집 진입을 그대로 제공한다.
- 팀·포스 이미지 복사는 신규 레이아웃을 다시 만들지 않고 기존 736px 포스 카드 렌더러의 2파티×5슬롯, 클래스 아이콘, 본캐·부캐, 전투력, 빈 슬롯 문구를 유지한다.
- 레이아웃 변경은 PC·태블릿·390px·320px·모바일 가로 화면에서 가로 overflow 0을 확인한다. 필요한 세로 overflow는 스크롤바를 숨기고 하단 흐림으로 알리며, 조작 영역과 focus 흐름을 유지한다.

## 5. 일상 운영 점검

1. 정식 경로와 호환 redirect가 쿼리·해시를 보존하는지 확인한다.
2. bootstrap의 API/DB 값, `readEnabled`, `globalWriteEnabled`, rollout, transition 상태를 확인한다.
3. 팀 생성·편집·지원·승인·해산 실패 시 같은 명령을 임의 SQL로 우회하지 말고 Edge 오류 코드, request key, team revision, lease 상태를 먼저 확인한다.
4. 화면은 백그라운드에서 변경 여부만 확인한다. 변경이 있으면 `새로운 내용이 추가되었습니다.` 상태와 수동 새로고침을 제공하고 본문을 임의로 자동 교체하지 않는다.
5. 시트 예약 작업과 두 성역 전용 bridge는 다시 활성화하지 않는다. 공용 lookup Sheet 기능과 혼동하지 않는다.
6. 팀·포스·슬롯·지원·일정 운영 데이터는 장애 분석이라는 이유만으로 직접 수정하거나 삭제하지 않는다. 복구 또는 보정은 별도 승인 범위와 감사 기록을 갖춘 Server 명령으로 수행한다.

## 6. 복구 경계

### WEB 정적 파일

- 화면·정적 자산만의 장애는 마지막 정상 `main` 또는 문제 PR의 직전 커밋으로 WEB 변경만 되돌린다.
- DB migration, Edge Function, 팀·포스·슬롯·지원·일정 데이터는 WEB 롤백에 포함하지 않는다.
- 롤백 뒤 PC·모바일 정식 경로, 호환 redirect, cache key, Pages/custom-domain readback을 다시 검증한다.

### Edge Function

- Edge 장애는 현재 배포 소스와 저장소 source가 일치하는지 먼저 확인한다.
- 구 Edge로 되돌려도 DB 계약이 맞는지 확인해야 하며 API 1.8 소유 필드가 구 DB wrapper에 덮이는 배포는 허용하지 않는다.
- passkey·KWS session·service-role key를 로그나 작업 문서에 출력하지 않는다.

### Stage 7 데이터 복구

- run ID 1의 exact backup은 421행이다. cron 1행, public legacy/일정/동기화 범위 322행, private 신규 팀·슬롯·명령·감사·규칙·버전·lease·설정 범위 99행이다.
- 복구 함수는 `public.kinojo_sanctuary_management_stage7_restore_v446(bigint,text)`이며 `service_role`만 실행할 수 있다. confirmation은 함수가 요구하는 `STAGE7_RESTORE_<run id>` 형식이다.
- 이 함수는 run 1이 백업한 행만 되돌리는 bounded restore다. 전환 완료 뒤 새로 생긴 운영 팀을 자동 삭제하거나 별도 보관하지 않는다.
- 따라서 `COMPLETE` 상태라는 이유만으로 복구를 실행하지 않는다. 실제 장애, 승인자, 대상 범위, 전환 이후 신규 데이터, 복구 후 Sheet cron/rollout 영향, 별도 백업 위치를 먼저 확인한다.
- 실행 전 현재 rollout과 transition readback, 대상 테이블 수치, 신규 팀·포스·일정·지원 ID를 별도 보존한다. 실행 중 신규 쓰기를 막고, 완료 뒤 `RESTORED`·감사 기록·행 수·정식 화면을 검증한다.
- 시트 기반 운영으로 되돌아가는 결정은 단순 기술 롤백이 아니라 별도 운영 전환이다. Stage 7 restore를 시트 재활성화 승인으로 해석하지 않는다.

## 7. 전환·검증 증빙

- 제품 전환 PR: `#328`, `#329`, `#330`, `#337`, `#338`, `#339`.
- 최종 UI 기준 main: `3e8d253e818349357f171ca4b025ca9d10062ae6` 이후 Stage 7-8 종료 문서 커밋.
- 전환 scope hash: `d55690120f1e24e21c5b24981c6b55c9f5820ddcfdd97a226e418272d84b1e1e`.
- 승인 처리 범위: 시험 팀 3개 ARCHIVED, 신규 일정 규칙 3개 STOPPED, legacy 일정·연결 23+23개 canceled, public 점유 슬롯 101개·private 점유 슬롯 6개 초기화, 만료 lease 1개 정리.
- 보존 범위: `sanctuary_master` 4행, 합의한 명령·감사·복구 이력, Stage 7 exact backup.
- 마지막 UI 검수: PC 1440×1100, 모바일 390×844, 단일 포스·전체 포스·지원 복귀·편집 진입, body/dialog 가로 overflow 0, console warning/error 0.
- 마지막 자동 검증 기준: KINOJO Pages Node 계약 49/49, JavaScript syntax, `git diff --check`, PR/main source verify, Pages build/deploy, custom-domain 정적 readback.

## 8. 프로젝트 종료 후 변경 원칙

- 이 프로젝트는 7-8 완료와 함께 종료한다. 미완료 작업은 없다.
- 운영 결함 수정은 해당 결함의 범위·원인·검증·롤백을 별도 LOG 기록으로 남긴다.
- 새로운 성역 규칙, 팀 정책, 일정 화면의 큰 재설계, 시트 재도입은 이 종료 작업을 다시 열지 않고 새 프로젝트 또는 명시적인 후속 계획으로 시작한다.
- 다른 로컬은 작업 전에 Drive의 `00_README_FIRST.md`, 공통 규칙, 최신 `KINOJO_SANCTUARY_RULES.md`, 이 종료 문서, 프로젝트 LOG 최신 항목을 순서대로 읽는다.
