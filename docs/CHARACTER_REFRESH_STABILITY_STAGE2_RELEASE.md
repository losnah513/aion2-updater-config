# 캐릭터 조회 안정화 4차 · Stage 2 릴리스 준비

이 문서는 배포 실행 지시가 아니다. 3단계 승인·최신 drift 확인 뒤 실행한다.

## 고정 소스와 실행 순서

같은 basename의 `supabase/migrations/` 파일이 canonical Source이자 실행 SQL이다. 중복 적용하지 않는다.

| 순서 | CLI migration | LF Source/Deploy SHA-256 |
|---|---|---|
| 1 | 20260908053907_character_refresh_identity_and_list_guards.sql | e1b164f325825f6056158bca99c95c7e7a4eb9ccb774e87d810f80bd0324cf5e |
| 2 | 20260908060546_character_refresh_retry_generation_guards.sql | 51fe8457cca54703a7d6a4bd546fd578e934779605e721e589c2f866a893d22e |
| 3 | 20260908062618_character_refresh_eligibility_and_restore.sql | e83017265076b4b3cc6844a8d9fd1a56a72609e0856257769adf7cf77bc487ae |

로컬 분리 패키지: `.codex-tmp/character-refresh-stage2-release/{Source,Deploy}/`에 위 3개 파일 각각 생성, 3쌍 raw SHA 동일 확인. 이 파생 패키지는 ignored이며 저장소 원본에서 LF로 재생성 가능하다.
Drive SQL_INDEX를 실제 읽었을 때 최신은 **475**였다. 다른 PC와 번호 충돌을 막기 위해 운영 숫자 번호는 예약/게시하지 않았으며, 3단계 직전 최신 INDEX 기준으로 등록한다. 준비본을 운영 적용본으로 표시하지 않는다.

## 호환 배포 단위

1. 기존 Worker/새 시작을 안전하게 중단하고 진행 중 Queue/lease와 관리자 변경을 확인한다. 운영 대상·기대값·복구 범위를 고정한다.
2. 실제 DB의 기존 함수/트리거/ACL/schema drift를 이 브랜치의 기준과 대조한다. CLI migration 세 개를 순서대로 적용한다. 전체 db push로 무관 migration을 밀어 넣지 않는다.
3. 기존 AppsScript_MASTER의 BRIDGE.gs를 교체하고 Sheets API/OAuth 및 `MASTER_ID_V1` health를 확인한다. 기존 Drive source ID: `1fXpvnVoALky9ceQ-1Hn97IEyRB9HJBkT`. 새 Apps Script/브릿지를 만들지 않는다.
4. 기존 Edge: character-identity-recovery API295.5, lookup-list-prepare API1.1, lookup-list-sync API1.2.6, character-refresh-worker API295.10. lookup-sheet-bridge 라우터는 그대로 재사용한다.
5. Web: core/kinojo-supabase-features.js, admin/js/admin-characters.js, admin-bootstrap.js, admin.js, PC/mobile admin index. 배너의 cache2026090804는 보존하고 바뀐 캐릭터 모듈/관리자 core URL에 `character=2026090801`을 추가했다.
6. 실제 인증/권한·소수 canary·중단/재시도·DB/list readback·전체 시간 검증 후에만 Worker 정상 운용과 전체 최신화. 단계2 로컬 PASS를 이 게이트의 대체 증거로 쓰지 않는다.

## 롤백

- Worker/관리자 쓰기를 먼저 멈춘다. 신원/상태 데이터, Queue, metadata, 감사 이력은 자동 역변경·삭제하지 않는다.
- DB 함수 rollback은 `supabase/rollbacks/`의 같은 basename을 **3→2→1 역순**으로 적용한다. 3번만 복구하면 staged predecessor 함수로 돌아가며 새 정책 열·데이터는 보존하고 신규 관리자 쓰기 RPC를 닫는다.
- 정책 열을 보존하는 것과 옛 코드가 정책을 해석하는 것은 다르다. 그룹/개별 제외를 옛 코드로 우회하지 않는지 재검증하기 전에는 Worker를 재시작하지 않는다. v2 generation을 비활성화하면 복구 탐색도 중단된 상태로 둔다.
- Edge/Web는 맞는 이전 버전으로 함께 복구한다. Bridge의 옛 positional writer를 무작정 재활성화하지 않는다. 실제 행/신원 역수정은 현재 metadata·키·감사 이력을 확인한 제한 대상만 별도 수행한다.
- DB470 list 누락 자동 탈퇴 금지와 DB461 이전 시 레기온 원자 해제는 유지해야 한다.
- 새 rollback의 구문과 행/정책/이력 보존은 로컬 PGlite에서 확인했다. 운영 로그인/트리거/동시성 테스트는 별도다.

## 규칙 변경안 — 운영 반영 때 해당 소유 문서의 조항만 갱신

- SERVER_DATABASE: 이름 힌트만 허용한다는 옛 복구 제한을 수정하되, charKey를 검색 keyword로 보내는 금지는 유지한다. 문자열 charKey를 공식 info의 characterId 인자로 수집하는 관측 기반 경로만 허용한다. 전수·동일 키/클래스/종족/서버·단일 결과·암호화 ID 재검증·stale fence를 필수로 한다.
- 조회 자격/관계/Queue/삭제후보 최종 판정은 DB, 공식 수집·호출 제어는 기존 Edge, 시트 입출력은 Apps Script, Web는 표시/명시적 입력으로 유지한다.
- 조회 제외와 미노출을 분리하고 list 행 삭제는 제외 신호로 사용하지 않는다. 관리자 확인 근거 없이 능력치 정체를 게임 중단으로 판정하지 않는다.
- H 삭제후보 명시 쓰기/해제, Master ID metadata, Queue의 부분 성공 보존 및 정확한 readback을 해당 Bridge README와 운영 소스에 동일 ID로 반영한다.
- Drive 운영 소스/SQL Source·Deploy·INDEX, 관련 규칙·README는 3단계의 실제 배포본과 일치시켜 readback한다. 지금 운영 파일을 미배포 코드로 덮지 않는다.
