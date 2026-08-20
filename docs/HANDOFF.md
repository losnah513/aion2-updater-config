# KINOJO WEB HANDOFF

기준일: 2026-08-20 KST

## 저장소 / 현재 기준

- GitHub: `losnah513/aion2-updater-config`
- 운영 브랜치: `main`
- 레기온 트리 최신 운영 exact-readback 검증 commit: `9e4006a12e8e7295add7f1e8bef5b656739ac7df`
- 레기온 트리 전용 live readback: `legion-tree/live-readback = success`
- 검증 Actions run: `32349542958`
- Drive 활성 WEB source 동기화 시 fresh main snapshot: `8f9755d55ec3c2cf4ef10144bef23dd26a0d3e9c`
- 위 snapshot의 후속 병행 커밋은 reference 이미지 프로젝트의 임시 검증 workflow 정리이며 레기온 트리 대상 source를 변경하지 않았다.
- Drive source 동기화 후 문서 마감 직전 fresh main `14dd3f0385768cdcfe0935ce1e2bf7107a578faa`까지 재확인했다. 이 후속 변경도 병행 내 정보 6-D 임시 workflow 제거로 레기온 트리 대상 source와 무관했다.

## 레기온 트리 가-0 상태

- **완료**.
- 공식 경로: PC `/legion-tree/`, 모바일 `/m/legion-tree/`.
- Topbar·Drawer·서브바의 레이아웃 구조와 형태는 기존 KINOJO 공통 프레임을 그대로 재사용한다.
- 서브바 내부 기능은 본캐 이름 / 부캐 이름 / 천족·마족 미리보기 / 서버 / 추가 / 초기화 / 조직도 편집 자리만 준비된 scaffold이며 실제 Server 작업은 후속 단계다.
- 새 디자인은 조직 단계, 역할 명패, 구성원 카드, 트리 분기 등 레기온 트리 본문에 한정한다. Topbar에 페이지명이 있으므로 본문의 중복 `레기온 트리` hero 제목/설명은 제거했다.

## 가-0에서 보정한 문제

1. `ui/kinojo-event-notice.js`와 `legion-tree/js/legion-tree.js`의 이중 Topbar/Drawer 삽입을 제거했다.
2. `ui/kinojo-common-navigation.js`가 기존 공통 DOM/class를 사용해 `레기온 순위 → 레기온 트리 → 미터기` 순서로 항목 하나만 등록하고 legacy duplicate를 제거한다.
3. `core/kinojo-route-guard.js`가 공개 페이지에서 공통 navigation 모듈을 bootstrap하며 `/admin/`은 제외한다.
4. 레기온 트리 서브바 outer는 기존 `.hof-filter-bar`, 입력·버튼은 기존 control 규격을 사용한다.
5. `home.html` / `m/index.html`의 임시 별도 미리보기 카드는 제거했다.
6. 작업별 루트 `LEGION_TREE_FOUNDATION.md`는 삭제하고 저장소 단일 `docs/HANDOFF.md`만 유지한다.

## 운영 검증

- PR `#138`: 제품 공통 프레임 보정 squash merge.
- PR `#139`: Legion Tree source + live exact-readback workflow 추가.
- PR `#140`: `legion-tree/live-readback` commit status 추가.
- Chromium/Playwright DOM 회귀검증 PASS: 과거 두 legacy hook을 늦게 재삽입해도 Topbar/Drawer `레기온 트리`는 각각 1개만 유지한다.
- 운영 commit `51540e7714a08565c8ec6854512c27a05a0dcd82`에서 `legion-tree/live-readback=success`; run `32342372751`.
- live exact 대상: `legion-tree/index.html`, `m/legion-tree/index.html`, `legion-tree/css/legion-tree.css`, `legion-tree/js/legion-tree.js`, `ui/kinojo-common-navigation.js`, `core/kinojo-route-guard.js`, `ui/kinojo-event-notice.js`, `home.html`, `m/index.html`.

## Drive 활성 source

- `01_WEB/GitHub_Pages/legion-tree/`, `m/legion-tree/` 추가 완료.
- common navigation / route guard / home / mobile home / 전용 verify workflow 동기화 완료.
- `ui/kinojo-event-notice.js`는 기존 Drive source가 이미 main과 exact라 유지했다.
- Drive raw readback Git blob exact match:
  - PC index `af729f323236a93b27d867bcd882794b1b1c73d0`
  - CSS `0b4e64ff291c65ec6e91bee2eef5e678971cb1d7`
  - JS `5b5fc0a4236c5705544961f8afffe7d26e3434f0`
  - mobile index `befb77ce15cc096df58350804447063a11cc981b`
  - common navigation `3c7d2ae55de9bfa16c7cf7c32f109fdb2df7c533`
  - route guard `321071dd34195d27fc96065e4c9a936d58ecccb7`
  - event notice `62a32bc07e7a2a8e98d653b23b93c6ee1f83f67d`
  - home `b5b0261910726ef334bed35f4bcaf01b0beca82a`
  - mobile home `4f017e9287c121a8a1ee2c062fc978852fd3cd98`
  - verify workflow `90cde644f8c88364b25b8a50088ad753a90d1d3c`

## 변경하지 않은 영역

- Supabase SQL/Edge/Storage 변경 없음.
- Google `list` / AppsScript_MASTER 변경 없음.
- 캐릭터 추가·공식 조회·조직도 저장/편집 Server 기능은 아직 시작하지 않았다.

## 다음 행동

- 서브바 후속 보정은 PR `#142`, compact 정렬 PR `#144`, 중앙 정렬/중복 hero 제거 PR `#145`까지 운영 반영 완료했다. 최신 main `9e4006a12e8e7295add7f1e8bef5b656739ac7df`, live readback run `32349542958` success.
- PC 기준 본캐/부캐 입력은 각각 110px이며, `본캐 → 부캐 → 천족/마족 → 서버 → 추가 → 초기화 → 조직도 편집` 순서로 중앙 정렬된다.
- `천족 / 마족` 선택은 현재 `disabled` 미리보기 UI만 존재한다. 실제 기능 단계에서는 천족 선택 시 천족 서버만, 마족 선택 시 마족 서버만 노출하고, 종족 전환으로 기존 서버 선택이 유효하지 않게 되면 서버 선택을 초기화한다. 공식 캐릭터 존재 여부와 최종 서버 검증은 Server가 담당한다.
- 다음 작업은 **`가-1`만** 진행한다.
- 작업 시작 전 Drive/GitHub/Supabase 현재 상태를 fresh readback하고, 병행 작업과 충돌하지 않는지 확인한다.
- 가-1 이후도 한 번에 한 하위 작업씩 진행한다.

## 2026-08-20 서브바 후속 보정 마감

- PR `#142`: Topbar-attached subbar + 천족/마족 preview.
- PR `#144`: 본캐/부캐 110px compact + 서버 옆 액션 정렬.
- PR `#145`: 서브바 전체/세로 중앙 정렬 + 본문 중복 hero 제거.
- 최신 운영 main: `9e4006a12e8e7295add7f1e8bef5b656739ac7df`.
- live readback: `legion-tree/live-readback=success`, run `32349542958`.
- Drive source exact blobs: PC HTML `af729f323236a93b27d867bcd882794b1b1c73d0`, mobile HTML `befb77ce15cc096df58350804447063a11cc981b`, CSS `0b4e64ff291c65ec6e91bee2eef5e678971cb1d7`.
