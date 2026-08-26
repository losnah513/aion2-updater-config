# My Info Phase 2 · Stage 3 Admin Production Request Workflow

기준일: 2026-08-26 KST  
상태: 운영 DB·Edge 반영 및 소스 검증 완료

## 범위

- 회원 이미지 업로더 목록과 기존 프로필·참고 이미지 확인 흐름은 유지한다.
- 회원을 선택하면 보유 캐릭터 카드를 출력하고, 선택한 캐릭터 한 명의 현재 이미지와 제작 요청 목록만 표시한다.
- 제작 요청 상세는 요청 카드 한 건을 명시적으로 선택한 뒤에만 연다.
- 상세에는 스타일, 요청문, 실제 첨부 슬롯, 이미지 보존 상태, 처리 이력과 현재 상태에서 허용된 관리 작업만 표시한다.
- 완성본 업로드·회원 전달·프로필 자동 적용은 4단계 이후 별도 결정 전까지 포함하지 않는다.

## 운영 계약

- GitHub: PR `#271` (`codex/my-page-phase2-admin-20260826`)
- Supabase migration: `20260826055902 / member_image_request_admin_workflow_v405`
- 저장소 migration source: `supabase/migrations/20260826053325_member_image_request_admin_workflow_v405.sql`
- Edge: `kinojo-member-profile` v24 ACTIVE, API 2.7 유지, admin image request contract 405 추가
- 신규 DB RPC 4개는 `service_role` 전용이다.
  - `kinojo_admin_member_image_request_list_v405`
  - `kinojo_admin_member_image_request_detail_v405`
  - `kinojo_admin_member_image_request_status_v405`
  - `kinojo_admin_member_image_request_asset_v405`
- 요청 event 표는 private/RLS default-deny이며 Browser role에 직접 표·RPC 권한이 없다.
- 운영 readback 당시 request/item/history/event row는 모두 0이다.

## 상태와 감사 이력

- `SUBMITTED → IN_PROGRESS | REJECTED`
- `IN_PROGRESS → COMPLETED | REJECTED`
- `COMPLETED`, `REJECTED`는 종료 상태다.
- 같은 상태 재호출은 멱등 처리하고 상태 이력을 중복 생성하지 않는다.
- 실제 상태 변경은 `actor_kind=MASTER`와 MASTER 회원 ID를 감사 이력에 남긴다.
- SUBMITTED 전환 trigger는 request ID를 primary key로 하는 관리자 event를 `ON CONFLICT DO NOTHING`으로 한 번만 생성한다.

## Storage·보안

- 목록과 상세 응답은 private Storage bucket/object path와 signed URL을 포함하지 않는다.
- 첨부 이미지 버튼을 누른 시점에만 Edge가 request/member/character/slot 결합을 다시 검증한다.
- 미리보기는 최대 60초의 inline signed URL, 다운로드는 안전한 파일명이 결합된 명시적 attachment signed URL이다.
- Browser는 Supabase origin, signed-object 경로, token, download 파일명을 검증하고 하나라도 다르면 fail-closed한다.
- 무인증 관리자 요청 action은 운영 smoke test에서 `401 SESSION_TOKEN_INVALID`로 닫혔다.

## 관리자 UI와 알림

- 캐릭터 변경 시 이전 request list/detail/asset 응답을 request ID race guard로 폐기한다.
- 요청 목록은 최신순 2열 카드이며 모바일에서는 1열이다. 선택 전 detail DOM은 생성하지 않는다.
- 상세 첨부는 PC 3열, 모바일 1열이며 실제 요청에 포함된 1~3개 슬롯만 렌더한다.
- 상태 버튼은 Server가 반환한 `allowedNextStatuses`만 만든다.
- 공통 관리자 알림은 request ID 단위 `IMAGE_REQUEST:<id>` event 하나만 큐에 넣는다. 기존 slot별 이미지 업로드 알림과 중복되지 않는다.
- 관리자 nav badge는 일반 이미지 미확인 수와 진행 중 제작 요청 수를 함께 반영한다.

## 검증

- 신규 Stage 3 계약과 기존 My Info·관리자·알림·배너 회귀 Node 테스트가 통과했다.
- 인앱 브라우저 mock smoke에서 캐릭터 → 요청 카드 2건 → 선택한 요청 #501 상세만 출력되는 것을 확인했다.
- `390×844`에서 page width `390/390`, modal width `374`, 내부 body `overflow-y:auto`를 확인했다.
- `320×700`에서 page width `320/320`, modal width `304`로 가로 overflow가 없었다.
- 운영 migration, RLS, trigger 1개, RPC ACL, Edge v24/health 405를 readback했다.
- Supabase security/performance advisor에는 이번 Stage 3 관련 경고가 없다.

## 다음 단계

- 4단계 통합 검증·배포·문서 마감에서 회원 요청, 관리자 처리, 알림, 보존·cleanup을 한 흐름으로 최종 확인한다.
