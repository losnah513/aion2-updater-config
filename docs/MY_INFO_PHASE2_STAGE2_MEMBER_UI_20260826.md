# My Info Phase 2 · Stage 2 Member Request UI

기준일: 2026-08-26 KST  
상태: 운영 반영 완료 (PR #268)

## 범위

- 기존 프로필 이미지 등록·교체·공식 이미지 복원은 변경하지 않는다.
- FRONT/BACK/UPPER_BODY는 슬롯별 편집 결과를 브라우저 메모리에 준비하고 개별 Server 등록 버튼을 제공하지 않는다.
- 편집된 WebP 1~3장, 스타일, 추가 요청을 `이미지 제작 요청 보내기` 한 번으로 전송한다.
- 기존에 활성화된 참고 이미지의 상태 표시와 개별 삭제는 유지한다.

## 회원 흐름

1. 소유 캐릭터를 선택한다.
2. 3개 슬롯 중 필요한 슬롯만 선택해 기존 편집기로 WebP 결과를 만든다. 0장은 차단하고 1장·2장·3장은 허용한다.
3. `소년만화 / 순정만화 / 애니메이션 / 실사풍 / 직접 요청` 중 하나를 고를 수 있다.
4. 추가 요청은 plain text 최대 300자다. `직접 요청`은 빈 요청문을 허용하지 않는다.
5. 스타일을 고르지 않고 전송하면 `요청 스타일을 정하지 않고 이미지만 업로드하시겠습니까?` 확인창에서 명시적으로 계속해야 한다.
6. 성공 시 접수 상태, 스타일, 슬롯, 이미지 만료일, 요청 ID를 표시하고 로컬 staging을 비운다.

## 전송·재시도

- `ui/kinojo-my-info-image-request.js`가 Stage 1의 `image-request-prepare → signed upload 1~3개 → image-request-finalize` 계약을 소유한다.
- Browser 입력은 KWS 세션, 서버 소유 character ID, idempotency key, 스타일·요청문, 슬롯별 MIME·size뿐이다.
- Storage에는 편집된 WebP만 전송하고 원본은 전송하지 않는다. publishable key, `upsert:false`, Server signed URL만 사용한다.
- 부분 실패 전에는 finalize하지 않는다. 같은 화면의 재시도는 동일 idempotency key를 유지하고 새 signed URL을 발급받으며 이미 성공한 슬롯을 건너뛴다.
- finalize 결과가 불명확한 경우 같은 request ID와 key로 다시 확인할 수 있다. Server가 실패 슬롯을 반환하면 그 슬롯만 재전송 대상으로 되돌린다.
- 전송 중 캐릭터 전환, 프로필 조작, 모달 닫기, 중복 전송을 잠근다.
- 응답에 private bucket/object path가 섞이면 fail-closed한다. 회원 상태 응답에는 private path와 signed URL을 보관하거나 표시하지 않는다.

## 접근성·반응형

- 스타일은 native radio group, 요청문은 연결된 label·글자 수·CUSTOM 필수 상태를 사용한다.
- 미선택 확인은 이름·설명이 있는 `alertdialog`, 포커스 이동·Tab 순환·Escape 취소·포커스 복귀를 제공한다.
- 비동기 진행·성공·실패는 atomic polite status로 알린다.
- 데스크톱은 스타일 3열, 좁은 화면은 2열·1열로 줄이고 제출 행을 한 열로 바꾼다.
- 실제 `390×844`에서 document/dialog/request 가로 overflow `0`을 확인했다.

## 검증

- 전체 Node 계약 테스트 통과
- 신규 client 계약: 0장 차단, CUSTOM 필수, canonical 슬롯, private path 거부, 부분 실패 후 동일 key 재시도와 성공 슬롯 skip
- 신규 UI 계약: 5종 스타일, 300자, 전역 버튼, 스타일 미선택 확인, 개별 Server 업로드 제거, PC/mobile CSS
- 실제 공통 모달 브라우저 검증: FRONT `800×1200 WebP` 편집, 선택 `1/3`, 스타일 미선택 alertdialog, 애니메이션 스타일+요청문, signed upload/finalize, 접수 결과
- PC와 `390×844` 시각 검증 및 브라우저 console error/warn `0`

## 운영 영향

- Stage 2는 WEB UI와 브라우저 전송 클라이언트만 변경한다.
- Supabase migration, RPC, Edge function, Storage bucket, cleanup cron은 Stage 1 운영 상태를 그대로 사용한다.
- 다음 단계는 관리자 제작 요청 목록·캐릭터별 상세·private preview/download·처리 상태 UI다.
