/*
 * KINOJO Auth Service Core
 * 책임: PASS KEY 로그인과 회원 코드/계정 관리 Server 호출.
 */
(function(){
  'use strict';

  const AUTH_EDGE_NAME='kinojo-member-auth';
  const AUTH_EDGE_CLIENT_VERSION='KINOJO_WEB_AUTH_EDGE_V1';

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

  async function ensureReady(){
    const api=bridge();
    if(typeof api.ensureReady==='function')await api.ensureReady();
    else if(typeof api.loadRemoteConfig==='function')await api.loadRemoteConfig();
    return api;
  }

  async function verifyPassKey(code){
    const api=await ensureReady();
    const normalized=api.normalizePassKey(code);
    if(!normalized)throw new Error('PASS KEY를 입력해 주세요.');

    const data=await edgeClient().invokeEdgeFunction(AUTH_EDGE_NAME,{
      action:'verifyPassKey',
      passKey:normalized,
      clientVersion:AUTH_EDGE_CLIENT_VERSION
    });
    if(!data||data.ok===false){
      throw new Error(data&&data.message||'PASS KEY가 없거나 비활성화된 계정입니다.');
    }

    const row=data.profile||{};
    const level=Number(row.level||0);
    const role=api.normalizeRole(row.role,level);
    const roleLevel=level||api.roleToLevel(role,0);
    if(roleLevel<1){
      throw new Error('조회 권한이 없는 계정입니다. Member 이상만 사용할 수 있습니다.');
    }

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
      source:'supabase-edge-auth',
      passCode:normalized,
      passKey:normalized,
      verifiedAt:now
    };

    return {
      ok:true,
      session:{
        token:'supabase:'+row.id+':'+now,
        mainCharacter:profile.mainCharacter,
        role:profile.role,
        roleLabel:profile.roleLabel,
        level:profile.level,
        permissions:profile.permissions,
        source:'supabase-edge-auth',
        passCode:normalized,
        passKey:normalized,
        lastActivityAt:now
      },
      account:profile,
      profile
    };
  }

  async function publicCodeRequest(command,body){
    const api=await ensureReady();
    return api.publicCodeRequest(command,body);
  }

  async function adminAccount(command,body){
    const api=await ensureReady();
    return api.adminAccount(command,body);
  }

  window.KinojoAuthService=Object.freeze({ensureReady,verifyPassKey,publicCodeRequest,adminAccount});
})();
