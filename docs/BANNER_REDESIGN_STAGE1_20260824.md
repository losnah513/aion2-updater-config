# 배너 관리 리디자인 — 1단계 인계

기준일: 2026-08-24 KST
상태: 1단계 데이터·API 기반 완료

## 최종 작업 순서

0. 회원 관리에 캐릭터 이미지 확인 목록과 신청 수 배지 추가 — 완료
1. 이벤트·이미지별 설정 데이터, 관리자 API, 활성 게시물 통합 순환 Manifest — 완료
2. 5단계 작업 흐름, 최대 3장 추가 카드, 새 노출 묶음·순서·태그 UI
3. 이미지 이벤트 설정: 좌우 동시/별도, 노출 조건, 전환 효과·방향
4. 문구 편집: 이미지별 설정 또는 선택 이미지 일괄 적용
5. 좌우·순서·문구 미리보기, 누락 설정 이동·강조, 고정 초안 저장·전체 게시
6. 메인 배너·사이드배너·이벤트 목록 탭, 독립 스크롤 목록, 필터·활성 상태·영구 삭제
7. 실제 전환·문구 렌더링, 반응형·접근성·통합 회귀 검증과 배포

## 1단계 계약

- Migration: `banner_event_text_overlay_v394`
- Edge: `kinojo-banner-media` v11 / API `1.7`
- Event workflow contract: `394`
- Upload contract: `394`
- 기존 legacy 캠페인은 이벤트 그룹으로 자동 변환하거나 상태를 변경하지 않는다.
- 신규 이벤트는 `event-list`, `event-save`, `event-publish` 관리자 액션을 사용한다.
- 이벤트 변형 하나당 이미지는 최대 3장이고 `sortOrder`와 `enabled`를 가진다.
- 좌우 동시는 `SHARED`, 좌우 별도는 `LEFT`와 `RIGHT` 캠페인으로 저장한다.

## 활성 게시물 통합 순환

- 슬롯 하나에서 우선순위 1위 캠페인만 선택하던 방식을 `ALL_ACTIVE`로 변경했다.
- 현재 시간이 노출 일정에 포함되는 모든 `PUBLISHED` 캠페인의 활성 이미지를 한 목록으로 합친다.
- `is_enabled=false`, 일시정지·보관 캠페인, 일정 밖 항목, 준비되지 않은 에셋은 제외한다.
- 정렬은 캠페인 우선순위 → 게시 시각 → 캠페인 → 이미지 순서로 고정한다. 새 게시물이 기존 게시물을 대체하지 않는다.
- 공개 Manifest는 캠페인·아이템·에셋 ID와 Storage object path를 노출하지 않는다.

## 이미지와 문구

- 원본 이미지 비율이 목표 배너와 달라도 등록할 수 있고 표시 시 `COVER`로 맞춘다.
- 업로드 응답은 `aspectMatchesTarget`과 `cropWarning`을 제공해 UI가 잘림 가능성을 안내할 수 있다.
- 문구 설정은 캠페인 전체가 아닌 `kinojo_banner_campaign_items.text_overlay`에 이미지별로 저장한다.
- UI에서는 여러 이미지를 선택한 뒤 동일 설정을 각 이미지에 일괄 적용할 수 있다.
- 설정값: 사용 여부, 문구, 상단·중단·하단, 시스템 산세리프·세리프·라운드, 10–96px, 텍스트·배경색, 배경 농도 0–100, 높이 6–60%.
- 문구 영역 폭은 API에서 항상 `FULL`로 정규화하며 사용자가 다른 폭을 저장할 수 없다.

## 검증

- Migration 전체 DDL transaction dry run: PASS
- Overlay 정상값·잘못된 폭 검증: PASS
- RLS 유지, `anon`·`authenticated` v394 RPC 실행 권한 없음, `service_role`만 실행: PASS
- Edge health: API 1.7 / Event 394 / Upload 394 / ALL_ACTIVE: PASS
- 공개 Manifest readback: HOME LEFT 7장, HOF LEFT 14장 통합 반환 확인
- 공개 Manifest 내부 ID 비노출, 잘못된 관리자 세션 401: PASS
- Local contract test: `node tests/banner-event-stage1-contract.test.js` PASS

문구 UI와 실제 문구 렌더링은 각각 4단계와 7단계에서 구현한다. 1단계에서는 저장·게시·공개 전달 계약까지만 완성했다.
