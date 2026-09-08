/**
 * KINOJO Supabase bridge for extension
 * ------------------------------------------------------------
 * 1차 목표:
 * - 웹 PASS KEY(member_codes)와 확장프로그램 로그인 통합
 * - 조회 잠금(crawl_locks)을 Apps Script보다 먼저 빠르게 확인
 * - 조회 진행 상태(crawl_status)를 Supabase에 heartbeat로 갱신
 *
 * 보안 원칙:
 * - 브라우저/확장프로그램에는 publishable key만 넣습니다.
 * - secret/service_role key, DB password는 절대 넣지 않습니다.
 * - RLS 적용 전에는 민감 테이블 공개 범위를 SQL 정책으로 반드시 통제해야 합니다.
 */
(function(){
  'use strict';

  const LOCK_ID = 'global';
  const DEFAULT_TIMEOUT_MS = 8000;

  const ROLE_LEVELS = {
    GUEST: 0,
    MEMBER: 1,
    STAFF: 2,
    MANAGER: 3,
    'SUB MASTER': 4,
    SUB_MASTER: 4,
    MASTER: 5
  };

  const ROLE_LABELS = {
    GUEST: 'Guest',
    MEMBER: 'Member',
    STAFF: 'Staff',
    MANAGER: 'Manager',
    'SUB MASTER': 'Sub Master',
    SUB_MASTER: 'Sub Master',
    MASTER: 'Master'
  };

  function roleFromLevel(level){
    const n = Number(level || 0);
    if (n >= 5) return 'MASTER';
    if (n >= 4) return 'SUB MASTER';
    if (n >= 3) return 'MANAGER';
    if (n >= 2) return 'STAFF';
    if (n >= 1) return 'MEMBER';
    return 'GUEST';
  }

  function normalizeRole(role, fallbackLevel){
    const rawValue = role === undefined || role === null || role === '' ? '' : String(role);
    if (!rawValue) return roleFromLevel(fallbackLevel);
    if (/^\d+$/.test(rawValue.trim())) return roleFromLevel(Number(rawValue));
    const raw = rawValue.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (raw === 'SUBMASTER' || raw === 'SUB_MASTER') return 'SUB MASTER';
    if (raw === 'ADMIN' || raw === 'MANAGER') return 'MANAGER';
    if (raw === 'TESTER' || raw === 'MEMBER') return 'MEMBER';
    if (raw === 'STAFF') return 'STAFF';
    if (raw === 'MASTER') return 'MASTER';
    if (raw === 'GUEST') return 'GUEST';
    return roleFromLevel(fallbackLevel);
  }

  function roleToLevel(role, fallback){
    const key = normalizeRole(role);
    if (Object.prototype.hasOwnProperty.call(ROLE_LEVELS, key)) return ROLE_LEVELS[key];
    const num = Number(fallback);
    return Number.isFinite(num) ? num : 0;
  }

  function getRoleLabel(role){
    const key = normalizeRole(role);
    return ROLE_LABELS[key] || key.toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());
  }

  function getCurrentProfile(){
    const profile = readMemberProfile() || {};
    const role = normalizeRole(profile.role || window.AION2_CONFIG.CLIENT_ROLE || 'GUEST', profile.level);
    const level = Number.isFinite(Number(profile.level)) ? Number(profile.level) : roleToLevel(role, 0);
    return Object.assign({}, profile, { role, roleLabel: profile.role_label || getRoleLabel(role), level });
  }

  function canUseCrawler(profile){
    const p = profile || getCurrentProfile();
    return Number(p.level || 0) >= 1;
  }

  function getConfig(){
    const cfg = window.AION2_CONFIG && window.AION2_CONFIG.SUPABASE;
    const url = String(cfg && cfg.url || '').trim()
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/$/, '');
    const key = String(cfg && (cfg.publishableKey || cfg.anonKey) || '').trim();
    const rawEnabled = !!(cfg && (cfg.enabled === true || String(cfg.enabled).toLowerCase() === 'true'));
    const hasPlaceholderKey = !key || /PASTE_|YOUR_|여기에/i.test(key);
    const enabled = !!(rawEnabled && url && key && !hasPlaceholderKey);
    return { enabled, rawEnabled, url, key, hasPlaceholderKey };
  }

  function isEnabled(){ return getConfig().enabled; }
  function isPreferred(){ return getConfig().rawEnabled; }

  function normalizeError(err){
    return String(err && err.message || err || 'Supabase 요청 실패');
  }

  function withTimeout(promise, timeoutMs, label){
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error((label || 'Supabase') + ' 응답 시간 초과')), timeoutMs || DEFAULT_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function headers(prefer){
    const cfg = getConfig();
    const h = {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      'content-type': 'application/json'
    };
    if (prefer) h.prefer = prefer;
    return h;
  }

  function buildUrl(path, query){
    const cfg = getConfig();
    // query가 문자열이면 이미 필요한 인코딩이 적용된 REST 쿼리로 간주한다.
    // URLSearchParams로 다시 감싸면 한글 PASS KEY가 이중 인코딩되어 조회 결과가 []가 된다.
    const queryString = typeof query === 'string'
      ? query.replace(/^\?/, '')
      : new URLSearchParams(query || {}).toString();
    return cfg.url + '/rest/v1/' + path.replace(/^\//, '') + (queryString ? '?' + queryString : '');
  }

  async function request(path, options){
    const cfg = getConfig();
    if (!cfg.rawEnabled) throw new Error('Supabase 설정이 꺼져 있습니다. config.json의 supabase.enabled를 true로 설정하세요.');
    if (cfg.hasPlaceholderKey) throw new Error('Supabase publishableKey가 아직 입력되지 않았습니다. sb_publishable_로 시작하는 전체 키를 config.json 또는 core/config.js에 넣어주세요.');
    if (!cfg.enabled) throw new Error('Supabase 설정이 완료되지 않았습니다.');
    const res = await withTimeout(fetch(buildUrl(path, options && options.query), {
      method: options && options.method || 'GET',
      headers: headers(options && options.prefer),
      body: options && options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    }), options && options.timeoutMs, 'Supabase');

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch (_e) { data = text; }
    }
    if (!res.ok) {
      const msg = data && (data.message || data.details || data.hint) || text || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function rpc(functionName, body, options){
    return request('rpc/' + String(functionName || '').replace(/^\//, ''), {
      method: 'POST',
      body: body || {},
      timeoutMs: options && options.timeoutMs || DEFAULT_TIMEOUT_MS
    });
  }


  async function edgeFunction(functionName, body, options){
    const cfg = getConfig();
    if (!cfg.rawEnabled) throw new Error('Supabase 설정이 꺼져 있습니다. config.json의 supabase.enabled를 true로 설정하세요.');
    if (cfg.hasPlaceholderKey) throw new Error('Supabase publishableKey가 아직 입력되지 않았습니다.');
    if (!cfg.enabled) throw new Error('Supabase 설정이 완료되지 않았습니다.');
    const fn = String(functionName || '').replace(/^\//, '');
    const endpoint = cfg.url + '/functions/v1/' + fn;
    let res;
    try {
      res = await withTimeout(fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: cfg.key,
          Authorization: 'Bearer ' + cfg.key,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body || {}),
        cache: 'no-store'
      }), options && options.timeoutMs || 180000, 'Supabase Edge Function ' + fn);
    } catch (err) {
      const wrapped = new Error('Edge Function 연결 실패: ' + fn + ' · ' + String(err && err.message || err));
      wrapped.functionName = fn;
      wrapped.url = endpoint;
      wrapped.originalError = err;
      throw wrapped;
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch (_e) { data = text; }
    }
    if (!res.ok) {
      const msg = data && (data.message || data.error || data.details || data.hint) || text || ('HTTP ' + res.status);
      const err = new Error('Edge Function 오류: ' + fn + ' · HTTP ' + res.status + ' · ' + msg);
      err.status = res.status;
      err.data = data;
      err.functionName = fn;
      err.url = endpoint;
      throw err;
    }
    return data;
  }

  function normalizeRuntimeResult(result){
    const data = Array.isArray(result) ? result[0] : result;
    return data && typeof data === 'object' ? data : { ok:false, message:'Server Engine 응답이 올바르지 않습니다.', raw:data };
  }

  function table(name){
    return {
      select(query){ return request(name, { query }); },
      insert(body, prefer){ return request(name, { method:'POST', body, prefer: prefer || 'return=representation' }); },
      patch(query, body, prefer){ return request(name, { method:'PATCH', query, body, prefer: prefer || 'return=representation' }); },
      upsert(body, prefer){ return request(name, { method:'POST', body, prefer: prefer || 'resolution=merge-duplicates,return=representation' }); }
    };
  }

  function normalizePassKey(passKey){
    // 웹 로그인창과 동일한 규칙:
    // - 영문은 대문자화
    // - 공백은 제거
    // - 한글/숫자/특수문자는 임의 삭제하지 않음
    // - IME 조합을 깨뜨리지 않도록 Array.from 사용
    return Array.from(String(passKey || '').replace(/[a-z]/g, ch => ch.toUpperCase()).replace(/\s+/g, '')).slice(0, 12).join('');
  }

  async function verifyPassKey(passKey){
    const code = normalizePassKey(passKey);
    if (!code) throw new Error('PASS KEY를 입력하세요.');

    // 040-03: member_codes 직접 SELECT 금지.
    // 웹 로그인에서 겪었던 RLS/Policy/정규화 문제 재발을 막기 위해 서버 RPC만 사용한다.
    const data = normalizeRuntimeResult(await rpc('kinojo_member_verify_pass_key', {
      p_pass_key: code,
      p_tool_name: 'KINOJO_EXTENSION'
    }, { timeoutMs: 20000 }));

    if (!data.ok) {
      const err = new Error(data.message || 'PASS KEY가 없거나 비활성화된 계정입니다.');
      err.code = data.code || 'PASS_KEY_VERIFY_FAILED';
      err.data = data;
      throw err;
    }

    const profile = data.profile || data.account || data;
    const level = Number(profile.level || 0);
    const role = normalizeRole(profile.role, level);
    const roleLevel = level || roleToLevel(role, 0);
    if (roleLevel < 1) throw new Error('조회 권한이 없는 계정입니다. Member 이상만 조회할 수 있습니다.');
    return {
      id: profile.id,
      mainCharacterName: profile.mainCharacterName || profile.main_character_name || profile.mainCharacter || '',
      mainCharacter: profile.mainCharacter || profile.mainCharacterName || profile.main_character_name || '',
      level: roleLevel,
      role,
      roleLabel: profile.roleLabel || profile.role_label || getRoleLabel(role),
      canManage: profile.canManage === true || profile.can_manage === true || roleLevel >= 3,
      canLike: profile.canLike !== false && profile.can_like !== false,
      canSuggest: profile.canSuggest !== false && profile.can_suggest !== false,
      source: profile.source || 'supabase_rpc',
      verifiedAt: Date.now(),
      passKey: code
    };
  }

  function readMemberProfile(){
    try { return JSON.parse(localStorage.getItem('KINOJO_MEMBER_PROFILE') || 'null') || null; }
    catch (_e) { return null; }
  }

  function saveMemberProfile(profile){
    localStorage.setItem('KINOJO_MEMBER_PROFILE', JSON.stringify(Object.assign({}, profile, { verifiedAt: Date.now() })));
  }

  function getDeviceId(){
    let id = localStorage.getItem('KINOJO_DEVICE_ID');
    if (!id) {
      id = 'ext_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('KINOJO_DEVICE_ID', id);
    }
    return id;
  }

  function normalizeLock(row){
    if (!row) return { ok:true, running:false };

    // 038 Runtime live status shape
    if (row.isLocked !== undefined || row.progressCurrent !== undefined || row.lockedBy !== undefined) {
      const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
      const expired = expiresAt && expiresAt < Date.now();
      const running = row.isLocked === true && !expired;
      const ownerRole = normalizeRole(row.lockedByRole || row.ownerRole || '');
      const ownerLevel = Number(row.lockedByLevel || row.ownerLevel || roleToLevel(ownerRole, 0));
      const ownerLabel = getRoleLabel(ownerRole);
      return {
        ok: row.ok !== false,
        running,
        locked: running,
        sessionId: row.sessionId || '',
        owner: row.lockedBy || row.owner || ownerLabel || '',
        ownerCharacterName: row.lockedBy || row.ownerCharacterName || '',
        ownerRole,
        ownerRoleLabel: ownerLabel,
        ownerLevel,
        deviceId: row.clientId || row.deviceId || '',
        startedAt: row.startedAt || '',
        lastSeenAt: row.lastHeartbeatAt || row.lastSeenAt || '',
        expiresAt: row.expiresAt || '',
        count: Number(row.progressCurrent || row.count || 0),
        total: Number(row.progressTotal || row.total || 0),
        percent: Number(row.progressPercent || 0),
        stage: row.stage || '',
        currentCharacter: row.currentCharacter || '',
        message: running ? (row.message || '조회가 진행 중입니다.') : (row.message || '조회 대기 중'),
        heartbeatStale: row.heartbeatStale === true,
        shouldExpire: row.shouldExpire === true,
        recentEvents: row.recentEvents || []
      };
    }

    // Legacy crawl_locks shape
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    const expired = expiresAt && expiresAt < Date.now();
    const ownerRole = normalizeRole(row.owner_role || '');
    const ownerLevel = Number(row.owner_level ?? roleToLevel(ownerRole, 0));
    const running = row.running === true && !expired;
    const ownerLabel = getRoleLabel(ownerRole);
    return {
      ok:true,
      running,
      locked: running,
      sessionId: row.session_id || '',
      owner: row.owner_character_name || ownerLabel || '',
      ownerCharacterName: row.owner_character_name || '',
      ownerRole,
      ownerRoleLabel: ownerLabel,
      ownerLevel,
      deviceId: row.device_id || '',
      startedAt: row.started_at || '',
      lastSeenAt: row.last_seen_at || '',
      expiresAt: row.expires_at || '',
      count: Number(row.done_count || 0),
      total: Number(row.total_count || 0),
      message: running ? (row.message || '다른 확장프로그램이 조회 중입니다.') : ''
    };
  }

  function compareLockAuthority(status, profile){
    const current = profile || getCurrentProfile();
    const myLevel = Number(current.level || 0);
    const ownerLevel = Number(status && status.ownerLevel || 0);
    if (!status || !status.running) return { action:'allow' };
    if (myLevel > ownerLevel) return { action:'preempt', message:'상위 계정이 조회를 시작하여 작업을 정지합니다.' };
    if (myLevel === ownerLevel) return { action:'block', message:'동일 권한의 계정이 현재 조회 중입니다. 조회 종료 후 다시 시도해 주세요.' };
    return { action:'block', message:'상위 계정이 현재 조회 중입니다. 조회 종료 후 다시 시도해 주세요.' };
  }

  async function getLockStatus(){
    if (!isEnabled()) return { ok:false, running:false, disabled:true };
    try {
      const live = await rpc('kinojo_runtime_get_live_status', {}, { timeoutMs: 15000 });
      if (live && live.ok !== false) return normalizeLock(live);
    } catch (_runtimeErr) {
      // 038 not installed yet: fall back to legacy crawl_locks.
    }
    const rows = await table('crawl_locks').select('select=*&id=eq.' + encodeURIComponent(LOCK_ID) + '&limit=1');
    return normalizeLock(Array.isArray(rows) ? rows[0] : null);
  }

  async function claimLock(sessionId, totalCount){
    if (!isEnabled()) return { ok:false, disabled:true };
    const profile = getCurrentProfile();
    if (!canUseCrawler(profile)) {
      return { ok:false, locked:true, running:false, message:'조회 권한이 없는 계정입니다. Member 이상만 조회할 수 있습니다.' };
    }

    const existing = await getLockStatus();
    const ownDevice = existing.deviceId && existing.deviceId === getDeviceId();
    const ownSession = existing.sessionId && existing.sessionId === sessionId;
    let takeoverMessage = '';

    if (existing.running && !ownDevice && !ownSession) {
      const decision = compareLockAuthority(existing, profile);
      if (decision.action === 'block') {
        return Object.assign({}, existing, { ok:false, locked:true, message:decision.message });
      }
      takeoverMessage = decision.message;
    }

    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 1000 * 90).toISOString();
    const body = {
      id: LOCK_ID,
      running: true,
      session_id: sessionId,
      owner_character_name: profile.mainCharacterName || profile.main_character_name || 'unknown',
      owner_role: profile.role || 'GUEST',
      owner_level: Number(profile.level || 1),
      device_id: getDeviceId(),
      started_at: (existing.running && !ownDevice && !ownSession) ? nowIso : (existing.startedAt || nowIso),
      last_seen_at: nowIso,
      expires_at: expiresIso,
      done_count: 0,
      total_count: Number(totalCount || 0),
      message: takeoverMessage || 'running'
    };
    const rows = await table('crawl_locks').upsert(body, 'resolution=merge-duplicates,return=representation');
    return Object.assign(normalizeLock(Array.isArray(rows) ? rows[0] : body), { ok:true, preempted: !!takeoverMessage });
  }

  async function heartbeatLock(sessionId, doneCount, totalCount){
    if (!isEnabled() || !sessionId) return { ok:false, disabled:true };
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 1000 * 90).toISOString();
    const body = {
      last_seen_at: nowIso,
      expires_at: expiresIso,
      done_count: Number(doneCount || 0),
      total_count: Number(totalCount || 0)
    };
    const q = 'id=eq.' + encodeURIComponent(LOCK_ID) + '&session_id=eq.' + encodeURIComponent(sessionId);
    const rows = await table('crawl_locks').patch(q, body, 'return=representation');
    return Object.assign(normalizeLock(Array.isArray(rows) ? rows[0] : null), { ok:true });
  }

  async function releaseLock(sessionId){
    if (!isEnabled() || !sessionId) return { ok:false, disabled:true };
    const q = 'id=eq.' + encodeURIComponent(LOCK_ID) + '&session_id=eq.' + encodeURIComponent(sessionId);
    const rows = await table('crawl_locks').patch(q, {
      running:false,
      last_seen_at:new Date().toISOString(),
      expires_at:new Date().toISOString()
    }, 'return=representation');
    return Object.assign(normalizeLock(Array.isArray(rows) ? rows[0] : null), { ok:true, running:false });
  }


  function characterSortGroup(name){
    const text = String(name || '').trim();
    if (/^[가-힣]/.test(text)) return 0;
    if (/^[A-Za-z]/.test(text)) return 1;
    if (/^[0-9]/.test(text)) return 2;
    return 3;
  }

  const koreanCharacterCollator = new Intl.Collator('ko-KR', {
    numeric: true,
    sensitivity: 'base'
  });

  async function runtimeStartServerQueue(passCode, payload){
    return normalizeRuntimeResult(await rpc('kinojo_runtime_start', {
      p_pass_code: String(passCode || '').trim(),
      p_tool_name: 'KINOJO_SERVER_CHARACTER_QUEUE',
      p_client_id: 'KINOJO_EXTENSION_SERVER_QUEUE_' + getDeviceId(),
      p_progress_total: 0,
      p_payload: Object.assign({
        schemaVersion:'kinojo-crawl-v2',
        tool:'KINOJO_SERVER_CHARACTER_QUEUE',
        requestedSurface:'KINOJO_EXTENSION',
        serverQueue:true,
        browserIndependentQueue:true,
        storesOfficialRaw:true
      }, payload || {})
    }, { timeoutMs: 20000 }));
  }

  async function serverQueueRegister(passCode, sessionId, sessionToken, queueMeta){
    return normalizeRuntimeResult(await rpc('kinojo_admin_server_queue_register_v276', {
      p_pass_key:String(passCode || '').trim(),
      p_session_id:String(sessionId || ''),
      p_session_token:String(sessionToken || ''),
      p_queue_meta:queueMeta && typeof queueMeta === 'object' ? queueMeta : {}
    }, { timeoutMs:30000 }));
  }

  async function serverQueueStartAutonomous(sessionId, sessionToken){
    return normalizeRuntimeResult(await edgeFunction('character-refresh-worker', {
      action:'startAutonomous',
      sessionId:String(sessionId || ''),
      sessionToken:String(sessionToken || ''),
      clientVersion:window.AION2_CONFIG && window.AION2_CONFIG.EXT_VERSION || ''
    }, { timeoutMs:45000 }));
  }

  async function serverQueueStatus(passCode, sessionId){
    return normalizeRuntimeResult(await rpc('kinojo_admin_server_queue_status_v289', {
      p_pass_key:String(passCode || '').trim(),
      p_session_id:String(sessionId || '') || null
    }, { timeoutMs:20000 }));
  }

  async function prepareLookupQueueFromServerBridge(sessionId, sessionToken, payload){
    return normalizeRuntimeResult(await edgeFunction('lookup-sheet-bridge', {
      action: 'prepareList',
      sessionId,
      sessionToken,
      clientVersion: window.AION2_CONFIG && window.AION2_CONFIG.EXT_VERSION || '',
      payload: payload || {}
    }, { timeoutMs: 240000 }));
  }

  async function lookupGetSessionProgress(sessionId){
    return normalizeRuntimeResult(await rpc('kinojo_lookup_get_session_progress', {
      p_session_id: sessionId
    }, { timeoutMs: 20000 }));
  }

  async function lookupProgressSummary(sessionId){
    return normalizeRuntimeResult(await rpc('kinojo_lookup_progress_summary', {
      p_session_id: sessionId
    }, { timeoutMs: 12000 }));
  }


  async function lookupDebugSnapshot(sessionId, sessionToken){
    return normalizeRuntimeResult(await rpc('kinojo_lookup_debug_snapshot', {
      p_session_id: sessionId,
      p_session_token: sessionToken || null
    }, { timeoutMs: 20000 }));
  }


  async function lookupSessionDetailReport(sessionId, sessionToken){
    return normalizeRuntimeResult(await rpc('kinojo_lookup_session_detail_report', {
      p_session_id: sessionId,
      p_session_token: sessionToken
    }, { timeoutMs: 30000 }));
  }

  async function runtimeProgress(sessionId, sessionToken, stage, currentCharacter, message, current, total, payload){
    return normalizeRuntimeResult(await rpc('kinojo_runtime_progress', {
      p_session_id: sessionId,
      p_session_token: sessionToken,
      p_stage: stage || null,
      p_current_character: currentCharacter || null,
      p_message: message || null,
      p_progress_current: Number.isFinite(Number(current)) ? Number(current) : null,
      p_progress_total: Number.isFinite(Number(total)) ? Number(total) : null,
      p_payload: payload || {}
    }, { timeoutMs: 20000 }));
  }

  async function runtimeFinish(sessionId, sessionToken, status, message, summary){
    return normalizeRuntimeResult(await rpc('kinojo_runtime_finish', {
      p_session_id: sessionId,
      p_session_token: sessionToken,
      p_status: status || 'completed',
      p_message: message || null,
      p_summary: summary || {}
    }, { timeoutMs: 60000 }));
  }

  async function getRunReports(passCode, limit){
    return normalizeRuntimeResult(await rpc('kinojo_updater_get_run_reports', {
      p_pass_code: String(passCode || '').trim(),
      p_limit: Math.max(1, Math.min(100, Number(limit || 30)))
    }, { timeoutMs: 60000 }));
  }

  async function getRunReportDetail(passCode, sessionId){
    return normalizeRuntimeResult(await rpc('kinojo_updater_get_run_report_detail', {
      p_pass_code: String(passCode || '').trim(),
      p_session_id: String(sessionId || '').trim()
    }, { timeoutMs: 60000 }));
  }


  async function releaseMyRuntimeLock(passCode, reason){
    return normalizeRuntimeResult(await rpc('kinojo_runtime_release_my_lock', {
      p_pass_code: String(passCode || '').trim(),
      p_client_id: getDeviceId(),
      p_reason: reason || 'client_self_release'
    }, { timeoutMs: 20000 }));
  }

  async function logErrorReport(payload){
    return normalizeRuntimeResult(await rpc('kinojo_log_error_report', {
      p_page_url: payload && payload.pageUrl || location.href,
      p_feature: payload && payload.feature || 'KINOJO_EXTENSION',
      p_action: payload && payload.action || 'client_error',
      p_message: payload && payload.message || '',
      p_raw: payload && payload.raw || null,
      p_payload: payload || {}
    }, { timeoutMs: 15000 }));
  }

  window.KINOJO_SUPABASE = {
    version:'1.3.1.47-server-worker-progress-ui-recovery-289',
    isEnabled,
    isPreferred,
    getConfig,
    table,
    rpc,
    request,
    edgeFunction,
    runtimeStartServerQueue,
    serverQueueRegister,
    serverQueueStartAutonomous,
    serverQueueStatus,
    prepareLookupQueueFromServerBridge,
    lookupGetSessionProgress,
    lookupProgressSummary,
    lookupDebugSnapshot,
    lookupSessionDetailReport,
    runtimeProgress,
    runtimeFinish,
    getRunReports,
    getRunReportDetail,
    releaseMyRuntimeLock,
    logErrorReport,
    verifyPassKey,
    normalizePassKey,
    readMemberProfile,
    saveMemberProfile,
    getDeviceId,
    normalizeRole,
    roleFromLevel,
    roleToLevel,
    getRoleLabel,
    getCurrentProfile,
    compareLockAuthority,
    canUseCrawler,
    getLockStatus,
    claimLock,
    heartbeatLock,
    releaseLock,
    normalizeError
  };
})();
