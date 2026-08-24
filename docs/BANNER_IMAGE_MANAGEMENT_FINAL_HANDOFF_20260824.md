# KINOJO 배너 이미지 추가·관리 프로젝트 — FINAL HANDOFF

기준일: 2026-08-24 KST
상태: CLOSED · 원본 계획 51/51 완료

## 최종 운영 기준

- 제품 코드 기준 GitHub main: `afb6c5f13cfcece3e1859179a2d678c08277d799` (PR #225, mobile MAIN live Manifest settlement 보강).
- 11-라의 이 문서는 docs-only closeout이며 배너 제품 HTML/CSS/JS, DB/RPC, Edge, Storage, Seed/Campaign 계약을 변경하지 않는다.
- `kinojo/live-readback` run `32679813686`: success.
- `kinojo/banner-runtime-live-readback` run `32679813695`: success.
- Admin Chrome lifecycle, deployed byte readback, Manifest ETag/304, PC SIDE live Chrome, mobile MAIN normal/slow/failure fallback: PASS.

## Supabase / Edge

- Project: `kinojo-production` / `josvoltpktvwysrasffq`.
- Asset `2` / Campaign `1` / Item `1` / private idempotency ledger `0` / `kinojo-site-banners` object `0`.
- Campaign 16: HOME:MAIN / PUBLISHED / priority `100` / 종료 `2026-09-01 00:00:00 KST` exclusive / Asset 28 여름 배너.
- `kinojo-banner-media`: v8 ACTIVE / API `1.4` / DB `388` / Storage `382` / bundle SHA-256 `b3aa70f5cae6a62b01b9f05eb25e075ae9c3bcf2e16e53ec7e053e8fa7256b88`.
- 배너 3개 public table은 RLS ON. anon/authenticated 직접 table grant `0`, 배너용 public/storage policy `0`, service_role 경계를 유지한다.
- Security Advisor banner-specific WARN `0`. project-wide 기존 경고는 배너 범위 밖이라 변경하지 않았다.

## 고정 UI / 권한 계약

- MAIN: 16:9, PC+mobile HOME, fallback `kinojo-og.jpg`.
- SIDE: 300:715, PC only, breakpoint `min-width: 1840px`, fixed/overflow hidden/4px corners.
- HOF는 LEFT SIDE만 허용하며 RIGHT는 만들지 않는다.
- 모바일은 PC SIDE DOM/CSS/JS를 탑재하지 않는다.
- Server Manifest가 일정/우선순위/weight/playlist/random authority를 가진다. Browser는 표시·preload·crossfade·visibility/reduced-motion/fallback만 담당한다.
- Browser `service_role`, canonical schedule/priority/weight/random 로직을 추가하지 않는다.
- 기존 STATIC Asset `kinojo-og.jpg`, `kinojo_banner_summer.png`를 유지하며 신규 업로드만 `kinojo-site-banners`를 사용한다.

## Rollback / 병행 작업

- GitHub rollback branch: `backup/banner-260824-06-predeploy`.
- Drive rollback folder: `99_LEGACY/260824_06_banner_predeploy`.
- unrelated open PR #87 / #75는 배너 프로젝트에서 수정·병합·닫지 않는다.
- 이후 배너 변경이 필요하면 과거 작업 브랜치를 재사용하지 말고 최신 main / Supabase / Drive를 fresh readback한 뒤 새 작업으로 시작한다.

## 완료 판정

- 원본 마지막 단계: `11-라 — GitHub 반영·Drive 동일 ID 동기화·일일 로그·최종 인계`.
- 이 프로젝트에 남은 원본 단계는 없다.
