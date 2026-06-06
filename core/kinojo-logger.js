/*
 * KINOJO LOGGER ENGINE
 * Role: 사용자/관리자 행동 로그 전송 공통 함수 예정.
 * Phase 1: 기존 기능과 연결하지 않는 안전한 스켈레톤입니다.
 */
window.KinojoLogger = window.KinojoLogger || {
  version: '1.c2.03',
  log(action, detail) {
    if (window.KinojoDebug && window.KinojoDebug.enabled) {
      console.info('[KINOJO LOG]', action, detail || {});
    }
  }
};
