# KINOJO WEB HANDOFF

기준일: 2026-08-21 KST

## 저장소 / 현재 기준

- GitHub: `losnah513/aion2-updater-config`
- 운영 브랜치: `main`
- 작업 시작 기준 운영 commit: `fd583f1d423b968690caa99c64aa74a5c7a975d0`
- 후속 작업 브랜치: `codex/my-info-modal-followup-b1`
- Google Drive의 `00_README_FIRST.md`, `KINOJO_MASTER_RULES.md`, `KINOJO_WORKFLOW_RULES.md`, `KINOJO_COMPONENT_RULES.md`, 최신 일일 로그를 작업 규칙 원본으로 사용한다.
- GitHub `main`은 WEB 코드 원본이고, 실제 Supabase·GitHub Pages 상태는 운영 원본이다.

## 내 정보 이미지 기존 완료 상태

- 기존 내 정보/캐릭터 이미지 Stage 1-8은 `80/80` 완료 상태이며 재구현하지 않는다.
- 운영 Edge 기준은 `kinojo-member-auth` v2, `kinojo-member-profile` v17, `kinojo-member-image-download` v2, `kinojo-member-image-cleanup` v5다.
- `kinojo-member-profile` 버킷은 공개, `kinojo-member-reference` 버킷은 비공개다.
- 참고 이미지는 최대 7일 보존하며 cleanup cron은 `*/15 * * * *`로 활성화되어 있다.
- 관리자 이미지 SQL 367/371은 `service_role` 전용이다.

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
- `assets/images/my-info/guides/`에 FRONT, BACK, UPPER_BODY용 SVG 3종을 둔다.
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

- `ui/kinojo-my-info-image-editor.js`가 첨부 전 3종 가이드 카드와 공통 편집기 viewport를 소유한다.
- 편집 프레임은 A-1 슬롯 비율에 고정되고 FRONT/BACK/UPPER_BODY에는 A-2 SVG를 overlay한다. PROFILE은 별도 에셋 없이 정사각형 안전 영역만 제공한다.
- 원본은 브라우저 메모리의 object URL 또는 호출자가 제공한 URL로만 표시하며, 닫기·오류 시 편집기가 만든 object URL을 해제한다.
- 사진 이동, 확대, 회전, 초기화와 포인터/터치 drag, Escape 닫기, 포커스 순환·복귀를 제공한다. 확대/회전은 A-3 공통 슬라이더를 사용한다.
- 회전된 프레임의 네 모서리가 원본 밖으로 벗어나지 않도록 최소 cover scale과 이동 범위를 계산한다.
- B-1 확인 결과는 `previewOnly` 구도 상태다. canvas crop, WebP encoding, 품질 경고, Supabase 호출, 기존 Stage 1-8 업로드 교체는 포함하지 않는다.
- `tests/my-info-image-editor-harness.html`에서 3종 촬영 카드와 편집 프레임을 시각 검증한다. 실제 파일 선택 결과와 출력 생성 연결은 B-2에서 진행한다.

## 검증 / 다음 행동

- 계약 검증: `node tests/my-info-image-contract.test.js`
- 가이드 자산 검증: `node tests/my-info-guide-assets.test.js`
- 공통 슬라이더 검증: `node tests/kinojo-range-control.test.js`
- 편집기 기본 검증: `node tests/my-info-image-editor.test.js`
- 성역 이전 회귀: `node tests/sanctuary-roster-quick-edit-contract.test.js`
- 공통 회귀: `node tests/web-shell-auth-contract.test.js`
- GitHub workflow는 공통 슬라이더·이미지 편집기 모듈의 구문 검사, 계약 테스트, Pages exact live readback을 포함한다.
- 다음 작업은 **B-2 크롭/WebP/품질 경고만** 진행한다.
