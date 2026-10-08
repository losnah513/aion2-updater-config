# 본캐·부캐 자동 조회와 서버 루틴 · SQL533

- 사용자 최종 규칙: 매일 한국 시간 본캐10:00/22:00, 부캐15:00. 수동 조회 범위는 유지한다. 이전 부캐10시 제안은 배포하지 않았다.
- 책임 DB+WEB. 기존 cron/Edge/Worker를 재사용한다. 기존 자동 세션 시작 시 claim 시각으로 슬롯·MAIN_ONLY/ALT_ONLY를 고정하고, 전체 list 확인과 기존 조회자격 판정 후 역할별 대상만 Queue에 넣는다. 관계 재확인 공식 호출에도 같은 범위를 적용한다. DB의 is_main이 역할 기준이다.
- 기존 cron11의 GMT 일정을 0 1,6,13 * * *로 변경한다. job명/command hash/ONOFF와 다른14작업은 유지한다. 현재 자동 실행 중이면 migration과 rollback을 중단한다. 운영 적용 후 다음 예약은10/8 22시 본캐이며,15시를 지나 적용했으므로 당일 부캐를 강제로 재실행하지 않았다.
- 관리자 시스템 설정→서버 루틴은 기존 WEB_COMMON actor가 검증한 level3 이상에게 작업15개의 이름·KST주기·ONOFF·다음예약·최근 예약실행 상태를 제공한다. 새로고침만 있고 실행/설정 변경은 없다. WEB은 서버 반환값을 표시하며 시각 표시는 브라우저 시간대와 관계없이 Asia/Seoul이다. command/return_message/token/SQL은 반환하지 않는다.
- RPC의 SECURITY DEFINER는 cron 읽기 권한을 클라이언트에 부여하지 않기 위해 사용한다. 고정 search_path, 기존 세션/회원권한 검증,5초 timeout, 최근20000건 제한. private preview의 client EXECUTE는 모두 회수한다. 기존 service_role updater_sessions SELECT 미부여 유지.
- 운영 advisor: security569→571은 새 guarded RPC의 anon/authenticated SECURITY DEFINER 노출 알림2건이다. WEB_COMMON 토큰 검증과 DB 현재회원 level3 필수이며 invalid token 운영 거부 확인. 다른 신규0, performance146→146. [anon 설명](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated 설명](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- 검증: 실제 전체 SQL 함수의 자동 세션/전체list Queue/관계 재확인(service_role 직접 실행 포함), 경계시각·지연된 scope고정·수동위조무시·제외·인증·rollback. PC1440/mobile390·320의 새로고침중복/오류·빈목록복구/XSS/미국 브라우저 시간대 KST/가로넘침 검증. 고정 회귀65개 중63개 즉시통과, 기존2개의 Windows CRLF민감 비교는 검사 환경에서 LF로 재검증 통과했고 원본 복원. CI는 Linux 전체65개를 다시 확인한다.
- migration/rollback20261008062130_character_automatic_main_alt_frequency.sql. 기존5함수 exact readback, 신규2함수 body/security/search_path 확인. 실제 새 규칙의 첫 cron 완료는 향후 관측이며 로컬 회귀 통과와 구분한다.
- rollback은 자동조회 종료 후 기존5함수·2시간 예약을 복원하고 신규 getter/preview를 제거한다. WEB도 같은 baseline으로 함께 revert한다. 캐릭터/조회 이력은 보존한다.
- 기준 main0c7d7d15f6193854244fe8635d96309d8e3e04b1, branch fix/automatic-main-alt-frequency-20261008. 파일별 hash/DriveID는 AUTOMATIC_FREQUENCY_SERVER_ROUTINES_MANIFEST.json. 배포/PR/Drive/운영 브라우저 최종 결과는 안정화4차 LOG60.
