/**
 * Kinojo updater-state.js
 * ------------------------------------------------------------
 * Purpose:
 * - Owns localStorage/session cleanup rules for the updater.
 * - Keeps stale-run/cache logic out of the runner flow.
 */
window.AION2_UPDATER_STATE = {
  isStaleRunState() {
    const K = window.AION2_CONFIG.KEYS;
    const running = localStorage.getItem(K.RUNNING) === "true";
    const blocked = localStorage.getItem("KINOJO_BLOCKED_BY_OTHER") === "true";
    const last = Number(localStorage.getItem(K.LAST_PROGRESS) || "0");
    const limit = Number(window.AION2_CONFIG.STALE_RUN_LIMIT_MS || 12 * 60 * 60 * 1000);

    if (!running && !blocked) return false;
    if (!last) return true;

    return Date.now() - last > limit;
  },

  clearStaleRunState(updater, message) {
    const K = window.AION2_CONFIG.KEYS;

    // 오래된 실행 상태도 자동 삭제하지 않는다.
    // 실행 플래그와 타이머만 멈추고 모든 진행 기록·큐·세션은 유지한다.
    localStorage.setItem(K.RUNNING, 'false');

    if (updater && typeof updater.setStopReason === 'function') {
      updater.setStopReason('STALE_PAUSED', {
        message: message || '오래된 실행 상태를 일시정지로 전환했습니다.'
      });
    }
    if (updater && typeof updater.setBlockedByOther === 'function') updater.setBlockedByOther(false);
    if (updater && typeof updater.stopHeartbeat === 'function') updater.stopHeartbeat();
    if (updater && typeof updater.stopLockStatusPolling === 'function') updater.stopLockStatusPolling();
    if (updater && typeof updater.stopServerProgressPolling_ === 'function') updater.stopServerProgressPolling_();

    if (window.AION2_UI) {
      if (message) window.AION2_UI.pushLog(message);
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
    }
  },

  prepareStartAttempt(updater) {
    if (updater && typeof updater.stopHeartbeat === "function") updater.stopHeartbeat();
    if (updater && typeof updater.stopLockStatusPolling === "function") updater.stopLockStatusPolling();

    if (this.isStaleRunState()) {
      this.clearStaleRunState(updater, "오래된 실행 상태를 일시정지로 전환했습니다. 기존 기록은 초기화 전까지 유지됩니다.");
    }
  }
};
