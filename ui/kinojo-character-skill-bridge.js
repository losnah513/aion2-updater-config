/*
 * KINOJO Character Skill Bridge · 4-4
 * 역할: SQL 305의 스킬 분류·레벨 강조 결과를 공통 캐릭터 모달에 표시하고 모달 내부 스크롤 viewport를 구성한다.
 * 규칙: frozen 공통 Core를 덮어쓰지 않으며 WEB은 Server categoryLabel·levelTier만 표시한다.
 */
(function(){
  'use strict';

  const RPC='kinojo_character_skill_overview_v305';
  let observer=null;
  let requestSerial=0;
  let scheduled=false;

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

  function categoryLabel(category,serverLabel){
    const explicit=String(serverLabel||'').trim();
    if(explicit) return explicit;
    return ({active:'액티브',passive:'패시브',stigma:'스티그마',other:'기타'})[String(category||'').toLowerCase()]||'기타';
  }

  function skillCard(skill){
    const icon=safeUrl(skill?.icon);
    const level=Math.max(0,Number(skill?.level||0));
    const tier=Math.max(0,Math.min(5,Number(skill?.levelTier||0)));
    const category=String(skill?.category||'other').toLowerCase();
    const classes=['kinojo-character-skill-card','is-level-tier-'+tier];
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
    const order=['active','passive','stigma','other'];
    const groups=order.map(category=>{
      const rows=skills.filter(skill=>String(skill?.category||'other').toLowerCase()===category);
      return {category,rows,label:rows.length?categoryLabel(category,rows[0]?.categoryLabel):categoryLabel(category,'')};
    }).filter(group=>group.rows.length);
    section.innerHTML=
      '<div class="kinojo-character-live-section-head"><div><strong>스킬</strong><span>Server가 정규화한 현재 습득·장착 레벨</span></div><em>'+skills.length+'개</em></div>'+
      '<div class="kinojo-character-skill-groups">'+groups.map(group=>
        '<section><header><strong>'+esc(group.label)+'</strong><em>'+group.rows.length+'개</em></header><div class="kinojo-character-skill-list">'+group.rows.map(skillCard).join('')+'</div></section>'
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
      });
      observer.observe(document.body,{childList:true,subtree:true});
    }
    schedule();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
