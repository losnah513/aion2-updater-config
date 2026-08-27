/*
 * KINOJO Character Modal Profile/Scroll Bridge
 * 역할: 공통 캐릭터 모달의 유효 프로필 이미지와 내부 스크롤 경계만 보정한다.
 * 규칙: 스킬 조회·렌더링은 reaction 모듈의 SQL 415 단일 호출이 전담한다.
 */
(function(){
  'use strict';

  const PROFILE_RPC='kinojo_web_character_profile_effective_v342';
  let observer=null;
  let profileSerial=0;
  let profileScheduled=false;
  let profileEffective=null;
  let profileApplying=false;

  function safeUrl(value){
    const raw=String(value||'').trim();
    if(!raw) return '';
    if(raw.startsWith('//')) return 'https:'+raw;
    if(raw.startsWith('/') || /^https:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw.replace(/"/g,'%22');
    return '';
  }

  function ensureScrollViewport(root){
    const dialog=root?.querySelector('.kinojo-character-reaction-dialog');
    if(!dialog || dialog.querySelector(':scope > .kinojo-character-reaction-scroll')) return;
    const viewport=document.createElement('div');
    viewport.className='kinojo-character-reaction-scroll';
    Array.from(dialog.children).forEach(child=>{
      if(child.classList.contains('kinojo-character-reaction-close')) return;
      viewport.appendChild(child);
    });
    dialog.appendChild(viewport);
  }

  function identity(root){
    const name=String(root?.querySelector('#kinojoCharacterReactionTitle')?.textContent||'').trim();
    const href=String(root?.querySelector('#kinojoCharacterReactionDetail')?.href||'');
    const serverMatch=href.match(/\/characters\/(\d+)\//i);
    const serverId=serverMatch?Number(serverMatch[1]):0;
    return {name,serverId,key:serverId+'|'+name};
  }

  async function canonicalProfileCharacter(target){
    const api=window.KinojoSupabase;
    if(!target?.name || !target?.serverId || !api || typeof api.request!=='function') return null;
    const query='select=id,character_name,server_id&server_id=eq.'+encodeURIComponent(target.serverId)+'&character_name=eq.'+encodeURIComponent(target.name)+'&limit=1';
    const rows=await api.request('character_master',{query});
    const row=Array.isArray(rows)?rows[0]:null;
    const id=Number(row?.id||0);
    if(!Number.isInteger(id)||id<=0) return null;
    if(Number(row?.server_id||0)!==Number(target.serverId)||String(row?.character_name||'').trim()!==target.name) throw new Error('EFFECTIVE_PROFILE_CHARACTER_BINDING_MISMATCH');
    return {id,name:target.name,serverId:Number(target.serverId)};
  }

  function applyEffectiveProfile(root,effective){
    if(!root||!effective||profileApplying) return;
    const avatar=root.querySelector('#kinojoCharacterReactionAvatar');
    const mount=window.KinojoCharacterProfileImage?.mount;
    if(!avatar||typeof mount!=='function') return;
    const current=String(avatar.querySelector('img')?.src||'');
    const expected=String(effective.url||'');
    if(expected&&current===expected) return;
    const classIcon=String(root.querySelector('#kinojoCharacterReactionClass img')?.getAttribute('src')||'');
    profileApplying=true;
    try{
      mount(avatar,{name:effective.name,profileImageUrl:expected,classIconUrl:classIcon},{loading:'eager',fallbackText:false,alt:(effective.name||'캐릭터')+' 프로필',classIconPadding:'24%'});
      avatar.dataset.effectiveProfileSource=effective.source;
      avatar.dataset.effectiveProfileContract='342';
    }finally{
      profileApplying=false;
    }
  }

  async function refreshEffectiveProfile(){
    profileScheduled=false;
    const root=document.getElementById('kinojoCharacterReactionModal');
    if(!root||!root.classList.contains('open')||root.getAttribute('aria-hidden')==='true'){
      profileEffective=null;
      return;
    }
    const target=identity(root);
    if(!target.name||!target.serverId) return;
    if(profileEffective?.key===target.key){
      applyEffectiveProfile(root,profileEffective);
      return;
    }
    const rpc=window.KinojoSupabaseRpcCore;
    if(!rpc||typeof rpc.rpc!=='function') return;
    const serial=++profileSerial;
    try{
      const character=await canonicalProfileCharacter(target);
      if(!character) return;
      const result=await rpc.rpc(PROFILE_RPC,{p_character_id:character.id});
      if(serial!==profileSerial) return;
      const active=identity(root);
      if(!root.classList.contains('open')||active.key!==target.key) return;
      if(!result||result.ok!==true) return;
      if(Number(result.characterId||0)!==character.id) throw new Error('EFFECTIVE_PROFILE_RESULT_BINDING_MISMATCH');
      const source=String(result.profileImageSource||'').trim().toUpperCase();
      if(source!=='USER_OVERRIDE'&&source!=='OFFICIAL') throw new Error('EFFECTIVE_PROFILE_SOURCE_INVALID');
      const url=safeUrl(result.profileImageUrl||'');
      profileEffective={key:target.key,name:target.name,characterId:character.id,source,url};
      applyEffectiveProfile(root,profileEffective);
    }catch(error){
      console.error('[KINOJO profile 5-C]',error);
    }
  }

  function scheduleEffectiveProfile(){
    if(profileScheduled) return;
    profileScheduled=true;
    requestAnimationFrame(refreshEffectiveProfile);
  }

  function start(){
    const root=document.getElementById('kinojoCharacterReactionModal');
    if(root) ensureScrollViewport(root);
    if(!observer && document.body){
      observer=new MutationObserver(records=>{
        if(records.some(record=>{
          const target=record.target;
          if(target?.nodeType===1 && (target.matches?.('#kinojoCharacterReactionModal,#kinojoCharacterReactionAvatar') || target.closest?.('#kinojoCharacterReactionModal'))) return true;
          return Array.from(record.addedNodes||[]).some(node=>node.nodeType===1 && (node.matches?.('#kinojoCharacterReactionModal,#kinojoCharacterReactionAvatar,#kinojoCharacterReactionAvatar *') || node.querySelector?.('#kinojoCharacterReactionModal,#kinojoCharacterReactionAvatar')));
        })) scheduleEffectiveProfile();
      });
      observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});
    }
    scheduleEffectiveProfile();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
