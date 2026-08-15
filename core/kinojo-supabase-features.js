/*
 * KINOJO Supabase Feature Bridge
 * Role: GitHub Pages에서 Supabase REST API를 공통으로 사용하기 위한 연결 파일.
 * 주의: publishable key만 사용. service_role/secret key/DB password 금지.
 */
(function(){
  'use strict';

  // config.json을 읽기 전에는 임의 placeholder를 사용하지 않는다.
  // Supabase 기능은 ensureConfig()/ensureReady()를 통해 원격 설정 로딩 후에만 실행한다.
  const clientCore=window.KinojoSupabaseClientCore;
  const rpcCore=window.KinojoSupabaseRpcCore;
  if(!clientCore||!rpcCore) throw new Error('KINOJO Supabase core modules load order error');
  const {normalizePassKey,normalizeRole,roleFromLevel,roleToLevel,getRoleLabel,getConfig,isPreferred,isConfigured,isConfiguredAsync,ensureReady,loadRemoteConfig,ensureConfig,headers,buildUrl,request,invokeEdgeFunction}=clientCore;
  const {buildRpcUrl,rpc}=rpcCore;



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

  function assertScheduleManager(){
    const account = currentAccount();
    const role = normalizeRole(account && account.role, account && account.level);
    const level = Number(account && account.level || roleToLevel(role, 0));
    if(!account || level < 2){
      const err = new Error('성역 일정 관리 권한이 필요합니다.');
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
    const memberId = row.memberId ?? row.member_id ?? row.id ?? null;
    const rawCode = row.code ?? row.passCode ?? row.pass_code ?? '';
    const codeDisplay = row.codeDisplay ?? row.code_display ?? rawCode;
    const codeMasked = row.codeMasked === true || row.code_masked === true;
    const active = (row.isActive ?? row.is_active ?? row.active) !== false;
    return {
      id: memberId,
      memberId,
      code: String(rawCode || ''),
      codeDisplay: String(codeDisplay || ''),
      codeMasked,
      mainCharacter: row.mainCharacter || row.main_character_name || '',
      mainCharacterName: row.mainCharacterName || row.main_character_name || '',
      level,
      role,
      roleLabel: row.roleLabel || row.role_label || roleLabelFor(role, level),
      permissions: permissionsToText(perms),
      active,
      isActive: active,
      canEdit: row.canEdit === true || row.can_edit === true,
      isSelf: row.isSelf === true || row.is_self === true,
      allowedRoles: Array.isArray(row.allowedRoles) ? row.allowedRoles : (Array.isArray(row.allowed_roles) ? row.allowed_roles : []),
      createdAt: row.createdAt || row.created_at || '',
      updatedAt: row.updatedAt || row.updated_at || '',
      memo: row.memo || ''
    };
  }

  async function findMemberByCode(code){
    const normalized = normalizeMemberCode(code);
    if(!normalized) return null;
    const data = await rpc('kinojo_member_code_exists_264', { p_code:normalized });
    return data?.exists === true ? { exists:true } : null;
  }

  async function findMemberByMainCharacter(name){
    const target = String(name || '').trim();
    if(!target) return null;
    const data = await rpc('kinojo_member_main_character_exists_264', { p_main_character_name:target });
    return data?.exists === true ? { exists:true } : null;
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
      const permissions = normalizePermissions(extra.permissions);
      const data = await rpc('kinojo_admin_member_create_264', {
        p_pass_key:currentPassKey(),
        p_main_character_name:lookup.character.mainCharacter,
        p_member_code:code,
        p_permissions:permissions
      });
      return { ok:true, message:'회원 코드가 생성되었습니다.', account:accountFromRow(data?.member) };
    }

    if(normalizedCommand === 'listCodes'){
      const data = await rpc('kinojo_admin_member_list_264', { p_pass_key:currentPassKey() });
      const source = Array.isArray(data?.accounts) ? data.accounts : [];
      return {
        ok:true,
        accounts:source.map(accountFromRow).filter(Boolean),
        codeVisibility:String(data?.codeVisibility || data?.code_visibility || 'VISIBLE').toUpperCase(),
        actor:data?.actor || null
      };
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
      const memberId = Number(extra.memberId || extra.member_id || 0);
      if(!Number.isInteger(memberId) || memberId <= 0) return { ok:false, message:'변경할 회원을 찾지 못했습니다.' };
      const data = await rpc('kinojo_admin_member_manage_264', {
        p_pass_key:currentPassKey(), p_target_member_id:memberId, p_action:'update_role',
        p_payload:{ role:normalizeRole(extra.role,1) }
      });
      return { ok:true, message:'등급이 수정되었습니다.', memberId, account:accountFromRow(data?.member) };
    }

    if(normalizedCommand === 'updatePermissions'){
      const memberId = Number(extra.memberId || extra.member_id || 0);
      if(!Number.isInteger(memberId) || memberId <= 0) return { ok:false, message:'변경할 회원을 찾지 못했습니다.' };
      const data = await rpc('kinojo_admin_member_manage_264', {
        p_pass_key:currentPassKey(), p_target_member_id:memberId, p_action:'update_permissions',
        p_payload:{ permissions:normalizePermissions(extra.permissions) }
      });
      return { ok:true, message:'권한이 수정되었습니다.', memberId, account:accountFromRow(data?.member) };
    }

    if(normalizedCommand === 'deleteCode' || normalizedCommand === 'disableCode'){
      const memberId = Number(extra.memberId || extra.member_id || 0);
      if(!Number.isInteger(memberId) || memberId <= 0) return { ok:false, message:'변경할 회원을 찾지 못했습니다.' };
      await rpc('kinojo_admin_member_manage_264', {
        p_pass_key:currentPassKey(), p_target_member_id:memberId,
        p_action:normalizedCommand === 'deleteCode' ? 'delete' : 'disable', p_payload:{}
      });
      return { ok:true, message:normalizedCommand === 'deleteCode' ? '회원 코드가 삭제되었습니다.' : '회원 코드가 비활성화되었습니다.', memberId };
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
      characterId: Number(row.character_id || row.characterId || row.id || 0),
      characterName: row.character_name || row.characterName || '',
      mainCharacterName: row.main_character_name || row.mainCharacterName || '',
      serverId: row.server_id || row.serverId || '',
      serverName: row.server_name || row.serverName || getServerNameByServerId(row.server_id || row.serverId || ''),
      className: row.class_name || row.className || '',
      profileImageUrl: row.profile_image_url || row.profileImageUrl || '',
      identityBadge: row.identity_badge || row.identityBadge || null,
      isMain: row.is_main === true || row.isMain === true,
      isActive: row.is_active !== false && row.isActive !== false,
      siteVisible: row.site_visible !== false && row.siteVisible !== false,
      lookupExcluded: row.lookup_excluded === true || row.lookupExcluded === true,
      visibilityExcluded: row.visibility_excluded === true || row.visibilityExcluded === true,
      exclusionMode: row.exclusion_mode || row.exclusionMode || 'NORMAL',
      exclusionReason: row.exclusion_reason || row.exclusionReason || '',
      exclusionMemo: row.exclusion_memo || row.exclusionMemo || '',
      lookupExcludedAt: row.lookup_excluded_at || row.lookupExcludedAt || '',
      visibilityExcludedAt: row.visibility_excluded_at || row.visibilityExcludedAt || '',
      exclusionReviewRequired: row.exclusion_review_required === true || row.exclusionReviewRequired === true,
      inactiveReason: row.inactive_reason || row.inactiveReason || '',
      inactiveMemo: row.inactive_memo || row.inactiveMemo || '',
      inactivatedAt: row.inactivated_at || row.inactivatedAt || '',
      restoredAt: row.restored_at || row.restoredAt || '',
      previousName: row.previous_name || row.previousName || '',
      renamedTo: row.renamed_to || row.renamedTo || '',
      pvePower: Number(row.latest_pve_combat_power || row.latestPveCombatPower || 0),
      pvpPower: Number(row.latest_pvp_combat_power || row.latestPvpCombatPower || 0),
      lastSyncedAt: row.last_synced_at || row.lastSyncedAt || '',
      status: row.status || '',
      errorMessage: row.error_message || row.errorMessage || '',
      listRow: Number(row.list_row || row.listRow || 0),
      hasPersistentKey: row.has_persistent_key === true || row.hasPersistentKey === true,
      charKeyMasked: row.char_key_masked || row.charKeyMasked || '',
      lookupFailureCount: Number(row.lookup_failure_streak || row.lookupFailureStreak || row.lookup_failure_count || row.lookupFailureCount || 0),
      lookupFailureStreak: Number(row.lookup_failure_streak || row.lookupFailureStreak || 0),
      lookupFailureTotal: Number(row.lookup_failure_total || row.lookupFailureTotal || row.lookup_failure_count || row.lookupFailureCount || 0),
      lastLookupFailureCode: row.last_lookup_failure_code || row.lastLookupFailureCode || '',
      lastLookupFailedAt: row.last_lookup_failed_at || row.lastLookupFailedAt || '',
      lastLookupSuccessAt: row.last_lookup_success_at || row.lastLookupSuccessAt || ''
    };
  }

  async function adminCharacter(command, extra={}){
    assertAdmin();
    const normalizedCommand = String(command || '').trim();
    if(normalizedCommand === 'search'){
      const [data,reviews,badgeMap] = await Promise.all([
        rpc('kinojo_admin_character_search', {
          p_pass_key: currentPassKey(),
          p_search: String(extra.search || extra.characterName || ''),
          p_include_inactive: extra.includeInactive !== false,
          p_limit: Number(extra.limit || 300)
        }),
        rpc('kinojo_admin_identity_reviews_v287', {
          p_pass_key:currentPassKey(),
          p_status:'pending'
        }).catch(()=>({ok:false,items:[]})),
        getIdentityBadges().catch(()=>new Map())
      ]);
      const rows = data && (data.characters || data.items || []);
      const reviewMap=new Map((Array.isArray(reviews?.items)?reviews.items:[]).map(item=>[Number(item.characterId||0),item]));
      decorateIdentityBadges(rows,badgeMap);
      return {
        ok:data && data.ok !== false,
        message:data && data.message || '',
        databaseContract:data && data.databaseContract || '',
        summary:Object.assign({},data && data.summary || {},{identityReviewCount:reviewMap.size}),
        identityRecoveryAllowed:data && data.identityRecoveryAllowed === true,
        characters:(Array.isArray(rows)?rows:[]).map(normalizeAdminCharacterRow).filter(Boolean).map(item=>Object.assign(item,{identityReview:reviewMap.get(Number(item.characterId||0))||null}))
      };
    }
    if(normalizedCommand === 'updateExclusion'){
      const data = await rpc('kinojo_admin_character_exclusion_update_v278', {
        p_pass_key: currentPassKey(),
        p_character_id: Number(extra.characterId || 0),
        p_lookup_excluded: extra.lookupExcluded === true,
        p_visibility_excluded: extra.visibilityExcluded === true,
        p_reason: String(extra.reason || ''),
        p_memo: String(extra.memo || '')
      });
      return data || { ok:false, message:'처리 결과를 확인하지 못했습니다.' };
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
    if(normalizedCommand === 'identityProbe'){
      return invokeEdgeFunction('character-identity-recovery', {
        action:'adminProbe',
        passKey:currentPassKey(),
        characterId:Number(extra.characterId || 0),
        clientVersion:'WEB-2026072502'
      });
    }
    if(normalizedCommand === 'identityApply'){
      return invokeEdgeFunction('character-identity-recovery', {
        action:'adminApply',
        passKey:currentPassKey(),
        characterId:Number(extra.characterId || 0),
        clientVersion:'WEB-2026072502'
      });
    }
    if(normalizedCommand === 'identityReviewApprove' || normalizedCommand === 'identityReviewReject'){
      return invokeEdgeFunction('character-identity-recovery', {
        action:normalizedCommand === 'identityReviewApprove' ? 'reviewApprove' : 'reviewReject',
        passKey:currentPassKey(),
        reviewId:Number(extra.reviewId || 0),
        memo:String(extra.memo || ''),
        clientVersion:'WEB-2026073101'
      });
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

  async function adminMeter(command, extra={}){
    const admin = assertAdmin();
    if(Number(admin.level || 0) < 5 || String(admin.role || '').toUpperCase() !== 'MASTER'){
      return { ok:false, message:'키노조 미터 운영 설정은 MASTER만 관리할 수 있습니다.' };
    }
    const actions = {
      console:'adminMeterConsole',
      saveOperation:'adminMeterOperationSave',
      saveStatistics:'adminMeterStatisticsSave',
      saveLaunch:'adminMeterLaunchSave',
      saveNotice:'adminMeterNoticeSave',
      deleteNotice:'adminMeterNoticeDelete',
      logs:'adminMeterDungeonLogs'
    };
    const action = actions[String(command || '').trim()];
    if(!action) return { ok:false, message:'알 수 없는 키노조 미터 관리자 명령입니다.' };
    return invokeEdgeFunction('meter-admin-control', Object.assign({
      action,
      passKey:currentPassKey(),
      channel:String(extra.channel || 'stable')
    }, extra || {}));
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




  function snakeOrCamel(row, snake, camel, fallback){
    if(row && row[camel] !== undefined && row[camel] !== null) return row[camel];
    if(row && row[snake] !== undefined && row[snake] !== null) return row[snake];
    return fallback;
  }

  let identityBadgesPromise = null;
  function identityBadgeKey(name, serverId){
    return String(serverId || '').trim()+'|'+String(name || '').normalize('NFKC').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
  }
  async function getIdentityBadges(){
    if(!identityBadgesPromise){
      identityBadgesPromise=rpc('kinojo_web_identity_badges_v287',{}).then(data=>{
        const map=new Map();
        (Array.isArray(data?.items)?data.items:[]).forEach(item=>{
          map.set(identityBadgeKey(item.characterName||item.character_name,item.serverId||item.server_id),item);
        });
        return map;
      }).catch(error=>{identityBadgesPromise=null;throw error;});
    }
    return identityBadgesPromise;
  }
  function decorateIdentityBadges(value,badgeMap,depth=0){
    if(depth>10||value===null||value===undefined)return value;
    if(Array.isArray(value)){value.forEach(item=>decorateIdentityBadges(item,badgeMap,depth+1));return value;}
    if(typeof value!=='object')return value;
    const name=value.characterName||value.character_name||value.name||'';
    const serverId=value.serverId||value.server_id||'';
    if(name&&serverId&&!value.identityBadge&&!value.identity_badge){
      const badge=badgeMap.get(identityBadgeKey(name,serverId));
      if(badge){value.identityBadge=badge;value.identity_badge=badge;}
    }
    Object.values(value).forEach(item=>decorateIdentityBadges(item,badgeMap,depth+1));
    return value;
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
      identityBadge:snakeOrCamel(row, 'identity_badge', 'identityBadge', null),
      isMain:(() => { const raw=snakeOrCamel(row, 'is_main', 'isMain', null); if(raw===true || String(raw).toLowerCase()==='true') return true; if(raw===false || String(raw).toLowerCase()==='false') return false; return null; })(),
      raw:row
    };
  }

  async function getWebRanking(limit){
    return rpc('kinojo_web_get_ranking', { p_limit:Number(limit || 300) });
  }

  async function getWebHallOfFame(limit, extra={}){
    return getWebHofSummary(Object.assign({}, extra || {}, { limit:Number(limit || 300) }));
  }

  async function getWebHallRankingView(extra={}){
    const [data,badgeMap] = await Promise.all([
      rpc('kinojo_web_get_hall_ranking_view', {
        p_limit:Number(extra.limit || 300),
        p_page:Number(extra.page || 1),
        p_page_size:Number(extra.pageSize || extra.page_size || 10),
        p_include_subs:!!extra.includeSubs || !!extra.include_subs,
        p_class_name:String(extra.className || extra.class_name || '전체'),
        p_search:String(extra.search || ''),
        p_rank_mode:String(extra.rankMode || extra.rank_mode || 'PVE').toUpperCase()==='PVP'?'PVP':'PVE'
      }),
      getIdentityBadges().catch(()=>new Map())
    ]);
    decorateIdentityBadges(data,badgeMap);
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
    const [data,badgeMap] = await Promise.all([
      rpc('kinojo_web_get_hof_summary', {
        p_include_subs:!!extra.includeSubs || !!extra.include_subs,
        p_pass_key:String(extra.passKey || extra.pass_key || '').trim() || null
      }),
      getIdentityBadges().catch(()=>new Map())
    ]);
    decorateIdentityBadges(data,badgeMap);
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
    const rawMyRanking = data && data.myRanking && typeof data.myRanking === 'object' ? data.myRanking : {};
    const rawRankingPeriod = data && (data.rankingPeriod || data.ranking_period || data.weeklyPeriod || data.weekly_period) || {};
    const rankingPeriod = {
      startAt:rawRankingPeriod.startAt || rawRankingPeriod.start_at || '',
      endAt:rawRankingPeriod.endAt || rawRankingPeriod.end_at || '',
      timezone:rawRankingPeriod.timezone || 'Asia/Seoul',
      endExclusive:rawRankingPeriod.endExclusive !== undefined ? !!rawRankingPeriod.endExclusive : !!rawRankingPeriod.end_exclusive
    };
    const myRanking = {};
    ['enhance','pve','pvp','like','dislike','growth'].forEach(metric=>{
      const row = rawMyRanking[metric];
      if(!row || typeof row !== 'object' || !Number(row.rank_no || row.rankNo || 0)) return;
      const item = hallItemFromRow(row, Number(row.rank_no || row.rankNo || 0));
      const score = Number(row.score || 0);
      let scoreLabel = numberLabel(score);
      if(metric === 'growth' || metric === 'enhance') scoreLabel = (score > 0 ? '+' : '') + numberLabel(score);
      myRanking[metric] = { item, rank:Number(row.rank_no || row.rankNo || 0), score:scoreLabel || '-' };
    });
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
      updatedAt:data?.updatedAt || data?.updated_at || '',
      includeSubs:!!(data?.includeSubs || data?.include_subs || extra.includeSubs),
      pveTop,
      pvpTop,
      overallMain:allSummaryItems,
      overallAll:allSummaryItems,
      reactionSummary:{ likeTop:likesTop, dislikeTop:dislikesTop, byName },
      weeklyAwards:{ growthKing:growthGod?[growthGod]:[], bulkUp:enhanceGod?[enhanceGod]:[] },
      summarySections:{ likesTop, dislikesTop, pveTop, pvpTop, growthGod, enhanceGod },
      myRanking,
      rankingPeriod,
      mvp:null,
      mvpCandidatesTop3:[],
      mvpConfirmed:false,
      newChicks:[],
      demonFamily:[],
      demonFamilyAll:[],
      partyFriend:[],
      partyFriendAll:[]
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

  function currentPageKey(){
    const path=String(location.pathname||'').toLowerCase();
    if(path.includes('/sanctuary-schedule/'))return 'sanctuary-schedule';
    if(path.includes('/sanctuary/'))return 'sanctuary';
    if(path.includes('/admin/'))return 'admin';
    if(path.includes('/hof/')||path.includes('/hall-of-fame/'))return 'hall';
    if(path.includes('/ranking/'))return 'ranking';
    if(path.includes('/meter/'))return 'meter';
    if(path.includes('/arcana/'))return 'arcana';
    if(path.includes('/pages/'))return 'pages';
    return 'home';
  }
  function optionalPassKey(){
    try{return currentPassKey();}catch(_err){return '';}
  }

  async function logPageView(pageKey, payload){
    const body=Object.assign({},payload||{});
    const passKey=optionalPassKey();
    if(passKey)body.authPassKey=passKey;
    body.eventType=body.eventType||'PAGE_VIEW';
    return rpc('kinojo_log_page_view', {
      p_page_key:String(pageKey || currentPageKey()),
      p_page_url:String(location.href || ''),
      p_visitor_key:getVisitorKey(),
      p_referrer:String(document.referrer || ''),
      p_user_agent:String(navigator.userAgent || ''),
      p_source_type:'WEB',
      p_payload:body
    });
  }
  async function logLoginVisit(pageKey){
    return logPageView(pageKey||currentPageKey(),{eventType:'LOGIN'});
  }

  const VISIT_SUMMARY_CACHE_KEY = 'kinojo_visit_summary_server_v266';
  function readVisitSummaryCache(){
    try{
      const cached=JSON.parse(sessionStorage.getItem(VISIT_SUMMARY_CACHE_KEY)||'null');
      return cached && cached.stats ? cached.stats : null;
    }catch(_err){return null;}
  }
  function writeVisitSummaryCache(stats){
    try{sessionStorage.setItem(VISIT_SUMMARY_CACHE_KEY,JSON.stringify({savedAt:Date.now(),stats}));}catch(_err){}
    return stats;
  }

  async function getVisitStatsFromServer(pageKey, shouldLog){
    if(shouldLog) logPageView(pageKey || currentPageKey(), {eventType:'PAGE_VIEW'}).catch(()=>{});
    try{
      const data=await rpc('kinojo_public_visit_summary_266',{});
      return writeVisitSummaryCache(data?.stats||emptyVisitStats(todayVisitKey()));
    }catch(_err){
      return readVisitSummaryCache()||emptyVisitStats(todayVisitKey());
    }
  }

  async function getHallReactionSummary(){
    const data=await getWebHofSummary({includeSubs:false});
    return data.reactionSummary||{byName:{},likeTop:[],dislikeTop:[]};
  }

  async function submitHallReaction(extra={}){
    const characterName = stripServerSuffixFromCharacterName(extra.characterName || extra.character_name || '');
    const reaction = String(extra.reaction || '').trim().toLowerCase();
    const comment = String(extra.comment || '').trim().slice(0, 20);
    if(!characterName) return { ok:false, message:'캐릭터 이름이 없습니다.' };
    if(!['like','dislike'].includes(reaction)) return { ok:false, message:'반응 종류가 올바르지 않습니다.' };
    if(!comment) return { ok:false, message:'전하고 싶은 말을 입력해 주세요.' };
    const serverId=Number(extra.serverId || extra.server_id || 0);
    return rpc('kinojo_web_submit_hall_reaction_v279',{
      p_pass_key:currentPassKey(),
      p_character_name:characterName,
      p_server_id:Number.isFinite(serverId)&&serverId>0?serverId:null,
      p_reaction:reaction,
      p_comment:comment,
      p_client_key:String(extra.clientKey || extra.client_key || getVisitorKey()).trim(),
      p_source:String(extra.source || 'WEB').trim() || 'WEB'
    });
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

  async function getSanctuaryMaster(){
    return rpc('kinojo_web_get_sanctuary_master', {});
  }

  function decorateSanctuaryWaitlist(data){
    if(!data || data.ok === false) return data;
    data.waiting = (Array.isArray(data.waiting) ? data.waiting : []).map(item => Object.assign({}, item, {
      serverName:String(item?.serverName || getServerNameByServerId(item?.serverId || '') || '').trim()
    }));
    return data;
  }

  async function getSanctuaryRosterData(id){
    const auth = window.KinojoAuth || {};
    const session = typeof auth.getSession === 'function' ? auth.getSession() : null;
    const account = typeof auth.getAccount === 'function' ? auth.getAccount() : null;
    const passKey = String(account?.passKey || account?.passCode || session?.passKey || session?.passCode || '').trim();
    const [data,badgeMap]=await Promise.all([
      rpc('kinojo_web_get_sanctuary_v317', { p_sanctuary_code:String(id || '') || null, p_pass_key:passKey || null }),
      getIdentityBadges().catch(()=>new Map())
    ]);
    return decorateIdentityBadges(data,badgeMap);
  }

  async function getSanctuaryWaitlistData(id){
    return decorateSanctuaryWaitlist(await rpc('kinojo_web_get_sanctuary_waitlist_v315', { p_sanctuary_code:String(id || '') || null }));
  }

  async function getSanctuaryData(id){
    const [data,waitlist]=await Promise.all([getSanctuaryRosterData(id),getSanctuaryWaitlistData(id)]);
    if(waitlist?.ok!==false){
      data.waiting=Array.isArray(waitlist?.waiting)?waitlist.waiting:[];
      data.waitlist=waitlist;
      data.summary=Object.assign({},data.summary||{},{waitingCount:Number(waitlist?.waitingCount||0)});
    }
    return data;
  }

  async function getSanctuaryWaitlistRecommendations(extra={}){
    const characterMasterId=Number(extra.characterMasterId||extra.character_master_id||0);
    if(!Number.isFinite(characterMasterId)||characterMasterId<=0)return {ok:false,message:'대기자 캐릭터를 다시 선택해 주세요.'};
    return rpc('kinojo_web_get_sanctuary_waitlist_recommendations_v318',{
      p_character_master_id:characterMasterId,
      p_sanctuary_code:String(extra.id||extra.sanctuaryId||extra.sanctuaryCode||'').trim()
    });
  }

  async function getSanctuaryWaitlistSlotDetail(extra={}){
    const characterMasterId=Number(extra.characterMasterId||extra.character_master_id||0);
    const teamNo=Number(extra.teamNo||extra.team_no||0);
    if(!Number.isFinite(characterMasterId)||characterMasterId<=0||!Number.isFinite(teamNo)||teamNo<=0)return {ok:false,message:'캐릭터와 포스를 다시 선택해 주세요.'};
    let passKey='';try{passKey=currentPassKey();}catch(_err){}
    return rpc('kinojo_sanctuary_waitlist_slot_detail_v318',{
      p_character_master_id:characterMasterId,
      p_sanctuary_code:String(extra.id||extra.sanctuaryId||extra.sanctuaryCode||'').trim(),
      p_team_no:teamNo,
      p_pass_key:passKey||null
    });
  }

  async function submitSanctuarySupportRequest(extra={}){
    return rpc('kinojo_sanctuary_support_request_submit_v318',{
      p_pass_key:currentPassKey(),
      p_character_master_id:Number(extra.characterMasterId||extra.character_master_id||0),
      p_sanctuary_code:String(extra.id||extra.sanctuaryId||extra.sanctuaryCode||'').trim(),
      p_team_no:Number(extra.teamNo||extra.team_no||0),
      p_party_no:Number(extra.partyNo||extra.party_no||0),
      p_slot_no:Number(extra.slotNo||extra.slot_no||0),
      p_request_key:String(extra.requestKey||extra.request_key||'').trim()
    });
  }

  async function getSanctuaryRequestConsole(extra={}){
    return rpc('kinojo_sanctuary_request_console_v316',{
      p_pass_key:currentPassKey(),
      p_status:String(extra.status||'PENDING').trim().toUpperCase(),
      p_limit:Math.min(200,Math.max(1,Number(extra.limit||100)))
    });
  }

  async function rejectSanctuarySupportRequest(extra={}){
    return rpc('kinojo_sanctuary_support_request_reject_v316',{
      p_pass_key:currentPassKey(),
      p_request_id:Number(extra.requestId||extra.request_id||0),
      p_reason:String(extra.reason||'').trim()||null
    });
  }

  async function getNotificationSummary(){
    let passKey='';try{passKey=currentPassKey();}catch(_err){return {ok:false,totalCount:0};}
    return rpc('kinojo_web_notification_summary_v316',{p_pass_key:passKey});
  }

  async function getSanctuaryOperationOverview(extra={}){
    const params = {
      p_sanctuary_code:String(extra.id || extra.sanctuaryId || extra.sanctuaryCode || '') || null,
      p_pass_key:normalizePassKey(extra.passKey || extra.passCode || '') || null
    };
    if(extra.now) params.p_now = extra.now;
    return rpc('kinojo_web_get_sanctuary_operation_overview_member_251', params);
  }

  function normalizeSanctuaryScheduleScope(value){
    return String(value || 'mine').trim().toLowerCase() === 'all' ? 'all' : 'mine';
  }

  async function getSanctuaryScheduleCalendar(extra={}){
    return rpc('kinojo_web_get_sanctuary_schedule_calendar_262', {
      p_view:String(extra.view || 'month').toLowerCase() === 'week' ? 'week' : 'month',
      p_anchor:String(extra.anchor || '').trim() || null,
      p_sanctuary_code:String(extra.id || extra.sanctuaryId || extra.sanctuaryCode || '').trim() || null,
      p_pass_key:normalizePassKey(extra.passKey || extra.passCode || '') || null,
      p_scope:normalizeSanctuaryScheduleScope(extra.scope || extra.teamScope || extra.team_scope)
    });
  }

  async function getSanctuaryScheduleDay(extra={}){
    const scheduleId = Number(extra.scheduleId || extra.schedule_id || 0);
    return rpc('kinojo_web_get_sanctuary_schedule_day_262', {
      p_sanctuary_code:String(extra.id || extra.sanctuaryId || extra.sanctuaryCode || '').trim() || null,
      p_target_date:String(extra.targetDate || extra.target_date || '').trim() || null,
      p_pass_key:normalizePassKey(extra.passKey || extra.passCode || '') || null,
      p_schedule_id:Number.isFinite(scheduleId) && scheduleId > 0 ? scheduleId : null,
      p_scope:normalizeSanctuaryScheduleScope(extra.scope || extra.teamScope || extra.team_scope)
    });
  }

  async function saveSanctuaryAvailability(extra={}){
    const scheduleId = Number(extra.scheduleId || extra.schedule_id || 0);
    return rpc('kinojo_sanctuary_save_availability', {
      p_pass_key:normalizePassKey(extra.passKey || extra.passCode || ''),
      p_sanctuary_code:String(extra.id || extra.sanctuaryId || extra.sanctuaryCode || '').trim() || null,
      p_target_date:String(extra.targetDate || extra.target_date || '').trim() || null,
      p_response_status:String(extra.status || extra.responseStatus || extra.response_status || 'unknown').trim().toLowerCase(),
      p_time_text:String(extra.timeText || extra.time_text || '').trim() || null,
      p_note:String(extra.note || '').trim() || null,
      p_schedule_id:Number.isFinite(scheduleId) && scheduleId > 0 ? scheduleId : null
    });
  }

  async function getMySanctuaryTopbar(extra={}){
    return rpc('kinojo_web_get_my_sanctuary_topbar', {
      p_pass_key:normalizePassKey(extra.passKey || extra.passCode || ''),
      p_now:String(extra.now || new Date().toISOString())
    });
  }

  async function getAdminSanctuaryScheduleConsole(extra={}){
    assertScheduleManager();
    return rpc('kinojo_admin_sanctuary_schedule_console', {
      p_pass_key:currentPassKey(),
      p_from:String(extra.from || extra.dateFrom || '').trim() || null,
      p_to:String(extra.to || extra.dateTo || '').trim() || null,
      p_sanctuary_code:String(extra.sanctuaryCode || extra.id || '').trim().toLowerCase() || null
    });
  }

  async function saveAdminSanctuarySchedule(extra={}){
    assertScheduleManager();
    const scheduleId = Number(extra.scheduleId || extra.schedule_id || 0);
    return rpc('kinojo_admin_sanctuary_schedule_save', {
      p_pass_key:currentPassKey(),
      p_schedule_id:Number.isFinite(scheduleId) && scheduleId > 0 ? scheduleId : null,
      p_payload:extra.payload && typeof extra.payload === 'object' ? extra.payload : extra
    });
  }

  async function setAdminSanctuaryScheduleStatus(extra={}){
    assertScheduleManager();
    const scheduleId = Number(extra.scheduleId || extra.schedule_id || 0);
    if(!Number.isFinite(scheduleId) || scheduleId <= 0) throw new Error('변경할 성역 일정을 찾지 못했습니다.');
    return rpc('kinojo_admin_sanctuary_schedule_set_status', {
      p_pass_key:currentPassKey(),
      p_schedule_id:scheduleId,
      p_status:String(extra.status || '').trim().toLowerCase(),
      p_reason:String(extra.reason || '').trim() || null
    });
  }

  async function getSanctuaryRolePermissions(){
    assertAdmin();
    return rpc('kinojo_admin_sanctuary_role_permissions', { p_pass_key:currentPassKey() });
  }

  async function setSanctuaryRolePermission(extra={}){
    assertAdmin();
    return rpc('kinojo_admin_sanctuary_role_permission_set', {
      p_pass_key:currentPassKey(),
      p_role_key:String(extra.role || extra.roleKey || '').trim().toUpperCase(),
      p_permission_key:String(extra.permissionKey || extra.permission || '').trim(),
      p_enabled:extra.enabled === true
    });
  }

  async function saveSanctuaryData(extra={}){
    assertAdmin();
    return rpc('kinojo_web_save_sanctuary', { p_payload:extra || {} });
  }

  async function sanctuaryRosterAction(command, extra={}){
    const passKey=currentPassKey();
    if(!passKey) throw new Error('로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.');
    return invokeEdgeFunction('lookup-sheet-bridge', Object.assign({}, extra || {}, {
      action:'webSanctuaryRosterV312',
      command:String(command || extra.command || '').trim().toUpperCase(),
      passKey,
      clientVersion:'kinojo-web-sanctuary-roster-v312'
    }));
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


  function normalizeAdminLookupList(value){
    if(Array.isArray(value)) return value.map(item=>String(item||'').trim()).filter(Boolean);
    return String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
  }

  function normalizeAdminLookupFilter(extra={}){
    const filter=extra.lookupFilter&&typeof extra.lookupFilter==='object'?extra.lookupFilter:extra;
    const mode=String(filter.lookupMode||'all').toLowerCase()==='missing_only'?'missing_only':'all';
    return {
      lookupMode:mode,
      classes:normalizeAdminLookupList(filter.classes),
      gearTypes:mode==='missing_only'?[]:normalizeAdminLookupList(filter.gearTypes),
      races:normalizeAdminLookupList(filter.races),
      servers:normalizeAdminLookupList(filter.servers),
      characterName:String(filter.characterName||'').trim()
    };
  }

  function adminLookupFilterSummary(filter){
    const parts=[];
    parts.push(filter.lookupMode==='missing_only'?'신규 캐릭터만':'전체 캐릭터');
    if(filter.characterName)parts.push('캐릭터 '+filter.characterName);
    if(filter.gearTypes.length)parts.push(filter.gearTypes.join('+'));
    if(filter.classes.length)parts.push('클래스 '+filter.classes.join(','));
    if(filter.servers.length)parts.push('서버 '+filter.servers.join(','));
    if(filter.races.length)parts.push('종족 '+filter.races.join(','));
    return parts.join(' · ');
  }

  async function adminLookup(command, extra={}){
    assertAdmin();
    const normalized=String(command||'status').trim().toLowerCase();
    const passKey=currentPassKey();

    if(normalized==='history'){
      return rpc('kinojo_updater_get_run_reports',{
        p_pass_code:passKey,
        p_limit:Math.max(1,Math.min(100,Number(extra.limit||40)))
      });
    }

    if(normalized==='historydetail'){
      return rpc('kinojo_updater_get_run_report_detail',{
        p_pass_code:passKey,
        p_session_id:String(extra.sessionId||'')
      });
    }

    if(normalized==='startserverqueue'){
      const lookupFilter=normalizeAdminLookupFilter(extra);
      const lookupFilterSummary=String(extra.lookupFilterSummary||adminLookupFilterSummary(lookupFilter));
      let started=null;
      try{
        started=await runtimeStart(passKey,{
          toolName:'KINOJO_SERVER_CHARACTER_QUEUE',
          clientId:'ADMIN_WEB_SERVER_QUEUE',
          progressTotal:0,
          payload:{
            schemaVersion:'kinojo-crawl-v1',
            tool:'KINOJO_ADMIN_WEB',
            requestedSurface:'ADMIN_WEB_SERVER_QUEUE',
            serverQueue:true,
            lookupOnlyPhase:false,
            postprocessPhase:true,
            sheetDeferred:false,
            extensionDoesNotReadListSheet:true,
            listReadMode:'server_edge_bridge',
            clientVersion:'KINOJO_WEB_2026073104',
            pageUrl:location.href,
            lookupFilter,
            lookupFilterSummary
          }
        });
        if(!started||started.ok!==true)throw new Error(started?.message||started?.code||'Server Queue 세션 생성 실패');
        const sessionId=String(started.sessionId||started.session_id||'');
        const sessionToken=String(started.sessionToken||started.session_token||'');
        if(!sessionId||!sessionToken)throw new Error('Server Queue sessionId/sessionToken이 비어 있습니다.');

        const prepared=await invokeEdgeFunction('lookup-sheet-bridge',{
          action:'prepareList',
          sessionId,
          sessionToken,
          clientVersion:'KINOJO_WEB_2026073104',
          payload:{
            schemaVersion:'kinojo-lookup-v2',
            pageUrl:location.href,
            clientVersion:'KINOJO_WEB_2026073104',
            requestedSurface:'ADMIN_WEB_SERVER_QUEUE',
            lookupFilter,
            lookupFilterSummary
          }
        });
        if(!prepared||prepared.ok!==true)throw new Error(prepared?.message||prepared?.code||'Server Engine LIST / MASTER 대조 실패');

        const queueCount=Number(prepared.queueCount||prepared.queue?.length||0);
        const queueMeta={
          queueCount,
          rawListCount:Number(prepared.rawListCount||prepared.listCount||0),
          existingMasterCount:Number(prepared.existingMasterCount||prepared.existingCount||0),
          masterTotalCount:Number(prepared.masterTotalCount||prepared.serverMasterTotal||prepared.existingMasterCount||prepared.existingCount||0),
          matchedMasterCount:Number(prepared.matchedMasterCount||prepared.matchedCount||prepared.existingMasterCount||prepared.existingCount||0),
          newCharacterCount:Number(prepared.newCharacterCount||prepared.newCount||0),
          invalidServerCount:Number(prepared.invalidServerCount||0),
          lookupMode:String(prepared.lookupMode||lookupFilter.lookupMode),
          lookupFilter,
          lookupFilterSummary:String(prepared.lookupFilterSummary||lookupFilterSummary),
          source:'ADMIN_WEB_SERVER_QUEUE',
          batchLimit:5,
          lookupOnlyPhase:false,
          postprocessPhase:true,
          sheetDeferred:false
        };

        if(queueCount<=0){
          const finished=await runtimeFinish(sessionId,sessionToken,'completed',lookupFilter.lookupMode==='missing_only'?'신규 캐릭터가 없어 조회 없이 완료했습니다.':'조회 대상이 없어 완료했습니다.',{source:'ADMIN_WEB_SERVER_QUEUE',phase:'NO_TARGETS',queueMeta});
          return {ok:true,completed:true,noTargets:true,sessionId,queueMeta,lookupFilter,lookupFilterSummary,finish:finished};
        }

        const registered=await rpc('kinojo_admin_server_queue_register_v276',{
          p_pass_key:passKey,
          p_session_id:sessionId,
          p_session_token:sessionToken,
          p_queue_meta:queueMeta
        });
        if(!registered||registered.ok!==true)throw new Error(registered?.message||registered?.code||'Server Queue 등록 실패');

        return {ok:true,sessionId,sessionToken,queueMeta,lookupFilter,lookupFilterSummary,prepared,registered,message:registered.message};
      }catch(error){
        if(started?.sessionId&&started?.sessionToken){
          try{await runtimeFinish(started.sessionId,started.sessionToken,'failed',error?.message||String(error),{source:'ADMIN_WEB_SERVER_QUEUE',stage:'START_FAILED'});}catch(_finishErr){}
        }
        throw error;
      }
    }

    if(normalized==='retryfailed'){
      const sourceSessionId=String(extra.sourceSessionId||extra.sessionId||'').trim();
      if(!sourceSessionId)return {ok:false,code:'MISSING_SOURCE_SESSION',message:'재조회할 이전 세션 ID가 필요합니다.'};
      let started=null;
      try{
        started=await runtimeStart(passKey,{
          toolName:'KINOJO_SERVER_CHARACTER_QUEUE',
          clientId:'ADMIN_WEB_FAILED_RETRY',
          progressTotal:0,
          payload:{
            schemaVersion:'kinojo-crawl-v1',
            tool:'KINOJO_ADMIN_WEB',
            requestedSurface:'ADMIN_WEB_FAILED_RETRY',
            serverQueue:true,
            retryFailedRowsOnly:true,
            sourceSessionId,
            lookupOnlyPhase:false,
            postprocessPhase:true,
            sheetDeferred:false,
            extensionDoesNotReadListSheet:true,
            listReadMode:'server_failed_target_copy',
            clientVersion:'KINOJO_WEB_2026072803',
            pageUrl:location.href,
            lookupFilter:{lookupMode:'retry_failed',sourceSessionId},
            lookupFilterSummary:'실패 대상만 다시 조회'
          }
        });
        if(!started||started.ok!==true)throw new Error(started?.message||started?.code||'실패 대상 재조회 세션 생성 실패');
        const sessionId=String(started.sessionId||started.session_id||'');
        const sessionToken=String(started.sessionToken||started.session_token||'');
        if(!sessionId||!sessionToken)throw new Error('재조회 sessionId/sessionToken이 비어 있습니다.');

        const prepared=await rpc('kinojo_admin_retry_failed_targets_v277',{
          p_pass_key:passKey,
          p_session_id:sessionId,
          p_session_token:sessionToken,
          p_source_session_id:sourceSessionId
        });
        if(!prepared||prepared.ok!==true)throw new Error(prepared?.message||prepared?.code||'실패 대상 Queue 준비 실패');

        const queueCount=Number(prepared.queueCount||prepared.queueMeta?.queueCount||0);
        const queueMeta=Object.assign({},prepared.queueMeta||{},{
          queueCount,
          lookupMode:'retry_failed',
          lookupFilter:{lookupMode:'retry_failed',sourceSessionId},
          lookupFilterSummary:String(prepared.queueMeta?.lookupFilterSummary||'실패 대상 재조회 '+queueCount+'명'),
          source:'ADMIN_WEB_FAILED_RETRY',
          sourceSessionId,
          retryFailedRowsOnly:true,
          batchLimit:5,
          lookupOnlyPhase:false,
          postprocessPhase:true,
          sheetDeferred:false,
          serverQueueContract:'277'
        });

        if(queueCount<=0||prepared.noTargets===true){
          const finished=await runtimeFinish(sessionId,sessionToken,'completed','이전 세션에 재조회할 최종 실패 Target이 없습니다.',{source:'ADMIN_WEB_FAILED_RETRY',phase:'NO_TARGETS',queueMeta});
          return {ok:true,completed:true,noTargets:true,sessionId,sourceSessionId,queueMeta,prepared,finish:finished};
        }

        const registered=await rpc('kinojo_admin_server_queue_register_v276',{
          p_pass_key:passKey,
          p_session_id:sessionId,
          p_session_token:sessionToken,
          p_queue_meta:queueMeta
        });
        if(!registered||registered.ok!==true)throw new Error(registered?.message||registered?.code||'실패 대상 Server Queue 등록 실패');

        return {ok:true,sessionId,sessionToken,sourceSessionId,queueMeta,prepared,registered,message:'실패 대상 '+queueCount+'명의 재조회 Queue를 준비했습니다.'};
      }catch(error){
        if(started?.sessionId&&started?.sessionToken){
          try{await runtimeFinish(started.sessionId,started.sessionToken,'failed',error?.message||String(error),{source:'ADMIN_WEB_FAILED_RETRY',stage:'START_FAILED',sourceSessionId});}catch(_finishErr){}
        }
        throw error;
      }
    }

    if(normalized==='startautonomous'){
      const sessionId=String(extra.sessionId||'');
      const sessionToken=String(extra.sessionToken||'');
      if(!sessionId||!sessionToken)return {ok:false,code:'MISSING_SESSION',message:'서버 자동 실행 인계에 필요한 sessionId/sessionToken이 없습니다.'};
      return invokeEdgeFunction('character-refresh-worker',{
        action:'startAutonomous',
        sessionId,
        sessionToken,
        clientVersion:'KINOJO_WEB_2026072803'
      });
    }

    if(normalized==='runserverqueue'){
      const sessionId=String(extra.sessionId||'');
      const sessionToken=String(extra.sessionToken||'');
      if(!sessionId||!sessionToken)return {ok:false,code:'MISSING_SESSION',message:'Server Queue sessionId/sessionToken이 필요합니다.'};
      return invokeEdgeFunction('character-refresh-worker',{
        action:'runQueue',
        sessionId,
        sessionToken,
        batchLimit:Math.max(1,Math.min(Number(extra.batchLimit||5),5)),
        clientVersion:'KINOJO_WEB_2026072803'
      });
    }

    if(normalized==='start'){
      const lookupFilter=normalizeAdminLookupFilter(extra);
      const lookupFilterSummary=String(extra.lookupFilterSummary||adminLookupFilterSummary(lookupFilter));
      let started=null;
      try{
        started=await runtimeStart(passKey,{
          toolName:'KINOJO_EXTENSION',
          clientId:getClientId(),
          progressTotal:0,
          payload:{
            schemaVersion:'kinojo-crawl-v1',
            tool:'KINOJO_ADMIN_WEB',
            requestedSurface:'ADMIN_WEB',
            awaitingExtension:true,
            extensionDoesNotReadListSheet:true,
            listReadMode:'server_edge_bridge',
            clientVersion:'KINOJO_WEB_2026072503',
            pageUrl:location.href,
            lookupFilter,
            lookupFilterSummary
          }
        });
        if(!started||started.ok!==true)throw new Error(started?.message||started?.code||'Server Engine 조회 세션 생성 실패');
        const sessionId=String(started.sessionId||started.session_id||'');
        const sessionToken=String(started.sessionToken||started.session_token||'');
        if(!sessionId||!sessionToken)throw new Error('Server Engine sessionId/sessionToken이 비어 있습니다.');

        const prepared=await invokeEdgeFunction('lookup-sheet-bridge',{
          action:'prepareList',
          sessionId,
          sessionToken,
          clientVersion:'KINOJO_WEB_2026072503',
          payload:{
            schemaVersion:'kinojo-lookup-v2',
            pageUrl:location.href,
            clientVersion:'KINOJO_WEB_2026072503',
            requestedSurface:'ADMIN_WEB',
            lookupFilter,
            lookupFilterSummary
          }
        });
        if(!prepared||prepared.ok!==true)throw new Error(prepared?.message||prepared?.code||'Server Engine LIST / MASTER 대조 실패');

        const queueCount=Number(prepared.queueCount||prepared.queue?.length||0);
        const queueMeta={
          queueCount,
          rawListCount:Number(prepared.rawListCount||prepared.listCount||0),
          existingMasterCount:Number(prepared.existingMasterCount||prepared.existingCount||0),
          newCharacterCount:Number(prepared.newCharacterCount||prepared.newCount||0),
          invalidServerCount:Number(prepared.invalidServerCount||0),
          lookupMode:String(prepared.lookupMode||lookupFilter.lookupMode),
          lookupFilter,
          lookupFilterSummary:String(prepared.lookupFilterSummary||lookupFilterSummary)
        };

        if(queueCount<=0){
          const finished=await runtimeFinish(sessionId,sessionToken,'completed',lookupFilter.lookupMode==='missing_only'?'신규 캐릭터가 없어 조회 없이 완료했습니다.':'조회 대상이 없어 완료했습니다.',{source:'ADMIN_WEB',queueMeta});
          return {ok:true,completed:true,noTargets:true,sessionId,queueMeta,lookupFilter,lookupFilterSummary,finish:finished};
        }

        await runtimeProgress(sessionId,sessionToken,{
          stage:'QUEUE_READY',
          message:'관리자 WEB에서 Server Target Queue 준비 완료',
          current:0,
          total:queueCount,
          payload:{source:'ADMIN_WEB',queueMeta,lookupFilter,lookupFilterSummary}
        });

        const registered=await rpc('kinojo_admin_lookup_register_v268',{
          p_pass_key:passKey,
          p_session_id:sessionId,
          p_queue_meta:queueMeta
        });
        if(!registered||registered.ok!==true)throw new Error(registered?.message||registered?.code||'관리자 WEB 조회 세션 등록 실패');

        return {ok:true,sessionId,sessionToken,queueMeta,lookupFilter,lookupFilterSummary,prepared,registered,message:registered.message};
      }catch(error){
        if(started?.sessionId&&started?.sessionToken){
          try{await runtimeFinish(started.sessionId,started.sessionToken,'failed',error?.message||String(error),{source:'ADMIN_WEB',stage:'START_FAILED'});}catch(_finishErr){}
        }
        throw error;
      }
    }

    if(normalized==='status'){
      return rpc('kinojo_admin_server_queue_status_v289',{
        p_pass_key:passKey,
        p_session_id:extra.sessionId?String(extra.sessionId):null
      });
    }

    if(normalized==='control'){
      return rpc('kinojo_admin_server_queue_control_v276',{
        p_pass_key:passKey,
        p_session_id:String(extra.sessionId||''),
        p_command:String(extra.command||extra.control||'')
      });
    }

    if(normalized==='heartbeat'){
      return runtimeProgress(String(extra.sessionId||''),String(extra.sessionToken||''),{
        stage:'WAITING_EXTENSION',
        message:'관리자 WEB 조회 세션 · Extension 연결 대기',
        current:Number(extra.current||0),
        total:Number(extra.total||0),
        payload:{source:'ADMIN_WEB',heartbeat:true}
      });
    }

    return {ok:false,message:'알 수 없는 캐릭터 최신화 명령입니다.'};
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

  async function getLiveCharacterProfile(action, extra={}){
    const payload=Object.assign({},extra||{},{
      action:String(action||'overview'),
      clientVersion:'KINOJO_WEB_2026072904'
    });
    return invokeEdgeFunction('character-profile-snapshot',payload);
  }

  async function adminSanctuarySheetSync(command, extra={}){
    assertAdmin();
    const passKey=currentPassKey();
    const normalized=String(command||'status').trim().toLowerCase();
    if(normalized==='status'){
      return rpc('kinojo_admin_sanctuary_sheet_sync_status',{p_pass_key:passKey});
    }
    if(normalized==='ping'){
      return invokeEdgeFunction('lookup-sheet-bridge',{
        action:'adminBridgePing',
        passKey,
        clientVersion:'kinojo-web-2026071819'
      });
    }
    if(normalized!=='preview'&&normalized!=='apply')return {ok:false,message:'알 수 없는 성역 시트 동기화 명령입니다.'};
    return invokeEdgeFunction('lookup-sheet-bridge',{
      action:'adminSanctuarySheetSync',
      passKey,
      sanctuaryId:String(extra.sanctuaryId||extra.id||'all'),
      mode:normalized,
      clientVersion:'kinojo-web-2026071819'
    });
  }

  async function adminSanctuaryProfileDiagnostic(extra={}){
    assertAdmin();
    return rpc('kinojo_admin_sanctuary_profile_diagnostic_252', {
      p_pass_key:currentPassKey(),
      p_sanctuary_id:String(extra.sanctuaryId || extra.id || 'all').trim().toLowerCase() || 'all'
    });
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
    if(name === 'hallOfFame') return getWebHofSummary(extra);
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
    if(name === 'sanctuaryMaster') return getSanctuaryMaster();
    if(name === 'sanctuary') return getSanctuaryData(extra.id || extra.sanctuaryId || '');
    if(name === 'sanctuaryRosterData') return getSanctuaryRosterData(extra.id || extra.sanctuaryId || '');
    if(name === 'sanctuaryWaitlistData') return getSanctuaryWaitlistData(extra.id || extra.sanctuaryId || '');
    if(name === 'sanctuaryWaitlistRecommendations') return getSanctuaryWaitlistRecommendations(extra);
    if(name === 'sanctuaryWaitlistSlotDetail') return getSanctuaryWaitlistSlotDetail(extra);
    if(name === 'sanctuarySupportRequest') return submitSanctuarySupportRequest(extra);
    if(name === 'sanctuaryRequestConsole') return getSanctuaryRequestConsole(extra);
    if(name === 'sanctuaryRequestReject') return rejectSanctuarySupportRequest(extra);
    if(name === 'notificationSummary') return getNotificationSummary();
    if(name === 'sanctuaryOperation') return getSanctuaryOperationOverview(extra);
    if(name === 'sanctuaryScheduleCalendar') return getSanctuaryScheduleCalendar(extra);
    if(name === 'sanctuaryScheduleDay') return getSanctuaryScheduleDay(extra);
    if(name === 'sanctuaryAvailabilitySave') return saveSanctuaryAvailability(extra);
    if(name === 'mySanctuaryTopbar') return getMySanctuaryTopbar(extra);
    if(name === 'adminSanctuaryScheduleConsole') return getAdminSanctuaryScheduleConsole(extra);
    if(name === 'adminSanctuaryScheduleSave') return saveAdminSanctuarySchedule(extra);
    if(name === 'adminSanctuaryScheduleStatus') return setAdminSanctuaryScheduleStatus(extra);
    if(name === 'sanctuaryRolePermissions') return getSanctuaryRolePermissions(extra);
    if(name === 'sanctuaryRolePermissionSet') return setSanctuaryRolePermission(extra);
    if(name === 'adminSanctuarySheetSync') return adminSanctuarySheetSync(extra.mode || extra.command || 'status', extra);
    if(name === 'adminSanctuaryProfileDiagnostic') return adminSanctuaryProfileDiagnostic(extra);
    if(name === 'sanctuaryAdmin') return saveSanctuaryData(extra);
    if(name === 'sanctuaryRoster') return sanctuaryRosterAction(extra.command, extra);
    if(name === 'notices') return { ok:true, notices:(await getLatestAnnouncements(extra.limit || 5)).map(noticeFromRow).filter(Boolean) };
    if(name === 'hallVisit'){
      const mode = String(extra.mode || 'stats');
      const shouldLog = mode === 'visit' || Number(extra.boost || 0) > 0;
      return { ok:true, stats:await getVisitStatsFromServer(extra.pageKey || 'hall', shouldLog) };
    }
    return null;
  }

  async function adminVisitor(cmd, extra={}){
    assertAdmin();
    if(cmd==='dashboard') return rpc('kinojo_admin_visitor_dashboard_266',{p_pass_key:currentPassKey(),p_days:Number(extra.days||7)});
    if(cmd==='history') return rpc('kinojo_admin_visitor_history_266',{
      p_pass_key:currentPassKey(),p_date_from:extra.dateFrom||null,p_date_to:extra.dateTo||null,p_member_search:extra.memberSearch||null,
      p_login_filter:extra.loginFilter||'ALL',p_page_key:extra.pageKey||null,p_page:Number(extra.page||1),p_page_size:Number(extra.pageSize||20)
    });
    return {ok:false,message:'지원하지 않는 방문자 관리 명령입니다.'};
  }

  async function adminUnsupported(feature){
    return { ok:false, message:feature + ' 기능은 Phase 2에서 Apps Script 호출을 차단했습니다. 서버 연산 테이블/RPC 이관 후 활성화됩니다.' };
  }

  async function verifyPassKey(passKey){
    const code = normalizePassKey(passKey);
    if(!code) throw new Error('PASS KEY를 입력해 주세요.');
    const data = await rpc('kinojo_member_verify_session_264', {
      p_pass_key:code,
      p_tool_name:'KINOJO_WEB'
    });
    if(!data || data.ok === false) throw new Error(data?.message || 'PASS KEY가 없거나 비활성화된 계정입니다.');
    const row = data.profile || {};
    const level = Number(row.level || 0);
    const role = normalizeRole(row.role, level);
    const roleLevel = level || roleToLevel(role, 0);
    if(roleLevel < 1) throw new Error('조회 권한이 없는 계정입니다. Member 이상만 사용할 수 있습니다.');
    const profile = {
      id: row.id,
      mainCharacter: row.mainCharacter || row.main_character_name || '',
      mainCharacterName: row.mainCharacterName || row.main_character_name || '',
      role,
      roleLabel: row.roleLabel || row.role_label || getRoleLabel(role, roleLevel),
      level: roleLevel,
      canLike: (row.canLike ?? row.can_like) !== false,
      canSuggest: (row.canSuggest ?? row.can_suggest) !== false,
      canManage: (row.canManage ?? row.can_manage) === true || roleLevel >= 3,
      permissions: normalizePermissions(row.permissions),
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
        permissions: profile.permissions,
        source:'supabase',
        passCode: code,
        passKey: code,
        lastActivityAt: Date.now()
      },
      account: profile,
      profile
    };
  }

  window.KinojoSupabase = {
    version:'1.3.1.54-modular-core-20260802',
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
    getSanctuaryMaster,
    getSanctuaryData,
    getSanctuaryRosterData,
    getSanctuaryWaitlistData,
    getSanctuaryWaitlistRecommendations,
    getSanctuaryWaitlistSlotDetail,
    submitSanctuarySupportRequest,
    getSanctuaryRequestConsole,
    rejectSanctuarySupportRequest,
    getNotificationSummary,
    getSanctuaryOperationOverview,
    getSanctuaryScheduleCalendar,
    getSanctuaryScheduleDay,
    saveSanctuaryAvailability,
    getMySanctuaryTopbar,
    getAdminSanctuaryScheduleConsole,
    saveAdminSanctuarySchedule,
    setAdminSanctuaryScheduleStatus,
    getSanctuaryRolePermissions,
    setSanctuaryRolePermission,
    saveSanctuaryData,
    sanctuaryRosterAction,
    logPageView,
    logLoginVisit,
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
    adminMeter,
    adminSanctuarySheetSync,
    adminSanctuaryProfileDiagnostic,
    adminCharacter,
    adminLookup,
    getLiveCharacterProfile,
    adminVisit,
    adminVisitor,
    getVisitStats,
    adminUnsupported
  };
})();
