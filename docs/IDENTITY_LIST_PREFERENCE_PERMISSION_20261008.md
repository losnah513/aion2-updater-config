# 개명 반영 list 설정 접근 오류 · SQL532

- 15:01/15:02 KST 꾸힉 수동 실행에서 Target은1명 생성됐으나 permission denied for table updater_sessions로 실패했다. 개명 반영 함수는 SECURITY INVOKER이며 service_role의 updater_sessions SELECT 권한은 없다. 실패 transaction으로 Master·이력·list가 보존됐다.
- 책임 검토 DB_ONLY: 기존 세션 검증과 frozen list 설정을 반환하는 kinojo_legion_tree_listless_policy_v455를 재사용한다. 기존 검증 호출을 이 정책으로 대체하고 두 직접 SELECT를 정책 반환값으로 대체한다. 개명·이전·충돌·key/class/race·원자성 로직은 유지한다.
- 권한 범위: SECURITY INVOKER와 ACL 유지. 테이블 grant, 새 helper/Edge, Worker 변경 없음. 정책은 기존 세션 검증 후 설정을 반환하며 세션 행이 없으면 실패한다.
- 검증: 실제 전체 함수와 기존 정책을 service_role로 실행한다. 이전 오류 재현, rename/list ON/OFF/이력/관계/invalid token/missing session/key·class·race·충돌/stale/rollback을 확인한다. 운영 캐릭터를 SQL로 강제 개명하지 않는다.
- 기준 main1c6eb6eea445a5855c6ab1744cc14684c78c663e, branch fix/identity-list-preference-permission-20261008. 배포·PR·Drive 결과는 안정화4차 LOG59에 기록한다.
