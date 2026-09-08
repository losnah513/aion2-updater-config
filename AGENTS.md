# KINOJO 작업 시작

- 먼저 Google Drive `00_README_FIRST.md`와 `KINOJO_WORKFLOW_RULES.md`를 읽는다. Workflow: https://drive.google.com/file/d/1TkWRGDdaikUS9RGJyXWWl3jQXH0-PS-e/view
- 현재 프로젝트 계획/로그와 `docs/HANDOFF.md`를 확인하고 최신 main에서 작업한다. 공용 dirty checkout의 다른 작업을 포함하지 않는다.
- 실제 운영 브라우저 검수는 사용자가 제공한 전용 `CODEX_ADMIN` 계정으로 정상 로그인한다. 일반 사용자의 Master 계정을 전용 계정으로 간주하지 않는다. 유효한 WEB_COMMON 세션과 서버가 확인한 계정/권한이 있어야 관리자 검수를 진행한다.
- 같은 로그인 브라우저 환경을 재사용한다. 만료 시 승인된 기존 자격증명으로 정상 재로그인한다. 로그인 수단을 사용할 수 없으면 관리자 검수를 멈추고 필요한 로그인 입력만 요청한다. 익명 상태·가짜 권한·DB 직접 세션 생성으로 대체하지 않는다.
- PASS KEY/세션 토큰은 소스, 문서, 테스트 fixture, CLI 인자, evidence, 로그에 기록하지 않는다. 키의 기억/보존이나 다른 PC에서의 로그인 가능성을 보장하지 않는다.
- 로컬/CI/비로그인 화면 테스트는 `tests/helpers/visitor-traffic.js`를 navigation 전에 설치한다. 방문 기록 RPC를 운영에 보내지 않는다. 명부 테스트의 `ROSTER_LIVE_DATA`는 인증 검수가 아니라 공개 읽기 검수다.
- DB474는 로컬/Headless/전용 계정 이벤트를 일반 통계에서 제외하지만, 이것을 테스트의 운영 쓰기 허가로 해석하지 않는다. 실제 데이터 변경은 해당 작업에서 승인된 범위만 수행한다.
