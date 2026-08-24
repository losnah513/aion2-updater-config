# 배너 관리 리디자인 — 6단계 이벤트 관리

기준일: 2026-08-24 KST  
상태: 운영 DB·Edge 적용, Web 배포 준비

- GitHub PR: `#254`

## 장애 원인과 수정

- 2026-08-24 22:29 KST 사이드 이벤트 `복숭아`의 초안 저장은 성공했다.
- 이어진 합성 이미지 준비 요청은 `private.kinojo_banner_idempotency_v388`의 `kinojo_banner_idempotency_action_v388_chk` 위반으로 HTTP 500이 됐다.
- DB397은 claim RPC의 action 허용 목록만 넓혔고 ledger table의 check constraint에는 `overlay/composite upload` 4종을 추가하지 않아 두 계약이 불일치했다.
- DB398 migration은 table check와 claim RPC를 같은 action 집합으로 맞췄다.
- 기존 이벤트 그룹·캠페인·이미지 설정은 삭제하거나 다시 만들지 않았다.

## 이벤트 관리 탭

- `이미지 관리` 상단에 `메인 배너 | 사이드 배너 | 이벤트 관리` 세 탭을 제공한다.
- 이벤트 관리 탭은 등록 이벤트 전체 수, 게시 포함, 초안, 사이드 이벤트 수를 요약한다.
- 메인/사이드 종류, 상태, 이름·태그 검색으로 목록을 필터링한다.
- 각 항목에서 형태, 대상 페이지, 캠페인·이미지 설정 수, 최근 저장 시각을 확인한다.
- 목록 순서는 같은 배너 종류 안에서 위/아래로 바꾼다. 이 관리 순서는 공개 노출 우선순위와 분리한다.
- 게시 중 이벤트는 전체 게시 중지 후 삭제할 수 있다.
- 영구 삭제는 이벤트 이름 재입력과 최종 확인을 모두 통과해야 하며 event group의 campaign/item만 cascade로 정리한다. 원본 배너 에셋은 삭제하지 않는다.

## 운영 계약

- Supabase project: `josvoltpktvwysrasffq`
- Migration: `banner_event_manager_v398`
- Edge: `kinojo-banner-media` v16 / API `2.0`
- DB/Event/Upload contract: `398` / `398` / `394`
- 신규 RPC: `kinojo_banner_event_list_v398`, `kinojo_banner_event_move_v398`, `kinojo_banner_event_pause_v398`, `kinojo_banner_event_delete_v398`
- 신규 RPC execute 권한은 `service_role`에만 있고 `anon`, `authenticated`에는 없다.

## 적용 직후 데이터 확인

- 이벤트 그룹: 5개 유지
- 각 이벤트의 캠페인: 13개 유지
- 각 이벤트의 이미지 설정: 39개 유지
- 상태: 5개 모두 `DRAFT`
- 관리 순서: 최근 저장 이벤트부터 `5 → 1`로 초기화

## 검증

- 전체 Node contract suite 통과.
- migration 전체를 transaction rollback으로 먼저 검증한 뒤 운영 적용.
- 적용 후 event 수, campaign/item 수, idempotency check action, RPC 권한 readback 확인.
- Edge health readback: API2.0 / DB398 / Event398 / 신규 event action 3종 노출.
- 로컬 `file://` Chrome E2E는 Browser URL 정책으로 실행하지 않았으며 PASS로 기록하지 않는다. Web 배포 후 HTTPS 운영 화면으로 확인한다.

## DB399 — 기존 룩북의 정식 이벤트 편입

- 기존 `푸석사과 룩북` 6개 사이드 캠페인을 `SYNC / SHARED` 이벤트 한 묶음으로 연결한다.
- 기존 `꾸힉 룩북` 6개 사이드 캠페인을 `SYNC / SHARED` 이벤트 한 묶음으로 연결한다.
- 캠페인 상태, 우선순위, 일정, 슬롯, 전환 설정, 항목 순서, 원본·합성 에셋과 수정 시각은 바꾸지 않는다.
- 각 룩북의 페이지 집합과 항목 수를 검사하고 예상 데이터와 다르면 전체 transaction을 중단한다.
- 같은 이름의 정식 이벤트가 이미 정확히 연결된 경우에는 다시 실행해도 변경하지 않는다.
- `꾸힉 룩북`은 기존 캠페인당 이미지가 4개라 현재 신규 이벤트 편집 계약(변형당 최대 3개)으로 다시 게시할 수 없다. 목록 관리·전체 게시 중지·삭제는 가능하며, 재게시하려면 먼저 3개 이하로 정리하거나 별도 계약 변경이 필요하다.
