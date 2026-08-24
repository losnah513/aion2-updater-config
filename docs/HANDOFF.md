# KINOJO WEB HANDOFF

기준일: 2026-08-23 KST

## 저장소 / 현재 기준

- GitHub: `losnah513/aion2-updater-config`
- 운영 브랜치: `main`
- 내 정보 E-1 제품 운영 commit: `640b7eebcef1c13b0516fe2cd020df870bc23752` (PR `#194`)
- 내 정보 후속 A-1~E-2: 12/12 완료
- My Info / 관리자 이미지 모달 추가 UI 후속: PR `#197` 구현·배포·동기화 기준 CLOSED · 수동 실브라우저 sanity check는 post-close 보류
- 레기온 순위 통합 패널: PR `#164` 병합 완료
- Google Drive의 `00_README_FIRST.md`, `KINOJO_MASTER_RULES.md`, `KINOJO_WORKFLOW_RULES.md`, `KINOJO_COMPONENT_RULES.md`, 최신 일일 로그를 작업 규칙 원본으로 사용한다.
- GitHub `main`은 WEB 코드 원본이고, 실제 Supabase·GitHub Pages 상태는 운영 원본이다.

## 레기온 트리 마-2~마-6 / 사-1~사-7 / 아-1

- PC·모바일 페이지가 공개 RPC `kinojo_web_get_legion_tree`의 `web-legion-tree-v1` / DB 365 계약을 읽어 깡·낮·밤·키나노동조합을 Server 순서대로 렌더링한다.
- 2026-08-24 운영 readback 기준 실제 구성원은 깡 41명, 낮 4명, 밤 2명, 키나노동조합 42명으로 총 89명이다.
- 종족 선택은 v372 Server reference의 천족/마족 각 21개 서버만 표시하며, 종족 전환 시 호환되지 않는 선택 서버를 즉시 초기화한다.
- 실제 구성원 카드는 Server `className`을 수호성→templar, 검성→gladiator, 살성→assassin, 궁성→ranger, 마도성→sorcerer, 정령성→elementalist, 치유성→cleric, 호법성→chanter, 권성→fighter의 공용 9종 아이콘으로만 연결한다. 공백·표시용 괄호 수식은 정규화하되 unknown/빈 값은 추측하지 않고 `?` fallback으로 닫는다.
- 2026-08-24 운영 readback의 89명 직업 분포는 수호성 7, 검성 6, 살성 7, 궁성 15, 마도성 10, 정령성 9, 치유성 17, 호법성 12, 권성 6이며 현재 unknown/null은 0명이다.
- 캐릭터 카드의 기존 본캐/부캐 스타일과 긴 이름 페이드 규칙은 유지한다. PC는 최대 5열, 모바일은 2열이다.
- 운영 Server가 반환한 `DEFAULT_FALLBACK` 구조에는 `기본 단계` 표식을 붙이고, 배정 구성원이 0명인 role은 group 배열 유무와 관계없이 `지정 전`으로 표시한다.
- 계약 버전, 필수 4개 레기온, Server stage 구조 또는 fallback 상태가 맞지 않으면 브라우저에서 임의 fallback을 만들지 않고 오류 상태로 닫는다.
- 레기온 트리 진행도는 **44/115**다. 다음 원본 단계는 **아-2**이며 이번 변경에서는 선행하지 않는다.

## 내 정보 이미지 기존 완료 상태

- 기존 내 정보/캐릭터 이미지 Stage 1-8은 `80/80` 완료 상태이며 재구현하지 않는다.
- 운영 Edge 기준은 `kinojo-member-auth` v2, `kinojo-member-profile` v20(API 2.7 / DB 375), `kinojo-member-image-download` v2, `kinojo-member-image-cleanup` v5다.
- `kinojo-member-profile` 버킷은 공개, `kinojo-member-reference` 버킷은 비공개다.
- 참고 이미지는 최대 7일 보존하며 cleanup cron은 `*/15 * * * *`로 활성화되어 있다.
- 관리자 이미지 SQL 367/371은 `service_role` 전용이다.


## 2026-08-23 참고 가이드 PNG 후속

- FRONT/BACK/UPPER_BODY 촬영 가이드는 기존 SVG에서 투명 PNG로 교체했다. 활성 경로는 `front-2x3.png`, `back-2x3.png`, `upper-body-4x5.png`이며 각각 800×1200, 800×1200, 800×1000이다.
- PNG는 얼굴·의상 채움 없이 캐릭터 외곽선과 머리카락 방향, 반투명 프레임/가이드만 표시한다. 기존 `<img>` overlay 구조를 재사용하며 가이드는 WebP 결과 픽셀에 포함되지 않는다.
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
