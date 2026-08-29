/*
 * KINOJO Supabase Client Core
 * 책임: config 로드, REST/Edge 연결, 공통 정규화와 HTTP 오류 처리.
 * 페이지별 기능과 RPC 계약은 이 파일에 두지 않습니다.
 */
(function(){
  'use strict';
  const DEFAULT_CONFIG = {
    enabled:false,
    url:'',
    publishableKey:'',
    fallbackToAppsScript:false
  };
  let remoteConfigLoaded = false;
  let remoteConfig = null;
  let remoteConfigPromise = null;
  let remoteConfigError = null;

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
    const raw=String(value||'').trim();
    if(/^kws_[A-Za-z0-9_-]{40,80}$/.test(raw)) return raw;
    return Array.from(raw.replace(/[a-z]/g, ch => ch.toUpperCase()).replace(/\s+/g, '')).join('');
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
    cfg.fallbackToAppsScript = cfg.fallbackToAppsScript === true;
    return cfg;
  }

  function isPreferred(){
    const runtime = window.KINOJO_SUPABASE_CONFIG || {};
    const fromRemote = remoteConfig && remoteConfig.supabase || {};
    const raw = Object.assign({}, DEFAULT_CONFIG, fromRemote, runtime);
    return raw.enabled === true || String(raw.enabled).toLowerCase() === 'true';
  }

  function isConfigured(){
    // 동기 상태 확인용이다. 기능 실행 전 판정에는 ensureConfig()/ensureReady()를 사용한다.
    // config.json 로드가 아직 진행 중이면 즉시 실패 처리하지 않도록 로드를 시작만 해 둔다.
    if(!remoteConfigLoaded && !remoteConfigPromise) loadRemoteConfig().catch(()=>{});
    return getConfig().enabled;
  }

  async function isConfiguredAsync(){
    try{
      await ensureConfig();
      return true;
    }catch(_err){
      return false;
    }
  }

  async function ensureReady(){
    return ensureConfig();
  }

  async function loadRemoteConfig(force){
    if(remoteConfigLoaded && !force) return remoteConfig;
    if(remoteConfigPromise && !force) return remoteConfigPromise;

    remoteConfigPromise = (async function(){
      try{
        remoteConfigError = null;
        const res = await fetch(new URL('/config.json', location.origin).toString(), { cache:'no-cache' });
        if(!res.ok) throw new Error('config.json HTTP ' + res.status);
        remoteConfig = await res.json();
        remoteConfigLoaded = true;
        return remoteConfig;
      }catch(err){
        remoteConfig = null;
        remoteConfigLoaded = false;
        remoteConfigError = err;
        throw err;
      }finally{
        remoteConfigPromise = null;
      }
    })();

    return remoteConfigPromise;
  }

  async function ensureConfig(){
    await loadRemoteConfig();
    const cfg = getConfig();
    if(!remoteConfig && !(window.KINOJO_SUPABASE_CONFIG && Object.keys(window.KINOJO_SUPABASE_CONFIG).length)){
      const reason = remoteConfigError && remoteConfigError.message ? ' (' + remoteConfigError.message + ')' : '';
      const err = new Error('Supabase config.json을 읽지 못했습니다. 네트워크 또는 배포 경로를 확인해 주세요.' + reason);
      err.kinojoSupabaseConfigError = true;
      throw err;
    }
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
      'content-type': 'application/json'
    };
  }

  function buildUrl(cfg, path, query){
    // query가 문자열이면 이미 필요한 인코딩이 적용된 REST 쿼리로 간주한다.
    // URLSearchParams로 다시 감싸면 한글 PASS KEY가 이중 인코딩되어 조회 결과가 []가 된다.
    const queryString = typeof query === 'string'
      ? query.replace(/^\?/, '')
      : new URLSearchParams(query || {}).toString();
    return cfg.url + '/rest/v1/' + path.replace(/^\//, '') + (queryString ? '?' + queryString : '');
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

  const EDGE_FUNCTION_ROUTE_ALIASES=Object.freeze({
    prepareList:'lookup-list-prepare',
    syncList:'lookup-list-sync',
    adminBridgePing:'lookup-sheet-bridge'
  });

  function resolveEdgeFunctionName(functionName, body){
    const requested=String(functionName||'').replace(/^\//,'');
    if(requested!=='lookup-sheet-bridge')return requested;
    const action=String(body&&body.action||'').trim();
    return EDGE_FUNCTION_ROUTE_ALIASES[action]||requested;
  }

  async function invokeEdgeFunction(functionName, body){
    const cfg=await ensureConfig();
    const resolvedName=resolveEdgeFunctionName(functionName,body);
    const res=await fetch(cfg.url+'/functions/v1/'+resolvedName,{
      method:'POST',
      headers:headers(cfg),
      body:JSON.stringify(body||{}),
      cache:'no-store'
    });
    const text=await res.text();
    let data=null;
    if(text){try{data=JSON.parse(text);}catch(_err){data={ok:false,message:text};}}
    if(!res.ok||data?.ok===false){
      const error=new Error(data?.message||data?.error||text||('Edge Function HTTP '+res.status));
      error.status=res.status;
      error.code=data?.code||'';
      error.data=data;
      throw error;
    }
    return data||{ok:true};
  }
  window.KinojoSupabaseClientCore=Object.freeze({
    normalizePassKey,
    normalizeRole,
    roleFromLevel,
    roleToLevel,
    getRoleLabel,
    getConfig,
    isPreferred,
    isConfigured,
    isConfiguredAsync,
    ensureReady,
    loadRemoteConfig,
    ensureConfig,
    headers,
    buildUrl,
    request,
    resolveEdgeFunctionName,
    invokeEdgeFunction
  });
})();
