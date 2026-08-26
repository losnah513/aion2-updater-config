# My Info Phase 2 · Stage 1 Server/Storage Contract

기준일: 2026-08-26 KST
상태: 구현 기준 확정

## 결정

- Edge 책임: `REUSE_WITH_DB_MODULE`
- 기존 호환선: `kinojo-member-profile` API 2.7 / DB375 유지
- 신규 계약: member image request DB404
- 이미지 수: FRONT/BACK/UPPER_BODY 중 중복 없는 1~3개
- 업로드 결과: 기존 편집기의 정확한 WebP 픽셀만 허용
- 스타일: SHONEN_MANGA, ROMANCE_MANGA, ANIMATION, REALISTIC, CUSTOM, null
- 요청문: plain text 최대 300자, CUSTOM일 때 필수
- 보존: signed upload/DRAFT 2시간, 이미지 최대 7일, 요청 metadata 최대 30일
- 제외: 완성본 업로드·전달·프로필 자동 적용

## 요청 수명주기

1. Browser는 현재 KWS 세션, 서버 소유 character ID, idempotency key, 스타일, 요청문, slot별 MIME·size만 보낸다.
2. Edge가 허용값을 검증하고 slot별 무작위 object path를 만든다.
3. DB404 prepare가 소유권을 검증하고 `DRAFT`와 1~3개 item을 원자적으로 저장한다.
4. Edge는 private Storage signed upload URL만 Browser에 반환한다.
5. Browser가 선택한 파일을 모두 올린 뒤 request ID와 같은 idempotency key로 finalize한다.
6. Edge가 DB의 DRAFT를 다시 읽고 각 Storage object의 존재·MIME·size·실제 픽셀을 검증한다.
7. DB404 finalize가 소유권과 기존 활성 reference의 동시 변경을 다시 확인하고 한 트랜잭션에서 `SUBMITTED`로 전환한다.

어느 한 파일이라도 실패하면 7번을 실행하지 않는다. 따라서 일부 업로드 성공을 접수 완료로 표시하지 않으며 기존 활성 reference도 유지한다.

## 멱등성과 동시성

- unique key: `(member_id, idempotency_key)`
- 같은 key와 같은 payload: 기존 request를 반환
- 같은 key와 다른 character/style/note/slot/MIME/size: `REQUEST_IDEMPOTENCY_CONFLICT`
- finalize 재호출: 같은 `SUBMITTED` 결과를 반환하고 상태 이력을 중복 생성하지 않음
- prepare와 finalize 사이 기존 reference 변경: `REQUEST_REFERENCE_CONFLICT`
- character 단위 transaction advisory lock으로 서로 다른 slot을 포함한 두 batch finalize를 직렬화

## 보안

- member ID, Storage bucket/path, MASTER 여부는 Browser 입력으로 받지 않는다.
- prepare 응답은 private object path 필드를 노출하지 않는다.
- service role은 Edge 환경에서만 사용한다.
- private 표 4개는 RLS default-deny, Browser role grant 0이다.
- DB404 RPC는 service_role 전용이며 KWS 세션과 character ownership을 prepare·draft·finalize·state에서 재검증한다.
- 관리자 preview/download는 후속 3단계에서도 기존 MASTER 전용 짧은 signed URL 경계를 재사용한다.

## Cleanup

- abandoned DRAFT object: 생성 후 2시간
- 요청 이미지: 생성 후 최대 7일
- 교체된 legacy reference: 성공한 finalize 뒤 cleanup queue
- 요청 metadata: 30일이 지나고 모든 관련 Storage object 삭제가 확정된 뒤 삭제
- 순서 불변식: `Storage delete success/absent → metadata finalize`
