# 캐릭터 조회 안정화 4차 · 2단계 인계

상태: **2단계 로컬 구현·회귀 검증 완료 / 3단계 운영 배포·카나리 대기** (2026-09-08).
운영 DB, Edge, Apps Script, 실제 list에는 이번 수정안을 적용하지 않았다. 운영 문제가 이미 해소됐다는 뜻이 아니다.

- 계획: https://drive.google.com/file/d/1aPfADtwHFXo1_ZP6Zj3HkD7eGyOVrZxD/view
- 로그: https://drive.google.com/file/d/1k0R6heq6ttLl9IKFm_q1_EGm4FCxmVbQ/view
- 브랜치: `codex/character-refresh-stability-stage2`
- 최신 main `0ab04ccf2c25764762d074b34199376b041f24af`의 배너 변경을 병합·보존했다. 공용 dirty checkout은 수정하지 않았다.
- 이전 회차의 WIP/실패 근거는 Git 이력 및 4차 LOG 9~11회차에 보존한다.

## 완료한 구현

1. 기존 저장 상세→이름/서버 조회를 유지하고 terminal miss 및 옛 이름 재사용 뒤 저장 문자열 charKey로 같은 종족 활성 서버를 전수 탐색한다. 단일 결과의 암호화 ID·키·클래스·서버·종족 재검증 후 적용한다. 다른 키 동명 후보, 클래스 불일치, 부분 탐색/Provider 오류는 변경하지 않는다.
2. DB 단일 조회 정책: 명시적 개별 설정/그룹 기본값, 현재 성역 실제 등록 캐릭터, 지켈2002 깡, 7일 활동 관계 재검토. 조회와 노출은 분리하고 레기온 잔류·능력치 정체·list 누락으로 수동 제외를 해제하지 않는다.
3. _D 또는 H 삭제후보를 prepare에서 DB 제외로 남기고 Target 전에 재확인한다. H 표시/행이 없어져도 DB 제외는 보존한다. 기존 검증 클래스는 오래된 시트 클래스가 덮지 않는다.
4. 적격 DB-only 대상을 Queue에 합친다. 이번 payload의 키·서버·이름, Master 최신 payload, 현재 Snapshot의 공식 레기온 및 시각이 맞고 지켈 깡 소속을 확인했을 때만 list 복원 Queue를 만든다. 키 없음·공식 정보 불완전·옛 레기온 값만 있으면 복원하지 않는다.
5. 관리자 신원 적용은 옛 이름/새 이름 점유와 충돌한 이전 소유자를 각자의 key로 검증한다. 최대 5개 연쇄, 완전 오류 없는 미발견의 현재 generation 증명과 다른 키의 이름 점유가 모두 있어야 이전 소유자를 _D/H 삭제후보로 보관한다. 순환·기존 _D 충돌·Provider 오류는 양쪽 변경을 보류한다. 자동 Worker의 이름 충돌은 보류하고 이 관리자 검증 경로를 이용한다.
6. 자동·관리자 이전 모두 같은 Master ID, 키/클래스/same-race 및 수집 전 신원 확인, 이력 중복 방지, 옛 레기온/조직 배치의 원자 해제를 적용한다. 수동 제외/노출 상태와 실제 조회 실패 이력은 임의 초기화하지 않는다.
7. 관리자 신원 변경과 list 재시도는 기존 Queue에 함께 기록한다. 본부캐 G 갱신도 Master 연결 ID의 행만 명시적으로 Queue에 넣는다. DB 성공/list 실패를 구분하며 화면의 미반영 건수·재시도 버튼으로 공식 API를 다시 조회하지 않고 시트 재시도할 수 있다. 완료 ACK는 Queue revision을 비교한다.
8. list 쓰기는 Master ID metadata/DataFilter, append는 행 삽입/metadata/초기 셀의 원자 묶음이다. H는 명시적 상태 문자열만 쓰고 일반 조회에서는 보존한다. 행 이동·rename 재시도·ID 충돌·중복 append를 방어하고 재검증 실패는 완료하지 않는다.
9. 초기 신원 변경 Queue와 전체 조회 Queue를 안전하게 합치고 현재 검증 수치를 채운다. 성공 행은 보존한다. 1,000행 단위 전체 읽기/중복 페이지 차단, 실제 Queue 정확한 완료 수량, 늦은 실패의 완료 상태 역전 차단을 추가했다.
10. Worker RPC/Edge 및 Identity RPC는 응답 본문까지 timeout을 적용한다. 기존 rate/backoff·세대 checkpoint·중단/재개 경로를 재사용하며 batch 새 Target 시작 예산과 list 준비 전체 호출 예산을 제한한다. identity_resolve/snapshot_precheck/snapshot_submit/target_finalize 계측을 남긴다.

## 검증

- 핵심 8종 + 인접 회귀 10종 = **18종 PASS**. `tests/evidence/20260908-character-refresh-stage2/completion-verification.json`.
- 이번 중간 검증의 16 PASS/2 FAIL은 옛 API 버전 상수 기대값 두 건이다. 새 버전으로 기대값만 변경하고 나머지 안전 조건은 유지해 재검증했다. `preclose-verification.json`에 실패 결과도 남겼다.
- 자동/관리자 트랜잭션의 강제 중간 실패→전부 rollback, 정상 commit, 동일 요청 재시도 이력/Queue1건, 충돌 양쪽 rollback/_D 보관, 본부캐 G Queue를 검증했다.
- H-only/_D prepare, 불완전 읽기, 반복 prepare Target 보존, fresh key/legion 복원, Queue 부분 합치기/정확한 구성원/완료 수량, 행 매핑 일괄 rollback·재시도를 검증했다.
- 로컬 PGlite는 운영에서 읽은 **열 타입**과 실제 함수 정의를 사용하되 일부 의존 함수·인증은 합성 fixture다. 실제 운영 전체 제약/트리거·RLS·정상 로그인 검증을 대체하지 않는다.
- 실제 제품 JS/Edge/Bridge를 VM에서 실행했으며 외부 통신은 mock이다. 실제 Google API 동시 편집/권한 및 PLAYNC 장시간 부하 검증은 아니다.
- 기존 정상 조회, listless 레기온 추가, 관리자 Queue 표시, 인증 셸, 배너 관리 회귀도 통과했다.
- 재현: Node24, `npm install --prefix .codex-test-runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.8`. CI 구성: `.github/workflows/verify-character-refresh-stability.yml`. 아직 원격 CI를 실행한 것은 아니다.

## 3단계 시작 게이트

- [배포 패키지/복구 기준](CHARACTER_REFRESH_STABILITY_STAGE2_RELEASE.md)에 따라 최신 운영 함수·권한·활성 세션/Source drift를 다시 비교한다.
- 실제 CODEX_ADMIN 정상 로그인, Sheets API/OAuth, metadata 쓰기 및 이동/삽입/삭제/복사/정렬 canary를 통과하기 전 대량 쓰기 금지.
- 현재 함수 호출/행 수를 실제 운영 스키마에서 읽기 전용으로 검증한 뒤 정해진 소수 대상만 적용하고 DB/list를 readback한다.
- DB-only의 기존 list_row가 다른 Master와 충돌하면 안전 보류한다. 시트 metadata와 최신 실제 행을 확인해 매핑을 정리하며 행번호만 보고 충돌을 지우지 않는다.
- 이름 충돌 연쇄가 5개를 넘거나 새 키로 바뀐 경우 자동 식별/병합하지 않는다. 관리자가 근거를 확인한다.
- 35~43분 지연을 해결했다고 단정하지 않는다. 과거 list 구간은 23~36초였고 긴 지연은 Snapshot 전후에 집중됐다. 새 계측으로 실제 단계별 시간·재시도·lease/인계를 측정한 뒤 시간 예산을 조정한다. 55초/700ms 등 초깃값은 공식 API SLA가 아니다.
- 배포/PR/실제 전체 최신화, 운영 문제 캐릭터 정비 결과, Drive 운영 소스/SQL_INDEX 최종 동기화는 3단계에서 처리한다. 수동 제외 전수 복구나 과거 실패 기록 삭제는 하지 않는다.
