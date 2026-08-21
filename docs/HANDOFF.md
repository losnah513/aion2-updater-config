# KINOJO WEB HANDOFF

기준일: 2026-08-21 KST

## 저장소 / 현재 기준

- GitHub: `losnah513/aion2-updater-config`
- 운영 브랜치: `main`
- 작업 시작 기준 운영 commit: `4c5c6ef94bae6109b39a59ed95e5ac61f78a0600`
- 후속 작업 브랜치: `codex/my-info-modal-followup-a2`
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

- `assets/images/my-info/guides/`에 FRONT, BACK, UPPER_BODY용 SVG 3종을 둔다.
- FRONT/BACK은 2:3, UPPER_BODY는 4:5이며 A-1 출력 크기와 같은 viewBox를 사용한다.
- 각 SVG는 화면 문구를 포함하지 않는 독립 실루엣으로, 접근 가능한 title/description과 슬롯 식별자를 제공한다.
- 외부 이미지·폰트·script·embedded raster를 사용하지 않으며 각 파일은 8KiB 이하로 유지한다.
- `ui/kinojo-my-info-image-contract.js`의 `guideAssetPath`가 경로 소유권을 갖고, 실제 첨부 전 카드와 편집기 연결은 B-1에서 진행한다.

## 검증 / 다음 행동

- 계약 검증: `node tests/my-info-image-contract.test.js`
- 가이드 자산 검증: `node tests/my-info-guide-assets.test.js`
- 공통 회귀: `node tests/web-shell-auth-contract.test.js`
- GitHub workflow는 새 계약 모듈의 구문 검사, 계약 테스트, Pages exact live readback을 포함한다.
- 다음 작업은 **A-3 KINOJO 공통 슬라이더만** 진행한다.
