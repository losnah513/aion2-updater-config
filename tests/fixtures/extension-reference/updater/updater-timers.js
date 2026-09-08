/**
 * Kinojo updater-timers.js
 * ------------------------------------------------------------
 * Purpose:
 * - Provides small timer guard helpers for updater heartbeat/watchdog/polling.
 * - Prevents duplicate intervals without changing updater business logic.
 */
window.AION2_UPDATER_TIMERS = {
  start(owner, key, intervalMs, callback) {
    if (!owner || !key || typeof callback !== "function") return null;
    if (owner[key]) return owner[key];
    owner[key] = setInterval(callback, intervalMs);
    return owner[key];
  },

  restart(owner, key, intervalMs, callback) {
    this.stop(owner, key);
    return this.start(owner, key, intervalMs, callback);
  },

  stop(owner, key) {
    if (!owner || !key || !owner[key]) return;
    clearInterval(owner[key]);
    owner[key] = null;
  }
};
