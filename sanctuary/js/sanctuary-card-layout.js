/*
 * KINOJO Sanctuary Character Card Layout - Stage 5-FB
 * 역할: 기존 성역 캐릭터 카드의 외곽 크기는 유지하고 내부 시각 배치만 재구성합니다.
 * 프로필 이미지는 Server가 내려준 effective profile URL만 사용하며 원본 종횡비를 유지합니다.
 */
(function(){
  'use strict';

  const POWER_ICON_URL='https://assets.playnccdn.com/static-aion2/characters/img/info/profile_power_icon_pc.png';
  const TARGET_SELECTOR='.char-card.san-reaction-card';

  function classIconUrl(card,className){
    const direct=String(card?.dataset?.classIcon||'').trim();
    if(direct)return direct;
    const reaction=window.KinojoCharacterReaction;
    if(reaction&&typeof reaction.classIconFor==='function')return String(reaction.classIconFor(className)||'').trim();
    const profile=window.KinojoCharacterProfileImage;
    if(profile&&typeof profile.classIconFor==='function')return String(profile.classIconFor(className)||'').trim();
    return '';
  }

  function normalizePower(value){
    return String(value??'').replaceAll(',','').trim();
  }

  function powerTexts(value){
    const raw=normalizePower(value);
    const helper=window.KinojoPowerFormat||{};
    const numeric=Number(raw||0);
    const fallback=Number.isFinite(numeric)&&numeric>0?numeric.toLocaleString('ko-KR'):'-';
    let shortText=fallback;
    let fullText=fallback;
    try{if(typeof helper.short==='function')shortText=String(helper.short(raw)||fallback)}catch(_error){}
    try{if(typeof helper.full==='function')fullText=String(helper.full(raw)||fallback)}catch(_error){}
    return {shortText,fullText};
  }

  function el(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined&&text!==null)node.textContent=String(text);
    return node;
  }

  function buildClassEmblem(card,className){
    const wrap=el('span','san-char-class-emblem');
    const icon=classIconUrl(card,className);
    if(icon){
      const img=document.createElement('img');
      img.src=icon;
      img.alt='';
      img.loading='lazy';
      img.decoding='async';
      wrap.append(img);
    }else{
      wrap.classList.add('is-fallback');
      wrap.append(el('span','san-char-class-fallback',String(className||'?').slice(0,1)||'?'));
    }
    return wrap;
  }

  function buildIdentityBadge(card){
    const source=card.querySelector('.san-identity-badge');
    if(!source||!String(source.textContent||'').trim())return null;
    const badge=el('span','san-char-identity-badge',String(source.textContent||'').trim());
    const title=String(source.getAttribute('title')||source.getAttribute('aria-label')||badge.textContent||'').trim();
    if(title){badge.title=title;badge.setAttribute('aria-label',title)}
    return badge;
  }

  function buildProfile(card,name){
    const stage=el('span','san-char-profile-stage');
    const url=String(card.dataset.profileImage||'').trim();
    if(url){
      const img=document.createElement('img');
      img.className='san-char-profile-image';
      img.src=url;
      img.alt=name?name+' 프로필':'';
      img.loading='lazy';
      img.decoding='async';
      stage.append(img);
    }else{
      stage.classList.add('is-empty');
    }
    const identity=buildIdentityBadge(card);
    if(identity)stage.append(identity);
    return stage;
  }

  function buildNameBadge(card,owner){
    const isMain=card.classList.contains('is-main-character');
    const badge=el('span',isMain?'san-char-main-badge':'san-char-sub-badge',isMain?'본캐':'부캐');
    if(!isMain&&owner){
      const detail='부캐 · 본캐 '+owner;
      badge.title=detail;
      badge.setAttribute('aria-label',detail);
    }
    return badge;
  }

  function applyCard(card){
    if(!(card instanceof Element)||card.dataset.sanCardLayout==='5fb')return;

    const name=String(card.dataset.charName||'').trim();
    const className=String(card.dataset.charClass||'직업 미확인').trim()||'직업 미확인';
    const owner=String(card.dataset.charOwner||'').trim();
    const power=powerTexts(card.dataset.pvePower||card.dataset.charPower||'');

    const classEmblem=buildClassEmblem(card,className);
    const content=el('span','san-char-card-content');
    const nameRow=el('span','san-char-name-row');
    nameRow.append(el('span','char-name',name||'-'),buildNameBadge(card,owner));

    const powerRow=el('span','san-char-power-row');
    powerRow.title='정확한 전투력 '+power.fullText;
    const powerIcon=document.createElement('img');
    powerIcon.className='san-char-power-icon';
    powerIcon.src=POWER_ICON_URL;
    powerIcon.alt='';
    powerIcon.loading='lazy';
    powerIcon.decoding='async';
    powerRow.append(powerIcon,el('span','san-char-power-value',power.shortText));
    content.append(nameRow,powerRow);

    const profile=buildProfile(card,name);
    card.replaceChildren(classEmblem,content,profile);
    card.dataset.sanCardLayout='5fb';
  }

  function applyAll(root){
    const scope=root&&root.querySelectorAll?root:document;
    if(scope.matches&&scope.matches(TARGET_SELECTOR))applyCard(scope);
    scope.querySelectorAll?.(TARGET_SELECTOR).forEach(applyCard);
  }

  function start(){
    applyAll(document);
    const root=document.getElementById('teamList')||document.body;
    if(!root)return;
    const observer=new MutationObserver(records=>{
      for(const record of records){
        for(const node of record.addedNodes){
          if(node.nodeType===Node.ELEMENT_NODE)applyAll(node);
        }
      }
    });
    observer.observe(root,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
