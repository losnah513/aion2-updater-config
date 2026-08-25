# 배너 관리 리디자인 — 7단계 노출 순서

기준일: 2026-08-25 KST
상태: 구현·운영 검증 준비

## 관리자 UI

- 이벤트 관리의 각 정식 이벤트에 `순차 | 랜덤` 전환 스위치를 둔다.
- 스위치는 새 모양을 만들지 않고 공통 `kinojo-filter-switch` 구조와 스타일을 사용한다.
- 왼쪽 라벨은 체크 해제 값 `순차`, 오른쪽 라벨은 체크 값 `랜덤`이다.
- 변경은 이벤트 그룹과 연결된 모든 페이지·좌우 캠페인에 한 번에 적용한다.

## 재생 계약

- 기존 이벤트는 모두 `ORDERED`로 backfill하며 노출 순서를 바꾸지 않는다.
- `RANDOM` 이벤트만 5분 manifest 구간마다 안정적인 해시 순서로 섞는다.
- 같은 manifest 구간에서는 서버·브라우저 캐시가 같은 순서를 받는다.
- 노출빈도 `기본 | ×1.5 | ×2.0`의 항목 수와 캠페인 경계는 유지한다.
- 이벤트 그룹이 없는 legacy 캠페인과 기존 `WEIGHTED` 값은 변경하지 않는다.

## 운영 계약

- Migration: `banner_event_playback_mode_v400`
- DB/Event contract: `400` / `400`
- 관리자 액션: `event-playback`
- RPC: `kinojo_banner_event_playback_v400`
- 공개 manifest RPC: `kinojo_banner_manifest_v400`
- 신규 관리자 RPC execute 권한은 `service_role`에만 있고 `anon`, `authenticated`에는 없다.

## 검증

- `tests/banner-event-playback-v400-contract.test.js`
- `tests/banner-admin-chrome-e2e.html`
- 기존 배너 Stage 1~6와 content overlay, 노출빈도 계약 회귀
- 운영 적용 뒤 event group/campaign 값 일치와 순차·랜덤 manifest 순서 readback
