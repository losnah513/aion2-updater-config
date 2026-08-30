(function(){
  'use strict';

  const state={layer:null,opener:null,onClose:null,teamId:0,activeForceId:0,assignments:new Map(),saving:false,message:'',tone:'',result:null};
  const value=input=>String(input??'').trim();
  const integer=input=>Number.isSafeInteger(Number(input))?Number(input):0;
  const escapeHtml=input=>String(input??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const bridge=()=>window.KinojoSanctuaryManagementSupportBridge;
  const requestKey=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
  const team=()=>bridge()?.findTeam?.(state.teamId)||null;
  const forces=()=>Array.isArray(team()?.forces)?team().forces.slice().sort((a,b)=>integer(a.forceNo)-integer(b.forceNo)):[];
  const characters=()=>Array.isArray(team()?.supportCharacters?.characters)?team().supportCharacters.characters:[];
  const actorId=()=>integer(bridge()?.snapshot?.()?.actor?.memberId);
  const CLASS_ICON_MAP={
    '검성':'gladiator','수호성':'templar','궁성':'ranger','살성':'assassin',
    '마도성':'sorcerer','정령성':'elementalist','치유성':'cleric','호법성':'chanter','권성':'fighter',
    'gladiator':'gladiator','templar':'templar','ranger':'ranger','assassin':'assassin',
    'sorcerer':'sorcerer','elementalist':'elementalist','cleric':'cleric','chanter':'chanter','fighter':'fighter','brawler':'fighter'
  };
  function classIconFor(className){const slug=CLASS_ICON_MAP[value(className)];return slug?'/assets/images/classes/class_icon_'+slug+'.png':'';}

  function ensureLayer(){
    if(state.layer&&document.body.contains(state.layer))return state.layer;
    const layer=document.createElement('section');layer.id='sanctuaryManagementSupportLayer';layer.className='sanctuary-management-support-layer';layer.hidden=true;layer.setAttribute('aria-hidden','true');
    layer.addEventListener('click',handleClick);layer.addEventListener('keydown',handleKeydown);layer.addEventListener('scroll',event=>{if(event.target.matches?.('.sanctuary-management-support-scroll'))syncFade();},true);
    window.addEventListener('resize',()=>requestAnimationFrame(syncFade));document.body.appendChild(layer);state.layer=layer;return layer;
  }

  function activeForce(){return forces().find(force=>integer(force.forceId)===state.activeForceId)||forces()[0]||null;}
  function characterFor(id){return characters().find(character=>integer(character.characterId)===integer(id))||null;}
  function assignmentOwner(characterId){for(const [forceId,id] of state.assignments){if(id===integer(characterId))return forceId;}return 0;}
  function eligible(character,force){
    if(!force)return {ok:false,message:'지원할 포스를 선택해 주세요.'};
    const owner=assignmentOwner(character.characterId);
    if(owner&&owner!==integer(force.forceId))return {ok:false,message:'이미 다른 포스에 선택한 캐릭터입니다.'};
    if(value(character.disabledCode))return {ok:false,message:value(character.disabledMessage)||'이 캐릭터는 현재 지원할 수 없습니다.'};
    if(!character.availableForceIds.includes(integer(force.forceId)))return {ok:false,message:value(force.supportDisabledMessage)||'이 포스에는 현재 지원할 수 없습니다.'};
    return {ok:true,message:''};
  }

  function forceMarkup(force){
    const selected=integer(force.forceId)===integer(activeForce()?.forceId);const assigned=state.assignments.get(integer(force.forceId));
    const label=force.viewerAlreadyAssigned?'참여 중':force.viewerPending?'승인 대기':assigned?characterFor(assigned)?.characterName||'선택 완료':force.canSupport?'빈자리 '+force.vacancyCount:value(force.supportDisabledMessage)||'지원 불가';
    return '<button type="button" data-support-force="'+force.forceId+'" aria-pressed="'+selected+'" class="'+(selected?'is-active ':'')+(assigned?'is-selected ':'')+(force.canSupport?'can-support':'is-unavailable')+'"><strong>'+force.forceNo+'포스</strong><small>'+escapeHtml(label)+'</small></button>';
  }

  function characterMarkup(character,force){
    const selected=state.assignments.get(integer(force?.forceId))===integer(character.characterId);const allowed=eligible(character,force);const owner=assignmentOwner(character.characterId);
    const reason=allowed.ok?'선택하면 '+force.forceNo+'포스에 지원합니다.':allowed.message;
    const classIcon=classIconFor(character.className);
    const avatar=classIcon?'<img src="'+escapeHtml(classIcon)+'" alt="" aria-hidden="true">':'<span aria-hidden="true">?</span>';
    return '<button type="button" class="sanctuary-management-support-character '+(selected?'is-selected ':'')+(!allowed.ok?'is-disabled':'')+'" data-support-character="'+character.characterId+'" aria-pressed="'+selected+'" aria-disabled="'+(!allowed.ok)+'"'+(state.saving?' disabled':'')+'><span class="sanctuary-management-support-avatar" title="'+escapeHtml(character.className||'클래스 정보 없음')+'">'+avatar+'</span><span><em>'+(character.isMain?'본캐':'부캐')+'</em><strong>'+escapeHtml(character.characterName)+'</strong><small>'+escapeHtml([character.serverName,character.className].filter(Boolean).join(' · '))+'</small><i>'+escapeHtml(owner&&owner!==integer(force?.forceId)?'다른 포스에 선택됨':reason)+'</i></span></button>';
  }

  function batchMarkup(batch){
    const mine=integer(batch.requesterMemberId)===actorId();const pending=integer(batch.pendingCount)>0;
    const items=batch.items.map(item=>'<li class="is-'+escapeHtml(value(item.status).toLowerCase())+'"><strong>'+item.forceNo+'포스 · '+escapeHtml(item.characterName)+'</strong><small>'+escapeHtml(item.resultMessage||item.status)+'</small></li>').join('');
    let actions='';
    if(pending&&team()?.canEdit)actions='<button type="button" data-support-decision="APPROVE" data-support-batch="'+batch.supportBatchId+'">승인</button><button type="button" class="is-danger" data-support-decision="REJECT" data-support-batch="'+batch.supportBatchId+'">거절</button>';
    if(pending&&mine)actions+='<button type="button" class="is-secondary" data-support-cancel="'+batch.supportBatchId+'">지원 취소</button>';
    return '<article class="sanctuary-management-support-batch"><header><div><strong>'+escapeHtml(batch.requesterName||'내 지원')+'</strong><small>'+escapeHtml(batch.status)+' · '+batch.itemCount+'건</small></div><div>'+actions+'</div></header><ul>'+items+'</ul></article>';
  }

  function resultMarkup(){
    const batch=state.result?.batch;if(!batch||!Array.isArray(batch.items))return '';
    const items=batch.items.map(item=>'<li class="is-'+escapeHtml(value(item.status).toLowerCase())+'"><strong>'+item.forceNo+'포스 · '+escapeHtml(item.characterName)+'</strong><small>'+escapeHtml(item.resultMessage||item.status)+'</small></li>').join('');
    return '<section class="sanctuary-management-support-result" aria-live="polite"><strong>처리 결과 · '+escapeHtml(batch.status)+'</strong><ul>'+items+'</ul></section>';
  }

  function markup(){
    const current=team(),force=activeForce();if(!current)return '<div class="sanctuary-management-support-backdrop" data-support-close></div>';
    const forceButtons=forces().map(forceMarkup).join('');
    const cards=characters().map(character=>characterMarkup(character,force)).join('')||'<div class="sanctuary-management-support-empty"><strong>지원할 내 캐릭터가 없습니다.</strong><p>내 정보에서 본캐·부캐 소유 관계를 먼저 확인해 주세요.</p></div>';
    const batches=(current.supportBatches||[]).filter(batch=>integer(batch.pendingCount)>0||integer(batch.requesterMemberId)===actorId()).map(batchMarkup).join('');
    const selected=Array.from(state.assignments.entries()).sort((a,b)=>a[0]-b[0]);
    const summary=selected.length?selected.map(([forceId,characterId])=>{const f=forces().find(item=>integer(item.forceId)===forceId),c=characterFor(characterId);return (f?.forceNo||'?')+'포스 '+(c?.characterName||'');}).join(' · '):'포스를 고른 뒤 내 캐릭터를 선택하세요.';
    return '<div class="sanctuary-management-support-backdrop" data-support-close></div><section class="sanctuary-management-support-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuarySupportTitle" tabindex="-1"><header><div><span>PARTICIPATION SUPPORT</span><h2 id="sanctuarySupportTitle">'+escapeHtml(current.title)+' 지원하기</h2><p>'+escapeHtml(current.joinPolicy==='APPROVAL'?'승인 참가 · 운영자 승인 시 빈 슬롯에 배치':'즉시 참가 · 빈 슬롯에 바로 배치')+'</p></div><button type="button" data-support-close aria-label="닫기">×</button></header><div class="sanctuary-management-support-scroll"><nav class="sanctuary-management-support-forces" aria-label="지원할 포스">'+forceButtons+'</nav><section class="sanctuary-management-support-characters" aria-labelledby="sanctuarySupportCharacters"><header><strong id="sanctuarySupportCharacters">'+escapeHtml(force?.forceNo||'')+'포스 캐릭터 선택</strong><small>포스마다 본캐·부캐 중 1개 · 여러 포스 중복 선택 가능</small></header><div>'+cards+'</div></section>'+resultMarkup()+(batches?'<section class="sanctuary-management-support-batches"><header><strong>지원 요청 현황</strong><small>승인 대기는 운영자가 처리하고, 본인 요청은 취소할 수 있습니다.</small></header>'+batches+'</section>':'')+'</div><footer><p class="sanctuary-management-support-status is-'+escapeHtml(state.tone||'normal')+'" role="status">'+escapeHtml(state.message||summary)+'</p><div><button type="button" class="is-primary" data-support-submit '+(!selected.length||state.saving?'disabled':'')+'>'+(state.saving?'처리 중…':'지원하기 · '+selected.length+'개')+'</button><button type="button" data-support-close '+(state.saving?'disabled':'')+'>닫기</button></div></footer></section>';
  }

  function render(focusSelector=''){
    const layer=ensureLayer();layer.innerHTML=markup();requestAnimationFrame(()=>{syncFade();const target=focusSelector?layer.querySelector(focusSelector):null;target?.focus?.({preventScroll:true});});
  }

  function syncFade(){const scroll=state.layer?.querySelector('.sanctuary-management-support-scroll');state.layer?.querySelector('.sanctuary-management-support-dialog')?.classList.toggle('has-more',Boolean(scroll&&scroll.scrollTop+scroll.clientHeight<scroll.scrollHeight-2));}
  function open(targetTeam,forceId,opener,options={}){
    if(!targetTeam||value(targetTeam.mode)!=='PARTICIPATION'||bridge()?.snapshot?.()?.writeEnabled!==true)return;
    state.opener=opener||document.activeElement;state.onClose=typeof options?.onClose==='function'?options.onClose:null;state.teamId=integer(targetTeam.teamId);state.activeForceId=integer(forceId)||integer(targetTeam.forces?.[0]?.forceId);state.assignments=new Map();state.saving=false;state.message='';state.tone='';state.result=null;
    const layer=ensureLayer();layer.hidden=false;layer.setAttribute('aria-hidden','false');document.body.classList.add('sanctuary-management-support-open');render();requestAnimationFrame(()=>layer.querySelector('[data-support-force][aria-pressed="true"]')?.focus());
  }

  function close(){if(state.saving)return;const target=state.opener,onClose=state.onClose,layer=ensureLayer();layer.hidden=true;layer.setAttribute('aria-hidden','true');layer.replaceChildren();document.body.classList.remove('sanctuary-management-support-open');state.opener=null;state.onClose=null;state.teamId=0;state.activeForceId=0;state.assignments=new Map();state.result=null;if(onClose)onClose();else target?.focus?.({preventScroll:true});}
  function setMessage(message,tone='warning'){state.message=message;state.tone=tone;render();}

  async function submit(){
    if(state.saving||!state.assignments.size)return;state.saving=true;state.message='선택한 포스의 일정 충돌과 마지막 빈자리를 Server에서 다시 확인하고 있습니다.';state.tone='progress';render();
    try{const result=await bridge().submitSupport(state.teamId,Array.from(state.assignments,([forceId,characterId])=>({forceId,characterId})),requestKey('sm-support'));state.result=result;state.assignments=new Map();state.saving=false;state.message='지원 요청을 처리했습니다. 포스별 결과를 확인해 주세요.';state.tone='success';render();window.KinojoToast?.success?.('참여 지원 결과를 반영했습니다.');}
    catch(error){state.saving=false;setMessage(value(error?.message)||'참여 지원을 처리하지 못했습니다.','error');}
  }

  async function decide(batchId,decision){
    if(state.saving)return;if(decision==='REJECT'&&!window.confirm('선택한 지원 요청을 거절할까요?'))return;state.saving=true;state.message=decision==='APPROVE'?'승인 시점의 일정 충돌과 빈자리를 다시 확인합니다.':'지원 요청을 거절하고 있습니다.';state.tone='progress';render();
    try{const result=await bridge().decideSupport(batchId,decision,'',requestKey('sm-support-decision'));state.result=result;state.saving=false;state.message=decision==='APPROVE'?'지원 승인 결과를 반영했습니다.':'지원 요청을 거절했습니다.';state.tone='success';render();}
    catch(error){state.saving=false;setMessage(value(error?.message)||'지원 요청을 처리하지 못했습니다.','error');}
  }

  async function cancel(batchId){
    if(state.saving||!window.confirm('승인 대기 중인 지원을 취소할까요?'))return;state.saving=true;state.message='승인 대기 지원을 취소하고 있습니다.';state.tone='progress';render();
    try{const result=await bridge().cancelSupport(batchId,requestKey('sm-support-cancel'));state.result=result;state.saving=false;state.message='승인 대기 지원을 취소했습니다.';state.tone='success';render();}
    catch(error){state.saving=false;setMessage(value(error?.message)||'지원을 취소하지 못했습니다.','error');}
  }

  function handleClick(event){
    if(event.target.closest('[data-support-close]')){close();return;}
    const forceButton=event.target.closest('[data-support-force]');if(forceButton&&!state.saving){state.activeForceId=integer(forceButton.dataset.supportForce);state.message='';state.tone='';render('[data-support-force="'+state.activeForceId+'"]');return;}
    const characterButton=event.target.closest('[data-support-character]');if(characterButton&&!state.saving){const character=characterFor(characterButton.dataset.supportCharacter),force=activeForce(),allowed=eligible(character,force);if(!allowed.ok){setMessage(allowed.message);return;}const forceId=integer(force.forceId),characterId=integer(character.characterId);if(state.assignments.get(forceId)===characterId)state.assignments.delete(forceId);else state.assignments.set(forceId,characterId);state.message='';state.tone='';render('[data-support-character="'+characterId+'"]');return;}
    if(event.target.closest('[data-support-submit]')){submit();return;}
    const decision=event.target.closest('[data-support-decision]');if(decision){decide(integer(decision.dataset.supportBatch),value(decision.dataset.supportDecision));return;}
    const cancellation=event.target.closest('[data-support-cancel]');if(cancellation)cancel(integer(cancellation.dataset.supportCancel));
  }

  function handleKeydown(event){
    if(event.key==='Escape'){event.preventDefault();close();return;}if(event.key!=='Tab')return;
    const focusable=Array.from(state.layer.querySelectorAll('button:not(:disabled),[tabindex="0"]')).filter(item=>item.offsetParent!==null);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }

  window.KinojoSanctuaryManagementSupportUI=Object.freeze({open,close});
})();
