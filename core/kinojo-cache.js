/*
 * KINOJO CACHE ENGINE
 * Role: 성역/명예의 전당/account 데이터 캐시와 수동 새로고침 규칙 예정.
 * 기본 구상: 성역 1분, 명예의 전당 5분, 공략팁 30분, 계정 1분.
 * 로그/승급 요청/편집중 데이터는 캐시 금지.
 * Phase 1: 기존 기능과 연결하지 않는 안전한 스켈레톤입니다.
 */
window.KinojoCache = window.KinojoCache || {
  version: '1.3.1.00',
  ttl: {
    sanctuary: 60 * 1000,
    hall: 5 * 60 * 1000,
    account: 60 * 1000,
    tips: 30 * 60 * 1000
  },
  store: new Map(),
  clearAll() {
    this.store.clear();
  }
};
