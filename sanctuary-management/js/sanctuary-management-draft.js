(function(){
  'use strict';

  const WEEKDAYS=Object.freeze([
    {value:3,label:'수'},{value:4,label:'목'},{value:5,label:'금'},{value:6,label:'토'},
    {value:7,label:'일'},{value:1,label:'월'},{value:2,label:'화'}
  ]);
  const state={layer:null,opener:null,team:null,creationMode:'FIXED',joinPolicy:'INSTANT',selectedForceId:0,selectedSlotId:0,moveFromSlotId:0,draggedSlotId:0,requestKey:'',forceSaveRequestKey:'',forceAddRequestKey:'',slotRequestKey:'',moveRequestKey:'',characterRequestKey:'',leaseToken:'',leaseTimer:0,message:'',tone:'',saving:false,mutating:false,lookup:null,mainLookup:null,relationType:''};
  const value=input=>String(input??'').trim();
  const escapeHtml=input=>String(input??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const bridge=()=>window.KinojoSanctuaryManagementDraftBridge;

  function resetCharacterLookup(){state.lookup=null;state.mainLookup=null;state.relationType='';state.characterRequestKey='';}

  function newLeaseToken(){
    const bytes=new Uint8Array(32);
    if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(bytes);
    else for(let index=0;index<bytes.length;index+=1)bytes[index]=Math.floor(Math.random()*256);
    return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  function stopLeaseRenewal(){if(state.leaseTimer){clearInterval(state.leaseTimer);state.leaseTimer=0;}}

  async function acquireLease(){
    if(!state.team)return;
    state.leaseToken=newLeaseToken();
    await bridge().lease(Number(state.team.teamId),'ACQUIRE',state.leaseToken);
    stopLeaseRenewal();
    state.leaseTimer=setInterval(()=>{
      if(state.team&&state.leaseToken)bridge().lease(Number(state.team.teamId),'RENEW',state.leaseToken).catch(()=>setStatus('편집 잠금을 갱신하지 못했습니다. 저장 전 다시 열어 주세요.','error'));
    },60000);
  }

  function todayKst(){
    return new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
  }

  function sanctuaryItems(){return Array.isArray(bridge()?.snapshot()?.sanctuaries)?bridge().snapshot().sanctuaries:[];}
  function sanctuaryCode(item){return value(item?.code)||value(item?.id);}
  function sanctuaryLabel(item){return value(item?.shortName)||value(item?.name)||sanctuaryCode(item);}
  function sanctuaryForTeam(team){return sanctuaryItems().find(item=>String(item.id)===String(team?.sanctuaryId))||null;}
  function selectedCode(){
    const fromTeam=sanctuaryForTeam(state.team);
    if(fromTeam)return sanctuaryCode(fromTeam);
    const requested=value(new URLSearchParams(location.search).get('id'));
    if(requested&&sanctuaryItems().some(item=>sanctuaryCode(item)===requested))return requested;
    return sanctuaryCode(sanctuaryItems()[0]);
  }

  function defaultSchedule(){
    const sanctuary=sanctuaryItems().find(item=>sanctuaryCode(item)===selectedCode());
    const startsOn=value(sanctuary?.availableFrom)||todayKst();
    return {kind:'WEEKLY',startsOn,weekdays:[4],startsAt:'21:00',durationMinutes:30};
  }

  function currentSchedule(){
    const schedule=state.team?.schedule;
    if(!schedule||typeof schedule!=='object')return defaultSchedule();
    return {
      kind:value(schedule.kind)==='ONCE'?'ONCE':'WEEKLY',
      startsOn:value(schedule.startsOn)||todayKst(),
      weekdays:Array.isArray(schedule.weekdays)?schedule.weekdays.map(Number).filter(Number.isInteger):[],
      startsAt:value(schedule.startsAt)||'21:00',
      durationMinutes:Number(schedule.durationMinutes)||30
    };
  }

  function ensureLayer(){
    if(state.layer&&document.body.contains(state.layer))return state.layer;
    const layer=document.createElement('section');
    layer.id='sanctuaryManagementDraftLayer';
    layer.className='sanctuary-management-draft-layer';
    layer.hidden=true;
    layer.setAttribute('aria-hidden','true');
    layer.addEventListener('click',handleClick);
    layer.addEventListener('keydown',handleKeydown);
    layer.addEventListener('change',handleChange);
    layer.addEventListener('dragstart',handleDragStart);
    layer.addEventListener('dragover',handleDragOver);
    layer.addEventListener('drop',handleDrop);
    layer.addEventListener('dragend',handleDragEnd);
    layer.addEventListener('scroll',event=>{
      if(event.target.matches?.('.sanctuary-management-builder-dialog,.sanctuary-management-schedule-scroll,.sanctuary-management-force-list,.sanctuary-management-candidate-list'))syncScrollFade(event.target);
    },true);
    window.addEventListener('resize',()=>requestAnimationFrame(syncScrollFades));
    document.body.appendChild(layer);
    state.layer=layer;
    return layer;
  }

  function openLayer(opener){
    const layer=ensureLayer();
    state.opener=opener||document.activeElement;
    layer.hidden=false;
    layer.setAttribute('aria-hidden','false');
    document.body.classList.add('sanctuary-management-draft-open');
  }

  function close(){
    const layer=ensureLayer();
    layer.hidden=true;
    layer.setAttribute('aria-hidden','true');
    layer.replaceChildren();
    document.body.classList.remove('sanctuary-management-draft-open');
    const target=state.opener;
    const teamId=Number(state.team?.teamId||0),leaseToken=state.leaseToken;
    stopLeaseRenewal();
    state.opener=null;state.team=null;state.creationMode='FIXED';state.joinPolicy='INSTANT';state.selectedForceId=0;state.selectedSlotId=0;state.moveFromSlotId=0;state.draggedSlotId=0;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.moveRequestKey='';state.leaseToken='';state.message='';state.tone='';state.saving=false;state.mutating=false;resetCharacterLookup();
    if(teamId&&leaseToken)bridge()?.lease?.(teamId,'RELEASE',leaseToken).catch(()=>{});
    try{target?.focus({preventScroll:true});}catch(_error){target?.focus?.();}
  }

  function focusDialog(selector){
    requestAnimationFrame(()=>{
      const target=state.layer?.querySelector(selector)||state.layer?.querySelector('[role="dialog"]');
      try{target?.focus({preventScroll:true});}catch(_error){target?.focus?.();}
      syncScrollFades();
    });
    setTimeout(syncScrollFades,160);
  }

  function syncScrollFade(scroller){
    if(!scroller)return;
    const hasMore=scroller.scrollTop+scroller.clientHeight<scroller.scrollHeight-2;
    const shell=scroller.matches('.sanctuary-management-builder-dialog')?scroller.closest('.sanctuary-management-draft-frame'):scroller.matches('.sanctuary-management-force-list')?scroller.closest('.sanctuary-management-force-rail'):scroller.matches('.sanctuary-management-candidate-list')?scroller.closest('.sanctuary-management-candidate-rail'):scroller.closest('.sanctuary-management-schedule-panel');
    shell?.classList.toggle('has-more',hasMore);
  }

  function syncScrollFades(){
    state.layer?.querySelectorAll('.sanctuary-management-builder-dialog,.sanctuary-management-schedule-scroll,.sanctuary-management-force-list,.sanctuary-management-candidate-list').forEach(syncScrollFade);
  }

  function openMode(opener){
    if(!bridge()?.snapshot()?.writeEnabled)return;
    state.team=null;state.creationMode='FIXED';state.joinPolicy='INSTANT';state.selectedForceId=0;state.selectedSlotId=0;state.moveFromSlotId=0;state.draggedSlotId=0;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.moveRequestKey='';state.leaseToken='';state.message='';state.tone='';state.saving=false;state.mutating=false;resetCharacterLookup();
    openLayer(opener);
    state.layer.innerHTML='<div class="sanctuary-management-draft-backdrop" data-draft-close></div>'
      +'<section class="sanctuary-management-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryDraftModeTitle" aria-describedby="sanctuaryDraftModeDescription" tabindex="-1">'
        +'<header><span>CREATE TEAM</span><h2 id="sanctuaryDraftModeTitle">팀 생성 방식을 선택하세요</h2><p id="sanctuaryDraftModeDescription">두 방식 모두 일정과 포스를 Server DRAFT로 저장하고 다시 불러올 수 있습니다.</p></header>'
        +'<div class="sanctuary-management-mode-options">'
          +'<button type="button" data-draft-mode="fixed"><span aria-hidden="true">◆</span><strong>고정 팀 생성</strong><small>팀 정보와 일정을 DRAFT로 먼저 저장합니다.</small><em>초안 작성 시작</em></button>'
          +'<button type="button" data-draft-mode="participation"><span aria-hidden="true">＋</span><strong>참여 팀 생성</strong><small>첫 포스 추가 시 DRAFT와 1포스가 함께 생성됩니다.</small><em>참여 구성 시작</em></button>'
        +'</div>'
        +'<footer><p>저장은 Edge command와 DB revision을 통해서만 처리됩니다.</p><button type="button" data-draft-close>닫기</button></footer>'
      +'</section>';
    focusDialog('[data-draft-mode="fixed"]');
  }

  function teamForces(){
    return Array.isArray(state.team?.forces)?state.team.forces.slice().sort((left,right)=>Number(left.forceNo)-Number(right.forceNo)):[];
  }

  function currentMode(){return value(state.team?.mode||state.creationMode).toUpperCase()==='PARTICIPATION'?'PARTICIPATION':'FIXED';}
  function currentJoinPolicy(){return value(state.joinPolicy).toUpperCase()==='APPROVAL'?'APPROVAL':'INSTANT';}
  function participationReady(){const forces=teamForces();return currentMode()==='PARTICIPATION'&&forces.length>0&&forces.every(force=>force.creatorAlreadyAssigned===true);}

  function selectedForce(){
    const forces=teamForces();
    return forces.find(force=>Number(force.forceId)===Number(state.selectedForceId))||forces[0]||null;
  }

  function forceSlots(force=selectedForce()){
    if(!force||!Array.isArray(force.parties))return [];
    return force.parties.flatMap(party=>(Array.isArray(party.slots)?party.slots:[]).map(slot=>({partyNo:Number(party.partyNo),slot}))).sort((left,right)=>left.partyNo-right.partyNo||Number(left.slot.slotNo)-Number(right.slot.slotNo));
  }

  function selectedSlot(){
    return forceSlots().find(item=>Number(item.slot.slotId)===Number(state.selectedSlotId))||null;
  }

  function slotDisplayNumber(item){return item?(item.partyNo-1)*5+Number(item.slot.slotNo):0;}

  function forceRailMarkup(){
    const forces=teamForces();
    const active=selectedForce();
    const busy=state.saving||state.mutating;
    if(!state.team){
      if(currentMode()==='PARTICIPATION'){
        return '<div class="sanctuary-management-force-list"><button type="button" class="is-add" data-draft-add-force'+(busy?' disabled':'')+'><strong>+ 포스 추가</strong><small>1포스 생성 · 최대 9</small></button></div><p>처음 누르면 참여 팀 DRAFT와 1포스·10슬롯을 함께 생성합니다.</p>';
      }
      return '<div class="sanctuary-management-force-list"><button type="button" class="is-active" disabled><strong>1포스</strong><small>저장 후 Server 생성</small></button></div><p>새 DRAFT 저장 시 1포스와 10슬롯을 Server가 생성합니다.</p>';
    }
    const buttons=forces.map(force=>{
      const selected=Number(force.forceId)===Number(active?.forceId);
      return '<button type="button" data-draft-force="'+escapeHtml(force.forceId)+'" class="'+(selected?'is-active':'')+'" aria-pressed="'+selected+'"'+(busy?' disabled':'')+'><strong>'+escapeHtml(force.forceNo)+'포스</strong><small>'+escapeHtml(force.occupiedCount)+' / '+escapeHtml(force.capacity)+'명 · rev '+escapeHtml(force.revision)+'</small></button>';
    }).join('');
    const add=forces.length<9?'<button type="button" class="is-add" data-draft-add-force'+(busy?' disabled':'')+'><strong>+ 포스 추가</strong><small>다음 '+(forces.length+1)+'포스 · 최대 9</small></button>':'<button type="button" class="is-add is-limit" data-draft-add-force aria-disabled="true"'+(busy?' disabled':'')+'><strong>최대 9포스</strong><small>10번째 포스는 추가할 수 없음</small></button>';
    return '<div class="sanctuary-management-force-list" data-force-list>'+buttons+add+'</div><p>Server 포스 '+forces.length+'/9 · 선택한 포스의 10슬롯을 표시합니다.</p>';
  }

  function slotMarkup(slot,partyNo){
    const number=(Number(partyNo)-1)*5+Number(slot.slotNo);
    const occupied=slot.occupied===true&&slot.character;
    const selected=!occupied&&Number(slot.slotId)===Number(state.selectedSlotId);
    const moving=Number(slot.slotId)===Number(state.moveFromSlotId);
    const name=occupied?value(slot.character.name):'빈 슬롯';
    const detail=occupied?[value(slot.character.serverName),value(slot.character.className),value(slot.character.relation)].filter(Boolean).join(' · '):selected?'후보를 선택해 추가':'눌러서 캐릭터 선택';
    const disabled=state.saving||state.mutating;
    return '<button type="button" class="sanctuary-management-draft-slot'+(occupied?' is-occupied':'')+(selected?' is-selected':'')+(moving?' is-move-source':'')+'"'+(disabled?' disabled':'')+(occupied?' draggable="true"':'')+' data-draft-slot data-slot-id="'+escapeHtml(slot.slotId)+'" data-slot-revision="'+escapeHtml(slot.revision)+'" data-party-no="'+escapeHtml(partyNo)+'" data-slot-no="'+escapeHtml(slot.slotNo)+'" data-occupied="'+String(Boolean(occupied))+'" aria-pressed="'+String(selected||moving)+'"><span>'+number+'</span><strong>'+escapeHtml(name)+'</strong><small>'+escapeHtml(moving?'이동할 위치를 선택하세요':detail)+'</small></button>';
  }

  function candidateMarkup(){
    const force=selectedForce();
    const chosen=selectedSlot();
    if(!state.team||!force)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty"><span aria-hidden="true">◇</span><strong>초안 저장 후 연결</strong><p>Server가 생성자의 소유 캐릭터를 확인합니다.</p></div></aside>';
    if(!chosen)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty"><span aria-hidden="true">◇</span><strong>빈 슬롯 선택</strong><p>'+escapeHtml(force.forceNo)+'포스의 빈 카드를 누르면 내 캐릭터와 검색 창을 표시합니다.</p></div></aside>';
    const candidates=Array.isArray(force.creatorCandidates)?force.creatorCandidates:[];
    const slotNumber=slotDisplayNumber(chosen);
    const quickCards=candidates.map(candidate=>{
      const relation=candidate.isMain?'본캐':'부캐';
      const initial=Array.from(value(candidate.characterName)||'?')[0]||'?';
      return '<button type="button" class="sanctuary-management-candidate-card" data-draft-candidate="'+escapeHtml(candidate.characterId)+'"'+(state.saving||state.mutating?' disabled':'')+'><span class="sanctuary-management-candidate-avatar" aria-hidden="true">'+escapeHtml(initial)+'</span><span class="sanctuary-management-candidate-copy"><em>'+relation+'</em><strong>'+escapeHtml(candidate.characterName)+'</strong><small>'+escapeHtml([candidate.serverName,candidate.className].filter(Boolean).join(' · '))+'</small></span></button>';
    }).join('');
    let quick='';
    if(force.creatorOwnerResolved!==true)quick='<div class="sanctuary-management-candidate-note is-warning"><strong>생성자 소유권 확인 필요</strong><small>'+escapeHtml(force.creatorCandidateCode||'OWNER_NOT_RESOLVED')+'</small></div>';
    else if(force.creatorAlreadyAssigned===true)quick='<div class="sanctuary-management-candidate-note is-complete"><strong>생성자 배치 완료</strong><small>다른 구성원을 검색해 추가할 수 있습니다.</small></div>';
    else if(quickCards)quick='<section class="sanctuary-management-quick-candidates"><strong>내 캐릭터</strong>'+quickCards+'</section>';
    else quick='<div class="sanctuary-management-candidate-note"><strong>내 캐릭터 후보 없음</strong><small>이름으로 다른 구성원을 검색할 수 있습니다.</small></div>';
    let resultMarkup='<div class="sanctuary-management-search-empty"><strong>캐릭터 마스터 우선 조회</strong><small>없을 때만 아이온2 공식 정보를 확인합니다.</small></div>';
    if(state.lookup?.loading)resultMarkup='<div class="sanctuary-management-search-empty is-progress"><strong>Server 조회 중…</strong><small>캐릭터 마스터와 공식 정보를 순서대로 확인합니다.</small></div>';
    else if(state.lookup?.error)resultMarkup='<div class="sanctuary-management-search-empty is-warning"><strong>조회하지 못했습니다.</strong><small>'+escapeHtml(state.lookup.error)+'</small></div>';
    else if(state.lookup?.character){
      const character=state.lookup.character;
      resultMarkup='<article class="sanctuary-management-search-result"><div><em>'+escapeHtml(character.relation==='GUEST'?'게스트':character.relation==='MAIN'?'본캐':'부캐')+'</em><strong>'+escapeHtml(character.characterName)+'</strong><small>'+escapeHtml([character.serverName,character.className,character.legionName].filter(Boolean).join(' · '))+'</small></div><button type="button" data-draft-search-character="'+escapeHtml(character.characterId)+'">추가하기</button></article>';
    }else if(state.lookup?.candidate){
      const candidate=state.lookup.candidate;const allowed=candidate.allowedRelations||[];
      const relationButtons=allowed.map(relation=>'<button type="button" data-draft-relation="'+relation+'" aria-pressed="'+String(state.relationType===relation)+'">'+(relation==='MAIN'?'본캐':relation==='ALT'?'부캐':'게스트')+'</button>').join('');
      let relationBody='';
      if(state.relationType==='ALT'){
        let mainResult='<small>본캐 이름을 조회해 정확한 소유 관계를 연결합니다.</small>';
        if(state.mainLookup?.loading)mainResult='<small>본캐를 Server에서 확인하는 중입니다…</small>';
        else if(state.mainLookup?.error)mainResult='<small class="is-error">'+escapeHtml(state.mainLookup.error)+'</small>';
        else if(state.mainLookup?.character)mainResult='<div class="sanctuary-management-main-confirmed"><strong>'+escapeHtml(state.mainLookup.character.characterName)+'</strong><small>본캐 확인 완료</small></div>';
        else if(state.mainLookup?.candidate)mainResult='<div class="sanctuary-management-main-official"><strong>'+escapeHtml(state.mainLookup.candidate.characterName)+'</strong><small>마스터에 없어 공식 확인이 필요합니다.</small><button type="button" data-draft-register-main>본캐로 먼저 등록</button></div>';
        relationBody='<div class="sanctuary-management-main-search" data-main-search-form role="search"><label><span>연결할 본캐</span><input name="mainCharacterQuery" size="16" maxlength="48" placeholder="본캐 또는 본캐[서버]" autocomplete="off"></label><button type="button" data-main-search-submit>검색</button></div>'+mainResult;
      }
      const canRegister=Boolean(state.relationType&&state.relationType!=='ALT'||state.relationType==='ALT'&&state.mainLookup?.character);
      resultMarkup='<article class="sanctuary-management-official-result"><div class="sanctuary-management-official-card"><em>아이온2 공식 확인</em><strong>'+escapeHtml(candidate.characterName)+'</strong><small>'+escapeHtml([candidate.serverName,candidate.className,candidate.legionName||'레기온 없음'].join(' · '))+'</small></div><p>'+(candidate.isOperationalLegion?'운영 레기온 캐릭터입니다. 본캐 또는 연결할 본캐를 확인해 주세요.':'외부 레기온 또는 레기온 미가입 캐릭터로 게스트 등록할 수 있습니다.')+'</p><div class="sanctuary-management-relation-buttons">'+relationButtons+'</div>'+relationBody+'<button type="button" class="sanctuary-management-register-character" data-draft-register-character'+(canRegister?'':' disabled')+'>관계 확정 후 추가</button></article>';
    }
    const creatorOnly=currentMode()==='PARTICIPATION'&&value(state.team?.status)==='DRAFT';
    if(creatorOnly)return '<aside class="sanctuary-management-candidate-rail" aria-label="'+escapeHtml(force.forceNo)+'포스 생성자 캐릭터 선택"><header><strong>내 캐릭터 선택</strong><small>'+slotNumber+'번 슬롯 · 포스마다 1개</small></header><div class="sanctuary-management-candidate-list" data-candidate-list>'+quick+'<div class="sanctuary-management-candidate-note"><strong>참여 팀 생성 조건</strong><small>각 포스에 생성자의 서로 다른 본캐·부캐를 하나씩 추가해야 합니다.</small></div></div></aside>';
    return '<aside class="sanctuary-management-candidate-rail" aria-label="'+escapeHtml(force.forceNo)+'포스 '+slotNumber+'번 슬롯 캐릭터 선택"><header><strong>캐릭터 선택</strong><small>'+slotNumber+'번 슬롯 · 이름은 16자까지</small></header><div class="sanctuary-management-candidate-list" data-candidate-list>'+quick+'<div class="sanctuary-management-character-search" data-character-search-form role="search"><label><span>캐릭터 검색</span><input name="characterQuery" size="16" maxlength="48" placeholder="이름 또는 이름[서버]" autocomplete="off" required></label><button type="button" data-character-search-submit'+(state.lookup?.loading?' disabled':'')+'>검색</button></div>'+resultMarkup+'</div><button type="button" class="sanctuary-management-search-reset" data-draft-search-reset>조회 초기화</button></aside>';
  }

  function rosterMarkup(){
    const force=selectedForce();
    if(!force){
      const slots=Array.from({length:10},(_,index)=>'<button type="button" class="sanctuary-management-draft-slot" disabled data-occupied="false"><span>'+(index+1)+'</span><strong>생성 대기</strong><small>'+(index<5?'1파티':'2파티')+' · Server 저장 전</small></button>').join('');
      return '<main class="sanctuary-management-roster" aria-label="저장 전 1포스 슬롯 미리보기"><div class="sanctuary-management-party-labels"><span>1파티 · 1–5번</span><span>2파티 · 6–10번</span></div><div class="sanctuary-management-draft-slot-grid">'+slots+'</div></main>';
    }
    const parties=force.parties.slice().sort((left,right)=>Number(left.partyNo)-Number(right.partyNo));
    const labels=parties.map(party=>'<span>'+escapeHtml(party.partyNo)+'파티 · '+escapeHtml(party.occupiedCount)+'/'+escapeHtml(party.capacity)+'명</span>').join('');
    const slots=parties.map(party=>party.slots.map(slot=>slotMarkup(slot,party.partyNo)).join('')).join('');
    return '<main class="sanctuary-management-roster" aria-label="'+escapeHtml(force.forceNo)+'포스 Server 슬롯"><div class="sanctuary-management-party-labels">'+labels+'</div><div class="sanctuary-management-draft-slot-grid">'+slots+'</div></main>';
  }

  function defaultStatus(){
    const force=selectedForce();
    if(!force)return currentMode()==='PARTICIPATION'?'[+ 포스 추가]를 누르면 참여 팀 DRAFT와 1포스·2파티·10슬롯이 생성됩니다.':'새 DRAFT는 저장할 때 1포스·2파티·10슬롯이 Server에 생성됩니다.';
    return force.forceNo+'포스 · '+force.occupiedCount+'/'+force.capacity+'명 · 빈자리 '+force.vacancyCount+' · Server revision '+force.revision;
  }

  function renderRosterState(){
    const rail=state.layer?.querySelector('.sanctuary-management-force-rail');
    if(rail)rail.innerHTML=forceRailMarkup();
    const roster=state.layer?.querySelector('.sanctuary-management-roster');
    if(roster)roster.outerHTML=rosterMarkup();
    const candidates=state.layer?.querySelector('.sanctuary-management-candidate-rail');
    if(candidates)candidates.outerHTML=candidateMarkup();
    requestAnimationFrame(syncScrollFades);
  }

  function modeMarkup(){
    const schedule=currentSchedule();
    const sanctuaryOptions=sanctuaryItems().map(item=>{
      const code=sanctuaryCode(item);const available=value(item.availableFrom);
      return '<option value="'+escapeHtml(code)+'"'+(code===selectedCode()?' selected':'')+' data-available-from="'+escapeHtml(available)+'">'+escapeHtml(sanctuaryLabel(item))+(available?' · '+escapeHtml(available)+'부터':'')+'</option>';
    }).join('');
    const weekdays=WEEKDAYS.map(day=>'<label><input type="checkbox" name="draftWeekday" value="'+day.value+'"'+(schedule.weekdays.includes(day.value)?' checked':'')+'><span>'+day.label+'</span></label>').join('');
    const isWeekly=schedule.kind==='WEEKLY';
    const editing=Boolean(state.team);
    const active=editing&&['ACTIVE','FULL'].includes(value(state.team.status));
    const draft=editing&&value(state.team.status)==='DRAFT';
    const busy=state.saving||state.mutating;
    const participation=currentMode()==='PARTICIPATION';
    const ready=participationReady();
    const modeLabel=participation?'참여 팀':'고정 팀';
    const joinPolicy=currentJoinPolicy();
    const submitLabel=state.saving?'처리 중…':state.mutating?'변경 중…':participation?(active?'저장':draft?'참여 팀 생성':'1포스 먼저 추가'):(active?'저장':draft?'팀 생성':'구성 시작');
    const joinPolicyMarkup=participation?'<div class="sanctuary-management-join-policy"><strong>참가 방식</strong><div class="sanctuary-management-schedule-kind" role="group" aria-label="참가 방식"><button type="button" data-draft-join-policy="INSTANT" aria-pressed="'+(joinPolicy==='INSTANT')+'">즉시 참가</button><button type="button" data-draft-join-policy="APPROVAL" aria-pressed="'+(joinPolicy==='APPROVAL')+'">승인 참가</button></div><small>즉시 참가는 빈 슬롯에 바로 배치되고, 승인 참가는 운영자 확인 후 배치됩니다.</small></div>':'';
    return '<div class="sanctuary-management-draft-backdrop" data-draft-close></div>'
      +'<div class="sanctuary-management-draft-frame">'
        +'<form class="sanctuary-management-builder-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryDraftTitle" aria-describedby="sanctuaryDraftDescription" tabindex="-1" data-draft-form>'
          +'<div class="sanctuary-management-builder-layout">'
            +'<section class="sanctuary-management-composer">'
              +'<header class="sanctuary-management-composer-title"><div><span>TEAM &amp; FORCE</span><h2 id="sanctuaryDraftTitle">'+modeLabel+' '+(active?'편집':draft?'구성 계속':'구성 시작')+'</h2><p id="sanctuaryDraftDescription">팀 아래 모든 포스는 하나의 일정으로 저장됩니다.</p></div><label><span>팀 제목</span><input name="draftTitle" maxlength="80" required value="'+escapeHtml(state.team?.title||'')+'" placeholder="예: 1팀 목요일 21시"></label></header>'
              +'<div class="sanctuary-management-composer-middle">'
                +'<aside class="sanctuary-management-force-rail" aria-label="포스 선택">'+forceRailMarkup()+'</aside>'
                +rosterMarkup()
                +candidateMarkup()
              +'</div>'
              +'<footer class="sanctuary-management-composer-actions"><p class="sanctuary-management-draft-status'+(state.tone?' is-'+escapeHtml(state.tone):'')+'" data-draft-status role="status">'+escapeHtml(state.message||defaultStatus())+'</p><div><button type="submit" class="is-primary'+(participation&&draft&&!ready?' is-requirement-pending':'')+'" aria-disabled="'+String(participation&&draft&&!ready)+'"'+(busy?' disabled':'')+'>'+submitLabel+'</button><button type="button" data-draft-reset'+(busy?' disabled':'')+'>초기화</button><button type="button" data-draft-close'+(busy?' disabled':'')+'>닫기</button></div></footer>'
            +'</section>'
            +'<section class="sanctuary-management-schedule-panel" aria-labelledby="sanctuaryDraftScheduleTitle">'
              +'<header><span>SCHEDULE</span><h3 id="sanctuaryDraftScheduleTitle">팀 일정 입력</h3><p>팀 아래 모든 포스가 같은 일정과 진행 시간을 공유합니다.</p></header>'
              +'<div class="sanctuary-management-schedule-scroll">'
                +'<div class="sanctuary-management-week-note"><strong>아이온2 주간</strong><span>수요일 → 화요일</span></div>'
                +'<label class="sanctuary-management-field"><span>진행 성역</span><select name="draftSanctuary" required>'+sanctuaryOptions+'</select></label>'
                +'<label class="sanctuary-management-field"><span>진행 내용</span><input name="draftActivity" maxlength="24" required value="'+escapeHtml(state.team?.activity||'')+'" placeholder="예: 성역1 진행"></label>'
                +joinPolicyMarkup
                +'<div class="sanctuary-management-schedule-kind" role="group" aria-label="일정 반복 방식"><button type="button" data-draft-kind="WEEKLY" aria-pressed="'+isWeekly+'">매주 반복</button><button type="button" data-draft-kind="ONCE" aria-pressed="'+(!isWeekly)+'">1회성</button></div>'
                +'<input type="hidden" name="draftKind" value="'+schedule.kind+'">'
                +'<fieldset class="sanctuary-management-weekdays"'+(isWeekly?'':' hidden')+'><legend>반복 요일</legend><div>'+weekdays+'</div><small>종료일 없이 선택한 요일마다 반복됩니다.</small></fieldset>'
                +'<label class="sanctuary-management-field"><span>'+(isWeekly?'반복 시작일':'진행 날짜')+'</span><input type="date" name="draftStartsOn" required value="'+escapeHtml(schedule.startsOn)+'"></label>'
                +'<label class="sanctuary-management-field"><span>시작 시각</span><input type="time" name="draftStartsAt" step="1800" required value="'+escapeHtml(schedule.startsAt)+'"></label>'
                +'<label class="sanctuary-management-field"><span>진행 시간</span><select name="draftDuration">'+[30,60,90,120,150,180,210,240].map(minutes=>'<option value="'+minutes+'"'+(minutes===schedule.durationMinutes?' selected':'')+'>'+minutes+'분</option>').join('')+'</select><small>기본·최소 30분, 30분 단위</small></label>'
                +'<div class="sanctuary-management-schedule-preview"><span>저장 상태</span><strong>'+(editing?'DB '+escapeHtml(state.team.status)+' · revision '+escapeHtml(state.team.revision):'새 Server 구성')+'</strong><small>'+(participation?(ready?'모든 포스에 생성자의 서로 다른 캐릭터가 1개씩 배치되어 팀 생성 조건을 충족했습니다.':'1~9포스 각각에 생성자의 서로 다른 본캐·부캐를 하나씩 추가해야 참여 팀을 생성할 수 있습니다.'):'빈 슬롯이 있어도 생성할 수 있으며, 생성자 캐릭터는 최소 1개 필요합니다.')+'</small></div>'
              +'</div>'
            +'</section>'
          +'</div>'
        +'</form>'
      +'</div>';
  }

  async function openDraft(team,opener){
    if(!bridge()?.snapshot()?.writeEnabled)return;
    state.team=team&&typeof team==='object'?team:null;
    if(state.team){state.creationMode=value(state.team.mode).toUpperCase()==='PARTICIPATION'?'PARTICIPATION':'FIXED';state.joinPolicy=value(state.team.joinPolicy).toUpperCase()==='APPROVAL'?'APPROVAL':'INSTANT';}
    state.selectedForceId=Number(state.team?.forces?.[0]?.forceId||0);
    state.selectedSlotId=0;state.moveFromSlotId=0;state.draggedSlotId=0;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.moveRequestKey='';state.message='';state.tone='';state.saving=false;state.mutating=Boolean(state.team);resetCharacterLookup();
    openLayer(opener||state.opener);
    state.layer.innerHTML=modeMarkup();
    syncDateMinimum();
    focusDialog('.sanctuary-management-builder-dialog');
    if(state.team){
      try{
        setStatus('Server 편집 잠금을 확인하고 있습니다.','progress');
        await acquireLease();
        state.mutating=false;
        state.layer.innerHTML=modeMarkup();syncDateMinimum();focusDialog('.sanctuary-management-builder-dialog');
      }catch(error){state.mutating=false;setStatus(value(error?.message)||'팀 편집 잠금을 가져오지 못했습니다.','error');setControlsDisabled(true);state.layer?.querySelector('[data-draft-close]')?.removeAttribute('disabled');}
    }
  }

  function syncDateMinimum(){
    const form=state.layer?.querySelector('[data-draft-form]');
    if(!form)return;
    const select=form.elements.draftSanctuary;
    const option=select?.selectedOptions?.[0];
    const minimum=value(option?.dataset.availableFrom);
    const date=form.elements.draftStartsOn;
    if(date){date.min=minimum;if(minimum&&value(date.value)<minimum)date.value=minimum;}
  }

  function readModel(){
    const form=state.layer?.querySelector('[data-draft-form]');
    const kind=value(form?.elements.draftKind?.value)==='ONCE'?'ONCE':'WEEKLY';
    const weekdays=kind==='WEEKLY'?Array.from(form.querySelectorAll('input[name="draftWeekday"]:checked')).map(input=>Number(input.value)):[];
    return {
      teamId:Number(state.team?.teamId||0)||null,
      revision:Number(state.team?.revision||0)||null,
      status:value(state.team?.status),
      mode:currentMode(),
      joinPolicy:currentJoinPolicy(),
      leaseToken:state.leaseToken,
      requestKey:state.requestKey,
      sanctuaryCode:value(form?.elements.draftSanctuary?.value),
      title:value(form?.elements.draftTitle?.value),
      activity:value(form?.elements.draftActivity?.value),
      schedule:{
        kind,
        startsOn:value(form?.elements.draftStartsOn?.value),
        weekdays,
        startsAt:value(form?.elements.draftStartsAt?.value),
        durationMinutes:Number(form?.elements.draftDuration?.value)||30
      }
    };
  }

  function validate(model){
    if(!model.title||model.title.length>80)return '팀 제목을 1자 이상 80자 이하로 입력해 주세요.';
    if(!model.sanctuaryCode)return '진행 성역을 선택해 주세요.';
    if(!model.activity||model.activity.length>24)return '진행 내용을 1자 이상 24자 이하로 입력해 주세요.';
    if(!model.schedule.startsOn)return model.schedule.kind==='WEEKLY'?'반복 시작일을 입력해 주세요.':'진행 날짜를 입력해 주세요.';
    if(!model.schedule.startsAt)return '시작 시각을 입력해 주세요.';
    if(model.schedule.kind==='WEEKLY'&&!model.schedule.weekdays.length)return '반복할 요일을 하나 이상 선택해 주세요.';
    if(model.schedule.durationMinutes<30||model.schedule.durationMinutes%30!==0)return '진행 시간은 30분부터 30분 단위로 선택해 주세요.';
    const selected=sanctuaryItems().find(item=>sanctuaryCode(item)===model.sanctuaryCode);
    const available=value(selected?.availableFrom);
    if(available&&model.schedule.startsOn<available)return sanctuaryLabel(selected)+' 일정은 '+available+'부터 등록할 수 있습니다.';
    return '';
  }

  function setStatus(message,tone='warning'){
    state.message=message;state.tone=tone;
    const status=state.layer?.querySelector('[data-draft-status]');
    if(status){status.textContent=message;status.className='sanctuary-management-draft-status is-'+tone;}
  }

  function setControlsDisabled(disabled){
    state.layer?.querySelectorAll('button,input,select').forEach(control=>{
      if(disabled){
        if(control.disabled)control.dataset.draftWasDisabled='true';
        control.disabled=true;
        return;
      }
      control.disabled=control.dataset.draftWasDisabled==='true';
      delete control.dataset.draftWasDisabled;
    });
  }

  async function save(){
    if(state.saving||state.mutating)return;
    const model=readModel();
    const issue=validate(model);
    if(issue){setStatus(issue);return;}
    if(model.mode==='PARTICIPATION'&&!state.team){setStatus('왼쪽 [+ 포스 추가]를 눌러 참여 팀 DRAFT와 1포스를 먼저 만들어 주세요.');return;}
    if(model.mode==='PARTICIPATION'&&value(state.team?.status)==='DRAFT'&&!participationReady()){setStatus('최소 팀 생성자의 캐릭터 1개를 각 포스에 서로 다르게 추가해야 합니다.');return;}
    state.saving=true;
    state.requestKey=state.requestKey||('sm-draft-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    model.requestKey=state.requestKey;
    const wasNew=!state.team;
    const wasDraft=value(state.team?.status)==='DRAFT';
    setStatus(wasNew?'Server에 구성용 DRAFT를 만들고 있습니다.':model.mode==='PARTICIPATION'?'참여 팀 DRAFT 변경사항을 저장하고 있습니다.':wasDraft?'일정과 편성을 확인한 뒤 팀을 생성하고 있습니다.':'고정 팀 변경사항을 저장하고 있습니다.','progress');
    setControlsDisabled(true);
    try{
      const result=await bridge().saveTeamDraft(model);
      const teamId=Number(result.teamId||state.team?.teamId||0);
      state.team=bridge().findTeam(teamId);
      if(!state.team)throw new Error('저장된 팀을 다시 찾지 못했습니다.');
      if(wasNew){
        await acquireLease();
        state.selectedForceId=Number(state.team.forces?.[0]?.forceId||0);
        state.saving=false;state.requestKey='';
        state.message='구성 공간을 만들었습니다. 빈 슬롯을 눌러 생성자 캐릭터를 추가한 뒤 [팀 생성]을 누르세요.';state.tone='success';
        state.layer.innerHTML=modeMarkup();syncDateMinimum();focusDialog('.sanctuary-management-builder-dialog');return;
      }
      if(model.mode==='PARTICIPATION'){
        if(wasDraft){
          const published=await bridge().publishTeam(teamId,Number(state.team.revision),'sm-publish-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),state.leaseToken);
          const message='참여 팀을 생성했습니다. · '+teamForces().length+'포스 · team '+value(teamId)+' · revision '+value(published.revision);
          close();if(window.KinojoToast?.success)window.KinojoToast.success(message);else window.KinojoToast?.show?.(message);return;
        }
        const message='참여 팀 변경사항을 저장했습니다. · team '+value(teamId)+' · revision '+value(result.revision);
        close();if(window.KinojoToast?.success)window.KinojoToast.success(message);else window.KinojoToast?.show?.(message);return;
      }
      if(wasDraft){
        const published=await bridge().publishTeam(teamId,Number(state.team.revision),'sm-publish-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),state.leaseToken);
        const message='고정 팀을 생성했습니다. 빈 슬롯은 그대로 유지됩니다. · team '+value(teamId)+' · revision '+value(published.revision);
        close();if(window.KinojoToast?.success)window.KinojoToast.success(message);else window.KinojoToast?.show?.(message);return;
      }
      const message='고정 팀 변경사항을 저장했습니다. · team '+value(teamId)+' · revision '+value(result.revision);
      close();if(window.KinojoToast?.success)window.KinojoToast.success(message);else window.KinojoToast?.show?.(message);
    }catch(error){
      state.saving=false;
      setStatus(value(error?.message)||(model.mode==='PARTICIPATION'?'참여 팀 초안을 저장하지 못했습니다.':'고정 팀 초안을 저장하지 못했습니다.'),'error');
      setControlsDisabled(false);
    }
  }

  async function addForce(){
    if(state.saving||state.mutating||(!state.team&&currentMode()!=='PARTICIPATION'))return;
    const forces=teamForces();
    if(forces.length>=9){setStatus('한 팀에는 최대 9포스까지만 구성할 수 있습니다.');return;}
    const model=readModel();
    const issue=validate(model);
    if(issue){setStatus(issue);return;}
    state.mutating=true;
    state.forceSaveRequestKey=state.forceSaveRequestKey||('sm-force-save-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    if(state.team)state.forceAddRequestKey=state.forceAddRequestKey||('sm-force-add-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    model.requestKey=state.forceSaveRequestKey;
    const wasNew=!state.team;
    setStatus(wasNew?'참여 팀 DRAFT와 1포스를 Server에 함께 만들고 있습니다.':'현재 입력 내용을 먼저 저장한 뒤 Server에 다음 포스를 추가하고 있습니다.','progress');
    setControlsDisabled(true);
    let teamId=Number(state.team?.teamId||0);
    try{
      const savedDraft=await bridge().saveTeamDraft(model);
      teamId=Number(savedDraft.teamId||teamId);
      if(wasNew){
        state.team=bridge().findTeam(teamId);
        if(!state.team)throw new Error('생성한 참여 팀 초안을 다시 찾지 못했습니다.');
        await acquireLease();
        state.selectedForceId=Number(state.team.forces?.[0]?.forceId||0);
        state.forceSaveRequestKey='';state.mutating=false;
        state.message='참여 팀 DRAFT와 1포스를 만들었습니다. · 1/9포스 · 2파티 · 10슬롯';
        state.tone='success';
        state.layer.innerHTML=modeMarkup();syncDateMinimum();focusDialog('[data-draft-force]');return;
      }
      const saved=bridge().findTeam(teamId);
      if(!saved)throw new Error('저장된 팀 초안을 다시 찾지 못했습니다.');
      const result=await bridge().addForce(teamId,Number(saved.revision),state.forceAddRequestKey,state.leaseToken);
      state.team=bridge().findTeam(teamId);
      if(!state.team)throw new Error('포스가 추가된 팀 초안을 다시 찾지 못했습니다.');
      state.selectedForceId=Number(result.forceId||state.team.forces?.at(-1)?.forceId||0);
      state.selectedSlotId=0;
      resetCharacterLookup();
      state.forceSaveRequestKey='';state.forceAddRequestKey='';state.mutating=false;
      state.message=value(result.forceNo)+'포스를 추가했습니다. · 팀 revision '+value(result.revision)+' · Server 편성 재조회 완료';
      state.tone='success';
      state.layer.innerHTML=modeMarkup();
      syncDateMinimum();
      requestAnimationFrame(()=>{
        syncScrollFades();
        state.layer?.querySelector('[data-draft-force="'+CSS.escape(String(state.selectedForceId))+'"]')?.focus();
      });
    }catch(error){
      state.team=bridge()?.findTeam?.(teamId)||state.team;
      state.mutating=false;
      state.message=value(error?.message)||'포스를 추가하지 못했습니다.';
      state.tone='error';
      state.layer.innerHTML=modeMarkup();
      syncDateMinimum();
      requestAnimationFrame(syncScrollFades);
    }
  }

  async function assignCreatorCharacter(characterId){
    if(state.saving||state.mutating||!state.team)return;
    const force=selectedForce();
    const chosen=selectedSlot();
    const candidate=force?.creatorCandidates?.find(item=>Number(item.characterId)===Number(characterId));
    if(!force||!chosen||chosen.slot.occupied||!candidate){setStatus('빈 슬롯과 Server가 반환한 생성자 캐릭터를 다시 선택해 주세요.');return;}
    state.mutating=true;
    state.slotRequestKey=state.slotRequestKey||('sm-slot-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    const teamId=Number(state.team.teamId);
    const slotNumber=slotDisplayNumber(chosen);
    setStatus(slotNumber+'번 슬롯에 '+value(candidate.characterName)+' 캐릭터를 추가하고 Server 편성을 다시 확인하고 있습니다.','progress');
    setControlsDisabled(true);
    try{
      const result=await bridge().setSlot(teamId,Number(force.forceId),chosen.partyNo,Number(chosen.slot.slotNo),Number(candidate.characterId),Number(state.team.revision),state.slotRequestKey,state.leaseToken);
      state.team=bridge().findTeam(teamId);
      if(!state.team)throw new Error('캐릭터가 추가된 팀 초안을 다시 찾지 못했습니다.');
      state.slotRequestKey='';state.mutating=false;
      setControlsDisabled(false);
      renderRosterState();
      setStatus((candidate.isMain?'본캐 ':'부캐 ')+value(candidate.characterName)+' 캐릭터를 '+slotNumber+'번 슬롯에 추가했습니다. · 팀 revision '+value(result.revision),'success');
    }catch(error){
      state.team=bridge()?.findTeam?.(teamId)||state.team;
      state.mutating=false;
      setControlsDisabled(false);
      renderRosterState();
      setStatus(value(error?.message)||'생성자 캐릭터를 슬롯에 추가하지 못했습니다.','error');
    }
  }

  async function searchCharacter(query,isMainSearch=false){
    if(state.saving||state.mutating||!state.team||!selectedSlot())return;
    const key=isMainSearch?'mainLookup':'lookup';
    state[key]={loading:true};
    renderRosterState();
    try{
      const result=await bridge().searchCharacter(Number(state.team.teamId),value(query));
      if(isMainSearch){
        if(result.character){
          if(result.character.relation!=='MAIN'||Number(result.character.ownerMemberId)<1)throw new Error('선택한 캐릭터가 이용자 본캐로 확인되지 않습니다.');
          state.mainLookup={character:result.character};
        }else if(result.candidate?.allowedRelations?.includes('MAIN'))state.mainLookup={candidate:result.candidate};
        else throw new Error('외부·게스트 캐릭터는 부캐 연결 본캐로 사용할 수 없습니다.');
      }else{
        state.lookup=result.character?{character:result.character}:{candidate:result.candidate};
        state.mainLookup=null;
        state.relationType=result.candidate?.allowedRelations?.length===1?result.candidate.allowedRelations[0]:'';
      }
      renderRosterState();
      setStatus((isMainSearch?'연결할 본캐':'추가할 캐릭터')+'를 Server에서 확인했습니다.','success');
    }catch(error){
      state[key]={error:value(error?.message)||'캐릭터를 조회하지 못했습니다.'};
      renderRosterState();
      setStatus(state[key].error,'error');
    }
  }

  async function assignSearchedCharacter(character){
    if(state.saving||state.mutating||!state.team||!character)return;
    const force=selectedForce(),chosen=selectedSlot();
    if(!force||!chosen||chosen.slot.occupied){setStatus('캐릭터를 추가할 빈 슬롯을 다시 선택해 주세요.');return;}
    state.mutating=true;state.slotRequestKey=state.slotRequestKey||('sm-slot-search-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    const teamId=Number(state.team.teamId),slotNumber=slotDisplayNumber(chosen);
    setStatus(slotNumber+'번 슬롯에 '+value(character.characterName)+' 캐릭터를 추가하고 있습니다.','progress');setControlsDisabled(true);
    try{
      const result=await bridge().setSlot(teamId,Number(force.forceId),chosen.partyNo,Number(chosen.slot.slotNo),Number(character.characterId),Number(state.team.revision),state.slotRequestKey,state.leaseToken);
      state.team=bridge().findTeam(teamId);if(!state.team)throw new Error('캐릭터가 추가된 팀 초안을 다시 찾지 못했습니다.');
      state.slotRequestKey='';state.mutating=false;state.selectedSlotId=0;resetCharacterLookup();setControlsDisabled(false);renderRosterState();
      setStatus(value(character.characterName)+' 캐릭터를 '+slotNumber+'번 슬롯에 추가했습니다. · 팀 revision '+value(result.revision),'success');
    }catch(error){state.team=bridge()?.findTeam?.(teamId)||state.team;state.mutating=false;setControlsDisabled(false);renderRosterState();setStatus(value(error?.message)||'캐릭터를 슬롯에 추가하지 못했습니다.','error');}
  }

  async function registerOfficialCharacter(asMainOnly=false){
    if(state.saving||state.mutating||!state.team)return;
    const source=asMainOnly?state.mainLookup?.candidate:state.lookup?.candidate;
    const relation=asMainOnly?'MAIN':state.relationType;
    const mainId=relation==='ALT'?Number(state.mainLookup?.character?.characterId||0):null;
    if(!source||!relation||relation==='ALT'&&!mainId){setStatus('본캐·부캐·게스트 관계를 먼저 확인해 주세요.');return;}
    state.mutating=true;state.characterRequestKey='sm-character-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
    setStatus((asMainOnly?'연결할 본캐를 먼저':'공식 캐릭터 관계를')+' Server에 등록하고 있습니다.','progress');setControlsDisabled(true);
    try{
      const result=await bridge().registerCharacter(Number(state.team.teamId),source.candidateId,relation,mainId,state.characterRequestKey);
      state.characterRequestKey='';state.mutating=false;setControlsDisabled(false);
      if(asMainOnly){state.mainLookup={character:result.character};renderRosterState();setStatus(result.character.characterName+' 본캐를 공식 확인했습니다. 이제 부캐를 추가할 수 있습니다.','success');return;}
      await assignSearchedCharacter(result.character);
    }catch(error){state.mutating=false;setControlsDisabled(false);renderRosterState();setStatus(value(error?.message)||'공식 캐릭터 관계를 확정하지 못했습니다.','error');}
  }

  async function moveSlot(fromSlotId,toSlotId){
    if(state.saving||state.mutating||!state.team||Number(fromSlotId)===Number(toSlotId))return;
    const source=forceSlots().find(item=>Number(item.slot.slotId)===Number(fromSlotId));
    const target=forceSlots().find(item=>Number(item.slot.slotId)===Number(toSlotId));
    if(!source?.slot?.occupied||!target){setStatus('캐릭터가 있는 출발 슬롯과 이동할 위치를 다시 선택해 주세요.');return;}
    state.mutating=true;state.moveRequestKey=state.moveRequestKey||('sm-move-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    const teamId=Number(state.team.teamId);
    setStatus(slotDisplayNumber(source)+'번과 '+slotDisplayNumber(target)+'번 위치를 Server에서 변경하고 있습니다.','progress');setControlsDisabled(true);
    try{
      const result=await bridge().moveSlot(teamId,Number(fromSlotId),Number(toSlotId),Number(state.team.revision),state.moveRequestKey,state.leaseToken);
      state.team=bridge().findTeam(teamId);if(!state.team)throw new Error('이동된 팀 편성을 다시 찾지 못했습니다.');
      state.moveRequestKey='';state.moveFromSlotId=0;state.draggedSlotId=0;state.selectedSlotId=0;state.mutating=false;setControlsDisabled(false);renderRosterState();
      setStatus('캐릭터 카드 위치를 변경했습니다. · 팀 revision '+value(result.revision),'success');
    }catch(error){state.team=bridge()?.findTeam?.(teamId)||state.team;state.moveFromSlotId=0;state.draggedSlotId=0;state.mutating=false;setControlsDisabled(false);renderRosterState();setStatus(value(error?.message)||'캐릭터 카드 위치를 변경하지 못했습니다.','error');}
  }

  function handleDragStart(event){
    const slot=event.target.closest?.('[data-draft-slot][data-occupied="true"]');
    if(!slot||slot.disabled)return;
    state.draggedSlotId=Number(slot.dataset.slotId)||0;state.moveFromSlotId=state.draggedSlotId;
    slot.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain',String(state.draggedSlotId));
    if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
  }

  function handleDragOver(event){
    const slot=event.target.closest?.('[data-draft-slot]');
    if(!slot||!state.draggedSlotId)return;
    event.preventDefault();
    state.layer?.querySelectorAll('.is-drop-target').forEach(item=>item.classList.remove('is-drop-target'));
    if(Number(slot.dataset.slotId)!==state.draggedSlotId)slot.classList.add('is-drop-target');
    if(event.dataTransfer)event.dataTransfer.dropEffect='move';
  }

  function handleDrop(event){
    const slot=event.target.closest?.('[data-draft-slot]');
    if(!slot||!state.draggedSlotId)return;
    event.preventDefault();
    const from=state.draggedSlotId,to=Number(slot.dataset.slotId)||0;
    handleDragEnd();
    if(to&&from!==to)moveSlot(from,to);
  }

  function handleDragEnd(){
    state.layer?.querySelectorAll('.is-dragging,.is-drop-target').forEach(item=>item.classList.remove('is-dragging','is-drop-target'));
    state.draggedSlotId=0;
  }

  function handleClick(event){
    if(event.target.closest('[data-draft-close]')){if(!state.saving&&!state.mutating)close();return;}
    const mode=event.target.closest('[data-draft-mode]');
    if(mode){state.creationMode=mode.dataset.draftMode==='participation'?'PARTICIPATION':'FIXED';state.joinPolicy='INSTANT';openDraft(null,state.opener);return;}
    const joinPolicy=event.target.closest('[data-draft-join-policy]');
    if(joinPolicy){
      state.joinPolicy=joinPolicy.dataset.draftJoinPolicy==='APPROVAL'?'APPROVAL':'INSTANT';
      state.layer.querySelectorAll('[data-draft-join-policy]').forEach(button=>button.setAttribute('aria-pressed',String(button===joinPolicy)));
      return;
    }
    const kind=event.target.closest('[data-draft-kind]');
    if(kind){
      const form=state.layer.querySelector('[data-draft-form]');
      form.elements.draftKind.value=kind.dataset.draftKind;
      form.querySelectorAll('[data-draft-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button===kind)));
      const weekdays=form.querySelector('.sanctuary-management-weekdays');
      weekdays.hidden=kind.dataset.draftKind!=='WEEKLY';
      form.elements.draftStartsOn.previousElementSibling.textContent=kind.dataset.draftKind==='WEEKLY'?'반복 시작일':'진행 날짜';
      return;
    }
    const force=event.target.closest('[data-draft-force]');
    if(force&&!force.disabled){state.selectedForceId=Number(force.dataset.draftForce)||0;state.selectedSlotId=0;state.moveFromSlotId=0;resetCharacterLookup();renderRosterState();return;}
    if(event.target.closest('[data-draft-add-force]')){addForce();return;}
    const slot=event.target.closest('[data-draft-slot]');
    if(slot&&!slot.disabled&&state.moveFromSlotId){moveSlot(state.moveFromSlotId,Number(slot.dataset.slotId));return;}
    if(slot&&!slot.disabled&&slot.dataset.occupied==='true'){
      state.moveFromSlotId=Number(slot.dataset.slotId)||0;state.selectedSlotId=0;resetCharacterLookup();renderRosterState();
      setStatus(slot.textContent.trim()+' 카드를 선택했습니다. 이동할 빈 슬롯이나 다른 카드를 누르세요.','progress');return;
    }
    if(slot&&!slot.disabled&&slot.dataset.occupied!=='true'){
      state.selectedSlotId=Number(slot.dataset.slotId)||0;
      resetCharacterLookup();
      renderRosterState();
      setStatus(slotDisplayNumber(selectedSlot())+'번 슬롯에 추가할 내 캐릭터를 선택하거나 이름을 검색해 주세요.','progress');
      state.layer?.querySelector('.sanctuary-management-candidate-card')?.focus();
      return;
    }
    const candidate=event.target.closest('[data-draft-candidate]');
    if(candidate&&!candidate.disabled){assignCreatorCharacter(Number(candidate.dataset.draftCandidate));return;}
    const searched=event.target.closest('[data-draft-search-character]');
    if(searched&&!searched.disabled){assignSearchedCharacter(state.lookup?.character);return;}
    const relation=event.target.closest('[data-draft-relation]');
    if(relation&&!relation.disabled){state.relationType=relation.dataset.draftRelation||'';state.mainLookup=null;renderRosterState();return;}
    if(event.target.closest('[data-draft-register-main]')){registerOfficialCharacter(true);return;}
    if(event.target.closest('[data-draft-register-character]')){registerOfficialCharacter(false);return;}
    if(event.target.closest('[data-character-search-submit]')){
      const search=event.target.closest('[data-character-search-form]');
      searchCharacter(search?.querySelector('[name="characterQuery"]')?.value,false);
      return;
    }
    if(event.target.closest('[data-main-search-submit]')){
      const search=event.target.closest('[data-main-search-form]');
      searchCharacter(search?.querySelector('[name="mainCharacterQuery"]')?.value,true);
      return;
    }
    if(event.target.closest('[data-draft-search-reset]')){resetCharacterLookup();renderRosterState();return;}
    if(event.target.closest('[data-draft-reset]')){openDraft(state.team,state.opener);}
  }

  function handleChange(event){if(event.target.name==='draftSanctuary')syncDateMinimum();}

  function handleKeydown(event){
    if(event.key==='Escape'&&!state.saving&&!state.mutating){event.preventDefault();close();return;}
    if(event.key==='Enter'&&event.target.name==='characterQuery'){event.preventDefault();searchCharacter(event.target.value,false);return;}
    if(event.key==='Enter'&&event.target.name==='mainCharacterQuery'){event.preventDefault();searchCharacter(event.target.value,true);return;}
    if(event.key!=='Tab')return;
    const focusable=Array.from(state.layer.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(item=>item.offsetParent!==null);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }

  document.addEventListener('submit',event=>{
    if(event.target.matches('[data-draft-form]')){event.preventDefault();save();}
  });

  window.KinojoSanctuaryManagementDraftUI=Object.freeze({openMode,openDraft,close});
})();
