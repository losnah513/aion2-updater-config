# list Master Bridge — staged source, not deployed

기준 Drive 소스 ID: `1fXpvnVoALky9ceQ-1Hn97IEyRB9HJBkT`. BRIDGE.gs 한 파일을 기존 AppsScript_MASTER 프로젝트에서 교체하는 수정안이며 별도 활성 브릿지가 아니다.

## 월별 정리 I/O · 미배포

- `serverListSheetCleanup`은 기존 쓰기 토큰으로 인증된 POST만 허용한다. 신규 CLEAR는 Script Property `KINOJO_LIST_CLEANUP_ENABLED=true` 없이는 거부한다. 현재 운영에서 이 값을 설정하지 않는다. RESTORE/COMPLETE 복구 요청은 기능을 꺼도 기존 journal을 처리할 수 있다.
- Server가 제공한 jobId/Master ID/metadata ID/정확한 A:H 이전 값을 검증한다. 중복·타 ID의 같은 행 바인딩, 수식, I 이후 값, 이동/삭제/수동 변경은 보류한다. 물리 행을 삭제하지 않고 metadata로 A:H만 비워 다른 캐릭터 행 매핑을 보존한다. 빈 행의 기존 ID metadata는 재시도 식별용이며 프로필 값은 남지 않는다.
- 외부 쓰기 전에 Script Properties에 한 작업의 이전 값을 저장한다. CLEAR/RESTORE 재시도는 현재 값이 이전 값 또는 빈 값인지 확인한다. 알 수 없는 편집을 덮어 복원하지 않는다. 정상 복원/DB 완료 후에는 이전 값을 지우고 ID 중심 receipt만 남긴다. 저장 용량 부족은 쓰기 전 보류하며 보호 기록을 임의 만료시키지 않는다.
- active journal이 있는 동안 일반 list sync·완료 marker·성역 결합 쓰기는 차단한다. COMPLETE 이후 일반 sync는 retired Master ID를 거부한다. 성공 재호출도 실제 terminal state를 반환하므로 Server는 ok만 보지 말고 job/ID/state를 대조해야 한다.
- `dbFinalized`는 신뢰된 Server 호출 계약일 뿐 Apps Script가 DB 완료를 독립 검증했다는 의미가 아니다. Server 최종 receipt 검증·writer 조율을 연결하기 전 운영 활성화 금지. 현재 구현은 무인 정리 전체가 아니라 복구 가능한 I/O 기반이다.
- ScriptLock은 사람의 Google Sheets 편집을 잠그지 못한다. 읽기/쓰기 사이 수동 편집의 원자적 CAS를 보장하지 않는다. 편집 경합 제한 창/보호 및 실제 Sheets canary를 검증하기 전 자동 CLEAR를 켜지 않는다. 서비스 내부 mock 결과를 실운영 안전성 보장으로 확대하지 않는다.
- 검증: `node tests/list-cleanup-recovery.test.cjs`, 기존 metadata/성역 통합 회귀. 실제 배포·관계 재검증·Cron 상태는 프로젝트 LOG를 따른다.

## Metadata write contract MASTER_ID_V1

- Queue의 `character_id`를 `characterId`로 전달한다. Queue ID 또는 행번호를 Master ID 대신 사용하지 않는다.
- 최초 연결은 원본 표시명 단일 일치·클래스·기존 바인딩을 확인해 행 metadata `KINOJO_MASTER_ID`를 만든 뒤, metadata로 다시 읽어 연결 대상이 그대로인지 검증한다.
- 기존 바인딩은 metadataId로 값을 읽고 쓴다. 정상적인 행 이동 때 행번호가 바뀌어도 대상으로 연결된다. 바인딩 중복·행 삭제·현재 이름/클래스 불일치는 쓰기를 보류한다. 같은 rename Queue는 이미 바뀐 이름과 기존 바인딩으로 재확인한다.
- 실제 수치 쓰기는 `values.batchUpdateByDataFilter`, 전체 묶음 읽기는 `values.batchGetByDataFilter`. `null` 값은 쓰지 않는다. H는 Server의 명시적인 `listStatus` 문자열이 있을 때만 쓰며, `삭제후보` 및 복구 시 빈 문자열을 허용한다. 보통 조회는 H를 보존하고 I 이후는 항상 보존한다.
- 새 행은 행 삽입·metadata 연결·초기 A:H 쓰기를 한 `spreadsheets.batchUpdate`로 처리한다. 같은 Master ID 재시도는 기존 바인딩을 재사용한다. 삭제한 행 복원 여부의 판정은 이 브릿지가 하지 않는다.
- 250개 단위 Edge batch. 최초 50행 연결·수정 mock은 metadata API 5회로 검증했다. 운영 지연 수치로 해석하지 않는다.
- 권한/API/계약 확인 실패 시 이전 행번호 쓰기나 legacy roster append로 우회하지 않는다.
- metadata는 신원 인증 수단이나 비밀 저장소가 아니다. Master ID만 기록하며 charKey·토큰·PASS KEY를 저장하지 않는다. 같은 이름의 다른 실제 캐릭터를 자동 병합하지 않는다.

## 배포 전 필수 조건 — 아직 미확인

1. 기존 Apps Script에 연결된 Google Cloud 프로젝트에서 Sheets API 사용 가능 여부와 기존 manifest/OAuth 범위를 확인한다. Sheets 전체 접근 및 외부 요청 권한이 필요하다. `ScriptApp.getOAuthToken()`은 서버 측에서만 사용한다.
2. 운영 쓰기 전 별도 승인된 canary에서 기존 행 연결·행 이동/삽입/삭제·복사/정렬·rename 재시도·부분 쓰기·quota/권한 실패를 실제 Google API로 검증한다. 로컬 mock 통과가 실운영 검증을 대체하지 않는다.
3. 기존 Worker를 멈춘 호환 배포 창에서 DB foundation→generation migration→Bridge→Identity/lookup-list-sync Edge를 적용한다. Edge는 `serverBridgeHealth.metadataWriteContract`를 쓰기 전에 확인한다.
4. fresh 운영 함수/권한 drift 검증, Source/Deploy·INDEX와 같은 Drive ID 소스 동기화, row별 readback 후에만 운영 완료로 판정한다.
5. 롤백은 Worker 중단 후 수행하고 만들어진 metadata/시트 행/감사 이력을 자동 삭제하지 않는다. 예전 positional writer를 재활성화하면 이번 안전 보호도 사라진다.

## 근거 및 검증

- [Google metadata 계약](https://developers.google.com/workspace/sheets/api/guides/metadata)
- [metadata 지정 쓰기](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdateByDataFilter)
- [batchUpdate 원자 처리와 협업 편집의 한계](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)
- `node tests/list-metadata-writer.test.cjs`
- `node tests/character-refresh-stability-adversarial.test.cjs`

현재 단계의 실제 진행/남은 구현은 기존 4차 프로젝트 로그와 docs/CHARACTER_REFRESH_STABILITY_STAGE2_WIP.md를 따른다.
