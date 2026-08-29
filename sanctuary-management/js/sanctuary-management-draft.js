(function(){
  'use strict';

  const WEEKDAYS=Object.freeze([
    {value:3,label:'수'},{value:4,label:'목'},{value:5,label:'금'},{value:6,label:'토'},
    {value:7,label:'일'},{value:1,label:'월'},{value:2,label:'화'}
  ]);
  const UNLIMITED_DURATION_MINUTES=720;
  const DURATION_OPTIONS=Object.freeze([{value:30,label:'30분'},{value:60,label:'1시간'},{value:120,label:'2시간'},{value:UNLIMITED_DURATION_MINUTES,label:'무제한'}]);
  const CLASS_ICON_MAP=Object.freeze({'수호성':'templar','검성':'gladiator','살성':'assassin','궁성':'ranger','마도성':'sorcerer','정령성':'elementalist','치유성':'cleric','호법성':'chanter','권성':'fighter'});
  const state={layer:null,opener:null,team:null,sourceTeamId:0,creationMode:'FIXED',joinPolicy:'INSTANT',selectedForceId:0,selectedSlotId:0,moveFromSlotId:0,draggedSlotId:0,dragSwitching:false,requestKey:'',forceSaveRequestKey:'',forceAddRequestKey:'',slotRequestKey:'',moveRequestKey:'',characterRequestKey:'',leaseToken:'',leaseTimer:0,message:'',tone:'',saving:false,mutating:false,lookup:null,mainLookup:null,relationType:''};
  const value=input=>String(input??'').trim();
  const escapeHtml=input=>String(input??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const bridge=()=>window.KinojoSanctuaryManagementDraftBridge;

  function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
  function classIconFor(className){const key=CLASS_ICON_MAP[value(className).replace(/[\s\u200B-\u200D\uFEFF]+/g,'').replace(/[\[(（].*?[\])）]\s*$/g,'')];return key?'/assets/images/classes/class_icon_'+key+'.png':'';}
  function makeLocalForce(forceNo,localForceId){
    const forceId=Number(localForceId)||-forceNo;
    const localKey=Math.abs(forceId);
    const parties=[1,2].map(partyNo=>({partyId:-(localKey*10+partyNo),partyNo,capacity:5,occupiedCount:0,vacancyCount:5,slots:Array.from({length:5},(_,index)=>({slotId:-(localKey*100+partyNo*10+index+1),slotNo:index+1,revision:1,occupied:false,character:null}))}));
    return {forceId,forceNo,capacity:10,status:'OPEN',revision:1,occupiedCount:0,vacancyCount:10,creatorMemberId:Number(bridge()?.snapshot()?.actor?.memberId||0),creatorOwnerResolved:true,creatorAlreadyAssigned:false,creatorCandidateCode:'READY',creatorCandidateCount:0,creatorCandidates:[],viewerAlreadyAssigned:false,viewerPending:false,canSupport:false,parties};
  }
  function makeLocalTeam(mode){
    const normalized=mode==='PARTICIPATION'?'PARTICIPATION':'FIXED';
    const forces=[makeLocalForce(1)];
    return {localOnly:true,teamId:0,sanctuaryId:null,title:'',activity:'',mode:normalized,joinPolicy:'INSTANT',status:'DRAFT',revision:0,canEdit:true,canArchive:false,schedule:defaultSchedule(),forces,forceCount:forces.length,slotCount:forces.length*10,occupiedCount:0,vacancyCount:forces.length*10};
  }

  function refreshLocalTeam(){
    if(!state.team)return;
    const actorMemberId=Number(bridge()?.snapshot()?.actor?.memberId||0);
    const actorCharacterIds=new Set(composerCharacters().map(item=>Number(item.characterId)).filter(Boolean));
    state.team.forces.forEach((force,index)=>{
      force.forceNo=index+1;
      let forceOccupied=0;
      force.parties.forEach(party=>{
        party.occupiedCount=party.slots.filter(slot=>slot.occupied&&slot.character).length;
        party.vacancyCount=party.capacity-party.occupiedCount;
        forceOccupied+=party.occupiedCount;
      });
      force.occupiedCount=forceOccupied;force.vacancyCount=force.capacity-forceOccupied;
      const creatorIsActor=Number(force.creatorMemberId||actorMemberId)===actorMemberId;
      const derivedCreatorAssigned=force.parties.some(party=>party.slots.some(slot=>slot.character&&(Number(slot.character.ownerMemberId||0)===Number(force.creatorMemberId||actorMemberId)||creatorIsActor&&actorCharacterIds.has(Number(slot.character.characterId)))));
      if(state.team.localOnly||creatorIsActor)force.creatorAlreadyAssigned=derivedCreatorAssigned;
    });
    state.team.forceCount=state.team.forces.length;
    state.team.slotCount=state.team.forceCount*10;
    state.team.occupiedCount=state.team.forces.reduce((sum,force)=>sum+force.occupiedCount,0);
    state.team.vacancyCount=state.team.slotCount-state.team.occupiedCount;
  }

  function composerCharacters(){return Array.isArray(bridge()?.snapshot()?.composerCharacters?.characters)?bridge().snapshot().composerCharacters.characters:[];}
  function localUsedCharacterIds(){return new Set(teamForces().flatMap(force=>forceSlots(force)).map(item=>Number(item.slot.character?.characterId||0)).filter(Boolean));}

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

  function dateAtUtc(dateText){const [year,month,day]=value(dateText).split('-').map(Number);return new Date(Date.UTC(year,month-1,day));}
  function dateText(date){return date.toISOString().slice(0,10);}
  function nextSelectedDate(weekdays,minimum=''){
    const selected=new Set((weekdays||[]).map(Number));
    const baseText=[todayKst(),value(minimum)].filter(Boolean).sort().at(-1)||todayKst();
    let date=dateAtUtc(baseText);
    for(let offset=0;offset<14;offset+=1){
      const weekday=date.getUTCDay()===0?7:date.getUTCDay();
      if(selected.has(weekday))return dateText(date);
      date=new Date(date.getTime()+86400000);
    }
    return baseText;
  }
  function splitDate(dateValue){const parts=value(dateValue).split('-');return {month:parts[1]||'',day:parts[2]||''};}
  function splitTime(timeValue){
    const [rawHour,rawMinute]=value(timeValue).split(':').map(Number);const hour24=Number.isInteger(rawHour)?rawHour:21;
    return {period:hour24>=12?'PM':'AM',hour:String(hour24%12||12).padStart(2,'0'),minute:String(Number.isInteger(rawMinute)?rawMinute:0).padStart(2,'0')};
  }
  function inferDateFromParts(monthValue,dayValue,currentValue,minimum=''){
    const month=Math.max(1,Math.min(12,Number(monthValue)||0));const day=Number(dayValue)||0;
    if(!month||day<1||day>31)return '';
    const baseYear=Number(value(currentValue).slice(0,4))||Number(todayKst().slice(0,4));
    let candidate=new Date(Date.UTC(baseYear,month-1,day));
    if(candidate.getUTCMonth()!==month-1||candidate.getUTCDate()!==day)return '';
    const floor=[todayKst(),value(minimum)].filter(Boolean).sort().at(-1)||todayKst();
    if(dateText(candidate)<floor)candidate=new Date(Date.UTC(baseYear+1,month-1,day));
    return dateText(candidate);
  }

  function sanctuaryItems(){return Array.isArray(bridge()?.snapshot()?.sanctuaries)?bridge().snapshot().sanctuaries:[];}
  function sanctuaryCode(item){return value(item?.code)||value(item?.id);}
  function sanctuaryLabel(item,index=0){
    const order=Number(item?.displayOrder)||Number(item?.id)||index+1;const short='성역 '+order;const official=value(item?.name);
    return official&&official.replace(/\s+/g,'')!==short.replace(/\s+/g,'')?short+' | '+official:short;
  }
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
      durationMinutes:DURATION_OPTIONS.some(option=>option.value===Number(schedule.durationMinutes))?Number(schedule.durationMinutes):30
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
    layer.addEventListener('input',handleInput);
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
    state.opener=null;state.team=null;state.sourceTeamId=0;state.creationMode='FIXED';state.joinPolicy='INSTANT';state.selectedForceId=0;state.selectedSlotId=0;state.moveFromSlotId=0;state.draggedSlotId=0;state.dragSwitching=false;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.moveRequestKey='';state.leaseToken='';state.message='';state.tone='';state.saving=false;state.mutating=false;resetCharacterLookup();
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
    state.team=null;state.sourceTeamId=0;state.creationMode='FIXED';state.joinPolicy='INSTANT';state.selectedForceId=0;state.selectedSlotId=0;state.moveFromSlotId=0;state.draggedSlotId=0;state.dragSwitching=false;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.moveRequestKey='';state.leaseToken='';state.message='';state.tone='';state.saving=false;state.mutating=false;resetCharacterLookup();
    openLayer(opener);
    state.layer.innerHTML='<div class="sanctuary-management-draft-backdrop" data-draft-close></div>'
      +'<section class="sanctuary-management-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryDraftModeTitle" aria-describedby="sanctuaryDraftModeDescription" tabindex="-1">'
        +'<header><span>CREATE TEAM</span><h2 id="sanctuaryDraftModeTitle">팀 생성 방식을 선택하세요</h2><p id="sanctuaryDraftModeDescription">두 방식 모두 일정과 전체 포스 편성을 모달에서 먼저 완성한 뒤 Server에 한 번만 저장합니다.</p></header>'
        +'<div class="sanctuary-management-mode-options">'
          +'<button type="button" data-draft-mode="fixed"><span aria-hidden="true">◆</span><strong>고정 팀 생성</strong><small>고정 구성원과 일정을 로컬 편성안에서 함께 작성합니다.</small><em>편성 시작</em></button>'
          +'<button type="button" data-draft-mode="participation"><span aria-hidden="true">＋</span><strong>참여 팀 생성</strong><small>필요한 포스를 만들고 생성자 캐릭터를 한 곳 이상 배치합니다.</small><em>참여 구성 시작</em></button>'
        +'</div>'
        +'<footer><p>닫기·초기화 전까지 Server 팀 데이터는 변경되지 않습니다.</p><button type="button" data-draft-close>닫기</button></footer>'
      +'</section>';
    focusDialog('[data-draft-mode="fixed"]');
  }

  function teamForces(){
    return Array.isArray(state.team?.forces)?state.team.forces.slice().sort((left,right)=>Number(left.forceNo)-Number(right.forceNo)):[];
  }

  function currentMode(){return value(state.team?.mode||state.creationMode).toUpperCase()==='PARTICIPATION'?'PARTICIPATION':'FIXED';}
  function currentJoinPolicy(){return value(state.joinPolicy).toUpperCase()==='APPROVAL'?'APPROVAL':'INSTANT';}
  function participationReady(){const forces=teamForces();return currentMode()==='PARTICIPATION'&&forces.length>0&&forces.some(force=>force.creatorAlreadyAssigned===true);}

  function selectedForce(){
    const forces=teamForces();
    return forces.find(force=>Number(force.forceId)===Number(state.selectedForceId))||forces[0]||null;
  }

  function forceSlots(force=selectedForce()){
    if(!force||!Array.isArray(force.parties))return [];
    return force.parties.flatMap(party=>(Array.isArray(party.slots)?party.slots:[]).map(slot=>({partyNo:Number(party.partyNo),slot}))).sort((left,right)=>left.partyNo-right.partyNo||Number(left.slot.slotNo)-Number(right.slot.slotNo));
  }

  function teamSlots(){return teamForces().flatMap(force=>forceSlots(force).map(item=>Object.assign({force},item)));}
  function teamSlot(slotId){return teamSlots().find(item=>Number(item.slot.slotId)===Number(slotId))||null;}

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
      const removable=selected&&forces.length>1;
      return '<div class="sanctuary-management-force-option'+(selected?' is-active':'')+'"><button type="button" data-draft-force="'+escapeHtml(force.forceId)+'" class="'+(selected?'is-active':'')+'" aria-pressed="'+selected+'"'+(busy?' disabled':'')+'><strong>'+escapeHtml(force.forceNo)+'포스</strong><small>'+escapeHtml(force.occupiedCount)+' / '+escapeHtml(force.capacity)+'명'+(state.team?.localOnly?' · 편집 중':' · rev '+escapeHtml(force.revision))+'</small></button>'+(removable?'<button type="button" class="sanctuary-management-force-remove" data-draft-remove-force="'+escapeHtml(force.forceId)+'" aria-label="'+escapeHtml(force.forceNo)+'포스 제거"'+(busy?' disabled':'')+'>−</button>':'')+'</div>';
    }).join('');
    const add=forces.length<9?'<button type="button" class="is-add" data-draft-add-force'+(busy?' disabled':'')+'><strong>+ 포스 추가</strong><small>다음 '+(forces.length+1)+'포스 · 최대 9</small></button>':'<button type="button" class="is-add is-limit" data-draft-add-force aria-disabled="true"'+(busy?' disabled':'')+'><strong>최대 9포스</strong><small>10번째 포스는 추가할 수 없음</small></button>';
    return '<div class="sanctuary-management-force-list" data-force-list>'+buttons+add+'</div><p>편성안 '+forces.length+'/9포스 · 마지막 저장 전에는 Server 데이터가 바뀌지 않습니다.</p>';
  }

  function slotMarkup(slot,partyNo){
    const number=(Number(partyNo)-1)*5+Number(slot.slotNo);
    const occupied=slot.occupied===true&&slot.character;
    const selected=!occupied&&Number(slot.slotId)===Number(state.selectedSlotId);
    const moving=Number(slot.slotId)===Number(state.moveFromSlotId);
    const name=occupied?value(slot.character.name):'빈 슬롯';
    const relation=value(slot.character?.relation).toUpperCase();
    const relationLabel=relation==='MAIN'?'본캐':relation==='ALT'?'부캐':relation==='GUEST'?'게스트':'';
    const detail=occupied?[value(slot.character.serverName),relationLabel].filter(Boolean).join(' · '):selected?'후보를 선택해 추가':'눌러서 캐릭터 선택';
    const disabled=state.saving||state.mutating;
    return '<div class="sanctuary-management-draft-slot-shell'+(moving?' is-selected':'')+'"><button type="button" class="sanctuary-management-draft-slot'+(occupied?' is-occupied':'')+(selected?' is-selected':'')+(moving?' is-move-source':'')+'"'+(disabled?' disabled':'')+(occupied?' draggable="true"':'')+' data-draft-slot data-slot-id="'+escapeHtml(slot.slotId)+'" data-slot-revision="'+escapeHtml(slot.revision)+'" data-party-no="'+escapeHtml(partyNo)+'" data-slot-no="'+escapeHtml(slot.slotNo)+'" data-occupied="'+String(Boolean(occupied))+'" aria-pressed="'+String(selected||moving)+'"><span>'+number+'</span><strong>'+escapeHtml(name)+'</strong><small>'+escapeHtml(moving?'이동하거나 − 버튼으로 제거':detail)+'</small></button>'+(moving?'<button type="button" class="sanctuary-management-slot-remove" data-draft-clear-slot="'+escapeHtml(slot.slotId)+'" aria-label="'+escapeHtml(name)+' 캐릭터 제거"'+(disabled?' disabled':'')+'>−</button>':'')+'</div>';
  }

  function candidateMarkup(){
    const force=selectedForce();
    const chosen=selectedSlot();
    if(!state.team||!force)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty"><span aria-hidden="true">◇</span><strong>초안 저장 후 연결</strong><p>Server가 생성자의 소유 캐릭터를 확인합니다.</p></div></aside>';
    if(!chosen)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty"><span aria-hidden="true">◇</span><strong>빈 슬롯 선택</strong><p>'+escapeHtml(force.forceNo)+'포스의 빈 카드를 누르면 내 캐릭터와 검색 창을 표시합니다.</p></div></aside>';
    const usedIds=localUsedCharacterIds();
    const sourceCandidates=composerCharacters().length?composerCharacters():Array.isArray(force.creatorCandidates)?force.creatorCandidates:[];
    const candidates=sourceCandidates.filter(candidate=>!usedIds.has(Number(candidate.characterId)));
    const slotNumber=slotDisplayNumber(chosen);
    const quickCards=candidates.map(candidate=>{
      const relation=candidate.isMain?'본캐':'부캐';
      const initial=Array.from(value(candidate.characterName)||'?')[0]||'?';
      const icon=classIconFor(candidate.className);
      return '<button type="button" class="sanctuary-management-candidate-card '+(candidate.isMain?'is-main':'is-alt')+'" data-draft-candidate="'+escapeHtml(candidate.characterId)+'"'+(state.saving||state.mutating?' disabled':'')+'><span class="sanctuary-management-candidate-avatar" aria-hidden="true">'+(icon?'<img src="'+escapeHtml(icon)+'" alt="">':escapeHtml(initial))+'</span><span class="sanctuary-management-candidate-copy"><em>'+relation+'</em><strong>'+escapeHtml(candidate.characterName)+'</strong><small>'+escapeHtml(candidate.serverName||'서버 미확인')+'</small></span></button>';
    }).join('');
    let quick='';
    if(force.creatorOwnerResolved!==true&&!sourceCandidates.length)quick='<div class="sanctuary-management-candidate-note is-warning"><strong>생성자 소유권 확인 필요</strong><small>'+escapeHtml(force.creatorCandidateCode||'OWNER_NOT_RESOLVED')+'</small></div>';
    else if(force.creatorAlreadyAssigned===true)quick='<div class="sanctuary-management-candidate-note is-complete"><strong>이 포스에 내 캐릭터 배치 완료</strong><small>한 이용자는 포스마다 캐릭터 1개만 배치할 수 있습니다.</small></div>';
    else if(quickCards)quick='<section class="sanctuary-management-quick-candidates"><strong>내 캐릭터</strong>'+quickCards+'</section>';
    else quick='<div class="sanctuary-management-candidate-note"><strong>내 캐릭터 후보 없음</strong><small>팀 생성 후 편집에서는 다른 구성원을 검색해 추가할 수 있습니다.</small></div>';
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
    const creatorOnly=currentMode()==='PARTICIPATION'&&value(state.team?.status)==='DRAFT'&&state.team?.localOnly;
    if(creatorOnly)return '<aside class="sanctuary-management-candidate-rail" aria-label="'+escapeHtml(force.forceNo)+'포스 생성자 캐릭터 선택"><header><strong>내 캐릭터 선택</strong><small>'+slotNumber+'번 슬롯 · 이용자당 포스별 1개</small></header><div class="sanctuary-management-candidate-list" data-candidate-list>'+quick+'<div class="sanctuary-management-candidate-note"><strong>참여 팀 생성 조건</strong><small>만들어 둔 포스 중 한 곳에 생성자의 캐릭터 1개 이상을 배치하면 생성할 수 있습니다.</small></div></div></aside>';
    if(state.team?.localOnly)return '<aside class="sanctuary-management-candidate-rail" aria-label="'+escapeHtml(force.forceNo)+'포스 내 캐릭터 선택"><header><strong>내 캐릭터 선택</strong><small>'+slotNumber+'번 슬롯 · 로컬 편성안</small></header><div class="sanctuary-management-candidate-list" data-candidate-list>'+quick+'<div class="sanctuary-management-candidate-note"><strong>한 번에 Server 반영</strong><small>외부·게스트 검색은 팀을 만든 뒤 편집에서 사용할 수 있습니다.</small></div></div></aside>';
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
    if(!force)return '[+ 포스 추가]를 누르면 로컬 편성안에 1포스·2파티·10슬롯이 추가됩니다.';
    return force.forceNo+'포스 · '+force.occupiedCount+'/'+force.capacity+'명 · 빈자리 '+force.vacancyCount+' · 마지막 저장 전 Server 미반영';
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
    const dateParts=splitDate(schedule.startsOn);const timeParts=splitTime(schedule.startsAt);
    const sanctuaryOptions=sanctuaryItems().map(item=>{
      const code=sanctuaryCode(item);const available=value(item.availableFrom);
      return '<option value="'+escapeHtml(code)+'"'+(code===selectedCode()?' selected':'')+' data-available-from="'+escapeHtml(available)+'">'+escapeHtml(sanctuaryLabel(item))+(available?' · '+escapeHtml(available)+'부터':'')+'</option>';
    }).join('');
    const weekdays=WEEKDAYS.map(day=>'<label><input type="checkbox" name="draftWeekday" value="'+day.value+'"'+(schedule.weekdays.includes(day.value)?' checked':'')+'><span>'+day.label+'</span></label>').join('');
    const isWeekly=schedule.kind==='WEEKLY';
    const editing=Boolean(state.team&&!state.team.localOnly);
    const active=['ACTIVE','FULL'].includes(value(state.team?.status));
    const draft=value(state.team?.status)==='DRAFT';
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
              +'<header class="sanctuary-management-composer-title"><div><span>TEAM &amp; FORCE</span><h2 id="sanctuaryDraftTitle">'+modeLabel+' '+(active?'편집':editing?'구성 계속':'구성 시작')+'</h2><p id="sanctuaryDraftDescription">모달 안의 편성은 마지막 저장 때 한 번만 Server에 반영됩니다.</p></div><label><span>팀 이름</span><input name="draftTitle" maxlength="80" required value="'+escapeHtml(state.team?.title||'')+'" placeholder="예: 1팀 목요일 21시"></label></header>'
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
                +joinPolicyMarkup
                +'<div class="sanctuary-management-schedule-kind" role="group" aria-label="일정 반복 방식"><button type="button" data-draft-kind="WEEKLY" aria-pressed="'+isWeekly+'">매주 반복</button><button type="button" data-draft-kind="ONCE" aria-pressed="'+(!isWeekly)+'">1회성</button></div>'
                +'<input type="hidden" name="draftKind" value="'+schedule.kind+'">'
                +'<fieldset class="sanctuary-management-weekdays"'+(isWeekly?'':' hidden')+'><legend>반복 요일</legend><div>'+weekdays+'</div><small>종료일 없이 선택한 요일마다 반복됩니다.</small></fieldset>'
                +'<div class="sanctuary-management-field sanctuary-management-date-field"><span data-draft-date-label>'+(isWeekly?'반복 시작일':'진행 날짜')+'</span><div class="sanctuary-management-date-parts"><label><input name="draftMonth" inputmode="numeric" maxlength="2" value="'+escapeHtml(dateParts.month)+'" aria-label="월"><span>월</span></label><label><input name="draftDay" inputmode="numeric" maxlength="2" value="'+escapeHtml(dateParts.day)+'" aria-label="일"><span>일</span></label></div><input type="hidden" name="draftStartsOn" value="'+escapeHtml(schedule.startsOn)+'"><small>반복 요일을 고르면 앞으로 가장 가까운 날짜로 자동 맞춰집니다.</small></div>'
                +'<div class="sanctuary-management-field sanctuary-management-time-field"><span>시작 시간</span><div class="sanctuary-management-time-parts"><div class="sanctuary-management-period-buttons" role="group" aria-label="오전 오후"><button type="button" data-draft-period="AM" aria-pressed="'+(timeParts.period==='AM')+'">오전</button><button type="button" data-draft-period="PM" aria-pressed="'+(timeParts.period==='PM')+'">오후</button></div><label><input name="draftHour" inputmode="numeric" maxlength="2" value="'+escapeHtml(timeParts.hour)+'" aria-label="시"><span>시</span></label><label><input name="draftMinute" inputmode="numeric" maxlength="2" value="'+escapeHtml(timeParts.minute)+'" aria-label="분"><span>분</span></label></div><input type="hidden" name="draftStartsAt" value="'+escapeHtml(schedule.startsAt)+'"></div>'
                +'<div class="sanctuary-management-field sanctuary-management-duration-field"><span>진행 시간</span><div class="sanctuary-management-duration-options" role="group" aria-label="진행 시간">'+DURATION_OPTIONS.map(option=>'<button type="button" data-draft-duration="'+option.value+'" aria-pressed="'+(option.value===schedule.durationMinutes)+'">'+option.label+'</button>').join('')+'</div><input type="hidden" name="draftDuration" value="'+escapeHtml(schedule.durationMinutes)+'"></div>'
                +'<div class="sanctuary-management-schedule-preview"><span>저장 상태</span><strong>'+(editing?'DB '+escapeHtml(state.team.status)+' · revision '+escapeHtml(state.team.revision):'로컬 편성 중 · Server 미반영')+'</strong><small>'+(participation?(ready?'만들어 둔 포스 중 한 곳에 생성자의 캐릭터가 배치되어 팀 생성 조건을 충족했습니다.':'포스를 하나 이상 만들고 그중 한 곳에 생성자의 본캐·부캐 1개를 추가하면 생성할 수 있습니다.'):'빈 슬롯이 있어도 생성할 수 있으며, 생성자 캐릭터는 최소 1개 필요합니다.')+'</small></div>'
              +'</div>'
            +'</section>'
          +'</div>'
        +'</form>'
      +'</div>';
  }

  async function openDraft(team,opener){
    if(!bridge()?.snapshot()?.writeEnabled)return;
    state.sourceTeamId=Number(team?.teamId||0);
    state.team=team&&typeof team==='object'?clone(team):makeLocalTeam(state.creationMode);
    if(state.team){state.creationMode=value(state.team.mode).toUpperCase()==='PARTICIPATION'?'PARTICIPATION':'FIXED';state.joinPolicy=value(state.team.joinPolicy).toUpperCase()==='APPROVAL'?'APPROVAL':'INSTANT';}
    state.selectedForceId=Number(state.team?.forces?.[0]?.forceId||0);
    refreshLocalTeam();
    state.selectedSlotId=0;state.moveFromSlotId=0;state.draggedSlotId=0;state.dragSwitching=false;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.moveRequestKey='';state.message='';state.tone='';state.saving=false;state.mutating=Boolean(state.sourceTeamId);resetCharacterLookup();
    openLayer(opener||state.opener);
    state.layer.innerHTML=modeMarkup();
    syncDateMinimum();
    if(state.team?.localOnly)syncNextRepeatDate();
    focusDialog('.sanctuary-management-builder-dialog');
    if(state.sourceTeamId){
      try{
        setStatus('Server 편집 잠금을 확인하고 있습니다.','progress');
        await acquireLease();
        state.mutating=false;
        setStatus('편집 잠금을 확인했습니다. 모달의 변경은 마지막 저장 전까지 Server에 반영되지 않습니다.','success');
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
    if(date&&minimum&&value(date.value)<minimum){date.value=minimum;syncDatePartInputs();}
  }

  function syncDatePartInputs(){
    const form=state.layer?.querySelector('[data-draft-form]');if(!form)return;
    const parts=splitDate(form.elements.draftStartsOn?.value);
    if(form.elements.draftMonth)form.elements.draftMonth.value=parts.month;
    if(form.elements.draftDay)form.elements.draftDay.value=parts.day;
  }

  function syncDateFromParts(){
    const form=state.layer?.querySelector('[data-draft-form]');if(!form)return false;
    const minimum=value(form.elements.draftSanctuary?.selectedOptions?.[0]?.dataset.availableFrom);
    const next=inferDateFromParts(form.elements.draftMonth?.value,form.elements.draftDay?.value,form.elements.draftStartsOn?.value,minimum);
    if(!next)return false;form.elements.draftStartsOn.value=next;syncDatePartInputs();return true;
  }

  function syncNextRepeatDate(){
    const form=state.layer?.querySelector('[data-draft-form]');if(!form||value(form.elements.draftKind?.value)!=='WEEKLY')return;
    const weekdays=Array.from(form.querySelectorAll('input[name="draftWeekday"]:checked')).map(input=>Number(input.value));
    if(!weekdays.length)return;
    const minimum=value(form.elements.draftSanctuary?.selectedOptions?.[0]?.dataset.availableFrom);
    form.elements.draftStartsOn.value=nextSelectedDate(weekdays,minimum);syncDatePartInputs();
  }

  function syncTimeFromParts(){
    const form=state.layer?.querySelector('[data-draft-form]');if(!form)return false;
    const selected=form.querySelector('[data-draft-period][aria-pressed="true"]');const period=value(selected?.dataset.draftPeriod)||'PM';
    const hour=Number(form.elements.draftHour?.value),minute=Number(form.elements.draftMinute?.value);
    if(hour<1||hour>12||minute<0||minute>59)return false;
    const hour24=(hour%12)+(period==='PM'?12:0);form.elements.draftStartsAt.value=String(hour24).padStart(2,'0')+':'+String(minute).padStart(2,'0');
    form.elements.draftHour.value=String(hour).padStart(2,'0');form.elements.draftMinute.value=String(minute).padStart(2,'0');return true;
  }

  function readModel(){
    const form=state.layer?.querySelector('[data-draft-form]');
    const datePartsValid=syncDateFromParts();const timePartsValid=syncTimeFromParts();
    const kind=value(form?.elements.draftKind?.value)==='ONCE'?'ONCE':'WEEKLY';
    const weekdays=kind==='WEEKLY'?Array.from(form.querySelectorAll('input[name="draftWeekday"]:checked')).map(input=>Number(input.value)):[];
    const title=value(form?.elements.draftTitle?.value);
    return {
      teamId:Number(state.sourceTeamId||0)||null,
      revision:Number(state.team?.revision||0)||null,
      status:value(state.team?.status),
      mode:currentMode(),
      joinPolicy:currentJoinPolicy(),
      leaseToken:state.leaseToken,
      requestKey:state.requestKey,
      sanctuaryCode:value(form?.elements.draftSanctuary?.value),
      title,
      activity:Array.from(title).slice(0,24).join(''),
      datePartsValid,
      timePartsValid,
      schedule:{
        kind,
        startsOn:value(form?.elements.draftStartsOn?.value),
        weekdays,
        startsAt:value(form?.elements.draftStartsAt?.value),
        durationMinutes:Number(form?.elements.draftDuration?.value)||30
      },
      composition:teamForces().map(force=>({sourceForceId:Number(force.forceId)>0?Number(force.forceId):null,slots:forceSlots(force).map(item=>({partyNo:item.partyNo,slotNo:Number(item.slot.slotNo),characterId:Number(item.slot.character?.characterId||0)||null}))}))
    };
  }

  function validate(model){
    if(!model.title||model.title.length>80)return '팀 이름을 1자 이상 80자 이하로 입력해 주세요.';
    if(!model.sanctuaryCode)return '진행 성역을 선택해 주세요.';
    if(!model.composition.length||model.composition.length>9)return '포스를 하나 이상, 최대 9개까지 구성해 주세요.';
    if(!model.datePartsValid)return '월과 일을 올바른 숫자로 입력해 주세요.';
    if(!model.timePartsValid)return '오전·오후와 시·분을 올바르게 입력해 주세요.';
    if(!model.schedule.startsOn)return model.schedule.kind==='WEEKLY'?'반복 시작일을 입력해 주세요.':'진행 날짜를 입력해 주세요.';
    if(!model.schedule.startsAt)return '시작 시각을 입력해 주세요.';
    if(model.schedule.kind==='WEEKLY'&&!model.schedule.weekdays.length)return '반복할 요일을 하나 이상 선택해 주세요.';
    if(!DURATION_OPTIONS.some(option=>option.value===model.schedule.durationMinutes))return '진행 시간은 30분·1시간·2시간·무제한 중에서 선택해 주세요.';
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
    if(value(state.team?.status)==='DRAFT'&&!participationReady()&&model.mode==='PARTICIPATION'){setStatus('만들어 둔 포스 중 한 곳에 팀 생성자의 캐릭터 1개를 추가해 주세요.');return;}
    const hasCreator=state.team?.localOnly?teamSlots().some(item=>item.slot.occupied&&item.slot.character):teamForces().some(force=>force.creatorAlreadyAssigned===true);
    if(value(state.team?.status)==='DRAFT'&&!hasCreator){setStatus('최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.');return;}
    state.saving=true;
    state.requestKey=state.requestKey||('sm-compose-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    model.requestKey=state.requestKey;
    const wasNew=!state.sourceTeamId;
    const wasDraft=value(state.team?.status)==='DRAFT';
    setStatus('일정과 전체 포스 편성안을 Server에 한 번에 반영하고 있습니다.','progress');
    setControlsDisabled(true);
    try{
      const result=await bridge().saveComposition(model);
      const teamId=Number(result.teamId||state.sourceTeamId||0);
      const message=(wasNew||wasDraft?'팀을 생성했습니다.':'팀 변경사항을 저장했습니다.')+' · '+teamForces().length+'포스 · team '+value(teamId)+' · revision '+value(result.revision);
      close();if(window.KinojoToast?.success)window.KinojoToast.success(message);else window.KinojoToast?.show?.(message);
    }catch(error){
      state.saving=false;
      setStatus(value(error?.message)||'전체 팀 편성안을 저장하지 못했습니다.','error');
      setControlsDisabled(false);
    }
  }

  function addForce(){
    if(state.saving||state.mutating||!state.team)return;
    const forces=teamForces();
    if(forces.length>=9){setStatus('한 팀에는 최대 9포스까지만 구성할 수 있습니다.');return;}
    const localId=Math.min(0,...forces.map(item=>Number(item.forceId)||0))-1;const force=makeLocalForce(forces.length+1,localId);state.team.forces.push(force);refreshLocalTeam();state.selectedForceId=force.forceId;state.selectedSlotId=0;state.moveFromSlotId=0;resetCharacterLookup();renderRosterState();setStatus(force.forceNo+'포스를 로컬 편성안에 추가했습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
  }

  function candidateCharacter(candidate){
    const actorMemberId=Number(bridge()?.snapshot()?.actor?.memberId||0);
    return {characterId:Number(candidate.characterId),name:value(candidate.characterName||candidate.name),serverId:Number(candidate.serverId)||null,serverName:value(candidate.serverName),className:value(candidate.className),profileImageUrl:value(candidate.profileImageUrl),relation:value(candidate.relation)||(candidate.isMain?'MAIN':'ALT'),isMain:candidate.isMain===true,mainCharacterId:Number(candidate.mainCharacterId)||null,ownerMemberId:Number(candidate.ownerMemberId||actorMemberId)||null};
  }

  function assignCreatorCharacter(characterId){
    if(state.saving||state.mutating||!state.team)return;
    const force=selectedForce();const chosen=selectedSlot();
    const source=composerCharacters().length?composerCharacters():Array.isArray(force?.creatorCandidates)?force.creatorCandidates:[];
    const candidate=source.find(item=>Number(item.characterId)===Number(characterId));
    if(!force||!chosen||chosen.slot.occupied||!candidate){setStatus('빈 슬롯과 내 캐릭터를 다시 선택해 주세요.');return;}
    if(localUsedCharacterIds().has(Number(characterId))){setStatus('같은 캐릭터는 한 팀 편성안에 중복 배치할 수 없습니다.');return;}
    const slotNumber=slotDisplayNumber(chosen);
    chosen.slot.character=candidateCharacter(candidate);chosen.slot.occupied=true;state.selectedSlotId=0;state.moveFromSlotId=0;resetCharacterLookup();refreshLocalTeam();renderRosterState();
    setStatus((candidate.isMain?'본캐 ':'부캐 ')+value(candidate.characterName)+' 캐릭터를 '+force.forceNo+'포스 '+slotNumber+'번에 배치했습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
  }

  async function searchCharacter(query,isMainSearch=false){
    if(state.saving||state.mutating||!state.team||!selectedSlot())return;
    if(!state.sourceTeamId){setStatus('외부·게스트 캐릭터 검색은 팀을 만든 뒤 편집에서 사용할 수 있습니다.');return;}
    const key=isMainSearch?'mainLookup':'lookup';
    state[key]={loading:true};
    renderRosterState();
    try{
      const result=await bridge().searchCharacter(Number(state.sourceTeamId),value(query));
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

  function assignSearchedCharacter(character){
    if(state.saving||state.mutating||!state.team||!character)return;
    const force=selectedForce(),chosen=selectedSlot();
    if(!force||!chosen||chosen.slot.occupied){setStatus('캐릭터를 추가할 빈 슬롯을 다시 선택해 주세요.');return;}
    if(localUsedCharacterIds().has(Number(character.characterId))){setStatus('같은 캐릭터는 한 팀 편성안에 중복 배치할 수 없습니다.');return;}
    const slotNumber=slotDisplayNumber(chosen);
    chosen.slot.character=candidateCharacter(character);chosen.slot.occupied=true;state.selectedSlotId=0;state.moveFromSlotId=0;resetCharacterLookup();refreshLocalTeam();renderRosterState();
    setStatus(value(character.characterName)+' 캐릭터를 '+force.forceNo+'포스 '+slotNumber+'번에 배치했습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
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
      const result=await bridge().registerCharacter(Number(state.sourceTeamId),source.candidateId,relation,mainId,state.characterRequestKey);
      state.characterRequestKey='';state.mutating=false;setControlsDisabled(false);
      if(asMainOnly){state.mainLookup={character:result.character};renderRosterState();setStatus(result.character.characterName+' 본캐를 공식 확인했습니다. 이제 부캐를 추가할 수 있습니다.','success');return;}
      await assignSearchedCharacter(result.character);
    }catch(error){state.mutating=false;setControlsDisabled(false);renderRosterState();setStatus(value(error?.message)||'공식 캐릭터 관계를 확정하지 못했습니다.','error');}
  }

  function moveSlot(fromSlotId,toSlotId){
    if(state.saving||state.mutating||!state.team||Number(fromSlotId)===Number(toSlotId))return;
    const source=teamSlot(fromSlotId);const target=teamSlot(toSlotId);
    if(!source?.slot?.occupied||!target){setStatus('캐릭터가 있는 출발 슬롯과 이동할 위치를 다시 선택해 주세요.');return;}
    const sourceCharacter=source.slot.character;source.slot.character=target.slot.character||null;source.slot.occupied=Boolean(source.slot.character);target.slot.character=sourceCharacter;target.slot.occupied=true;
    const sourceForceNo=source.force.forceNo,targetForceNo=target.force.forceNo;state.selectedForceId=target.force.forceId;state.moveFromSlotId=0;state.draggedSlotId=0;state.selectedSlotId=0;refreshLocalTeam();renderRosterState();
    setStatus(sourceForceNo+'포스에서 '+targetForceNo+'포스로 캐릭터 위치를 옮겼습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
  }

  function clearSlot(slotId){
    const item=teamSlot(slotId);if(!item?.slot?.occupied)return;
    const name=value(item.slot.character?.name);item.slot.character=null;item.slot.occupied=false;state.selectedSlotId=0;state.moveFromSlotId=0;state.draggedSlotId=0;refreshLocalTeam();renderRosterState();setStatus(name+' 캐릭터를 로컬 편성안에서 뺐습니다.','success');
  }

  function removeForce(forceId){
    const forces=teamForces();if(forces.length<=1){setStatus('팀에는 포스가 최소 1개 필요합니다.');return;}
    const index=state.team.forces.findIndex(force=>Number(force.forceId)===Number(forceId));if(index<0)return;
    const removed=state.team.forces.splice(index,1)[0];refreshLocalTeam();const next=state.team.forces[Math.min(index,state.team.forces.length-1)];state.selectedForceId=Number(next?.forceId||0);state.selectedSlotId=0;state.moveFromSlotId=0;resetCharacterLookup();renderRosterState();setStatus(removed.forceNo+'포스를 로컬 편성안에서 제거했습니다. 포함된 캐릭터 '+removed.occupiedCount+'명도 함께 빠졌으며 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
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
    const force=event.target.closest?.('[data-draft-force]');
    if(force&&state.draggedSlotId&&Number(force.dataset.draftForce)!==Number(state.selectedForceId)){
      event.preventDefault();state.dragSwitching=true;state.selectedForceId=Number(force.dataset.draftForce)||0;state.selectedSlotId=0;resetCharacterLookup();renderRosterState();setStatus('대상 포스로 화면을 전환했습니다. 원하는 슬롯에 카드를 놓아 주세요.','progress');setTimeout(()=>{state.dragSwitching=false;},0);return;
    }
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
    if(state.dragSwitching)return;
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
      form.querySelector('[data-draft-date-label]').textContent=kind.dataset.draftKind==='WEEKLY'?'반복 시작일':'진행 날짜';
      if(kind.dataset.draftKind==='WEEKLY')syncNextRepeatDate();
      return;
    }
    const period=event.target.closest('[data-draft-period]');
    if(period){state.layer.querySelectorAll('[data-draft-period]').forEach(button=>button.setAttribute('aria-pressed',String(button===period)));syncTimeFromParts();return;}
    const duration=event.target.closest('[data-draft-duration]');
    if(duration){const form=state.layer.querySelector('[data-draft-form]');form.elements.draftDuration.value=duration.dataset.draftDuration;form.querySelectorAll('[data-draft-duration]').forEach(button=>button.setAttribute('aria-pressed',String(button===duration)));return;}
    const remove=event.target.closest('[data-draft-remove-force]');
    if(remove&&!remove.disabled){removeForce(Number(remove.dataset.draftRemoveForce));return;}
    const force=event.target.closest('[data-draft-force]');
    if(force&&!force.disabled){state.selectedForceId=Number(force.dataset.draftForce)||0;state.selectedSlotId=0;resetCharacterLookup();renderRosterState();return;}
    if(event.target.closest('[data-draft-add-force]')){addForce();return;}
    const clear=event.target.closest('[data-draft-clear-slot]');
    if(clear&&!clear.disabled){clearSlot(Number(clear.dataset.draftClearSlot));return;}
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
    if(event.target.closest('[data-draft-reset]')){const fresh=state.sourceTeamId?bridge()?.findTeam?.(state.sourceTeamId):null;openDraft(fresh,state.opener);}
  }

  function handleChange(event){
    if(event.target.name==='draftSanctuary'){syncDateMinimum();syncNextRepeatDate();}
    if(event.target.name==='draftWeekday')syncNextRepeatDate();
    if(event.target.name==='draftMonth'||event.target.name==='draftDay')syncDateFromParts();
    if(event.target.name==='draftHour'||event.target.name==='draftMinute')syncTimeFromParts();
  }

  function handleInput(event){
    if(event.target.name==='draftMonth'||event.target.name==='draftDay')event.target.value=event.target.value.replace(/\D/g,'').slice(0,2);
    if(event.target.name==='draftHour'||event.target.name==='draftMinute')event.target.value=event.target.value.replace(/\D/g,'').slice(0,2);
  }

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
