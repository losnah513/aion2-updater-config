/*
 * KINOJO Character Skill Bridge
 * 역할: 저장된 공식 스킬 원본을 Server RPC에서 정규화해 캐릭터 모달 overview에 병합한다.
 * 규칙: WEB은 스킬 레벨을 계산하거나 공식 원본을 직접 파싱하지 않는다.
 */
(function(){
  'use strict';

  function install(){
    const api=window.KinojoSupabase;
    const rpc=window.KinojoSupabaseRpcCore;
    if(!api || !rpc || typeof api.getLiveCharacterProfile!=='function' || typeof rpc.rpc!=='function') return false;
    if(api.__characterSkillBridgeV304) return true;

    const original=api.getLiveCharacterProfile.bind(api);
    api.getLiveCharacterProfile=async function(action,extra){
      const data=await original(action,extra);
      if(String(action||'overview')!=='overview') return data;
      try{
        const identity=extra||{};
        const result=await rpc.rpc('kinojo_character_skill_overview_v304',{
          p_server_id:Number(identity.serverId||identity.server_id||0),
          p_character_name:String(identity.characterName||identity.name||'')
        });
        if(result && result.ok===true && Array.isArray(result.skills)){
          data.skills=result.skills;
          data.skillSource=result.source||'KINOJO_SERVER_SKILL_NORMALIZED';
          data.skillRefreshedAt=result.refreshedAt||null;
        }
      }catch(_error){
        // 저장된 공식 스킬 원본이 없는 캐릭터는 기존 overview 범위를 유지한다.
      }
      return data;
    };
    Object.defineProperty(api,'__characterSkillBridgeV304',{value:true,configurable:false});
    return true;
  }

  if(!install()){
    let attempts=0;
    const timer=setInterval(()=>{
      attempts+=1;
      if(install() || attempts>=40) clearInterval(timer);
    },100);
  }
})();
