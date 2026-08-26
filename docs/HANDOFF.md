# KINOJO WEB HANDOFF

기준일: 2026-08-26 KST

## 저장소 / 현재 기준

- GitHub: `losnah513/aion2-updater-config`
- 운영 브랜치: `main`
- 배너 이미지 관리 2차 3단계 운영 기준: PR `#264`, merge commit `83f981e5af8dd8cbc528f1040726ecf53f0a329c`, 관리자 cache `2026082603`, Edge `kinojo-banner-media` v20(API 2.1 / DB 403 / Upload 403 / Event 402)
- 내 정보 E-1 제품 운영 commit: `640b7eebcef1c13b0516fe2cd020df870bc23752` (PR `#194`)
- 내 정보 후속 A-1~E-2: 12/12 완료
- My Info / 관리자 이미지 모달 추가 UI 후속: PR `#197` 구현·배포·동기화 기준 CLOSED · 수동 실브라우저 sanity check는 post-close 보류
- 레기온 순위 통합 패널: PR `#164` 병합 완료
- Google Drive의 `00_README_FIRST.md`, `KINOJO_MASTER_RULES.md`, `KINOJO_WORKFLOW_RULES.md`, `KINOJO_COMPONENT_RULES.md`, 최신 일일 로그를 작업 규칙 원본으로 사용한다.
- GitHub `main`은 WEB 코드 원본이고, 실제 Supabase·GitHub Pages 상태는 운영 원본이다.

## 레기온 트리 마-2~마-6 / 사-1~사-7 / 아-1~아-6 / 자-1~자-7

- PC·모바일 페이지가 공개 RPC `kinojo_web_get_legion_tree`의 `web-legion-tree-v1` / DB 365 계약을 읽어 깡·낮·밤·키나노동조합을 Server 순서대로 렌더링한다.
- 2026-08-24 운영 readback 기준 실제 구성원은 깡 41명, 낮 4명, 밤 2명, 키나노동조합 42명으로 총 89명이다.
- 종족 선택은 v372 Server reference의 천족/마족 각 21개 서버만 표시하며, 종족 전환 시 호환되지 않는 선택 서버를 즉시 초기화한다.
- 실제 구성원 카드는 Server `className`을 수호성→templar, 검성→gladiator, 살성→assassin, 궁성→ranger, 마도성→sorcerer, 정령성→elementalist, 치유성→cleric, 호법성→chanter, 권성→fighter의 공용 9종 아이콘으로만 연결한다. 공백·표시용 괄호 수식은 정규화하되 unknown/빈 값은 추측하지 않고 `?` fallback으로 닫는다.
- 2026-08-24 운영 readback의 89명 직업 분포는 수호성 7, 검성 6, 살성 7, 궁성 15, 마도성 10, 정령성 9, 치유성 17, 호법성 12, 권성 6이며 현재 unknown/null은 0명이다.
- 운영 89명의 Server 상태는 본캐 39명, 부캐 50명이며 characterName 누락과 부캐 mainCharacterName 누락은 각각 0명이다. WEB은 `characterName / isMain / mainCharacterName`을 그대로 렌더링하고 본캐/부캐를 재판정하거나 이름순·본캐 우선으로 재정렬하지 않는다.
- 전체 이름은 DOM text·`title`·`aria-label`에 보존한다. 5 Unicode 글자까지는 마스크 없이 표시하고 5글자 초과만 약 5글자 폭의 우측 fade를 적용하며 ellipsis는 사용하지 않는다. 현재 운영 5글자 초과 이름은 2명이다.
- 고정 124px 카드는 branch 수가 늘어도 축소하지 않는다. PC는 1/2/3+ branch에 5/3/2열, 모바일은 1~2/3+ branch에 2/1열을 사용하며 `data-branch-count`와 동일 CSS 계약을 PC·모바일이 공유한다.
- 운영 Server가 반환한 `DEFAULT_FALLBACK` 구조에는 `기본 단계` 표식을 붙이고, 배정 구성원이 0명인 role은 group 배열 유무와 관계없이 `지정 전`으로 표시한다.
- 계약 버전, 필수 4개 레기온, Server stage 구조 또는 fallback 상태가 맞지 않으면 브라우저에서 임의 fallback을 만들지 않고 오류 상태로 닫는다.
- 캐릭터 추가는 기존 인증 Server chain을 재사용한다. `core/kinojo-supabase-features.js#addLegionTreeCharacter`가 현재 `kws_` 세션을 내부 결합해 `kinojo-legion-tree`의 `character-add`만 호출하며, 페이지는 본캐명·부캐명·`serverId` 외의 mode/race/member/공식 정보/list/Queue 값을 만들지 않는다.
- 본캐만 입력하면 MAIN, 본캐+부캐는 ALT 요청이 되고, 부캐만 입력하면 본캐 오류·focus 후 network 0으로 종료한다. 실행 중에는 추가/초기화 버튼을 잠가 중복 click과 가짜 취소를 막는다.
- 진행 UI는 요청에 결합된 Server runtime `sessionId`만 추적해 `공식 확인 → 정보 반영 → list 반영 → readback → 완료`를 표시한다. 동일 세션의 `completed / SERVER_QUEUE_LIST_SYNC_DONE`만 완료로 인정하고, Google list readback 완료 뒤 공개 트리를 재조회한다.
- 초기화는 작업이 없을 때 두 이름, 종족, 서버, 오류, 진행 표시를 함께 비운다. Server 작업 실행 중에는 초기화를 거부하며 Server Queue를 취소했다고 표시하지 않는다.
- 레기온 트리 진행도는 **56/115**다. 다음 원본 단계는 **차-1 조직도 편집 Modal frame**이며 이번 변경에서는 선행하지 않는다.

## 내 정보 이미지 기존 완료 상태

- 기존 내 정보/캐릭터 이미지 Stage 1-8은 `80/80` 완료 상태이며 재구현하지 않는다.
- 운영 Edge 기준은 `kinojo-member-auth` v2, `kinojo-member-profile` v20(API 2.7 / DB 375), `kinojo-member-image-download` v2, `kinojo-member-image-cleanup` v5다.
- `kinojo-member-profile` 버킷은 공개, `kinojo-member-reference` 버킷은 비공개다.
- 참고 이미지는 최대 7일 보존하며 cleanup cron은 `*/15 * * * *`로 활성화되어 있다.
- 관리자 이미지 SQL 367/371은 `service_role` 전용이다.

## 마이페이지 모달 2차 · 1단계 Server/Storage 계약

- 2026-08-26 기준 1단계는 기존 `kinojo-member-profile` 책임을 재사용하는 `REUSE_WITH_DB_MODULE`로 확정했다. 별도 회원 이미지 Edge를 만들지 않고 요청의 원자성은 DB404 RPC가 담당한다.
- 기존 API 2.7 / DB375 bootstrap·프로필·참고 이미지 action은 유지하며 신규 `image-request-prepare`, `image-request-finalize`, `image-request-state`만 image request contract `404`로 추가한다.
- 요청은 회원 세션에서 확정한 캐릭터에 이미지 `1~3`장과 `SHONEN_MANGA / ROMANCE_MANGA / ANIMATION / REALISTIC / CUSTOM / null`, plain-text 요청문 최대 300자를 묶는다. `CUSTOM`은 요청문이 필수다.
- prepare는 회원+idempotency key로 `DRAFT`와 서버 생성 object path를 한 번만 만들고 브라우저에는 path 필드 없이 private Storage signed upload URL만 반환한다. 업로드 URL은 2시간, draft object는 2시간 뒤 cleanup 대상이다.
- finalize는 소유권을 다시 검증하고 모든 요청 object의 MIME·size·실제 WebP 픽셀을 확인한 뒤 DB 트랜잭션 하나로 `SUBMITTED`와 활성 참고 이미지를 갱신한다. 일부 실패·동시 교체 충돌에서는 기존 활성 이미지와 `DRAFT`를 보존한다.
- 이미지 bytes는 요청 생성 시각부터 최대 7일, 스타일·요청문·상태·감사 metadata는 최대 30일 보존한다. 기존 요청 이미지가 새 요청으로 교체돼도 남은 7일 동안 보존하고, legacy 교체 object는 cleanup queue로 넘긴다.
- private 요청/항목/상태 이력/cleanup queue 4개 표는 RLS default-deny이며 Browser role의 표·RPC 직접 권한은 없다. DB404 RPC 7개는 `service_role`만 실행한다.
- cleanup Edge는 v1.3 / DB404로 확장해 abandoned DRAFT, 7일 만료 요청 이미지, legacy active reference, 교체 queue를 Storage 먼저 삭제한 뒤 metadata를 확정하고, object 삭제가 끝난 30일 metadata만 제거한다.
- 완성 결과 이미지 업로드·회원 전달·프로필 자동 적용과 관리자 요청 목록·상태 처리 UI는 1단계 범위가 아니다. 관리자 요청 처리는 3단계에서 기존 MASTER signed preview/download 경계 위에 연결한다.
- 운영 반영: PR #266 / main `02d65572`, migration `20260826040254 member_image_request_batch_v404`, `kinojo-member-profile` v23, `kinojo-member-image-cleanup` v6. DB404 ACL/RLS·빈 초기 상태·기존 15분 cleanup Cron·profile health/cleanup 무인증 경계를 readback했다.


## 2026-08-24 참고 가이드 PNG 최종 에셋

- FRONT/BACK/UPPER_BODY 촬영 가이드는 사용자가 제작한 `front.png`/`back.png`/`body.png`를 각각 `front-2x3.png`/`back-2x3.png`/`upper-body-4x5.png`에 매핑했다. 운영 크기는 800×1200, 800×1200, 800×1000이다.
- PNG는 원본의 반투명 발광 프레임, 캐릭터 실루엣과 랜드마크를 유지한다. 기존 `<img>` overlay 구조를 재사용하며 가이드는 WebP 결과 픽셀에 포함되지 않는다.
- 회귀 테스트는 PNG signature·IHDR 픽셀 크기·투명도·파일 크기와 legacy SVG 제거를 검증한다. Server/Edge/Storage 계약은 변경하지 않았다.

## My Info / Admin Image Modal 추가 UI 후속 — CLOSED

- PR `#197` (`Refine My Info image UI and admin image modal`)은 head `d90ca1e93a97d284447df76c19b695b56db7a324`, merge commit `e022442be2261adfcc769bd0b34a6a766f717d9a`로 2026-08-22 병합됐다. 이후 배너 작업이 이어진 현재 기준 `main` `f3502f04dfbbba89392a44e8a1c2aaaa3b46a7eb`에서도 관련 계약은 유지된다.
- 회원 My Info는 compact 제목, 프로필 캐릭터 2열 selector/현재 이미지 좌우 pane, 내부 스크롤·hidden scrollbar·white fade, FRONT/BACK/UPPER_BODY 독립 슬롯, no-crop 미리보기, 슬롯별 선택/비공개 등록/편집 취소/삭제와 `filesBySlot`/`outputsBySlot`/`previewUrlsBySlot` 독립 pending 상태를 유지한다.
- 관리자 회원 이미지 모달은 본캐 우선 기본 선택, 회원 보유 캐릭터 selector, 선택 캐릭터 상세 1개만 교체 렌더, `data-admin-member-image-character` 기반 preview/download/privacy 계약, `#adminMemberImageModal` scoped viewport/internal-scroll 및 body scroll lock을 유지한다.
- PR #197 자체는 Supabase SQL/RPC/Edge/Storage policy/bucket/cleanup/signed upload·preview·download 계약을 변경하지 않았다. 이후 다른 프로젝트의 Supabase 변경과 구분한다.
- 자동 검증은 PR #197의 `Verify KINOJO Pages`, `Verify Character Refresh Profile`, `Verify Legion Tree Pages` PASS와 merge commit의 `kinojo/live-readback`, `legion-tree/live-readback` success를 확인했다. 2026-08-23 마감 readback에서는 현재 `main`의 관련 소스 계약 유지, Drive 전용 회귀 테스트 직접 실행 PASS, `ui/kinojo-common-ui.js`·`ui/kinojo-my-info.css`·`admin/js/admin-members.js`·`admin/css/admin.css`·`tests/my-info-admin-image-layout-contract.test.js`의 GitHub↔Drive Git blob SHA `5/5` 일치를 확인했다.
- PC `1280x900`, 모바일 `390x844`/`320x800`/`844x390`, 실제 3 reference slot 동시 pending→개별 등록, 관리자 실제 다캐릭터 selector/preview/download의 **PR #197 후속 최종 수동 sanity check는 이번 마감 회차에서 재실행하지 못했다.** 현재 실행 환경에 KINOJO 인증 브라우저 세션이 없고 headless Chromium도 사용할 수 없었으며, 2026-08-23 사용자 명시 지시로 Codex 재사용 가능 시점까지 기다리지 않고 마감한다. 이 항목은 `PASS`로 기록하지 않고 **post-close 수동 확인 보류**로 남긴다.
- 최종 상태는 **구현·자동 회귀·PR 병합·Pages/live 배포·Drive 소스 동기화 기준 CLOSED**다. 수동 sanity check에서 실제 회귀가 발견될 경우에만 최신 `main`에서 새 `codex/` 수정 브랜치를 만들어 별도 최소 수정한다. 이전 PR #197 작업 브랜치나 과거 dirty branch를 다시 병합하지 않는다.

## 레기온 순위 통합 패널 UI

- 이 작업은 WEB 표시·상호작용 변경이며 신규 SQL/RPC/Edge 계약을 추가하지 않는다. 순위는 기존 `kinojo_web_get_legion_ranking`, 로그인 캐릭터는 기존 `kinojo-member-profile`의 `characters` action을 재사용한다.
- 데스크톱 PVE/PVP는 하나의 외곽 카드 안에서 좌우 분할되고 목록만 각각 독립 스크롤된다. 스크롤바는 숨기며, 하단의 비대화형 그라데이션은 남은 내용이 있을 때만 보이고 끝에서는 사라진다.
- 모바일은 같은 패널을 PVE/PVP 탭으로 전환하고 각 목록의 스크롤 위치를 별도로 보존한다. 390×844와 320×800에서 가로 overflow 0을 확인했다.
- 2026-08-21 후속 수정에서 오류 흔적처럼 보이던 PVE/PVP 헤더 좌측 색상 inset bar를 제거했다. 중앙 구분선과 PVE/PVP 칩은 유지한다.
- Fold 펼침 화면에 해당하는 700~1220px 구간은 검색·범위 스위치를 왼쪽, 클래스 5열 필터를 오른쪽에 둔 2행 Grid를 사용한다. 768×1024 세로와 1080×960 가로에서 요소 간 겹침 0, 가로 overflow 0을 확인했다.
- 컴팩트 카드는 직업 텍스트를 제거하고 공통 직업 아이콘만 사용한다. 서버는 레기온 옆 `[지켈]` 형식이며, 전투력/아이템 레벨은 위아래 두 줄이다.
- `내 캐릭터 순위 보기`는 Server가 반환한 소유 캐릭터를 정확한 `server_id + character_name`으로만 대조하고, 현재 20명 밖이면 기존 순위 페이지를 추가로 받아 해당 카드로 부드럽게 이동한다.
- 1920×1080과 390×844 모두 카드 4장 전체와 5번째 카드 일부가 보이고, 고정 공지바가 목록을 덮지 않는다.

## 명예의 전당 동일 크기 카드 보드

- PC·태블릿의 6개 카드 보드는 기존 `hof/css/hall.css`의 단일 HOF authority에서 10열×4행 정사각형으로 관리한다. PVE·DPS·PVP·레기온 이동은 동일한 7열×1행, 강화의 신·성장의 신은 동일한 3열×2행이다.
- 10열×4행 슬롯은 위에서부터 `강화+DPS`, `강화+레기온 이동`, `PVE+성장`, `PVP+성장` 순서다. TOP3 행은 `순위 | 직업 아이콘·캐릭터명 [서버]·본캐/부캐 | 전투력 | 프로필`의 한 줄 구조다. 직업 아이콘은 원형 외곽 없이 공통 에셋 원본 형태로 표시하고, 서버는 뱃지가 아닌 대괄호 텍스트이며 TOP3의 뱃지는 본캐/부캐만 사용한다.
- Fold 펼침 세로·가로는 같은 보드 오른쪽에 140~150px `내 랭킹`을 유지한다. 제목은 `내 랭킹`만 남기고 사각 프로필과 이름, PVE/PVP/강화/성장/좋아요/싫어요 한 줄 항목을 사용한다. 보드 크기는 dynamic viewport height를 사용하지 않아 스크롤 중 변하지 않는다.
- 760px 이하의 좁은 화면은 기존 `hall-render.js` 슬롯을 DPS→PVE→PVP→강화/성장 좌우→레기온 이동 순서로 사용한다. PC `/hof/`와 모바일 `/m/hof/`는 같은 렌더러와 CSS를 공유한다.
- 기존 `tests/hof-layout-contract.test.js`가 카드 span·슬롯 순서·TOP3 한 줄·Fold 내 랭킹 압축·모바일 DOM 순서·cache key를 검증하며, 기존 `verify-kinojo-pages.yml`이 JS 구문과 이 계약 테스트를 실행한다.

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
- `assets/images/my-info/guides/`에 FRONT, BACK, UPPER_BODY용 투명 PNG 3종을 둔다.
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

- B-1은 PR `#161`, 운영 commit `ec52d8d93c02a9645ab01b27ad163f6f1a2e177c`으로 반영됐다.
- `ui/kinojo-my-info-image-editor.js`가 첨부 전 3종 가이드 카드와 공통 편집기 viewport를 소유한다.
- 편집 프레임은 A-1 슬롯 비율에 고정되고 FRONT/BACK/UPPER_BODY에는 A-2 투명 PNG를 overlay한다. PROFILE은 별도 에셋 없이 정사각형 안전 영역만 제공한다.
- 원본은 브라우저 메모리의 object URL 또는 호출자가 제공한 URL로만 표시하며, 닫기·오류 시 편집기가 만든 object URL을 해제한다.
- 사진 이동, 확대, 회전, 초기화와 포인터/터치 drag, Escape 닫기, 포커스 순환·복귀를 제공한다. 확대/회전은 A-3 공통 슬라이더를 사용한다.
- 회전된 프레임의 네 모서리가 원본 밖으로 벗어나지 않도록 최소 cover scale과 이동 범위를 계산한다.
- B-1 확인 결과는 `previewOnly` 구도 상태다. canvas crop, WebP encoding, 품질 경고, Supabase 호출, 기존 Stage 1-8 업로드 교체는 포함하지 않는다.
- `tests/my-info-image-editor-harness.html`에서 3종 촬영 카드와 편집 프레임을 시각 검증한다. 실제 파일 선택 결과와 출력 생성 연결은 B-2에서 진행한다.

## B-2 크롭 / WebP / 품질 경고

- `ui/kinojo-my-info-image-editor.js`가 현재 이동·확대·회전 상태를 슬롯별 고정 크기 canvas로 렌더링한다. 가이드 SVG는 화면 overlay로만 유지하며 결과 픽셀에는 포함하지 않는다.
- PROFILE은 `512x512`, FRONT/BACK은 `800x1200`, UPPER_BODY는 `800x1000`의 WebP 결과를 만들고 quality `0.90`을 적용한다.
- canvas 재인코딩으로 원본 metadata를 승계하지 않으며 원본 파일은 업로드하지 않는다. 결과는 브라우저 메모리의 `Blob`과 지원 환경의 `File`로만 반환한다.
- 실제 출력 픽셀 대비 유효 원본 픽셀이 `1.00` 미만이면 주의, `0.75` 미만이면 낮은 해상도 경고를 표시한다. 임계값 경계의 소수점 오차를 허용하며 경고는 결과 생성을 막지 않는다.
- 결과 상태는 `outputReady: true`, `uploadConnected: false`다. fetch, Supabase, Storage, 세션 토큰과 기존 Stage 1-8 업로드 연결은 B-3 전까지 추가하지 않는다.
- 데스크톱 프레임은 슬롯 비율을 유지하도록 너비를 viewport 높이에도 맞추고, 모바일 `390x844`에서도 경고·슬라이더·하단 버튼이 함께 노출된다.
- 테스트 harness에서 FRONT `800x1200`과 UPPER_BODY `800x1000`의 실제 `image/webp` decode, 비차단 경고, 가이드가 빠진 편집 결과를 확인했다.

## B-3 안전 업로드 연결

- B-3은 PR `#165`, 운영 commit `ad428f4d0c05de4d9b649ff66c4ac8529824ef40`으로 반영됐다.
- `ui/kinojo-my-info-image-upload.js`는 편집 완료 WebP 결과만 기존 Stage 1-8의 signed upload prepare/complete 계약에 연결한다. 원본 JPEG/PNG/WebP는 편집기 object URL로만 읽고 Storage에 전송하지 않는다.
- 프로필은 신규 등록과 기존 override의 안전 교체를 지원한다. FRONT/BACK/UPPER_BODY는 Server 등록 상태를 읽고 비공개 신규 등록·안전 교체·Storage object와 metadata 동시 삭제를 제공한다.
- Storage signed upload는 `upsert: false`, 무작위 32자리 object path, publishable key만 사용한다. 사용자 세션 토큰이나 service role을 Storage 요청에 전달하지 않는다.
- 운영 `kinojo-member-profile` v19/API 2.6은 업로드된 WebP 바이트에서 실제 픽셀을 파싱한다. PROFILE `512x512`, FRONT/BACK `800x1200`, UPPER_BODY `800x1000`이 아니면 후보 object를 삭제하고 metadata를 활성화하지 않는다.
- `tests/my-info-image-upload.test.js`와 브라우저 harness가 신규 등록·교체·삭제·원본 미전송·B3 픽셀 확인을 검증한다. PR CI, Pages build/deploy, custom-domain exact live readback이 모두 성공했다.

## C-1 배치 bootstrap

- C-1은 PR `#170`, 운영 commit `5b70ee93cdecd31467162657381e34bfecd9be58`으로 반영됐다.
- `ui/kinojo-my-info-batch-bootstrap.js`가 내 정보 모달 bootstrap 계약을 소유한다. 모달을 열 때 `kinojo-member-profile`의 `batch-bootstrap` action을 정확히 한 번 호출하고 API `2.7`, DB `375`, batch contract `375`를 검증한다.
- Edge v20은 KWS 세션을 한 번 검증한 뒤 service-role 전용 `kinojo_member_image_batch_bootstrap_v375(text)` RPC를 한 번 호출한다. RPC는 소유 캐릭터 목록과 각 캐릭터의 프로필 override/공식 이미지 상태, FRONT/BACK/UPPER_BODY 비공개 참고 이미지 등록 metadata를 한 번에 반환한다.
- 브라우저는 반환된 모든 캐릭터 상태를 cache에 채우므로 캐릭터 전환 시 추가 profile/reference 요청을 보내지 않는다. 비공개 참고 이미지의 object path와 signed URL은 bootstrap 응답에 포함하지 않는다.
- 운영 인증 readback은 7개 소유 캐릭터와 7개 이미지 상태를 HTTP 200으로 확인했고, 임시 검증 세션은 즉시 폐기했다. Health는 `ONE_EDGE_REQUEST_ONE_RPC`를 반환한다.
- C-1은 선택 이미지 preload, 다음 이미지 preload, 나머지 2개 단위 background loading, 캐릭터별 retry를 구현하지 않는다. 이 범위는 C-2가 소유한다.
- PR CI와 운영 workflow가 성공했다: Pages/live readback `32451957817`, Pages build/deploy `32451957234`, Legion Tree `32451957839`, Character Refresh Profile `32451957849`.

## C-2 프로필 이미지 선로딩 / 백그라운드 / 재시도

- C-2는 PR `#175`, 운영 commit `b97d598375400d7eaac9986a6a70a9f533ddb126`으로 반영됐다.
- `ui/kinojo-my-info-image-preloader.js`가 C-1 batch cache의 실제 유효 프로필 이미지 URL만 읽는다. 선택 캐릭터와 순서상 다음 캐릭터의 이미지가 성공 또는 실패로 settle된 뒤 모달을 연다.
- 모달이 열린 뒤 남은 idle 이미지만 고정 동시성 2로 백그라운드 준비한다. 한 캐릭터의 실패는 다른 캐릭터나 모달 표시를 막지 않고, 실패한 캐릭터에만 개별 재시도 버튼을 노출한다.
- URL은 HTTP(S)만 허용하고, 준비 완료 전에는 현재 이미지 `<img>`에 URL을 넣지 않는다. FRONT/BACK/UPPER_BODY 참고 이미지는 기존처럼 비공개 등록 metadata만 사용하며 C-2 Signed URL을 만들지 않는다.
- 고정 300ms 모달 지연을 제거하고 실제 초기 이미지 gate로 교체했다. 프로필 업로드·공식 이미지 복원 뒤에도 해당 캐릭터의 새 유효 URL만 다시 준비한다.
- PR workflow의 KINOJO Pages, Character Refresh Profile, Legion Tree 검증과 로컬 Node 계약·브라우저 동작 검증이 통과했다. Supabase Edge v20/API 2.7/DB375, SQL375, Storage 상태는 변경하지 않았다.

## D-1 캐릭터명 기준 가변 패널 너비

- D-1은 PR `#179`, 운영 commit `11ca4c071d8c3d7dbf90aa374d681db0ec212ce4`로 반영됐다.
- PC 우측 내 정보 패널만 C-1 캐릭터 목록의 가장 긴 이름을 한 번 측정해 `352~420px` 범위로 정한다. 같은 이름 목록을 다시 렌더링할 때는 측정값을 재사용한다.
- 모바일 라우트와 `760px` 이하 viewport는 기존 `width: 100%`를 유지한다. 중앙 이미지 관리 모달은 이름 기반 패널 너비 변수를 사용하지 않는다.
- 실제 브라우저에서 짧은 이름 `352px`, 중간 이름 `360px`, 긴 이름 상한 `420px`, 모바일 라우트 전체 폭을 확인했다. 전체 Node 계약 테스트와 PR workflow 3종이 통과했다.
- D-1은 WEB 표시 계약만 변경했다. Supabase Edge v20/API 2.7/DB375, SQL375, Storage 및 기존 Stage 1-8 계약은 변경하지 않았다.

## D-2 잘림 없는 반응형 배치

- D-2는 PR `#192`, 운영 commit `b7132f365e4b49cae8b5f84cbb1e609571de1920`으로 반영됐다.
- D-1의 PC 패널 `352~420px` 측정값은 유지한다. 가장 긴 이름의 계산 폭이 `420px` 상한을 넘을 때만 `data-panel-layout="stacked"`를 적용해 이름과 스탯을 두 줄 배치하고, 같은 이름 목록의 캐시 경로에서도 배치 상태를 재사용한다.
- `420px` 이하 화면은 캐릭터명을 생략하지 않고 필요한 만큼 줄바꿈한다. 이미지 관리 모달은 내부 그리드를 `minmax(0,1fr)`로 제한하고 캐릭터명·파일명·상태·버튼 문구·참고 이미지 문구를 줄바꿈한다.
- 캐릭터 선택 띠의 의도된 가로 스크롤과 모달의 세로 스크롤은 유지한다. 실제 브라우저 `1280px` PC, `390x844`, `320x800`, `844x390`에서 문서와 모달의 가로 overflow `0`을 확인했다.
- `tests/my-info-responsive-layout.test.js`와 PR workflow 3종이 통과했다. Supabase Edge v20/API 2.7/DB375, SQL375, Storage 및 기존 Stage 1-8 계약은 변경하지 않았다.

## E-1 회귀 / 접근성 / 시각 검증

- E-1은 PR `#194`, 운영 commit `640b7eebcef1c13b0516fe2cd020df870bc23752`로 반영됐다.
- 우측 내 정보 패널과 중앙 이미지 관리 모달은 열릴 때 닫기 버튼으로 초점을 옮기고, Tab/Shift+Tab을 내부에서 순환하며, Escape·닫기 뒤에는 호출 버튼으로 초점을 돌려준다.
- 패널·모달의 대화상자 이름과 설명, 비동기 상태 영역, 참고 이미지 3종 그룹 이름을 보조기기에 노출한다. 닫기·캐릭터 선택·업로드 계열 조작부는 최소 `44px`, 보조 문구는 AA 대비를 유지하고 forced colors·reduced motion 규칙을 제공한다.
- 실제 시각 검증에서 계산값 안에 있던 긴 캐릭터명의 잔여 말줄임을 감지해 stacked 배치로 전환하고, 모바일 이미지 편집기의 프레임이 축소된 grid row 밖으로 잘리던 문제를 별도 스크롤 행으로 수정했다.
- `tests/my-info-e1-harness.html`과 기존 편집기 harness로 `1280x900`, `390x844`, `320x800`, `844x390`을 확인했다. 문서·패널·모달의 가로 overflow는 `0`, 주요 조작부는 `44px` 이상이며, 3종 촬영 안내와 FRONT `800x1200 image/webp` 결과 생성을 재확인했다.
- `tests/my-info-e1-accessibility.test.js`를 GitHub workflow에 추가했고 전체 Node 계약 `21/21`과 PR workflow 3종이 통과했다. Supabase Edge v20/API 2.7/DB375, SQL375, Storage 및 기존 Stage 1-8 계약은 변경하지 않았다.

## E-2 배포 / live / Drive / Supabase 마감

- 제품 운영 기준은 PR `#194`, commit `640b7eebcef1c13b0516fe2cd020df870bc23752`, merge commit `4b2901dfb9a4486c333729aeaaf9b3f6f1a99348`다. E-2에서 제품 코드와 Supabase 운영 구성을 변경하지 않았다.
- 로컬 `main`과 `origin/main` 일치, 전체 Node 계약 `21/21`, GitHub Pages 배포 성공과 `kinojo/live-readback` 성공을 확인했다. 제품 merge SHA의 내 정보 관련 공개 파일 `25/25`가 `kinojo.info`의 Git blob과 일치한다.
- 실서비스 harness에서 패널 Tab/Shift+Tab 순환, Escape 후 호출 버튼 초점 복귀, 3종 촬영 안내와 가이드 에셋, KINOJO 공통 슬라이더, 최소 `44px` 조작부, 가로 overflow `0`, FRONT `800x1200 image/webp` 결과를 재확인했다.
- Google Drive `01_WEB/GitHub_Pages`의 E-1 변경 manifest는 병합 로컬 바이트와 크기·SHA-256이 `26/26` 일치한다.
- Supabase `kinojo-production`은 `ACTIVE_HEALTHY`, Postgres `17.6.1.127`이다. `kinojo-member-profile` v20/API2.7/DB375 health, profile 공개/reference 비공개 5MiB 이미지 버킷, metadata/object 무결성, service-role 전용 이미지 RPC, 15분 cleanup cron, 활성 test-like 세션 `0`을 확인했다.
- 내 정보 후속 A-1~E-2는 `12/12` 완료됐으며 남은 후속 작업은 없다.

## 성역 Fold 도구 / 포스 제외 후속

- Fold 펼침 폭 `761~1180px`에서 성역 일정과 3개 요약 카드가 한 줄을 유지하도록 attached subbar 그리드를 재구성했다. `390px` 전화 폭에서는 기존 일정 축약 규칙을 유지한다.
- 본문 `공략 팁`·`성역 정보 수정`·`포스 편집하기` 버튼은 한 줄 액션 그룹으로 묶고, 탑바와 중복되던 본문 `마지막 시트 동기화` 카드는 제거했다.
- 포스 편집 모달의 `최신 정보`·`취소`·`저장`은 잠금 유지 상태 영역으로 이동했고 별도 하단 footer와 `닫기` 버튼은 제거했다. 닫기는 기존 우상단 X와 바깥 영역 동작이 소유한다.
- 캐릭터 카드를 클릭하면 선택 테두리와 우상단 `제외` 버튼이 나타난다. 제외는 기존 `DRAFT_SAVE` 변경 목록에 빈 슬롯으로 담기며, 저장 전에는 `취소`로 원복된다. Server·Supabase 계약은 변경하지 않았다.

## 검증 / 다음 행동

- 계약 검증: `node tests/my-info-image-contract.test.js`
- 가이드 자산 검증: `node tests/my-info-guide-assets.test.js`
- 공통 슬라이더 검증: `node tests/kinojo-range-control.test.js`
- 편집기 기본 검증: `node tests/my-info-image-editor.test.js`
- 안전 업로드 검증: `node tests/my-info-image-upload.test.js`
- 배치 bootstrap 검증: `node tests/my-info-batch-bootstrap.test.js`
- 프로필 이미지 선로딩 검증: `node tests/my-info-image-preloader.test.js`
- 가변 패널 너비 검증: `node tests/my-info-panel-width.test.js`
- 잘림 없는 반응형 배치 검증: `node tests/my-info-responsive-layout.test.js`
- 회귀·접근성·시각 계약 검증: `node tests/my-info-e1-accessibility.test.js`
- 성역 이전 회귀: `node tests/sanctuary-roster-quick-edit-contract.test.js`
- 공통 회귀: `node tests/web-shell-auth-contract.test.js`
- 레기온 순위 UI 회귀: `node tests/ranking-ui-contract.test.js`
- GitHub workflow는 공통 슬라이더·이미지 편집기·안전 업로드·배치 bootstrap·프로필 이미지 preloader·가변 패널 너비·잘림 없는 반응형 배치·E-1 접근성 회귀의 구문 검사, 계약 테스트, Pages exact live readback을 포함한다.
- 내 정보 후속 A-1~E-2는 모두 완료됐다. 다음 작업은 없다.

## 배너 관리자 리디자인 · Stage 0~5 현재 기준

- Stage 0~5 제품 기준은 PR `#241`, `#242`, `#244`, `#245`, `#246`, `#248`, `#250`, 게시 hotfix `#252`이며, 현재 제품 main은 merge `c1536603d19dfb69932b98ac18fd50022e47d1ce`다.
- 관리자 이미지 관리에는 메인/사이드 배너별 5단계 작성 흐름이 있다. Stage 1은 Event396 저장 기반, Stage 2는 최대 3장 누적 추가·새 묶음·순서, Stage 3은 좌우 동시/별도·페이지·일정·전환 효과/방향, Stage 4~5는 이미지별 콘텐츠 편집·검토·저장·게시를 소유한다.
- 이미지 라이브러리는 기본 미선택이고 전체 또는 분류 해시태그를 선택해 불러온다. 선택 수는 `N / 3`으로 표시하며 순서는 드래그 앤 드롭과 화살표로 바꾼다. 세로형 이미지는 카드 프레임 안에서 `contain`으로 전신을 표시하고 rollover 확대 미리보기를 제공한다.
- 기존 숫자 우선순위는 노출 횟수를 제어하지 않았으므로 UI에서 제거했다. 새 `기본 | ×1.5 | ×2.0`은 Server playlist 비율로 반영한다. 현재 배너 운영 계약은 API2.1/DB403/Event402/Upload403이다.
- 문구는 이미지 하나당 최대 3개, 꾸밈 콘텐츠는 이모지·이모티콘·스티커·뱃지 합계 최대 3개다. 레이어별 이미지 앞/뒤, 위치, 크기, 회전, 투명도를 설정하며 기본은 이미지 앞이다. 업로드한 꾸밈 에셋은 별도 관리자 라이브러리에서 다른 이미지에 재사용한다.
- 초안에는 원본과 편집 레이어를 유지한다. 전체 게시 시 원본과 콘텐츠를 별도 WebP 배너 한 장으로 합성·업로드·Server 검증하고, 공개 Manifest는 합성본만 반환한다. 합성본이 없거나 편집 뒤 stale이면 게시하지 않는다.
- Stage 5 검토는 메인/사이드와 좌우별 순서·콘텐츠를 요약하고, 고정 초안 저장·전체 게시와 누락 설정 자동 이동·강조를 제공한다. v396 orphan cleanup은 원본·재사용 꾸밈·합성본을 함께 보호한다.
- 사이드 `ALL` 독립 설정은 HOF 오른쪽을 제외한 13개 variant, HOF 단독은 LEFT 1개를 만든다. 좌·우 이미지는 2단계 선택 3장 안에서 별도로 제외·추가·정렬할 수 있다.
- Stage 5 캐시 기준은 `2026082411`이다. 전체 Node 테스트 `35/35`, PR source workflow 4종, 운영 파일 Git blob `4/4`, Edge health/Manifest/security 경계가 통과했다. 업데이트한 Chrome E2E harness는 이번 회차의 localhost URL 정책 때문에 실행하지 못했으므로 PASS로 기록하지 않는다.
- Stage 6에서 DB398과 Edge v16/API2.0을 적용해 합성 업로드 idempotency table check 누락을 수정했다. 관리자 cache `2026082412`는 `이벤트 관리` 탭, 전체 이벤트 검색·상태 필터, 같은 종류 내 목록 정렬, 전체 게시 중지, 이름 확인 영구 삭제를 추가한다. 세부 내용은 `docs/BANNER_EVENT_MANAGER_STAGE6_20260824.md`를 기준으로 한다.
- Stage 7은 이벤트 관리에 공통 `kinojo-filter-switch` 기반 `순차 | 랜덤` 스위치를 추가한다. DB400은 이벤트 그룹을 원본으로 삼아 연결 캠페인 전체에 `ORDERED/RANDOM`을 반영하고, RANDOM 이벤트만 5분 manifest 구간별 안정 해시 순서로 섞는다. 기존 이벤트, legacy 캠페인, 노출빈도는 유지한다. 세부 내용은 `docs/BANNER_EVENT_PLAYBACK_STAGE7_20260825.md`를 기준으로 한다.
- 최초 전체 게시의 합성 업로드 400은 v388 idempotency action 허용 목록에서 새 overlay/composite mutation 4종이 빠진 것이 원인이었다. PR `#252`와 DB397 migration으로 수정했으며 기존 초안은 보존한다.
- 다음 구현 순서는 Stage 7 순차·랜덤 운영 검증과 전환 효과·최종 반응형·접근성 통합 검증이다. 콘텐츠 실제 노출은 Stage 5 합성본으로 완료했다.

## 배너 이미지 관리 2차 · 1단계 페이지 셸·초기화 완료 · 2026-08-26

- 이 절이 위 `Stage 0~5 현재 기준`의 다음 구현 문구보다 최신이다. 2차 계획의 0단계 전역 이벤트 순환 교정 뒤 1단계 `1-가~1-바`를 PR `#260`으로 한 묶음 구현·배포했다. 운영 main은 `983d7d9f73082f6fab8da7efe23b2506ff1e66eb`, 관리자 cache는 `2026082601`이다.
- 메인 배너·사이드 배너·이벤트 관리·향후 이미지 라이브러리 하위 화면명을 공통 관리자 헤더의 `[이미지 관리] - …` 위치 문구로 통일했다. 작성 화면의 대형 이벤트 만들기 카드와 그 안의 새로고침은 제거했다. 기존 `admin-images.js` 위치 라벨 observer가 새 하위 문구를 `[이미지 관리]`로 되돌리지 않도록 계층 문구를 보존한다.
- 단계 지도는 정적 1~4 활성 클래스를 제거하고 실제 입력·게시 검증으로 `현재 / 완료 / 미완료 / 오류`를 계산한다. 필수 선행 입력 없이 뒤 단계를 누르면 필요한 단계로 이동해 오류 안내와 강조를 표시한다. 지도는 관리자 헤더 아래 sticky이며 모바일에서는 설명을 줄이고 가로 스크롤한다.
- 1~5단계 카드는 용도별 데스크톱·태블릿·모바일 최소 높이를 사용하고, 업로드 목록과 이미지 순서 목록은 내부 스크롤로 제한해 데이터 수·오류 문구에 따른 레이아웃 변동을 줄였다.
- 하단 고정 작업 막대에 붉은 계열 보조 동작 `내용 초기화`를 추가했다. 비울 내용이 없으면 비활성화되며, 중앙 확인 모달은 포커스 트랩·Esc·배경 클릭·포커스 복귀를 제공한다. 초기화는 현재 폼과 화면 작성 상태만 비우며 업로드된 라이브러리 자산, 게시 이벤트, 서버 기록은 삭제하지 않는다.
- 전체 게시는 Server 성공만으로 완료 처리하지 않고 `event-list`로 같은 이벤트 식별자의 `PUBLISHED/MIXED` 상태를 다시 확인한다. 확인 성공 시 작성 상태를 1단계로 자동 초기화하고 이벤트 이름·식별자·이벤트 관리 이동 버튼을 표시한다. 게시 또는 재확인 실패 시에는 재시도할 수 있도록 작성 내용을 유지한다.
- 검증은 전체 배너 Node 계약 `16/16`, PR 및 main push의 Banner Admin/Runtime 실제 Chrome E2E, KINOJO Pages, Character Refresh Profile, Pages 배포와 custom-domain live readback이 모두 통과했다. 운영 캐시 우회 읽기에서 PC 관리자 HTML, loader, workflow, bootstrap의 `2026082601` 계약을 다시 확인했다.
- 이번 1단계는 WEB 관리자 UI와 테스트만 변경했다. Supabase DB/RPC/Edge/Storage, 현재 정식 이벤트·레거시 캠페인·전역 순환 모드와 운영 게시 데이터는 변경하지 않았다.
- 다음 제품 구현은 2차 계획 2단계 `저장 이미지 제목·해시태그`이며, 시작 전 main·Drive 전용 LOG·운영 상태를 다시 읽는다.

## 배너 이미지 관리 2차 · 2단계 저장 제목·해시태그 완료 · 2026-08-26

- 2차 계획 2단계 `2-가~2-마`는 PR `#262`로 한 묶음 구현·배포했다. 운영 main은 `9d0a5bc014109274b323adf8f24886e4c6e5b195`, 관리자 cache는 `2026082602`, 운영 `kinojo-banner-media`는 v20(API 2.1 / DB 403 / Upload 403 / Event 402)이다. 누적 진행도는 **17/49**다.
- `kinojo_banner_assets`의 canonical 관리 메타데이터는 `title`과 `tags text[]`다. `display_name`은 과거 화면·RPC 호환용 표시 필드로 유지하고, 구형 insert/update가 들어오면 v403 호환 트리거가 제목·태그를 채운다. 새 RPC는 제목·태그를 저장하면서 호환 표시 이름도 함께 갱신한다.
- 기존 운영 이미지 26개를 무삭제 이전했다. `#태그 · 제목` 패턴 24개는 `AUTO_SPLIT`, 일반 이름 2개는 `PRESERVED`로 기록됐으며 이전 직후 빈/무효 메타데이터 0건, 대소문자·공백 정규화 중복 제목 0건이다. 모호한 과거 데이터는 원문을 버리지 않고 `REVIEW_REQUIRED_DUPLICATE` 경로로 보존한다.
- 제목은 이미지 추가 카드마다 `저장 이미지 제목`으로 입력한다. 파일명 stem을 기본값으로 사용하고, 현재 추가 목록과 라이브러리의 중복을 즉시 표시하며 `asset-title-check` Server 사전 확인과 업로드 직전 강제 재확인을 모두 거친다. DB unique expression index가 동시 요청 경쟁의 최종 권한이며 `BANNER_ASSET_TITLE_DUPLICATE`를 안정적으로 반환한다. 중복 경쟁으로 실패한 새 Storage 후보는 Edge가 즉시 삭제한다.
- 분류 해시태그는 선택 이미지에 공통 적용하는 최대 5개 배지 입력이다. Enter·쉼표·붙여넣기·한글 IME 조합·빈 입력 Backspace·개별 제거를 지원하고 `N / 5`와 제한 오류를 표시한다. 태그당 20자, 허용 문자, 대소문자 중복 제거 규칙은 WEB·Edge·DB가 함께 검증한다.
- 이미지 목록 API는 구조화된 `title/tags/metadataMigrationStatus`를 반환한다. 라이브러리는 계속 기본 `미선택`이며 `전체` 또는 Server 태그 배열에서 만든 필터만 펼친다. 화면 이름은 canonical title을 우선 사용하고 과거 응답에만 `displayName` fallback을 사용한다.
- 보안 경계는 기존 MASTER KWS를 재사용한다. v403 RPC는 `service_role`만 실행할 수 있고 public/anon/authenticated 권한은 철회했으며 `kinojo_banner_assets` RLS는 활성 상태다. 정책 없음 advisor는 직접 테이블 접근을 닫는 의도된 service-role-only 구조이고, 새 태그 GIN의 미사용 표시는 배포 직후라 정상이다. 기존 FK 인덱스 advisor는 이번 단계와 무관한 선행 상태다.
- 검증은 전체 banner Node 계약, 신규 v403 메타데이터 계약, 실제 Chrome 관리자 E2E, PR source CI 4종, main Pages 배포, Banner Admin byte readback, Banner Runtime Manifest ETag·PC SIDE·모바일 MAIN live 회귀를 통과했다. 로그인된 운영 Chrome에서 메인 2개·사이드 24개의 canonical 제목, 사이드 `#남/#룩북/#샤르/#여/#SITTING` 필터, 콘솔 오류 0건을 읽기 전용으로 확인했다.
- 다음 제품 구현은 2차 계획 **3단계**다. 2단계 DB/API/UI를 재작성하지 않고 운영 main·Drive 전용 LOG를 기준으로 이어간다.

## 배너 이미지 관리 2차 · 3단계 미리보기·카드·순서 UX 완료 · 2026-08-26

- 2차 계획 3단계 `3-가~3-라`는 PR `#264`로 한 묶음 구현·배포했다. 운영 main은 `83f981e5af8dd8cbc528f1040726ecf53f0a329c`, 관리자 cache는 `2026082603`, 누적 진행도는 **21/49**다.
- 업로드·라이브러리·이미지 순서·좌우별 순서의 미리보기를 공통 버튼으로 통일했다. 긴 세로 이미지는 고정된 작은 창에서 상단~중간을 빠르게 확인하고, `전체 보기`를 누르면 원본 전체를 `contain`으로 보여 주는 접근 가능한 모달을 연다. 모달은 초점 이동·Tab 순환·Escape·배경 클릭·호출 버튼 초점 복귀를 지원한다.
- 이미지 라이브러리 카드는 canonical 저장 제목을 최대 두 줄로 표시하고, 그 아래 구조화 해시태그를 세로로 최대 3개 표시한다. 나머지는 `+N`으로 축약하며 보조기기에는 전체 태그 수와 초과 개수를 전달한다. 라이브러리 기본 `미선택`과 전체/태그 필터 계약은 유지한다.
- 이미지 순서 카드는 드래그 시작 시 들림·그림자·확대를 표시하고, 대상 카드 위·아래 절반에 맞춰 삽입선을 보여 준다. 놓은 뒤에는 이동 카드 강조와 FLIP 전환을 제공한다. `prefers-reduced-motion` 환경에서는 이동 애니메이션을 생략하고 정적 강조와 `aria-live` 문장으로 결과를 알린다.
- 순서 조작은 카드 오른쪽의 확대된 `↑ / × / ↓` 세로 버튼으로 통일했다. 버튼마다 이미지 제목을 포함한 한국어 접근성 라벨을 붙였고, 카드 자체에서 `Alt+↑/↓` 이동과 `Delete/Backspace` 제거를 지원한다. 이동·제거 뒤에는 새 위치 또는 제거 결과를 음성 안내하고 다음 조작 대상으로 초점을 복원한다.
- 신규 `banner-event-phase2-stage3-preview-order-contract`와 Chrome 관리자 E2E에 긴 이미지 창/전체 모달, 태그 3개+`+N`, 세로 버튼, 키보드 이동·제거, 드래그 들림·삽입선 계약을 추가했다. 로컬 Node 계약과 headless Chrome E2E가 통과했다.
- PR과 main push의 Banner Admin, Banner Runtime, KINOJO Pages, Character Refresh Profile, Pages 배포가 모두 성공했다. Banner Admin 운영 byte readback과 Banner Runtime의 Manifest ETag·PC SIDE·모바일 MAIN live Chrome 검증도 merge commit 기준으로 통과했다.
- 재시작 뒤 인앱 브라우저에는 KINOJO 관리자 인증 세션이 없어 운영 관리자 화면은 로그인 안내로 닫혔고, 연결 가능한 외부 Chrome 세션도 없었다. 인증을 우회하거나 운영 데이터를 변경하지 않았으며, 실제 UI 동작은 동일 소스를 사용하는 Chrome E2E와 운영 exact byte readback으로 검증했다.
- 이번 3단계는 WEB 관리자 UI·테스트·검증 workflow만 변경했다. DB/RPC/Edge/Storage, 정식 이벤트·레거시 캠페인·전역 순환 모드와 운영 게시 데이터는 변경하지 않았다.
- 다음 제품 구현은 2차 계획 **4단계**다. 3단계 미리보기·카드·순서 계약을 재작성하지 않고 운영 main과 Drive 전용 LOG를 기준으로 이어간다.

## My Info 2차 · 2단계 회원 제작 요청 UI · 2026-08-26

- 2단계는 PR `#268`로 구현·검증·운영 반영했다.
- 1단계의 DB404와 `image-request-prepare/finalize/state` 계약을 그대로 사용해 회원 My Info 모달에 1~3장 일괄 제작 요청 흐름을 연결했다. 프로필 이미지 기능과 기존 참고 이미지 상태·삭제는 유지하며, 슬롯별 즉시 Server 등록 버튼만 제거했다.
- FRONT/BACK/UPPER_BODY 편집 결과는 전송 전까지 로컬에 staging한다. 0장은 차단하고 1~3장을 허용하며 선택 수를 `N/3`으로 표시한다.
- 스타일은 소년만화, 순정만화, 애니메이션, 실사풍, 직접 요청 5종이다. 추가 요청은 plain text 300자이며 직접 요청은 필수다. 스타일 미선택 시 별도 alertdialog에서 명시적으로 `스타일 없이 업로드`해야 전송한다.
- `ui/kinojo-my-info-image-request.js`가 prepare, signed upload, finalize, state readback을 소유한다. 부분 실패는 finalize하지 않으며 같은 idempotency key와 새 signed URL로 재시도하고 이미 성공한 슬롯은 건너뛴다. private bucket/object path가 응답에 나타나면 fail-closed한다.
- 실제 공통 모달에서 FRONT `800×1200 WebP` 편집, 선택 `1/3`, 미선택 확인, 애니메이션 스타일·요청문, 일괄 전송과 접수 결과를 확인했다. PC와 `390×844` 가로 overflow는 `0`, console error/warn은 `0`이다.
- 전체 Node 계약 테스트가 통과했다. 상세 계약과 검증 기록은 `docs/MY_INFO_PHASE2_STAGE2_MEMBER_UI_20260826.md`를 기준으로 한다.
- Stage 2는 WEB UI·브라우저 클라이언트만 변경하며 Supabase DB/RPC/Edge/Storage/cleanup은 Stage 1 운영 상태를 유지한다. 다음은 3단계 관리자 제작 요청 확인·처리다.

## My Info 2차 · 3단계 관리자 제작 요청 확인·처리 · 2026-08-26

- 3단계는 PR `#271` (`codex/my-page-phase2-admin-20260826`)에서 구현했으며, 운영 migration `20260826055902 member_image_request_admin_workflow_v405`와 `kinojo-member-profile` v24 ACTIVE를 먼저 readback했다.
- 기존 회원별 이미지 목록과 캐릭터 선택 구조를 유지하고, 선택 캐릭터 아래에 최신순 제작 요청 카드만 출력한다. 요청 상세는 카드 한 건을 선택했을 때만 열며 스타일·요청문·실제 첨부 슬롯·보존 상태·감사 이력을 표시한다.
- MASTER 상태 처리는 `SUBMITTED → IN_PROGRESS/REJECTED`, `IN_PROGRESS → COMPLETED/REJECTED`만 허용한다. 동일 상태 재호출은 멱등이며 실제 변경은 MASTER actor로 상태 이력에 남긴다.
- 신규 list/detail/status/asset RPC 4개는 service_role 전용이다. 목록·상세에는 private path나 URL이 없고, 미리보기·다운로드를 누른 순간에만 기존 private Storage에서 최대 60초 signed URL을 발급한다.
- request ID primary key event 표와 finalize trigger가 제작 요청 하나당 관리자 event 하나만 만든다. 공통 알림은 `IMAGE_REQUEST:<requestId>` 하나로 정규화하며 slot별 업로드 알림과 중복시키지 않는다.
- 관리자 모달은 PC 요청 카드 2열·첨부 3열, 모바일 1열과 내부 스크롤을 사용한다. 실제 브라우저 mock에서 선택 전 상세 없음, 선택 후 요청 한 건 상세, `390×844`/`320×700` 가로 overflow 0을 확인했다.
- 신규·기존 Node 회귀, 운영 RLS/ACL/trigger/Edge health, 무인증 401, Supabase advisor를 통과했다. 세부 계약은 `docs/MY_INFO_PHASE2_STAGE3_ADMIN_WORKFLOW_20260826.md`를 기준으로 한다.
- 다음은 4단계 통합 검증·배포·문서 마감이다. 1~3단계의 Server·회원 UI·관리자 처리 계약을 재작성하지 않는다.
