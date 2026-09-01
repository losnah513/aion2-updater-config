(function(){
  'use strict';

  const EDIT_PRESENCE_INTERVAL=10000;
  const ITEM_LEVEL_ICON_URL='https://assets.playnccdn.com/static-aion2/characters/img/info/profile_level_icon_pc.png';
  const POWER_ICON_URL='https://assets.playnccdn.com/static-aion2/characters/img/info/profile_power_icon_pc.png';
  const CLASS_CODE_BY_NAME=Object.freeze({'수호성':'TEMPLAR','검성':'GLADIATOR','살성':'ASSASSIN','궁성':'RANGER','마도성':'SORCERER','정령성':'ELEMENTALIST','치유성':'CLERIC','호법성':'CHANTER','권성':'FIGHTER'});
  const CLASS_ICON_MAP=Object.freeze({'수호성':'templar','검성':'gladiator','살성':'assassin','궁성':'ranger','마도성':'sorcerer','정령성':'elementalist','치유성':'cleric','호법성':'chanter','권성':'fighter'});
  const presenceByTeam=new Map();
  let presenceActive=false;
  let layer=null;
  let opener=null;
  let state=null;

  const value=input=>String(input??'').trim();
  const integer=input=>Number.isSafeInteger(Number(input))?Number(input):0;
  const escapeHtml=input=>String(input??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const snapshot=()=>window.KinojoSanctuaryManagementDraftBridge?.snapshot?.()||null;
  const teamById=teamId=>window.KinojoSanctuaryManagementDraftBridge?.findTeam?.(Number(teamId))||null;
  const loggedIn=()=>{
    const auth=window.KinojoAuth||{},core=window.KinojoAuthSessionCore||{};
    const session=(typeof auth.getSession==='function'?auth.getSession():null)||(typeof core.getSession==='function'?core.getSession():null);
    return Boolean(session&&value(session.token));
  };
  function classIconFor(className){const key=CLASS_ICON_MAP[value(className).replace(/[\s\u200B-\u200D\uFEFF]+/g,'').replace(/[\[(（].*?[\])）]\s*$/g,'')];return key?'/assets/images/classes/class_icon_'+key+'.png':'';}
  function formatPower(input){const power=Number(input);return Number.isFinite(power)&&power>0?(power/1000).toFixed(1)+'K':'—';}
  function requestKey(prefix){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);}
  function leaseToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return 'smslot_'+Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');}

  function visibleTeamIds(){
    return Array.from(document.querySelectorAll('[data-sanctuary-team],[data-sanctuary-edit-team],[data-force-overview-edit]')).map(item=>integer(item.dataset.sanctuaryTeam||item.dataset.sanctuaryEditTeam||item.dataset.forceOverviewEdit)).filter((teamId,index,source)=>teamId>0&&source.indexOf(teamId)===index);
  }
  function setEditButtonState(button,status){
    const data=snapshot();
    button.classList.remove('is-checking','is-editing','is-status-error');
    if(!status){button.classList.add('is-status-error');button.textContent='확인 실패';button.disabled=true;return;}
    if(status.lockedByOther){button.classList.add('is-editing');button.textContent='편집 중';button.disabled=true;return;}
    button.textContent='편집하기';button.disabled=data?.writeEnabled!==true;
  }
  function applyPresence(){
    document.querySelectorAll('[data-sanctuary-edit-team],[data-force-overview-edit]').forEach(button=>{
      const teamId=integer(button.dataset.sanctuaryEditTeam||button.dataset.forceOverviewEdit);
      setEditButtonState(button,presenceByTeam.get(teamId)||null);
    });
  }
  async function refreshPresence(options={}){
    if(presenceActive||document.hidden||!loggedIn())return null;
    const ids=visibleTeamIds();if(!ids.length)return null;
    presenceActive=true;
    try{
      const result=await window.KinojoSanctuaryManagementData?.leaseStatus?.(ids);
      if(!result)throw new Error('편집 상태를 확인하지 못했습니다.');
      result.states.forEach(item=>presenceByTeam.set(integer(item.teamId),item));
      applyPresence();
      if(options.teamId)return presenceByTeam.get(integer(options.teamId))||null;
      return result;
    }catch(error){
      if(options.teamId)throw error;
      applyPresence();return null;
    }finally{presenceActive=false;}
  }
  async function statusForTeam(teamId){
    const result=await window.KinojoSanctuaryManagementData?.leaseStatus?.([Number(teamId)]);
    const status=result?.states?.find(item=>integer(item.teamId)===integer(teamId))||null;
    if(status)presenceByTeam.set(integer(teamId),status);
    applyPresence();return status;
  }

  function ensureLayer(){
    if(layer)return layer;
    layer=document.createElement('div');layer.className='sanctuary-inline-slot-layer';layer.hidden=true;layer.setAttribute('aria-hidden','true');document.body.appendChild(layer);
    layer.addEventListener('click',handleLayerClick);
    layer.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();closeModal();return;}
      if(event.key!=='Tab')return;
      const focusable=Array.from(layer.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(item=>item.offsetParent!==null);
      if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    return layer;
  }
  function closeModal(){
    if(!layer)return;const target=opener;layer.hidden=true;layer.setAttribute('aria-hidden','true');layer.replaceChildren();document.body.classList.remove('sanctuary-inline-slot-open');state=null;opener=null;target?.focus?.({preventScroll:true});
  }
  function showDialog(markup,focusSelector='[data-slot-modal-close]'){
    const host=ensureLayer();host.innerHTML='<div class="sanctuary-inline-slot-backdrop" data-slot-modal-backdrop></div>'+markup;host.hidden=false;host.setAttribute('aria-hidden','false');document.body.classList.add('sanctuary-inline-slot-open');requestAnimationFrame(()=>host.querySelector(focusSelector)?.focus?.());
  }
  function showBlocked(){
    showDialog('<section class="sanctuary-inline-slot-dialog is-compact" role="dialog" aria-modal="true" aria-labelledby="sanctuarySlotBlockedTitle" tabindex="-1"><header><span>EDIT STATUS</span><h2 id="sanctuarySlotBlockedTitle">편집할 수 없습니다</h2></header><p class="sanctuary-inline-slot-blocked">다른 이용자가 해당 팀 구성을 편집중입니다.</p><footer><button type="button" class="kinojo-btn" data-slot-modal-confirm>확인</button><button type="button" class="kinojo-btn secondary" data-slot-modal-close>닫기</button></footer></section>','[data-slot-modal-confirm]');
  }
  function showLogin(){
    showDialog('<section class="sanctuary-inline-slot-dialog is-compact" role="dialog" aria-modal="true" aria-labelledby="sanctuarySlotLoginTitle" tabindex="-1"><header><span>CHARACTER ADD</span><h2 id="sanctuarySlotLoginTitle">로그인이 필요합니다</h2></header><p class="sanctuary-inline-slot-blocked">로그인 후 내 캐릭터를 추가할 수 있습니다.</p><footer><button type="button" class="kinojo-btn" data-slot-modal-login>로그인</button><button type="button" class="kinojo-btn secondary" data-slot-modal-close>닫기</button></footer></section>');
  }
  function findSlot(team,forceId,partyNo,slotNo){return team?.forces?.find(force=>integer(force.forceId)===integer(forceId))?.parties?.find(party=>integer(party.partyNo)===integer(partyNo))?.slots?.find(slot=>integer(slot.slotNo)===integer(slotNo))||null;}
  function currentForce(){return state?.team?.forces?.find(force=>integer(force.forceId)===integer(state.forceId))||null;}
  function slotEligibility(character){
    const force=currentForce(),slot=findSlot(state?.team,state?.forceId,state?.partyNo,state?.slotNo);
    if(!character||!force||!slot)return {allowed:false,message:'캐릭터 정보를 확인하지 못했습니다.'};
    const characterId=integer(character.characterId),mainId=integer(character.mainCharacterId)||characterId;
    const occupants=force.parties.flatMap(party=>party.slots).filter(item=>item.occupied&&item.character).map(item=>item.character);
    if(occupants.some(item=>integer(item.characterId)===characterId))return {allowed:false,message:'이미 이 포스에 소속된 캐릭터입니다.'};
    if(occupants.some(item=>(integer(item.mainCharacterId)||integer(item.characterId))===mainId))return {allowed:false,message:'본캐 또는 부캐가 이미 이 포스에 소속되어 있습니다.'};
    const required=value(slot.requiredClassCode||'ALL').toUpperCase(),actual=value(character.classCode||CLASS_CODE_BY_NAME[value(character.className)]).toUpperCase();
    if(required!=='ALL'&&required!==actual)return {allowed:false,message:'이 슬롯의 모집 클래스와 다릅니다.'};
    const minimum=integer(force.minimumItemLevel||state.team.minimumItemLevel),itemLevel=integer(character.itemLevel);
    if(minimum&&itemLevel<minimum)return {allowed:false,message:'캐릭터의 아이템레벨이 부족합니다.'};
    if(!state.team.canEdit&&Array.isArray(character.availableForceIds)&&!character.availableForceIds.includes(integer(force.forceId)))return {allowed:false,message:value(character.disabledMessage)||'이 포스에 지원할 수 없습니다.'};
    return {allowed:true,message:''};
  }
  function resultCharacter(result){return result?.kind==='CHARACTER_MASTER'?result.character:result?.candidate||null;}
  function characterCardMarkup(character,index,kind='OWN'){
    const eligibility=slotEligibility(character),icon=classIconFor(character.className),selected=state.selectedKind===kind&&integer(state.selectedIndex)===index;
    const name=value(character.characterName||character.name)||'이름 미확인',server=value(character.serverName)||'서버 미확인';
    return '<button type="button" class="sanctuary-inline-character-card'+(selected?' is-selected':'')+'" data-slot-character-kind="'+kind+'" data-slot-character-index="'+index+'" '+(eligibility.allowed?'':'disabled')+' aria-pressed="'+(selected?'true':'false')+'">'+
      '<span class="sanctuary-inline-character-class">'+(icon?'<img src="'+escapeHtml(icon)+'" alt="'+escapeHtml(value(character.className))+'">':'?')+'</span><span class="sanctuary-inline-character-copy"><strong>'+escapeHtml(name)+'</strong><small>['+escapeHtml(server)+'] · '+escapeHtml(value(character.className)||'클래스 미확인')+'</small><span><b><img src="'+ITEM_LEVEL_ICON_URL+'" alt="아이템레벨">'+escapeHtml(integer(character.itemLevel)||'—')+'</b><b><img src="'+POWER_ICON_URL+'" alt="전투력">'+escapeHtml(formatPower(character.power))+'</b></span>'+(eligibility.allowed?'':'<em>'+escapeHtml(eligibility.message)+'</em>')+'</span></button>';
  }
  function officialRelationMarkup(){
    if(state.selectedKind!=='SEARCH')return '';
    const result=state.searchResults[state.selectedIndex],candidate=result?.kind==='OFFICIAL'?result.candidate:null;if(!candidate)return '';
    const relations=candidate.allowedRelations||[];if(relations.length<=1)return '';
    const mains=(snapshot()?.composerCharacters?.characters||[]).filter(character=>character.isMain===true);
    return '<div class="sanctuary-inline-relation"><strong>캐릭터 관계</strong><div>'+relations.map(relation=>'<button type="button" class="'+(state.relation===relation?'is-selected':'')+'" data-slot-relation="'+relation+'">'+({MAIN:'본캐',ALT:'부캐',GUEST:'게스트'}[relation]||relation)+'</button>').join('')+'</div>'+(state.relation==='ALT'?'<label>연결할 본캐<select data-slot-main-character><option value="">본캐 선택</option>'+mains.map(main=>'<option value="'+integer(main.characterId)+'" '+(integer(state.mainCharacterId)===integer(main.characterId)?'selected':'')+'>'+escapeHtml(main.characterName)+' ['+escapeHtml(main.serverName)+']</option>').join('')+'</select></label>':'')+'</div>';
  }
  function selectedResult(){
    if(state.selectedIndex<0)return null;
    if(state.selectedKind==='OWN')return {kind:'CHARACTER_MASTER',character:state.ownCharacters[state.selectedIndex]};
    if(state.selectedKind==='SEARCH')return state.searchResults[state.selectedIndex]||null;
    return null;
  }
  function canAdd(){
    const result=selectedResult(),character=resultCharacter(result);if(!result||!slotEligibility(character).allowed||state.busy)return false;
    if(result.kind==='OFFICIAL'){const relations=result.candidate.allowedRelations||[];const relation=state.relation||relations[0]||'';if(!relations.includes(relation)||relation==='ALT'&&!integer(state.mainCharacterId))return false;}
    return true;
  }
  function renderBody(){
    const body=layer?.querySelector('[data-slot-modal-body]');if(!body||!state)return;
    const ownMode=state.mode==='OWN';
    if(ownMode){
      body.innerHTML='<div class="sanctuary-inline-character-grid">'+(state.ownCharacters.length?state.ownCharacters.map((character,index)=>characterCardMarkup(character,index,'OWN')).join(''):'<p class="sanctuary-inline-empty">추가할 수 있는 내 캐릭터가 없습니다.</p>')+'</div>';
    }else{
      body.innerHTML='<form class="sanctuary-inline-search" data-slot-search-form><input type="text" maxlength="12" placeholder="캐릭터명[서버]" aria-label="캐릭터명 또는 캐릭터명 서버" value="'+escapeHtml(state.query)+'"><button type="submit" class="kinojo-btn" '+(state.busy?'disabled':'')+'>조회하기</button><button type="button" class="kinojo-btn secondary" data-slot-modal-close>닫기</button></form><p class="sanctuary-inline-search-status" data-slot-search-status>'+escapeHtml(state.searchMessage)+'</p><div class="sanctuary-inline-character-grid">'+state.searchResults.map((result,index)=>characterCardMarkup(resultCharacter(result),index,'SEARCH')).join('')+'</div>'+officialRelationMarkup();
    }
    const add=layer.querySelector('[data-slot-add-confirm]');if(add){add.disabled=!canAdd();add.textContent=state.busy?'처리 중':'추가하기';}
  }
  function renderModal(){
    const team=state.team,force=team.forces.find(item=>integer(item.forceId)===integer(state.forceId));
    const modes=team.canEdit?'<button type="button" class="is-own" data-slot-mode="OWN" aria-pressed="'+(state.mode==='OWN')+'">내 캐릭터 추가하기</button><button type="button" class="is-other" data-slot-mode="SEARCH" aria-pressed="'+(state.mode==='SEARCH')+'">다른 캐릭터 추가하기</button>':'<button type="button" class="is-own" data-slot-mode="OWN" aria-pressed="true">내 캐릭터 추가하기</button>';
    showDialog('<section class="sanctuary-inline-slot-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuarySlotTitle" tabindex="-1"><header><div><span>CHARACTER ADD</span><h2 id="sanctuarySlotTitle">빈 슬롯에 캐릭터 추가</h2><p>'+escapeHtml(team.title)+' · '+escapeHtml(force?.forceNo)+'포스 · '+escapeHtml(state.partyNo)+'파티 '+escapeHtml(state.slotNo)+'번</p></div><button type="button" data-slot-modal-close aria-label="닫기">×</button></header><nav class="sanctuary-inline-slot-modes" aria-label="캐릭터 추가 방식">'+modes+'</nav><div class="sanctuary-inline-slot-body" data-slot-modal-body></div><footer><p data-slot-action-status></p><button type="button" class="kinojo-btn primary" data-slot-add-confirm disabled>추가하기</button><button type="button" class="kinojo-btn secondary" data-slot-modal-close>닫기</button></footer></section>','[data-slot-mode]');
    renderBody();
  }
  async function openSlot(button){
    opener=button;const team=teamById(button.dataset.sanctuarySlotTeam);if(!team)return;
    if(!loggedIn()){showLogin();return;}
    button.disabled=true;
    try{
      const status=await statusForTeam(team.teamId);if(status?.lockedByOther){showBlocked();return;}
      const slot=findSlot(team,button.dataset.sanctuarySlotForce,button.dataset.sanctuarySlotParty,button.dataset.sanctuarySlotNo);if(!slot||slot.occupied){window.KinojoToast?.error?.('이미 채워진 슬롯입니다.');return;}
      state={team,forceId:integer(button.dataset.sanctuarySlotForce),partyNo:integer(button.dataset.sanctuarySlotParty),slotNo:integer(button.dataset.sanctuarySlotNo),mode:'OWN',ownCharacters:team.canEdit?(snapshot()?.composerCharacters?.characters||[]):(team.supportCharacters?.characters||[]),searchResults:[],query:'',searchMessage:'',selectedKind:'',selectedIndex:-1,relation:'',mainCharacterId:0,busy:false};
      renderModal();
    }catch(error){window.KinojoToast?.error?.(value(error?.message)||'편집 상태를 확인하지 못했습니다.');}
    finally{if(button.isConnected)button.disabled=false;}
  }
  async function requestEditor(button){
    const teamId=integer(button.dataset.sanctuaryEditTeam||button.dataset.forceOverviewEdit),team=teamById(teamId);if(!team)return;
    button.disabled=true;button.classList.add('is-checking');button.textContent='확인 중';
    try{
      const status=await statusForTeam(teamId);if(status?.lockedByOther){showBlocked();return;}
      if(button.dataset.forceOverviewEdit!=null)document.querySelector('[data-force-overview-close]')?.click();
      window.KinojoSanctuaryManagementDraftUI?.openDraft?.(team,button);
    }catch(error){window.KinojoToast?.error?.(value(error?.message)||'편집 상태를 확인하지 못했습니다.');}
    finally{if(button.isConnected)setEditButtonState(button,presenceByTeam.get(teamId)||null);}
  }
  async function searchCharacters(form){
    const input=form.querySelector('input'),query=value(input?.value);if(!query){state.searchMessage='캐릭터명을 입력해 주세요.';renderBody();return;}
    if(Array.from(query).length>12){state.searchMessage='검색어는 12자까지 입력할 수 있습니다.';renderBody();return;}
    state.busy=true;state.query=query;state.searchMessage='전체 서버에서 공식 캐릭터를 조회하고 있습니다.';state.searchResults=[];state.selectedIndex=-1;renderBody();
    try{const result=await window.KinojoSanctuaryManagementData.searchSlotCharacters(state.team.teamId,query);state.searchResults=result.results;state.searchMessage=result.results.length+'명의 캐릭터를 찾았습니다.'+(result.failureCount?' · 일부 서버 정보 확인 실패':'');}
    catch(error){state.searchMessage=value(error?.message)||'캐릭터를 조회하지 못했습니다.';}
    finally{state.busy=false;renderBody();}
  }
  function selectCharacter(button){
    state.selectedKind=value(button.dataset.slotCharacterKind);state.selectedIndex=integer(button.dataset.slotCharacterIndex);const result=selectedResult();
    if(result?.kind==='OFFICIAL'){const relations=result.candidate.allowedRelations||[];state.relation=relations.length===1?relations[0]:(relations.includes('MAIN')?'MAIN':relations[0]||'');state.mainCharacterId=0;}else{state.relation='';state.mainCharacterId=0;}
    renderBody();
  }
  async function addSelected(){
    if(!canAdd())return;const button=layer.querySelector('[data-slot-add-confirm]'),statusNode=layer.querySelector('[data-slot-action-status]'),teamId=integer(state.team.teamId);state.busy=true;renderBody();if(statusNode)statusNode.textContent='Server에 최신 편집 상태를 확인하고 있습니다.';
    let token='';
    try{
      const latestStatus=await statusForTeam(teamId);if(latestStatus?.lockedByOther){showBlocked();return;}
      let result=selectedResult(),character=resultCharacter(result);
      if(state.team.canEdit){
        token=leaseToken();await window.KinojoSanctuaryManagementDraftBridge.lease(state.team.teamId,'ACQUIRE',token);
        if(result.kind==='OFFICIAL'){
          const relation=state.relation||(result.candidate.allowedRelations||[])[0];
          const registered=await window.KinojoSanctuaryManagementDraftBridge.registerCharacter(state.team.teamId,result.candidate.candidateId,relation,relation==='ALT'?integer(state.mainCharacterId):null,requestKey('sm-slot-character'));
          character=registered.character;
        }
        const currentTeam=teamById(state.team.teamId)||state.team;
        await window.KinojoSanctuaryManagementDraftBridge.setSlot(currentTeam.teamId,state.forceId,state.partyNo,state.slotNo,character.characterId,currentTeam.revision,requestKey('sm-inline-slot'),token);
        closeModal();window.KinojoToast?.success?.(value(character.characterName||character.name)+' 캐릭터를 추가했습니다.');
      }else{
        await window.KinojoSanctuaryManagementSupportBridge.submitSupport(state.team.teamId,[{forceId:state.forceId,assignmentKind:'ACTUAL_CHARACTER',characterId:character.characterId}],requestKey('sm-inline-support'));
        closeModal();window.KinojoToast?.success?.('선택한 캐릭터로 지원했습니다.');
      }
    }catch(error){if(statusNode&&statusNode.isConnected)statusNode.textContent=value(error?.message)||'캐릭터를 추가하지 못했습니다.';window.KinojoToast?.error?.(value(error?.message)||'캐릭터를 추가하지 못했습니다.');}
    finally{if(token)window.KinojoSanctuaryManagementDraftBridge?.lease?.(teamId,'RELEASE',token).catch(()=>{});if(state){state.busy=false;renderBody();}if(button?.isConnected&&state)button.disabled=!canAdd();}
  }
  function handleLayerClick(event){
    if(event.target.closest('[data-slot-modal-backdrop],[data-slot-modal-close],[data-slot-modal-confirm]')){closeModal();return;}
    if(event.target.closest('[data-slot-modal-login]')){closeModal();document.getElementById('kinojoLoginBtn')?.click();return;}
    const mode=event.target.closest('[data-slot-mode]');if(mode){state.mode=value(mode.dataset.slotMode);state.selectedKind='';state.selectedIndex=-1;renderModal();return;}
    const character=event.target.closest('[data-slot-character-kind]');if(character&&!character.disabled){selectCharacter(character);return;}
    const relation=event.target.closest('[data-slot-relation]');if(relation){state.relation=value(relation.dataset.slotRelation);state.mainCharacterId=0;renderBody();return;}
    const add=event.target.closest('[data-slot-add-confirm]');if(add&&!add.disabled){addSelected();return;}
  }
  function bind(){
    ensureLayer();
    document.addEventListener('click',event=>{
      const slot=event.target.closest?.('[data-sanctuary-slot-add]');if(slot){event.preventDefault();event.stopImmediatePropagation();openSlot(slot);return;}
      const edit=event.target.closest?.('[data-sanctuary-edit-team],[data-force-overview-edit]');if(edit&&!edit.disabled){event.preventDefault();event.stopImmediatePropagation();requestEditor(edit);}
    },true);
    document.addEventListener('submit',event=>{const form=event.target.closest?.('[data-slot-search-form]');if(!form)return;event.preventDefault();searchCharacters(form);});
    document.addEventListener('change',event=>{const select=event.target.closest?.('[data-slot-main-character]');if(!select||!state)return;state.mainCharacterId=integer(select.value);renderBody();});
    window.addEventListener('kinojo:sanctuary-management-rendered',()=>refreshPresence());
    window.addEventListener('focus',()=>refreshPresence());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPresence();});
    window.setInterval(refreshPresence,EDIT_PRESENCE_INTERVAL);
    refreshPresence();
  }

  window.KinojoSanctuaryInlineSlotUI=Object.freeze({refreshPresence,openSlot,close:closeModal});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
