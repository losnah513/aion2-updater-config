/*
 * KINOJO Character Skill Bridge · 4-4
 * 역할: SQL 305의 스킬 분류 결과를 공통 캐릭터 모달의 분류 탭과 레벨 강조 카드로 표시한다.
 * 규칙: frozen 공통 Core를 덮어쓰지 않으며 레벨 20/25/30 강조 기준은 공통 모달 UI에서 일관되게 적용한다.
 */
(function(){
  'use strict';

  const RPC='kinojo_character_skill_overview_v305';
  const PROFILE_RPC='kinojo_web_character_profile_effective_v342';
  let observer=null;
  let requestSerial=0;
  let scheduled=false;
  let profileSerial=0;
  let profileScheduled=false;
  let profileEffective=null;
  let profileApplying=false;

  function esc(value){
    return String(value==null?'':value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

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

  function categoryLabel(category,serverLabel){
    const explicit=String(serverLabel||'').trim();
    if(explicit) return explicit;
    return ({active:'액티브',passive:'패시브',stigma:'스티그마',other:'기타'})[String(category||'').toLowerCase()]||'기타';
  }

  function categoryKey(value){
    const raw=String(value||'').trim().toLowerCase();
    if(raw==='passive') return 'passive';
    if(raw==='stigma' || raw==='dp') return 'stigma';
    return 'active';
  }

  function levelClass(level){
    if(level>=30) return 'is-level-30';
    if(level>=25) return 'is-level-25';
    if(level>=20) return 'is-level-20';
    return '';
  }

  function skillCard(skill){
    const icon=safeUrl(skill?.icon);
    const level=Math.max(0,Number(skill?.level||0));
    const category=categoryKey(skill?.category);
    const classes=['kinojo-character-skill-card',levelClass(level)].filter(Boolean);
    if(category==='stigma') classes.push('is-skill-stigma');
    return '<article class="'+classes.join(' ')+'" data-kinojo-skill-v305="true" data-level-band="'+esc(skill?.levelBand||'normal')+'">'+
      '<div class="kinojo-character-skill-icon '+(icon?'':'is-empty')+'">'+
        (icon?'<img src="'+icon+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+
        '<strong class="kinojo-character-skill-level">Lv.'+level+'</strong>'+
      '</div>'+
      '<span><b>'+esc(skill?.name||'-')+'</b><small>'+esc(categoryLabel(category,skill?.categoryLabel))+(skill?.equip?' · 장착':'')+'</small></span>'+
    '</article>';
  }

  function render(section,result,key){
    const skills=(Array.isArray(result?.skills)?result.skills:[]).filter(skill=>skill?.acquired===true || Number(skill?.acquired||0)===1);
    const previous=String(section.querySelector('[data-kinojo-skill-tab].active')?.dataset.kinojoSkillTab||'active');
    const selected=['active','passive','stigma'].includes(previous)?previous:'active';
    const order=['active','passive','stigma'];
    const groups=order.map(category=>{
      const rows=skills.filter(skill=>categoryKey(skill?.category)===category);
      return {category,rows,label:rows.length?categoryLabel(category,rows[0]?.categoryLabel):categoryLabel(category,'')};
    });
    section.innerHTML=
      '<div class="kinojo-character-live-section-head"><div><strong>스킬</strong><span>Server가 정규화한 현재 습득·장착 레벨</span></div><em>'+skills.length+'개</em></div>'+
      '<div class="kinojo-character-overview-subtabs is-skill" role="tablist" aria-label="스킬 분류">'+groups.map(group=>
        '<button type="button" class="'+(selected===group.category?'active':'')+'" role="tab" aria-selected="'+String(selected===group.category)+'" data-kinojo-skill-tab="'+group.category+'"><span>'+esc(group.label)+'</span><em>'+group.rows.length+'</em></button>'
      ).join('')+'</div>'+
      '<div class="kinojo-character-skill-groups">'+groups.map(group=>
        '<section data-kinojo-skill-panel="'+group.category+'" '+(selected===group.category?'':'hidden')+'><header><strong>'+esc(group.label)+'</strong><em>'+group.rows.length+'개</em></header>'+(group.rows.length?'<div class="kinojo-character-skill-list">'+group.rows.map(skillCard).join('')+'</div>':'<p class="kinojo-character-overview-empty">표시할 '+esc(group.label)+' 스킬이 없습니다.</p>')+'</section>'
      ).join('')+'</div>';
    section.dataset.kinojoSkillKey=key;
    section.dataset.kinojoSkillApiVersion=String(result?.apiVersion||'305');
  }

  async function refresh(){
    scheduled=false;
    const root=document.getElementById('kinojoCharacterReactionModal');
    if(!root) return;
    ensureScrollViewport(root);
    const section=root.querySelector('.kinojo-character-skill-section');
    if(!section) return;
    const target=identity(root);
    if(!target.name || !target.serverId || section.dataset.kinojoSkillKey===target.key) return;
    const rpc=window.KinojoSupabaseRpcCore;
    if(!rpc || typeof rpc.rpc!=='function') return;
    const serial=++requestSerial;
    try{
      const result=await rpc.rpc(RPC,{p_server_id:target.serverId,p_character_name:target.name});
      if(serial!==requestSerial || !document.contains(section)) return;
      if(!result || result.ok!==true || !Array.isArray(result.skills)) throw new Error(result?.message||'SQL 305 스킬 정보를 불러오지 못했습니다.');
      render(section,result,target.key);
    }catch(error){
      section.dataset.kinojoSkillError=String(error?.message||error);
      console.error('[KINOJO skill 4-4]',error);
    }
  }

  function schedule(){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(refresh);
  }

  function start(){
    const root=document.getElementById('kinojoCharacterReactionModal');
    if(root) ensureScrollViewport(root);
    if(!observer && document.body){
      observer=new MutationObserver(records=>{
        if(records.some(record=>Array.from(record.addedNodes||[]).some(node=>
          node.nodeType===1 && (node.matches?.('#kinojoCharacterReactionModal,.kinojo-character-skill-section,.kinojo-character-skill-card') || node.querySelector?.('#kinojoCharacterReactionModal,.kinojo-character-skill-section,.kinojo-character-skill-card'))
        ))) schedule();
        if(records.some(record=>{
          const target=record.target;
          if(target?.nodeType===1 && (target.matches?.('#kinojoCharacterReactionModal,#kinojoCharacterReactionAvatar') || target.closest?.('#kinojoCharacterReactionModal'))) return true;
          return Array.from(record.addedNodes||[]).some(node=>node.nodeType===1 && (node.matches?.('#kinojoCharacterReactionModal,#kinojoCharacterReactionAvatar,#kinojoCharacterReactionAvatar *') || node.querySelector?.('#kinojoCharacterReactionModal,#kinojoCharacterReactionAvatar')));
        })) scheduleEffectiveProfile();
      });
      observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});
    }
    schedule();
    scheduleEffectiveProfile();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
