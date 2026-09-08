# 캐릭터 조회 안정화 4차 · 2단계 구현 진행

상태: **WIP — 2단계 전체 미완료, 운영 배포 금지** (2026-09-08).
기준 main: `1fff16e807e62a1908f22b6dc59f571c86877284`.
브랜치: `codex/character-refresh-stability-stage2`.
계획: https://drive.google.com/file/d/1aPfADtwHFXo1_ZP6Zj3HkD7eGyOVrZxD/view
로그: https://drive.google.com/file/d/1k0R6heq6ttLl9IKFm_q1_EGm4FCxmVbQ/view

## 구현한 수정안

- 기존 Identity Edge 안에서 문자열 charKey 직접 info 탐색, 같은 종족 서버 전수 확인, 클래스/키/서버/종족 검증, 암호화 ID 재검증. 이름이 같은 다른 키를 후보로 만들지 않는다. 기존 Worker의 정상 조회 진입 조건은 유지한다.
- service-role 전용 DB checkpoint와 기존 PLAYNC rate row 공유. 진행 상태의 key/class/server catalog/5분 만료 검사. 불완전 결과는 적용하지 않고 이어서 탐색한다. 55초 호출 예산/700ms 간격은 검증용 초깃값이며 운영 SLA가 아니다.
- 다른 key/class/race pending 후보 표시·생성 제한과 기존 승인 경로의 재조회 요구. 거절과 과거 이력은 보존한다.
- 자동/관리자 적용에 클래스 검증, 관리자 서버 이전에 기존 레기온·조직 배치 원자 해제 추가. 신원 확인만으로 수동 비활성이나 통계 최신화 시각을 바꾸지 않는다. 가족 이름 전파는 Master 연결 ID 기준, 이름만 있는 회원 연결은 동명이인 시 전파하지 않는다.
- list Queue identity flags 보존, Edge 전달, 변경된 A 표시명 기준 readback, Server가 명시한 G만 쓰기. Apps Script가 이름만 보고 다른 행의 G를 일괄 변경하지 않는다.
- H 상태 원문과 전체 읽기 표시 전달, Server prepare의 _D/H 삭제후보 사전 제외 및 DB 기록. Target context에서도 기존 제외 상태를 재확인한다.
- readback 열별 실패 상세 보존, Queue 상태 PATCH 실패 시 완료 차단. Apps Script 요청 45초 제한, timeout 이후 다른 인코딩으로 무작정 쓰기 반복하지 않는다.
- Worker identity_resolve / snapshot_precheck / snapshot_submit / target_finalize 시간 계측. 이는 기존 35~43분 지연의 해결 또는 특정 SQL 원인 확정을 의미하지 않는다.

## 소스와 배포 경계

- `supabase/functions/lookup-list-sync/index.ts`: 운영 v6/API1.2.3을 가져와 수정한 API1.2.4 초안.
- `apps-script/list-master/BRIDGE.gs`: Drive 기존 ID `1fXpvnVoALky9ceQ-1Hn97IEyRB9HJBkT` 기준본의 수정안. 새 활성 브릿지가 아니다. Drive 운영 소스와 Apps Script에는 아직 반영하지 않았다.
- Identity: 운영 v14/API295.2 기준 수정안 API295.3. Worker: 운영 v42/API295.9 기준 계측 변경.
- CLI 생성 migration: `20260908053907_character_refresh_identity_and_list_guards.sql`. 대응 rollback은 같은 basename의 rollbacks 파일. 모든 변경은 로컬이며 운영 migration 적용 없음.
- 운영 배포 전 최신 함수 drift/ACL 검증, Source/Deploy 숫자 파일 및 SQL_INDEX 동기화, 기존 인증·활성 세션 보호 확인이 필요하다.

## 로컬 검증

### 추가 경계 검증 — 2026-09-08, 배포 게이트 실패

`node tests/character-refresh-stability-adversarial.test.cjs`: 10개 중 5 PASS / 5 FAIL (exit 1). 제품 코드는 수정하지 않았으며 테스트와 검증 기록만 추가했다. 증거는 `tests/evidence/20260908-character-refresh-stage2/verification.json`이다.

- FAIL: 같은 이름 변경 Queue를 그대로 재시도하면 첫 쓰기는 성공하지만 옛 원본 이름으로 행을 찾지 못한다.
- FAIL: 시트 쓰기 직전 사용자 행 이동을 모의하면 무관한 캐릭터의 전투력 999가 300으로 덮인다. Script lock은 사용자 행 이동을 막지 못한다.
- FAIL: `readComplete=false`인 부분 readback에도 list Edge가 `finished=true`를 반환한다.
- FAIL: 이미 synced된 Queue 경로에서 서버 완료 기록 `ok=false`여도 Edge가 `ok=true,finished=true`를 반환한다.
- FAIL: checkpoint 만료 후 새 탐색이 시작되면 이전 탐색의 늦은 저장을 거절하지 못해 완료 서버/후보가 섞인다. 세대 또는 revision 비교가 필요하다.
- PASS: 정상 readback 완료, 정상 Target context, _D/명시적 DB 제외/삭제후보 사유 각각에 대한 DB context→Worker 경로 공식 API 호출0.

기존 4종 테스트도 재통과했다. 그러나 전체 통합 검증 성공을 의미하지 않는다. H 원문→prepare 전체 과정, 실제 권한, 운영 스키마의 관계 commit/rollback, 완전 동시성/실운영 성능은 아직 검증하지 않았다. 먼저 위 5건을 수정한 뒤 동일 테스트가 통과하는지 확인해야 한다.

다음 네 명령 모두 통과했다. 실제 운영 API/DB/list를 수정하는 테스트가 아니다.

```text
node tests/character-refresh-stability-stage2.test.cjs
node tests/character-refresh-stability-sql.test.cjs
node tests/character-refresh-identity-stage2-fixtures.test.js
node tests/character-identity-recovery-percent-encoding-contract.test.js
```

SQL 테스트는 `.codex-test-runtime`에 로컬 설치한 `@electric-sql/pglite`를 사용한다. 재현 환경에서 `npm install --prefix .codex-test-runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite`로 준비한다. 새 migration/rollback 생성 문법, checkpoint 만료·재개·키/카탈로그 불일치, 전역 호출 예약, service-only ACL을 검증했다. 기존 운영 함수 전체 실행 및 관계 commit/rollback의 통합 검증은 아직 아니다.

Bridge mock에서는 A 이름 변경과 G 갱신 후 readback, H 보존, 다른 행 G 미변경, 기대 이름 갱신 후 재호출 시 추가 쓰기 0, 원본 신원 없는 행번호 쓰기 차단을 확인했다. 실제 동시 사용자 편집/삭제와 stale Queue 재시도는 아직 검증하지 않았다.

## 남은 2단계 작업 — 완료로 넘기지 말 것

1. 현재 성역 일정·관리 레기온·그룹 기본/개별 예외·수동 제외 우선순위와 7일 관계 재검토를 실제 Queue 선택/관리자 표시까지 통합.
2. 적격 DB-only 캐릭터의 현재 공식 소속 확인 후 list 복원. 완전 읽기 증명, stable Master ID dedup, 최신 행 재탐색, 충돌/사용자 재등록/행 이동 보호, exact readback 후 list_row commit.
3. 새 이름과 옛 이름 소유자를 각자의 key로 확인하는 충돌 처리 및 삭제후보 표시/해제 절차. 현재 수정안은 충돌을 안전하게 보류할 뿐 이 절차를 완성하지 않았다.
4. 기존 ID를 잇는 원자 적용의 운영 스키마 기반 commit/rollback·권한·stale 요청·중복 이력 통합 검증. 회원 테이블의 이름-only 연결이 모호하면 자동 반영하지 않으며 별도 연결 근거가 필요하다.
5. 이미 반영된 rename의 stale original name 재시도, legacy append fallback, 전체 읽기/Queue count 상한·누락, 동시 Patch와 이전 성공 덮어쓰기 방지. 현재 readback 실패 상세 개선만으로 멱등성이 완성된 것은 아니다.
6. Worker/Edge 전체 deadline·중단/heartbeat·재시도 상한과 checkpoint 만료 경계 검증, 단계 시간 계측으로 병목 확인. 단순 timeout 숫자 추가를 성능 해결로 보고하지 않는다.
7. _D/H만/DB 제외/표시 삭제/행 삭제/정상 Target의 API 호출 0 통합 회귀. 기존 admin updateExclusion과 정책 충돌 검증.
8. 변경한 전체 경로의 회귀/보안 검증, 필요한 규칙·README 수정안, Source/Deploy/rollback 패키지 완성. 그 후 3단계 배포·카나리·전체 최신화.

현재 운영 상태가 자동으로 개선됐다고 안내하면 안 된다. 1단계 데이터 정비와 이번 로컬 구현은 별개다.
