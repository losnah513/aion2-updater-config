/*
 * KINOJO PERMISSIONS ENGINE
 * Role: Lv.0~Lv.5 권한 판단 공통 규칙 예정.
 * Phase 1: 기존 기능과 연결하지 않는 안전한 스켈레톤입니다.
 */
window.KinojoPermissions = window.KinojoPermissions || {
  version: '1.c2.04',
  labels: {
    0: '관람객',
    1: '참여자',
    2: '팀원',
    3: '팀장',
    4: '운영진',
    5: '관리자'
  },
  hasLevel(currentLevel, requiredLevel) {
    return Number(currentLevel || 0) >= Number(requiredLevel || 0);
  }
};
