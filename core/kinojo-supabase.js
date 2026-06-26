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
    return getConfig().enabled;
  }

  async function ensureReady(){
    await loadRemoteConfig();
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
    if(!remoteConfig && !(window.KINOJO_SUPABASE_CONFIG && Object.keys(window.KINOJO_SUPABASE_CONFIG).length)){
      const err = new Error('Supabase config.json을 아직 읽지 못했습니다. 네트워크 또는 배포 경로를 확인해 주세요.');
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
    const account = typeof auth.getAccount === 'function' ? auth.getAccount() : readLocalJson('kinojo_login_account_v1');
    const session = typeof auth.getSession === 'function' ? auth.getSession() : readLocalJson('kinojo_login_session_v1');
    // 관리자 패널의 권한 판정은 account/session 중 어느 한쪽만 있어도 동일하게 인식해야 한다.
    // Supabase 이관 중 구버전 코드는 account만, 신버전 코드는 session만 참조하는 문제가 반복되어 여기서 단일 principal로 병합한다.
    return Object.assign({}, session || {}, account || {});
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
    const target = String(name || '').trim();
    if(!target) return { ok:false, message:'캐릭터 이름을 입력해 주세요.' };

    // Phase 2 초기 서버 이관: CHARACTER_MASTER가 Supabase에 없거나 권한이 없으면 입력값을 본캐 후보로 유지한다.
    // 이후 CHARACTER_MASTER 이관이 완료되면 이 함수가 서버 기준 본캐 판정으로 자동 강화된다.
    try{
      const query = [
        'select=character_name,main_character_name,is_main,class_name',
        'or=(character_name.eq.' + encodeURIComponent(target) + ',main_character_name.eq.' + encodeURIComponent(target) + ')',
        'limit=20'
      ].join('&');
      const rows = await request('character_master', { query });
      const list = Array.isArray(rows) ? rows : [];
      const exact = list.find(row => String(row.character_name || '').trim() === target) || list[0];
      if(exact){
        const main = String(exact.main_character_name || exact.character_name || target).trim();
        const isMain = exact.is_main === true || String(exact.is_main).toUpperCase() === 'TRUE' || main === String(exact.character_name || '').trim();
        if(!isMain) return { ok:false, message:'메인 캐릭터만 코드 발급이 가능합니다.', character:{ characterName:target, mainCharacter:main, className:exact.class_name || '' } };
        return { ok:true, character:{ characterName:String(exact.character_name || main), mainCharacter:main, className:exact.class_name || '', role:'MEMBER' } };
      }
    }catch(_err){
      // CHARACTER_MASTER 서버 이관 전에는 회원관리 이관을 막지 않는다.
    }

    return { ok:true, character:{ characterName:target, mainCharacter:target, className:'클래스 미확인', role:'MEMBER' }, pendingCharacterMaster:true };
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

      const pendingQuery = [
        'select=id,request_id,character_name,requested_code,status',
        'status=eq.PENDING',
        'or=(character_name.eq.' + encodeURIComponent(lookup.character.mainCharacter) + ',requested_code.eq.' + encodeURIComponent(requestedCode) + ')',
        'limit=1'
      ].join('&');
      const pending = await request('code_requests', { query:pendingQuery });
      if(Array.isArray(pending) && pending.length){
        const row = pending[0];
        if(row.character_name === lookup.character.mainCharacter) return { ok:false, message:'이미 처리 대기 중인 코드 요청이 있습니다.' };
        return { ok:false, message:'이미 다른 요청에 사용된 코드입니다. 다른 코드로 요청해 주세요.' };
      }

      const body = {
        request_id: makeRequestId(),
        character_name: lookup.character.mainCharacter,
        requested_code: requestedCode,
        class_name: lookup.character.className || '',
        status: 'PENDING',
        version: String(extra.version || ''),
        url: String(extra.url || location.href || '')
      };
      const rows = await request('code_requests', { method:'POST', headers:{ Prefer:'return=representation' }, body });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return { ok:true, message:'회원 코드 요청이 접수되었습니다.', request:{ requestId:row.request_id, characterName:row.character_name, requestedCode:row.requested_code, status:row.status, requestedAt:row.created_at } };
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
      const rows = await request('code_requests', { query:'select=*&status=eq.PENDING&order=created_at.asc' });
      const requests = (Array.isArray(rows) ? rows : []).map(row => ({
        id: row.id,
        requestId: row.request_id,
        time: row.created_at,
        characterName: row.character_name,
        requestedCode: row.requested_code,
        status: row.status,
        className: row.class_name || ''
      }));
      return { ok:true, requests };
    }

    if(normalizedCommand === 'approveCodeRequest'){
      const requestId = String(extra.requestId || '').trim();
      if(!requestId) return { ok:false, message:'처리할 코드 요청을 찾지 못했습니다.' };
      const rows = await request('code_requests', { query:'select=*&request_id=eq.' + encodeURIComponent(requestId) + '&limit=1' });
      const req = Array.isArray(rows) ? rows[0] : null;
      if(!req) return { ok:false, message:'코드 요청을 찾지 못했습니다.' };
      if(req.status !== 'PENDING') return { ok:false, message:'이미 처리된 요청입니다.' };
      const created = await adminAccount('createCode', { mainCharacter:req.character_name, code:req.requested_code, permissions:'' });
      if(!created.ok) return created;
      await request('code_requests', {
        method:'PATCH',
        query:'request_id=eq.' + encodeURIComponent(requestId),
        headers:{ Prefer:'return=representation' },
        body:{ status:'APPROVED', processed_at:new Date().toISOString(), processed_by:admin.account.mainCharacter || admin.role }
      });
      return { ok:true, message:'회원 코드가 등록되었습니다.', requestId, account:created.account, request:{ characterName:req.character_name, requestedCode:req.requested_code, status:'APPROVED' } };
    }

    if(normalizedCommand === 'rejectCodeRequest'){
      const requestId = String(extra.requestId || '').trim();
      if(!requestId) return { ok:false, message:'처리할 코드 요청을 찾지 못했습니다.' };
      const rows = await request('code_requests', { query:'select=*&request_id=eq.' + encodeURIComponent(requestId) + '&limit=1' });
      const req = Array.isArray(rows) ? rows[0] : null;
      if(!req) return { ok:false, message:'코드 요청을 찾지 못했습니다.' };
      if(req.status !== 'PENDING') return { ok:false, message:'이미 처리된 요청입니다.' };
      await request('code_requests', {
        method:'PATCH',
        query:'request_id=eq.' + encodeURIComponent(requestId),
        headers:{ Prefer:'return=representation' },
        body:{ status:'REJECTED', processed_at:new Date().toISOString(), processed_by:admin.account.mainCharacter || admin.role }
      });
      return { ok:true, message:'코드 요청을 거절했습니다.', requestId, request:{ characterName:req.character_name, requestedCode:req.requested_code, status:'REJECTED' } };
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

  async function adminNotice(command, extra={}){
    const admin = assertAdmin();
    const normalizedCommand = String(command || '').trim();
    if(normalizedCommand !== 'createNotice') return { ok:false, message:'알 수 없는 공지 관리자 명령입니다.' };
    const content = String(extra.content || '').trim();
    if(!content) return { ok:false, message:'공지 내용을 입력해 주세요.' };
    const noticeType = normalizeNoticeType(extra.noticeType || extra.notice);
    const body = {
      notice_type: noticeType,
      notice: noticeType,
      author: noticeAuthorLabel(admin.account),
      content: content.slice(0, 500),
      is_active: true,
      priority: 0,
      created_by: admin.account.mainCharacter || admin.role
    };
    const rows = await request('announcements', { method:'POST', headers:{ Prefer:'return=representation' }, body });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { ok:true, notice:{ createdAt:row.created_at, noticeType:row.notice_type || noticeType, author:row.author || body.author, content:row.content || content } };
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
    version:'1.3.1.15-web-admin-config-ready-2026062608',
    getConfig,
    isPreferred,
    isConfigured,
    ensureReady,
    loadRemoteConfig,
    normalizePassKey,
    normalizeRole,
    roleFromLevel,
    roleToLevel,
    getRoleLabel,
    request,
    verifyPassKey,
    getLatestAnnouncements,
    getLockStatus,
    publicCodeRequest,
    adminAccount,
    lookupMainCharacter,
    normalizeMemberCode,
    isValidMemberCode,
    normalizePermissions,
    adminNotice,
    adminVisit,
    getVisitStats,
    adminUnsupported
  };
})();
