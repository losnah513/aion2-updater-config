# KINOJO CHANGELOG

## 1.3.1.14 / 2026-06-26_02
- Supabase REST 요청에서 `Authorization: Bearer sb_publishable__...` 헤더를 제거했습니다.
- `apikey: sb_publishable__...` 헤더만 사용하도록 웹/확장프로그램 공통 브리지를 수정했습니다.
- URL query에 `apikey`를 추가하던 임시 보강도 제거했습니다.
- PGRST301 `Expected 3 parts in JWT; got 1` 오류 대응.
- `_docs` 개별 릴리즈 문서를 `CHANGELOG.md` / `MIGRATION_GUIDE.md` / `archive` 구조로 정리했습니다.

### 교체 파일
- `GitHub_Pages/config.json`
- `GitHub_Pages/core/kinojo-supabase.js`
- `KINOJO_1_3_1_14/core/config.js`
- `KINOJO_1_3_1_14/core/supabase.js`
- `KINOJO_1_3_1_14/manifest.json`

## 2026-06-26 / 1.3.1.15

### 교체 파일
- `GitHub_Pages/config.json`
- `GitHub_Pages/core/kinojo-supabase.js`
- `GitHub_Pages/home.html`
- `GitHub_Pages/arcana/index.html`
- `GitHub_Pages/hof/index.html`
- `GitHub_Pages/m/index.html`
- `GitHub_Pages/m/hof/index.html`
- `GitHub_Pages/m/sanctuary/index.html`
- `GitHub_Pages/sanctuary/index.html`
- `KINOJO_1_3_1_15/core/config.js`
- `KINOJO_1_3_1_15/core/supabase.js`
- `KINOJO_1_3_1_15/manifest.json`

### 반영
- Supabase PASS KEY 조회 URL 생성 시 `URLSearchParams(query || '')` 재처리 제거.
- 한글 PASS KEY가 이중 인코딩되어 `member_codes` 조회 결과가 `[]`로 반환되던 문제 수정.
- 웹 HTML의 `kinojo-supabase.js` / `kinojo-auth.js` cache 값을 `2026062603`으로 갱신.
- 확장프로그램 버전 `1.3.1.15` 반영.

### 서버 작업
- 없음. SQL Editor 추가 실행 없음.

### Apps Script
- 교체 없음. 새 배포 없음.

