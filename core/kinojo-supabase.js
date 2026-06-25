/*
 * KINOJO Supabase Web Bridge
 * Role: GitHub Pages에서 Supabase REST API를 공통으로 사용하기 위한 연결 파일.
 * 주의: publishable key만 사용. service_role/secret key/DB password 금지.
 */
(function(){
  'use strict';

  const DEFAULT_CONFIG = {
    enabled:false,
    url:'https://josvoltpktvwysrasffq.supabase.co',
    publishableKey:'PASTE_SUPABASE_PUBLISHABLE_KEY_HERE'
  };
  let remoteConfigLoaded = false;
  let remoteConfig = null;

  const ROLE_LEVELS = {
    GUEST:0,
    MEMBER:1,
    STAFF:2,
    MANAGER:3,
    SUB_MASTER:4,
    'SUB MASTER':4,
    MASTER:5
  };

  const ROLE_LABELS = {
    GUEST:'Guest',
    MEMBER:'Member',
    STAFF:'Staff',
    MANAGER:'Manager',
    SUB_MASTER:'Sub Master',
    'SUB MASTER':'Sub Master',
    MASTER:'Master'
  };

  function normalizePassKey(value){
    return Array.from(String(value || '').replace(/[a-z]/g, ch => ch.toUpperCase()).replace(/\s+/g, '')).join('');
  }

  function normalizeRole(value, fallbackLevel){
    const rawValue = value === undefined || value === null || value === '' ? '' : String(value);
    const numeric = Number(rawValue || fallbackLevel);
    if (!rawValue && Number.isFinite(numeric)) return roleFromLevel(numeric);
    if (/^\d+$/.test(rawValue.trim())) return roleFromLevel(Number(rawValue));
    const raw = rawValue.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if(raw === 'MASTER') return 'MASTER';
    if(raw === 'SUB_MASTER' || raw === 'SUBMASTER') return 'SUB_MASTER';
    if(raw === 'MANAGER' || raw === 'ADMIN') return 'MANAGER';
    if(raw === 'STAFF') return 'STAFF';
    if(raw === 'MEMBER' || raw === 'TESTER') return 'MEMBER';
    if(raw === 'GUEST') return 'GUEST';
    return Number.isFinite(Number(fallbackLevel)) ? roleFromLevel(Number(fallbackLevel)) : 'GUEST';
  }

  function roleFromLevel(level){
    const n = Number(level || 0);
    if(n >= 5) return 'MASTER';
    if(n >= 4) return 'SUB_MASTER';
    if(n >= 3) return 'MANAGER';
    if(n >= 2) return 'STAFF';
    if(n >= 1) return 'MEMBER';
    return 'GUEST';
  }

  function roleToLevel(role, fallback){
    const key = normalizeRole(role, fallback);
    return Object.prototype.hasOwnProperty.call(ROLE_LEVELS, key) ? ROLE_LEVELS[key] : Number(fallback || 0);
  }

  function getRoleLabel(role, fallbackLevel){
    const key = normalizeRole(role, fallbackLevel);
    return ROLE_LABELS[key] || 'Guest';
  }

  function getConfig(){
    const runtime = window.KINOJO_SUPABASE_CONFIG || {};
    const fromRemote = remoteConfig && remoteConfig.supabase || {};
    const cfg = Object.assign({}, DEFAULT_CONFIG, fromRemote, runtime);
    cfg.url = String(cfg.url || '').replace(/\/$/, '');
    cfg.publishableKey = String(cfg.publishableKey || cfg.anonKey || '').trim();
    cfg.enabled = !!(cfg.enabled && cfg.url && cfg.publishableKey && !/PASTE_|YOUR_/i.test(cfg.publishableKey));
    return cfg;
  }

  async function loadRemoteConfig(){
    if(remoteConfigLoaded) return remoteConfig;
    remoteConfigLoaded = true;
    try{
      const res = await fetch(new URL('/config.json', location.origin).toString() + '?t=' + Date.now(), { cache:'no-store' });
      if(res.ok) remoteConfig = await res.json();
    }catch(_err){ remoteConfig = null; }
    return remoteConfig;
  }

  async function ensureConfig(){
    await loadRemoteConfig();
    const cfg = getConfig();
    if(!cfg.enabled) throw new Error('Supabase 설정이 비활성화되어 있습니다. config.json의 supabase.enabled와 publishableKey를 확인하세요.');
    return cfg;
  }

  function headers(cfg){
    return {
      apikey: cfg.publishableKey,
      authorization: 'Bearer ' + cfg.publishableKey,
      'content-type': 'application/json'
    };
  }

  function buildUrl(cfg, path, query){
    const qs = query ? (query.startsWith('?') ? query : '?' + query) : '';
    return cfg.url + '/rest/v1/' + path.replace(/^\//, '') + qs;
  }

  async function request(path, options){
    const cfg = await ensureConfig();
    const res = await fetch(buildUrl(cfg, path, options && options.query), {
      method: options && options.method || 'GET',
      headers: Object.assign(headers(cfg), options && options.headers || {}),
      body: options && options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_e) { data = text; }
    }
    if (!res.ok) throw new Error(data && (data.message || data.details || data.hint) || text || ('HTTP ' + res.status));
    return data;
  }

  async function getLatestAnnouncements(limit){
    const q = 'select=*&is_active=eq.true&order=priority.desc,created_at.desc&limit=' + encodeURIComponent(limit || 5);
    return request('announcements', { query:q });
  }

  async function getLockStatus(){
    const rows = await request('crawl_locks', { query:'select=*&id=eq.global&limit=1' });
    return Array.isArray(rows) ? rows[0] : null;
  }

  async function verifyPassKey(passKey){
    const code = normalizePassKey(passKey);
    if(!code) throw new Error('PASS KEY를 입력해 주세요.');
    const query = [
      'select=id,main_character_name,pass_code,level,role,role_label,can_like,can_suggest,can_manage,is_active',
      'pass_code=eq.' + encodeURIComponent(code),
      'is_active=eq.true',
      'limit=1'
    ].join('&');
    const rows = await request('member_codes', { query });
    const row = Array.isArray(rows) ? rows[0] : null;
    if(!row) throw new Error('PASS KEY가 없거나 비활성화된 계정입니다.');
    const level = Number(row.level || 0);
    const role = normalizeRole(row.role, level);
    const roleLevel = level || roleToLevel(role, 0);
    if(roleLevel < 1) throw new Error('조회 권한이 없는 계정입니다. Member 이상만 사용할 수 있습니다.');
    const profile = {
      id: row.id,
      mainCharacter: row.main_character_name || '',
      mainCharacterName: row.main_character_name || '',
      role,
      roleLabel: row.role_label || getRoleLabel(role, roleLevel),
      level: roleLevel,
      canLike: row.can_like !== false,
      canSuggest: row.can_suggest !== false,
      canManage: row.can_manage === true || roleLevel >= 3,
      source: 'supabase',
      verifiedAt: Date.now()
    };
    return {
      ok:true,
      session:{
        token:'supabase:' + row.id + ':' + Date.now(),
        mainCharacter: profile.mainCharacter,
        role: profile.role,
        roleLabel: profile.roleLabel,
        level: profile.level,
        source:'supabase',
        expiresAt: Date.now() + 5 * 60 * 1000
      },
      account: profile,
      profile
    };
  }

  window.KinojoSupabase = {
    version:'1.3.1.27-web-ext-passkey-bridge',
    getConfig,
    loadRemoteConfig,
    normalizePassKey,
    normalizeRole,
    roleFromLevel,
    roleToLevel,
    getRoleLabel,
    request,
    verifyPassKey,
    getLatestAnnouncements,
    getLockStatus
  };
})();
