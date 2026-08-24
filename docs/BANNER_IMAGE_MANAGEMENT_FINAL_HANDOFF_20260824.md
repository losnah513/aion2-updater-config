# KINOJO 배너 이미지 추가·관리 프로젝트 — FINAL HANDOFF

기준일: 2026-08-24 KST
상태: CLOSED · 원본 계획 51/51 완료

## 최종 운영 기준

- 제품 코드 기준 GitHub main: `afb6c5f13cfcece3e1859179a2d678c08277d799` (PR #225, mobile MAIN live Manifest settlement 보강).
- 11-라의 이 문서는 docs-only closeout이며 배너 제품 HTML/CSS/JS, DB/RPC, Edge, Storage, Seed/Campaign 계약을 변경하지 않는다.
- `kinojo/live-readback` run `32679813686`: success.
- `kinojo/banner-runtime-live-readback` run `32679813695`: success.
- Admin Chrome lifecycle, deployed byte readback, Manifest ETag/304, PC SIDE live Chrome, mobile MAIN normal/slow/failure fallback: PASS.

## Supabase / Edge

- Project: `kinojo-production` / `josvoltpktvwysrasffq`.
- Asset `2` / Campaign `1` / Item `1` / private idempotency ledger `0` / `kinojo-site-banners` object `0`.
- Campaign 16: HOME:MAIN / PUBLISHED / priority `100` / 종료 `2026-09-01 00:00:00 KST` exclusive / Asset 28 여름 배너.
- `kinojo-banner-media`: v8 ACTIVE / API `1.4` / DB `388` / Storage `382` / bundle SHA-256 `b3aa70f5cae6a62b01b9f05eb25e075ae9c3bcf2e16e53ec7e053e8fa7256b88`.
- 배너 3개 public table은 RLS ON. anon/authenticated 직접 table grant `0`, 배너용 public/storage policy `0`, service_role 경계를 유지한다.
- Security Advisor banner-specific WARN `0`. project-wide 기존 경고는 배너 범위 밖이라 변경하지 않았다.

## 고정 UI / 권한 계약

- MAIN: 16:9, PC+mobile HOME, fallback `kinojo-og.jpg`.
- SIDE: 300:715, PC only, breakpoint `min-width: 1840px`, fixed/overflow hidden/4px corners.
- HOF는 LEFT SIDE만 허용하며 RIGHT는 만들지 않는다.
- 모바일은 PC SIDE DOM/CSS/JS를 탑재하지 않는다.
- Server Manifest가 일정/우선순위/weight/playlist/random authority를 가진다. Browser는 표시·preload·crossfade·visibility/reduced-motion/fallback만 담당한다.
- Browser `service_role`, canonical schedule/priority/weight/random 로직을 추가하지 않는다.
- 기존 STATIC Asset `kinojo-og.jpg`, `kinojo_banner_summer.png`를 유지하며 신규 업로드만 `kinojo-site-banners`를 사용한다.

## Rollback / 병행 작업

- GitHub rollback branch: `backup/banner-260824-06-predeploy`.
- Drive rollback folder: `99_LEGACY/260824_06_banner_predeploy`.
- unrelated open PR #87 / #75는 배너 프로젝트에서 수정·병합·닫지 않는다.
- 이후 배너 변경이 필요하면 과거 작업 브랜치를 재사용하지 말고 최신 main / Supabase / Drive를 fresh readback한 뒤 새 작업으로 시작한다.

## 완료 판정

- 원본 마지막 단계: `11-라 — GitHub 반영·Drive 동일 ID 동기화·일일 로그·최종 인계`.
- 이 프로젝트에 남은 원본 단계는 없다.

## Post-close bugfix · 관리자 `이미지 관리` 화면 멈춤 · 2026-08-24

- 원본 `51/51 CLOSED` 판정 이후 실제 관리자 사용에서 `이미지 관리` 메뉴 진입 즉시 화면이 멈추는 결함이 확인됐다. 원본 단계는 다시 열지 않고 post-close production bugfix로 처리했다.
- 원인은 `admin/js/admin-images.js`의 `#adminCurrentLocation` `MutationObserver`가 `label()`을 호출하고, `label()`이 이미 같은 값인 `[이미지 관리]`를 다시 `textContent`로 써 observer를 자기 재호출하던 microtask loop였다.
- PR `#227` (`Fix admin image-management freeze`)을 squash merge해 제품 코드 baseline을 `82b3f15e311aea1709386289f03a486777cb01b6`으로 갱신했다. 위치 라벨은 실제 값이 다를 때만 쓰도록 변경해 observer 재귀를 차단했다.
- 기존 Chrome E2E가 hidden image-management UI만 조작해 실제 메뉴 활성화 경로를 놓쳤던 문제도 보완했다. 회귀 테스트가 실제 images pane을 `active`로 전환하고 event-loop heartbeat, `[이미지 관리]` 라벨 정착, 초기 asset/campaign/Manifest 로드를 확인한 뒤 기존 upload→publish→pause→save→delete lifecycle까지 진행한다.
- PR 검증 `Verify Banner Runtime`, `Verify Banner Admin`, `Verify KINOJO Pages`가 모두 success. main push 후 `kinojo/live-readback`, `kinojo/banner-admin-live-readback`, `kinojo/banner-runtime-live-readback` 3종도 모두 success로 운영 바이트 반영을 확인했다.
- Drive exact sync: `admin-images.js` 기존 ID `1I6Vz20ogyLDOUkYY710fbT9IYONIranb`, Git blob `d1c631104dcd26931b2aeaeceb011d78cf1e5c19`; `banner-admin-chrome-e2e.html` 기존 ID `1rGg7QNUOPlnjHerX9vTFR4zA7P9NE_-D`, Git blob `e7fc17e3221d3f690d52079501a72bf86183778d`. raw readback 2/2 exact-match.
- 이 bugfix에서 DB/RPC/Edge/Storage/Campaign 데이터 변경은 `0`이며 기존 배너 운영 계약은 유지한다.

## Post-close UI conformance · `메인 배너 | 사이드 배너` 내부 탭 복구 · 2026-08-24

- 초기 계획에는 최상위 `이미지 관리` 내부에 `메인 배너`와 `사이드 배너` 두 관리 항목을 분리하도록 명시돼 있었지만, 실제 구현은 두 UI를 같은 pane에 세로로 이어 붙여 노출하고 있었다. 원본 `51/51 CLOSED`는 유지하고 post-close UI conformance fix로 처리했다.
- PR `#229` (`Split admin banner management into main and side tabs`)을 squash merge해 제품 코드 baseline을 `32e2346044c7029e5afccdf937f173f2ff7d5fa4`로 갱신했다.
- 새 `admin/js/admin-banner-tabs.js`가 기존 KINOJO 관리자 공통 `admin-subnav` / `admin-subpane` 스타일을 재사용해 `메인 배너 | 사이드 배너` 탭을 생성한다. 메인 배너가 기본 선택이며, 한 시점에는 선택한 한 패널만 보인다. 기존 `[data-main-banner-admin]` / `[data-side-banner-admin]` 모듈은 각 tabpanel로 이동할 뿐 기존 업로드·일정·가중치·Manifest 계약은 변경하지 않는다.
- 탭은 마우스 클릭뿐 아니라 방향키, Home, End를 지원하고 `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls`, `aria-labelledby` 상태를 동기화한다.
- Chrome E2E는 실제 images pane 활성화 뒤 메인 탭 초기 표시, 사이드 탭 전환, 사이드 데이터 로드, 메인 탭 복귀, 기존 메인 배너 upload→publish→pause→save→delete lifecycle을 같은 회차에 검증하며 PR #229의 `Verify Banner Runtime`, `Verify Banner Admin`, `Verify Character Refresh Profile`, `Verify KINOJO Pages`가 모두 success다.
- PR #229 main push 기준 `kinojo/banner-admin-live-readback`, `kinojo/live-readback`, `kinojo/banner-runtime-live-readback` 3종이 success로 실제 `kinojo.info` 배포를 확인했다.
- PR `#230` (`Keep banner admin tabs under permanent verification`)은 workflow-only 후속으로 `admin-banner-tabs.js` 단독 변경도 `Verify Banner Admin`을 실행하고, syntax·실제 Chrome 탭 전환·custom-domain byte readback을 영구 검증하도록 보강했다. 검증 config baseline main은 `a900aaf55336d9e688d6301ef1a4b1047a8982af`이며 `kinojo/banner-admin-live-readback` success다.
- Drive exact sync: `admin.js` 기존 ID `1YtRNWaJzsnbBwwtY_01k4BvWSKCxsOtU`, `banner-admin-chrome-e2e.html` 기존 ID `1rGg7QNUOPlnjHerX9vTFR4zA7P9NE_-D`, `verify-banner-admin.yml` 기존 ID `1KbJNF4PAes1vjjKlhKuPWhTBjMx9D0u5`를 same-ID 갱신했고, 신규 `admin-banner-tabs.js`는 ID `1Y_nPA-231jnebljJS3GjUAuv_oypfMFn`으로 추가했다. 네 파일 모두 GitHub main과 raw Git blob exact-match했다.
- 이 UI conformance fix에서 Supabase DB/RPC/Edge/Storage/Campaign 데이터 변경은 `0`이며 기존 MAIN/SIDE Server authority와 배너 운영 계약은 그대로 유지한다.
