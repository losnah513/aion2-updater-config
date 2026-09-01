(function(){
  'use strict';

  const WEEKDAYS=Object.freeze([
    {value:3,label:'수'},{value:4,label:'목'},{value:5,label:'금'},{value:6,label:'토'},
    {value:7,label:'일'},{value:1,label:'월'},{value:2,label:'화'}
  ]);
  const UNLIMITED_DURATION_MINUTES=720;
  const DURATION_OPTIONS=Object.freeze([{value:30,label:'30분'},{value:60,label:'1시간'},{value:120,label:'2시간'},{value:UNLIMITED_DURATION_MINUTES,label:'무제한'}]);
  const CLASS_ICON_MAP=Object.freeze({'수호성':'templar','검성':'gladiator','살성':'assassin','궁성':'ranger','마도성':'sorcerer','정령성':'elementalist','치유성':'cleric','호법성':'chanter','권성':'fighter'});
  const SLOT_CLASSES=Object.freeze([
    {code:'ALL',label:'전체',className:''},{code:'TEMPLAR',label:'수호성',className:'수호성'},
    {code:'GLADIATOR',label:'검성',className:'검성'},{code:'ASSASSIN',label:'살성',className:'살성'},
    {code:'RANGER',label:'궁성',className:'궁성'},{code:'SORCERER',label:'마도성',className:'마도성'},
    {code:'ELEMENTALIST',label:'정령성',className:'정령성'},{code:'CLERIC',label:'치유성',className:'치유성'},
    {code:'CHANTER',label:'호법성',className:'호법성'},{code:'FIGHTER',label:'권성',className:'권성'}
  ]);
  const CLASS_CODE_BY_NAME=Object.freeze(Object.fromEntries(SLOT_CLASSES.filter(item=>item.className).map(item=>[item.className,item.code])));
  const POWER_ICON_URL='https://assets.playnccdn.com/static-aion2/characters/img/info/profile_power_icon_pc.png';
  const state={layer:null,opener:null,team:null,sourceTeamId:0,creationMode:'FIXED',joinPolicy:'INSTANT',selectedForceId:0,selectedSlotId:0,moveFromSlotId:0,draggedSlotId:0,dragSwitching:false,requirementTarget:null,classTargetSlotId:0,showCreatorCandidates:false,requestKey:'',forceSaveRequestKey:'',forceAddRequestKey:'',slotRequestKey:'',moveRequestKey:'',characterRequestKey:'',leaseToken:'',leaseTimer:0,message:'',tone:'',saving:false,mutating:false,lookup:null,mainLookup:null,linkedAlts:null,relationType:'',baselineCompositionSignature:'',balancePreview:null,balanceAppliedToken:'',balanceAppliedSignature:'',balanceStableSeed:''};
  const value=input=>String(input??'').trim();
  const escapeHtml=input=>String(input??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const bridge=()=>window.KinojoSanctuaryManagementDraftBridge;
  const DIFFICULTY_LABELS=Object.freeze({EASY:'쉬움',NORMAL:'보통',HARD:'어려움'});

  function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));}
  function classIconFor(className){const key=CLASS_ICON_MAP[value(className).replace(/[\s\u200B-\u200D\uFEFF]+/g,'').replace(/[\[(（].*?[\])）]\s*$/g,'')];return key?'/assets/images/classes/class_icon_'+key+'.png':'';}
  function classCodeFor(className){return CLASS_CODE_BY_NAME[value(className).replace(/[\s\u200B-\u200D\uFEFF]+/g,'').replace(/[\[(（].*?[\])）]\s*$/g,'')]||'';}
  function classOption(code){return SLOT_CLASSES.find(item=>item.code===value(code).toUpperCase())||SLOT_CLASSES[0];}
  function slotClassCode(slot){return classOption(slot?.requiredClassCode).code;}
  function assignmentKind(slot){return value(slot?.assignmentKind||slot?.character?.assignmentKind).toUpperCase()==='RANDOM_ALT'?'RANDOM_ALT':'ACTUAL_CHARACTER';}
  function slotAcceptsCharacter(slot,character){const required=slotClassCode(slot);if(character?.isRandomAlt){const reserved=classOption(character.randomClassCode||classCodeFor(character.className)).code;return required==='ALL'||reserved==='ALL'||required===reserved;}return required==='ALL'||required===classCodeFor(character?.className);}
  function combatPowerValue(input){const power=Number(input);return Number.isFinite(power)&&power>0?Math.round(power):0;}
  function itemLevelValue(input){const level=Number(input);return Number.isFinite(level)&&level>0?Math.round(level):0;}
  function formatCombatPower(input){const power=combatPowerValue(input);return power?(power/1000).toFixed(1)+'K':'—';}
  function combatPowerMarkup(input,prefix=''){return '<span class="sanctuary-management-power-value" title="전투력 '+escapeHtml(formatCombatPower(input))+'">'+(prefix?'<span>'+escapeHtml(prefix)+'</span>':'')+'<img src="'+POWER_ICON_URL+'" alt="전투력"><b>'+escapeHtml(formatCombatPower(input))+'</b></span>';}
  function emptyRequirements(){return {satisfied:true,ruleCount:0,unsatisfiedCount:0,rules:[]};}
  function scopeRules(scope){return Array.isArray(scope?.requirements?.rules)?scope.requirements.rules:[];}
  function refreshRequirementScope(scope,slots){
    const occupied=slots.filter(slot=>slot.occupied&&slot.character&&!slot.character.isRandomAlt);
    const known=occupied.map(slot=>combatPowerValue(slot.character?.power)).filter(Boolean);
    scope.combatPower={average:known.length?Math.round(known.reduce((sum,power)=>sum+power,0)/known.length):0,total:known.reduce((sum,power)=>sum+power,0),knownCount:known.length,occupiedCount:occupied.length,unknownCount:occupied.length-known.length};
    const rules=scopeRules(scope).map(rule=>{
      const ruleType=value(rule.ruleType).toUpperCase();const minimumCount=Math.max(1,Number(rule.minimumCount)||1);const powerThreshold=ruleType==='POWER_MIN'?combatPowerValue(rule.powerThreshold):0;const itemLevelThreshold=ruleType==='ITEM_LEVEL_MIN'?itemLevelValue(rule.itemLevelThreshold):0;
      const matchingCount=occupied.filter(slot=>ruleType==='MAIN_MIN'?(value(slot.character?.relation).toUpperCase()==='MAIN'||slot.character?.isMain===true):ruleType==='ITEM_LEVEL_MIN'?itemLevelValue(slot.character?.itemLevel)>=itemLevelThreshold:combatPowerValue(slot.character?.power)>=powerThreshold).length;
      return Object.assign({},rule,{ruleType,minimumCount,powerThreshold:powerThreshold||null,itemLevelThreshold:itemLevelThreshold||null,matchingCount,satisfied:matchingCount>=minimumCount,message:ruleType==='MAIN_MIN'?'본캐 '+minimumCount+'명 이상':ruleType==='ITEM_LEVEL_MIN'?'아이템레벨 '+itemLevelThreshold+' 이상 '+minimumCount+'명 이상':'전투력 '+(powerThreshold/1000).toFixed(1)+'K 이상 '+minimumCount+'명 이상'});
    });
    scope.requirements={satisfied:rules.every(rule=>rule.satisfied),ruleCount:rules.length,unsatisfiedCount:rules.filter(rule=>!rule.satisfied).length,rules};
  }
  function makeLocalForce(forceNo,localForceId){
    const forceId=Number(localForceId)||-forceNo;
    const localKey=Math.abs(forceId);
    const parties=[1,2].map(partyNo=>({partyId:-(localKey*10+partyNo),partyNo,capacity:5,occupiedCount:0,vacancyCount:5,combatPower:{average:0,total:0,knownCount:0,occupiedCount:0,unknownCount:0},requirements:emptyRequirements(),slots:Array.from({length:5},(_,index)=>({slotId:-(localKey*100+partyNo*10+index+1),slotNo:index+1,revision:1,occupied:false,character:null,requiredClassCode:'ALL',requiredClassName:'전체 클래스',assignmentKind:'ACTUAL_CHARACTER',placementLocked:false}))}));
    return {forceId,forceNo,capacity:10,status:'OPEN',revision:1,difficulty:'NORMAL',minimumItemLevel:null,occupiedCount:0,vacancyCount:10,combatPower:{average:0,total:0,knownCount:0,occupiedCount:0,unknownCount:0},requirements:emptyRequirements(),creatorMemberId:Number(bridge()?.snapshot()?.actor?.memberId||0),creatorOwnerResolved:true,creatorAlreadyAssigned:false,creatorCandidateCode:'READY',creatorCandidateCount:0,creatorCandidates:[],viewerAlreadyAssigned:false,viewerPending:false,canSupport:false,parties};
  }
  function makeLocalTeam(mode){
    const normalized=mode==='PARTICIPATION'?'PARTICIPATION':'FIXED';
    const forces=[makeLocalForce(1)];
    return {localOnly:true,teamId:0,sanctuaryId:null,title:'',activity:'',mode:normalized,joinPolicy:'INSTANT',difficulty:'NORMAL',status:'DRAFT',revision:0,canEdit:true,canArchive:false,schedule:defaultSchedule(),forces,forceCount:forces.length,slotCount:forces.length*10,occupiedCount:0,vacancyCount:forces.length*10};
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
        refreshRequirementScope(party,party.slots);
        forceOccupied+=party.occupiedCount;
      });
      force.occupiedCount=forceOccupied;force.vacancyCount=force.capacity-forceOccupied;
      refreshRequirementScope(force,force.parties.flatMap(party=>party.slots));
      const creatorIsActor=Number(force.creatorMemberId||actorMemberId)===actorMemberId;
       const derivedCreatorAssigned=force.parties.some(party=>party.slots.some(slot=>slot.character&&!slot.character.isRandomAlt&&(Number(slot.character.ownerMemberId||0)===Number(force.creatorMemberId||actorMemberId)||creatorIsActor&&actorCharacterIds.has(Number(slot.character.characterId)))));
      if(state.team.localOnly||creatorIsActor)force.creatorAlreadyAssigned=derivedCreatorAssigned;
    });
    state.team.forceCount=state.team.forces.length;
    state.team.slotCount=state.team.forceCount*10;
    state.team.occupiedCount=state.team.forces.reduce((sum,force)=>sum+force.occupiedCount,0);
    state.team.vacancyCount=state.team.slotCount-state.team.occupiedCount;
  }

  function composerCharacters(){return Array.isArray(bridge()?.snapshot()?.composerCharacters?.characters)?bridge().snapshot().composerCharacters.characters:[];}
  function localUsedCharacterIds(){return new Set(teamForces().flatMap(force=>forceSlots(force)).map(item=>Number(item.slot.character?.characterId||0)).filter(Boolean));}
  function characterRootId(character){return Number(character?.mainCharacterId)||(character?.isMain===true||value(character?.relation).toUpperCase()==='MAIN'?Number(character?.characterId):0)||0;}
  function characterRootName(character){return value(character?.mainCharacterName||(character?.isMain===true||value(character?.relation).toUpperCase()==='MAIN'?(character?.characterName||character?.name):''));}
  function identityKey(input){return value(input).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,'');}
  function sameCharacterFamily(left,right){
    if(!left||!right)return false;
    const leftRoot=characterRootId(left),rightRoot=characterRootId(right);
    if(leftRoot&&rightRoot)return leftRoot===rightRoot;
    const leftOwner=Number(left.ownerMemberId),rightOwner=Number(right.ownerMemberId);
    if(leftOwner&&rightOwner)return leftOwner===rightOwner;
    const leftName=identityKey(characterRootName(left)),rightName=identityKey(characterRootName(right));
    const leftServer=Number(left.serverId),rightServer=Number(right.serverId);
    return Boolean(leftName&&rightName&&leftName===rightName&&(!leftServer||!rightServer||leftServer===rightServer));
  }
  function characterFamilyRole(character){
    const relation=value(character?.relation).toUpperCase();
    if(character?.isRandomAlt===true||relation==='RANDOM_ALT'||value(character?.assignmentKind).toUpperCase()==='RANDOM_ALT')return 'RANDOM_ALT';
    const characterId=Number(character?.characterId),rootId=characterRootId(character);
    if(character?.isMain===true||relation==='MAIN'||characterId&&rootId&&characterId===rootId)return 'MAIN';
    return 'ALT';
  }
  function characterDisplayName(character){return value(character?.name||character?.characterName||character?.mainCharacterName||'캐릭터');}
  function forceCharacterFamilyConflict(force,character,excludedSlotId=0){
    if(!force||!character)return null;
    const item=forceSlots(force).find(entry=>Number(entry.slot.slotId)!==Number(excludedSlotId)&&entry.slot.occupied&&sameCharacterFamily(entry.slot.character,character));
    if(!item)return null;
    const occupied=item.slot.character,role=characterFamilyRole(occupied);
    return {force,item,character:occupied,role,name:characterDisplayName(occupied)};
  }
  function forceHasCharacterFamily(force,character,excludedSlotId=0){return Boolean(forceCharacterFamilyConflict(force,character,excludedSlotId));}
  function familyConflictText(conflict,forceLabel='이 포스'){
    if(!conflict)return '';
    if(conflict.role==='RANDOM_ALT')return '랜덤 부캐 · '+forceLabel+'에 소속됨';
    return (conflict.role==='MAIN'?'본캐 ':'부캐 ')+conflict.name+' · '+forceLabel+'에 소속됨';
  }
  function familyConflictMarkup(conflict){
    if(!conflict)return '';
    const lead=conflict.role==='RANDOM_ALT'?'랜덤 부캐':(conflict.role==='MAIN'?'본캐':'부캐');
    const name=conflict.role==='RANDOM_ALT'?'':'<strong class="sanctuary-management-linked-alt-unavailable-name">'+escapeHtml(conflict.name)+'</strong>';
    return '<span class="sanctuary-management-linked-alt-unavailable-lead is-'+conflict.role.toLowerCase().replace('_','-')+'">'+escapeHtml(lead)+'</span>'+name+'<span class="sanctuary-management-linked-alt-unavailable-copy">· 이 포스에 소속됨</span>';
  }
  function localFamilyConflict(){
    for(const force of teamForces()){
      const occupied=forceSlots(force).filter(item=>item.slot.occupied&&item.slot.character);
      for(let index=0;index<occupied.length;index+=1)for(let other=index+1;other<occupied.length;other+=1)if(sameCharacterFamily(occupied[index].slot.character,occupied[other].slot.character))return {force,item:occupied[index],character:occupied[index].slot.character,role:characterFamilyRole(occupied[index].slot.character),name:characterDisplayName(occupied[index].slot.character)};
    }
    return null;
  }

  function compositionSignature(includeLocks=true){
    return JSON.stringify(teamForces().map(force=>({sourceForceId:Number(force.forceId)>0?Number(force.forceId):null,difficulty:normalizeDifficulty(force.difficulty),slots:forceSlots(force).map(item=>({partyNo:item.partyNo,slotNo:Number(item.slot.slotNo),characterId:Number(item.slot.character?.characterId||0)||null,mainCharacterId:item.slot.character?.isRandomAlt?Number(item.slot.character.mainCharacterId)||null:null,assignmentKind:assignmentKind(item.slot),requiredClassCode:slotClassCode(item.slot),...(includeLocks?{placementLocked:item.slot.placementLocked===true}:{})}))})));
  }

  function invalidateBalanceProposal(){
    const hadProposal=Boolean(state.balancePreview||state.balanceAppliedToken);
    state.balancePreview=null;state.balanceAppliedToken='';state.balanceAppliedSignature='';
    return hadProposal;
  }

  function resetCharacterLookup(){state.lookup=null;state.mainLookup=null;state.linkedAlts=null;state.relationType='';state.characterRequestKey='';}

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
  function sanctuaryByCode(code){return sanctuaryItems().find(item=>sanctuaryCode(item)===value(code))||null;}
  function entryModes(item){return Array.isArray(item?.entryModes)?item.entryModes.filter(mode=>mode&&typeof mode==='object'):[];}
  function normalizeDifficulty(input){const difficulty=value(input||'NORMAL').toUpperCase();return DIFFICULTY_LABELS[difficulty]?difficulty:'NORMAL';}
  function modeDifficulty(mode){const key=value(mode?.key||'default').toUpperCase();return key==='EASY'||key==='HARD'?key:'NORMAL';}
  function difficultyOptions(item){const seen=new Set();return entryModes(item).map(mode=>({difficulty:modeDifficulty(mode),label:value(mode.label)||DIFFICULTY_LABELS[modeDifficulty(mode)],minItemLevel:itemLevelValue(mode.minItemLevel),sortOrder:Number(mode.sortOrder)||1})).filter(option=>!seen.has(option.difficulty)&&seen.add(option.difficulty)).sort((left,right)=>left.sortOrder-right.sortOrder);}
  function activeSanctuaryCode(){return value(state.layer?.querySelector('[data-draft-form]')?.elements?.draftSanctuary?.value)||selectedCode();}
  function selectedDifficulty(force=selectedForce()){return normalizeDifficulty(force?.difficulty||state.team?.difficulty||'NORMAL');}
  function minimumItemLevel(code=activeSanctuaryCode(),difficulty=selectedDifficulty()){
    const sanctuary=sanctuaryByCode(code);const modes=entryModes(sanctuary);if(!modes.length)return 0;
    const wanted=normalizeDifficulty(difficulty);const mode=modes.find(item=>modeDifficulty(item)===wanted)||modes.find(item=>modeDifficulty(item)==='NORMAL')||modes[0];return itemLevelValue(mode?.minItemLevel);
  }
  function characterEligible(character,code=activeSanctuaryCode(),difficulty=selectedDifficulty()){
    const minimum=minimumItemLevel(code,difficulty);return !minimum||itemLevelValue(character?.itemLevel??character?.latestPveItemLevel??character?.latest_pve_item_level)>=minimum;
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
    layer.addEventListener('wheel',handleDraftWheel,{passive:false});
    layer.addEventListener('scroll',event=>{
      if(event.target.matches?.('.sanctuary-management-builder-dialog,.sanctuary-management-schedule-scroll,.sanctuary-management-force-list,.sanctuary-management-candidate-list,.sanctuary-management-linked-alt-panel>div'))syncScrollFade(event.target);
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
    state.opener=null;state.team=null;state.sourceTeamId=0;state.creationMode='FIXED';state.joinPolicy='INSTANT';state.selectedForceId=0;state.selectedSlotId=0;state.moveFromSlotId=0;state.draggedSlotId=0;state.dragSwitching=false;state.requirementTarget=null;state.classTargetSlotId=0;state.showCreatorCandidates=false;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.moveRequestKey='';state.leaseToken='';state.message='';state.tone='';state.saving=false;state.mutating=false;resetCharacterLookup();
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
    const shell=scroller.matches('.sanctuary-management-builder-dialog')?scroller.closest('.sanctuary-management-draft-frame'):scroller.matches('.sanctuary-management-force-list')?scroller.closest('.sanctuary-management-force-rail'):scroller.matches('.sanctuary-management-candidate-list')?scroller.closest('.sanctuary-management-candidate-rail'):scroller.matches('.sanctuary-management-linked-alt-panel>div')?scroller.closest('.sanctuary-management-linked-alt-panel'):scroller.closest('.sanctuary-management-schedule-panel');
    shell?.classList.toggle('has-more',hasMore);
  }

  function syncScrollFades(){
    state.layer?.querySelectorAll('.sanctuary-management-builder-dialog,.sanctuary-management-schedule-scroll,.sanctuary-management-force-list,.sanctuary-management-candidate-list,.sanctuary-management-linked-alt-panel>div').forEach(syncScrollFade);
  }

  function handleDraftWheel(event){
    if(event.ctrlKey||Math.abs(event.deltaY)<=Math.abs(event.deltaX))return;
    const linkedScroller=state.layer?.querySelector('.sanctuary-management-linked-alt-panel.is-open>div');
    const localScroller=event.target.closest?.('.sanctuary-management-schedule-scroll,.sanctuary-management-force-list,.sanctuary-management-candidate-list,.sanctuary-management-builder-dialog');
    const scroller=linkedScroller||localScroller;if(!scroller||scroller.scrollHeight<=scroller.clientHeight+1)return;
    const canMove=event.deltaY>0?scroller.scrollTop+scroller.clientHeight<scroller.scrollHeight-1:scroller.scrollTop>0;if(!canMove)return;
    event.preventDefault();scroller.scrollBy({top:event.deltaY,left:0,behavior:'smooth'});requestAnimationFrame(()=>syncScrollFade(scroller));
  }

  function openMode(opener){
    if(!bridge()?.snapshot()?.writeEnabled)return;
    state.creationMode='FIXED';state.joinPolicy='INSTANT';
    openDraft(null,opener);
  }

  function teamForces(){
    return Array.isArray(state.team?.forces)?state.team.forces.slice().sort((left,right)=>Number(left.forceNo)-Number(right.forceNo)):[];
  }

  function currentMode(){return value(state.team?.mode||state.creationMode).toUpperCase()==='PARTICIPATION'?'PARTICIPATION':'FIXED';}
  function currentJoinPolicy(){return value(state.joinPolicy).toUpperCase()==='APPROVAL'?'APPROVAL':'INSTANT';}
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
      return '<div class="sanctuary-management-force-option'+(selected?' is-active':'')+(force.requirements?.satisfied===false?' has-unmet-requirements':'')+'"><button type="button" data-draft-force="'+escapeHtml(force.forceId)+'" class="'+(selected?'is-active':'')+'" aria-pressed="'+selected+'"'+(busy?' disabled':'')+'><strong>'+escapeHtml(force.forceNo)+'포스</strong><small>'+escapeHtml(force.occupiedCount)+' / '+escapeHtml(force.capacity)+'명'+(force.requirements?.satisfied===false?' · 조건 미충족':state.team?.localOnly?' · 편집 중':' · rev '+escapeHtml(force.revision))+'</small></button>'+(removable?'<button type="button" class="sanctuary-management-force-remove" data-draft-remove-force="'+escapeHtml(force.forceId)+'" aria-label="'+escapeHtml(force.forceNo)+'포스 제거"'+(busy?' disabled':'')+'>−</button>':'')+'</div>';
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
    const required=classOption(slotClassCode(slot));
    const classRecruiting=!occupied&&required.code!=='ALL';
    const requiredIcon=classIconFor(required.className);
    const pickerOpen=Number(slot.slotId)===Number(state.classTargetSlotId);
    const locked=occupied&&slot.placementLocked===true;
    const detail=occupied?(locked?'배치 잠금':slot.character?.isRandomAlt?'랜덤 부캐 미확정':''):classRecruiting?'':selected?'후보를 선택해 추가':'눌러서 캐릭터 선택';
    const characterIconPath=occupied&&!slot.character?.isRandomAlt?classIconFor(slot.character?.className):requiredIcon;
    const characterIcon='<span class="sanctuary-management-draft-character-icon" aria-hidden="true">'+(characterIconPath?'<img src="'+escapeHtml(characterIconPath)+'" alt="">':slot.character?.isRandomAlt?'R':required.code==='ALL'?'+':'?')+'</span>';
    const detailMarkup=occupied&&!slot.character?.isRandomAlt?combatPowerMarkup(slot.character?.power)+(detail?' · '+escapeHtml(detail):''):escapeHtml(detail);
    const disabled=state.saving||state.mutating;
    const picker=pickerOpen?'<div class="sanctuary-management-slot-class-picker" role="group" aria-label="'+number+'번 슬롯 지원 클래스">'+SLOT_CLASSES.map(option=>{const icon=classIconFor(option.className);return '<button type="button" data-slot-class="'+option.code+'" data-slot-id="'+escapeHtml(slot.slotId)+'" aria-pressed="'+String(option.code===required.code)+'" title="'+escapeHtml(option.label)+'"'+(disabled?' disabled':'')+'>'+(icon?'<img src="'+escapeHtml(icon)+'" alt=""><span>'+escapeHtml(option.label)+'</span>':'<b>ALL</b><span>전체</span>')+'</button>';}).join('')+'</div>':'';
    const lockControl=moving&&occupied?'<button type="button" class="sanctuary-management-slot-lock" data-draft-toggle-lock="'+escapeHtml(slot.slotId)+'" aria-pressed="'+String(locked)+'" aria-label="'+escapeHtml(name)+' 배치 '+(locked?'잠금 해제':'잠금')+'"'+(disabled?' disabled':'')+'>'+(locked?'잠금 해제':'배치 잠금')+'</button>':'';
    const displayName=classRecruiting?required.label+' 모집 중':name;
    const detailLine=moving?escapeHtml(locked?'잠금 해제 후 이동·제거 가능':'이동하거나 − 버튼으로 제거'):detailMarkup;
    return '<div class="sanctuary-management-draft-slot-shell'+(moving?' is-selected':'')+(pickerOpen?' has-class-picker':'')+(locked?' is-placement-locked':'')+(classRecruiting?' is-class-slot':'')+'"><button type="button" class="sanctuary-management-slot-class-trigger" data-slot-class-open="'+escapeHtml(slot.slotId)+'" aria-expanded="'+String(pickerOpen)+'" aria-label="지원 클래스: '+escapeHtml(required.label)+'" title="지원 클래스: '+escapeHtml(required.label)+'"'+(disabled?' disabled':'')+'>'+(requiredIcon?'<img src="'+escapeHtml(requiredIcon)+'" alt=""><span>'+escapeHtml(required.label)+'</span>':'<b>ALL</b><span>전체</span>')+'</button><button type="button" class="sanctuary-management-draft-slot'+(occupied?' is-occupied':'')+(selected?' is-selected':'')+(moving?' is-move-source':'')+(slot.character?.isRandomAlt?' is-random-alt':'')+(locked?' is-placement-locked':'')+(classRecruiting?' is-class-slot':'')+'"'+(disabled?' disabled':'')+(occupied&&!locked?' draggable="true"':'')+' data-draft-slot data-slot-number="'+number+'" data-slot-id="'+escapeHtml(slot.slotId)+'" data-slot-revision="'+escapeHtml(slot.revision)+'" data-party-no="'+escapeHtml(partyNo)+'" data-slot-no="'+escapeHtml(slot.slotNo)+'" data-occupied="'+String(Boolean(occupied))+'" data-placement-locked="'+String(locked)+'" aria-pressed="'+String(selected||moving)+'">'+characterIcon+'<span class="sanctuary-management-draft-slot-copy"><strong>'+escapeHtml(displayName)+'</strong>'+(detailLine?'<small>'+detailLine+'</small>':'')+'</span></button>'+lockControl+(moving&&!locked?'<button type="button" class="sanctuary-management-slot-remove" data-draft-clear-slot="'+escapeHtml(slot.slotId)+'" aria-label="'+escapeHtml(name)+' 캐릭터 제거"'+(disabled?' disabled':'')+'>−</button>':'')+picker+'</div>';
  }

  function applySlotClass(slotId,classCode){
    const item=teamSlot(slotId);const option=classOption(classCode);if(!item)return;
    if(item.slot.character?.isRandomAlt){
      invalidateBalanceProposal();item.slot.requiredClassCode=option.code;item.slot.requiredClassName=option.code==='ALL'?'전체 클래스':option.label;item.slot.character.randomClassCode=option.code;item.slot.character.className=option.className||'';state.classTargetSlotId=0;renderRosterState();setStatus(slotDisplayNumber(item)+'번 랜덤 부캐 클래스를 '+option.label+'(으)로 설정했습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');return;
    }
    if(item.slot.character&&!slotAcceptsCharacter(Object.assign({},item.slot,{requiredClassCode:option.code}),item.slot.character)){
      setStatus(value(item.slot.character.name)+' 캐릭터의 클래스와 맞지 않습니다. 먼저 캐릭터를 빼거나 알맞은 클래스를 선택해 주세요.');return;
    }
    invalidateBalanceProposal();item.slot.requiredClassCode=option.code;item.slot.requiredClassName=option.code==='ALL'?'전체 클래스':option.label;state.classTargetSlotId=0;renderRosterState();setStatus(slotDisplayNumber(item)+'번 슬롯 지원 클래스를 '+option.label+'(으)로 설정했습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
  }

  function requirementTargetScope(){
    const target=state.requirementTarget;if(!target)return null;
    const force=teamForces().find(item=>Number(item.forceId)===Number(target.forceId));if(!force)return null;
    if(Number(target.partyNo))return {force,scope:force.parties.find(party=>Number(party.partyNo)===Number(target.partyNo))||null,partyNo:Number(target.partyNo),capacity:5};
    return {force,scope:force,partyNo:null,capacity:10};
  }

  function requirementEditorMarkup(){
    const target=requirementTargetScope();if(!target?.scope)return '';
    const rules=scopeRules(target.scope);const main=rules.find(rule=>value(rule.ruleType).toUpperCase()==='MAIN_MIN');const power=rules.find(rule=>value(rule.ruleType).toUpperCase()==='POWER_MIN');const itemLevel=rules.find(rule=>value(rule.ruleType).toUpperCase()==='ITEM_LEVEL_MIN');
    const scopeLabel=target.partyNo?target.force.forceNo+'포스 '+target.partyNo+'파티':target.force.forceNo+'포스 전체';
    const maximum=target.capacity;
    return '<aside class="sanctuary-management-candidate-rail sanctuary-management-requirement-editor" aria-label="'+escapeHtml(scopeLabel)+' 구성 조건">'
      +'<header><strong>배치 조건</strong><span class="sanctuary-management-candidate-position"><em>적용 범위</em><b>'+escapeHtml(scopeLabel)+'</b></span></header>'
      +'<div class="sanctuary-management-requirement-editor-body">'
        +'<section><button type="button" data-requirement-toggle="MAIN_MIN" aria-pressed="'+String(Boolean(main))+'">본캐 조건</button><label><span>최소 인원</span><input name="requirementMainCount" type="number" min="1" max="'+maximum+'" value="'+escapeHtml(main?.minimumCount||1)+'"></label><small>본캐가 지정 인원보다 적어도 팀은 저장되며 붉게 안내됩니다.</small></section>'
        +'<section><button type="button" data-requirement-toggle="POWER_MIN" data-requirement-metric aria-pressed="'+String(Boolean(power))+'">전투력 조건</button><label><span>기준</span><input name="requirementPowerK" type="number" min="1" max="1000000" step="0.1" value="'+escapeHtml(power?.powerThreshold?power.powerThreshold/1000:300)+'"><b>K</b></label><label><span>최소 인원</span><input name="requirementPowerCount" type="number" min="1" max="'+maximum+'" value="'+escapeHtml(power?.minimumCount||1)+'"></label></section>'
        +'<section><button type="button" data-requirement-toggle="ITEM_LEVEL_MIN" data-requirement-metric aria-pressed="'+String(Boolean(itemLevel))+'">아이템레벨 조건</button><label><span>기준</span><input name="requirementItemLevel" type="number" min="'+escapeHtml(minimumItemLevel()||1)+'" max="100000" step="1" value="'+escapeHtml(itemLevel?.itemLevelThreshold||minimumItemLevel()||2700)+'"></label><label><span>최소 인원</span><input name="requirementItemLevelCount" type="number" min="1" max="'+maximum+'" value="'+escapeHtml(itemLevel?.minimumCount||1)+'"></label></section>'
        +'<div class="sanctuary-management-requirement-preview"><strong>'+escapeHtml(target.scope.requirements?.satisfied===false?'현재 조건 미충족':'현재 조건 충족')+'</strong><small>'+combatPowerMarkup(target.scope.combatPower?.average,'평균')+' · '+escapeHtml(target.scope.combatPower?.knownCount||0)+'명 확인</small></div>'
      +'</div><footer><button type="button" class="is-primary" data-requirement-apply>조건 적용</button><button type="button" data-requirement-clear>조건 없음</button><button type="button" data-requirement-close>돌아가기</button></footer></aside>';
  }

  function applyRequirementEditor(clear=false){
    const target=requirementTargetScope();const editor=state.layer?.querySelector('.sanctuary-management-requirement-editor');if(!target?.scope||!editor)return;
    const rules=[];
    if(!clear){
      const mainEnabled=editor.querySelector('[data-requirement-toggle="MAIN_MIN"]')?.getAttribute('aria-pressed')==='true';
      const powerEnabled=editor.querySelector('[data-requirement-toggle="POWER_MIN"]')?.getAttribute('aria-pressed')==='true';
      const itemLevelEnabled=editor.querySelector('[data-requirement-toggle="ITEM_LEVEL_MIN"]')?.getAttribute('aria-pressed')==='true';
      const mainCount=Number(editor.querySelector('[name="requirementMainCount"]')?.value);const powerCount=Number(editor.querySelector('[name="requirementPowerCount"]')?.value);const powerK=Number(editor.querySelector('[name="requirementPowerK"]')?.value);const itemLevelCount=Number(editor.querySelector('[name="requirementItemLevelCount"]')?.value);const itemLevelThreshold=Number(editor.querySelector('[name="requirementItemLevel"]')?.value);
      if(mainEnabled&&(mainCount<1||mainCount>target.capacity)){setStatus('본캐 최소 인원을 1명부터 '+target.capacity+'명 사이로 입력해 주세요.');return;}
      if(powerEnabled&&(powerCount<1||powerCount>target.capacity||powerK<1||powerK>1000000)){setStatus('전투력 기준과 최소 인원을 다시 확인해 주세요.');return;}
      if(itemLevelEnabled&&(itemLevelCount<1||itemLevelCount>target.capacity||itemLevelThreshold<Math.max(1,minimumItemLevel())||itemLevelThreshold>100000)){setStatus('아이템레벨 기준과 최소 인원을 다시 확인해 주세요.');return;}
      if(powerEnabled&&itemLevelEnabled){setStatus('전투력 조건과 아이템레벨 조건 중 하나만 선택해 주세요.');return;}
      if(mainEnabled)rules.push({scopeType:target.partyNo?'PARTY':'FORCE',partyNo:target.partyNo,ruleType:'MAIN_MIN',minimumCount:mainCount,powerThreshold:null});
      if(powerEnabled)rules.push({scopeType:target.partyNo?'PARTY':'FORCE',partyNo:target.partyNo,ruleType:'POWER_MIN',minimumCount:powerCount,powerThreshold:Math.round(powerK*1000)});
      if(itemLevelEnabled)rules.push({scopeType:target.partyNo?'PARTY':'FORCE',partyNo:target.partyNo,ruleType:'ITEM_LEVEL_MIN',minimumCount:itemLevelCount,powerThreshold:null,itemLevelThreshold:Math.round(itemLevelThreshold)});
    }
    target.scope.requirements={rules};refreshLocalTeam();state.requirementTarget=null;renderRosterState();setStatus(clear?'구성 조건을 없앴습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.':'구성 조건을 로컬 편성안에 적용했습니다. 미충족 상태여도 저장할 수 있습니다.','success');
  }

  function candidateMarkup(){
    const force=selectedForce();
    const chosen=selectedSlot();
    if(!state.team||!force)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty"><span aria-hidden="true">◇</span><strong>초안 저장 후 연결</strong><p>Server가 생성자의 소유 캐릭터를 확인합니다.</p></div></aside>';
    if(state.requirementTarget)return requirementEditorMarkup();
    if(!chosen)return '<aside class="sanctuary-management-candidate-rail is-empty" aria-label="캐릭터 후보"><div class="sanctuary-management-candidate-empty"><span aria-hidden="true">◇</span><strong>빈 슬롯 선택</strong><p>'+escapeHtml(force.forceNo)+'포스의 빈 카드를 누르면 내 캐릭터와 검색 창을 표시합니다.</p></div></aside>';
    const usedIds=localUsedCharacterIds();
    const sourceCandidates=composerCharacters().length?composerCharacters():Array.isArray(force.creatorCandidates)?force.creatorCandidates:[];
    const candidates=sourceCandidates.filter(candidate=>!usedIds.has(Number(candidate.characterId))&&!forceHasCharacterFamily(force,candidate)&&characterEligible(candidate));
    const slotNumber=slotDisplayNumber(chosen);
    const selectedPosition='<span class="sanctuary-management-candidate-position"><em>선택한 포스·슬롯</em><b>'+escapeHtml(force.forceNo)+'포스 · '+escapeHtml(slotNumber)+'번 슬롯</b></span>';
    const railHeader='<header><strong>캐릭터 선택</strong>'+selectedPosition+'</header>';
    const quickCards=candidates.map(candidate=>{
      const relation=candidate.isMain?'본캐':'부캐';
      const initial=Array.from(value(candidate.characterName)||'?')[0]||'?';
      const icon=classIconFor(candidate.className);
      return '<button type="button" class="sanctuary-management-candidate-card '+(candidate.isMain?'is-main':'is-alt')+'" data-draft-candidate="'+escapeHtml(candidate.characterId)+'"'+(state.saving||state.mutating?' disabled':'')+'><span class="sanctuary-management-candidate-avatar" aria-hidden="true">'+(icon?'<img src="'+escapeHtml(icon)+'" alt="">':escapeHtml(initial))+'</span><span class="sanctuary-management-candidate-copy"><em>'+relation+'</em><strong>'+escapeHtml(candidate.characterName)+'</strong><small>['+escapeHtml(candidate.serverName||'서버 미확인')+'] · '+combatPowerMarkup(candidate.power)+'</small></span></button>';
    }).join('');
    let quick='';
    let completion='';
    if(force.creatorOwnerResolved!==true&&!sourceCandidates.length)quick='<div class="sanctuary-management-candidate-note is-warning"><strong>생성자 소유권 확인 필요</strong><small>'+escapeHtml(force.creatorCandidateCode||'OWNER_NOT_RESOLVED')+'</small></div>';
    else if(force.creatorAlreadyAssigned===true)completion='<div class="sanctuary-management-candidate-note sanctuary-management-candidate-completion is-complete"><strong>이 포스에 내 캐릭터 배치 완료</strong><small>한 이용자는 포스마다 캐릭터 1개만 배치할 수 있습니다.</small></div>';
    else if(quickCards)quick='<section class="sanctuary-management-quick-candidates"><strong>내 캐릭터</strong>'+quickCards+'</section>';
    else quick='<div class="sanctuary-management-candidate-note"><strong>추가할 내 캐릭터 없음</strong><small>캐릭터 이름 조회로 다른 구성원을 추가할 수 있습니다.</small></div>';
    let resultMarkup='<div class="sanctuary-management-search-empty"><strong>캐릭터 마스터 우선 조회</strong><small>없을 때만 아이온2 공식 정보를 확인합니다.</small></div>';
    if(state.lookup?.loading)resultMarkup='<div class="sanctuary-management-search-empty is-progress"><strong>Server 조회 중…</strong><small>캐릭터 마스터와 공식 정보를 순서대로 확인합니다.</small></div>';
    else if(state.lookup?.error)resultMarkup='<div class="sanctuary-management-search-empty is-warning"><strong>조회하지 못했습니다.</strong><small>'+escapeHtml(state.lookup.error)+'</small></div>';
    else if(state.lookup?.character){
      const character=state.lookup.character;
      const icon=classIconFor(character.className);
      const relation=character.relation==='GUEST'?'게스트':character.relation==='MAIN'?'본캐':'부캐';
      const server='['+(value(character.serverName)||'서버 미확인')+']';
      const altButton=character.canSelectAlts===true||character.relation==='MAIN'||character.isMain===true?'<button type="button" data-linked-alts-open="'+escapeHtml(character.characterId)+'">부캐 선택</button>':'';const eligible=characterEligible(character);
      resultMarkup='<article class="sanctuary-management-search-result'+(eligible?'':' is-ineligible')+'"><div class="sanctuary-management-search-result-profile"><span class="sanctuary-management-search-result-avatar" aria-hidden="true">'+(icon?'<img src="'+escapeHtml(icon)+'" alt="">':'◇')+'</span><span class="sanctuary-management-search-result-copy"><em>'+escapeHtml(relation)+'</em><strong>'+escapeHtml(character.characterName)+'</strong><small>'+escapeHtml(server)+' · '+combatPowerMarkup(character.power)+'</small></span></div><div class="sanctuary-management-search-result-actions"><button type="button" data-draft-search-character="'+escapeHtml(character.characterId)+'"'+(eligible?'':' disabled')+'>추가하기</button>'+altButton+'</div></article>';
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
      const icon=classIconFor(candidate.className);
      const server='['+(value(candidate.serverName)||'서버 미확인')+']';
      const candidateEligible=characterEligible(candidate);resultMarkup='<article class="sanctuary-management-official-result'+(candidateEligible?'':' is-ineligible')+'"><div class="sanctuary-management-official-card"><span class="sanctuary-management-search-result-avatar" aria-hidden="true">'+(icon?'<img src="'+escapeHtml(icon)+'" alt="">':'◇')+'</span><span class="sanctuary-management-search-result-copy"><em>아이온2 공식 확인</em><strong>'+escapeHtml(candidate.characterName)+'</strong><small>'+escapeHtml(server)+' · '+combatPowerMarkup(candidate.power)+'</small></span></div><p>'+(candidate.isOperationalLegion?'운영 레기온 캐릭터입니다. 본캐 또는 연결할 본캐를 확인해 주세요.':'외부 레기온 또는 레기온 미가입 캐릭터로 게스트 등록할 수 있습니다.')+'</p><div class="sanctuary-management-relation-buttons">'+relationButtons+'</div>'+relationBody+'<button type="button" class="sanctuary-management-register-character" data-draft-register-character'+(canRegister&&candidateEligible?'':' disabled')+'>관계 확정 후 추가</button></article>';
    }
    const localSearch='<div class="sanctuary-management-character-search" data-character-search-form role="search"><label><span>캐릭터 검색</span><input name="characterQuery" size="16" maxlength="48" placeholder="이름 또는 이름[서버]" autocomplete="off" required></label><button type="button" data-character-search-submit'+(state.lookup?.loading?' disabled':'')+'>검색</button></div>'+resultMarkup;
    if(state.team?.localOnly){
      const creationResult=state.lookup?resultMarkup:'';
      const creationQuick=state.showCreatorCandidates?quick:'';
      const creatorTools='<div class="sanctuary-management-creator-tools"><button type="button" class="sanctuary-management-creator-candidates-toggle" data-creator-candidates-toggle aria-expanded="'+String(state.showCreatorCandidates)+'">내 캐릭터 추가</button><div class="sanctuary-management-character-search" data-character-search-form role="search"><label><span>캐릭터 이름</span><input name="characterQuery" size="16" maxlength="48" placeholder="이름 또는 이름[서버]" autocomplete="off" required></label><button type="button" data-character-search-submit'+(state.lookup?.loading?' disabled':'')+'>조회하기</button></div></div>';
      return '<aside class="sanctuary-management-candidate-rail" aria-label="'+escapeHtml(force.forceNo)+'포스 캐릭터 선택">'+railHeader+'<div class="sanctuary-management-candidate-list" data-candidate-list>'+creatorTools+creationQuick+creationResult+'</div>'+completion+'</aside>';
    }
    return '<aside class="sanctuary-management-candidate-rail" aria-label="'+escapeHtml(force.forceNo)+'포스 '+slotNumber+'번 슬롯 캐릭터 선택">'+railHeader+'<div class="sanctuary-management-candidate-list" data-candidate-list>'+quick+'<div class="sanctuary-management-character-search" data-character-search-form role="search"><label><span>캐릭터 검색</span><input name="characterQuery" size="16" maxlength="48" placeholder="이름 또는 이름[서버]" autocomplete="off" required></label><button type="button" data-character-search-submit'+(state.lookup?.loading?' disabled':'')+'>검색</button></div>'+resultMarkup+'</div>'+completion+'<button type="button" class="sanctuary-management-search-reset" data-draft-search-reset>조회 초기화</button></aside>';
  }

  function linkedAltPanelMarkup(){
    const data=state.linkedAlts;if(!data)return '<aside class="sanctuary-management-linked-alt-panel" data-linked-alt-panel hidden></aside>';
    let body='';
    if(data.loading)body='<div class="sanctuary-management-linked-alt-state"><strong>부캐 목록 확인 중…</strong><small>캐릭터 마스터의 실제 연결 관계를 조회합니다.</small></div>';
    else if(data.error)body='<div class="sanctuary-management-linked-alt-state is-error"><strong>부캐 목록을 불러오지 못했습니다.</strong><small>'+escapeHtml(data.error)+'</small></div>';
    else{
      const chosen=selectedSlot();const force=selectedForce();const usedIds=localUsedCharacterIds();const random=data.randomCandidate;
      const randomClass=classOption(data.randomClassCode||slotClassCode(chosen?.slot));
      const randomFamilyConflict=random&&force?forceCharacterFamilyConflict(force,random):null;
      const randomAllowed=Boolean(chosen&&random&&!randomFamilyConflict);
      const randomClassChoices=SLOT_CLASSES.map(option=>{const icon=classIconFor(option.className);return '<button type="button" data-linked-alt-class="'+option.code+'" aria-pressed="'+String(option.code===randomClass.code)+'" title="'+escapeHtml(option.label)+'">'+(icon?'<img src="'+escapeHtml(icon)+'" alt=""><span>'+escapeHtml(option.label)+'</span>':'<b>ALL</b><span>전체</span>')+'</button>';}).join('');
      const randomMessage=familyConflictText(randomFamilyConflict);
      const randomCard=random?'<article class="sanctuary-management-linked-alt-card is-random'+(randomFamilyConflict?' is-unavailable':'')+'"><div class="sanctuary-management-linked-alt-random-profile"><span><b>RANDOM</b></span><span><em>랜덤 부캐</em><strong>'+escapeHtml(random.characterName)+'</strong><small>실제 캐릭터 확정 전 · 전투력/조건 계산 제외</small></span></div><div class="sanctuary-management-linked-alt-class-picker" role="group" aria-label="랜덤 부캐 클래스 선택">'+randomClassChoices+'</div><button type="button" class="sanctuary-management-linked-alt-random-add" data-linked-alt-random aria-disabled="'+String(!randomAllowed)+'"'+(!randomAllowed?' disabled':'')+'>'+escapeHtml(randomClass.label)+' 랜덤 부캐 추가</button>'+(randomFamilyConflict?'<span class="sanctuary-management-linked-alt-unavailable is-character-relation" title="'+escapeHtml(randomMessage)+'">'+familyConflictMarkup(randomFamilyConflict)+'</span>':'')+'</article>':'';
      const cards=(data.characters||[]).map(character=>{const icon=classIconFor(character.className),familyConflict=force?forceCharacterFamilyConflict(force,character):null;let message='',messageMarkup='';if(familyConflict){message=familyConflictText(familyConflict);messageMarkup=familyConflictMarkup(familyConflict);}else if(!characterEligible(character)||character.itemLevelEligible===false)message='아이템레벨이 부족합니다';else if(usedIds.has(Number(character.characterId))||character.alreadyAssignedToOtherForce===true)message='다른 포스에 소속되어 있습니다';else if(character.scheduleConflict===true)message='같은 시간 다른 포스에 소속되어 있습니다';else if(!chosen||!slotAcceptsCharacter(chosen.slot,character))message='지원 클래스가 맞지 않습니다';const disabled=Boolean(message);return '<button type="button" class="sanctuary-management-linked-alt-card'+(disabled?' is-unavailable':'')+'" data-linked-alt-character="'+escapeHtml(character.characterId)+'" aria-disabled="'+String(disabled)+'"'+(disabled?' disabled':'')+'><span>'+(icon?'<img src="'+escapeHtml(icon)+'" alt="">':'?')+'</span><span><em>부캐</em><strong>'+escapeHtml(character.characterName)+'</strong><small>['+escapeHtml(character.serverName||'서버 미확인')+'] · '+combatPowerMarkup(character.power)+'</small></span>'+(message?'<span class="sanctuary-management-linked-alt-unavailable'+(familyConflict?' is-character-relation':'')+'" title="'+escapeHtml(message)+'">'+(messageMarkup||escapeHtml(message))+'</span>':'')+'</button>';}).join('');
      body=randomCard+(cards||(!randomCard?'<div class="sanctuary-management-linked-alt-state"><strong>선택 가능한 부캐 없음</strong></div>':''));
    }
    return '<aside class="sanctuary-management-linked-alt-panel is-open" data-linked-alt-panel role="dialog" aria-modal="false" aria-label="연결된 부캐 선택"><header><div><span>LINKED ALTS</span><strong>'+escapeHtml(data.mainCharacter?.characterName||'본캐')+'의 부캐 선택</strong><small>실제 부캐 또는 저장 전 미확정 랜덤 부캐를 고르세요.</small></div><button type="button" data-linked-alts-close aria-label="부캐 선택 닫기">×</button></header><div>'+body+'</div></aside>';
  }

  function balancePanelMarkup(){
    const preview=state.balancePreview;if(!preview)return '<aside class="sanctuary-management-balance-panel" data-balance-panel hidden></aside>';
    const before=new Map((preview.beforeAverages||[]).map(item=>[Number(item.forceId),item]));
    const averages=(preview.afterAverages||[]).map(item=>{const old=before.get(Number(item.forceId))||{};return '<article><span>'+escapeHtml(item.forceNo)+'포스</span><strong>'+combatPowerMarkup(old.average)+' → '+combatPowerMarkup(item.average)+'</strong><small>'+escapeHtml(item.knownCount||0)+'명 반영</small></article>';}).join('');
    const moves=(preview.assignments||[]).map(item=>'<li><b>'+escapeHtml(item.forceNo)+'포스 '+escapeHtml((Number(item.partyNo)-1)*5+Number(item.slotNo))+'번</b><span>'+escapeHtml(item.characterName)+' ['+escapeHtml(item.serverName||'서버 미확인')+']</span><small>'+combatPowerMarkup(item.power)+'</small></li>').join('');
    const excluded=(preview.excluded||[]).map(item=>'<li><b>'+escapeHtml(item.characterName||'지원자')+'</b><span>'+escapeHtml(item.reasonMessage||item.reasonCode)+'</span></li>').join('');
    const canApply=(preview.assignments||[]).length>0;
    return '<aside class="sanctuary-management-balance-panel is-open" data-balance-panel role="dialog" aria-modal="true" aria-labelledby="sanctuaryBalanceTitle"><header><div><span>BALANCE PROPOSAL</span><h3 id="sanctuaryBalanceTitle">전투력 균형 배치 제안</h3><p>배치 잠금은 유지하고, 승인 대기 지원자를 지원한 포스의 클래스 가능 빈 슬롯에 배치합니다.</p></div><button type="button" data-balance-close aria-label="균형 배치 제안 닫기">×</button></header><div class="sanctuary-management-balance-body"><section class="sanctuary-management-balance-averages"><h4>포스 평균 전투력</h4><div>'+averages+'</div></section><section><h4>제안 이동 · '+escapeHtml(preview.assignmentCount||0)+'명</h4><ol>'+(moves||'<li class="is-empty">현재 배치할 수 있는 승인 대기 지원자가 없습니다.</li>')+'</ol></section>'+(excluded?'<details><summary>제외 사유 '+escapeHtml(preview.excludedCount||0)+'건</summary><ul>'+excluded+'</ul></details>':'')+'<p class="sanctuary-management-balance-expiry">'+escapeHtml(value(preview.expiresAt))+'까지 유효 · 최종 저장 전 Server 편성 미반영</p></div><footer><button type="button" class="is-primary" data-balance-apply'+(canApply?'':' disabled')+'>제안 적용</button><button type="button" data-balance-recalculate>다시 계산</button><button type="button" data-balance-close>취소</button></footer></aside>';
  }

  async function requestBalanceProposal(){
    if(state.saving||state.mutating||!state.sourceTeamId||!state.team)return;
    if(!['ACTIVE','FULL'].includes(value(state.team.status))){setStatus('운영 중인 팀에서만 균형 배치를 제안할 수 있습니다.');return;}
    if(compositionSignature(false)!==state.baselineCompositionSignature){setStatus('캐릭터 위치·포스·클래스 변경을 먼저 저장한 뒤 편집창을 다시 열어 균형 배치를 계산해 주세요.','warning');return;}
    state.mutating=true;state.balancePreview=null;state.balanceAppliedToken='';state.balanceAppliedSignature='';state.balanceStableSeed=state.balanceStableSeed||('sm-balance-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));
    setStatus('잠금·클래스·지원자 상태를 Server에서 검증하고 균형 배치안을 계산하고 있습니다.','progress');setControlsDisabled(true);
    try{
      const locks=teamSlots().filter(item=>Number(item.slot.slotId)>0).map(item=>({slotId:Number(item.slot.slotId),locked:item.slot.placementLocked===true}));
      state.balancePreview=await bridge().balanceProposal(Number(state.sourceTeamId),Number(state.team.revision),state.leaseToken,state.balanceStableSeed,locks);
      state.mutating=false;setControlsDisabled(false);state.layer.innerHTML=modeMarkup();syncDateMinimum();focusDialog('.sanctuary-management-balance-panel');
      setStatus('균형 배치 제안을 확인한 뒤 적용하세요. 적용 후에도 최종 저장 전까지 Server 편성은 바뀌지 않습니다.','success');
    }catch(error){state.mutating=false;setControlsDisabled(false);setStatus(value(error?.message)||'균형 배치 제안을 만들지 못했습니다.','error');}
  }

  function applyBalanceProposal(){
    const preview=state.balancePreview;if(!preview||!(preview.assignments||[]).length)return;
    for(const assignment of preview.assignments){
      const target=teamSlot(Number(assignment.slotId));
      if(!target||target.slot.occupied||target.slot.placementLocked||!slotAcceptsCharacter(target.slot,assignment)){setStatus('제안 적용 중 슬롯 상태가 달라졌습니다. 다시 계산해 주세요.','error');invalidateBalanceProposal();return;}
      target.slot.character=candidateCharacter(assignment);target.slot.occupied=true;target.slot.assignmentKind='ACTUAL_CHARACTER';
    }
    state.balanceAppliedToken=value(preview.proposalToken);state.balancePreview=null;refreshLocalTeam();state.balanceAppliedSignature=compositionSignature(true);state.selectedSlotId=0;state.moveFromSlotId=0;renderRosterState();
    const panel=state.layer?.querySelector('[data-balance-panel]');if(panel)panel.outerHTML=balancePanelMarkup();
    setStatus('균형 배치 제안을 로컬 편성안에 적용했습니다. [저장]을 눌러야 지원 승인과 배치가 한 번에 Server에 반영됩니다.','success');
  }

  function rosterMarkup(){
    const force=selectedForce();
    if(!force){
      const slots=Array.from({length:10},(_,index)=>'<button type="button" class="sanctuary-management-draft-slot" disabled data-occupied="false"><span>'+(index+1)+'</span><strong>생성 대기</strong><small>'+(index<5?'1파티':'2파티')+' · Server 저장 전</small></button>').join('');
      return '<main class="sanctuary-management-roster" aria-label="저장 전 1포스 슬롯 미리보기"><div class="sanctuary-management-party-labels"><span>1파티 · 1–5번</span><span>2파티 · 6–10번</span></div><div class="sanctuary-management-draft-slot-grid">'+slots+'</div></main>';
    }
    const parties=force.parties.slice().sort((left,right)=>Number(left.partyNo)-Number(right.partyNo));
    const forceWarning=force.requirements?.satisfied===false;
    const sanctuary=sanctuaryByCode(activeSanctuaryCode());const options=difficultyOptions(sanctuary);const difficulty=selectedDifficulty(force);
    const difficultyMarkup=options.length>1?'<div class="sanctuary-management-force-difficulty-editor" role="group" aria-label="'+escapeHtml(force.forceNo)+'포스 난이도">'+options.map(option=>'<button type="button" data-draft-force-difficulty="'+escapeHtml(option.difficulty)+'" data-force-id="'+escapeHtml(force.forceId)+'" aria-pressed="'+String(difficulty===option.difficulty)+'"><span>'+escapeHtml(option.label)+'</span><small>'+escapeHtml(option.minItemLevel)+'+</small></button>').join('')+'</div>':'';
    const forceSummary='<div class="sanctuary-management-force-requirement-summary'+(forceWarning?' has-unmet-requirements':'')+'"><span><strong>'+escapeHtml(force.forceNo)+'포스</strong>'+(forceWarning?'<small>조건 '+escapeHtml(force.requirements.unsatisfiedCount)+'개 미충족</small>':'')+'</span>'+difficultyMarkup+'<button type="button" data-requirement-open data-force-id="'+escapeHtml(force.forceId)+'">포스 조건</button></div>';
    const labels=parties.map(party=>'<span class="'+(party.requirements?.satisfied===false?'has-unmet-requirements':'')+'"><b>'+escapeHtml(party.partyNo)+'파티 · '+escapeHtml(party.occupiedCount)+'/'+escapeHtml(party.capacity)+'명</b><button type="button" data-requirement-open data-force-id="'+escapeHtml(force.forceId)+'" data-party-no="'+escapeHtml(party.partyNo)+'">조건</button></span>').join('');
    const slots=parties.map(party=>party.slots.map(slot=>slotMarkup(slot,party.partyNo)).join('')).join('');
    return '<main class="sanctuary-management-roster'+(forceWarning?' has-unmet-requirements':'')+'" aria-label="'+escapeHtml(force.forceNo)+'포스 Server 슬롯">'+forceSummary+'<div class="sanctuary-management-party-labels">'+labels+'</div><div class="sanctuary-management-draft-slot-grid">'+slots+'</div></main>';
  }

  function defaultStatus(){
    const force=selectedForce();
    if(!force)return '[+ 포스 추가]를 누르면 로컬 편성안에 1포스·2파티·10슬롯이 추가됩니다.';
    return force.forceNo+'포스 · '+force.occupiedCount+'/'+force.capacity+'명'+(force.requirements?.satisfied===false?' · 구성 조건 '+force.requirements.unsatisfiedCount+'개 미충족':'')+' · 마지막 저장 전 Server 미반영';
  }

  function renderRosterState(){
    const rail=state.layer?.querySelector('.sanctuary-management-force-rail');
    if(rail)rail.innerHTML=forceRailMarkup();
    const roster=state.layer?.querySelector('.sanctuary-management-roster');
    if(roster)roster.outerHTML=rosterMarkup();
    const candidates=state.layer?.querySelector('.sanctuary-management-candidate-rail');
    if(candidates)candidates.outerHTML=candidateMarkup();
    const linked=state.layer?.querySelector('[data-linked-alt-panel]');
    if(linked)linked.outerHTML=linkedAltPanelMarkup();
    const side=state.layer?.querySelector('.sanctuary-management-builder-side');
    if(side)side.classList.toggle('has-linked-alts',Boolean(state.linkedAlts));
    const balance=state.layer?.querySelector('[data-balance-panel]');
    if(balance)balance.outerHTML=balancePanelMarkup();
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
    const joinPolicy=currentJoinPolicy();
    const difficulty=selectedDifficulty(teamForces()[0]);
    const difficultyMarkup='<input type="hidden" name="draftDifficulty" value="'+difficulty+'">';
    const submitLabel=state.saving?'처리 중…':state.mutating?'변경 중…':participation?(active?'저장':draft?'참여 팀 생성':'1포스 먼저 추가'):(active?'저장':draft?'팀 생성':'구성 시작');
    const joinPolicyMarkup=participation?'<div class="sanctuary-management-join-policy"><strong>참가 방식</strong><div class="sanctuary-management-schedule-kind" role="group" aria-label="참가 방식"><button type="button" data-draft-join-policy="INSTANT" aria-pressed="'+(joinPolicy==='INSTANT')+'">즉시 참가</button><button type="button" data-draft-join-policy="APPROVAL" aria-pressed="'+(joinPolicy==='APPROVAL')+'">승인 참가</button></div><small>즉시 참가는 빈 슬롯에 바로 배치되고, 승인 참가는 운영자 확인 후 배치됩니다.</small></div>':'';
    return '<div class="sanctuary-management-draft-backdrop" data-draft-close></div>'
      +'<div class="sanctuary-management-draft-frame">'
        +'<form class="sanctuary-management-builder-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryDraftTitle" aria-describedby="sanctuaryDraftDescription" tabindex="-1" data-draft-form>'
          +'<div class="sanctuary-management-builder-layout">'
            +'<section class="sanctuary-management-composer">'
              +'<header class="sanctuary-management-composer-title"><div><span>TEAM &amp; FORCE</span><div class="sanctuary-management-composer-mode-switch" role="group" aria-label="팀 구성 방식"><button type="button" data-draft-mode="fixed" aria-pressed="'+String(!participation)+'"'+(busy?' disabled':'')+'>고정</button><button type="button" data-draft-mode="participation" aria-pressed="'+String(participation)+'"'+(busy?' disabled':'')+'>참여</button><h2 id="sanctuaryDraftTitle">팀 구성하기</h2></div><p id="sanctuaryDraftDescription">모달 안의 편성은 마지막 저장 때 한 번만 Server에 반영됩니다.</p>'+(editing&&active?'<button type="button" class="sanctuary-management-balance-open" data-balance-open'+(busy?' disabled':'')+'>균형 랜덤 배치</button>':'')+'</div><label><span>팀 이름</span><input name="draftTitle" maxlength="80" required value="'+escapeHtml(state.team?.title||'')+'" placeholder="예: 1팀 목요일 21시"></label></header>'
              +'<div class="sanctuary-management-composer-middle">'
                +'<aside class="sanctuary-management-force-rail" aria-label="포스 선택">'+forceRailMarkup()+'</aside>'
                +rosterMarkup()
                +candidateMarkup()
              +'</div>'
              +'<footer class="sanctuary-management-composer-actions"><p class="sanctuary-management-draft-status'+(state.tone?' is-'+escapeHtml(state.tone):'')+'" data-draft-status role="status">'+escapeHtml(state.message||defaultStatus())+'</p><div><button type="submit" class="is-primary"'+(busy?' disabled':'')+'>'+submitLabel+'</button><button type="button" data-draft-reset'+(busy?' disabled':'')+'>초기화</button><button type="button" data-draft-close'+(busy?' disabled':'')+'>닫기</button></div></footer>'
            +'</section>'
            +'<div class="sanctuary-management-builder-side'+(state.linkedAlts?' has-linked-alts':'')+'">'
              +linkedAltPanelMarkup()
              +'<section class="sanctuary-management-schedule-panel" aria-labelledby="sanctuaryDraftScheduleTitle">'
              +'<header><span>SCHEDULE</span><h3 id="sanctuaryDraftScheduleTitle">팀 일정 입력</h3><p>팀 아래 모든 포스가 같은 일정과 진행 시간을 공유합니다.</p></header>'
              +'<div class="sanctuary-management-schedule-scroll">'
                +'<div class="sanctuary-management-week-note"><strong>아이온2 주간</strong><span>수요일 → 화요일</span></div>'
                +'<label class="sanctuary-management-field"><span>진행 성역</span><select name="draftSanctuary" required>'+sanctuaryOptions+'</select></label>'
                +difficultyMarkup
                +joinPolicyMarkup
                +'<div class="sanctuary-management-schedule-kind" role="group" aria-label="일정 반복 방식"><button type="button" data-draft-kind="WEEKLY" aria-pressed="'+isWeekly+'">매주 반복</button><button type="button" data-draft-kind="ONCE" aria-pressed="'+(!isWeekly)+'">1회성</button></div>'
                +'<input type="hidden" name="draftKind" value="'+schedule.kind+'">'
                +'<fieldset class="sanctuary-management-weekdays"'+(isWeekly?'':' hidden')+'><legend>반복 요일</legend><div>'+weekdays+'</div><small>종료일 없이 선택한 요일마다 반복됩니다.</small></fieldset>'
                +'<div class="sanctuary-management-field sanctuary-management-date-field"><span data-draft-date-label>'+(isWeekly?'반복 시작일':'진행 날짜')+'</span><div class="sanctuary-management-date-parts"><label><input name="draftMonth" inputmode="numeric" maxlength="2" value="'+escapeHtml(dateParts.month)+'" aria-label="월"><span>월</span></label><label><input name="draftDay" inputmode="numeric" maxlength="2" value="'+escapeHtml(dateParts.day)+'" aria-label="일"><span>일</span></label></div><input type="hidden" name="draftStartsOn" value="'+escapeHtml(schedule.startsOn)+'"><small>반복 요일을 고르면 앞으로 가장 가까운 날짜로 자동 맞춰집니다.</small></div>'
                +'<div class="sanctuary-management-field sanctuary-management-time-field"><span>시작 시간</span><div class="sanctuary-management-time-parts"><div class="sanctuary-management-period-buttons" role="group" aria-label="오전 오후"><button type="button" data-draft-period="AM" aria-pressed="'+(timeParts.period==='AM')+'">오전</button><button type="button" data-draft-period="PM" aria-pressed="'+(timeParts.period==='PM')+'">오후</button></div><label><input name="draftHour" inputmode="numeric" maxlength="2" value="'+escapeHtml(timeParts.hour)+'" aria-label="시"><span>시</span></label><label><input name="draftMinute" inputmode="numeric" maxlength="2" value="'+escapeHtml(timeParts.minute)+'" aria-label="분"><span>분</span></label></div><input type="hidden" name="draftStartsAt" value="'+escapeHtml(schedule.startsAt)+'"></div>'
                +'<div class="sanctuary-management-field sanctuary-management-duration-field"><span>진행 시간</span><div class="sanctuary-management-duration-options" role="group" aria-label="진행 시간">'+DURATION_OPTIONS.map(option=>'<button type="button" data-draft-duration="'+option.value+'" aria-pressed="'+(option.value===schedule.durationMinutes)+'">'+option.label+'</button>').join('')+'</div><input type="hidden" name="draftDuration" value="'+escapeHtml(schedule.durationMinutes)+'"></div>'
                +'<div class="sanctuary-management-schedule-preview"><span>저장 상태</span><strong>'+(editing?'DB '+escapeHtml(state.team.status)+' · revision '+escapeHtml(state.team.revision):'로컬 편성 중 · Server 미반영')+'</strong><small>포스가 비어 있거나 생성자의 캐릭터가 없어도 팀을 생성·저장할 수 있습니다.</small></div>'
              +'</div>'
              +'</section>'
            +'</div>'
          +'</div>'
        +'</form>'+balancePanelMarkup()
      +'</div>';
  }

  async function openDraft(team,opener){
    if(!bridge()?.snapshot()?.writeEnabled)return;
    state.sourceTeamId=Number(team?.teamId||0);
    state.team=team&&typeof team==='object'?clone(team):makeLocalTeam(state.creationMode);
    if(state.team){state.creationMode=value(state.team.mode).toUpperCase()==='PARTICIPATION'?'PARTICIPATION':'FIXED';state.joinPolicy=value(state.team.joinPolicy).toUpperCase()==='APPROVAL'?'APPROVAL':'INSTANT';}
    state.selectedForceId=Number(state.team?.forces?.[0]?.forceId||0);
    refreshLocalTeam();
    state.selectedSlotId=0;state.moveFromSlotId=0;state.draggedSlotId=0;state.dragSwitching=false;state.requirementTarget=null;state.classTargetSlotId=0;state.showCreatorCandidates=false;state.requestKey='';state.forceSaveRequestKey='';state.forceAddRequestKey='';state.slotRequestKey='';state.moveRequestKey='';state.message='';state.tone='';state.saving=false;state.mutating=Boolean(state.sourceTeamId);state.balancePreview=null;state.balanceAppliedToken='';state.balanceAppliedSignature='';state.balanceStableSeed='';state.baselineCompositionSignature=compositionSignature(false);resetCharacterLookup();
    openLayer(opener||state.opener);
    state.layer.innerHTML=modeMarkup();
    syncDateMinimum();
    syncDifficultyControls();
    if(state.team?.localOnly)syncNextRepeatDate();
    focusDialog('.sanctuary-management-builder-dialog');
    if(state.sourceTeamId){
      try{
        setStatus('Server 편집 잠금을 확인하고 있습니다.','progress');
        await acquireLease();
        state.mutating=false;
        setStatus('편집 잠금을 확인했습니다. 모달의 변경은 마지막 저장 전까지 Server에 반영되지 않습니다.','success');
        state.layer.innerHTML=modeMarkup();syncDateMinimum();syncDifficultyControls();focusDialog('.sanctuary-management-builder-dialog');
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

  function syncDifficultyControls(nextDifficulty='',applyToAll=false){
    const form=state.layer?.querySelector('[data-draft-form]');if(!form)return;
    const sanctuary=sanctuaryByCode(form.elements.draftSanctuary?.value);const options=difficultyOptions(sanctuary);const allowed=new Set(options.map(option=>option.difficulty));
    const requested=normalizeDifficulty(nextDifficulty||'NORMAL');
    if(state.team){state.team.forces?.forEach(force=>{const own=normalizeDifficulty(applyToAll?requested:force.difficulty||requested);force.difficulty=allowed.has(own)?own:(allowed.has('NORMAL')?'NORMAL':options[0]?.difficulty||'NORMAL');force.minimumItemLevel=minimumItemLevel(value(sanctuary?.code),force.difficulty)||null;});state.team.difficulty=selectedDifficulty(state.team.forces?.[0]);}
    if(form.elements.draftDifficulty)form.elements.draftDifficulty.value=selectedDifficulty(teamForces()[0]);
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
      difficulty:selectedDifficulty(teamForces()[0]),
      leaseToken:state.leaseToken,
      requestKey:state.requestKey,
      balanceProposalToken:state.balanceAppliedToken,
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
      composition:teamForces().map(force=>({
        sourceForceId:Number(force.forceId)>0?Number(force.forceId):null,
        difficulty:selectedDifficulty(force),
        slots:forceSlots(force).map(item=>({
          partyNo:item.partyNo,
          slotNo:Number(item.slot.slotNo),
          characterId:Number(item.slot.character?.characterId||0)||null,
          mainCharacterId:item.slot.character?.isRandomAlt?Number(item.slot.character.mainCharacterId)||null:null,
          assignmentKind:item.slot.character?.isRandomAlt?'RANDOM_ALT':'ACTUAL_CHARACTER',
          requiredClassCode:slotClassCode(item.slot),
          placementLocked:item.slot.placementLocked===true
        })),
        requirements:[
          ...scopeRules(force).map(rule=>({scopeType:'FORCE',partyNo:null,ruleType:value(rule.ruleType).toUpperCase(),minimumCount:Number(rule.minimumCount),powerThreshold:value(rule.ruleType).toUpperCase()==='POWER_MIN'?combatPowerValue(rule.powerThreshold):null,itemLevelThreshold:value(rule.ruleType).toUpperCase()==='ITEM_LEVEL_MIN'?itemLevelValue(rule.itemLevelThreshold):null})),
          ...force.parties.flatMap(party=>scopeRules(party).map(rule=>({scopeType:'PARTY',partyNo:Number(party.partyNo),ruleType:value(rule.ruleType).toUpperCase(),minimumCount:Number(rule.minimumCount),powerThreshold:value(rule.ruleType).toUpperCase()==='POWER_MIN'?combatPowerValue(rule.powerThreshold):null,itemLevelThreshold:value(rule.ruleType).toUpperCase()==='ITEM_LEVEL_MIN'?itemLevelValue(rule.itemLevelThreshold):null})))
        ]
      }))
    };
  }

  function validate(model){
    if(!model.title||model.title.length>80)return '팀 이름을 1자 이상 80자 이하로 입력해 주세요.';
    if(!model.sanctuaryCode)return '진행 성역을 선택해 주세요.';
    if(!model.composition.length||model.composition.length>9)return '포스를 하나 이상, 최대 9개까지 구성해 주세요.';
    if(teamSlots().some(item=>item.slot.occupied&&item.slot.character&&!item.slot.character.isRandomAlt&&!characterEligible(item.slot.character,model.sanctuaryCode,selectedDifficulty(item.force))))return '해당 포스 난이도의 아이템레벨을 충족하지 않는 캐릭터가 포함되어 있습니다.';
    if(model.composition.some(force=>force.slots.some(slot=>!SLOT_CLASSES.some(option=>option.code===slot.requiredClassCode)||slot.assignmentKind==='RANDOM_ALT'&&!slot.mainCharacterId)))return '슬롯 클래스 제한과 랜덤 부캐 편성을 다시 확인해 주세요.';
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
    if(state.balanceAppliedToken&&compositionSignature(true)!==state.balanceAppliedSignature){invalidateBalanceProposal();setStatus('균형 배치 적용 뒤 편성안이 바뀌었습니다. 다시 계산하거나 현재 편성으로 저장해 주세요.','warning');return;}
    const familyConflict=localFamilyConflict();if(familyConflict){setStatus(familyConflictText(familyConflict,familyConflict.force.forceNo+'포스'),'error');return;}
    const issue=validate(model);
    if(issue){setStatus(issue);return;}
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
    invalidateBalanceProposal();const localId=Math.min(0,...forces.map(item=>Number(item.forceId)||0))-1;const force=makeLocalForce(forces.length+1,localId);force.minimumItemLevel=minimumItemLevel(activeSanctuaryCode(),force.difficulty)||null;state.team.forces.push(force);refreshLocalTeam();state.selectedForceId=force.forceId;state.selectedSlotId=0;state.moveFromSlotId=0;resetCharacterLookup();renderRosterState();setStatus(force.forceNo+'포스를 로컬 편성안에 추가했습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
  }

  function candidateCharacter(candidate){
    return {characterId:Number(candidate.characterId)||null,name:value(candidate.characterName||candidate.name),serverId:Number(candidate.serverId)||null,serverName:value(candidate.serverName),className:value(candidate.className),randomClassCode:value(candidate.randomClassCode).toUpperCase(),profileImageUrl:value(candidate.profileImageUrl),relation:value(candidate.relation)||(candidate.isMain?'MAIN':'ALT'),isMain:candidate.isMain===true,isRandomAlt:candidate.isRandomAlt===true,assignmentKind:candidate.isRandomAlt?'RANDOM_ALT':'ACTUAL_CHARACTER',power:combatPowerValue(candidate.power??candidate.latestPveCombatPower??candidate.latest_pve_combat_power),itemLevel:itemLevelValue(candidate.itemLevel??candidate.latestPveItemLevel??candidate.latest_pve_item_level),mainCharacterId:Number(candidate.mainCharacterId)||null,mainCharacterName:value(candidate.mainCharacterName||(candidate.isMain?candidate.characterName||candidate.name:'')),ownerMemberId:Number(candidate.ownerMemberId)||null};
  }

  function assignCreatorCharacter(characterId){
    if(state.saving||state.mutating||!state.team)return;
    const force=selectedForce();const chosen=selectedSlot();
    const source=composerCharacters().length?composerCharacters():Array.isArray(force?.creatorCandidates)?force.creatorCandidates:[];
    const candidate=source.find(item=>Number(item.characterId)===Number(characterId));
    if(!force||!chosen||chosen.slot.occupied||!candidate){setStatus('빈 슬롯과 내 캐릭터를 다시 선택해 주세요.');return;}
    const familyConflict=forceCharacterFamilyConflict(force,candidate);if(familyConflict){setStatus(familyConflictText(familyConflict));return;}
    if(localUsedCharacterIds().has(Number(characterId))){setStatus('같은 캐릭터는 한 팀 편성안에 중복 배치할 수 없습니다.');return;}
    if(!characterEligible(candidate)){setStatus('해당 성역 아이템레벨을 충족하는 캐릭터만 추가할 수 있습니다.');return;}
    if(!slotAcceptsCharacter(chosen.slot,candidate)){setStatus(classOption(slotClassCode(chosen.slot)).label+' 전용 슬롯에는 '+value(candidate.className)+' 캐릭터를 추가할 수 없습니다.');return;}
    const slotNumber=slotDisplayNumber(chosen);
    invalidateBalanceProposal();chosen.slot.character=candidateCharacter(candidate);chosen.slot.occupied=true;chosen.slot.assignmentKind='ACTUAL_CHARACTER';state.selectedSlotId=0;state.moveFromSlotId=0;resetCharacterLookup();refreshLocalTeam();renderRosterState();
    setStatus((candidate.isMain?'본캐 ':'부캐 ')+value(candidate.characterName)+' 캐릭터를 '+force.forceNo+'포스 '+slotNumber+'번에 배치했습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
  }

  async function searchCharacter(query,isMainSearch=false){
    if(state.saving||state.mutating||!state.team||!selectedSlot())return;
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
    const familyConflict=forceCharacterFamilyConflict(force,character);if(familyConflict){setStatus(familyConflictText(familyConflict));return;}
    if(localUsedCharacterIds().has(Number(character.characterId))){setStatus('같은 캐릭터는 한 팀 편성안에 중복 배치할 수 없습니다.');return;}
    if(Number(character.ownerMemberId)&&forceSlots(force).some(item=>item.slot.occupied&&Number(item.slot.character?.ownerMemberId)===Number(character.ownerMemberId))){setStatus('한 이용자는 같은 포스에 캐릭터를 하나만 배치할 수 있습니다.');return;}
    if(!characterEligible(character)){setStatus('해당 성역 아이템레벨을 충족하는 캐릭터만 추가할 수 있습니다.');return;}
    if(!slotAcceptsCharacter(chosen.slot,character)){setStatus(classOption(slotClassCode(chosen.slot)).label+' 전용 슬롯에는 '+value(character.className)+' 캐릭터를 추가할 수 없습니다.');return;}
    const slotNumber=slotDisplayNumber(chosen);
    invalidateBalanceProposal();chosen.slot.character=candidateCharacter(character);chosen.slot.occupied=true;chosen.slot.assignmentKind='ACTUAL_CHARACTER';state.selectedSlotId=0;state.moveFromSlotId=0;resetCharacterLookup();refreshLocalTeam();renderRosterState();
    setStatus(value(character.characterName)+' 캐릭터를 '+force.forceNo+'포스 '+slotNumber+'번에 배치했습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
  }

  async function loadLinkedAlts(mainCharacterId){
    if(state.saving||state.mutating||!selectedSlot())return;
    state.linkedAlts={loading:true,mainCharacter:{characterId:Number(mainCharacterId),characterName:value(state.lookup?.character?.characterName)}};renderRosterState();
    const localMain=!state.sourceTeamId?composerCharacters().find(item=>Number(item.characterId)===Number(mainCharacterId)):null;
    if(localMain){
      const main=localMain;
      const characters=composerCharacters().filter(item=>Number(item.characterId)!==Number(mainCharacterId)&&Number(item.mainCharacterId)===Number(mainCharacterId)).map(item=>Object.assign({},item,{itemLevelEligible:characterEligible(item),alreadyAssignedToOtherForce:localUsedCharacterIds().has(Number(item.characterId)),scheduleConflict:false}));
      state.linkedAlts={mainCharacter:{characterId:Number(main.characterId),characterName:value(main.characterName),serverId:Number(main.serverId)||0,serverName:value(main.serverName),ownerMemberId:Number(main.ownerMemberId)||Number(state.team?.creatorMemberId)||0},randomCandidate:{assignmentKind:'RANDOM_ALT',mainCharacterId:Number(main.characterId),ownerMemberId:Number(main.ownerMemberId)||Number(state.team?.creatorMemberId)||0,characterName:value(main.characterName)+'의 랜덤 부캐',serverId:Number(main.serverId)||0,serverName:value(main.serverName),relation:'RANDOM_ALT',isMain:false,isRandomAlt:true,power:0,itemLevel:0},characters,characterCount:characters.length,randomClassCode:slotClassCode(selectedSlot()?.slot)};
      renderRosterState();setStatus(characters.length+'개의 연결 부캐를 확인했습니다. 랜덤 부캐도 선택할 수 있습니다.','success');return;
    }
    try{state.linkedAlts=await bridge().linkedAlts(Number(state.sourceTeamId),Number(mainCharacterId),state.sourceTeamId?Number(selectedForce()?.forceId)||null:null);state.linkedAlts.randomClassCode=slotClassCode(selectedSlot()?.slot);renderRosterState();setStatus(state.linkedAlts.characterCount+'개의 연결 부캐를 확인했습니다.'+(state.linkedAlts.randomCandidate?' 랜덤 부캐도 선택할 수 있습니다.':''),'success');}
    catch(error){state.linkedAlts={error:value(error?.message)||'연결된 부캐 목록을 확인하지 못했습니다.',mainCharacter:{characterName:value(state.lookup?.character?.characterName)}};renderRosterState();setStatus(state.linkedAlts.error,'error');}
  }

  function assignRandomAlt(){
    const chosen=selectedSlot(),force=selectedForce(),candidate=state.linkedAlts?.randomCandidate;if(!chosen||!force||!candidate||chosen.slot.occupied)return;
    const option=classOption(state.linkedAlts?.randomClassCode);
    const familyConflict=forceCharacterFamilyConflict(force,candidate);if(familyConflict){setStatus(familyConflictText(familyConflict));return;}
    const ownerId=Number(candidate.ownerMemberId);if(ownerId&&forceSlots(force).some(item=>item.slot.occupied&&Number(item.slot.character?.ownerMemberId)===ownerId)){setStatus('이 포스에는 이미 같은 이용자의 캐릭터 또는 랜덤 부캐가 있습니다.');return;}
    invalidateBalanceProposal();chosen.slot.requiredClassCode=option.code;chosen.slot.requiredClassName=option.code==='ALL'?'전체 클래스':option.label;chosen.slot.character=candidateCharacter(Object.assign({},candidate,{className:option.className||'',randomClassCode:option.code}));chosen.slot.occupied=true;chosen.slot.assignmentKind='RANDOM_ALT';state.selectedSlotId=0;state.classTargetSlotId=0;resetCharacterLookup();refreshLocalTeam();renderRosterState();setStatus(value(candidate.characterName)+' · '+option.label+' 카드를 로컬 편성안에 추가했습니다. 실제 캐릭터 확정 전에는 전투력·조건 계산에서 제외됩니다.','success');
  }

  function chooseRandomAltClass(classCode){
    if(!state.linkedAlts||state.saving||state.mutating)return;
    const option=classOption(classCode);state.linkedAlts.randomClassCode=option.code;renderRosterState();setStatus('랜덤 부캐 클래스를 '+option.label+'(으)로 선택했습니다.','progress');
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
    if(source.slot.placementLocked||target.slot.placementLocked){setStatus('배치 잠금된 카드는 이동하거나 교환할 수 없습니다. 잠금을 먼저 해제해 주세요.');return;}
    if(!slotAcceptsCharacter(target.slot,source.slot.character)){setStatus(classOption(slotClassCode(target.slot)).label+' 전용 대상 슬롯에는 이 캐릭터를 옮길 수 없습니다.');return;}
    if(target.slot.character&&!slotAcceptsCharacter(source.slot,target.slot.character)){setStatus(classOption(slotClassCode(source.slot)).label+' 전용 출발 슬롯과 맞지 않아 두 카드를 교환할 수 없습니다.');return;}
    if(Number(source.force.forceId)!==Number(target.force.forceId)){
      const targetConflict=forceCharacterFamilyConflict(target.force,source.slot.character,target.slot.slotId),sourceConflict=target.slot.character?forceCharacterFamilyConflict(source.force,target.slot.character,source.slot.slotId):null;
      if(targetConflict||sourceConflict){const conflict=targetConflict||sourceConflict,targetForce=targetConflict?target.force:source.force;setStatus(familyConflictText(conflict,targetForce.forceNo+'포스'));return;}
    }
    invalidateBalanceProposal();const sourceCharacter=source.slot.character;source.slot.character=target.slot.character||null;source.slot.occupied=Boolean(source.slot.character);target.slot.character=sourceCharacter;target.slot.occupied=true;
    source.slot.assignmentKind=source.slot.character?.isRandomAlt?'RANDOM_ALT':'ACTUAL_CHARACTER';target.slot.assignmentKind=target.slot.character?.isRandomAlt?'RANDOM_ALT':'ACTUAL_CHARACTER';
    const sourceForceNo=source.force.forceNo,targetForceNo=target.force.forceNo;state.selectedForceId=target.force.forceId;state.moveFromSlotId=0;state.draggedSlotId=0;state.selectedSlotId=0;refreshLocalTeam();renderRosterState();
    setStatus(sourceForceNo+'포스에서 '+targetForceNo+'포스로 캐릭터 위치를 옮겼습니다. 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
  }

  function clearSlot(slotId){
    const item=teamSlot(slotId);if(!item?.slot?.occupied)return;
    if(item.slot.placementLocked){setStatus('배치 잠금을 먼저 해제한 뒤 캐릭터를 뺄 수 있습니다.');return;}
    invalidateBalanceProposal();const name=value(item.slot.character?.name);item.slot.character=null;item.slot.occupied=false;item.slot.assignmentKind='ACTUAL_CHARACTER';item.slot.placementLocked=false;state.selectedSlotId=0;state.moveFromSlotId=0;state.draggedSlotId=0;refreshLocalTeam();renderRosterState();setStatus(name+' 캐릭터를 로컬 편성안에서 뺐습니다.','success');
  }

  function toggleSlotLock(slotId){
    const item=teamSlot(slotId);if(!item?.slot?.occupied)return;
    invalidateBalanceProposal();item.slot.placementLocked=item.slot.placementLocked!==true;renderRosterState();
    setStatus(value(item.slot.character?.name)+' 카드를 '+(item.slot.placementLocked?'배치 잠금했습니다. 이동·제거와 균형 배치에서 유지됩니다.':'잠금 해제했습니다. 이동·제거와 균형 배치 대상이 될 수 있습니다.')+' 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
  }

  function removeForce(forceId){
    const forces=teamForces();if(forces.length<=1){setStatus('팀에는 포스가 최소 1개 필요합니다.');return;}
    const index=state.team.forces.findIndex(force=>Number(force.forceId)===Number(forceId));if(index<0)return;
    if(forceSlots(state.team.forces[index]).some(item=>item.slot.placementLocked)){setStatus('배치 잠금된 카드가 있는 포스는 제거할 수 없습니다. 잠금을 먼저 해제해 주세요.');return;}
    invalidateBalanceProposal();const removed=state.team.forces.splice(index,1)[0];refreshLocalTeam();const next=state.team.forces[Math.min(index,state.team.forces.length-1)];state.selectedForceId=Number(next?.forceId||0);state.selectedSlotId=0;state.moveFromSlotId=0;resetCharacterLookup();renderRosterState();setStatus(removed.forceNo+'포스를 로컬 편성안에서 제거했습니다. 포함된 캐릭터 '+removed.occupiedCount+'명도 함께 빠졌으며 마지막 저장 전까지 Server에는 반영되지 않습니다.','success');
  }

  function handleDragStart(event){
    const slot=event.target.closest?.('[data-draft-slot][data-occupied="true"]');
    if(!slot||slot.disabled)return;
    if(slot.dataset.placementLocked==='true'){event.preventDefault();setStatus('배치 잠금된 카드는 드래그할 수 없습니다. 잠금을 먼저 해제해 주세요.');return;}
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
    if(event.target.closest('[data-balance-open]')){requestBalanceProposal();return;}
    if(event.target.closest('[data-balance-close]')){state.balancePreview=null;const panel=state.layer?.querySelector('[data-balance-panel]');if(panel)panel.outerHTML=balancePanelMarkup();return;}
    if(event.target.closest('[data-balance-recalculate]')){state.balancePreview=null;requestBalanceProposal();return;}
    if(event.target.closest('[data-balance-apply]')){applyBalanceProposal();return;}
    const mode=event.target.closest('[data-draft-mode]');
    if(mode&&!mode.disabled){
      const next=mode.dataset.draftMode==='participation'?'PARTICIPATION':'FIXED';
      if(next===currentMode())return;
      state.creationMode=next;state.team.mode=next;if(next==='FIXED')state.joinPolicy='INSTANT';state.team.joinPolicy=state.joinPolicy;
      state.selectedSlotId=0;state.moveFromSlotId=0;state.requirementTarget=null;state.classTargetSlotId=0;state.showCreatorCandidates=false;resetCharacterLookup();
      state.layer.innerHTML=modeMarkup();syncDateMinimum();syncDifficultyControls();requestAnimationFrame(syncScrollFades);setStatus((next==='PARTICIPATION'?'참여':'고정')+' 팀 구성으로 전환했습니다. 저장할 때 Server에 반영됩니다.','success');
      return;
    }
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
    const difficulty=event.target.closest('[data-draft-force-difficulty]');
    if(difficulty){const force=teamForces().find(item=>Number(item.forceId)===Number(difficulty.dataset.forceId));if(force){invalidateBalanceProposal();force.difficulty=normalizeDifficulty(difficulty.dataset.draftForceDifficulty);force.minimumItemLevel=minimumItemLevel(activeSanctuaryCode(),force.difficulty)||null;state.team.difficulty=selectedDifficulty(teamForces()[0]);const form=state.layer?.querySelector('[data-draft-form]');if(form?.elements?.draftDifficulty)form.elements.draftDifficulty.value=state.team.difficulty;resetCharacterLookup();renderRosterState();setStatus(force.forceNo+'포스를 '+DIFFICULTY_LABELS[force.difficulty]+' 난이도로 설정했습니다.','success');}return;}
    const requirementOpen=event.target.closest('[data-requirement-open]');
    if(requirementOpen){state.requirementTarget={forceId:Number(requirementOpen.dataset.forceId)||Number(state.selectedForceId),partyNo:Number(requirementOpen.dataset.partyNo)||null};state.selectedSlotId=0;state.moveFromSlotId=0;resetCharacterLookup();renderRosterState();setStatus('본캐·전투력·아이템레벨 조건은 미충족이어도 저장할 수 있으며 붉은 안내로 표시됩니다.','progress');return;}
    const requirementToggle=event.target.closest('[data-requirement-toggle]');
    if(requirementToggle){const next=requirementToggle.getAttribute('aria-pressed')!=='true';if(next&&requirementToggle.hasAttribute('data-requirement-metric'))state.layer?.querySelectorAll('[data-requirement-metric]').forEach(button=>button.setAttribute('aria-pressed','false'));requirementToggle.setAttribute('aria-pressed',String(next));return;}
    if(event.target.closest('[data-requirement-apply]')){applyRequirementEditor(false);return;}
    if(event.target.closest('[data-requirement-clear]')){applyRequirementEditor(true);return;}
    if(event.target.closest('[data-requirement-close]')){state.requirementTarget=null;renderRosterState();return;}
    const classOpen=event.target.closest('[data-slot-class-open]');
    if(classOpen&&!classOpen.disabled){const slotId=Number(classOpen.dataset.slotClassOpen)||0;state.classTargetSlotId=Number(state.classTargetSlotId)===slotId?0:slotId;state.requirementTarget=null;renderRosterState();setStatus('전체 또는 이 슬롯에 지원할 클래스 하나를 선택해 주세요.','progress');return;}
    const classChoice=event.target.closest('[data-slot-class]');
    if(classChoice&&!classChoice.disabled){applySlotClass(Number(classChoice.dataset.slotId),classChoice.dataset.slotClass);return;}
    if(event.target.closest('[data-linked-alts-close]')){state.linkedAlts=null;renderRosterState();return;}
    const linkedOpen=event.target.closest('[data-linked-alts-open]');
    if(linkedOpen&&!linkedOpen.disabled){loadLinkedAlts(Number(linkedOpen.dataset.linkedAltsOpen));return;}
    const linkedCharacter=event.target.closest('[data-linked-alt-character]');
    if(linkedCharacter&&!linkedCharacter.disabled){const character=state.linkedAlts?.characters?.find(item=>Number(item.characterId)===Number(linkedCharacter.dataset.linkedAltCharacter));assignSearchedCharacter(character);return;}
    const linkedClass=event.target.closest('[data-linked-alt-class]');
    if(linkedClass&&!linkedClass.disabled){chooseRandomAltClass(linkedClass.dataset.linkedAltClass);return;}
    if(event.target.closest('[data-linked-alt-random]')){assignRandomAlt();return;}
    const remove=event.target.closest('[data-draft-remove-force]');
    if(remove&&!remove.disabled){removeForce(Number(remove.dataset.draftRemoveForce));return;}
    const force=event.target.closest('[data-draft-force]');
    if(force&&!force.disabled){state.selectedForceId=Number(force.dataset.draftForce)||0;state.selectedSlotId=0;state.requirementTarget=null;state.classTargetSlotId=0;state.showCreatorCandidates=false;resetCharacterLookup();renderRosterState();return;}
    if(event.target.closest('[data-draft-add-force]')){addForce();return;}
    const clear=event.target.closest('[data-draft-clear-slot]');
    if(clear&&!clear.disabled){clearSlot(Number(clear.dataset.draftClearSlot));return;}
    const lock=event.target.closest('[data-draft-toggle-lock]');
    if(lock&&!lock.disabled){toggleSlotLock(Number(lock.dataset.draftToggleLock));return;}
    const slot=event.target.closest('[data-draft-slot]');
    if(slot&&!slot.disabled&&state.moveFromSlotId){moveSlot(state.moveFromSlotId,Number(slot.dataset.slotId));return;}
    if(slot&&!slot.disabled&&slot.dataset.occupied==='true'){
      state.moveFromSlotId=Number(slot.dataset.slotId)||0;state.selectedSlotId=0;state.requirementTarget=null;state.classTargetSlotId=0;state.showCreatorCandidates=false;resetCharacterLookup();renderRosterState();
      setStatus(slot.dataset.placementLocked==='true'?'배치 잠금된 카드를 선택했습니다. 잠금 해제 후 이동하거나 제거할 수 있습니다.':slot.textContent.trim()+' 카드를 선택했습니다. 이동할 빈 슬롯이나 다른 카드를 누르세요.','progress');return;
    }
    if(slot&&!slot.disabled&&slot.dataset.occupied!=='true'){
      state.selectedSlotId=Number(slot.dataset.slotId)||0;
      state.requirementTarget=null;
      state.classTargetSlotId=0;
      state.showCreatorCandidates=false;
      resetCharacterLookup();
      renderRosterState();
      setStatus(slotDisplayNumber(selectedSlot())+'번 슬롯에 추가할 내 캐릭터를 선택하거나 이름을 검색해 주세요.','progress');
      state.layer?.querySelector('.sanctuary-management-candidate-card')?.focus();
      return;
    }
    const candidate=event.target.closest('[data-draft-candidate]');
    if(candidate&&!candidate.disabled){assignCreatorCharacter(Number(candidate.dataset.draftCandidate));return;}
    if(event.target.closest('[data-creator-candidates-toggle]')){state.showCreatorCandidates=!state.showCreatorCandidates;renderRosterState();state.layer?.querySelector('[data-creator-candidates-toggle]')?.focus();return;}
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
    if(event.target.name==='draftSanctuary'){syncDateMinimum();syncNextRepeatDate();syncDifficultyControls('NORMAL',true);resetCharacterLookup();renderRosterState();}
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
