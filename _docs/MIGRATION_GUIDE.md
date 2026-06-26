# KINOJO MIGRATION GUIDE

## Supabase PASS KEY 연결 점검

1. Supabase `member_codes` 테이블에 계정이 있어야 합니다.
   - `pass_code`: 실제 PASS KEY
   - `is_active`: `true`
   - `role`: `MASTER`, `SUB_MASTER`, `MANAGER`, `STAFF`, `MEMBER` 중 하나
   - `level`: 내부 비교용 숫자. UI에는 노출하지 않습니다.

2. `GitHub_Pages/config.json`의 Supabase 설정을 확인합니다.
   - `enabled`: `true`
   - `url`: `https://프로젝트.supabase.co` 형식. `/rest/v1/` 제외
   - `publishableKey`: Supabase Project Settings > API Keys > Publishable key 전체 문자열

3. 웹 로그인 테스트
   - GitHub Pages 업로드 후 `Ctrl + F5`
   - F12 > Network > `member_codes` 요청 확인
   - 정상 요청 헤더: `apikey` 존재
   - 잘못된 요청 헤더: `Authorization: Bearer sb_publishable__...`가 있으면 안 됩니다.

## 오류별 의미

- `No API key found in request`
  - `apikey` 헤더가 누락된 상태입니다.

- `PGRST301 Expected 3 parts in JWT; got 1`
  - publishable key를 `Authorization: Bearer`로 보낸 상태입니다.
  - KINOJO 1.3.1.14에서는 제거했습니다.

- `PASS KEY가 없거나 비활성화된 계정입니다.`
  - 연결은 되었지만 `member_codes`에서 입력한 `pass_code` + `is_active=true` 조건의 행을 찾지 못한 상태입니다.

## 문서 구조

- `CHANGELOG.md`: 버전별 변경 내역
- `MIGRATION_GUIDE.md`: Supabase/배포/이관 절차
- `archive/`: 과거 개별 작업 문서 보관
