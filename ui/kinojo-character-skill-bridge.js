/*
 * KINOJO Character Skill Bridge
 * 역할: Server가 정규화한 스킬 유형·레벨 강조 단계를 공통 캐릭터 모달에 연결한다.
 * 규칙: WEB은 스킬 유형이나 레벨 구간을 계산하지 않고 Server categoryLabel·levelTier만 표시한다.
 */
(function(){
  'use strict';

  const RPC_V304='kinojo_character_skill_overview_v304';
  const RPC_V305='kinojo_character_skill_overview_v305';
  const skillByName=new Map();
  let observer=null;
  let enhanceFrame=0;

  function normalizedName(value){
    return String(value||'').replace(/[\s\u200B-\u200D\uFEFF]+/g,'').trim();
  }

  function rememberSkills(rows){
    skillByName.clear();
    (Array.isArray(rows)?rows:[]).forEach(skill=>{
      const key=normalizedName(skill?.name);
      if(key) skillByName.set(key,skill);
    });
  }

  function compatibleResult(result){
    if(!result || result.ok!==true || !Array.isArray(result.skills)) return result;
    rememberSkills(result.skills);
    const skills=result.skills.map(skill=>Object.assign({},skill,{
      category:skill?.legacyCategory || (skill?.category==='stigma'?'dp':skill?.category)
    }));
    scheduleEnhance();
    return Object.assign({},result,{skills});
  }

  function enhanceCards(){
    enhanceFrame=0;
    const root=document.getElementById('kinojoCharacterReactionModal');
    if(!root) return;

    root.querySelectorAll('.kinojo-character-skill-card').forEach(card=>{
      const name=normalizedName(card.querySelector(':scope > span > b')?.textContent);
      const skill=skillByName.get(name);
      if(!skill) return;

      const tier=Math.max(0,Math.min(5,Number(skill.levelTier||0)));
      card.classList.remove('is-level-tier-0','is-level-tier-1','is-level-tier-2','is-level-tier-3','is-level-tier-4','is-level-tier-5','is-skill-stigma');
      card.classList.add('is-level-tier-'+tier);
      if(String(skill.category||'')==='stigma') card.classList.add('is-skill-stigma');
      card.dataset.kinojoSkillV305='true';
      card.dataset.levelBand=String(skill.levelBand||'normal');

      const icon=card.querySelector(':scope > .kinojo-character-skill-icon');
      const level=card.querySelector(':scope > strong');
      if(icon && level){
        level.className='kinojo-character-skill-level';
        icon.appendChild(level);
      }

      const detail=card.querySelector(':scope > span > small');
      if(detail){
        const label=String(skill.categoryLabel||'기타');
        detail.textContent=label+(skill.equip?' · 장착':'');
      }
    });

    root.querySelectorAll('.kinojo-character-skill-groups > section').forEach(section=>{
      if(!section.querySelector('.kinojo-character-skill-card.is-skill-stigma')) return;
      const title=section.querySelector(':scope > header > strong');
      if(title) title.textContent='스티그마';
    });
  }

  function scheduleEnhance(){
    if(enhanceFrame) return;
    enhanceFrame=requestAnimationFrame(enhanceCards);
  }

  function installObserver(){
    if(observer || !document.body) return;
    observer=new MutationObserver(records=>{
      if(records.some(record=>{
        if(record.type==='characterData') return false;
        return Array.from(record.addedNodes||[]).some(node=>
          node.nodeType===1 && (node.matches?.('.kinojo-character-skill-card,.kinojo-character-skill-list,.kinojo-character-live-panel') || node.querySelector?.('.kinojo-character-skill-card'))
        );
      })) scheduleEnhance();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function install(){
    const rpc=window.KinojoSupabaseRpcCore;
    if(!rpc || typeof rpc.rpc!=='function') return false;
    if(rpc.__characterSkillBridgeV305) return true;

    const originalRpc=rpc.rpc.bind(rpc);
    rpc.rpc=async function(name,payload){
      const requested=String(name||'')===RPC_V304?RPC_V305:String(name||'');
      const result=await originalRpc(requested,payload);
      return requested===RPC_V305?compatibleResult(result):result;
    };
    Object.defineProperty(rpc,'__characterSkillBridgeV305',{value:true,configurable:false});
    installObserver();
    return true;
  }

  function start(){
    installObserver();
    if(install()) return;
    let attempts=0;
    const timer=setInterval(()=>{
      attempts+=1;
      if(install() || attempts>=40) clearInterval(timer);
    },100);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
