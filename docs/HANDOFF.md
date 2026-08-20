# KINOJO WEB HANDOFF

기준일: 2026-08-20 KST

## 저장소

- GitHub: `losnah513/aion2-updater-config`
- 운영 브랜치: `main`
- HANDOFF 동기화 시 main 기준 SHA: `8dad5053012d893b9e8bd76093ffc08e6cf73743`
- 현재 작업 브랜치: `fix/legion-tree-foundation-shell-20260820`
- 검증된 구현 head (HANDOFF 문서 추가 전): `aec3fd0bc621224f11291ff861ef5ffc5396e95c`
- 현재 작업 브랜치 head는 `fix/legion-tree-foundation-shell-20260820` ref를 fresh readback해 확인한다. HANDOFF 자체 커밋 때문에 숫자 SHA를 이 줄에 고정하지 않는다.

## 현재 상태

- `레기온 트리` 가-0 최초 구현은 운영 main에 들어갔지만 공통 프레임 규칙 위반이 확인되어 완료 판정을 취소했다.
- 확정 문제:
  1. `ui/kinojo-event-notice.js`와 `legion-tree/js/legion-tree.js`가 Topbar/Drawer의 `레기온 트리`를 각각 삽입해 중복될 수 있었다.
  2. 레기온 트리 서브바를 기존 KINOJO bar/control 대신 독자 `legion-tree-toolbar/field/action` 구조로 만들었다.
  3. 메인/모바일 본문에 별도 `레기온 트리 미리보기` 진입 카드가 추가되어 기존 페이지 레이아웃을 불필요하게 변경했다.
  4. 루트 `LEGION_TREE_FOUNDATION.md`는 작업별 별도 문서라 Workflow 규칙과 맞지 않았다.

## 사용자 확정 UI 원칙

- Topbar·Drawer·서브바의 **레이아웃 구조와 형태는 기존 KINOJO 공통 구조를 그대로 사용**한다.
- 서브바 내부 기능은 레기온 트리 전용 기능을 사용할 수 있다.
- 새 디자인·레이아웃은 레기온 트리 본문(조직 단계, 역할, 구성원 카드, 트리 분기, 편집 UI)에 한정한다.

## 보정 브랜치 구현

- `ui/kinojo-event-notice.js`: 레기온 트리 menu hook 제거.
- `legion-tree/js/legion-tree.js`: menu/page-identity 삽입 제거, 페이지 이벤트만 유지.
- `ui/kinojo-common-navigation.js`: 기존 `#kinojoTopNav` / `#sideDrawer` DOM과 기존 class를 사용해 `레기온 순위` 다음에 `레기온 트리` 한 항목만 등록하고 legacy duplicate를 제거한다.
- `core/kinojo-route-guard.js`: 공개 페이지에서 공통 navigation 모듈을 bootstrap하며 `/admin/`은 제외한다.
- `legion-tree/index.html`, `m/legion-tree/index.html`: 공통 layout/components/public-shell을 로드하고 서브바 outer를 기존 `.hof-filter-bar`로 변경.
- `legion-tree/css/legion-tree.css`: 서브바 outer geometry는 소유하지 않고 내부 신규 기능 배치 + 본문 트리/카드만 소유한다.
- `home.html`, `m/index.html`: 최초 가-0의 별도 미리보기 진입 카드 제거, route guard cache-bust.
- `LEGION_TREE_FOUNDATION.md`: 삭제.

## 검증

- Chromium/Playwright DOM 회귀검증 PASS.
- 레기온 트리 페이지에서 과거 두 종류의 legacy hook을 250ms 지연 삽입해도 Topbar/Drawer의 `레기온 트리`는 각각 1개만 유지.
- 메뉴 순서: `명예의 전당 → 레기온 순위 → 레기온 트리 → 미터기`.
- 레기온 트리 활성 상태, 페이지 제목/identity PASS.
- 일반 페이지 기존 active 메뉴 보존, 임시 preview entry 제거 PASS.
- 초기 persistent MutationObserver 방식의 self-loop 가능성을 브라우저 테스트로 발견해 제거했다. 최종안은 bounded stabilization만 사용한다.
- main 대비 최종 변경 범위는 레기온 트리/공통 bootstrap/잘못된 초기 가-0 제거에 한정하며 다른 기존 페이지 본문 변경은 0건이다.

## Drive 상태

- `00_README_FIRST.md`, `01_WEB/GitHub_Pages/README.md`, `00_RULES/KINOJO_COMPONENT_RULES.md`, `04_DOCS/PROJECT_LOG/260820.md`는 현재 브랜치 보정 상태와 운영 반영 대기 상태를 기록했다.
- Drive `01_WEB/GitHub_Pages` 활성 source는 아직 보정 브랜치로 덮어쓰지 않았다. 운영 `main` 병합 전에는 GitHub main과 다른 브랜치 source를 Drive 활성 기준본으로 만들지 않는다.

## 다음 행동

1. 사용자에게 GitHub publication(PR/merge) 명시 승인을 받는다.
2. `fix/legion-tree-foundation-shell-20260820` → `main` PR 생성 후 Verify KINOJO Pages를 확인한다.
3. 승인된 방식으로 main 병합 후 GitHub Pages 배포를 확인한다.
4. `kinojo.info`에서 cache-bust live readback으로 Topbar/Drawer 단일 항목, PC/mobile 레기온 트리, 서브바 공통 프레임을 확인한다.
5. 그 main exact source를 Drive `01_WEB/GitHub_Pages`에 동기화하고 각 파일 readback을 Git blob과 대조한다.
6. 본 HANDOFF의 main SHA/상태를 갱신하고 당일 로그에서 가-0을 완료 처리한다.
7. 그 전에는 `가-1`로 넘어가지 않는다.

## 변경하지 않은 영역

- Supabase SQL/Edge/Storage 변경 없음.
- Google `list` / AppsScript_MASTER 변경 없음.
- 캐릭터 추가·조직도 편집의 실제 Server 기능은 아직 시작하지 않았다.
