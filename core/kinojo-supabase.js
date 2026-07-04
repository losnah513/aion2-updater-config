/*
 * KINOJO Supabase Web Bridge
 * Role: GitHub Pages에서 Supabase REST API를 공통으로 사용하기 위한 연결 파일.
 * 주의: publishable key만 사용. service_role/secret key/DB password 금지.
 */
(function(){
  'use strict';

  // config.json을 읽기 전에는 임의 placeholder를 사용하지 않는다.
  // Supabase 기능은 ensureConfig()/ensureReady()를 통해 원격 설정 로딩 후에만 실행한다.
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
        const res = await fetch(new URL('/config.json', location.origin).toString() + '?t=' + Date.now(), { cache:'no-store' });
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


  const ADMIN_ROLES = ['MASTER','SUB_MASTER','MANAGER'];
  const PERMISSION_KEYS = ['sanctuary_edit','visit_manage','snapshot_manage','account_manage'];

  const AION2_SERVER_MASTER = [
    { raceId:1, serverId:'1001', serverName:'시엘', shortName:'시엘' }, { raceId:1, serverId:'1002', serverName:'네자칸', shortName:'네자' },
    { raceId:1, serverId:'1003', serverName:'바이젤', shortName:'바이' }, { raceId:1, serverId:'1004', serverName:'카이시넬', shortName:'카이' },
    { raceId:1, serverId:'1005', serverName:'유스티엘', shortName:'유스' }, { raceId:1, serverId:'1006', serverName:'아리엘', shortName:'아리' },
    { raceId:1, serverId:'1007', serverName:'프레기온', shortName:'프레' }, { raceId:1, serverId:'1008', serverName:'메스람타에다', shortName:'메스' },
    { raceId:1, serverId:'1009', serverName:'히타니에', shortName:'히타' }, { raceId:1, serverId:'1010', serverName:'나니아', shortName:'나니' },
    { raceId:1, serverId:'1011', serverName:'타하바타', shortName:'타하' }, { raceId:1, serverId:'1012', serverName:'루터스', shortName:'루터' },
    { raceId:1, serverId:'1013', serverName:'페르노스', shortName:'페르' }, { raceId:1, serverId:'1014', serverName:'다미누', shortName:'다미' },
    { raceId:1, serverId:'1015', serverName:'카사카', shortName:'카사' }, { raceId:1, serverId:'1016', serverName:'바카르마', shortName:'바카' },
    { raceId:1, serverId:'1017', serverName:'챈가룽', shortName:'챈가' }, { raceId:1, serverId:'1018', serverName:'코치룽', shortName:'코치' },
    { raceId:1, serverId:'1019', serverName:'이슈타르', shortName:'이슈' }, { raceId:1, serverId:'1020', serverName:'티아마트', shortName:'티아' },
    { raceId:1, serverId:'1021', serverName:'포에타', shortName:'포에' },
    { raceId:2, serverId:'2001', serverName:'이스라펠', shortName:'이스' }, { raceId:2, serverId:'2002', serverName:'지켈', shortName:'지켈' },
    { raceId:2, serverId:'2003', serverName:'트리니엘', shortName:'트리' }, { raceId:2, serverId:'2004', serverName:'루미엘', shortName:'루미' },
    { raceId:2, serverId:'2005', serverName:'마르쿠탄', shortName:'마르' }, { raceId:2, serverId:'2006', serverName:'아스펠', shortName:'아스' },
    { raceId:2, serverId:'2007', serverName:'에레슈키갈', shortName:'에레' }, { raceId:2, serverId:'2008', serverName:'브리트라', shortName:'브리' },
    { raceId:2, serverId:'2009', serverName:'네몬', shortName:'네몬' }, { raceId:2, serverId:'2010', serverName:'하달', shortName:'하달' },
    { raceId:2, serverId:'2011', serverName:'루드라', shortName:'루드' }, { raceId:2, serverId:'2012', serverName:'울고른', shortName:'울고' },
    { raceId:2, serverId:'2013', serverName:'무닌', shortName:'무닌' }, { raceId:2, serverId:'2014', serverName:'오다르', shortName:'오다' },
    { raceId:2, serverId:'2015', serverName:'젠카카', shortName:'젠카' }, { raceId:2, serverId:'2016', serverName:'크로메데', shortName:'크로' },
    { raceId:2, serverId:'2017', serverName:'콰이링', shortName:'콰이' }, { raceId:2, serverId:'2018', serverName:'바바룽', shortName:'바바' },
    { raceId:2, serverId:'2019', serverName:'파프니르', shortName:'파프' }, { raceId:2, serverId:'2020', serverName:'인드나흐', shortName:'인드' },
    { raceId:2, serverId:'2021', serverName:'이스할겐', shortName:'이스' }
  ];

  function stripServerSuffixFromCharacterName(value){
    return String(value || '').trim().replace(/\[[^\]]+\]\s*$/, '').trim();
  }
  function getServerSuffixFromCharacterName(value){
    const match = String(value || '').trim().match(/\[([^\]]+)\]\s*$/);
    return match ? String(match[1] || '').trim() : '';
  }
  function getServerIdFromShortName(value){
    const key = String(value || '').trim();
    if(!key) return '';
    if(key === '이스') return '2001';
    const hit = AION2_SERVER_MASTER.find(s => s.serverName === key || s.shortName === key);
    return hit ? hit.serverId : '';
  }
  function getServerNameByServerId(value){
    const id = String(value || '').trim();
    const hit = AION2_SERVER_MASTER.find(s => s.serverId === id);
    return hit ? hit.serverName : '';
  }
  function parseCharacterLookupInput(value, fallbackServerId='2002'){
    const raw = String(value || '').trim();
    const characterName = stripServerSuffixFromCharacterName(raw);
    const suffix = getServerSuffixFromCharacterName(raw);
    const serverId = getServerIdFromShortName(suffix) || String(fallbackServerId || '2002');
    return { raw, characterName, serverSuffix:suffix, serverId, serverName:getServerNameByServerId(serverId) };
  }

  function normalizeMemberCode(value){
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  function isValidMemberCode(value){
    const code = normalizeMemberCode(value);
    if(!/^[A-Z0-9]{6}$/.test(code)) return false;
    const letters = (code.match(/[A-Z]/g) || []).length;
    const numbers = (code.match(/[0-9]/g) || []).length;
    return letters === 2 && numbers === 4;
  }

  function normalizePermissions(value){
    if(value === 'all') return ['all'];
    const source = Array.isArray(value) ? value : String(value || '').split(',');
    return source.map(item => String(item || '').trim())
      .filter((item, index, arr) => item && (PERMISSION_KEYS.includes(item) || item === 'all') && arr.indexOf(item) === index);
  }

  function permissionsToText(value){
    const arr = normalizePermissions(value);
    return arr.includes('all') ? 'all' : arr.join(',');
  }

  function roleLabelFor(role, level){
    return getRoleLabel(normalizeRole(role, level), level);
  }

  function levelForRole(role){
    return roleToLevel(role, 0);
  }

  function readLocalJson(key){
    try{ return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch(_err){ return null; }
  }

  function currentAccount(){
    const auth = window.KinojoAuth || {};
    const storedAccount = readLocalJson('kinojo_login_account_v1');
    const storedSession = readLocalJson('kinojo_login_session_v1');
    const authAccount = typeof auth.getAccount === 'function' ? auth.getAccount() : null;
    const authSession = typeof auth.getSession === 'function' ? auth.getSession() : null;
    // 관리자 권한 판정은 Auth 함수 반환값이 비었거나 세션 만료 판정을 받아도
    // Supabase 로그인 시 저장된 account/session을 함께 병합해 동일 기준으로 처리한다.
    // 기능별로 getSession만 보거나 getAccount만 봐서 관리자 권한이 흔들리는 문제를 방지한다.
    return Object.assign({}, storedSession || {}, storedAccount || {}, authSession || {}, authAccount || {});
  }


  function currentPassKey(){
    const account = currentAccount();
    const raw = account && (account.passCode || account.pass_code || account.passKey || account.pass_key || account.code);
    const normalized = normalizePassKey(raw || '');
    if(!normalized){
      const err = new Error('관리자 PASS KEY 확인이 필요합니다. 다시 로그인 후 시도해 주세요.');
      err.kinojoAdminAuthError = true;
      throw err;
    }
    return normalized;
  }

  function normalizeCodeRequestRow(row){
    if(!row) return null;
    return {
      id: row.id,
      requestId: row.request_id || row.requestId || '',
      time: row.created_at || row.createdAt || row.requestedAt || '',
      requestedAt: row.created_at || row.createdAt || row.requestedAt || '',
      characterName: row.character_name || row.characterName || '',
      requestedCode: normalizeMemberCode(row.requested_code || row.requestedCode || ''),
      status: row.status || '',
      className: row.class_name || row.className || '',
      memo: row.memo || '',
      processedAt: row.processed_at || row.processedAt || '',
      processedBy: row.processed_by || row.processedBy || '',
      raw: row
    };
  }

  function assertAdmin(){
    const account = currentAccount();
    const role = normalizeRole(account && account.role, account && account.level);
    const level = Number(account && account.level || roleToLevel(role, 0));
    const permissions = normalizePermissions(account && account.permissions);
    const canManage = !!(account && (
      account.canManage === true ||
      account.can_manage === true ||
      level >= 3 ||
      ADMIN_ROLES.includes(role) ||
      permissions.includes('account_manage') ||
      permissions.includes('all')
    ));
    if(!account || !canManage){
      const err = new Error('관리자 로그인이 필요합니다.');
      err.kinojoAdminAuthError = true;
      throw err;
    }
    return { account, role, level };
  }

  function makeRequestId(){
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
    return 'KRQ-' + stamp + '-' + rand;
  }

  function roleRowPatch(role){
    const normalized = normalizeRole(role, 1);
    const level = levelForRole(normalized);
    return { role: normalized === 'SUB_MASTER' ? 'SUB MASTER' : normalized, level, role_label: roleLabelFor(normalized, level) };
  }

  function accountFromRow(row){
    if(!row) return null;
    const role = normalizeRole(row.role, row.level);
    const level = Number(row.level || roleToLevel(role, 0));
    const perms = row.permissions !== undefined && row.permissions !== null
      ? normalizePermissions(row.permissions)
      : (row.can_manage ? ['account_manage'] : []);
    return {
      id: row.id,
      code: role === 'MASTER' ? '' : String(row.pass_code || ''),
      mainCharacter: row.main_character_name || '',
      mainCharacterName: row.main_character_name || '',
      level,
      role,
      roleLabel: row.role_label || roleLabelFor(role, level),
      permissions: permissionsToText(perms),
      active: row.is_active !== false,
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
      memo: row.memo || ''
    };
  }

  async function findMemberByCode(code){
    const normalized = normalizeMemberCode(code);
    if(!normalized) return null;
    const rows = await request('member_codes', {
      query: 'select=*&pass_code=eq.' + encodeURIComponent(normalized) + '&limit=1'
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function findMemberByMainCharacter(name){
    const target = String(name || '').trim();
    if(!target) return null;
    const rows = await request('member_codes', {
      query: 'select=*&main_character_name=eq.' + encodeURIComponent(target) + '&is_active=eq.true&limit=1'
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function lookupMainCharacter(name){
    const parsed = parseCharacterLookupInput(name);
    const target = parsed.characterName;
    if(!target) return { ok:false, message:'캐릭터 이름을 입력해 주세요.' };

    // Server Engine 이관 기준: Apps Script의 [서버약칭] 파싱을 웹에서도 동일하게 적용한다.
    // 예) 찐찐[울고] -> character_name=찐찐, server_id=2012. DB에는 서버 태그를 저장하지 않는다.
    try{
      const filters = [
        'select=server_id,server_name,character_name,main_character_name,is_main,class_name',
        'or=(character_name.eq.' + encodeURIComponent(target) + ',main_character_name.eq.' + encodeURIComponent(target) + ')'
      ];
      if(parsed.serverSuffix) filters.push('server_id=eq.' + encodeURIComponent(parsed.serverId));
      filters.push('limit=20');
      const rows = await request('character_master', { query:filters.join('&') });
      const list = Array.isArray(rows) ? rows : [];
      const exact = list.find(row => String(row.character_name || '').trim() === target && (!parsed.serverSuffix || String(row.server_id || '') === parsed.serverId))
        || list.find(row => String(row.character_name || '').trim() === target)
        || list[0];
      if(exact){
        const main = stripServerSuffixFromCharacterName(exact.main_character_name || exact.character_name || target);
        const rowName = stripServerSuffixFromCharacterName(exact.character_name || target);
        const isMain = exact.is_main === true || String(exact.is_main).toUpperCase() === 'TRUE' || main === rowName;
        const serverId = String(exact.server_id || parsed.serverId || '');
        const serverName = exact.server_name || parsed.serverName || getServerNameByServerId(serverId);
        if(!isMain) return { ok:false, message:'메인 캐릭터만 코드 발급이 가능합니다.', character:{ characterName:rowName, mainCharacter:main, className:exact.class_name || '', serverId, serverName } };
        return { ok:true, character:{ characterName:rowName || main, mainCharacter:main, className:exact.class_name || '', role:'MEMBER', serverId, serverName } };
      }
    }catch(_err){
      // CHARACTER_MASTER 서버 이관 전에는 회원관리 이관을 막지 않는다.
    }

    return { ok:true, character:{ characterName:target, mainCharacter:target, className:'클래스 미확인', role:'MEMBER', serverId:parsed.serverId, serverName:parsed.serverName }, pendingCharacterMaster:true };
  }

  async function publicCodeRequest(command, extra={}){
    const normalizedCommand = String(command || '').trim();
    if(normalizedCommand === 'lookupCharacter'){
      const result = await lookupMainCharacter(extra.characterName || extra.mainCharacter || extra.name);
      if(!result.ok) return result;
      const existing = await findMemberByMainCharacter(result.character.mainCharacter);
      if(existing) return { ok:false, message:'이미 활성화된 코드가 있습니다. 기존 코드로 로그인해 주세요.', character:result.character };
      return { ok:true, message:'조회 완료. 요청할 회원 코드를 입력해 주세요.', character:result.character, pendingCharacterMaster:result.pendingCharacterMaster === true };
    }

    if(normalizedCommand === 'submitRequest'){
      const lookup = await lookupMainCharacter(extra.characterName || extra.mainCharacter || extra.name);
      if(!lookup.ok) return lookup;
      const requestedCode = normalizeMemberCode(extra.requestedCode || extra.code);
      if(!isValidMemberCode(requestedCode)) return { ok:false, message:'요청 코드는 총 6자리이며 알파벳 2개와 숫자 4개로 구성해야 합니다. 순서는 자유입니다.' };
      if(await findMemberByCode(requestedCode)) return { ok:false, message:'이미 사용 중인 코드입니다. 다른 코드로 요청해 주세요.' };
      if(await findMemberByMainCharacter(lookup.character.mainCharacter)) return { ok:false, message:'이미 활성화된 회원 코드가 있습니다.' };

      const data = await rpc('kinojo_code_request_submit', {
        p_character_name: lookup.character.mainCharacter,
        p_requested_code: requestedCode,
        p_class_name: lookup.character.className || '',
        p_version: String(extra.version || ''),
        p_url: String(extra.url || location.href || ''),
        p_memo: String(extra.memo || '')
      });
      const row = normalizeCodeRequestRow(data && (data.request || data.row || data));
      return { ok:true, message:'회원 코드 요청이 접수되었습니다.', request:row };
    }

    return { ok:false, message:'알 수 없는 코드 요청 명령입니다.' };
  }

  async function adminAccount(command, extra={}){
    const admin = assertAdmin();
    const normalizedCommand = String(command || '').trim();

    if(normalizedCommand === 'lookupCharacter'){
      const lookup = await lookupMainCharacter(extra.characterName || extra.mainCharacter || extra.name);
      if(!lookup.ok) return lookup;
      const existing = await findMemberByMainCharacter(lookup.character.mainCharacter);
      if(existing) return { ok:false, message:'이미 활성화된 코드가 있습니다.', character:lookup.character, existingAccount:accountFromRow(existing) };
      return { ok:true, message:'코드 생성 가능한 캐릭터입니다.', character:lookup.character, pendingCharacterMaster:lookup.pendingCharacterMaster === true };
    }

    if(normalizedCommand === 'createCode'){
      const lookup = await lookupMainCharacter(extra.mainCharacter || extra.characterName || extra.name);
      if(!lookup.ok) return lookup;
      const code = normalizeMemberCode(extra.code);
      if(!isValidMemberCode(code)) return { ok:false, message:'코드는 총 6자리이며 알파벳 2개와 숫자 4개를 포함해야 합니다.' };
      if(await findMemberByCode(code)) return { ok:false, message:'이미 존재하는 코드입니다. 다른 코드로 등록해 주세요.' };
      if(await findMemberByMainCharacter(lookup.character.mainCharacter)) return { ok:false, message:'이미 활성화된 코드가 있습니다.' };
      const rolePatch = roleRowPatch('MEMBER');
      const permissions = normalizePermissions(extra.permissions);
      const body = Object.assign({
        main_character_name: lookup.character.mainCharacter,
        pass_code: code,
        can_like: true,
        can_suggest: true,
        can_manage: permissions.includes('account_manage') || permissions.includes('all'),
        is_active: true,
        permissions
      }, rolePatch);
      const rows = await request('member_codes', { method:'POST', headers:{ Prefer:'return=representation' }, body });
      return { ok:true, message:'회원 코드가 생성되었습니다.', account:accountFromRow(Array.isArray(rows) ? rows[0] : rows) };
    }

    if(normalizedCommand === 'listCodes'){
      const rows = await request('member_codes', { query:'select=*&order=level.desc,main_character_name.asc' });
      return { ok:true, accounts:(Array.isArray(rows) ? rows : []).map(accountFromRow) };
    }

    if(normalizedCommand === 'listCodeRequests'){
      const data = await rpc('kinojo_code_request_list', {
        p_pass_key: currentPassKey(),
        p_status: String(extra.status || 'PENDING'),
        p_limit: Number(extra.limit || 100)
      });
      const source = data && data.requests || [];
      return { ok:true, requests:(Array.isArray(source) ? source : []).map(normalizeCodeRequestRow).filter(Boolean) };
    }

    if(normalizedCommand === 'approveCodeRequest'){
      const requestId = String(extra.requestId || '').trim();
      if(!requestId) return { ok:false, message:'처리할 코드 요청을 찾지 못했습니다.' };
      const data = await rpc('kinojo_code_request_approve', {
        p_pass_key: currentPassKey(),
        p_request_id: requestId,
        p_level: Number(extra.level || 1),
        p_role: String(extra.role || 'MEMBER'),
        p_role_label: extra.roleLabel || null,
        p_can_like: extra.canLike !== false,
        p_can_suggest: extra.canSuggest !== false,
        p_can_manage: extra.canManage === true,
        p_memo: String(extra.memo || '')
      });
      return { ok:true, message:'회원 코드가 등록되었습니다.', requestId, account:accountFromRow(data && (data.member || data.account)), request:normalizeCodeRequestRow(data && (data.request || {})) };
    }

    if(normalizedCommand === 'rejectCodeRequest'){
      const requestId = String(extra.requestId || '').trim();
      if(!requestId) return { ok:false, message:'처리할 코드 요청을 찾지 못했습니다.' };
      const data = await rpc('kinojo_code_request_reject', {
        p_pass_key: currentPassKey(),
        p_request_id: requestId,
        p_reason: String(extra.reason || extra.memo || '')
      });
      return { ok:true, message:'코드 요청을 거절했습니다.', requestId, request:normalizeCodeRequestRow(data && (data.request || {})) };
    }

    if(normalizedCommand === 'updateRole'){
      const code = normalizeMemberCode(extra.code);
      if(!isValidMemberCode(code)) return { ok:false, message:'회원 코드 형식이 올바르지 않습니다.' };
      const role = normalizeRole(extra.role, 1);
      if(role === 'MASTER') return { ok:false, message:'마스터 등급은 고정 계정만 사용할 수 있습니다.' };
      const member = await findMemberByCode(code);
      if(!member) return { ok:false, message:'해당 코드를 찾지 못했습니다.' };
      if(normalizeRole(member.role, member.level) === 'MASTER') return { ok:false, message:'마스터 계정 등급은 수정할 수 없습니다.' };
      const rows = await request('member_codes', { method:'PATCH', query:'pass_code=eq.' + encodeURIComponent(code), headers:{ Prefer:'return=representation' }, body:roleRowPatch(role) });
      return { ok:true, message:'등급이 수정되었습니다.', code, account:accountFromRow(Array.isArray(rows) ? rows[0] : rows) };
    }

    if(normalizedCommand === 'updatePermissions'){
      const code = normalizeMemberCode(extra.code);
      if(!isValidMemberCode(code)) return { ok:false, message:'회원 코드 형식이 올바르지 않습니다.' };
      const member = await findMemberByCode(code);
      if(!member) return { ok:false, message:'해당 코드를 찾지 못했습니다.' };
      if(normalizeRole(member.role, member.level) === 'MASTER') return { ok:false, message:'마스터 계정 권한은 수정할 수 없습니다.' };
      const permissions = normalizePermissions(extra.permissions);
      const rows = await request('member_codes', {
        method:'PATCH',
        query:'pass_code=eq.' + encodeURIComponent(code),
        headers:{ Prefer:'return=representation' },
        body:{ permissions, can_manage:permissions.includes('account_manage') || permissions.includes('all') || Number(member.level || 0) >= 3 }
      });
      return { ok:true, message:'권한이 수정되었습니다.', code, account:accountFromRow(Array.isArray(rows) ? rows[0] : rows) };
    }

    if(normalizedCommand === 'deleteCode' || normalizedCommand === 'disableCode'){
      const code = normalizeMemberCode(extra.code);
      if(!isValidMemberCode(code)) return { ok:false, message:'회원 코드 형식이 올바르지 않습니다.' };
      const member = await findMemberByCode(code);
      if(!member) return { ok:false, message:'해당 코드를 찾지 못했습니다.' };
      if(normalizeRole(member.role, member.level) === 'MASTER') return { ok:false, message:'마스터 계정은 삭제할 수 없습니다.' };
      if(normalizedCommand === 'deleteCode'){
        await request('member_codes', { method:'DELETE', query:'pass_code=eq.' + encodeURIComponent(code) });
        return { ok:true, message:'회원 코드가 삭제되었습니다.', code };
      }
      await request('member_codes', { method:'PATCH', query:'pass_code=eq.' + encodeURIComponent(code), body:{ is_active:false } });
      return { ok:true, message:'회원 코드가 비활성화되었습니다.', code };
    }

    if(normalizedCommand === 'permissionOptions'){
      return { ok:true, permissions:PERMISSION_KEYS.map(key => ({ key, label:key })) };
    }

    if(normalizedCommand === 'syncOwnerMap'){
      return { ok:true, message:'Supabase Phase 2에서는 CHARACTER_MASTER 서버 이관 후 자동 갱신됩니다.', count:0, mainCount:0 };
    }

    return { ok:false, message:'알 수 없는 계정 관리자 명령입니다.' };
  }

  async function getLatestAnnouncements(limit){
    const q = 'select=*&is_active=eq.true&order=priority.desc,created_at.desc&limit=' + encodeURIComponent(limit || 5);
    return request('announcements', { query:q });
  }

  async function getLockStatus(){
    const rows = await request('crawl_locks', { query:'select=*&id=eq.global&limit=1' });
    return Array.isArray(rows) ? rows[0] : null;
  }




  function normalizeAdminCharacterRow(row){
    if(!row) return null;
    return {
      characterName: row.character_name || row.characterName || '',
      mainCharacterName: row.main_character_name || row.mainCharacterName || '',
      serverId: row.server_id || row.serverId || '',
      serverName: row.server_name || row.serverName || getServerNameByServerId(row.server_id || row.serverId || ''),
      className: row.class_name || row.className || '',
      profileImageUrl: row.profile_image_url || row.profileImageUrl || '',
      isMain: row.is_main === true || row.isMain === true,
      isActive: row.is_active !== false && row.isActive !== false,
      inactiveReason: row.inactive_reason || row.inactiveReason || '',
      inactiveMemo: row.inactive_memo || row.inactiveMemo || '',
      inactivatedAt: row.inactivated_at || row.inactivatedAt || '',
      restoredAt: row.restored_at || row.restoredAt || '',
      previousName: row.previous_name || row.previousName || '',
      renamedTo: row.renamed_to || row.renamedTo || '',
      pvePower: Number(row.latest_pve_combat_power || row.latestPveCombatPower || 0),
      pvpPower: Number(row.latest_pvp_combat_power || row.latestPvpCombatPower || 0),
      lastSyncedAt: row.last_synced_at || row.lastSyncedAt || ''
    };
  }

  async function adminCharacter(command, extra={}){
    assertAdmin();
    const normalizedCommand = String(command || '').trim();
    if(normalizedCommand === 'search'){
      const data = await rpc('kinojo_admin_character_search', {
        p_pass_key: currentPassKey(),
        p_search: String(extra.search || extra.characterName || ''),
        p_include_inactive: extra.includeInactive !== false,
        p_limit: Number(extra.limit || 30)
      });
      const rows = data && (data.characters || data.items || []);
      return { ok:data && data.ok !== false, message:data && data.message || '', characters:(Array.isArray(rows) ? rows : []).map(normalizeAdminCharacterRow).filter(Boolean) };
    }
    if(normalizedCommand === 'deactivate'){
      const data = await rpc('kinojo_admin_character_deactivate', {
        p_pass_key: currentPassKey(),
        p_character_name: String(extra.characterName || ''),
        p_server_id: extra.serverId ? Number(extra.serverId) : null,
        p_reason: String(extra.reason || '탈퇴'),
        p_memo: String(extra.memo || '')
      });
      return data || { ok:false, message:'처리 결과를 확인하지 못했습니다.' };
    }
    if(normalizedCommand === 'restore'){
      const data = await rpc('kinojo_admin_character_restore', {
        p_pass_key: currentPassKey(),
        p_character_name: String(extra.characterName || ''),
        p_server_id: extra.serverId ? Number(extra.serverId) : null,
        p_memo: String(extra.memo || '')
      });
      return data || { ok:false, message:'처리 결과를 확인하지 못했습니다.' };
    }
    if(normalizedCommand === 'markRenamed'){
      const data = await rpc('kinojo_admin_character_mark_renamed', {
        p_pass_key: currentPassKey(),
        p_previous_name: String(extra.previousName || extra.characterName || ''),
        p_new_name: String(extra.newName || extra.renamedTo || ''),
        p_server_id: extra.serverId ? Number(extra.serverId) : null,
        p_memo: String(extra.memo || '')
      });
      return data || { ok:false, message:'처리 결과를 확인하지 못했습니다.' };
    }
    return { ok:false, message:'알 수 없는 캐릭터 관리 명령입니다.' };
  }

  function noticeAuthorLabel(account){
    const role = normalizeRole(account && account.role, account && account.level);
    const label = role === 'SUB_MASTER' ? 'SUB MASTER' : role;
    const name = String(account && (account.mainCharacter || account.mainCharacterName) || '관리자').trim() || '관리자';
    return name + ' (' + label + ')';
  }

  function normalizeNoticeType(value){
    const type = String(value || '공지').trim();
    return ['공지','알림','이벤트'].includes(type) ? type : '공지';
  }

  function noticeFromRow(row){
    if(!row) return null;
    return {
      id: row.id,
      noticeType: row.notice_type || row.notice || '공지',
      notice: row.notice || row.notice_type || '공지',
      author: row.author || '관리자',
      content: row.content || '',
      isActive: row.is_active !== false,
      priority: Number(row.priority || 0),
      createdBy: row.created_by || '',
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || ''
    };
  }

  async function listAdminNotices(limit){
    assertAdmin();
    const q = 'select=*&is_active=eq.true&order=priority.desc,created_at.desc&limit=' + encodeURIComponent(limit || 20);
    const rows = await request('announcements', { query:q });
    return { ok:true, notices:(Array.isArray(rows) ? rows : []).map(noticeFromRow).filter(Boolean) };
  }


  async function adminEventNotice(command, extra={}){
    assertAdmin();
    const normalizedCommand = String(command || '').trim();
    const passKey = currentPassKey();

    if(normalizedCommand === 'listGroups' || normalizedCommand === 'listEventNotices'){
      const data = await rpc('kinojo_admin_event_notice_list', {
        p_pass_key: passKey,
        p_limit: Number(extra.limit || 30),
        p_status: String(extra.status || 'ALL').toUpperCase()
      });
      return data && typeof data === 'object' ? data : { ok:true, groups:[] };
    }

    if(normalizedCommand === 'saveGroup' || normalizedCommand === 'saveEventNotice'){
      const payload = extra || {};
      const data = await rpc('kinojo_admin_event_notice_save', {
        p_pass_key: passKey,
        p_group_id: payload.groupId || payload.group_id || null,
        p_group_title: payload.title || payload.groupTitle || '이벤트 공지',
        p_status: payload.status || 'draft',
        p_priority: Number(payload.priority || 0),
        p_items: payload.items || []
      });
      return data && typeof data === 'object' ? data : { ok:true };
    }

    if(normalizedCommand === 'deleteGroup' || normalizedCommand === 'deleteEventNotice'){
      const groupId = Number(extra.groupId || extra.group_id || extra.id || 0);
      if(!groupId) return { ok:false, message:'삭제할 이벤트 공지 묶음 ID가 없습니다.' };
      const data = await rpc('kinojo_admin_event_notice_delete', {
        p_pass_key: passKey,
        p_group_id: groupId
      });
      return data && typeof data === 'object' ? data : { ok:true, id:groupId };
    }

    return { ok:false, message:'알 수 없는 이벤트 공지 관리자 명령입니다.' };
  }



  async function getWebEventNoticeGroups(limit){
    const data = await rpc('kinojo_web_event_notice_groups', {
      p_limit: Number(limit || 10)
    });
    if(data && typeof data === 'object') return data;
    return { ok:true, groups:[] };
  }

  async function adminNotice(command, extra={}){
    const admin = assertAdmin();
    const normalizedCommand = String(command || '').trim();

    if(normalizedCommand === 'listNotices' || normalizedCommand === 'listNotice'){
      return listAdminNotices(extra.limit || 20);
    }

    if(normalizedCommand === 'createNotice'){
      const content = String(extra.content || '').trim();
      if(!content) return { ok:false, message:'공지 내용을 입력해 주세요.' };
      const noticeType = normalizeNoticeType(extra.noticeType || extra.notice);
      const body = {
        notice_type: noticeType,
        notice: noticeType,
        author: noticeAuthorLabel(admin.account),
        content: content.slice(0, 500),
        is_active: true,
        priority: Number(extra.priority || 0),
        created_by: admin.account.mainCharacter || admin.role
      };
      const rows = await request('announcements', { method:'POST', headers:{ Prefer:'return=representation' }, body });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { ok:true, notice:noticeFromRow(row) };
    }

    if(normalizedCommand === 'updateNotice'){
      const id = Number(extra.id || 0);
      if(!id) return { ok:false, message:'수정할 공지 ID가 없습니다.' };
      const content = String(extra.content || '').trim();
      if(!content) return { ok:false, message:'공지 내용을 입력해 주세요.' };
      const noticeType = normalizeNoticeType(extra.noticeType || extra.notice);
      const body = {
        notice_type: noticeType,
        notice: noticeType,
        content: content.slice(0, 500),
        priority: Number(extra.priority || 0),
        updated_at: new Date().toISOString()
      };
      const rows = await request('announcements', { method:'PATCH', query:'id=eq.' + encodeURIComponent(id), headers:{ Prefer:'return=representation' }, body });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { ok:true, notice:noticeFromRow(row), message:'공지사항이 수정되었습니다.' };
    }

    if(normalizedCommand === 'deleteNotice' || normalizedCommand === 'disableNotice'){
      const id = Number(extra.id || 0);
      if(!id) return { ok:false, message:'삭제할 공지 ID가 없습니다.' };
      await request('announcements', {
        method:'PATCH',
        query:'id=eq.' + encodeURIComponent(id),
        body:{ is_active:false, updated_at:new Date().toISOString() }
      });
      return { ok:true, id, message:'공지사항이 삭제되었습니다.' };
    }

    return { ok:false, message:'알 수 없는 공지 관리자 명령입니다.' };
  }

  function todayVisitKey(){
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return yy + mm + dd;
  }

  function emptyVisitStats(date){
    return { date, todayVisits:0, todayBoosts:0, totalVisits:0, totalBoosts:0 };
  }

  function sumVisitRows(rows, date){
    const stats = emptyVisitStats(date);
    (rows || []).forEach(row => {
      const visits = Number(row.visit_count || 0);
      const boosts = Number(row.boost_count || 0);
      stats.totalVisits += visits;
      stats.totalBoosts += boosts;
      if(String(row.date_key || row.date || '') === date){
        stats.todayVisits = visits;
        stats.todayBoosts = boosts;
      }
    });
    return stats;
  }

  async function getVisitStats(){
    const date = todayVisitKey();
    const rows = await request('visit_stats', { query:'select=*&order=date_key.asc' });
    return sumVisitRows(Array.isArray(rows) ? rows : [], date);
  }

  async function adminVisit(mode, amount){
    const admin = assertAdmin();
    if(normalizeRole(admin.role, admin.level) !== 'MASTER') return { ok:false, message:'방문자수 조정은 MASTER 전용 기능입니다.' };
    const date = todayVisitKey();
    const rows = await request('visit_stats', { query:'select=*&date_key=eq.' + encodeURIComponent(date) + '&limit=1' });
    const current = Array.isArray(rows) && rows[0] ? rows[0] : null;
    const delta = Math.max(-9999, Math.min(9999, Number(amount || 0)));
    const isTotal = String(mode || '').startsWith('total');
    const isMinus = String(mode || '').endsWith('Minus');
    const signed = isMinus ? -Math.abs(delta) : Math.abs(delta);
    const next = {
      date_key: date,
      visit_count: Number(current && current.visit_count || 0),
      boost_count: Number(current && current.boost_count || 0),
      note: 'admin adjust ' + mode + ' ' + signed,
      updated_at: new Date().toISOString()
    };
    if(isTotal) next.boost_count = Math.max(0, next.boost_count + signed);
    else next.visit_count = Math.max(0, next.visit_count + signed);
    if(current){
      await request('visit_stats', { method:'PATCH', query:'date_key=eq.' + encodeURIComponent(date), headers:{ Prefer:'return=representation' }, body:next });
    }else{
      await request('visit_stats', { method:'POST', headers:{ Prefer:'return=representation' }, body:next });
    }
    const stats = await getVisitStats();
    return { ok:true, stats };
  }


  function buildRpcUrl(cfg, fn){
    return cfg.url + '/rest/v1/rpc/' + String(fn || '').replace(/^\//, '');
  }

  async function rpc(fn, params){
    const cfg = await ensureConfig();
    const res = await fetch(buildRpcUrl(cfg, fn), {
      method:'POST',
      headers:Object.assign(headers(cfg), { Prefer:'return=representation' }),
      body:JSON.stringify(params || {}),
      cache:'no-store'
    });
    const text = await res.text();
    let data = null;
    if(text){
      try{ data = JSON.parse(text); }catch(_err){ data = text; }
    }
    if(!res.ok) throw new Error(data && (data.message || data.details || data.hint) || text || ('HTTP ' + res.status));
    return data;
  }

  function snakeOrCamel(row, snake, camel, fallback){
    if(row && row[camel] !== undefined && row[camel] !== null) return row[camel];
    if(row && row[snake] !== undefined && row[snake] !== null) return row[snake];
    return fallback;
  }

  function numberLabel(value){
    const n = Number(value || 0);
    return Number.isFinite(n) && n > 0 ? n.toLocaleString('ko-KR') : '';
  }

  function hallItemFromRow(row, rankFallback){
    const name = stripServerSuffixFromCharacterName(snakeOrCamel(row, 'character_name', 'characterName', ''));
    const owner = stripServerSuffixFromCharacterName(snakeOrCamel(row, 'main_character_name', 'mainCharacterName', name));
    const serverId = String(snakeOrCamel(row, 'server_id', 'serverId', '') || '');
    const serverName = snakeOrCamel(row, 'server_name', 'serverName', '') || getServerNameByServerId(serverId);
    const pvePower = Number(snakeOrCamel(row, 'pve_power_total', 'pvePowerTotal', snakeOrCamel(row, 'latest_pve_combat_power', 'latestPveCombatPower', snakeOrCamel(row, 'power_total', 'powerTotal', 0))) || 0);
    const pvpPower = Number(snakeOrCamel(row, 'pvp_power_total', 'pvpPowerTotal', snakeOrCamel(row, 'latest_pvp_combat_power', 'latestPvpCombatPower', 0)) || 0);
    const pveItem = Number(snakeOrCamel(row, 'pve_item_level', 'pveItemLevel', snakeOrCamel(row, 'latest_pve_item_level', 'latestPveItemLevel', 0)) || 0);
    const pvpItem = Number(snakeOrCamel(row, 'pvp_item_level', 'pvpItemLevel', snakeOrCamel(row, 'latest_pvp_item_level', 'latestPvpItemLevel', 0)) || 0);
    const itemLevel = Number(snakeOrCamel(row, 'item_level_total', 'itemLevelTotal', (pveItem || 0) + (pvpItem || 0)) || 0);
    const powerDelta = Number(snakeOrCamel(row, 'power_delta', 'powerDelta', 0) || 0);
    const itemDelta = Number(snakeOrCamel(row, 'item_level_delta', 'itemLevelDelta', 0) || 0);
    const className = snakeOrCamel(row, 'class_name', 'className', '') || '';
    const reviewText = snakeOrCamel(row, 'review_text', 'reviewText', '') || '';
    const growthLabel = snakeOrCamel(row, 'growth_label', 'growthLabel', '') || '';
    const rank = Number(snakeOrCamel(row, 'rank_no', 'rankNo', rankFallback || 0) || rankFallback || 0);
    const rankTotal = Number(snakeOrCamel(row, 'rank_total', 'rankTotal', 0) || 0);
    const rankTier = snakeOrCamel(row, 'rank_tier', 'rankTier', '') || '';
    return {
      rank,
      rankTotal,
      rankTier,
      name,
      owner,
      className,
      serverId,
      serverName,
      meta:serverName,
      category:String(snakeOrCamel(row, 'rank_mode', 'rankMode', 'PVE') || 'PVE').toUpperCase()==='PVP'?'PVP':'PVE',
      value:(String(snakeOrCamel(row, 'rank_mode', 'rankMode', 'PVE') || 'PVE').toUpperCase()==='PVP'?pvpPower:pvePower),
      label:numberLabel(String(snakeOrCamel(row, 'rank_mode', 'rankMode', 'PVE') || 'PVE').toUpperCase()==='PVP'?pvpPower:pvePower),
      pvePower:pvePower,
      pvePowerLabel:numberLabel(pvePower),
      pvpPower:pvpPower,
      pvpPowerLabel:numberLabel(pvpPower),
      pveItem:pveItem,
      pvpItem:pvpItem,
      itemLevel:itemLevel,
      itemLabel:itemDelta ? (itemDelta > 0 ? '+' : '') + numberLabel(itemDelta) : numberLabel(itemLevel),
      powerDelta,
      itemLevelDelta:itemDelta,
      powerLabel:powerDelta ? (powerDelta > 0 ? '+' : '') + numberLabel(powerDelta) : numberLabel(pvePower),
      pveReview:reviewText || growthLabel,
      pvpReview:growthLabel || reviewText,
      growthStatus:snakeOrCamel(row, 'growth_status', 'growthStatus', '') || '',
      growthLabel,
      profileImageUrl:snakeOrCamel(row, 'profile_image_url', 'profileImageUrl', '') || '',
      detailUrl:snakeOrCamel(row, 'detail_url', 'detailUrl', '') || '',
      isMain:snakeOrCamel(row, 'is_main', 'isMain', true) !== false,
      raw:row
    };
  }

  function groupByClass(items){
    const map = {};
    (items || []).forEach(item => {
      const key = item.className || '직업 미확인';
      if(!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }

  function countByClass(items){
    const count = {};
    (items || []).forEach(item => {
      const key = item.className || '직업 미확인';
      count[key] = (count[key] || 0) + 1;
    });
    return count;
  }

  function defaultClassReviewPool(){
    return {
      full:['클래스 경쟁이 치열합니다. 순위권 진입은 쉽지 않겠어요.'],
      nearlyFull:['상위권 구도가 점점 선명해지고 있습니다.'],
      small:['아직 표본이 적어 다음 조회가 기대됩니다.'],
      partyReady:['파티 구성이 가능한 인원이 모였습니다.'],
      needOneMore:['한 명만 더 모이면 더 재미있는 경쟁이 됩니다.'],
      lonely:['아직 외로운 클래스입니다. 새 랭커를 기다립니다.']
    };
  }

  async function getWebRanking(limit){
    return rpc('kinojo_web_get_ranking', { p_limit:Number(limit || 300) });
  }

  async function getWebHallOfFame(limit, extra={}){
    const hall = await rpc('kinojo_web_get_hall_of_fame', { p_limit:Number(limit || 300) });
    const mvp = await rpc('kinojo_web_get_mvp_candidates', { p_limit:20 }).catch(()=>({ ok:true, items:[] }));
    const rows = Array.isArray(hall && hall.items) ? hall.items : [];
    const allRows = Array.isArray(hall && hall.allItems) && hall.allItems.length ? hall.allItems : rows;
    const displayRows = rows.length ? rows : allRows;
    const items = allRows.map((row, idx) => hallItemFromRow(row, idx + 1));
    const mainItems = displayRows.map((row, idx) => hallItemFromRow(row, idx + 1)).filter(item => item.isMain !== false);
    const main = mainItems.length ? mainItems : items.filter(item => item.isMain !== false);
    const all = items.slice();
    const serverPveTop = Array.isArray(hall && hall.pveTop) ? hall.pveTop.map((row, idx)=>hallItemFromRow(row, idx + 1)) : [];
    const serverPvpTop = Array.isArray(hall && hall.pvpTop) ? hall.pvpTop.map((row, idx)=>hallItemFromRow(row, idx + 1)) : [];
    const pveTop = (serverPveTop.length ? serverPveTop : items.slice().sort((a,b)=>(b.pvePower||0)-(a.pvePower||0)).slice(0,5))
      .map((item,idx)=>Object.assign({}, item, { rank:idx+1, category:'PVE', value:item.pvePower, label:item.pvePowerLabel }));
    const pvpTop = (serverPvpTop.length ? serverPvpTop : items.slice().sort((a,b)=>(b.pvpPower||0)-(a.pvpPower||0)).slice(0,5))
      .map((item,idx)=>Object.assign({}, item, { rank:idx+1, category:'PVP', value:item.pvpPower, label:item.pvpPowerLabel }));
    const mvpCandidatesTop3 = (Array.isArray(mvp && mvp.items) ? mvp.items : []).map((row, idx)=>hallItemFromRow(row, idx + 1)).slice(0,3);
    const updatedAt = rows[0] && (rows[0].updated_at || rows[0].ranking_date || rows[0].created_at) || '';
    const rankingView = await getWebHallRankingView(Object.assign({limit, page:1, pageSize:10, includeSubs:false, className:'전체', search:'', rankMode:'PVE'}, extra || {})).catch(()=>null);
    return {
      ok:true,
      source:'supabase_035',
      updatedAt,
      overallMain:main,
      overallAll:all,
      classMain:groupByClass(main),
      classAll:groupByClass(all),
      classMainCount:countByClass(main),
      classAllCount:countByClass(all),
      pveTop,
      pvpTop,
      mvp:mvpCandidatesTop3[0] || null,
      mvpCandidatesTop3,
      mvpConfirmed:false,
      weeklyAwards:{
        growthKing:items.slice().sort((a,b)=>(b.itemLevelDelta||0)-(a.itemLevelDelta||0)).filter(x=>x.itemLevelDelta).slice(0,5),
        bulkUp:items.slice().sort((a,b)=>(b.powerDelta||0)-(a.powerDelta||0)).filter(x=>x.powerDelta).slice(0,5)
      },
      demonFamily:main.filter(item => String(item.serverId || '').startsWith('2') && item.serverId !== '2002').slice(0,40),
      demonFamilyAll:items.filter(item => String(item.serverId || '').startsWith('2') && item.serverId !== '2002').slice(0,80),
      partyFriend:main.filter(item => String(item.serverId || '').startsWith('1')).slice(0,40),
      partyFriendAll:items.filter(item => String(item.serverId || '').startsWith('1')).slice(0,80),
      newChicks:[],
      reactionSummary:await getHallReactionSummary(),
      classReviewPool:defaultClassReviewPool(),
      rankingView
    };
  }

  async function getWebHallRankingView(extra={}){
    const data = await rpc('kinojo_web_get_hall_ranking_view', {
      p_limit:Number(extra.limit || 300),
      p_page:Number(extra.page || 1),
      p_page_size:Number(extra.pageSize || extra.page_size || 10),
      p_include_subs:!!extra.includeSubs || !!extra.include_subs,
      p_class_name:String(extra.className || extra.class_name || '전체'),
      p_search:String(extra.search || ''),
      p_rank_mode:String(extra.rankMode || extra.rank_mode || 'PVE').toUpperCase()==='PVP'?'PVP':'PVE'
    });
    const rows = Array.isArray(data && data.items) ? data.items : [];
    const items = rows.map((row, idx)=>hallItemFromRow(row, idx + 1));
    return Object.assign({}, data || {}, {
      ok:data?.ok!==false,
      items,
      totalCount:Number(data?.totalCount || data?.total_count || items.length || 0),
      page:Number(data?.page || extra.page || 1),
      pageSize:Number(data?.pageSize || data?.page_size || extra.pageSize || 10),
      rankMode:data?.rankMode || data?.rank_mode || extra.rankMode || 'PVE',
      className:data?.className || data?.class_name || extra.className || '전체',
      search:data?.search || extra.search || '',
      includeSubs:!!(data?.includeSubs || data?.include_subs || extra.includeSubs),
      classCounts:data?.classCounts || data?.class_counts || {}
    });
  }


  async function getWebHofSummary(extra={}){
    const data = await rpc('kinojo_web_get_hof_summary', { p_include_subs:!!extra.includeSubs || !!extra.include_subs });
    const sections = data && data.sections ? data.sections : {};
    const toList = function(rows, category){
      return (Array.isArray(rows) ? rows : []).map((row, idx)=>{
        const item = hallItemFromRow(row, idx + 1);
        const like = Number(snakeOrCamel(row, 'like_count', 'likeCount', 0) || 0);
        const dislike = Number(snakeOrCamel(row, 'dislike_count', 'dislikeCount', 0) || 0);
        return Object.assign({}, item, {
          rank:Number(snakeOrCamel(row, 'rank_no', 'rankNo', idx + 1) || idx + 1),
          category:category || item.category,
          like,
          dislike,
          reactionComments:snakeOrCamel(row, 'reaction_comments', 'reactionComments', []) || snakeOrCamel(row, 'comments', 'comments', []) || [],
          value:category === 'PVP' ? item.pvpPower : category === 'PVE' ? item.pvePower : item.value,
          label:category === 'PVP' ? item.pvpPowerLabel : category === 'PVE' ? item.pvePowerLabel : item.label
        });
      });
    };
    const toItem = function(row, category){
      if(!row || !Object.keys(row).length) return null;
      return toList([row], category)[0] || null;
    };
    const likesTop = toList(sections.likesTop3, 'LIKE');
    const dislikesTop = toList(sections.dislikesTop3, 'DISLIKE');
    const pveTop = toList(sections.pveTop3, 'PVE');
    const pvpTop = toList(sections.pvpTop3, 'PVP');
    const growthGod = toItem(sections.growthGod, 'GROWTH');
    const enhanceGod = toItem(sections.enhanceGod, 'ENHANCE');
    const allSummaryItems = likesTop.concat(dislikesTop, pveTop, pvpTop, growthGod?[growthGod]:[], enhanceGod?[enhanceGod]:[]);
    const byName = {};
    allSummaryItems.forEach(item=>{
      if(!item || !item.name) return;
      byName[item.name] = {
        like:Number(item.like || 0),
        dislike:Number(item.dislike || 0),
        comments:Array.isArray(item.reactionComments) ? item.reactionComments : []
      };
    });
    return {
      ok:data?.ok!==false,
      source:data?.source || 'supabase_049',
      updatedAt:data?.updatedAt || data?.updated_at || new Date().toLocaleString('ko-KR'),
      includeSubs:!!(data?.includeSubs || data?.include_subs || extra.includeSubs),
      pveTop,
      pvpTop,
      overallMain:allSummaryItems,
      overallAll:allSummaryItems,
      reactionSummary:{ likeTop:likesTop, dislikeTop:dislikesTop, byName },
      weeklyAwards:{ growthKing:growthGod?[growthGod]:[], bulkUp:enhanceGod?[enhanceGod]:[] },
      summarySections:{ likesTop, dislikesTop, pveTop, pvpTop, growthGod, enhanceGod },
      mvp:null,
      mvpCandidatesTop3:[],
      mvpConfirmed:false,
      newChicks:[],
      demonFamily:[],
      demonFamilyAll:[],
      partyFriend:[],
      partyFriendAll:[],
      classReviewPool:defaultClassReviewPool()
    };
  }

  async function getWebDashboard(){
    return rpc('kinojo_web_get_dashboard', {});
  }

  async function getWebUpdaterStatus(){
    return rpc('kinojo_web_get_updater_status', {});
  }

  function getVisitorKey(){
    const key = 'kinojo_visitor_key_v1';
    let value = '';
    try{ value = localStorage.getItem(key) || ''; }catch(_err){}
    if(!value){
      value = 'kv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      try{ localStorage.setItem(key, value); }catch(_err){}
    }
    return value;
  }

  async function logPageView(pageKey, payload){
    return rpc('kinojo_log_page_view', {
      p_page_key:String(pageKey || ''),
      p_page_url:String(location.href || ''),
      p_visitor_key:getVisitorKey(),
      p_referrer:String(document.referrer || ''),
      p_user_agent:String(navigator.userAgent || ''),
      p_source_type:'WEB',
      p_payload:payload || {}
    });
  }

  async function getVisitStatsFromServer(pageKey, shouldLog){
    if(shouldLog){
      await logPageView(pageKey || 'web', {}).catch(()=>{});
    }
    const date = todayVisitKey();
    const rows = await request('v_kinojo_page_view_daily', { query:'select=*&order=visit_date.asc' }).catch(()=>[]);
    const stats = emptyVisitStats(date);
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const rowDate = String(row.visit_date || '').replace(/-/g,'').slice(2,8);
      const views = Number(row.view_count || row.visitor_count || 0);
      stats.totalVisits += views;
      if(rowDate === date) stats.todayVisits += views;
    });
    return stats;
  }


  function reactionSummaryFromRows(rows){
    const byName = {};
    const likeTop = [];
    const dislikeTop = [];
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const name = stripServerSuffixFromCharacterName(row.character_name || row.characterName || '');
      if(!name) return;
      const like = Number(row.like_count || row.likeCount || 0);
      const dislike = Number(row.dislike_count || row.dislikeCount || 0);
      const comments = Array.isArray(row.comments) ? row.comments.filter(Boolean) : [];
      byName[name] = { like, dislike, total:Number(row.total_count || row.totalCount || like + dislike), comments };
      likeTop.push({ name, like, dislike, total:like + dislike, comments });
      dislikeTop.push({ name, like, dislike, total:like + dislike, comments });
    });
    likeTop.sort((a,b)=>(b.like||0)-(a.like||0));
    dislikeTop.sort((a,b)=>(b.dislike||0)-(a.dislike||0));
    return { byName, likeTop:likeTop.slice(0,10), dislikeTop:dislikeTop.slice(0,10) };
  }

  async function getHallReactionSummary(){
    const rows = await request('v_reaction_summary', { query:'select=*&order=total_count.desc&limit=200' }).catch(()=>[]);
    return reactionSummaryFromRows(rows);
  }

  async function submitHallReaction(extra={}){
    const characterName = stripServerSuffixFromCharacterName(extra.characterName || extra.character_name || '');
    const reaction = String(extra.reaction || '').trim().toLowerCase();
    const comment = String(extra.comment || '').trim().slice(0, 20);
    if(!characterName) return { ok:false, message:'캐릭터 이름이 없습니다.' };
    if(!['like','dislike'].includes(reaction)) return { ok:false, message:'반응 종류가 올바르지 않습니다.' };
    if(!comment) return { ok:false, message:'전하고 싶은 말을 입력해 주세요.' };
    const authAccount = currentAccount();
    const body = {
      character_name: characterName,
      owner: stripServerSuffixFromCharacterName(extra.owner || ''),
      class_name: String(extra.className || extra.class_name || '').trim(),
      reaction,
      comment,
      client_key: String(extra.clientKey || extra.client_key || getVisitorKey()).trim(),
      actor_main_character: String(authAccount && (authAccount.mainCharacter || authAccount.mainCharacterName) || '').trim(),
      session_token: String(extra.sessionToken || extra.session_token || '').trim()
    };
    await request('reaction_logs', { method:'POST', headers:{ Prefer:'return=minimal' }, body });
    const summary = await getHallReactionSummary();
    return { ok:true, message:'한마디가 전달되었어요.', summary };
  }

  async function submitHallSuggestion(extra={}){
    const title = String(extra.title || '').trim().slice(0, 80);
    const proposer = String(extra.proposer || '').trim().slice(0, 60);
    const memo = String(extra.memo || '').trim().slice(0, 1000);
    if(!title) return { ok:false, message:'항목 이름을 입력해 주세요.' };
    const authAccount = currentAccount();
    const body = {
      title,
      proposer,
      memo,
      status:'PENDING',
      actor_main_character: String(authAccount && (authAccount.mainCharacter || authAccount.mainCharacterName) || proposer || '').trim(),
      session_token: String(extra.sessionToken || extra.session_token || '').trim()
    };
    const rows = await request('hall_suggestions', { method:'POST', headers:{ Prefer:'return=representation' }, body });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { ok:true, message:'제안이 접수되었습니다.', suggestion:row || null };
  }

  async function getSanctuaryData(id){
    return rpc('kinojo_web_get_sanctuary', { p_sanctuary_id:String(id || 'rudra') });
  }

  async function saveSanctuaryData(extra={}){
    assertAdmin();
    return rpc('kinojo_web_save_sanctuary', { p_payload:extra || {} });
  }



  function getClientId(){
    const key = 'kinojo_runtime_client_id_v1';
    let value = '';
    try{ value = localStorage.getItem(key) || ''; }catch(_err){}
    if(!value){
      value = 'web_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      try{ localStorage.setItem(key, value); }catch(_err){}
    }
    return value;
  }

  function normalizeRuntimeStatus(result){
    if(!result) return { ok:false, isLocked:false, status:'unknown', message:'상태 없음' };
    const status = result.status && typeof result.status === 'object' && !Array.isArray(result.status)
      ? result.status
      : result;
    return Object.assign({ ok:result.ok !== false }, status);
  }

  async function runtimeGetStatus(){
    const data = await rpc('kinojo_runtime_get_live_status', {}).catch(async function(){
      return await getWebUpdaterStatus();
    });
    return normalizeRuntimeStatus(data);
  }

  async function runtimeStart(passCode, options){
    const extra = options || {};
    const data = await rpc('kinojo_runtime_start', {
      p_pass_code:normalizePassKey(passCode || ''),
      p_tool_name:String(extra.toolName || 'KINOJO_EXTENSION'),
      p_client_id:String(extra.clientId || getClientId()),
      p_progress_total:Number(extra.progressTotal || 0),
      p_payload:extra.payload || {}
    });
    return data;
  }

  async function runtimeProgress(sessionId, sessionToken, progress){
    const p = progress || {};
    const data = await rpc('kinojo_runtime_progress', {
      p_session_id:String(sessionId || ''),
      p_session_token:String(sessionToken || ''),
      p_stage:p.stage || null,
      p_current_character:p.currentCharacter || p.characterName || null,
      p_message:p.message || null,
      p_progress_current:p.current === undefined ? null : Number(p.current),
      p_progress_total:p.total === undefined ? null : Number(p.total),
      p_payload:p.payload || {}
    });
    return data;
  }

  async function runtimeFinish(sessionId, sessionToken, status, message, summary){
    const data = await rpc('kinojo_runtime_finish', {
      p_session_id:String(sessionId || ''),
      p_session_token:String(sessionToken || ''),
      p_status:String(status || 'completed'),
      p_message:message || null,
      p_summary:summary || {}
    });
    return data;
  }


  async function getWebLegionRanking(extra={}){
    const data = await rpc('kinojo_web_get_legion_ranking', {
      p_page:Number(extra.page || 1),
      p_page_size:Number(extra.pageSize || extra.page_size || 20),
      p_include_subs:!!extra.includeSubs || !!extra.include_subs,
      p_class_name:String(extra.className || extra.class_name || '전체'),
      p_search:String(extra.search || '')
    });
    return Object.assign({ ok:true }, data || {});
  }

  async function runtimeForceRelease(adminPassCode, reason){
    const data = await rpc('kinojo_runtime_force_release', {
      p_admin_pass_code:normalizePassKey(adminPassCode || ''),
      p_reason:String(reason || 'admin_force_release')
    });
    return data;
  }

  async function webAction(action, params){
    const name = String(action || '').trim();
    const extra = params || {};
    if(name === 'hallOfFame') return getWebHallOfFame(extra.limit || 300, extra);
    if(name === 'hofSummary') return getWebHofSummary(extra);
    if(name === 'hallRankingView') return getWebHallRankingView(extra);
    if(name === 'legionRanking') return getWebLegionRanking(extra);
    if(name === 'ranking') return getWebRanking(extra.limit || 300);
    if(name === 'dashboard') return getWebDashboard();
    if(name === 'updaterStatus') return runtimeGetStatus();
    if(name === 'runtimeStatus') return runtimeGetStatus();
    if(name === 'runtimeStart') return runtimeStart(extra.passCode, extra);
    if(name === 'runtimeProgress') return runtimeProgress(extra.sessionId, extra.sessionToken, extra);
    if(name === 'runtimeFinish') return runtimeFinish(extra.sessionId, extra.sessionToken, extra.status, extra.message, extra.summary);
    if(name === 'runtimeForceRelease') return runtimeForceRelease(extra.adminPassCode || extra.passCode, extra.reason);
    if(name === 'hallReaction') return submitHallReaction(extra);
    if(name === 'hallSuggestion') return submitHallSuggestion(extra);
    if(name === 'sanctuary') return getSanctuaryData(extra.id || extra.sanctuaryId || 'rudra');
    if(name === 'sanctuaryAdmin') return saveSanctuaryData(extra);
    if(name === 'notices') return { ok:true, notices:(await getLatestAnnouncements(extra.limit || 5)).map(noticeFromRow).filter(Boolean) };
    if(name === 'hallVisit'){
      const mode = String(extra.mode || 'stats');
      const shouldLog = mode === 'visit' || Number(extra.boost || 0) > 0;
      return { ok:true, stats:await getVisitStatsFromServer(extra.pageKey || 'hall', shouldLog) };
    }
    return null;
  }

  async function adminUnsupported(feature){
    return { ok:false, message:feature + ' 기능은 Phase 2에서 Apps Script 호출을 차단했습니다. 서버 연산 테이블/RPC 이관 후 활성화됩니다.' };
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
      passCode: code,
      passKey: code,
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
        passCode: code,
        passKey: code,
        expiresAt: Date.now() + 5 * 60 * 1000
      },
      account: profile,
      profile
    };
  }

  window.KinojoSupabase = {
    version:'1.3.1.35-event-notice-popup-2026070412',
    getConfig,
    isPreferred,
    isConfigured,
    isConfiguredAsync,
    ensureReady,
    loadRemoteConfig,
    normalizePassKey,
    normalizeRole,
    roleFromLevel,
    roleToLevel,
    getRoleLabel,
    request,
    rpc,
    webAction,
    getWebHallOfFame,
    getWebRanking,
    getWebDashboard,
    getWebUpdaterStatus,
    runtimeGetStatus,
    runtimeStart,
    runtimeProgress,
    runtimeFinish,
    runtimeForceRelease,
    getHallReactionSummary,
    submitHallReaction,
    submitHallSuggestion,
    getSanctuaryData,
    saveSanctuaryData,
    logPageView,
    verifyPassKey,
    getLatestAnnouncements,
    getLockStatus,
    publicCodeRequest,
    adminAccount,
    lookupMainCharacter,
    normalizeMemberCode,
    isValidMemberCode,
    normalizePermissions,
    getWebEventNoticeGroups,
    adminNotice,
    adminEventNotice,
    adminCharacter,
    adminVisit,
    getVisitStats,
    adminUnsupported
  };
})();
