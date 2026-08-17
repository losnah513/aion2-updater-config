/*
 * KINOJO Auth Service Core
 * 책임: PASS KEY 로그인, WEB Server session 수명주기, 회원 코드/계정 관리 Server 호출.
 */
(function(){
  'use strict';

  const AUTH_EDGE_NAME='kinojo-member-auth';
  const AUTH_EDGE_CLIENT_VERSION='KINOJO_WEB_AUTH_EDGE_V2';
  const SERVER_SESSION_SOURCE='supabase-web-session-320';
  const SERVER_SESSION_TOKEN_PATTERN=/^kws_[A-Za-z0-9_-]{40,80}$/;

  function bridge(){
    const api=window.KinojoSupabase;
    if(!api)throw new Error('KinojoSupabase가 먼저 로드되어야 합니다.');
    return api;
  }

  function edgeClient(){
    const client=window.KinojoSupabaseClientCore;
    if(!client||typeof client.invokeEdgeFunction!=='function'){
      throw new Error('KINOJO 인증 Edge 연결 모듈을 확인할 수 없습니다.');
    }
    return client;
  }

  function sessionCore(){
    return window.KinojoAuthSessionCore||null;
  }

  function storedSession(){
    const core=sessionCore();
    if(!core)return null;
    if(typeof core.readJson==='function'&&core.STORAGE_KEY)return core.readJson(core.STORAGE_KEY);
    if(typeof core.getSession==='function')return core.getSession();
    return null;
  }

  function storedAccount(){
    const core=sessionCore();
    return core&&typeof core.getAccount==='function'?core.getAccount():null;
  }

  function isServerSessionToken(value){
    return SERVER_SESSION_TOKEN_PATTERN.test(String(value||'').trim());
  }

  function currentServerSessionToken(){
    const token=String(storedSession()?.token||'').trim();
    return isServerSessionToken(token)?token:'';
  }



  async function ensureReady(){
    const api=bridge();
    if(typeof api.ensureReady==='function')await api.ensureReady();
    else if(typeof api.loadRemoteConfig==='function')await api.loadRemoteConfig();
    return api;
  }

  async function invokeAuthAction(action,body){
    await ensureReady();
    return edgeClient().invokeEdgeFunction(AUTH_EDGE_NAME,Object.assign({
      action,
      clientVersion:AUTH_EDGE_CLIENT_VERSION
    },body||{}));
  }

  function normalizeAuthResult(api,data,tokenOverride){
    if(!data||data.ok===false)throw new Error(data&&data.message||'로그인 상태를 확인하지 못했습니다.');
    const row=data.profile||{};
    const serverSession=data.session||{};
    const token=String(serverSession.token||tokenOverride||'').trim();
    if(!isServerSessionToken(token))throw new Error('Server 로그인 세션을 발급하지 못했습니다.');

    const level=Number(row.level||0);
    const role=api.normalizeRole(row.role,level);
    const roleLevel=level||api.roleToLevel(role,0);
    if(roleLevel<1)throw new Error('조회 권한이 없는 계정입니다. Member 이상만 사용할 수 있습니다.');

    const now=Date.now();
    const permissions=api.normalizePermissions(row.permissions);
    const profile={
      id:row.id,
      mainCharacter:row.mainCharacter||row.main_character_name||'',
      mainCharacterName:row.mainCharacterName||row.main_character_name||'',
      role,
      roleLabel:row.roleLabel||row.role_label||api.getRoleLabel(role,roleLevel),
      level:roleLevel,
      canLike:(row.canLike??row.can_like)!==false,
      canSuggest:(row.canSuggest??row.can_suggest)!==false,
      canManage:(row.canManage??row.can_manage)===true||roleLevel>=3,
      permissions,
      source:SERVER_SESSION_SOURCE,
      verifiedAt:now
    };
    const session={
      token,
      mainCharacter:profile.mainCharacter,
      role:profile.role,
      roleLabel:profile.roleLabel,
      level:profile.level,
      permissions:profile.permissions,
      source:SERVER_SESSION_SOURCE,
      serverSession:true,
      serverIssuedAt:String(serverSession.issuedAt||''),
      serverExpiresAt:String(serverSession.expiresAt||''),
      serverContractVersion:String(serverSession.contractVersion||data.databaseContract||'320'),
      lastActivityAt:now
    };


    return {ok:true,session,account:profile,profile};
  }

  async function verifyPassKey(code){
    const api=await ensureReady();
    const normalized=api.normalizePassKey(code);
    if(!normalized)throw new Error('PASS KEY를 입력해 주세요.');

    const data=await invokeAuthAction('login',{
      passKey:normalized,
      replaceSessionToken:currentServerSessionToken()||null
    });
    return normalizeAuthResult(api,data);
  }

  async function validateSession(sessionToken){
    const api=await ensureReady();
    const token=String(sessionToken||'').trim();
    if(!isServerSessionToken(token))throw new Error('Server 로그인 세션을 확인할 수 없습니다.');
    const data=await invokeAuthAction('validate',{sessionToken:token});
    return normalizeAuthResult(api,data,token);
  }

  async function touchSession(sessionToken){
    const api=await ensureReady();
    const token=String(sessionToken||'').trim();
    if(!isServerSessionToken(token))throw new Error('Server 로그인 세션을 확인할 수 없습니다.');
    const data=await invokeAuthAction('touch',{sessionToken:token});
    return normalizeAuthResult(api,data,token);
  }

  async function revokeSession(sessionToken,reason){
    const token=String(sessionToken||'').trim();
    if(!isServerSessionToken(token))return {ok:true,revoked:false,code:'NO_ACTIVE_SESSION'};
    return invokeAuthAction('logout',{
      sessionToken:token,
      reason:String(reason||'logout').trim().slice(0,80)||'logout'
    });
  }

  async function publicCodeRequest(command,body){
    const api=await ensureReady();
    return api.publicCodeRequest(command,body);
  }

  async function adminAccount(command,body){
    const api=await ensureReady();
    return api.adminAccount(command,body);
  }

  window.addEventListener?.('kinojo:auth-clearing',event=>{
    const detail=event&&event.detail||{};
    const token=String(detail.session&&detail.session.token||'').trim();
    if(!isServerSessionToken(token))return;
    revokeSession(token,detail.reason||'local_clear').catch(()=>{});
  });

  window.KinojoAuthService=Object.freeze({
    ensureReady,
    verifyPassKey,
    validateSession,
    touchSession,
    revokeSession,
    isServerSessionToken,
    publicCodeRequest,
    adminAccount
  });
})();
