# My Info 2차 · 4단계 통합 검증·배포·문서 마감

- 기준일: 2026-08-26
- 작업 브랜치: `codex/my-page-phase2-closeout-20260826`
- 기준 main: `2950d16b`
- 진행도: **4/4**

## 마감 범위

- 1단계 Server/Storage, 2단계 회원 제작 요청 UI, 3단계 관리자 확인·처리 계약은 변경하지 않았다.
- 회원 입력 경계는 이미지 `0/1/2/3/4장`, 허용되지 않은 스타일, 301자 요청문, 빈 직접 요청을 회귀 검증했다. 정상 경계는 1~3장, 스타일 미선택 확인, 직접 요청의 필수 문구, 일반 요청문 최대 300자다.
- 회원 → 비공개 Storage → MASTER 관리자 목록/상세 → 상태 전이 → 공통 알림의 연결 계약을 한 테스트에서 교차 확인했다.
- PC·모바일 개인정보 처리방침에 제작 요청 이미지 7일, 스타일·요청문·상태·감사 메타데이터 최대 30일, MASTER 전용 확인, 최대 60초 signed URL을 동일하게 고지했다.
- PC 개인정보 처리방침 래퍼에 `box-sizing: border-box`를 적용해 좁은 화면의 padding 기반 가로 넘침을 제거했다.

## 운영 readback

- Supabase `kinojo-production`은 `ACTIVE_HEALTHY`, PostgreSQL 17.6, 서울 리전이다.
- 운영 migration은 `20260826040254 member_image_request_batch_v404`, `20260826055902 member_image_request_admin_workflow_v405`를 포함한다.
- `kinojo-member-profile` v24와 `kinojo-member-image-cleanup` v6는 ACTIVE다. health는 API 2.7 / image request DB404 / admin DB405를 반환하며 무인증 관리자 요청은 401로 닫힌다.
- 요청 관련 private 테이블 5개는 RLS 활성·정책 없음·직접 브라우저 접근 불가 구조다. 관련 RPC 11개는 anon/authenticated 실행 불가, service_role만 실행 가능하다.
- `kinojo-member-reference`는 비공개, 5 MiB, JPEG/PNG/WebP만 허용한다. 정리 cron은 `*/15 * * * *`로 활성화되어 있다.
- Stage 4 관련 Supabase advisor 결과는 의도된 service-role-only 테이블의 `RLS enabled no policy` INFO와 배포 직후 사용량이 적은 인덱스의 `unused index` INFO뿐이다. 권한·RLS 오류나 Stage 4 관련 경고는 없다.

## 브라우저·회귀 결과

- 회원 요청 harness: 슬롯 3개, 스타일 5개, 요청문 `0/300`, 선택 수 `0/3`, 미선택 확인 문구와 전송 비활성 조건을 확인했다.
- 관리자 harness: 캐릭터 선택 뒤 요청 카드 2개, 선택 전 상세 없음, 선택 후 해당 요청 한 건·실제 FRONT/BACK 첨부·허용 상태 동작만 표시됨을 확인했다.
- 회원·관리자·PC/모바일 개인정보 처리방침은 `390×844`, `320×700`에서 가로 overflow 0이며 관리자 콘솔 error/warn은 0이다.
- 전체 `tests/*.test.js`는 **48/48 PASS**, `git diff --check`도 PASS다.

## 배포 기록

- GitHub PR과 운영 main merge, Pages 및 live readback 결과는 PR 생성 뒤 이 문서와 Drive 전용 LOG에 확정 기록한다.
- 진행도는 **4/4**, 다음 단계는 없다.
