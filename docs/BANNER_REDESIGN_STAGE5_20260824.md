# 배너 관리 리디자인 — 5단계 인계

기준일: 2026-08-24 KST  
상태: 5단계 검토·저장·게시·콘텐츠 합성 완료

## 제품 기준

- GitHub PR: `#250`
- 제품 merge: `d96dcfca2cccca7083827b1d27d78846165fcba5`
- 관리자 cache generation: `2026082411`
- Supabase project: `josvoltpktvwysrasffq`
- Edge: `kinojo-banner-media` API `1.9`
- DB/Event/Upload contract: `396` / `396` / `394`

## 편집 모델

- 배너 원본 이미지 하나에 문구 레이어를 최대 3개 넣는다.
- 이모지·이모티콘·스티커·뱃지는 합계 최대 3개 넣는다.
- 각 레이어는 이미지 앞/뒤, 위치, 크기, 회전, 투명도를 가진다. 기본값은 이미지 앞이다.
- 문구는 기존 상·중·하, 글꼴, 크기, 글자색, 배경색·농도, 높이, 배너 전체 폭 계약을 유지한다.
- 업로드한 꾸밈 이미지는 재사용 라이브러리 에셋으로 등록해 다른 캐릭터 이미지에도 적용한다.
- 라이브러리 table은 RLS를 켜고 공개 정책을 두지 않는다. 관리자 Server RPC만 읽기·등록을 수행한다.

## 초안과 게시 파일의 분리

초안과 게시 결과는 의도적으로 다르게 보존한다.

1. 초안에는 원본 배너와 편집 가능한 모든 콘텐츠 레이어 설정을 저장한다.
2. 게시 직전에 브라우저 canvas가 뒤 레이어 → 원본 → 앞 레이어 순으로 한 장의 WebP를 만든다.
3. WebP 합성본을 전용 object path에 업로드한다.
4. Server가 업로드 완료와 게시 항목 연결을 검증한다.
5. 공개 Manifest는 합성본 URL만 반환하며 콘텐츠 레이어 배열은 비운다.

이 구조로 실제 배너는 원본·문구·스티커를 따로 내려받거나 따로 렌더링하지 않는다. 네트워크나 렌더링 속도 차이로 일부 콘텐츠만 먼저 뜨는 현상을 피하면서, 관리자는 원본과 레이어를 유지해 나중에 다시 편집할 수 있다.

## 게시 안전장치

- 콘텐츠가 있는데 합성본이 없으면 게시를 거부한다.
- 레이어를 편집한 뒤 기존 합성본이 stale 상태면 다시 합성하기 전까지 게시를 거부한다.
- v396 orphan 후보 RPC는 원본 배너, 재사용 콘텐츠 에셋, 게시 합성본을 모두 참조 파일로 인정한다.
- 공개 Manifest는 내부 campaign/item/asset ID, object path, 편집 레이어를 노출하지 않는다.
- `anon`·`authenticated`는 overlay table과 관리자 RPC를 직접 실행할 수 없다.

## 5단계 UI

- 메인/사이드 배너와 좌우 동시/별도에 따라 실제 이미지 순서를 검토한다.
- 각 이미지의 문구·꾸밈 콘텐츠와 앞/뒤 배치를 미리 확인한다.
- 본문 우측 하단에 `진행 중인 초안 저장`과 `전체 게시`를 고정한다.
- 필수 설정이 빠진 상태에서 게시하면 해당 단계로 이동하고 누락 영역 테두리를 강조한다.
- 저장은 `event-save`, 게시는 합성본 업로드 완료 후 `event-publish`를 사용한다.

## 운영 적용과 검증

- Migration `20260824110551_banner_content_overlay_library_v396.sql` 적용 완료.
- Migration `20260824113811_banner_overlay_orphan_protection_v396.sql` 적용 완료.
- v396 전체 DDL을 실제 운영 schema에서 transaction rollback 검증한 뒤 적용했다.
- Edge health: API1.9 / DB396 / Event396 / Upload394 / `FLATTENED_COMPOSITE_WHEN_CONTENT_EXISTS`.
- 공개 Manifest HOME:MAIN: HTTP 정상, DB396, 기존 playlist 1개 유지.
- 신규 overlay RLS, table grant, RPC execute 경계 확인 완료.
- 전체 Node 계약 `35/35`, PR source workflow 4종 PASS.
- 운영 `kinojo.info` 관리자 공개 파일 4종은 merge Git blob과 exact-match.
- Browser 도구의 localhost URL 정책 때문에 업데이트한 Chrome E2E harness는 이번 회차에 실행하지 못했다. 이를 Chrome PASS로 기록하지 않는다.

## 다음 단계

- Stage 6: `메인 배너 | 사이드 배너 | 이벤트 목록` 분리, 메인/사이드 이벤트 목록 독립 스크롤, 검색·필터·활성화·영구 삭제.
- Stage 7: 사이트 전환 효과 연결, 최종 반응형·접근성·통합 회귀 검증.
- 문구·스티커 등 콘텐츠의 실제 노출은 Stage 5 합성본 계약으로 완료됐으므로 Stage 7에서 브라우저가 레이어를 다시 합성하지 않는다.
