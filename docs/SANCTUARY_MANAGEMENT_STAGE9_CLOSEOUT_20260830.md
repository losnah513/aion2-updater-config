# 성역 관리 Stage 9 종료 기준

기준일: 2026-08-30 KST  
프로젝트 상태: **CLOSED · 77/77**  
운영 계약: **sanctuary-management Edge API 2.2 · DB 452**

## 사용자 화면

- 지원 모달은 실제 캐릭터 카드를 PC 한 줄 4개까지 압축하고 마지막에 `랜덤 부캐 신청하기`를 표시한다. 카드 내부의 중복 상태 문구는 제거하고 선택 결과는 `n포스 캐릭터 선택` 제목 옆과 하단 요약에만 표시한다.
- 운영·전체 포스·지원·팀 생성·팀 편집의 캐릭터 카드는 클래스 아이콘을 가장 왼쪽에 두며, 슬롯 번호는 흐린 중앙 배경으로 표시한다. 전투력은 공용 전투력 아이콘과 소수점 한 자리 `000.0K` 형식을 사용한다.
- 캐릭터명은 6글자까지 서버명과 겹치지 않게 확보하고 7번째 글자부터 흐림 처리한다. 요구 클래스가 지정된 빈 슬롯은 70% 불투명도 클래스 아이콘과 `[클래스명] 클래스 슬롯`으로 표시한다.
- 팀 생성·편집 배치 조건은 전투력과 아이템 레벨 중 하나만 선택한다. 성역 3은 보통/어려움 난이도를 선택하고 운영 팀에는 초록 보통 또는 붉은 어려움 배지를 표시한다.

## Server 규칙

- `sanctuary_master.metadata.entryModes`가 입장 최소 아이템 레벨의 유일한 원본이다. 성역 1은 2700, 성역 2는 3500, 성역 3 보통은 4300, 어려움은 4500이며 성역 4는 확정 전까지 최소값을 강제하지 않는다.
- 후보, 연결 부캐, 지원, 랜덤 부캐, 구성 저장의 모든 Server 경로가 같은 최소 아이템 레벨을 다시 검사한다. WEB 숫자는 표시와 입력 보조일 뿐 권한 원본이 아니다.
- 공식 캐릭터 상세의 `profile.combatPower`와 `stat.statList[type=ItemLevel]`을 읽어 `character_master.latest_pve_combat_power`와 `latest_pve_item_level`에 저장한다. 공식 결과를 materialize한 뒤에는 다음 성역 검색에서 캐릭터 마스터를 먼저 조회한다.
- `부캐 선택` 노출은 현재 로그인 사용자의 소유 관계에만 의존하지 않는다. 활성·비제외 `character_master` 연결 부캐가 존재하는 본캐면 Server가 `canSelectAlts=true`를 반환한다.
- 랜덤 부캐 지원은 설명용 가상 캐릭터를 저장하지 않는다. Server가 실제 소유자와 성역 최소 아이템 레벨을 충족하는 활성 연결 부캐 하나를 안정적으로 선택해 지원 항목을 만든다.

## LIST 시트 확장 검토

- 성역에서 공식 조회 후 확정한 신규 캐릭터를 `character_master`에 저장하고 다음 검색에 포함하는 경로는 현재 운영 계약에 포함된다.
- LIST 시트에도 신규 행을 반영하는 것은 가능하다. 기존 `lookup-list-sync`는 `appendIfMissing`, 쓰기 뒤 LIST 재조회 검증, 행 번호 확정, 실패 재시도 계약을 이미 갖고 있다.
- 다만 성역 팀 저장 요청에서 Apps Script를 직접 기다리게 하거나 폐기한 성역 Sheet bridge를 복원하지 않는다. 후속 구현 시에는 DB materialize 성공 뒤 `(server_id, normalized_character_name)` 고유 키를 가진 별도 outbox를 적재하고, 전용 worker가 일반 lookup LIST sync에 전달하는 단방향 구조를 사용한다. 시트 실패는 팀·포스 저장을 되돌리지 않는다.
- 이 문서 작성 시점에는 LIST 자동 내보내기를 활성화하지 않았다. 운영 정책 승인 뒤 별도 단계로 구현·배포한다.

## 검증과 운영 경계

- migration: `20260830200000_sanctuary_management_item_level_difficulty_v452.sql`, `20260830201000_sanctuary_master_entry_modes_v452.sql`
- Edge: `supabase/functions/sanctuary-management/index.ts`
- WEB: `sanctuary-management/js/sanctuary-management.js`, `sanctuary-management/js/sanctuary-management-draft.js`, `sanctuary-management/js/sanctuary-management-support.js`와 대응 CSS, PC·모바일 `/sanctuary/`
- 계약: `tests/sanctuary-management-stage9-contract.test.js` 포함 성역 관리 계약 28개가 통과한다. Deno/브라우저 JS 구문 검사와 `git diff --check`도 통과한다.
- 로컬 브라우저는 공개 PC, 공개 390px 모바일, 로그인 mock 편집 PC/모바일, 지원 모달을 확인했다. 가로 overflow와 직접 페이지 console warning/error는 0이다.
- Stage 7의 정확한 백업·전환·복구 경계는 `SANCTUARY_MANAGEMENT_STAGE7_CLOSEOUT_20260830.md`를 계속 따른다.
