(function(){
  'use strict';

  const API_VERSION=1.4;
  const SCHEMA_VERSION=436;
  let requestSequence=0;
  let monthRequestSequence=0;
  let bootstrapData=null;
  let monthData=null;
  let selectedSanctuary='all';
  let selectedMonth=new Date(Date.now()+9*60*60*1000).toISOString().slice(0,7);

  const byId=id=>document.getElementById(id);
  const value=value=>String(value??'').trim();
  const integer=input=>Number.isSafeInteger(Number(input))?Number(input):0;
  const escapeHtml=input=>String(input??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function validateSlot(item){
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('성역 관리 슬롯 데이터가 올바르지 않습니다.');
    const occupied=item.occupied===true;
    const character=item.character&&typeof item.character==='object'&&!Array.isArray(item.character)?Object.assign({},item.character):null;
    if(occupied!==Boolean(character))throw new Error('성역 관리 슬롯 점유 상태가 일치하지 않습니다.');
    const slot=Object.assign({},item,{
      slotId:integer(item.slotId),
      slotNo:integer(item.slotNo),
      revision:integer(item.revision),
      occupied,
      character
    });
    if(slot.slotId<1||slot.slotNo<1||slot.revision<1||occupied&&(integer(character.characterId)<1||!value(character.name))){
      throw new Error('성역 관리 슬롯 식별 정보가 올바르지 않습니다.');
    }
    return slot;
  }

  function validateParty(item){
    if(!item||typeof item!=='object'||Array.isArray(item)||!Array.isArray(item.slots)||item.slots.length!==5){
      throw new Error('성역 관리 파티 슬롯 데이터가 올바르지 않습니다.');
    }
    const slots=item.slots.map(validateSlot).sort((left,right)=>left.slotNo-right.slotNo);
    if(slots.some((slot,index)=>slot.slotNo!==index+1))throw new Error('성역 관리 파티 슬롯 순서가 올바르지 않습니다.');
    const party=Object.assign({},item,{
      partyId:integer(item.partyId),
      partyNo:integer(item.partyNo),
      capacity:integer(item.capacity),
      occupiedCount:integer(item.occupiedCount),
      vacancyCount:integer(item.vacancyCount),
      slots
    });
    const occupiedCount=slots.filter(slot=>slot.occupied).length;
    if(party.partyId<1||party.capacity!==5||party.occupiedCount!==occupiedCount||party.vacancyCount!==party.capacity-occupiedCount){
      throw new Error('성역 관리 파티 인원 집계가 올바르지 않습니다.');
    }
    return party;
  }

  function validateCreatorCandidate(item){
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('성역 관리 생성자 캐릭터 후보가 올바르지 않습니다.');
    const candidate=Object.assign({},item,{
      characterId:integer(item.characterId),
      serverId:integer(item.serverId),
      mainCharacterId:integer(item.mainCharacterId),
      characterName:value(item.characterName),
      serverName:value(item.serverName),
      className:value(item.className),
      profileImageUrl:value(item.profileImageUrl),
      relation:value(item.relation).toUpperCase(),
      isMain:item.isMain===true
    });
    if(candidate.characterId<1||candidate.serverId<1||candidate.mainCharacterId<1||!candidate.characterName||!candidate.serverName||!['MAIN','ALT'].includes(candidate.relation)||candidate.isMain!==(candidate.relation==='MAIN')){
      throw new Error('성역 관리 생성자 캐릭터 후보 식별 정보가 올바르지 않습니다.');
    }
    return candidate;
  }

  function validateSupportCharacter(item){
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('지원 캐릭터 데이터가 올바르지 않습니다.');
    const character=Object.assign({},item,{
      characterId:integer(item.characterId),mainCharacterId:integer(item.mainCharacterId),serverId:integer(item.serverId),
      characterName:value(item.characterName),serverName:value(item.serverName),className:value(item.className),
      profileImageUrl:value(item.profileImageUrl),relation:value(item.relation).toUpperCase(),isMain:item.isMain===true,
      availableForceIds:Array.isArray(item.availableForceIds)?item.availableForceIds.map(integer).filter(id=>id>0):[],
      disabledCode:value(item.disabledCode),disabledMessage:value(item.disabledMessage),
      conflicts:Array.isArray(item.conflicts)?item.conflicts.filter(conflict=>conflict&&typeof conflict==='object'):[]
    });
    if(character.characterId<1||character.mainCharacterId<1||character.serverId<1||!character.characterName||!character.serverName||!['MAIN','ALT'].includes(character.relation))throw new Error('지원 캐릭터 식별 정보가 올바르지 않습니다.');
    if(new Set(character.availableForceIds).size!==character.availableForceIds.length)throw new Error('지원 가능한 포스 정보가 중복되었습니다.');
    return character;
  }

  function validateSupportBatch(item){
    if(!item||typeof item!=='object'||Array.isArray(item)||!Array.isArray(item.items))throw new Error('지원 요청 데이터가 올바르지 않습니다.');
    const items=item.items.map(entry=>Object.assign({},entry,{
      supportItemId:integer(entry.supportItemId),forceId:integer(entry.forceId),forceNo:integer(entry.forceNo),characterId:integer(entry.characterId),
      characterName:value(entry.characterName),serverName:value(entry.serverName),className:value(entry.className),status:value(entry.status).toUpperCase(),
      resultCode:value(entry.resultCode),resultMessage:value(entry.resultMessage)
    }));
    if(items.some(entry=>entry.supportItemId<1||entry.forceId<1||entry.forceNo<1||entry.characterId<1||!entry.characterName||!['PENDING','APPLIED','REJECTED','CANCELLED'].includes(entry.status)))throw new Error('지원 요청 항목 식별 정보가 올바르지 않습니다.');
    return Object.assign({},item,{
      supportBatchId:integer(item.supportBatchId),teamId:integer(item.teamId),requesterMemberId:integer(item.requesterMemberId),requesterName:value(item.requesterName),
      status:value(item.status).toUpperCase(),itemCount:integer(item.itemCount),appliedCount:integer(item.appliedCount),pendingCount:integer(item.pendingCount),
      rejectedCount:integer(item.rejectedCount),cancelledCount:integer(item.cancelledCount),decisionNote:value(item.decisionNote),items
    });
  }

  function validateForce(item){
    if(!item||typeof item!=='object'||Array.isArray(item)||!Array.isArray(item.parties)||item.parties.length!==2){
      throw new Error('성역 관리 포스 파티 데이터가 올바르지 않습니다.');
    }
    const parties=item.parties.map(validateParty).sort((left,right)=>left.partyNo-right.partyNo);
    if(parties.some((party,index)=>party.partyNo!==index+1))throw new Error('성역 관리 포스 파티 순서가 올바르지 않습니다.');
    const force=Object.assign({},item,{
      forceId:integer(item.forceId),
      forceNo:integer(item.forceNo),
      capacity:integer(item.capacity),
      revision:integer(item.revision),
      occupiedCount:integer(item.occupiedCount),
      vacancyCount:integer(item.vacancyCount),
      creatorMemberId:integer(item.creatorMemberId),
      creatorOwnerResolved:item.creatorOwnerResolved===true,
      creatorAlreadyAssigned:item.creatorAlreadyAssigned===true,
      creatorCandidateCode:value(item.creatorCandidateCode),
      creatorCandidateCount:integer(item.creatorCandidateCount),
      creatorCandidates:Array.isArray(item.creatorCandidates)?item.creatorCandidates.map(validateCreatorCandidate):[],
      viewerAlreadyAssigned:item.viewerAlreadyAssigned===true,
      viewerPending:item.viewerPending===true,
      canSupport:item.canSupport===true,
      supportDisabledCode:value(item.supportDisabledCode),
      supportDisabledMessage:value(item.supportDisabledMessage),
      parties
    });
    const occupiedCount=parties.reduce((sum,party)=>sum+party.occupiedCount,0);
    const candidateIds=new Set(force.creatorCandidates.map(candidate=>candidate.characterId));
    if(force.forceId<1||force.capacity!==10||force.revision<1||force.occupiedCount!==occupiedCount||force.vacancyCount!==force.capacity-occupiedCount||force.creatorMemberId<1||force.creatorCandidateCount!==force.creatorCandidates.length||candidateIds.size!==force.creatorCandidates.length||!force.creatorOwnerResolved&&force.creatorCandidates.length||force.creatorAlreadyAssigned&&force.creatorCandidates.length){
      throw new Error('성역 관리 포스 인원 집계가 올바르지 않습니다.');
    }
    return force;
  }

  function validateTeam(item){
    if(!item||typeof item!=='object'||Array.isArray(item)||!Array.isArray(item.forces))throw new Error('성역 관리 팀 편성 데이터가 올바르지 않습니다.');
    const forces=item.forces.map(validateForce).sort((left,right)=>left.forceNo-right.forceNo);
    if(forces.length<1||forces.length>9||forces.some((force,index)=>force.forceNo!==index+1))throw new Error('성역 관리 포스 순서가 올바르지 않습니다.');
    const team=Object.assign({},item,{
      schedule:item.schedule&&typeof item.schedule==='object'&&!Array.isArray(item.schedule)?Object.assign({},item.schedule):null,
      forceCount:integer(item.forceCount),
      slotCount:integer(item.slotCount),
      occupiedCount:integer(item.occupiedCount),
      vacancyCount:integer(item.vacancyCount),
      forces,
      supportCharacters:item.supportCharacters&&typeof item.supportCharacters==='object'&&!Array.isArray(item.supportCharacters)?{
        ownerResolved:item.supportCharacters.ownerResolved===true,
        code:value(item.supportCharacters.code),
        candidateCount:integer(item.supportCharacters.candidateCount),
        characters:Array.isArray(item.supportCharacters.characters)?item.supportCharacters.characters.map(validateSupportCharacter):[]
      }:{ownerResolved:false,code:'MISSING',candidateCount:0,characters:[]},
      supportBatches:Array.isArray(item.supportBatches)?item.supportBatches.map(validateSupportBatch):[],
      canEdit:item.canEdit===true
    });
    const slotCount=forces.reduce((sum,force)=>sum+force.capacity,0);
    const occupiedCount=forces.reduce((sum,force)=>sum+force.occupiedCount,0);
    if(team.forceCount!==forces.length||team.slotCount!==slotCount||team.occupiedCount!==occupiedCount||team.vacancyCount!==slotCount-occupiedCount||team.supportCharacters.candidateCount!==team.supportCharacters.characters.length){
      throw new Error('성역 관리 팀 인원 집계가 올바르지 않습니다.');
    }
    return team;
  }

  function validateBootstrap(data){
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('성역 관리 Server 응답이 올바르지 않습니다.');
    if(Number(data.apiVersion)!==API_VERSION||Number(data.schemaVersion)!==SCHEMA_VERSION){
      throw new Error('성역 관리 Server 계약 버전이 일치하지 않습니다.');
    }
    if(!Array.isArray(data.sanctuaries)||!Array.isArray(data.teams))throw new Error('성역 관리 Server 데이터 형식이 올바르지 않습니다.');
    return {
      apiVersion:Number(data.apiVersion),
      schemaVersion:Number(data.schemaVersion),
      serverTime:value(data.serverTime),
      readEnabled:data.readEnabled===true,
      writeEnabled:data.writeEnabled===true,
      actor:data.actor&&typeof data.actor==='object'?data.actor:{},
      sanctuaries:data.sanctuaries.filter(item=>item&&typeof item==='object'),
      teams:data.teams.filter(item=>item&&typeof item==='object').map(validateTeam)
    };
  }

  function validateCharacterCard(item){
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('캐릭터 조회 결과가 올바르지 않습니다.');
    const card=Object.assign({},item,{
      characterId:integer(item.characterId),serverId:integer(item.serverId),raceId:integer(item.raceId),
      mainCharacterId:integer(item.mainCharacterId),ownerMemberId:integer(item.ownerMemberId),
      characterName:value(item.characterName),serverName:value(item.serverName),className:value(item.className),
      legionName:value(item.legionName),profileImageUrl:value(item.profileImageUrl),relation:value(item.relation).toUpperCase(),
      isOperationalLegion:item.isOperationalLegion===true
    });
    if(card.characterId<1||card.serverId<1||!card.characterName||!card.serverName||!['MAIN','ALT','GUEST'].includes(card.relation))throw new Error('캐릭터 조회 식별 정보가 올바르지 않습니다.');
    return card;
  }

  function validateCharacterSearch(data){
    if(!data||typeof data!=='object'||data.ok!==true||Number(data.schemaVersion)!==SCHEMA_VERSION)throw new Error(value(data?.message)||'캐릭터 검색 Server 계약이 올바르지 않습니다.');
    if(value(data.source)==='CHARACTER_MASTER')return Object.assign({},data,{character:validateCharacterCard(data.character)});
    if(value(data.source)!=='OFFICIAL'||!data.candidate||typeof data.candidate!=='object')throw new Error('공식 캐릭터 조회 결과가 올바르지 않습니다.');
    const candidate=Object.assign({},data.candidate,{
      candidateId:value(data.candidate.candidateId),characterName:value(data.candidate.characterName),serverId:integer(data.candidate.serverId),raceId:integer(data.candidate.raceId),
      serverName:value(data.candidate.serverName),className:value(data.candidate.className),legionName:value(data.candidate.legionName),profileImageUrl:value(data.candidate.profileImageUrl),
      isOperationalLegion:data.candidate.isOperationalLegion===true,
      allowedRelations:Array.isArray(data.candidate.allowedRelations)?data.candidate.allowedRelations.map(item=>value(item).toUpperCase()):[]
    });
    if(!candidate.candidateId||candidate.serverId<1||!candidate.characterName||!candidate.serverName||!candidate.allowedRelations.length||candidate.allowedRelations.some(item=>!['MAIN','ALT','GUEST'].includes(item)))throw new Error('공식 캐릭터 관계 정보가 올바르지 않습니다.');
    return Object.assign({},data,{candidate});
  }

  const ServerAdapter=Object.freeze({
    kind:'SERVER_ONLY',
    apiVersion:API_VERSION,
    schemaVersion:SCHEMA_VERSION,
    async bootstrap(){
      const api=window.KinojoSupabase;
      if(!api||typeof api.getSanctuaryManagementBootstrap!=='function')throw new Error('성역 관리 Server 어댑터를 불러오지 못했습니다.');
      return validateBootstrap(await api.getSanctuaryManagementBootstrap());
    },
    async month(month){
      const api=window.KinojoSupabase;
      if(!api||typeof api.getSanctuaryManagementMonth!=='function')throw new Error('월간 일정 Server 어댑터를 불러오지 못했습니다.');
      const result=await api.getSanctuaryManagementMonth(value(month));
      if(!result||typeof result!=='object'||result.ok!==true||Number(result.schemaVersion)!==SCHEMA_VERSION||!Array.isArray(result.occurrences)||!Array.isArray(result.weekStarts))throw new Error(value(result?.message)||'월간 일정 Server 계약이 올바르지 않습니다.');
      return Object.assign({},result,{month:value(result.month),rangeStart:value(result.rangeStart),rangeEnd:value(result.rangeEnd),weekStarts:result.weekStarts.map(value),occurrences:result.occurrences.filter(item=>item&&typeof item==='object')});
    },
    async command(command,payload,expectedRevision=null,requestKey=''){
      const api=window.KinojoSupabase;
      if(!api||typeof api.runSanctuaryManagementCommand!=='function')throw new Error('성역 관리 Server 명령 어댑터를 불러오지 못했습니다.');
      const result=await api.runSanctuaryManagementCommand(command,payload,expectedRevision,requestKey);
      if(!result||typeof result!=='object'||result.ok!==true)throw new Error(value(result?.message)||'성역 팀 초안을 저장하지 못했습니다.');
      return result;
    },
    async searchCharacter(teamId,query){
      const api=window.KinojoSupabase;
      if(!api||typeof api.searchSanctuaryManagementCharacter!=='function')throw new Error('캐릭터 검색 Server 어댑터를 불러오지 못했습니다.');
      return validateCharacterSearch(await api.searchSanctuaryManagementCharacter(Number(teamId),value(query)));
    },
    async registerCharacter(teamId,candidateId,relationType,mainCharacterId,requestKey){
      const api=window.KinojoSupabase;
      if(!api||typeof api.registerSanctuaryManagementCharacter!=='function')throw new Error('캐릭터 관계 확정 Server 어댑터를 불러오지 못했습니다.');
      const result=await api.registerSanctuaryManagementCharacter(Number(teamId),value(candidateId),value(relationType),mainCharacterId==null?null:Number(mainCharacterId),value(requestKey));
      if(!result||typeof result!=='object'||result.ok!==true)return Promise.reject(new Error(value(result?.message)||'캐릭터 관계를 확정하지 못했습니다.'));
      return Object.assign({},result,{character:validateCharacterCard(result.character)});
    }
  });
  window.KinojoSanctuaryManagementData=ServerAdapter;

  function authState(){
    const auth=window.KinojoAuth||{};
    const core=window.KinojoAuthSessionCore||{};
    const session=(typeof auth.getSession==='function'?auth.getSession():null)||(typeof core.getSession==='function'?core.getSession():null);
    const account=(typeof auth.getAccount==='function'?auth.getAccount():null)||(typeof core.getAccount==='function'?core.getAccount():null);
    const combined=Object.assign({},session||{},account||{});
    const loggedIn=Boolean(session&&value(session.token));
    const canEdit=loggedIn&&window.KinojoPermissions?.canEditSanctuary?.(combined)===true;
    return {loggedIn,canEdit};
  }

  function setAccess(state,title,message,action){
    const region=byId('sanctuaryManagementAccess');
    if(!region)return;
    region.dataset.state=state;
    region.setAttribute('aria-busy',state==='loading'?'true':'false');
    byId('sanctuaryManagementAccessTitle').textContent=title;
    byId('sanctuaryManagementAccessMessage').textContent=message;
    const button=byId('sanctuaryManagementAccessAction');
    button.hidden=!action;
    button.textContent=action==='login'?'로그인':action==='back'?'성역으로 돌아가기':'다시 시도';
    button.dataset.action=action||'';
  }

  function contractLabel(data){return 'API '+data.apiVersion+' · DB '+data.schemaVersion;}
  function sanctuaryKey(item){return value(item.code)||value(item.id);}
  function sanctuaryLabel(item){return value(item.shortName)||value(item.name)||value(item.code)||String(item.id||'');}
  function sanctuaryForSelection(){return bootstrapData?.sanctuaries.find(item=>sanctuaryKey(item)===selectedSanctuary)||null;}

  function resolveInitialSelection(data){
    const requested=value(new URLSearchParams(location.search).get('id'));
    if(requested&&data.sanctuaries.some(item=>sanctuaryKey(item)===requested))return requested;
    return 'all';
  }

  function syncLocation(){
    const url=new URL(location.href);
    if(selectedSanctuary==='all')url.searchParams.delete('id');
    else url.searchParams.set('id',selectedSanctuary);
    history.replaceState(null,'',url.pathname+url.search+url.hash);
  }

  function renderScope(){
    const shell=byId('sanctuaryManagementScopeShell');
    const root=byId('sanctuaryManagementScope');
    root.replaceChildren();
    const items=[{key:'all',label:'전체'}].concat(bootstrapData.sanctuaries.map(item=>({key:sanctuaryKey(item),label:sanctuaryLabel(item)})));
    items.forEach(item=>{
      const button=document.createElement('button');
      button.type='button';
      button.dataset.sanctuaryScope=item.key;
      button.setAttribute('aria-pressed',item.key===selectedSanctuary?'true':'false');
      button.textContent=item.label;
      root.appendChild(button);
    });
    shell.hidden=false;
  }

  function setFlagState(id,enabled){
    const target=byId(id);
    target.textContent=enabled?'활성':'준비 중';
    target.classList.toggle('is-on',enabled);
    target.classList.toggle('is-off',!enabled);
  }

  function renderSelectedSanctuary(){
    const selected=sanctuaryForSelection();
    byId('sanctuaryManagementSelectedName').textContent=selected?sanctuaryLabel(selected):'전체';
    const status=selected?(value(selected.releaseLabel)||value(selected.releaseStatus)||'Server master'):'Server master 전체';
    byId('sanctuaryManagementSelectedMeta').textContent=status;
  }

  function teamModeLabel(team){return value(team.mode)==='FIXED'?'고정 팀':value(team.mode)==='PARTICIPATION'?'참여 팀':value(team.mode)||'팀';}
  function teamStatusLabel(team){
    const status=value(team.status);
    return ({DRAFT:'DRAFT',ACTIVE:'운영 중',FULL:'모집 완료',ARCHIVED:'보관됨'})[status]||status||'상태 확인 중';
  }
  function scheduleLabel(team){
    const schedule=team?.schedule||{};
    const time=value(schedule.startsAt).slice(0,5)||'시간 미정';
    const duration=integer(schedule.durationMinutes)||30;
    if(value(schedule.kind)==='ONCE')return value(schedule.startsOn)+' '+time+' · '+duration+'분';
    const labels={1:'월',2:'화',3:'수',4:'목',5:'금',6:'토',7:'일'};
    const days=(Array.isArray(schedule.weekdays)?schedule.weekdays:[]).map(day=>labels[Number(day)]).filter(Boolean).join('·');
    return '매주 '+(days||'요일 미정')+' '+time+' · '+duration+'분';
  }

  function createEmpty(title,message){
    const empty=document.createElement('div');
    empty.className='sanctuary-management-empty';
    const icon=document.createElement('span');icon.className='sanctuary-management-empty-icon';icon.textContent='S';icon.setAttribute('aria-hidden','true');
    const strong=document.createElement('strong');strong.textContent=title;
    const text=document.createElement('p');text.textContent=message;
    empty.append(icon,strong,text);
    return empty;
  }

  function createForceCard(team,force){
    const participation=value(team.mode)==='PARTICIPATION'&&['ACTIVE','FULL'].includes(value(team.status));
    const card=document.createElement(participation?'button':'div');
    if(participation){card.type='button';card.dataset.sanctuarySupportForce=value(force.forceId);card.dataset.sanctuarySupportTeam=value(team.teamId);}
    card.className='sanctuary-management-force-card'+(participation?' is-supportable':'')+(force.canSupport?' can-support':' is-unavailable')+(force.viewerAlreadyAssigned?' is-assigned':'')+(force.viewerPending?' is-pending':'');
    if(participation){card.setAttribute('aria-label',force.forceNo+'포스 지원 창 열기. '+(force.canSupport?'지원 가능':value(force.supportDisabledMessage)||'지원 상태 확인'));card.setAttribute('aria-disabled',force.canSupport?'false':'true');}
    const head=document.createElement('span');head.className='sanctuary-management-force-card-head';
    const name=document.createElement('strong');name.textContent=force.forceNo+'포스';
    const count=document.createElement('em');count.textContent=force.occupiedCount+'/'+force.capacity+'명';head.append(name,count);
    const parties=document.createElement('span');parties.className='sanctuary-management-force-parties';
    force.parties.forEach(party=>{
      const partyNode=document.createElement('span');partyNode.className='sanctuary-management-force-party';
      const label=document.createElement('small');label.textContent=party.partyNo+'파티';partyNode.appendChild(label);
      party.slots.forEach(slot=>{
        const item=document.createElement('span');item.className='sanctuary-management-force-slot'+(slot.occupied?' is-occupied':'');
        item.textContent=slot.occupied?value(slot.character?.name):String((party.partyNo-1)*5+slot.slotNo);
        item.title=slot.occupied?[value(slot.character?.name),value(slot.character?.className)].filter(Boolean).join(' · '):'빈 슬롯 '+((party.partyNo-1)*5+slot.slotNo);
        partyNode.appendChild(item);
      });
      parties.appendChild(partyNode);
    });
    const stateText=document.createElement('span');stateText.className='sanctuary-management-force-card-state';
    if(force.viewerAlreadyAssigned)stateText.textContent='내 캐릭터 참여 중';
    else if(force.viewerPending)stateText.textContent='승인 대기 중';
    else if(force.canSupport)stateText.textContent='빈자리 '+force.vacancyCount+' · 눌러서 지원';
    else stateText.textContent=value(force.supportDisabledMessage)||'편성 확인';
    card.append(head,parties,stateText);
    return card;
  }

  function createTeamCard(team){
    const card=document.createElement('article');card.className='sanctuary-management-team-card';card.dataset.sanctuaryTeam=value(team.teamId);
    const head=document.createElement('div');head.className='sanctuary-management-team-card-head';
    const titleWrap=document.createElement('div');
    const title=document.createElement('h3');title.textContent=value(team.title)||'이름 없는 팀';
    const activity=document.createElement('p');activity.textContent=value(team.activity)||'진행 내용 미정';
    titleWrap.append(title,activity);
    const headActions=document.createElement('div');headActions.className='sanctuary-management-team-head-actions';
    const badge=document.createElement('span');badge.className='sanctuary-management-team-badge';badge.textContent=teamStatusLabel(team);headActions.appendChild(badge);
    const pending=(team.supportBatches||[]).reduce((sum,batch)=>sum+integer(batch.pendingCount),0);
    if(pending){const pendingBadge=document.createElement('span');pendingBadge.className='sanctuary-management-team-badge is-pending';pendingBadge.textContent='승인 대기 '+pending;headActions.appendChild(pendingBadge);}
    if(team.canEdit&&value(team.status)!=='ARCHIVED'){
      const edit=document.createElement('button');edit.type='button';edit.className='kinojo-btn secondary';edit.textContent=value(team.status)==='DRAFT'?'초안 계속 작성':'편집';edit.dataset.sanctuaryEditTeam=value(team.teamId);edit.disabled=!bootstrapData?.writeEnabled;headActions.appendChild(edit);
      const archive=document.createElement('button');archive.type='button';archive.className='kinojo-btn danger sanctuary-management-archive-team';archive.textContent='팀 해산';archive.dataset.sanctuaryArchiveTeam=value(team.teamId);archive.disabled=!bootstrapData?.writeEnabled;headActions.appendChild(archive);
    }
    head.append(titleWrap,headActions);
    const meta=document.createElement('div');meta.className='sanctuary-management-team-meta';
    [teamModeLabel(team),scheduleLabel(team),value(team.forceCount)+'포스 · '+value(team.occupiedCount)+'/'+value(team.slotCount)+'명','팀 ID '+value(team.teamId),'revision '+value(team.revision)].forEach(text=>{const item=document.createElement('span');item.textContent=text;meta.appendChild(item);});
    const forces=document.createElement('div');forces.className='sanctuary-management-force-grid';forces.setAttribute('aria-label',value(team.title)+' 포스 편성');
    team.forces.forEach(force=>forces.appendChild(createForceCard(team,force)));
    card.append(head,meta,forces);
    return card;
  }

  function visibleTeams(){
    if(selectedSanctuary==='all')return bootstrapData.teams;
    const selected=sanctuaryForSelection();
    return bootstrapData.teams.filter(team=>String(team.sanctuaryId)===String(selected?.id));
  }

  function renderTeams(){
    const root=byId('sanctuaryManagementTeamList');
    root.replaceChildren();
    const addButton=byId('sanctuaryManagementAddTeam');
    addButton.disabled=!bootstrapData.writeEnabled;
    if(!bootstrapData.readEnabled){
      byId('sanctuaryManagementTeamStatus').textContent='Server 읽기 플래그가 비활성 상태입니다. 팀 생성도 운영 승인 전까지 열리지 않습니다.';
      root.appendChild(createEmpty('실제 팀 읽기는 아직 열리지 않았습니다.','Server 어댑터 연결은 완료됐으며 별도 승인 전까지 운영 팀 데이터는 표시하지 않습니다.'));
      return;
    }
    const teams=visibleTeams();
    byId('sanctuaryManagementTeamStatus').textContent=bootstrapData.writeEnabled?'Server 팀 데이터를 표시합니다.':'읽기 전용으로 Server 팀 데이터를 표시합니다.';
    if(!teams.length){
      root.appendChild(createEmpty('등록된 팀이 없습니다.','선택한 성역에 Server가 반환한 운영 팀이 없습니다.'));
      return;
    }
    teams.forEach(team=>root.appendChild(createTeamCard(team)));
  }

  function renderMonth(){
    const root=byId('sanctuaryManagementScheduleState');
    if(!root)return;
    root.classList.add('has-calendar');
    if(!monthData){root.innerHTML='<strong>월간 일정을 불러오는 중입니다.</strong>';return;}
    const occurrences=monthData.occurrences.filter(item=>selectedSanctuary==='all'||String(item.sanctuaryId)===String(sanctuaryForSelection()?.id));
    const weeks=monthData.weekStarts.map(weekStart=>{
      const items=occurrences.filter(item=>value(item.weekStart)===weekStart).map(item=>{
        const starts=value(item.startAt);const time=(starts.match(/T(\d{2}:\d{2})/)||starts.match(/ (\d{2}:\d{2})/))?.[1]||starts.slice(11,16);
        return '<li><time datetime="'+escapeHtml(starts)+'">'+escapeHtml(value(item.occurrenceDate).slice(5)+' '+time)+'</time><span>'+escapeHtml(item.teamTitle)+'</span></li>';
      }).join('');
      return '<section class="sanctuary-management-calendar-week"><strong>'+escapeHtml(weekStart.slice(5))+' 수요일 시작</strong>'+(items?'<ul>'+items+'</ul>':'<p>등록 일정 없음</p>')+'</section>';
    }).join('');
    root.innerHTML='<div class="sanctuary-management-calendar-controls"><button type="button" data-sanctuary-month-shift="-1" aria-label="이전 달">‹</button><strong>'+escapeHtml(monthData.month)+'</strong><button type="button" data-sanctuary-month-shift="1" aria-label="다음 달">›</button></div><div class="sanctuary-management-calendar-scroll">'+weeks+'</div>';
  }

  async function loadMonth(month=selectedMonth){
    const sequence=++monthRequestSequence;selectedMonth=month;monthData=null;renderMonth();
    try{const data=await ServerAdapter.month(month);if(sequence!==monthRequestSequence)return;monthData=data;renderMonth();}
    catch(error){if(sequence!==monthRequestSequence)return;const root=byId('sanctuaryManagementScheduleState');if(root)root.innerHTML='<strong>월간 일정을 불러오지 못했습니다.</strong><span>'+escapeHtml(value(error?.message))+'</span>';}
  }

  function shiftedMonth(delta){
    const [year,month]=selectedMonth.split('-').map(Number);const date=new Date(Date.UTC(year,month-1+delta,1));return date.toISOString().slice(0,7);
  }

  function selectedDraftTeam(teamId){
    return bootstrapData?.teams.find(team=>String(team.teamId)===String(teamId))||null;
  }

  async function saveTeamDraft(model){
    if(!bootstrapData?.writeEnabled)throw new Error('Server 쓰기 기능이 아직 활성화되지 않았습니다.');
    const source=model&&typeof model==='object'?model:{};
    const teamId=Number(source.teamId||0);
    const status=value(source.status);
    const mode=value(source.mode).toUpperCase()==='PARTICIPATION'?'PARTICIPATION':'FIXED';
    const joinPolicy=mode==='PARTICIPATION'&&value(source.joinPolicy).toUpperCase()==='APPROVAL'?'APPROVAL':'INSTANT';
    const command=teamId&&mode==='PARTICIPATION'?(['ACTIVE','FULL'].includes(status)?'UPDATE_PARTICIPATION_TEAM':'UPDATE_PARTICIPATION_TEAM_DRAFT'):teamId&&['ACTIVE','FULL'].includes(status)?'UPDATE_FIXED_TEAM':teamId?'UPDATE_TEAM_DRAFT':'CREATE_TEAM';
    const payload={
      sanctuaryCode:value(source.sanctuaryCode),
      title:value(source.title),
      activity:value(source.activity),
      mode,
      joinPolicy,
      schedule:source.schedule&&typeof source.schedule==='object'?source.schedule:{}
    };
    if(teamId){payload.teamId=teamId;payload.leaseToken=value(source.leaseToken);}
    const result=await ServerAdapter.command(command,payload,teamId?Number(source.revision):null,value(source.requestKey));
    await load();
    return result;
  }

  async function saveFixedDraft(model){return saveTeamDraft(Object.assign({},model,{mode:'FIXED',joinPolicy:'INSTANT'}));}

  async function addForce(teamId,expectedRevision,requestKey,leaseToken){
    if(!bootstrapData?.writeEnabled)throw new Error('Server 쓰기 기능이 아직 활성화되지 않았습니다.');
    const normalizedTeamId=Number(teamId||0);
    if(!Number.isSafeInteger(normalizedTeamId)||normalizedTeamId<1)throw new Error('포스를 추가할 팀을 다시 선택해 주세요.');
    const result=await ServerAdapter.command('ADD_FORCE',{teamId:normalizedTeamId,leaseToken:value(leaseToken)},Number(expectedRevision)||null,value(requestKey));
    await load();
    return result;
  }

  async function setSlot(teamId,forceId,partyNo,slotNo,characterId,expectedRevision,requestKey,leaseToken){
    if(!bootstrapData?.writeEnabled)throw new Error('Server 쓰기 기능이 아직 활성화되지 않았습니다.');
    const payload={
      teamId:Number(teamId),
      forceId:Number(forceId),
      partyNo:Number(partyNo),
      slotNo:Number(slotNo),
      characterId:Number(characterId),
      leaseToken:value(leaseToken)
    };
    if(!Number.isSafeInteger(payload.teamId)||payload.teamId<1||!Number.isSafeInteger(payload.forceId)||payload.forceId<1||![1,2].includes(payload.partyNo)||payload.slotNo<1||payload.slotNo>5||!Number.isSafeInteger(payload.characterId)||payload.characterId<1){
      throw new Error('캐릭터를 추가할 슬롯을 다시 선택해 주세요.');
    }
    const result=await ServerAdapter.command('SET_SLOT',payload,Number(expectedRevision)||null,value(requestKey));
    await load();
    return result;
  }

  async function lease(teamId,action,leaseToken){
    const api=window.KinojoSupabase;
    if(!api||typeof api.runSanctuaryManagementLease!=='function')throw new Error('편집 잠금 Server 어댑터를 불러오지 못했습니다.');
    return api.runSanctuaryManagementLease(Number(teamId),value(action),value(leaseToken));
  }

  async function publishTeam(teamId,expectedRevision,requestKey,leaseToken){
    const result=await ServerAdapter.command('PUBLISH_TEAM',{teamId:Number(teamId),leaseToken:value(leaseToken)},Number(expectedRevision)||null,value(requestKey));
    await load();return result;
  }

  async function submitSupport(teamId,assignments,requestKey){
    const normalized=Array.isArray(assignments)?assignments.map(item=>({forceId:Number(item.forceId),characterId:Number(item.characterId)})):[];
    if(!normalized.length||normalized.length>9||normalized.some(item=>!Number.isSafeInteger(item.forceId)||item.forceId<1||!Number.isSafeInteger(item.characterId)||item.characterId<1)||new Set(normalized.map(item=>item.forceId)).size!==normalized.length||new Set(normalized.map(item=>item.characterId)).size!==normalized.length)throw new Error('포스와 캐릭터를 1:1로 하나 이상 선택해 주세요.');
    const result=await ServerAdapter.command('SUBMIT_SUPPORT',{teamId:Number(teamId),assignments:normalized},null,value(requestKey));await load();return result;
  }

  async function decideSupport(supportBatchId,decision,note,requestKey){
    const normalized=value(decision).toUpperCase();if(!['APPROVE','REJECT'].includes(normalized))throw new Error('승인 또는 거절을 선택해 주세요.');
    const result=await ServerAdapter.command('DECIDE_SUPPORT',{supportBatchId:Number(supportBatchId),decision:normalized,note:value(note).slice(0,240)},null,value(requestKey));await load();return result;
  }

  async function cancelSupport(supportBatchId,requestKey){
    const result=await ServerAdapter.command('CANCEL_SUPPORT',{supportBatchId:Number(supportBatchId)},null,value(requestKey));await load();return result;
  }

  async function moveSlot(teamId,fromSlotId,toSlotId,expectedRevision,requestKey,leaseToken){
    const result=await ServerAdapter.command('MOVE_SLOT',{teamId:Number(teamId),fromSlotId:Number(fromSlotId),toSlotId:Number(toSlotId),leaseToken:value(leaseToken)},Number(expectedRevision)||null,value(requestKey));
    await load();return result;
  }

  async function archiveTeam(teamId,expectedRevision,requestKey){
    const result=await ServerAdapter.command('ARCHIVE_TEAM',{teamId:Number(teamId),reason:'운영 종료'},Number(expectedRevision)||null,value(requestKey));
    await load();return result;
  }

  async function searchCharacter(teamId,query){return ServerAdapter.searchCharacter(teamId,query);}
  async function registerCharacter(teamId,candidateId,relationType,mainCharacterId,requestKey){return ServerAdapter.registerCharacter(teamId,candidateId,relationType,mainCharacterId,requestKey);}

  window.KinojoSanctuaryManagementDraftBridge=Object.freeze({
    kind:'SERVER_ONLY_DRAFT',
    schemaVersion:SCHEMA_VERSION,
    snapshot(){return bootstrapData;},
    findTeam:selectedDraftTeam,
    saveTeamDraft,
    saveFixedDraft,
    addForce,
    setSlot,
    lease,
    publishTeam,
    moveSlot,
    archiveTeam,
    searchCharacter,
    registerCharacter,
    reload:load
  });

  window.KinojoSanctuaryManagementSupportBridge=Object.freeze({
    kind:'SERVER_ONLY_SUPPORT',schemaVersion:SCHEMA_VERSION,
    snapshot(){return bootstrapData;},findTeam:selectedDraftTeam,submitSupport,decideSupport,cancelSupport,reload:load
  });

  function renderBootstrap(data){
    bootstrapData=data;
    selectedSanctuary=resolveInitialSelection(data);
    byId('sanctuaryManagementContract').textContent=contractLabel(data);
    byId('sanctuaryManagementSource').textContent='Server';
    setFlagState('sanctuaryManagementReadState',data.readEnabled);
    setFlagState('sanctuaryManagementWriteState',data.writeEnabled);
    renderScope();
    renderSelectedSanctuary();
    renderTeams();
    loadMonth(selectedMonth);
    byId('sanctuaryManagementContent').hidden=false;
    if(data.readEnabled){
      setAccess('ready','성역 팀과 참여 모집이 연결되었습니다.',data.writeEnabled?'로그인 이용자는 팀 생성·참여 지원을 사용할 수 있고, 권한 보유자는 팀 편집·해산·승인을 처리할 수 있습니다.':'현재 읽기 전용 상태입니다.');
    }else{
      setAccess('rollout','Server 연결은 완료됐고 실제 팀 읽기는 준비 중입니다.','신규 read/write 플래그는 그대로 비활성 상태이며 기존 성역·스케줄·시트 데이터는 변경하지 않습니다.');
    }
    if(data.serverTime)window.dispatchEvent(new CustomEvent('kinojo:page-time',{detail:{value:data.serverTime,label:'Server'}}));
  }

  async function load(){
    const sequence=++requestSequence;
    const auth=authState();
    bootstrapData=null;
    byId('sanctuaryManagementContent').hidden=true;
    byId('sanctuaryManagementScopeShell').hidden=true;
    byId('sanctuaryManagementContract').textContent='API 계약 확인 중';
    if(!auth.loggedIn){
      setAccess('denied','로그인이 필요합니다.','성역 팀 관리는 권한형 화면입니다. 로그인 후 권한을 다시 확인합니다.','login');
      return;
    }
    setAccess('loading','Server 성역 관리 계약을 확인하고 있습니다.','로그인 이용자의 팀·포스·지원 데이터를 신규 Server 어댑터로 불러옵니다.');
    try{
      const data=await ServerAdapter.bootstrap();
      if(sequence!==requestSequence)return;
      renderBootstrap(data);
    }catch(error){
      if(sequence!==requestSequence)return;
      setAccess('error','Server 데이터를 불러오지 못했습니다.',value(error?.message)||'잠시 후 다시 시도해 주세요.','retry');
    }
  }

  function bind(){
    byId('sanctuaryManagementScope')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-sanctuary-scope]');
      if(!button||!bootstrapData)return;
      selectedSanctuary=value(button.dataset.sanctuaryScope)||'all';
      syncLocation();
      renderScope();
      renderSelectedSanctuary();
      renderTeams();
      renderMonth();
    });
    byId('sanctuaryManagementAccessAction')?.addEventListener('click',event=>{
      const action=value(event.currentTarget.dataset.action);
      if(action==='login'){byId('kinojoLoginBtn')?.click();return;}
      if(action==='back'){location.href=document.body.classList.contains('kinojo-page-mobile')?'../sanctuary/':'../sanctuary/';return;}
      load();
    });
    byId('sanctuaryManagementAddTeam')?.addEventListener('click',event=>{
      if(event.currentTarget.disabled)return;
      window.KinojoSanctuaryManagementDraftUI?.openMode?.(event.currentTarget);
    });
    byId('sanctuaryManagementTeamList')?.addEventListener('click',event=>{
      const support=event.target.closest('[data-sanctuary-support-force]');
      if(support){const team=selectedDraftTeam(support.dataset.sanctuarySupportTeam);if(team)window.KinojoSanctuaryManagementSupportUI?.open?.(team,Number(support.dataset.sanctuarySupportForce),support);return;}
      const edit=event.target.closest('[data-sanctuary-edit-team]');
      if(edit&&!edit.disabled){const team=selectedDraftTeam(edit.dataset.sanctuaryEditTeam);if(team)window.KinojoSanctuaryManagementDraftUI?.openDraft?.(team,edit);return;}
      const archive=event.target.closest('[data-sanctuary-archive-team]');
      if(!archive||archive.disabled)return;
      const team=selectedDraftTeam(archive.dataset.sanctuaryArchiveTeam);if(!team)return;
      if(!window.confirm('['+value(team.title)+'] 팀을 해산할까요? 해산하면 일정과 지원 대기가 종료됩니다.'))return;
      archive.disabled=true;
      archiveTeam(team.teamId,team.revision,'sm-archive-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)).then(()=>window.KinojoToast?.success?.('팀을 해산했습니다.')).catch(error=>{archive.disabled=false;window.KinojoToast?.show?.(value(error?.message)||'팀을 해산하지 못했습니다.');});
    });
    byId('sanctuaryManagementScheduleState')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-sanctuary-month-shift]');if(!button)return;loadMonth(shiftedMonth(Number(button.dataset.sanctuaryMonthShift)||0));
    });
    window.addEventListener('kinojo:auth-changed',load);
    load();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();
