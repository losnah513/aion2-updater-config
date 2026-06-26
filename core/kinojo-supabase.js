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
    publishableKey:'PASTE_SUPABASE_PUBLISHABLE_KEY_HERE',
    fallbackToAppsScript:true
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
    cfg.url = String(cfg.url || '').trim()
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/$/, '');
    cfg.publishableKey = String(cfg.publishableKey || cfg.anonKey || '').trim();
    cfg.rawEnabled = cfg.enabled === true || String(cfg.enabled).toLowerCase() === 'true';
    cfg.hasPlaceholderKey = !cfg.publishableKey || /PASTE_|YOUR_|여기에/i.test(cfg.publishableKey);
    cfg.enabled = !!(cfg.rawEnabled && cfg.url && cfg.publishableKey && !cfg.hasPlaceholderKey);
    cfg.fallbackToAppsScript = cfg.fallbackToAppsScript !== false;
    return cfg;
  }

  function isPreferred(){
    const runtime = window.KINOJO_SUPABASE_CONFIG || {};
    const fromRemote = remoteConfig && remoteConfig.supabase || {};
    const raw = Object.assign({}, DEFAULT_CONFIG, fromRemote, runtime);
    return raw.enabled === true || String(raw.enabled).toLowerCase() === 'true';
  }

  function isConfigured(){
    return getConfig().enabled;
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
    if(!cfg.rawEnabled){
      const err = new Error('Supabase 설정이 꺼져 있습니다. config.json의 supabase.enabled를 true로 설정하세요.');
      err.kinojoSupabaseConfigError = true;
      throw err;
    }
    if(cfg.hasPlaceholderKey){
      const err = new Error('Supabase publishableKey가 아직 입력되지 않았습니다. sb_publishable_로 시작하는 전체 키를 config.json에 넣어주세요.');
      err.kinojoSupabaseConfigError = true;
      throw err;
    }
    if(!cfg.url){
      const err = new Error('Supabase URL이 비어 있습니다. https://프로젝트.supabase.co 형식으로 입력하세요.');
      err.kinojoSupabaseConfigError = true;
      throw err;
    }
    return cfg;
  }

  function headers(cfg){
    return {
      apikey: cfg.publishableKey,
      Authorization: 'Bearer ' + cfg.publishableKey,
      authorization: 'Bearer ' + cfg.publishableKey,
      'content-type': 'application/json'
    };
  }

  function buildUrl(cfg, path, query){
    const params = new URLSearchParams(query || '');
    if(!params.has('apikey')) params.set('apikey', cfg.publishableKey);
    return cfg.url + '/rest/v1/' + path.replace(/^\//, '') + '?' + params.toString();
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
    version:'1.3.1.13-web-passkey-apikey-fix',
    getConfig,
    isPreferred,
    isConfigured,
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
