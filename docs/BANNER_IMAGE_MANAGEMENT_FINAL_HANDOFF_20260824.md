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

## Post-close deployment fix · 관리자 배너 탭 실제 브라우저 cache lineage · 2026-08-24

- 사용자 실브라우저 `https://kinojo.info/admin/#images` 스크린샷에서 PR #229 이후에도 `메인 배너 | 사이드 배너` 서브바가 보이지 않고 MAIN 관리 UI만 바로 노출되는 상태가 확인됐다. 원본 `51/51 CLOSED`는 유지하고 post-close deployment/cache bugfix로 처리했다.
- 원인은 탭 코드 자체가 아니라 실제 관리자 진입점의 cache generation이었다. `admin/index.html`과 `m/admin/index.html`이 계속 `admin.js?cache=2026082202`를 요청했고, 당시 loader도 모든 하위 관리자 모듈 URL을 `?cache=2026082202`로 고정했다. 서버에는 `admin-banner-tabs.js`가 존재했지만 기존 브라우저 cache가 PR #229 이전 `admin.js`를 재사용하면 새 탭 모듈을 요청하지 않을 수 있었다.
- 기존 live readback은 `?verify=...`와 `Cache-Control: no-cache`로 서버 바이트가 main과 일치하는지만 확인했기 때문에 이 정상 URL cache 재사용 경로를 모델링하지 못했다. 앞으로 배너 관리자 배포 완료 판정에는 PC/모바일 실제 HTML entrypoint cache generation과 loader→child module cache inheritance를 포함한다.
- PR `#232` (`Fix real admin cache lineage for banner tabs`)을 squash merge해 제품 baseline을 `36e1b34bdf77112a759fc59dad5a728313b23bc2`로 갱신했다. PC/모바일 관리자 HTML의 loader URL은 `admin.js?cache=2026082402`로 올렸고, `admin/js/admin.js`는 자기 script URL의 `cache` query를 읽어 모든 하위 관리자 모듈에 같은 key를 전달한다. 별도의 고정 child-module generation은 제거했다.
- PR #232 최종 head의 `Verify Banner Admin` run `32688890902`, `Verify Character Refresh Profile` run `32688891039`, `Verify KINOJO Pages` run `32688890918`, `Verify Banner Runtime` run `32688890887`이 모두 success다. Banner Runtime Chrome E2E는 실제 images pane 활성화와 MAIN→SIDE→MAIN 전환을 포함한다.
- main push 뒤 `kinojo/banner-admin-live-readback` run `32688967136`, `kinojo/live-readback` run `32688967119`, `kinojo/banner-runtime-live-readback` run `32688967176` 3종이 모두 success다. 운영 `kinojo.info`가 새 PC/모바일 HTML, 새 loader, 배너 탭 모듈을 제공하는 상태를 확인했다.
- Drive same-ID exact sync는 7/7 완료했다: `admin/index.html` ID `1RYfeMzCObVNxcUpsxqIBPmkKFjZWafEG` / blob `24f457d6a912d816f8f98574ca6960ca8c9bf130`; `m/admin/index.html` ID `1UzPaI8m_0ygd1NGEbJwCvYbLdTp8Qt5d` / blob `d71b0c4807ddc824e768fda1c0223302a0d23d1b`; `admin/js/admin.js` ID `1YtRNWaJzsnbBwwtY_01k4BvWSKCxsOtU` / blob `f59cb4973970bf98495e5d9e2d08481cdbddcdcc`; `banner-admin-main-ui-contract.test.js` ID `11zy50NNsPQSmYP2W0sTnXXq0MzZm2y-H` / blob `f9bf29fb76835d9bb4bae40a063970fd862d3da2`; `verify-character-refresh-profile.yml` ID `14dkjeOnUESwOGhy3lKuKtyIXhtU0BffP` / blob `203f7d194fe2a7090aa1a928412a844ab8f125a7`; `verify-banner-admin.yml` ID `1KbJNF4PAes1vjjKlhKuPWhTBjMx9D0u5` / blob `d5d8cbac99c4eae7850331dd96a99ad023ec8987`; `meter-presence-log-contract.test.js` ID `1nxPH9TyO1NKM5ojwGKOgXzS1rk_fSedY` / blob `0832bd59d3307f84a768aaf550b7f7c63a9282bd`.
- Supabase 제품 변경은 없다. 최종 readback은 Asset `2` / Campaign `1` / Item `1` / idempotency ledger `0` / `kinojo-site-banners` object `0`으로 기존 운영 상태를 유지한다.

## Post-close redesign · 관리자 이벤트 작성 Stage 0~3 · 2026-08-24

- 사용자가 요청한 2차 리디자인은 기존 `51/51 CLOSED` 운영 배너를 폐기하지 않고, 기존 Server 권한·Manifest 계약 위에 단계식 관리자 작성 UI를 추가하는 후속 작업으로 진행한다. 현재 완료 범위는 Stage `0~3`이며 전체 리디자인 종료 판정은 아니다.
- Stage 0: PR `#241`, merge `fc26876d`에서 회원 관리 아래 `캐릭터 이미지 확인` 큐와 미확인 숫자 배지를 추가했다. 회원 업로드를 팝업 외에도 목록에서 추적할 수 있으며 MASTER 전용 권한과 비공개 이미지 경계를 유지한다.
- Stage 1: PR `#242`, merge `6071da3b`에서 배너 이벤트 저장·게시·활성 이벤트 합산·이미지별 문구 overlay를 위한 DB/API 기반을 추가했다. 운영 기준은 `kinojo-banner-media` Edge v11 / API `1.7` / DB `394`다.
- Stage 2: PR `#244`, merge `5766aec0`에서 이미지 추가 → 새 노출 묶음 → 이미지 이벤트 설정 → 문구 편집 → 검토·게시의 5단계 노선형 UI, 최대 3장 누적 추가 카드, 새 묶음만의 순서·태그 구성을 추가했다.
- Stage 3: PR `#245`, merge `5e3f549d`에서 이미지 이벤트 설정을 활성화했다. 메인 배너는 단일 설정, 사이드 배너는 전체/개별 페이지와 `좌우 동시 | 좌우 별도` 스위치를 제공한다. 좌우 별도 모드에서는 왼쪽·오른쪽 이미지 선택과 순서를 각각 유지한다. HOF는 왼쪽만 생성한다.
- 노출 조건은 항상 또는 KST 기간·요일·특정 날짜로 설정한다. 이미지 유지 시간, 전환 시간, 즉시/CROSSFADE/SLIDE/SLIDE_FADE/ZOOM 효과와 좌→우·우→좌·상→하·하→상 방향을 기존 DB394 enum에 맞춰 게시용 payload로 조립한다. Stage 3 자체는 `event-save`와 `event-publish`를 호출하지 않으며 저장·게시는 Stage 5가 소유한다.
- 좌우 별도 화면은 좌·우 이미지 영역의 높이와 설정 시작선을 맞췄고, 반쪽 폭에서는 설정을 3열 2행으로 배치한다. `1500px`와 `700px` 실제 Chrome E2E에서 Stage 3 가로 overflow `0`을 확인했다.
- 추가 사용성 수정은 PR `#246`, 제품 baseline `3917ecb240f491bce05efee591b7da0f95fa8abc`다. 이미지 추가·라이브러리·이미지 순서·좌우별 순서의 미리보기 프레임 크기는 유지하고 이미지 렌더링만 `object-fit: contain`으로 바꿔 세로형 캐릭터 전신이 잘리지 않게 했다. 관리자 cache generation은 `2026082409`다.
- 전체 Node 계약 테스트 `31/31`, Banner Chrome E2E, `1500px`/`700px` 반응형 검증이 통과했다. main push run은 Banner Admin `32713822755`, KINOJO Pages `32713822740`, Character Refresh Profile `32713822728`, Banner Runtime `32713822737`, Pages deployment `32713821823` 모두 success다.
- 운영 `kinojo.info`의 `admin/index.html`, `m/admin/index.html`, `admin/js/admin.js`, `admin/js/admin-banner-event-workflow.js`는 제품 baseline의 Git blob과 `4/4` exact-match했다.
- Drive 제품 동기화는 `13/13` exact-match다. same-ID 갱신: `admin/index.html` `1RYfeMzCObVNxcUpsxqIBPmkKFjZWafEG`, mobile admin `1UzPaI8m_0ygd1NGEbJwCvYbLdTp8Qt5d`, `admin.js` `1YtRNWaJzsnbBwwtY_01k4BvWSKCxsOtU`, Chrome E2E `1rGg7QNUOPlnjHerX9vTFR4zA7P9NE_-D`, main UI test `11zy50NNsPQSmYP2W0sTnXXq0MzZm2y-H`, meter test `1nxPH9TyO1NKM5ojwGKOgXzS1rk_fSedY`, character workflow `14dkjeOnUESwOGhy3lKuKtyIXhtU0BffP`, banner workflow `1KbJNF4PAes1vjjKlhKuPWhTBjMx9D0u5`.
- Drive 신규 파일: event workflow `1Dw4cchI16JDwZaV8TZ55JOvtd5CCQd_U`, member browser E2E `10gvNOG4J5QzoJ5iQZ_mr5wCQ5Kbldj_k`, member contract `1YMJEOMGDrZqZyWVTeK208ZDeOt7DWZjG`, Stage 2 test `1qDG3l6Ly30V6FmJZgB4LP3xZqJM-7kum`, Stage 3 test `1j714Vx_DNi-VSRvro8xi2wiKg8CxWTh3`.
- Stage 3에서는 Supabase migration, RPC, Edge 배포와 운영 배너 데이터를 변경하지 않았다. 기존 v394 계약이 요구 enum과 좌우 variant 구조를 이미 제공해 UI와 payload 조립만 추가했다.
- 다음 작업은 Stage 4 이미지별/선택 이미지 공통 문구 편집과 Stage 5 검토 미리보기·초안 저장·전체 게시·오류 위치 이동·이벤트 목록 분리다.

## Post-close redesign · 관리자 이벤트 작성 Stage 4 · 2026-08-24

- PR `#248`, merge `8d81c772`에서 문구 편집 Stage 4와 Stage 2~3 사용성 보완을 반영했다. 관리자 cache generation은 `2026082410`이다.
- 이미지 라이브러리는 기본 `미선택`이며 `전체`와 이미지 분류 해시태그를 명시적으로 선택한다. 1단계 관리 이름은 이미지 묶음의 라이브러리 이름, 분류 해시태그는 라이브러리 필터 용도로만 사용한다. 2단계의 중복 해시태그 편집기는 제거했다.
- 노출 묶음은 최대 `3장`이며 현재 선택 수를 `N / 3`으로 표시한다. 이미지 순서는 드래그 앤 드롭과 기존 화살표 버튼으로 바꿀 수 있고, 이동 애니메이션과 마우스·키보드 포커스 확대 미리보기를 제공한다.
- 기존 `우선순위 100`은 노출 횟수를 늘리는 값이 아니라 정렬 기준이라 사용자 의도와 달랐다. UI에서 이를 제거하고 실제 노출 빈도 `기본 | ×1.5 | ×2.0`으로 교체했다.
- Migration `banner_event_exposure_frequency_v395`와 `kinojo_banner_manifest_v395`가 활성 신규 이벤트의 빈도 비율을 Server playlist에 실제 반영한다. ×1.5가 있는 묶음은 기본 `2`, ×1.5 `3`, ×2.0 `4`; 없으면 기본 `1`, ×2.0 `2`의 최소 정수 비율로 확장한다. legacy 캠페인은 기존 동작을 유지한다.
- 운영 `kinojo-banner-media`는 Edge v12 / API `1.8` / DB `395` / Event `394` / Upload `394`이며 deployment SHA는 `911f218350ed027b471cff97e66c77ee1a38b2a2448c0fabf186133df6a1dcc5`다. v395 RPC는 `service_role`만 실행할 수 있다.
- 문구는 이미지별 최대 `3개 레이어`를 편집한다. 각 레이어는 문구, 상·중·하 위치, 글꼴, 크기, 글자색, 배경색·농도, 높이와 이미지 `앞 | 뒤`를 가진다. 기본값은 이미지 앞이며, 선택 이미지에 현재 이미지의 문구 레이어 전체를 복사할 수 있다.
- 문구 레이어 앞·뒤 합성 미리보기를 Stage 4 안에서 제공하고 게시용 payload의 각 item에 `textOverlays` 배열을 조립한다. 다만 Event 계약은 여전히 `394`이고 Stage 4는 `event-save`·`event-publish`를 호출하지 않으므로, 다중 레이어의 영구 저장 계약과 실제 사이트 렌더링은 후속 Stage 5·7에서 확정한다.
- Stage 3 필드는 내용 폭에 맞춘 compact flex로 정리해 초 단위가 줄바꿈되지 않는다. 실제 Chrome `1500×900`, `700×900`에서 가로 overflow `0`, 문구 UI 단일 열 전환, 단위 정렬을 확인했다.
- 전체 Node 계약 테스트 `33/33`, Banner Chrome E2E, 드래그 순서·hover preview·빈도 payload·앞/뒤 3개 문구·선택 이미지 복사가 통과했다. Supabase v395 dry-run과 기존 운영 playlist 수 v394/v395 동일성도 확인했다.
- 다음 작업은 Stage 5 검토 미리보기·초안 저장·전체 게시·누락 설정 이동/강조이며, 이후 Stage 6 이벤트 목록 분리와 Stage 7 실제 전환·문구 렌더링을 진행한다.

## Post-close redesign · 관리자 이벤트 작성 Stage 5 · 2026-08-24

- PR `#250`, merge `d96dcfca2cccca7083827b1d27d78846165fcba5`에서 Stage 5 검토·초안 저장·전체 게시를 운영 반영했다. 관리자 cache generation은 `2026082411`이다.
- 기존 문구 편집을 범용 콘텐츠 편집으로 확장했다. 배너 이미지 하나당 문구 최대 3개와 이모지·이모티콘·스티커·뱃지 합계 최대 3개를 추가하며, 각 레이어에 이미지 앞/뒤, 위치, 크기, 회전, 투명도를 지정한다. 기본 레이어는 이미지 앞이다.
- 업로드한 스티커·뱃지·이모티콘은 RLS deny-all 재사용 라이브러리에 별도 등록한다. 관리자 Server RPC만 목록·등록을 수행하고 `anon`·`authenticated`의 table/RPC 직접 접근은 허용하지 않는다.
- 초안은 원본 이미지와 편집 가능한 콘텐츠 레이어를 유지한다. 전체 게시 시 브라우저 canvas가 원본+뒤 레이어+앞 레이어를 WebP 한 장으로 합성하고 별도 Storage object로 업로드한다. Server는 합성본을 검증해 게시 항목에 연결하며, 합성본 누락 또는 편집 후 stale 상태면 게시를 거부한다.
- 공개 Manifest v396은 콘텐츠가 있는 항목에서 합성본 URL만 반환하고 콘텐츠 레이어 배열은 비운다. 실제 배너는 한 이미지 요청만 수행하므로 문구·스티커가 따로 뜨거나 이미지와 시간차로 노출되지 않는다. 원본과 레이어 설정은 이후 편집을 위해 보존한다.
- v396 orphan cleanup은 원본 배너, 재사용 콘텐츠 라이브러리, 게시 합성본을 모두 보호한다. 24시간이 지난 정상 콘텐츠·합성본이 미참조 파일로 오판되어 지워지던 가능성을 차단했다.
- 검토 영역은 메인/사이드, 좌우 동시/별도, 각 이미지 순서와 콘텐츠를 실제 구성대로 요약한다. 우측 하단 고정 `진행 중인 초안 저장`·`전체 게시`를 제공하며, 게시 필수값이 빠지면 해당 단계로 이동하고 테두리를 강조한다.
- 운영 기준은 `kinojo-banner-media` API `1.9` / DB `397` / Event `396` / Upload `394`, 게시 미디어 계약 `FLATTENED_COMPOSITE_WHEN_CONTENT_EXISTS`, 편집 원본 보존 `true`다. v396 migration 두 건과 DB397 hotfix, Edge 배포를 실제 적용했고 health/Manifest/RLS/RPC 경계를 확인했다.
- 전체 Node 계약 `35/35`와 PR source workflow 4종이 통과했다. 운영 `kinojo.info`의 PC/모바일 관리자 HTML, loader, event workflow JS는 merge Git blob과 `4/4` exact-match다. 도구의 localhost URL 정책으로 업데이트한 Chrome E2E harness는 이번 회차에 실행하지 못했으며 실제 Chrome PASS로 기록하지 않는다.
- 다음 제품 단계는 Stage 6 `메인 배너 | 사이드 배너 | 이벤트 목록` 분리와 독립 스크롤·필터·활성 상태·영구 삭제 UI다. Stage 7은 사이트 전환 효과 연결과 최종 반응형·접근성·통합 회귀를 담당하며 콘텐츠의 실제 노출 자체는 합성본 계약으로 Stage 5에서 완료했다.

### Stage 5 게시 hotfix · DB397

- 실제 최초 게시에서 `event-save`는 200으로 성공했지만 직후 `composite-upload-prepare`가 400으로 거절됐다. Edge의 새 mutation 4종과 v388 idempotency claim의 action 허용 목록이 일치하지 않은 것이 원인이다.
- PR `#252`, merge `c1536603d19dfb69932b98ac18fd50022e47d1ce`에서 `overlay-upload-prepare/complete`, `composite-upload-prepare/complete`를 허용하고 DB contract를 `397`로 올렸다.
- 운영 Edge v15 health DB397, 허용 목록 4종 존재, `anon/authenticated` execute false, `service_role` execute true를 확인했다. 기존 성공한 초안은 유지되며 새로고침 뒤 전체 게시를 다시 실행할 수 있다.
