/**
 * Kinojo updater.js — offline compatibility candidate; NOT an active extension release.
 * ------------------------------------------------------------
 * Client-side role:
 * - Start or reconnect to the Server Worker queue.
 * - Display Server-owned progress, completion, and diagnostics.
 * - Never search characters, open detail tabs, read AION DOM, parse stats, or submit snapshots.
 *
 * Server-side role:
 * - Lock/session/queue/progress management.
 * - Parse, sync, growth review, ranking, logs.
 * - Store all operational data in Supabase.
 *
 * P0 rule:
 * - The updater is a manual start button + Server progress viewer only.
 * - All official lookup, parsing, comparison, postprocess, ranking, and list sync run in Server Worker.
 */

window.AION2_UPDATER = {
  heartbeatTimer:null,
  lockPollTimer:null,
  watchdogTimer:null,
  serverProgressPollTimer:null,
  postprocessRetryInProgress:false,
  startInProgress:false,
  remoteAdminPauseNotified_:false,

  hasRetainedRunState_() {
    const K = window.AION2_CONFIG.KEYS;
    const readJson = (key, fallback) => {
      try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        return value === null || value === undefined ? fallback : value;
      } catch (_e) {
        return fallback;
      }
    };
    const queue = readJson(K.STORAGE, []);
    const current = readJson(K.CURRENT, null);
    const phaseHistory = readJson('KINOJO_UPDATER_PHASE_HISTORY', {});
    const diagnostics = readJson(this.getRunDiagnosticsKey_ ? this.getRunDiagnosticsKey_() : 'KINOJO_CURRENT_RUN_DIAGNOSTICS', {});
    return Number(localStorage.getItem(K.TOTAL) || 0) > 0
      || Number(localStorage.getItem(K.DONE) || 0) > 0
      || !!localStorage.getItem(K.LAST_DONE)
      || !!current
      || (Array.isArray(queue) && queue.length > 0)
      || !!(phaseHistory && typeof phaseHistory === 'object' && Object.keys(phaseHistory).length)
      || !!(diagnostics && (diagnostics.sessionId || (Array.isArray(diagnostics.events) && diagnostics.events.length)));
  },

  hasPendingResumeWork_() {
    const K = window.AION2_CONFIG.KEYS;
    return localStorage.getItem(K.RUNNING) !== "true"
      && !!this.getSessionId()
      && !!this.getServerSessionToken_()
      && !localStorage.getItem(K.LAST_DONE);
  },

  isPostprocessExecutionActive_() {
    return this.postprocessRetryInProgress === true;
  },

  notifyRetainedRunRequiresReset_() {
    const message = '기존 작업 기록이 보존되어 있습니다. 새 조회는 초기화 버튼으로 기록을 지운 뒤 시작할 수 있습니다.';
    if (window.AION2_UI && typeof window.AION2_UI.notifyError === 'function') {
      window.AION2_UI.notifyError(message);
    } else {
      alert(message);
    }
    if (window.AION2_UI) {
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
    }
  },

  async mainToggle() {
    const K = window.AION2_CONFIG.KEYS;
    if (this.isBlockedByOther() && !this.isStaleRunState()) {
      if (window.AION2_UI) {
        window.AION2_UI.showLockedStatus(window.AION2_UI.readCachedLockStatus_ ? window.AION2_UI.readCachedLockStatus_() : {});
        window.AION2_UI.updateButtonState();
      }
      this.startLockStatusPolling();
      return;
    }

    const running = localStorage.getItem(K.RUNNING) === "true";
    if (running && !this.isStaleRunState()) return this.stopUpdate();

    if (running && this.isStaleRunState()) {
      this.clearStaleRunState("오래된 실행 상태를 일시정지로 전환했습니다. 기존 기록은 초기화 전까지 유지됩니다.");
      return;
    }

    if (this.hasRetainedRunState_()) {
      this.notifyRetainedRunRequiresReset_();
      return;
    }

    return this.startNewUpdate();
  },

  async startNewUpdate() {
    if (this.startInProgress) {
      window.AION2_UI.pushLog("조회 시작 준비 중입니다");
      return;
    }

    if (!location.href.includes("/ko-kr/characters")) {
      alert("공식 캐릭터 검색 페이지에서 시작해주세요.\nhttps://aion2.plaync.com/ko-kr/characters/index");
      location.href = "https://aion2.plaync.com/ko-kr/characters/index";
      return;
    }

    const K = window.AION2_CONFIG.KEYS;

    if (this.hasRetainedRunState_()) {
      this.notifyRetainedRunRequiresReset_();
      return;
    }

    try {
      this.startInProgress = true;
      this.prepareStartAttempt();
      window.AION2_UI.updateButtonState();
      window.AION2_UI.pushTaskLog("🔐 조회 설정을 확인하는 중...");

      const config = await window.AION2_REMOTE.load();
      window.AION2_UI.pushTaskLog("🔑 비밀번호 확인을 준비합니다...");

      const ok = await window.AION2_AUTH.authorizeBeforeStart(config);
      if (!ok) return;

      if (config.testMode === true) {
        this.clearRunStateOnly();
        window.AION2_UI.pushLog("비밀번호 확인 성공 · 테스트 모드");
        window.AION2_UI.showNotice("테스트 모드입니다. 실제 조회는 실행되지 않았습니다.");
        window.AION2_UI.updateButtonState();
        window.AION2_UI.updateStatusBox();
        return;
      }

      this.clearStopReason();
      this.clearAllWorkState();
      this.resetRunDiagnostics_({ pageUrl:location.href });
      this.clearPhaseState_();
      this.clearSessionId();
      this.setBlockedByOther(false);
      localStorage.setItem(K.RUNNING, "true");

      window.AION2_UTILS.touchProgress();
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
      window.AION2_UI.resetTaskStatus("대기중");
      window.AION2_UI.pushTaskLog("🚀 새 조회를 준비합니다...");

      await this.startUpdateFromServerEngine(config);

    } catch (err) {
      this.appendRunDiagnostic_('START', 'error', String(err.message || err), { errorData:err && err.data || null, functionName:err && err.functionName || '', statusCode:err && err.status || null });
      this.markCurrentPhaseError_(String(err.message || err), { stage:'start', code:err && err.data && err.data.code || '', errorData:this.sanitizeRunDiagnostic_(err && err.data || null) }, 'list_master_compare');
      localStorage.setItem(K.RUNNING, "false");
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
      await this.sendClientLog("오류", String(err.message || err));
      if (window.AION2_UI && typeof window.AION2_UI.notifyError === "function") {
        window.AION2_UI.notifyError(String(err.message || err));
      }
    } finally {
      this.startInProgress = false;
      window.AION2_UI.updateButtonState();
    }
  },

  async resumeUpdate() {
    const K = window.AION2_CONFIG.KEYS;
    try {
      const config = await window.AION2_REMOTE.load();
      const ok = await (window.AION2_AUTH.authorizeBeforeResume
        ? window.AION2_AUTH.authorizeBeforeResume(config, this.getStopReason())
        : window.AION2_AUTH.authorizeBeforeStart(config));
      if (!ok) return;
      if (config.testMode === true) {
        window.AION2_UI.showNotice("테스트 모드입니다. Server Worker 재연결은 실행되지 않았습니다.");
        return;
      }

      const sessionId = this.getSessionId();
      const sessionToken = this.getServerSessionToken_();
      if (!sessionId || !sessionToken) {
        throw new Error("이어서 확인할 Server Worker 세션 정보가 없습니다.");
      }

      localStorage.setItem(K.RUNNING, "true");
      localStorage.removeItem(K.LAST_DONE);
      this.clearStopReason();
      window.AION2_UTILS.touchProgress();
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
      window.AION2_UI.pushTaskLog("🔗 기존 Server Worker 세션에 다시 연결합니다.");

      const handedOff = await window.KINOJO_SUPABASE.serverQueueStartAutonomous(sessionId, sessionToken);
      if (!handedOff || handedOff.ok !== true) {
        throw new Error(handedOff && (handedOff.message || handedOff.code) || "Server Worker 재연결 실패");
      }
      this.startServerProgressPolling_();
      await this.captureServerDebugSnapshot_("poll");
    } catch (error) {
      localStorage.setItem(K.RUNNING, "false");
      const reason = this.setStopReason("RESUME_ERROR", { message:String(error.message || error) });
      await this.sendClientDebug("RESUME_ERROR", reason);
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
      window.AION2_UI.notifyError("Server Worker 재연결 오류: " + String(error.message || error));
    }
  },

  getClientRole() {
    const role = window.AION2_CONFIG.CLIENT_ROLE || "GUEST";
    if (window.KINOJO_SUPABASE && typeof window.KINOJO_SUPABASE.normalizeRole === "function") {
      return window.KINOJO_SUPABASE.normalizeRole(role);
    }
    return String(role || "GUEST").toUpperCase();
  },

  getClientProfile_() {
    if (window.KINOJO_SUPABASE && typeof window.KINOJO_SUPABASE.getCurrentProfile === "function") {
      return window.KINOJO_SUPABASE.getCurrentProfile();
    }
    return { role: this.getClientRole(), level: 1, roleLabel: this.getClientRole() };
  },

  withClientRole(payload = {}) {
    return {
      ...payload,
      clientRole: this.getClientRole()
    };
  },

  hasSupabaseBridge() {
    return !!(window.KINOJO_SUPABASE && window.KINOJO_SUPABASE.isEnabled && window.KINOJO_SUPABASE.isEnabled());
  },

  setServerConnectionStatus_(target, state, message, extra = {}) {
    try {
      const key = 'KINOJO_SERVER_STATUS';
      const current = JSON.parse(localStorage.getItem(key) || '{}') || {};
      current[target] = Object.assign({}, current[target] || {}, extra, {
        state: String(state || 'unknown'),
        message: String(message || ''),
        updatedAt: Date.now()
      });
      localStorage.setItem(key, JSON.stringify(current));
      if (window.AION2_UI && typeof window.AION2_UI.updateServerStatusUi_ === 'function') {
        window.AION2_UI.updateServerStatusUi_();
      }
      if (window.AION2_UI && typeof window.AION2_UI.renderDebugDrawer_ === 'function') {
        const panel = document.getElementById('aion2OfficialPanel');
        if (panel && panel.classList.contains('kinojo-debug-open')) window.AION2_UI.renderDebugDrawer_();
      }
    } catch (_e) {}
  },

  async readSupabaseLockStatus_() {
    if (!this.hasSupabaseBridge()) return null;
    try {
      this.setServerConnectionStatus_('supabase', 'checking', '조회 잠금 확인 중');
      const status = await window.KINOJO_SUPABASE.getLockStatus();
      this.setServerConnectionStatus_('supabase', 'ok', status && status.running ? '잠금 상태 확인 · 실행 중' : '잠금 상태 확인 · 대기', {
        running: !!(status && status.running),
        owner: status && status.owner || '',
        sessionId: status && status.sessionId || ''
      });
      return status;
    } catch (err) {
      console.warn('supabase lock status failed:', err);
      this.setServerConnectionStatus_('supabase', 'error', String(err.message || err));
      window.AION2_UI.pushTaskLog('⚠️ Supabase 잠금 확인 실패 · Server Engine 상태 확인을 다시 시도합니다.');
      return null;
    }
  },

  async blockIfSupabaseLocked_() {
    const status = await this.readSupabaseLockStatus_();
    if (!status || !status.running) return false;
    const ownDeviceId = window.KINOJO_SUPABASE.getDeviceId && window.KINOJO_SUPABASE.getDeviceId();
    if (status.deviceId && ownDeviceId && status.deviceId === ownDeviceId) {
      // Same extension/client after reload or replacement: clear stale server lock before starting.
      try {
        const passCode = this.getRuntimePassCode_ ? this.getRuntimePassCode_() : '';
        if (passCode && window.KINOJO_SUPABASE.releaseMyRuntimeLock) {
          const released = await window.KINOJO_SUPABASE.releaseMyRuntimeLock(passCode, '같은 확장프로그램에서 다시 조회를 시작하여 이전 Lock을 해제했습니다.');
          if (released && released.ok !== false) {
            this.setBlockedByOther(false);
            window.AION2_UI.pushTaskLog('🔓 같은 확장프로그램의 이전 조회 Lock을 해제했습니다.');
            return false;
          }
        }
      } catch (e) {
        console.warn('same-client lock release failed:', e);
      }
      return false;
    }

    const profile = this.getClientProfile_();
    const decision = window.KINOJO_SUPABASE.compareLockAuthority
      ? window.KINOJO_SUPABASE.compareLockAuthority(status, profile)
      : { action:'block', message:'다른 확장프로그램이 조회 중입니다.' };

    if (decision.action === 'preempt') {
      window.AION2_UI.pushLog('상위 권한으로 기존 조회를 정지하고 시작합니다.');
      return false;
    }

    localStorage.setItem(window.AION2_CONFIG.KEYS.RUNNING, 'false');
    const blockedStatus = Object.assign({}, status, { message: decision.message || status.message });
    this.setBlockedByOther(true, blockedStatus);
    window.AION2_UI.pushLog(blockedStatus.message || `다른 곳에서 조회 중 · ${status.owner || '확인 중'}`);
    this.startLockStatusPolling();
    return true;
  },

  async claimSupabaseLock_(sessionId, totalCount) {
    if (!this.hasSupabaseBridge() || !sessionId) return true;
    try {
      const result = await window.KINOJO_SUPABASE.claimLock(sessionId, totalCount);
      if (result && result.locked && result.running) {
        localStorage.setItem(window.AION2_CONFIG.KEYS.RUNNING, 'false');
        this.setBlockedByOther(true, result);
        window.AION2_UI.pushLog(result.message || `다른 곳에서 조회 중 · ${result.owner || '확인 중'}`);
        return false;
      }
      if (result && result.preempted) {
        window.AION2_UI.pushTaskLog('🔒 상위 권한으로 조회 잠금 인계 완료');
      } else {
        window.AION2_UI.pushTaskLog('🔒 Supabase 조회 잠금 고정 완료');
      }
      return true;
    } catch (err) {
      console.warn('supabase claim lock failed:', err);
      window.AION2_UI.pushTaskLog('⚠️ Supabase 잠금 고정 실패 · Server Engine 세션으로 계속합니다.');
      return true;
    }
  },

  async heartbeatSupabaseLock_() {
    if (!this.hasSupabaseBridge()) return;
    const K = window.AION2_CONFIG.KEYS;
    const sessionId = this.getSessionId();
    if (!sessionId) return;
    try {
      const current = JSON.parse(localStorage.getItem(K.CURRENT) || 'null');
      const sessionToken = this.getServerSessionToken_ ? this.getServerSessionToken_() : '';
      const result = sessionToken && window.KINOJO_SUPABASE.runtimeProgress
        ? await window.KINOJO_SUPABASE.runtimeProgress(
            sessionId,
            sessionToken,
            current ? 'CRAWLING' : 'HEARTBEAT',
            current && (current.originalName || current.name || current.characterName) || '',
            current ? '캐릭터 조회 중' : '업데이터 heartbeat',
            Number(localStorage.getItem(K.DONE) || 0),
            Number(localStorage.getItem(K.TOTAL) || 0),
            { tool:'KINOJO_EXTENSION' }
          )
        : await window.KINOJO_SUPABASE.heartbeatLock(
            sessionId,
            Number(localStorage.getItem(K.DONE) || 0),
            Number(localStorage.getItem(K.TOTAL) || 0)
          );
      if (result && result.running === false && result.sessionId !== sessionId) {
        localStorage.setItem(K.RUNNING, 'false');
        this.setStopReason('SUPERIOR_LOCK_TAKEOVER', { message:'상위 계정이 조회를 시작하여 작업을 정지합니다.' });
        this.stopHeartbeat();
        this.setBlockedByOther(true, Object.assign({}, result, { message:'상위 계정이 조회를 시작하여 작업을 정지합니다.' }));
        window.AION2_UI.pushTaskLog('⛔ 상위 계정이 조회를 시작하여 작업을 정지합니다.');
        window.AION2_UI.notifyError('상위 계정이 조회를 시작하여 작업을 정지합니다.');
      }
    } catch (err) {
      if (Number(err && err.status) === 404 || /0 rows|no rows|JSON object requested/i.test(String(err && err.message || ''))) {
        localStorage.setItem(K.RUNNING, 'false');
        this.setStopReason('SUPERIOR_LOCK_TAKEOVER', { message:'상위 계정이 조회를 시작하여 작업을 정지합니다.' });
        this.stopHeartbeat();
        const status = await this.readSupabaseLockStatus_();
        this.setBlockedByOther(true, Object.assign({}, status || {}, { message:'상위 계정이 조회를 시작하여 작업을 정지합니다.' }));
        window.AION2_UI.pushTaskLog('⛔ 상위 계정이 조회를 시작하여 작업을 정지합니다.');
        window.AION2_UI.notifyError('상위 계정이 조회를 시작하여 작업을 정지합니다.');
        return;
      }
      console.warn('supabase heartbeat failed:', err);
    }
  },

  async releaseSupabaseLock_(status = 'cancelled', message = '') {
    if (!this.hasSupabaseBridge()) return null;
    const sessionId = this.getSessionId();
    const sessionToken = this.getServerSessionToken_ ? this.getServerSessionToken_() : '';
    const doSelfRelease = async () => {
      try {
        const passCode = this.getRuntimePassCode_ ? this.getRuntimePassCode_() : '';
        if (passCode && window.KINOJO_SUPABASE.releaseMyRuntimeLock) {
          return await window.KINOJO_SUPABASE.releaseMyRuntimeLock(passCode, message || '사용자가 조회를 정지/초기화했습니다.');
        }
      } catch (e) {
        console.warn('self release failed:', e);
      }
      return null;
    };

    try {
      if (sessionId && sessionToken && window.KINOJO_SUPABASE.runtimeFinish) {
        const result = await window.KINOJO_SUPABASE.runtimeFinish(sessionId, sessionToken, status, message || '조회가 종료되었습니다.', {
          done: Number(localStorage.getItem(window.AION2_CONFIG.KEYS.DONE) || 0),
          total: Number(localStorage.getItem(window.AION2_CONFIG.KEYS.TOTAL) || 0),
          tool: 'KINOJO_EXTENSION',
          clientVersion: window.AION2_CONFIG.EXT_VERSION
        });
        if (result && result.ok === false) await doSelfRelease();
        return result || null;
      }
      if (sessionId && window.KINOJO_SUPABASE.releaseLock) {
        return await window.KINOJO_SUPABASE.releaseLock(sessionId);
      }
      return await doSelfRelease();
    } catch (err) {
      console.warn('supabase/server-engine release failed:', err);
      return await doSelfRelease();
    }
  },

  isServerEngineMode_() {
    return !!(window.KINOJO_SUPABASE && window.KINOJO_SUPABASE.isEnabled && window.KINOJO_SUPABASE.isEnabled());
  },

  getServerSessionToken_() {
    return localStorage.getItem('KINOJO_SERVER_ENGINE_SESSION_TOKEN') || '';
  },

  setServerSessionToken_(token) {
    const value = String(token || '');
    if (value) localStorage.setItem('KINOJO_SERVER_ENGINE_SESSION_TOKEN', value);
    else localStorage.removeItem('KINOJO_SERVER_ENGINE_SESSION_TOKEN');
  },

  storeServerProgressSummary_(summary) {
    if (!summary || summary.ok !== true) return null;
    try {
      localStorage.setItem('KINOJO_LOOKUP_PROGRESS_SUMMARY', JSON.stringify(Object.assign({}, summary, {
        capturedAt: Date.now()
      })));
      const K = window.AION2_CONFIG && window.AION2_CONFIG.KEYS;
      if (K) {
        const hasOwn = (key) => Object.prototype.hasOwnProperty.call(summary, key);
        const total = hasOwn('total') ? Number(summary.total) : NaN;
        const completed = hasOwn('completedCount') ? Number(summary.completedCount) : NaN;
        if (Number.isFinite(total) && total >= 0) localStorage.setItem(K.TOTAL, String(total));
        if (Number.isFinite(completed) && completed >= 0) localStorage.setItem(K.DONE, String(completed));
      }
      const phases = Array.isArray(summary.phases) ? summary.phases : [];
      phases.forEach((phase) => {
        this.setPhaseState_(
          String(phase.id || ''),
          String(phase.status || 'pending'),
          Number(phase.current || 0),
          Number(phase.total || 0),
          String(phase.message || ''),
          Object.assign({}, phase.details || {}, {
            no:Number(phase.no || 0),
            label:String(phase.label || ''),
            percent:Number(phase.percent || 0),
            etaSeconds:Number(phase.etaSeconds || 0),
            elapsedSeconds:Number(phase.elapsedSeconds || 0),
            secondsPerItem:Number(phase.secondsPerItem || 0),
            startedAt:phase.startedAt || null,
            finishedAt:phase.finishedAt || null,
            updatedAt:phase.updatedAt || null,
            source:'SERVER_WORKER_295'
          })
        );
      });
    } catch (_e) {}
    return summary;
  },


  getPhaseModel_() {
    return window.KINOJO_UPDATER_PHASES || null;
  },

  setPhaseState_(phaseId, status, current, total, message, details = {}) {
    const model = this.getPhaseModel_();
    if (!model) return;
    const previous = model.readState ? model.readState() : {};
    const history = model.readHistory ? model.readHistory() : {};
    const previousPhase = history && history[phaseId] ? history[phaseId] : {};
    const startedKey = 'KINOJO_PHASE_STARTED_AT_' + String(phaseId || 'idle');
    let startedAt = Number(localStorage.getItem(startedKey) || '0');
    if (!startedAt || previous.phaseId !== phaseId || status === 'active') {
      if (previous.phaseId !== phaseId || previous.status !== 'active') {
        startedAt = Date.now();
        localStorage.setItem(startedKey, String(startedAt));
      }
    }
    const state = model.buildState({
      phaseId,
      status: status || 'active',
      current: Number(current || 0),
      total: Number(total || 0),
      startedAt,
      message: message || '',
      details: Object.assign({}, previousPhase.details || {}, details || {})
    });
    model.saveState(state);
    if (window.AION2_UI && window.AION2_UI.updateStatusBox) window.AION2_UI.updateStatusBox();
    return state;
  },

  recordPhaseIssue_(phaseId, message, detail = {}) {
    const model = this.getPhaseModel_();
    if (!model || !phaseId) return;
    const history = model.readHistory ? model.readHistory() : {};
    const previous = history[phaseId] || {};
    const previousDetails = Object.assign({}, previous.details || {});
    const issues = Array.isArray(previousDetails.issues) ? previousDetails.issues.slice(-7) : [];
    issues.push(Object.assign({}, this.sanitizeRunDiagnostic_(detail || {}), {
      message:String(message || '확인 필요'),
      character:String(detail.character || detail.characterName || ''),
      type:String(detail.type || 'notice'),
      time:Date.now()
    }));
    return this.setPhaseState_(
      phaseId,
      previous.status === 'done' ? 'done' : (previous.status || 'active'),
      Number(previous.current || 0),
      Number(previous.total || 0),
      previous.message || message || '',
      Object.assign({}, previousDetails, { issues })
    );
  },

  markCurrentPhaseError_(message, detail = {}, fallbackPhaseId = 'character_lookup') {
    const current = this.getCurrentPhaseState_() || {};
    const phaseId = current.phaseId && current.phaseId !== 'idle' ? current.phaseId : fallbackPhaseId;
    const model = this.getPhaseModel_();
    const history = model && model.readHistory ? model.readHistory() : {};
    const previous = history[phaseId] || current || {};
    const previousDetails = Object.assign({}, previous.details || {});
    const issues = Array.isArray(previousDetails.issues) ? previousDetails.issues.slice(-7) : [];
    issues.push(Object.assign({}, this.sanitizeRunDiagnostic_(detail || {}), {
      message:String(message || '단계 처리 실패'),
      character:String(detail.character || detail.characterName || ''),
      type:'error',
      time:Date.now()
    }));
    return this.setPhaseState_(
      phaseId,
      'error',
      Number(previous.current || 0),
      Number(previous.total || 0),
      String(message || '단계 처리 실패'),
      Object.assign({}, previousDetails, detail || {}, { errorMessage:String(message || ''), issues })
    );
  },


  getRunDiagnosticsKey_() { return 'KINOJO_CURRENT_RUN_DIAGNOSTICS'; },

  sanitizeRunDiagnostic_(value, depth = 0) {
    if (depth > 4) return '[depth-limit]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.length > 1800 ? value.slice(0, 1800) + '…' : value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 600).map(item => this.sanitizeRunDiagnostic_(item, depth + 1));
    if (typeof value === 'object') {
      const result = {};
      Object.keys(value).slice(0, 120).forEach(key => {
        if (/sessionToken|session_token|passCode|pass_code|authorization/i.test(key)) return;
        if (/^(pageHtml|profileHtml|visibleText|pageText|rawPayload|raw_payload|html|text)$/i.test(key)) {
          const raw = value[key];
          result[key + 'Length'] = typeof raw === 'string' ? raw.length : 0;
          return;
        }
        result[key] = this.sanitizeRunDiagnostic_(value[key], depth + 1);
      });
      return result;
    }
    return String(value);
  },

  readRunDiagnostics_() {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.getRunDiagnosticsKey_()) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_e) { return null; }
  },

  writeRunDiagnostics_(payload) {
    try {
      localStorage.setItem(this.getRunDiagnosticsKey_(), JSON.stringify(payload || {}));
      if (window.AION2_UI && window.AION2_UI.updateStatusBox) window.AION2_UI.updateStatusBox();
    } catch (_e) {}
    return payload;
  },

  resetRunDiagnostics_(meta = {}) {
    const payload = {
      schemaVersion:'kinojo-run-diagnostics-v1',
      extensionVersion:window.AION2_CONFIG && window.AION2_CONFIG.EXT_VERSION || '',
      startedAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
      sessionId:'',
      meta:this.sanitizeRunDiagnostic_(meta),
      events:[],
      serverReport:null
    };
    try { localStorage.removeItem('KINOJO_LOOKUP_SESSION_DETAIL_REPORT'); } catch (_e) {}
    return this.writeRunDiagnostics_(payload);
  },

  appendRunDiagnostic_(stage, status, message, detail = {}) {
    const payload = this.readRunDiagnostics_() || this.resetRunDiagnostics_({ recovered:true });
    const events = Array.isArray(payload.events) ? payload.events.slice(-399) : [];
    events.push({
      time:new Date().toISOString(),
      stage:String(stage || 'UNKNOWN'),
      status:String(status || 'notice'),
      message:String(message || ''),
      detail:this.sanitizeRunDiagnostic_(detail || {})
    });
    payload.events = events;
    payload.updatedAt = new Date().toISOString();
    payload.sessionId = payload.sessionId || (this.getSessionId ? this.getSessionId() : '');
    return this.writeRunDiagnostics_(payload);
  },

  async captureSessionDetailReport_(reason = 'manual') {
    const sessionId = this.getSessionId ? this.getSessionId() : '';
    const sessionToken = this.getServerSessionToken_ ? this.getServerSessionToken_() : '';
    if (!sessionId || !sessionToken || !window.KINOJO_SUPABASE || !window.KINOJO_SUPABASE.lookupSessionDetailReport) return null;
    try {
      const report = await window.KINOJO_SUPABASE.lookupSessionDetailReport(sessionId, sessionToken);
      if (!report || report.ok !== true) {
        this.appendRunDiagnostic_('DETAIL_REPORT', 'error', report && (report.message || report.code) || '조회 상세 리포트 생성 실패', { reason, report });
        return report;
      }
      const payload = this.readRunDiagnostics_() || this.resetRunDiagnostics_({ recovered:true });
      payload.sessionId = sessionId;
      payload.serverReport = this.sanitizeRunDiagnostic_(report);
      payload.updatedAt = new Date().toISOString();
      this.writeRunDiagnostics_(payload);
      try { localStorage.setItem('KINOJO_LOOKUP_SESSION_DETAIL_REPORT', JSON.stringify(payload.serverReport)); } catch (_e) {}
      return report;
    } catch (error) {
      this.appendRunDiagnostic_('DETAIL_REPORT', 'error', String(error && error.message || error), { reason, errorData:error && error.data || null });
      return null;
    }
  },

  clearPhaseState_(preserveHistory = false) {
    const model = this.getPhaseModel_();
    if (model && model.clearState) model.clearState({ preserveHistory: preserveHistory === true });
    if (!preserveHistory) {
      ['list_master_compare','character_lookup','missing_recheck','master_sync','growth_review','ranking_rebuild','list_sheet_export'].forEach(id => {
        try { localStorage.removeItem('KINOJO_PHASE_STARTED_AT_' + id); } catch(_e) {}
      });
    }
  },

  getCurrentPhaseState_() {
    const model = this.getPhaseModel_();
    return model && model.readState ? model.readState() : null;
  },

  getPhaseSubsteps_(phaseId) {
    const model = this.getPhaseModel_();
    const phase = model && model.getPhase ? model.getPhase(phaseId) : null;
    return phase && Array.isArray(phase.substeps) ? phase.substeps : [];
  },

  getRuntimePassCode_() {
    let code = '';
    try { code = localStorage.getItem('KINOJO_RUNTIME_PASS_CODE') || ''; } catch (_e) {}
    code = String(code || '').trim();
    if (code) return code;
    code = prompt('조회 시작용 PASS KEY를 다시 입력해 주세요.\n서버 엔진 Lock/Session 생성에 필요합니다.') || '';
    code = String(code || '').trim();
    if (code) {
      try { localStorage.setItem('KINOJO_RUNTIME_PASS_CODE', code); } catch (_e) {}
    }
    return code;
  },


  async startUpdateFromServerEngine(config) {
    const K = window.AION2_CONFIG.KEYS;

    if (!this.isServerEngineMode_()) {
      throw new Error('Supabase Server Engine 설정이 필요합니다. config.json의 supabase 설정을 확인해 주세요.');
    }

    try {
      try { localStorage.removeItem(K.LIST_DEBUG); } catch (e) {}
      this.setPhaseState_('list_master_compare', 'active', 0, 3, '서버 엔진 상태와 조회 Lock을 확인합니다.');
      this.setPreparationStatus(1, 6, '서버 엔진 상태 확인 중');
      window.AION2_UI.pushTaskLog('🔒 KINOJO Server Engine 조회 상태를 확인합니다...');

      const passCode = this.getRuntimePassCode_();
      if (!passCode) throw new Error('PASS KEY가 없어 조회를 시작할 수 없습니다.');

      if (await this.blockIfSupabaseLocked_()) return;
      await this.delay(150);

      this.setPhaseState_('list_master_compare', 'active', 1, 5, 'Server Engine이 Google list 브릿지를 통해 원본 목록을 준비합니다.');
      this.setPreparationStatus(2, 6, 'Server Engine Runtime 시작 중');
      window.AION2_UI.pushTaskLog('📋 확장프로그램은 list 시트 URL을 직접 사용하지 않습니다. Server Engine 브릿지가 list 원본을 읽습니다...');

      // 조회 옵션은 확장프로그램에서 판정하지 않고 입력값 그대로 Server Engine에 전달합니다.
      const savedLookupSettings = (window.AION2_UI && window.AION2_UI.getLookupSettings)
        ? window.AION2_UI.getLookupSettings()
        : {};
      const lookupMode = String(savedLookupSettings.lookupMode || '').toLowerCase() === 'missing_only' ? 'missing_only' : 'all';
      const lookupFilter = {
        lookupMode,
        classes: Array.isArray(savedLookupSettings.classes) ? savedLookupSettings.classes.map(String).filter(Boolean) : [],
        gearTypes: lookupMode === 'missing_only' ? [] : (Array.isArray(savedLookupSettings.gearTypes) ? savedLookupSettings.gearTypes.map(String).filter(Boolean) : []),
        races: Array.isArray(savedLookupSettings.races) ? savedLookupSettings.races.map(String).filter(Boolean) : [],
        servers: Array.isArray(savedLookupSettings.servers) ? savedLookupSettings.servers.map(String).filter(Boolean) : [],
        characterName: String(savedLookupSettings.characterName || '').trim()
      };
      const lookupFilterSummary = (window.AION2_UI && window.AION2_UI.summarizeLookupSettings_)
        ? window.AION2_UI.summarizeLookupSettings_(lookupFilter)
        : '조회 설정';
      window.AION2_UI.pushTaskLog(`🎯 조회 조건: ${lookupFilterSummary}`);
      this.appendRunDiagnostic_('START', 'active', 'Server Engine 조회 시작 요청', { lookupFilter, lookupFilterSummary, clientVersion:window.AION2_CONFIG.EXT_VERSION });

      const startResult = await window.KINOJO_SUPABASE.runtimeStartServerQueue(passCode, {
        schemaVersion: 'kinojo-crawl-v2',
        tool: 'KINOJO_SERVER_CHARACTER_QUEUE',
        requestedSurface: 'KINOJO_EXTENSION',
        serverQueue: true,
        browserIndependentQueue: true,
        storesOfficialRaw: true,
        clientVersion: window.AION2_CONFIG.EXT_VERSION,
        buildDate: window.AION2_CONFIG.BUILD_DATE || '',
        listReadMode: 'server_edge_bridge',
        extensionDoesNotReadListSheet: true,
        pageUrl: location.href,
        lookupFilter,
        lookupFilterSummary
      });

      if (!startResult || startResult.ok !== true) {
        localStorage.setItem(K.RUNNING, 'false');
        this.clearSessionId();
        this.setServerSessionToken_('');
        this.stopHeartbeat();
        const message = startResult && (startResult.message || startResult.code) || 'Server Engine 조회 시작 실패';
        if (startResult && (startResult.locked || startResult.running)) {
          this.setBlockedByOther(true, startResult.status || startResult);
          this.startLockStatusPolling();
        }
        throw new Error(message);
      }

      const sessionId = startResult.sessionId || startResult.session_id || '';
      const sessionToken = startResult.sessionToken || startResult.session_token || '';
      if (!sessionId || !sessionToken) throw new Error('Server Engine sessionId/sessionToken이 비어 있습니다.');

      this.setSessionId(sessionId);
      this.setServerSessionToken_(sessionToken);
      this.appendRunDiagnostic_('RUNTIME_START', 'success', 'Server Engine Session 생성 완료', { sessionId, runtimeJobId:startResult.runtimeJobId || '', heartbeatIntervalSeconds:startResult.heartbeatIntervalSeconds || '' });
      this.setBlockedByOther(false);
      this.stopLockStatusPolling();
      this.startHeartbeat();
      this.startServerProgressPolling_();

      this.setPhaseState_('list_master_compare', 'active', 2, 5, 'Server Engine이 list 브릿지 원본을 읽고 character_master와 대조합니다.');
      this.setPreparationStatus(3, 6, 'Server Engine LIST / MASTER 대조 중');
      if (!window.KINOJO_SUPABASE.prepareLookupQueueFromServerBridge) {
        throw new Error('Server Engine list 브릿지 함수가 없습니다. core/supabase.js와 Edge Function 배포를 확인해 주세요.');
      }
      const prepareResult = await window.KINOJO_SUPABASE.prepareLookupQueueFromServerBridge(sessionId, sessionToken, {
        schemaVersion: 'kinojo-lookup-v2',
        pageUrl: location.href,
        clientVersion: window.AION2_CONFIG.EXT_VERSION,
        buildDate: window.AION2_CONFIG.BUILD_DATE || '',
        lookupFilter,
        lookupFilterSummary
      });
      if (!prepareResult || prepareResult.ok !== true) {
        throw new Error(prepareResult && (prepareResult.message || prepareResult.code) || 'Server Engine LIST / MASTER 대조 실패');
      }
      const sourceList = Array.isArray(prepareResult.queue) ? prepareResult.queue : [];
      const invalidServerRows = Array.isArray(prepareResult.invalidServerRows) ? prepareResult.invalidServerRows : [];
      const invalidServerCount = Number(prepareResult.invalidServerCount || invalidServerRows.length || 0);
      if (invalidServerCount > 0) {
        const names = invalidServerRows.slice(0, 8).map(row => row.originalName || row.characterName || `행 ${row.row || '?'}`).filter(Boolean);
        const suffix = invalidServerCount > names.length ? ` 외 ${invalidServerCount - names.length}명` : '';
        const message = `서버 태그 확인 필요 ${invalidServerCount}명 · ${names.join(', ')}${suffix}`;
        window.AION2_UI.pushTaskLog(`⚠️ ${message}`);
        this.recordPhaseIssue_('list_master_compare', message, {
          type:'failed',
          code:'SERVER_IDENTITY_INVALID',
          invalidServerCount,
          invalidServerRows:this.sanitizeRunDiagnostic_(invalidServerRows)
        });
        this.appendRunDiagnostic_('LIST_MASTER_COMPARE', 'error', message, {
          invalidServerCount,
          invalidServerRows:this.sanitizeRunDiagnostic_(invalidServerRows)
        });
      }
      const queueCount = Number(prepareResult.queueCount || sourceList.length || 0);
      const resolvedLookupMode = String(prepareResult.lookupMode || lookupFilter.lookupMode || 'all') === 'missing_only' ? 'missing_only' : 'all';
      const existingMasterCount = Number(prepareResult.existingMasterCount ?? prepareResult.existingCount ?? 0);
      const newCharacterCount = Number(prepareResult.newCharacterCount ?? prepareResult.newCount ?? 0);

      if (!queueCount) {
        if (resolvedLookupMode === 'missing_only') {
          localStorage.setItem(K.TOTAL, '0');
          localStorage.setItem(K.DONE, '0');
          localStorage.setItem(K.STORAGE, JSON.stringify([]));
          localStorage.removeItem(K.CURRENT);
          this.setPreparationStatus(5, 6, '신규 캐릭터 없음');
          this.setPhaseState_('list_master_compare', 'done', 5, 5, `1단계 완료 · list ${Number(prepareResult.rawListCount || 0)}명 · 기존 Master ${existingMasterCount}명 · 신규 0명`, {
            result:this.sanitizeRunDiagnostic_(prepareResult)
          });
          this.setPhaseState_('character_lookup', 'done', 0, 0, '신규 캐릭터가 없어 공식 조회를 실행하지 않았습니다.', { skipped:true, lookupMode:resolvedLookupMode });
          await window.KINOJO_SUPABASE.runtimeProgress(sessionId, sessionToken, 'NO_NEW_TARGETS', '', '신규 캐릭터 없음 · 조회 없이 정상 완료', 0, 0, {
            lookupMode:resolvedLookupMode,
            rawListCount:Number(prepareResult.rawListCount || 0),
            existingMasterCount,
            newCharacterCount:0,
            prepareResult
          });
          this.appendRunDiagnostic_('LIST_MASTER_COMPARE', 'success', '신규 캐릭터 없음 · 조회 없이 정상 완료', {
            lookupMode:resolvedLookupMode,
            rawListCount:Number(prepareResult.rawListCount || 0),
            existingMasterCount,
            newCharacterCount:0
          });
          window.AION2_UI.pushTaskLog(`✅ 신규 캐릭터가 없습니다. list ${Number(prepareResult.rawListCount || 0)}명과 Server Master가 일치합니다.`);
          this.clearPreparationStatus();
          await this.finishCompletedServerRun_(window.AION2_UTILS.formatNow());
          return;
        }

        localStorage.setItem(K.RUNNING, 'false');
        this.clearSessionId();
        this.setServerSessionToken_('');
        this.stopHeartbeat();
        window.AION2_UI.updateButtonState();
        window.AION2_UI.updateStatusBox();
        throw new Error('Server Engine 조회 Target이 없습니다. list 시트/대조 결과를 확인해 주세요.');
      }

      try {
        localStorage.setItem(K.LIST_DEBUG, JSON.stringify({
          listCount: queueCount,
          sourceListCount: sourceList.length,
          rawListCount: Number(prepareResult.rawListCount || prepareResult.listCount || 0),
          lookupFilterSummary: String(prepareResult.lookupFilterSummary || lookupFilterSummary || '전체 조회'),
          lookupFilter: prepareResult.lookupFilter || lookupFilter,
          lookupMode: resolvedLookupMode,
          existingMasterCount,
          newCharacterCount,
          source: 'Server Engine Edge Bridge → Google list sheet → Server Worker Queue',
          nextTargetRpc: 'character-refresh-worker/startAutonomous',
          newCount: prepareResult.newCount || 0,
          existingCount: prepareResult.existingCount || 0,
          correctedCount: prepareResult.correctedCount || 0,
          duplicateListCount: prepareResult.duplicateListCount || 0,
          duplicateMasterCount: prepareResult.duplicateMasterCount || 0,
          excludedCount: prepareResult.excludedCount || 0,
          absentCandidateCount: prepareResult.absentCandidateCount || 0,
          sessionId,
          runtimeJobId: startResult.runtimeJobId || '',
          heartbeatIntervalSeconds: startResult.heartbeatIntervalSeconds || ''
        }));
      } catch (e) {}
      this.appendRunDiagnostic_('LIST_MASTER_COMPARE', 'success', prepareResult.message || 'LIST / MASTER 대조 완료', {
        queueCount,
        rawListCount:Number(prepareResult.rawListCount || prepareResult.listCount || 0),
        newCount:Number(prepareResult.newCount || 0),
        existingCount:Number(prepareResult.existingCount || 0),
        correctedCount:Number(prepareResult.correctedCount || 0),
        duplicateListCount:Number(prepareResult.duplicateListCount || 0),
        duplicateMasterCount:Number(prepareResult.duplicateMasterCount || 0),
        excludedCount:Number(prepareResult.excludedCount || 0),
        lookupFilterSummary:prepareResult.lookupFilterSummary || lookupFilterSummary,
        lookupMode:resolvedLookupMode,
        existingMasterCount,
        newCharacterCount
      });
      await this.captureSessionDetailReport_('prepare_done');

      this.setPreparationStatus(5, 6, 'Server Engine Target 준비 완료');
      localStorage.removeItem(K.RETRY_QUEUE);
      localStorage.setItem(K.RETRY_ROUND, '0');
      localStorage.setItem(K.STORAGE, JSON.stringify([]));
      localStorage.removeItem(K.CURRENT);
      localStorage.setItem(K.TOTAL, String(queueCount));
      localStorage.setItem(K.DONE, '0');
      localStorage.setItem('KINOJO_STARTED_AT', String(Date.now()));
      await window.KINOJO_SUPABASE.runtimeProgress(sessionId, sessionToken, 'LIST_MASTER_COMPARE', '', '1단계 완료: Server Engine LIST / MASTER 대조 완료', 5, 5, { queueCount, rawListCount:Number(prepareResult.rawListCount || prepareResult.listCount || 0), phaseNo:1, prepareResult });
      this.setPhaseState_('list_master_compare', 'done', 5, 5, resolvedLookupMode === 'missing_only' ? `1단계 완료 · 신규 조회 ${queueCount}명 · 기존 Master ${existingMasterCount}명` : `1단계 완료 · 신규 ${newCharacterCount} · 기존 ${existingMasterCount} · 조회 ${queueCount}명`, {
        subStepNo:5,
        subSteps:this.getPhaseSubsteps_('list_master_compare'),
        timelineMode:true,
        result:this.sanitizeRunDiagnostic_(prepareResult)
      });
      await window.KINOJO_SUPABASE.runtimeProgress(sessionId, sessionToken, 'QUEUE_READY', '', 'Server Engine Target 큐 준비 완료', 0, queueCount, { queueCount, rawListCount:Number(prepareResult.rawListCount || prepareResult.listCount || 0), prepareResult });

      window.AION2_UTILS.touchProgress();
      window.AION2_UI.updateStatusBox();
      const queueMeta = {
        queueCount,
        rawListCount:Number(prepareResult.rawListCount || prepareResult.listCount || 0),
        existingMasterCount,
        newCharacterCount,
        invalidServerCount,
        lookupMode:resolvedLookupMode,
        lookupFilter:prepareResult.lookupFilter || lookupFilter,
        lookupFilterSummary:String(prepareResult.lookupFilterSummary || lookupFilterSummary),
        source:'KINOJO_EXTENSION_SERVER_QUEUE',
        batchLimit:5,
        browserIndependentQueue:true,
        storesOfficialRaw:true,
        lookupOnlyPhase:false,
        postprocessPhase:true,
        sheetDeferred:false,
        progressContract:'server-worker-seven-phase-v2'
      };
      const registered = await window.KINOJO_SUPABASE.serverQueueRegister(
        passCode,
        sessionId,
        sessionToken,
        queueMeta
      );
      if (!registered || registered.ok !== true) {
        throw new Error(registered && (registered.message || registered.code) || 'Server Worker Queue 등록 실패');
      }

      const handedOff = await window.KINOJO_SUPABASE.serverQueueStartAutonomous(sessionId, sessionToken);
      if (!handedOff || handedOff.ok !== true) {
        throw new Error(handedOff && (handedOff.message || handedOff.code) || 'Server Worker 자동 실행 인계 실패');
      }
      this.stopHeartbeat();

      window.AION2_UI.pushTaskLog(resolvedLookupMode === 'missing_only'
        ? `📦 신규 캐릭터 ${queueCount}명을 Server Worker에 인계했습니다.`
        : `📦 ${prepareResult.lookupFilterSummary || lookupFilterSummary} · ${queueCount}명을 Server Worker에 인계했습니다.`);
      this.setPreparationStatus(6, 6, 'Server Worker 자동 실행 중');
      this.setPhaseState_('character_lookup', 'active', 0, queueCount, '2단계 시작: Server Worker가 PLAYNC 공식 API를 조회합니다.', {
        browserIndependentQueue:true,
        progressContract:'server-worker-seven-phase-v2'
      });
      this.clearPreparationStatus();
      await this.captureServerDebugSnapshot_('poll');
    } catch (err) {
      this.appendRunDiagnostic_('START', 'error', String(err.message || err), { errorData:err && err.data || null, functionName:err && err.functionName || '', statusCode:err && err.status || null });
      this.markCurrentPhaseError_(String(err.message || err), { stage:'start', code:err && err.data && err.data.code || '', errorData:this.sanitizeRunDiagnostic_(err && err.data || null) }, 'list_master_compare');
      await this.captureSessionDetailReport_('start_error');
      localStorage.setItem(K.RUNNING, 'false');
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
      this.clearPreparationStatus();
      window.AION2_UI.pushTaskLog('❌ Server Engine 시작 단계에서 오류가 발생했습니다.');
      await this.sendClientLog('오류', 'Server Engine 시작 오류: ' + String(err.message || err));
      window.AION2_UI.notifyError('Server Engine 시작 오류: ' + String(err.message || err));
    }
  },

  async stopUpdate() {
    const K = window.AION2_CONFIG.KEYS;
    localStorage.setItem(K.RUNNING, "false");
    this.setStopReason("USER_PAUSE", { message: "사용자가 조회를 일시정지했습니다." });
    window.AION2_UI.updateButtonState();
    window.AION2_UI.updateStatusBox();
    window.AION2_UI.pushTaskLog("⏸️ 조회를 일시정지했습니다.");

    await this.releaseSupabaseLock_('cancelled', '사용자가 조회를 일시정지했습니다.');

    try { await window.AION2_REMOTE.load(); } catch (e) { console.error(e); }

    // 040 Server Engine 전환: Apps Script cancel 호출 없음.
    this.stopHeartbeat();
    this.stopServerProgressPolling_();
    // 일시정지는 작업 기록과 Server 세션 정보를 보존한다.
    // 사용자가 초기화 버튼을 눌렀을 때만 세션/진행 상태를 삭제한다.
    window.AION2_UTILS.goToIndexPage();
  },

  async resetState() {
    const ok = confirm("진행 기록을 초기화할까요?\n현재 큐/진행률/완료표시가 모두 지워집니다.");
    if (!ok) return;

    await this.releaseSupabaseLock_('cancelled', '사용자가 진행 기록을 초기화했습니다.');
    this.clearLocalRunState_('초기화 완료');
  },

  resetCompletedRunState() {
    // 완료된 Server Runtime은 finishCompletedServerRun_에서 이미 completed로 종료됐다.
    // 완료 모달의 초기화는 Server 상태를 cancelled로 다시 바꾸지 않고 로컬 기록만 삭제한다.
    this.clearLocalRunState_('완료 기록 초기화');
    return { ok:true, localOnly:true };
  },

  clearLocalRunState_(logMessage = '초기화 완료') {
    const K = window.AION2_CONFIG.KEYS;
    this.stopHeartbeat();
    this.stopLockStatusPolling();
    this.stopServerProgressPolling_();
    this.clearAllWorkState();
    this.clearSessionId();
    this.clearPhaseState_();
    this.setBlockedByOther(false);
    this.postprocessRetryInProgress = false;
    this.startInProgress = false;
    localStorage.setItem(K.RUNNING, 'false');

    if (window.AION2_UI) {
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
      window.AION2_UI.renderLogs();
      window.AION2_UI.pushLog(logMessage);
    }
    window.AION2_UTILS.goToIndexPage();
  },

  clearRunStateOnly() {
    const K = window.AION2_CONFIG.KEYS;
    localStorage.setItem(K.RUNNING, "false");
    localStorage.removeItem(K.TOTAL);
    localStorage.removeItem(K.DONE);
    localStorage.removeItem(K.CURRENT);
    localStorage.removeItem(K.LAST_PROGRESS);
  },

  clearAllWorkState() {
    const K = window.AION2_CONFIG.KEYS;
    localStorage.removeItem(K.STORAGE);
    localStorage.removeItem(K.CURRENT);
    localStorage.removeItem(K.TOTAL);
    localStorage.removeItem(K.DONE);
    localStorage.removeItem(K.LAST_DONE);
    localStorage.removeItem(K.LAST_PROGRESS);
    localStorage.removeItem(K.RETRY_QUEUE);
    localStorage.removeItem(K.RETRY_ROUND);
    localStorage.removeItem(K.PREP_STATUS);
    localStorage.removeItem(K.VERIFY_ROUND);
    localStorage.removeItem(K.VERIFY_RESULT);
    localStorage.removeItem(K.ITEM_TIMINGS);
    localStorage.removeItem(K.POSTPROCESS_GUARD);
    localStorage.removeItem("KINOJO_STARTED_AT");
    localStorage.removeItem(this.getRunDiagnosticsKey_());
    localStorage.removeItem('KINOJO_LOOKUP_SESSION_DETAIL_REPORT');
    localStorage.removeItem('KINOJO_LOOKUP_PROGRESS_SUMMARY');
    localStorage.removeItem('KINOJO_LOOKUP_DEBUG_SNAPSHOT');
    localStorage.removeItem('KINOJO_LOOKUP_DEBUG_SUMMARY');
    localStorage.removeItem('KINOJO_LAST_COMPLETION_REPORT');
    localStorage.removeItem('KINOJO_LAST_STOP_REASON');
    localStorage.setItem(K.LOG, JSON.stringify([]));
  },

  toggleAutoRecover() {
    const K = window.AION2_CONFIG.KEYS;
    const current = localStorage.getItem(K.AUTO_RECOVER) === "true";
    localStorage.setItem(K.AUTO_RECOVER, current ? "false" : "true");
    window.AION2_UI.updateButtonState();
    window.AION2_UI.pushLog(current ? "자동복구 OFF" : "자동복구 ON");
  },

  prepareStartAttempt() {
    if (window.AION2_UPDATER_STATE) {
      window.AION2_UPDATER_STATE.prepareStartAttempt(this);
      return;
    }

    this.stopHeartbeat();
    this.stopLockStatusPolling();
  },

  isStaleRunState() {
    return window.AION2_UPDATER_STATE
      ? window.AION2_UPDATER_STATE.isStaleRunState()
      : false;
  },

  clearStaleRunState(message) {
    if (window.AION2_UPDATER_STATE) {
      window.AION2_UPDATER_STATE.clearStaleRunState(this, message);
    }
  },


  setStopReason(reason, detail = {}) {
    const K = window.AION2_CONFIG.KEYS;
    const payload = {
      reason,
      detail,
      time: new Date().toISOString(),
      url: location.href,
      current: JSON.parse(localStorage.getItem(K.CURRENT) || "null"),
      total: localStorage.getItem(K.TOTAL) || "",
      done: localStorage.getItem(K.DONE) || "",
      queueLeft: (() => {
        try { return JSON.parse(localStorage.getItem(K.STORAGE) || "[]").length; }
        catch (e) { return ""; }
      })()
    };

    localStorage.setItem("KINOJO_LAST_STOP_REASON", JSON.stringify(payload));
    return payload;
  },

  getStopReason() {
    try {
      return JSON.parse(localStorage.getItem("KINOJO_LAST_STOP_REASON") || "null");
    } catch (e) {
      return null;
    }
  },

  clearStopReason() {
    localStorage.removeItem("KINOJO_LAST_STOP_REASON");
  },

  async sendClientDebug(type, detail = {}) {
    try {
      if (!window.KINOJO_SUPABASE || !window.KINOJO_SUPABASE.logErrorReport) return;
      const K = window.AION2_CONFIG.KEYS;
      const current = JSON.parse(localStorage.getItem(K.CURRENT) || 'null');
      const queue = JSON.parse(localStorage.getItem(K.STORAGE) || '[]');
      await window.KINOJO_SUPABASE.logErrorReport({
        pageUrl: location.href,
        feature: 'KINOJO_EXTENSION_DEBUG',
        action: type || 'client_debug',
        message: this.normalizeClientErrorMessage ? this.normalizeClientErrorMessage(detail).slice(0, 1000) : String(detail && detail.message || type || ''),
        sessionId: this.getSessionId ? this.getSessionId() : '',
        progress: `${localStorage.getItem(K.DONE) || '0'}/${localStorage.getItem(K.TOTAL) || '0'}`,
        character: current?.originalName || current?.name || '',
        row: current?.row || '',
        queueLeft: queue.length,
        payload: detail || {}
      });
    } catch (err) {
      console.warn('sendClientDebug failed:', err);
    }
  },


  async finishCompletedServerRun_(doneTime) {
    const K = window.AION2_CONFIG.KEYS;
    const finishedAt = doneTime || window.AION2_UTILS.formatNow();
    const finishResult = await this.releaseSupabaseLock_('completed', '전체 업데이트 완료');
    const completionReport = finishResult && finishResult.report && finishResult.report.ok !== false
      ? finishResult.report
      : this.buildCompletionReport_(finishedAt);

    localStorage.setItem('KINOJO_LAST_COMPLETION_REPORT', JSON.stringify(completionReport));
    localStorage.setItem(K.RUNNING, 'false');
    localStorage.setItem(K.LAST_DONE, finishedAt);
    this.stopHeartbeat();
    this.stopServerProgressPolling_();

    window.AION2_UI.updateButtonState();
    window.AION2_UI.updateStatusBox();
    window.AION2_UI.renderLogs();

    const closeCompletedRun = () => {
      // 우측 상단 ×는 완료 기록을 보존한 채 모달만 닫는다.
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
      window.AION2_UI.renderLogs();
      window.AION2_UTILS.goToIndexPage();
    };

    const resetCompletedRun = () => this.resetCompletedRunState();

    window.AION2_UI.notifyCompletion(completionReport, {
      onClose: closeCompletedRun,
      onReset: resetCompletedRun,
      onDetail: () => {
        window.AION2_UI.updateButtonState();
        window.AION2_UI.updateStatusBox();
        window.AION2_UI.renderLogs();
        window.AION2_UI.showRunReportDetail(completionReport, {
          onClose: () => window.AION2_UTILS.goToIndexPage()
        });
      }
    });
    return completionReport;
  },

  async retryServerPostprocess_() {
    if (this.postprocessRetryInProgress) return;
    const K = window.AION2_CONFIG.KEYS;
    const sessionId = this.getSessionId();
    const sessionToken = this.getServerSessionToken_();
    if (!sessionId || !sessionToken) {
      window.AION2_UI.notifyError("Server Worker 재시작에 필요한 세션 정보가 없습니다.");
      return;
    }

    this.postprocessRetryInProgress = true;
    try {
      localStorage.setItem(K.RUNNING, "true");
      this.clearStopReason();
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
      window.AION2_UI.pushTaskLog("🔁 저장된 Server Queue를 Worker에 다시 인계합니다.");
      const result = await window.KINOJO_SUPABASE.serverQueueStartAutonomous(sessionId, sessionToken);
      if (!result || result.ok !== true) {
        throw new Error(result && (result.message || result.code) || "Server Worker 재시작 실패");
      }
      this.startServerProgressPolling_();
      await this.captureServerDebugSnapshot_("poll");
    } catch (error) {
      localStorage.setItem(K.RUNNING, "false");
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
      window.AION2_UI.notifyError("Server Worker 재시작 실패: " + String(error.message || error));
    } finally {
      this.postprocessRetryInProgress = false;
    }
  },

  getRetryQueue() {
    const K = window.AION2_CONFIG.KEYS;
    try { return JSON.parse(localStorage.getItem(K.RETRY_QUEUE) || "[]"); }
    catch (e) { return []; }
  },

  clearRetryQueue() {
    const K = window.AION2_CONFIG.KEYS;
    localStorage.setItem(K.RETRY_QUEUE, JSON.stringify([]));
  },

  setPreparationStatus(step, total, message) {
    const K = window.AION2_CONFIG.KEYS;
    const payload = { step:Number(step||0), total:Number(total||0), message:String(message||""), time:Date.now() };
    localStorage.setItem(K.PREP_STATUS, JSON.stringify(payload));
    if (window.AION2_UI && typeof window.AION2_UI.updateStatusBox === "function") window.AION2_UI.updateStatusBox();
  },

  clearPreparationStatus() {
    const K = window.AION2_CONFIG.KEYS;
    localStorage.removeItem(K.PREP_STATUS);
    if (window.AION2_UI && typeof window.AION2_UI.updateStatusBox === "function") window.AION2_UI.updateStatusBox();
  },

  setSessionId(sessionId) {
    const value = String(sessionId || "");
    localStorage.setItem("KINOJO_SESSION_ID", value);
    localStorage.setItem("KINOJO_ACTIVE_SESSION_ID", value);
  },
  getSessionId() { return localStorage.getItem("KINOJO_ACTIVE_SESSION_ID") || localStorage.getItem("KINOJO_SESSION_ID") || ""; },
  clearSessionId() {
    localStorage.removeItem("KINOJO_SESSION_ID");
    localStorage.removeItem("KINOJO_ACTIVE_SESSION_ID");
    localStorage.removeItem("KINOJO_SERVER_ENGINE_SESSION_TOKEN");
  },

  setBlockedByOther(isBlocked, status = null) {
    localStorage.setItem("KINOJO_BLOCKED_BY_OTHER", isBlocked ? "true" : "false");
    if (!isBlocked) localStorage.removeItem("KINOJO_LOCK_STATUS");

    if (window.AION2_UI) {
      if (isBlocked && status && typeof window.AION2_UI.cacheLockStatus_ === "function") {
        window.AION2_UI.cacheLockStatus_(window.AION2_UI.normalizeLockStatus_ ? window.AION2_UI.normalizeLockStatus_(status) : status);
      }
      if (typeof window.AION2_UI.setExternalBlockedState === "function") {
        window.AION2_UI.setExternalBlockedState(isBlocked);
      }
      if (isBlocked && typeof window.AION2_UI.showLockedStatus === "function") {
        window.AION2_UI.showLockedStatus(status || (window.AION2_UI.readCachedLockStatus_ ? window.AION2_UI.readCachedLockStatus_() : {}));
      }
      if (typeof window.AION2_UI.updateButtonState === "function") {
        window.AION2_UI.updateButtonState();
      }
    }
  },

  isBlockedByOther() { return localStorage.getItem("KINOJO_BLOCKED_BY_OTHER") === "true"; },


  startServerProgressPolling_() {
    this.stopServerProgressPolling_();
    if (!this.isServerEngineMode_ || !this.isServerEngineMode_()) return;
    if (!window.KINOJO_SUPABASE || (!window.KINOJO_SUPABASE.lookupDebugSnapshot && !window.KINOJO_SUPABASE.lookupGetSessionProgress)) return;

    const timerApi = window.AION2_UPDATER_TIMERS;
    const start = timerApi
      ? timerApi.start.bind(timerApi)
      : (owner, key, ms, cb) => { owner[key] = setInterval(cb, ms); return owner[key]; };

    start(this, 'serverProgressPollTimer', 4000, async () => {
      const K = window.AION2_CONFIG.KEYS;
      if (localStorage.getItem(K.RUNNING) !== 'true') {
        this.stopServerProgressPolling_();
        return;
      }
      await this.captureServerDebugSnapshot_('poll');
    });
  },

  stopServerProgressPolling_() {
    if (window.AION2_UPDATER_TIMERS) {
      window.AION2_UPDATER_TIMERS.stop(this, 'serverProgressPollTimer');
      return;
    }
    if (this.serverProgressPollTimer) {
      clearInterval(this.serverProgressPollTimer);
      this.serverProgressPollTimer = null;
    }
  },

  async captureServerDebugSnapshot_(reason = 'manual') {
    if (reason === 'poll' && this.serverProgressPollInFlight_) return null;
    if (reason === 'poll') this.serverProgressPollInFlight_ = true;
    try {
      if (!this.isServerEngineMode_ || !this.isServerEngineMode_()) return null;
      const sessionId = this.getSessionId();
      const sessionToken = this.getServerSessionToken_ ? this.getServerSessionToken_() : '';
      if (!sessionId || !window.KINOJO_SUPABASE) return null;

      // 실시간 숫자는 가벼운 Server 진행 요약 RPC만 사용한다.
      // 상세 진단 Snapshot은 수동/오류/완료 시점에만 유지한다.
      if (reason === 'poll' && window.KINOJO_SUPABASE.serverQueueStatus) {
        const status = await window.KINOJO_SUPABASE.serverQueueStatus(
          this.getRuntimePassCode_ ? this.getRuntimePassCode_() : '',
          sessionId
        );
        if (sessionId !== this.getSessionId()) return null;
        const progress = status && status.progress && status.progress.ok === true
          ? status.progress
          : null;
        if (progress && progress.ok === true && this.storeServerProgressSummary_) {
          this.storeServerProgressSummary_(progress);
        }
        const terminalStatus = String(
          status && (status.session?.status || status.job?.status || status.status) || ''
        ).toLowerCase();
        if (status && status.active !== true && ['completed', 'failed', 'cancelled', 'expired'].includes(terminalStatus)) {
          const K = window.AION2_CONFIG.KEYS;
          localStorage.setItem(K.RUNNING, 'false');
          this.stopServerProgressPolling_();
          window.AION2_UI.updateButtonState();
          window.AION2_UI.updateStatusBox();
          window.AION2_UI.pushTaskLog(
            terminalStatus === 'completed'
              ? '✅ Server Worker 조회와 후처리가 완료됐습니다.'
              : `⚠️ Server Worker 작업이 ${terminalStatus} 상태로 종료됐습니다.`
          );
        }
        if (window.AION2_UI && typeof window.AION2_UI.renderDebugDrawer_ === 'function'
            && document.getElementById('aion2DebugDrawer')) {
          window.AION2_UI.renderDebugDrawer_();
        }
        return status || progress || null;
      }

      const result = window.KINOJO_SUPABASE.lookupDebugSnapshot
        ? await window.KINOJO_SUPABASE.lookupDebugSnapshot(sessionId, sessionToken)
        : await window.KINOJO_SUPABASE.lookupGetSessionProgress(sessionId);

      if (!result || result.ok !== true) return result || null;

      let progress = null;
      if (window.KINOJO_SUPABASE.lookupProgressSummary) {
        progress = await window.KINOJO_SUPABASE.lookupProgressSummary(sessionId);
        if (progress && progress.ok === true && this.storeServerProgressSummary_) {
          this.storeServerProgressSummary_(progress);
        }
      } else if (result.progress && result.progress.ok === true) {
        progress = result.progress;
        if (this.storeServerProgressSummary_) this.storeServerProgressSummary_(progress);
      }

      const snapshot = Object.assign({}, result, {
        progress: progress && progress.ok === true ? progress : (result.progress || null),
        reason,
        capturedAt: Date.now()
      });
      localStorage.setItem('KINOJO_LOOKUP_DEBUG_SNAPSHOT', JSON.stringify(snapshot));

      const targets = snapshot.targets || {};
      const payloads = snapshot.payloads || {};
      const sheet = snapshot.sheetSync || {};
      const checks = snapshot.checks || {};
      localStorage.setItem('KINOJO_LOOKUP_DEBUG_SUMMARY', JSON.stringify({
        sessionId,
        reason,
        targetTotal: Number(targets.total || progress?.total || 0),
        lookupDone: Number(targets.lookupDone || progress?.successCount || 0),
        missing: Number(targets.missing || 0),
        retryQueued: Number(targets.retryQueued || 0),
        finalFailed: Number(targets.finalFailed || progress?.finalFailedCount || 0),
        payloadTotal: Number(payloads.total || 0),
        sheetTotal: Number(sheet.total || 0),
        sheetSynced: Number(sheet.synced || 0),
        hasSession: checks.hasSession === true,
        readyForFinalize: checks.readyForFinalize === true,
        safeToComplete: checks.safeToComplete === true,
        capturedAt: Date.now()
      }));

      if (reason !== 'poll' && window.AION2_UI && window.AION2_UI.pushTaskLog) {
        const finalFailed = Number(targets.finalFailed || progress?.finalFailedCount || 0);
        window.AION2_UI.pushTaskLog(`🧭 서버 검증 스냅샷(${reason}) · 성공 ${Number(targets.lookupDone || progress?.successCount || 0)} · 최종실패 ${finalFailed} · 전체 ${Number(targets.total || progress?.total || 0)} · payload ${Number(payloads.total || 0)} · sheet ${Number(sheet.synced || 0)}/${Number(sheet.total || 0)}`);
      }

      if (window.AION2_UI && typeof window.AION2_UI.renderDebugDrawer_ === 'function'
          && document.getElementById('aion2DebugDrawer')) {
        window.AION2_UI.renderDebugDrawer_();
      }
      return snapshot;
    } catch (e) {
      console.warn('KINOJO server debug snapshot failed:', e);
      return null;
    } finally {
      if (reason === 'poll') this.serverProgressPollInFlight_ = false;
    }
  },

  startHeartbeat() {
    this.stopHeartbeat();
    const timerApi = window.AION2_UPDATER_TIMERS;
    const start = timerApi
      ? timerApi.start.bind(timerApi)
      : (owner, key, ms, callback) => {
          owner[key] = setInterval(callback, ms);
          return owner[key];
        };

    start(this, "heartbeatTimer", 10000, async () => {
      const K = window.AION2_CONFIG.KEYS;
      if (localStorage.getItem(K.RUNNING) !== "true" || !this.getSessionId()) {
        this.stopHeartbeat();
        return;
      }
      await this.heartbeatSupabaseLock_();
    });
  },

  stopHeartbeat() {
    if (window.AION2_UPDATER_TIMERS) {
      window.AION2_UPDATER_TIMERS.stop(this, "heartbeatTimer");
      return;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  },

  startLockStatusPolling() {
    this.stopLockStatusPolling();
    const timerApi = window.AION2_UPDATER_TIMERS;
    const start = timerApi
      ? timerApi.start.bind(timerApi)
      : (owner, key, ms, callback) => {
          owner[key] = setInterval(callback, ms);
          return owner[key];
        };

    start(this, "lockPollTimer", 5000, async () => {
      try {
        const status = await this.readSupabaseLockStatus_();
        if (!status || !status.running) {
          this.setBlockedByOther(false);
          this.stopLockStatusPolling();
          window.AION2_UI.pushLog("조회 가능 상태로 전환됨");
          window.AION2_UI.updateStatusBox();
        } else {
          this.setBlockedByOther(true, status);
        }
      } catch (error) {
        console.warn("Server lock polling failed:", error);
      }
    });
  },

  stopLockStatusPolling() {
    if (window.AION2_UPDATER_TIMERS) {
      window.AION2_UPDATER_TIMERS.stop(this, "lockPollTimer");
      return;
    }

    if (this.lockPollTimer) {
      clearInterval(this.lockPollTimer);
      this.lockPollTimer = null;
    }
  },

  normalizeClientErrorMessage(detail = {}) {
    if (!detail) return "";
    if (typeof detail === "string") return detail;

    const message = detail.message || detail.serverError || detail.serverMessage || detail.error;
    if (message) return String(message);

    try {
      return JSON.stringify(detail);
    } catch (e) {
      return String(detail);
    }
  },

  async sendClientFailure(type, detail = {}) {
    try {
      if (!window.KINOJO_SUPABASE || !window.KINOJO_SUPABASE.logErrorReport) return;
      const K = window.AION2_CONFIG.KEYS;
      const current = JSON.parse(localStorage.getItem(K.CURRENT) || 'null');
      await window.KINOJO_SUPABASE.logErrorReport({
        pageUrl: location.href,
        feature: 'KINOJO_EXTENSION',
        action: type || 'clientFailure',
        message: this.normalizeClientErrorMessage ? this.normalizeClientErrorMessage(detail).slice(0, 1000) : String(detail && detail.message || type || ''),
        raw: detail && detail.raw || null,
        sessionId: this.getSessionId ? this.getSessionId() : '',
        progress: `${localStorage.getItem(K.DONE) || '0'}/${localStorage.getItem(K.TOTAL) || '0'}`,
        character: current?.originalName || current?.name || detail.character || '',
        row: current?.row || detail.row || '',
        reason: detail.reason || type,
        detail
      });
    } catch (e) {
      console.warn('sendClientFailure failed:', e);
    }
  },

  async sendClientLog(state, detail) {
    try {
      if (!window.KINOJO_SUPABASE || !window.KINOJO_SUPABASE.logErrorReport) return;
      await window.KINOJO_SUPABASE.logErrorReport({
        pageUrl: location.href,
        feature: 'KINOJO_EXTENSION_LOG',
        action: String(state || 'log'),
        message: String(detail || '').slice(0, 1000),
        sessionId: this.getSessionId ? this.getSessionId() : '',
        version: window.AION2_CONFIG.EXT_VERSION,
        isLogOnly: true
      });
    } catch(e) {}
  },


  async sendBugReport() {
    const memo = prompt('버그 내용을 간단히 적어주세요.\n최근 로그는 자동으로 함께 전송됩니다.');
    if (memo === null) return;

    const K = window.AION2_CONFIG.KEYS;
    const logs = JSON.parse(localStorage.getItem(K.LOG) || '[]');
    const current = JSON.parse(localStorage.getItem(K.CURRENT) || 'null');

    try {
      if (!window.KINOJO_SUPABASE || !window.KINOJO_SUPABASE.logErrorReport) throw new Error('Server Engine 로그 기능을 사용할 수 없습니다.');
      const result = await window.KINOJO_SUPABASE.logErrorReport({
        pageUrl: location.href,
        feature: 'KINOJO_EXTENSION',
        action: 'bugReport',
        message: memo,
        sessionId: this.getSessionId(),
        version: window.AION2_CONFIG.EXT_VERSION,
        current,
        logs: logs.slice(0, 10),
        isLogOnly: true
      });
      alert(result && result.ok !== false ? '버그 리포트를 전송했습니다.' : '버그 리포트 전송 실패');
    } catch (err) {
      alert('버그 리포트 전송 오류: ' + String(err.message || err));
    }
  },


  async openRunHistory() {
    const passCode = this.getRuntimePassCode_ ? this.getRuntimePassCode_() : '';
    if (!passCode) {
      window.AION2_UI.notifyError('조회 기록을 확인하려면 PASS KEY 로그인이 필요합니다.');
      return;
    }
    if (!window.KINOJO_SUPABASE || !window.KINOJO_SUPABASE.getRunReports) {
      window.AION2_UI.notifyError('조회 기록 Server RPC가 없습니다. 237.sql과 확장프로그램 파일을 확인해 주세요.');
      return;
    }

    try {
      window.AION2_UI.showRunHistoryLoading();
      const result = await window.KINOJO_SUPABASE.getRunReports(passCode, 40);
      if (!result || result.ok !== true) throw new Error(result && (result.message || result.code) || '조회 기록을 불러오지 못했습니다.');
      this.runHistoryCache_ = result;
      window.AION2_UI.showRunHistory(result);
    } catch (err) {
      window.AION2_UI.closeRunHistory();
      window.AION2_UI.notifyError('조회 기록 불러오기 실패: ' + String(err.message || err));
    }
  },

  async openRunReportDetail(sessionId) {
    const passCode = this.getRuntimePassCode_ ? this.getRuntimePassCode_() : '';
    if (!passCode || !sessionId) return;
    try {
      window.AION2_UI.setRunHistoryBusy_(sessionId, true);
      const result = await window.KINOJO_SUPABASE.getRunReportDetail(passCode, sessionId);
      if (!result || result.ok !== true || !result.report) {
        throw new Error(result && (result.message || result.code) || '상세 기록을 불러오지 못했습니다.');
      }
      window.AION2_UI.showRunReportDetail(result.report, {
        onBack: () => window.AION2_UI.showRunHistory(this.runHistoryCache_ || { ok:true, items:[] })
      });
    } catch (err) {
      window.AION2_UI.notifyError('상세 기록 불러오기 실패: ' + String(err.message || err));
    } finally {
      window.AION2_UI.setRunHistoryBusy_(sessionId, false);
    }
  },

  buildCompletionReport_(doneTime) {
    const K = window.AION2_CONFIG.KEYS;
    const total = Number(localStorage.getItem(K.TOTAL) || 0);
    const done = Number(localStorage.getItem(K.DONE) || 0);
    const retryQueue = this.getRetryQueue ? this.getRetryQueue() : [];
    const startedAt = Number(localStorage.getItem('KINOJO_STARTED_AT') || 0);
    const elapsedMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
    return {
      ok: true,
      completedAt: doneTime || window.AION2_UTILS.formatNow(),
      displayLabel: doneTime || '최근 조회',
      total,
      done,
      success: done,
      failed: Math.max(0, total - done),
      retryLeft: Array.isArray(retryQueue) ? retryQueue.length : 0,
      elapsedSeconds: Math.round(elapsedMs / 1000),
      elapsedText: window.KINOJO_UPDATER_PHASES && window.KINOJO_UPDATER_PHASES.formatDuration ? window.KINOJO_UPDATER_PHASES.formatDuration(elapsedMs) : `${Math.round(elapsedMs/1000)}초`,
      version: window.AION2_CONFIG.EXT_VERSION,
      extensionVersion: window.AION2_CONFIG.EXT_VERSION,
      counts: {
        total,
        lookupDone: done,
        changed: 0,
        unchanged: 0,
        noComparison: done,
        pveUpdated: 0,
        pvpUpdated: 0,
        new: 0,
        failed: Math.max(0, total - done),
        skipped: 0,
        listSynced: 0
      },
      details: {}
    };
  },

  resetCompletedRun_(doneTime) {
    // 하위 호환용 함수. 완료 상태는 자동 초기화하지 않는다.
    // 실제 삭제는 resetState() 또는 resetCompletedRunState() 경로에서만 수행한다.
    const K = window.AION2_CONFIG.KEYS;
    localStorage.setItem(K.RUNNING, 'false');
    localStorage.setItem(K.LAST_DONE, doneTime || window.AION2_UTILS.formatNow());
    this.stopHeartbeat();
    this.stopServerProgressPolling_();
    if (window.AION2_UI) {
      window.AION2_UI.updateButtonState();
      window.AION2_UI.updateStatusBox();
      window.AION2_UI.renderLogs();
    }
  },

  delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
};
