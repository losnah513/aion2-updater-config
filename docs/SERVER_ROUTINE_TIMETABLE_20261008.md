# 서버 루틴 시간표 · SQL534

- 사용자 요청: 한국 시간00시부터 시간순으로 정리한 표, 매일/매주 뱃지. 정해진 예약은 시각별행으로 나누고 매주작업은요일도표시한다. 매분/몇분마다/매시간 반복작업은 별도반복표로표시한다.
- 책임DB+WEB. SQL533 private preview가 KST minuteOfDay/timeKst/weekday/슬롯별nextRunAt과 DAILY/WEEKLY/REPEAT를 반환한다. 기존 guarded getter에 표시정보만추가한다. WEB은서버정렬키로표시하며 cron식/요일/다음예약을계산하지않는다. 신규helper/Edge/RPC/권한없음.
- 운영15개작업은 정시예약11행(02:00→05:10→05:40→05:53→05:58→06:20→10:00→12:35→14:00→15:00→22:00)과반복7행으로표시한다. 중지된성역02/14시는OFF로표시하며다음예약은중지됨이다.
- 본캐10/22시와부캐15시를각각표시한다. 다음예약은각시각의다음실행이며,최근실행은같은작업전체의최신cron호출기록이다. 두개념은표제목/서버안내로구분한다. 실제캐릭터별결과는캐릭터관리에서확인한다.
- semantic table/column·row headers, PC표와모바일행별2열배치, 매일/매주/반복컬러뱃지, 기존refresh/escape/error/auth/read-only 유지. 캐시timetable2026100801.
- 검증: 실제전체SQL533+534/service_role회귀, 지연 scope/수동·제외·인증보호, 슬롯별내일·당일next, 주간KST요일rollover/다음주, 반복분리, rollback후SQL533출력복원/실제예약불변. PC1440/mobile390·320/미국timezone 실제모듈표·시각정렬·뱃지·슬롯설명·refresh/error/empty/XSS/overflow통과. canonical45manifest갱신.
- 운영기존2함수exact/ACL유지,cron모든명령hash·일정·활성상태와자동설정불변. 최종advisor/PR/Pages/실제전용계정검수/Drive상태는안정화4차LOG61. 기준main98b4dfccefa89661f2c9ad24e7ca55c37ce1b31b,branch fix/server-routine-timetable-20261008.
- migration/rollback20261008070108_server_routine_timetable.sql. rollback은2개표시함수를SQL533으로복원하고WEB도동일baseline으로revert한다. 예약과캐릭터이력은변경하지않는다. 파일별DriveID/hash/bytes는SERVER_ROUTINE_TIMETABLE_MANIFEST.json.
