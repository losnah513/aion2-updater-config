(function(){
  'use strict';

  const API_VERSION=1.7;
  const SCHEMA_VERSION=445;
  let requestSequence=0;
  let monthRequestSequence=0;
  let bootstrapData=null;
  let monthData=null;
  let selectedSanctuary='';
  let selectedMonth=new Date(Date.now()+9*60*60*1000).toISOString().slice(0,7);
  let operationLayer=null;
  let operationOpener=null;
  let deepLinkApplied=false;

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
      canEdit:item.canEdit===true,
      canArchive:item.canArchive===true,
      scheduleEditScopes:Array.isArray(item.scheduleEditScopes)?item.scheduleEditScopes.map(value):[]
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
    const sourceRollout=data.rollout&&typeof data.rollout==='object'&&!Array.isArray(data.rollout)?data.rollout:{};
    const rollout={
      mode:value(sourceRollout.mode).toUpperCase(),
      globalWriteEnabled:sourceRollout.globalWriteEnabled===true,
      effectiveWriteEnabled:sourceRollout.effectiveWriteEnabled===true,
      pilotApproved:sourceRollout.pilotApproved===true,
      pilotApprovedAt:value(sourceRollout.pilotApprovedAt),
      pilotExpiresAt:value(sourceRollout.pilotExpiresAt),
      reasonCode:value(sourceRollout.reasonCode),
      message:value(sourceRollout.message)
    };
    if(!['CLOSED','PILOT','OPEN'].includes(rollout.mode)||rollout.effectiveWriteEnabled!==(data.writeEnabled===true)){
      throw new Error('성역 관리 시험 운영 상태가 Server 쓰기 권한과 일치하지 않습니다.');
    }
    const sourceTransition=data.transitionReview&&typeof data.transitionReview==='object'&&!Array.isArray(data.transitionReview)?data.transitionReview:{};
    const transitionReview={
      canReview:sourceTransition.canReview===true,
      canApprove:sourceTransition.canApprove===true,
      approved:sourceTransition.approved===true,
      scopeHash:value(sourceTransition.scopeHash),
      unresolvedCount:integer(sourceTransition.unresolvedCount)
    };
    if(transitionReview.canReview&&(!/^[0-9a-f]{64}$/.test(transitionReview.scopeHash)||transitionReview.unresolvedCount<0)){
      throw new Error('성역 관리 전환 검수 상태가 올바르지 않습니다.');
    }
    return {
      apiVersion:Number(data.apiVersion),
      schemaVersion:Number(data.schemaVersion),
      serverTime:value(data.serverTime),
      readEnabled:data.readEnabled===true,
      writeEnabled:data.writeEnabled===true,
      globalWriteEnabled:data.globalWriteEnabled===true,
      rollout,
      transitionReview,
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
    async transitionReport(month){
      const api=window.KinojoSupabase;
      if(!api||typeof api.getSanctuaryManagementTransitionReport!=='function')throw new Error('전환 검수 Server 어댑터를 불러오지 못했습니다.');
      const result=await api.getSanctuaryManagementTransitionReport(value(month));
      if(!result||typeof result!=='object'||result.ok!==true||Number(result.schemaVersion)!==SCHEMA_VERSION||!result.targets||typeof result.targets!=='object'||!Array.isArray(result.evidence)||!result.operations||typeof result.operations!=='object'||!/^[0-9a-f]{64}$/.test(value(result.scopeHash))){
        throw new Error(value(result?.message)||'전환 검수 Server 계약이 올바르지 않습니다.');
      }
      return result;
    },
    async approveTransition(month,report,confirmation){
      const api=window.KinojoSupabase;
      if(!api||typeof api.approveSanctuaryManagementTransition!=='function')throw new Error('전환 승인 Server 어댑터를 불러오지 못했습니다.');
      const result=await api.approveSanctuaryManagementTransition(value(month),value(report?.scopeHash),report?.targets,value(confirmation));
      if(!result||typeof result!=='object'||result.ok!==true||result.approved!==true||Number(result.schemaVersion)!==SCHEMA_VERSION)throw new Error(value(result?.message)||'전환 범위를 승인하지 못했습니다.');
      return result;
    },
    async command(command,payload,expectedRevision=null,requestKey=''){
      const api=window.KinojoSupabase;
      if(!api||typeof api.runSanctuaryManagementCommand!=='function')throw new Error('성역 관리 Server 명령 어댑터를 불러오지 못했습니다.');
      const result=await api.runSanctuaryManagementCommand(command,payload,expectedRevision,requestKey);
      if(!result||typeof result!=='object'||result.ok!==true)throw new Error(value(result?.message)||'성역 팀 초안을 저장하지 못했습니다.');
      return result;
    },
    async archivePreview(teamId){
      const api=window.KinojoSupabase;
      if(!api||typeof api.getSanctuaryManagementArchivePreview!=='function')throw new Error('팀 해산 영향 Server 어댑터를 불러오지 못했습니다.');
      const result=await api.getSanctuaryManagementArchivePreview(Number(teamId));
      if(!result||result.ok!==true||Number(result.schemaVersion)!==SCHEMA_VERSION)throw new Error(value(result?.message)||'팀 해산 영향을 확인하지 못했습니다.');
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
  function sanctuaryOrder(item,index=0){return integer(item?.displayOrder)||integer(item?.id)||index+1;}
  function sanctuaryLabel(item,index=0){return '성역 '+sanctuaryOrder(item,index);}
  function sanctuaryOfficialName(item){return value(item?.name);}
  function sanctuaryFullLabel(item,index=0){
    const short=sanctuaryLabel(item,index);const official=sanctuaryOfficialName(item);
    return official&&official.replace(/\s+/g,'')!==short.replace(/\s+/g,'')?short+' | '+official:short;
  }
  function sanctuaryForSelection(){return bootstrapData?.sanctuaries.find(item=>sanctuaryKey(item)===selectedSanctuary)||null;}

  function resolveInitialSelection(data){
    const requested=value(new URLSearchParams(location.search).get('id'));
    if(requested&&data.sanctuaries.some(item=>sanctuaryKey(item)===requested))return requested;
    return sanctuaryKey(data.sanctuaries[0]);
  }

  function syncLocation(){
    const url=new URL(location.href);
    if(selectedSanctuary)url.searchParams.set('id',selectedSanctuary);
    else url.searchParams.delete('id');
    history.replaceState(null,'',url.pathname+url.search+url.hash);
  }

  function renderScope(){
    const shell=byId('sanctuaryManagementScopeShell');
    const root=byId('sanctuaryManagementScope');
    root.replaceChildren();
    const items=bootstrapData.sanctuaries.map((item,index)=>({key:sanctuaryKey(item),short:sanctuaryLabel(item,index),full:sanctuaryFullLabel(item,index)}));
    items.forEach(item=>{
      const button=document.createElement('button');
      button.type='button';
      button.dataset.sanctuaryScope=item.key;
      button.setAttribute('aria-pressed',item.key===selectedSanctuary?'true':'false');
      button.setAttribute('aria-label',item.full);
      button.title=item.full;
      const short=document.createElement('span');short.className='sanctuary-management-scope-short';short.textContent=item.short;
      const detail=document.createElement('span');detail.className='sanctuary-management-scope-detail';detail.setAttribute('aria-hidden','true');
      Array.from(item.full.slice(item.short.length)).forEach((character,index)=>{
        const glyph=document.createElement('span');glyph.className='sanctuary-management-scope-detail-char';glyph.textContent=character;glyph.style.setProperty('--scope-char-index',String(index));detail.appendChild(glyph);
      });
      button.append(short,detail);
      root.appendChild(button);
      requestAnimationFrame(()=>{
        const detailWidth=Math.min(260,detail.scrollWidth);
        detail.style.setProperty('--scope-detail-width',detailWidth+'px');
      });
    });
    shell.hidden=false;
  }

  function setFlagState(id,enabled){
    const target=byId(id);
    target.textContent=enabled?'활성':'준비 중';
    target.classList.toggle('is-on',enabled);
    target.classList.toggle('is-off',!enabled);
  }

  function renderWriteState(data){
    const target=byId('sanctuaryManagementWriteState');
    const meta=byId('sanctuaryManagementWriteMeta');
    const rollout=data.rollout||{};
    let label=data.writeEnabled?'활성':'준비 중';
    let detail='Server 기능 플래그';
    if(rollout.mode==='PILOT'){
      label=data.writeEnabled?'시험 운영':'읽기 전용';
      detail=data.writeEnabled?'승인됨 · Server 허용 목록':'시험 사용자만 쓰기';
    }else if(rollout.mode==='OPEN'){
      label=data.writeEnabled?'전체 운영':'준비 중';
      detail='Server 전체 쓰기';
    }else if(rollout.mode==='CLOSED'){
      label='중지';
      detail='Server 쓰기 중지';
    }
    target.textContent=label;
    target.classList.toggle('is-on',data.writeEnabled);
    target.classList.toggle('is-off',!data.writeEnabled);
    if(meta)meta.textContent=detail;
  }

  function renderSelectedSanctuary(){
    const selected=sanctuaryForSelection();
    byId('sanctuaryManagementSelectedName').textContent=selected?sanctuaryLabel(selected):'성역';
    const official=selected?sanctuaryOfficialName(selected):'';
    const status=selected?(official&&official.replace(/\s+/g,'')!==sanctuaryLabel(selected).replace(/\s+/g,'')?official:value(selected.releaseLabel)||value(selected.releaseStatus)||'Server master'):'Server master';
    byId('sanctuaryManagementSelectedMeta').textContent=status;
  }

  function teamModeLabel(team){return value(team.mode)==='FIXED'?'고정 팀':value(team.mode)==='PARTICIPATION'?'참여 팀':value(team.mode)||'팀';}
  function teamStatusLabel(team){
    const status=value(team.status);
    return ({DRAFT:'DRAFT',ACTIVE:'운영 중',FULL:'모집 완료',ARCHIVED:'보관됨'})[status]||status||'상태 확인 중';
  }
  function scheduleLabel(team){
    const occurrence=(monthData?.occurrences||[]).filter(item=>Number(item.teamId)===Number(team?.teamId)).sort((left,right)=>value(left.startAt).localeCompare(value(right.startAt)))[0];
    if(occurrence){
      const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(occurrence.startAt));
      return value(occurrence.occurrenceDate)+' '+time+' · '+(integer(occurrence.durationMinutes)||30)+'분';
    }
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
    if(participation){card.type='button';card.dataset.sanctuarySupportForce=value(force.forceId);card.dataset.sanctuarySupportTeam=value(team.teamId);card.disabled=!bootstrapData?.writeEnabled;}
    card.className='sanctuary-management-force-card'+(participation?' is-supportable':'')+(force.canSupport?' can-support':' is-unavailable')+(force.viewerAlreadyAssigned?' is-assigned':'')+(force.viewerPending?' is-pending':'');
    if(participation){card.setAttribute('aria-label',force.forceNo+'포스 지원 창 열기. '+(force.canSupport?'지원 가능':value(force.supportDisabledMessage)||'지원 상태 확인'));card.setAttribute('aria-disabled',bootstrapData?.writeEnabled&&force.canSupport?'false':'true');}
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
      if(['ACTIVE','FULL'].includes(value(team.status))){const schedule=document.createElement('button');schedule.type='button';schedule.className='kinojo-btn secondary';schedule.textContent='일정 관리';schedule.dataset.sanctuaryScheduleTeam=value(team.teamId);schedule.disabled=!bootstrapData?.writeEnabled;headActions.appendChild(schedule);}
      if(team.canArchive){const archive=document.createElement('button');archive.type='button';archive.className='kinojo-btn danger sanctuary-management-archive-team';archive.textContent='팀 해산';archive.dataset.sanctuaryArchiveTeam=value(team.teamId);archive.disabled=!bootstrapData?.writeEnabled;headActions.appendChild(archive);}
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
    const selected=sanctuaryForSelection();
    return bootstrapData.teams.filter(team=>String(team.sanctuaryId)===String(selected?.id));
  }

  function renderTeams(){
    const root=byId('sanctuaryManagementTeamList');
    root.replaceChildren();
    const addButton=byId('sanctuaryManagementAddTeam');
    addButton.disabled=!bootstrapData.writeEnabled;
    addButton.title=bootstrapData.writeEnabled?'새 성역 팀을 생성합니다.':value(bootstrapData.rollout?.message)||'현재 읽기 전용입니다.';
    if(!bootstrapData.readEnabled){
      byId('sanctuaryManagementTeamStatus').textContent='Server 읽기 플래그가 비활성 상태입니다. 팀 생성도 운영 승인 전까지 열리지 않습니다.';
      root.appendChild(createEmpty('실제 팀 읽기는 아직 열리지 않았습니다.','Server 어댑터 연결은 완료됐으며 별도 승인 전까지 운영 팀 데이터는 표시하지 않습니다.'));
      return;
    }
    const teams=visibleTeams();
    byId('sanctuaryManagementTeamStatus').textContent=bootstrapData.writeEnabled?'승인된 시험 사용자로 Server 팀 데이터를 편집할 수 있습니다.':value(bootstrapData.rollout?.message)||'읽기 전용으로 Server 팀 데이터를 표시합니다.';
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
    const occurrences=monthData.occurrences.filter(item=>String(item.sanctuaryId)===String(sanctuaryForSelection()?.id));
    const start=new Date(monthData.rangeStart+'T00:00:00Z');
    const end=new Date(monthData.rangeEnd+'T00:00:00Z');
    const days=[];
    for(let cursor=new Date(start);cursor<=end;cursor.setUTCDate(cursor.getUTCDate()+1))days.push(cursor.toISOString().slice(0,10));
    const cells=days.map(day=>{
      const outside=!day.startsWith(monthData.month);
      const items=occurrences.filter(item=>value(item.occurrenceDate)===day).map(item=>{
        const starts=value(item.startAt);const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(starts));
        return '<button type="button" data-sanctuary-calendar-team="'+escapeHtml(item.teamId)+'" data-sanctuary-calendar-date="'+escapeHtml(day)+'" title="'+escapeHtml(item.teamTitle+' · '+time)+'"><time datetime="'+escapeHtml(starts)+'">'+escapeHtml(time)+'</time><span>'+escapeHtml(item.teamTitle)+'</span></button>';
      }).join('');
      return '<div class="sanctuary-management-calendar-day'+(outside?' is-outside':'')+'" data-calendar-date="'+escapeHtml(day)+'"><strong>'+Number(day.slice(8))+'</strong><div>'+items+'</div></div>';
    }).join('');
    root.innerHTML='<div class="sanctuary-management-calendar-controls"><button type="button" data-sanctuary-month-shift="-1" aria-label="이전 달">‹</button><strong>'+escapeHtml(monthData.month)+'</strong><button type="button" data-sanctuary-month-shift="1" aria-label="다음 달">›</button></div>'
      +'<div class="sanctuary-management-calendar-weekdays" aria-hidden="true"><span>수</span><span>목</span><span>금</span><span>토</span><span>일</span><span>월</span><span>화</span></div>'
      +'<div class="sanctuary-management-calendar-grid" aria-label="'+escapeHtml(monthData.month)+' 수요일 시작 월간 일정">'+cells+'</div>';
  }

  async function loadMonth(month=selectedMonth){
    const sequence=++monthRequestSequence;selectedMonth=month;monthData=null;renderMonth();
    try{const data=await ServerAdapter.month(month);if(sequence!==monthRequestSequence)return;monthData=data;renderMonth();if(bootstrapData)renderTeams();}
    catch(error){if(sequence!==monthRequestSequence)return;const root=byId('sanctuaryManagementScheduleState');if(root)root.innerHTML='<strong>월간 일정을 불러오지 못했습니다.</strong><span>'+escapeHtml(value(error?.message))+'</span>';}
  }

  function shiftedMonth(delta){
    const [year,month]=selectedMonth.split('-').map(Number);const date=new Date(Date.UTC(year,month-1+delta,1));return date.toISOString().slice(0,7);
  }

  function ensureOperationLayer(){
    if(operationLayer&&document.body.contains(operationLayer))return operationLayer;
    operationLayer=document.createElement('section');operationLayer.className='sanctuary-management-operation-layer';operationLayer.hidden=true;operationLayer.setAttribute('aria-hidden','true');
    operationLayer.addEventListener('click',event=>{if(event.target.closest('[data-operation-close]'))closeOperationLayer();});
    operationLayer.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();closeOperationLayer();return;}
      if(event.key!=='Tab')return;const items=Array.from(operationLayer.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])'));if(!items.length)return;
      const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    document.body.appendChild(operationLayer);return operationLayer;
  }

  function openOperationLayer(opener,markup){
    const layer=ensureOperationLayer();operationOpener=opener||document.activeElement;layer.innerHTML='<div class="sanctuary-management-operation-backdrop" data-operation-close></div>'+markup;layer.hidden=false;layer.setAttribute('aria-hidden','false');document.body.classList.add('sanctuary-management-operation-open');
    requestAnimationFrame(()=>layer.querySelector('[role="dialog"]')?.focus());
  }

  function closeOperationLayer(){
    if(!operationLayer)return;operationLayer.hidden=true;operationLayer.setAttribute('aria-hidden','true');operationLayer.replaceChildren();document.body.classList.remove('sanctuary-management-operation-open');
    const target=operationOpener;operationOpener=null;try{target?.focus({preventScroll:true});}catch(_err){target?.focus?.();}
  }

  function scheduleOccurrenceForTeam(team){
    const items=(monthData?.occurrences||[]).filter(item=>Number(item.teamId)===Number(team.teamId)).sort((a,b)=>value(a.startAt).localeCompare(value(b.startAt)));
    return items.find(item=>value(item.occurrenceDate)>=new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10))||items[0]||null;
  }

  function weekdayButtons(selected){
    const labels=[[3,'수'],[4,'목'],[5,'금'],[6,'토'],[7,'일'],[1,'월'],[2,'화']];
    return labels.map(([day,label])=>'<label><input type="checkbox" name="weekdays" value="'+day+'"'+(selected.includes(day)?' checked':'')+'><span>'+label+'</span></label>').join('');
  }

  function openScheduleOperation(team,opener,occurrenceDate=''){
    const schedule=team.schedule||{};const occurrence=scheduleOccurrenceForTeam(team);const baseDate=occurrenceDate||value(occurrence?.occurrenceDate)||value(schedule.startsOn);
    const scopes=(team.scheduleEditScopes||[]).filter(scope=>['OCCURRENCE','FUTURE','ALL'].includes(scope));
    const scopeLabels={OCCURRENCE:'이번 일정만',FUTURE:'이후 일정',ALL:'전체 반복'};
    openOperationLayer(opener,'<form class="sanctuary-management-operation-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryScheduleOperationTitle" tabindex="-1" data-schedule-operation>'
      +'<header><span>SCHEDULE OPERATION</span><h2 id="sanctuaryScheduleOperationTitle">'+escapeHtml(team.title)+' 일정 관리</h2><p>팀 아래 모든 포스에 같은 변경 범위가 적용되며 저장 전 일정 충돌을 다시 확인합니다.</p></header>'
      +'<div class="sanctuary-management-operation-body">'
        +'<fieldset><legend>변경 범위</legend><div class="sanctuary-management-operation-options">'+scopes.map((scope,index)=>'<label><input type="radio" name="scope" value="'+scope+'"'+(index===0?' checked':'')+'><span>'+scopeLabels[scope]+'</span></label>').join('')+'</div></fieldset>'
        +'<div class="sanctuary-management-operation-fields"><label><span>기준/이동 날짜</span><input type="date" name="startsOn" required value="'+escapeHtml(baseDate)+'"></label><label><span>시작 시간</span><input type="time" name="startsAt" step="1800" required value="'+escapeHtml(value(schedule.startsAt).slice(0,5)||'21:00')+'"></label><label><span>진행 시간</span><select name="durationMinutes">'+Array.from({length:24},(_,index)=>(index+1)*30).map(minutes=>'<option value="'+minutes+'"'+(minutes===integer(schedule.durationMinutes)?' selected':'')+'>'+minutes+'분</option>').join('')+'</select></label></div>'
        +'<fieldset><legend>반복 요일</legend><div class="sanctuary-management-operation-weekdays">'+weekdayButtons(Array.isArray(schedule.weekdays)?schedule.weekdays.map(Number):[])+'</div></fieldset>'
        +'<p class="sanctuary-management-operation-status" data-operation-status aria-live="polite">이번 일정·이후 일정·전체 반복 중 하나를 선택하세요.</p>'
      +'</div><footer><button type="button" class="kinojo-btn secondary" data-operation-close>닫기</button><button type="button" class="kinojo-btn danger" data-schedule-stop>선택 범위 종료</button><button type="submit" class="kinojo-btn">변경 저장</button></footer></form>');
    const form=operationLayer.querySelector('[data-schedule-operation]');
    async function submit(operation){
      const data=new FormData(form);const scope=value(data.get('scope'));const startsOn=value(data.get('startsOn'));const status=form.querySelector('[data-operation-status]');
      const schedulePayload={kind:value(schedule.kind)==='ONCE'?'ONCE':'WEEKLY',startsOn,startsAt:value(data.get('startsAt')),durationMinutes:Number(data.get('durationMinutes')),weekdays:Array.from(form.querySelectorAll('input[name="weekdays"]:checked')).map(input=>Number(input.value))};
      if(schedulePayload.kind==='ONCE')schedulePayload.weekdays=[];
      form.querySelectorAll('button,input,select').forEach(control=>control.disabled=true);status.textContent=operation==='UPDATE'?'Server에서 일정 충돌을 확인하고 저장 중입니다.':'선택한 범위의 향후 일정을 종료하고 있습니다.';
      try{await ServerAdapter.command('EDIT_SCHEDULE',{teamId:Number(team.teamId),scope,operation,occurrenceDate:baseDate,schedule:schedulePayload},Number(team.revision),'sm-schedule-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));closeOperationLayer();await load();window.KinojoToast?.success?.(operation==='UPDATE'?'일정 변경을 저장했습니다.':'선택한 범위의 일정을 종료했습니다.');}
      catch(error){form.querySelectorAll('button,input,select').forEach(control=>control.disabled=false);status.textContent=value(error?.message)||'일정을 변경하지 못했습니다.';status.classList.add('is-error');}
    }
    form.addEventListener('submit',event=>{event.preventDefault();submit('UPDATE');});
    form.querySelector('[data-schedule-stop]').addEventListener('click',()=>submit('STOP'));
  }

  async function openArchiveOperation(team,opener){
    openOperationLayer(opener,'<section class="sanctuary-management-operation-dialog is-archive" role="dialog" aria-modal="true" aria-labelledby="sanctuaryArchiveTitle" tabindex="-1"><header><span>ARCHIVE TEAM</span><h2 id="sanctuaryArchiveTitle">팀 해산 영향 확인</h2><p>Server에서 종료될 일정과 지원 요청을 확인하고 있습니다.</p></header><div class="sanctuary-management-operation-loading" aria-live="polite">영향 범위 불러오는 중…</div><footer><button type="button" class="kinojo-btn secondary" data-operation-close>닫기</button></footer></section>');
    try{
      const preview=await ServerAdapter.archivePreview(team.teamId);if(operationLayer.hidden)return;
      const dialog=operationLayer.querySelector('[role="dialog"]');
      dialog.innerHTML='<header><span>ARCHIVE TEAM</span><h2 id="sanctuaryArchiveTitle">'+escapeHtml(preview.teamTitle)+' 팀을 해산할까요?</h2><p>'+escapeHtml(preview.message)+'</p></header>'
        +'<div class="sanctuary-management-archive-impact"><article><strong>'+escapeHtml(preview.futureOccurrenceCount)+'</strong><span>향후 '+escapeHtml(preview.futureWindowDays)+'일 일정</span></article><article><strong>'+escapeHtml(preview.pendingSupportCount)+'</strong><span>승인 대기 지원</span></article><article><strong>보존</strong><span>편성·감사 이력</span></article></div>'
        +'<label class="sanctuary-management-archive-reason"><span>해산 사유</span><input maxlength="240" value="운영 종료" data-archive-reason></label>'
        +'<p class="sanctuary-management-operation-status" data-operation-status aria-live="polite">해산 후에는 모집 알림과 향후 일정이 즉시 종료됩니다.</p>'
        +'<footer><button type="button" class="kinojo-btn secondary" data-operation-close>취소</button><button type="button" class="kinojo-btn danger" data-archive-confirm>팀 해산</button></footer>';
      dialog.querySelector('[data-archive-confirm]').addEventListener('click',async event=>{const button=event.currentTarget;const status=dialog.querySelector('[data-operation-status]');button.disabled=true;status.textContent='팀과 향후 일정·지원 대기를 Server에서 종료하고 있습니다.';try{await ServerAdapter.command('ARCHIVE_TEAM',{teamId:Number(team.teamId),reason:value(dialog.querySelector('[data-archive-reason]').value)||'운영 종료'},Number(team.revision),'sm-archive-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10));closeOperationLayer();await load();window.KinojoToast?.success?.('팀을 해산했습니다. 편성과 감사 이력은 보존됩니다.');}catch(error){button.disabled=false;status.textContent=value(error?.message)||'팀을 해산하지 못했습니다.';status.classList.add('is-error');}});
      dialog.querySelector('[data-archive-reason]')?.focus();
    }catch(error){const loading=operationLayer.querySelector('.sanctuary-management-operation-loading');if(loading)loading.textContent=value(error?.message)||'팀 해산 영향을 불러오지 못했습니다.';}
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

  async function archiveTeam(teamId,expectedRevision,requestKey,reason='운영 종료'){
    const result=await ServerAdapter.command('ARCHIVE_TEAM',{teamId:Number(teamId),reason:value(reason)||'운영 종료'},Number(expectedRevision)||null,value(requestKey));
    await load();return result;
  }

  async function searchCharacter(teamId,query){return ServerAdapter.searchCharacter(teamId,query);}
  async function registerCharacter(teamId,candidateId,relationType,mainCharacterId,requestKey){return ServerAdapter.registerCharacter(teamId,candidateId,relationType,mainCharacterId,requestKey);}

  function transitionCount(value){return new Intl.NumberFormat('ko-KR').format(integer(value));}
  function transitionStatus(status){const normalized=value(status).toUpperCase();return '<span class="sanctuary-management-transition-status is-'+escapeHtml(normalized.toLowerCase())+'">'+escapeHtml(normalized||'PENDING')+'</span>';}
  function transitionTargetIds(item){
    const ids=Array.isArray(item?.ids)?item.ids:Array.isArray(item?.occupiedIds)?item.occupiedIds:[];
    if(!ids.length)return '';
    const text=ids.map(value).filter(Boolean).join(', ');
    if(ids.length<=14)return '<small>ID '+escapeHtml(text)+'</small>';
    return '<details><summary>ID '+transitionCount(ids.length)+'개 보기</summary><small>'+escapeHtml(text)+'</small></details>';
  }
  function transitionTargetGroup(title,items){
    const rows=(Array.isArray(items)?items:[]).map(item=>'<article><div><strong>'+escapeHtml(value(item.object))+'</strong><span>'+escapeHtml(value(item.reason))+'</span>'+transitionTargetIds(item)+'</div><em>'+transitionCount(item.rowCount)+'행'+(item.occupiedRowCount==null?'':' · 점유 '+transitionCount(item.occupiedRowCount))+'</em></article>').join('');
    return '<section class="sanctuary-management-transition-target-group"><h3>'+escapeHtml(title)+'</h3><div>'+(rows||'<p>대상 없음</p>')+'</div></section>';
  }
  function transitionReportMarkup(report){
    const legacy=report.cardComparison?.legacy||{};const server=report.cardComparison?.server||{};
    const legacySchedule=report.scheduleComparison?.legacy||{};const serverSchedule=report.scheduleComparison?.server||{};
    const evidence=Array.isArray(report.evidence)?report.evidence:[];const checks=Array.isArray(report.operations?.checks)?report.operations.checks:[];
    const approved=report.approval?.approved===true;const ready=report.readyForApproval===true;
    const targetLabels={preserve:'유지',migrate:'이관',archive:'보관·해산',initialize:'초기화',stop:'중지'};
    const approvalHtml=approved
      ? '<section class="sanctuary-management-transition-approval is-approved"><strong>전환 범위 승인 완료</strong><span>'+escapeHtml(value(report.approval.approvedAt))+' · 실제 초기화와 전환은 Stage 7에서 재검증 후 실행합니다.</span></section>'
      : ready
        ? '<section class="sanctuary-management-transition-approval" data-transition-approval><strong>최종 전환 범위 승인</strong><p>아래 다섯 범위를 모두 확인하고 확인 문구 <b>전환 범위 승인</b>을 입력해야 합니다. 이 승인은 실행 허가를 기록할 뿐 지금 데이터를 변경하지 않습니다.</p><div class="sanctuary-management-transition-confirm-list">'+Object.entries(targetLabels).map(([key,label])=>'<label><input type="checkbox" value="'+escapeHtml(key)+'"><span>'+escapeHtml(label)+' 범위 확인</span></label>').join('')+'</div><label class="sanctuary-management-transition-confirm-input"><span>확인 문구</span><input type="text" maxlength="20" autocomplete="off" placeholder="전환 범위 승인"></label><p class="sanctuary-management-transition-approval-state" data-transition-approval-state aria-live="polite">0/5 범위를 확인했습니다. 남은 5개 범위를 확인해 주세요.</p></section>'
        : '<section class="sanctuary-management-transition-approval is-blocked"><strong>승인 대기</strong><span>미해결 검증 '+transitionCount(report.unresolvedCount)+'건을 먼저 해결해야 합니다.</span></section>';
    return '<section class="sanctuary-management-operation-dialog is-transition" role="dialog" aria-modal="true" aria-labelledby="sanctuaryTransitionTitle" tabindex="-1">'
      +'<header><span>STAGE 6 · PARALLEL OPERATION</span><h2 id="sanctuaryTransitionTitle">병행 운영·전환 검수</h2><p>기존 시트 기반 영역과 신규 Server 영역의 차이, 운영 시험, 롤백 복구, 초기화 후보를 한 화면에서 확인합니다.</p></header>'
      +'<div class="sanctuary-management-operation-body sanctuary-management-transition-body">'
      +'<section class="sanctuary-management-transition-overview"><article><span>판정</span><strong class="'+(ready?'is-pass':'is-warn')+'">'+(ready?'승인 가능':'검증 필요')+'</strong><small>미해결 '+transitionCount(report.unresolvedCount)+'건</small></article><article><span>비교 월</span><strong>'+escapeHtml(value(report.scheduleComparison?.month))+'</strong><small>수요일~화요일</small></article><article><span>운영 명령</span><strong>'+transitionCount(report.operations?.commandCount)+'</strong><small>감사 '+transitionCount(report.operations?.auditEventCount)+'건</small></article><article><span>범위 해시</span><strong>'+escapeHtml(value(report.scopeHash).slice(0,8))+'</strong><small>대상 변경 감지</small></article></section>'
      +'<section class="sanctuary-management-transition-section"><header><h3>6-2 성역 카드 비교</h3>'+transitionStatus(evidence.find(item=>item.stageItem==='6-2')?.status)+'</header><p>'+escapeHtml(value(report.cardComparison?.explanation))+'</p><div class="sanctuary-management-transition-compare"><article><span>기존 Sheet DB</span><strong>'+transitionCount(legacy.teamCount)+'팀 · '+transitionCount(legacy.partyCount)+'파티</strong><small>'+transitionCount(legacy.occupiedSlotCount)+'/'+transitionCount(legacy.slotCount)+' 슬롯 점유</small></article><article><span>신규 Server DB</span><strong>'+transitionCount(server.teamCount)+'팀 · '+transitionCount(server.forceCount)+'포스</strong><small>'+transitionCount(server.occupiedSlotCount)+'/'+transitionCount(server.slotCount)+' 슬롯 점유</small></article></div></section>'
      +'<section class="sanctuary-management-transition-section"><header><h3>6-3 일정 결과 비교</h3>'+transitionStatus(evidence.find(item=>item.stageItem==='6-3')?.status)+'</header><p>'+escapeHtml(value(report.scheduleComparison?.explanation))+'</p><div class="sanctuary-management-transition-compare"><article><span>기존 일정</span><strong>'+transitionCount(legacySchedule.scheduleCount)+'개</strong><small>표시 범위 '+transitionCount(legacySchedule.monthOccurrenceCount)+'회</small></article><article><span>신규 팀 일정</span><strong>'+transitionCount(serverSchedule.activeRuleCount)+'개 규칙</strong><small>표시 범위 '+transitionCount(serverSchedule.monthOccurrenceCount)+'회</small></article></div></section>'
      +'<section class="sanctuary-management-transition-section"><header><h3>6-4·6-5 운영·장애 검증</h3>'+transitionStatus(checks.every(item=>item.status==='PASS')?'PASS':'FAIL')+'</header><div class="sanctuary-management-transition-checks">'+checks.map(item=>'<article>'+transitionStatus(item.status)+'<span>'+escapeHtml(value(item.label))+'</span><small>실패 '+transitionCount(item.failureCount)+'</small></article>').join('')+'</div><div class="sanctuary-management-transition-evidence">'+evidence.filter(item=>['6-4','6-5'].includes(item.stageItem)).map(item=>'<article>'+transitionStatus(item.status)+'<div><strong>'+escapeHtml(value(item.stageItem))+'</strong><span>'+escapeHtml(value(item.source))+'</span></div></article>').join('')+'</div></section>'
      +'<section class="sanctuary-management-transition-section"><header><h3>6-6 롤백·전환 대상</h3>'+transitionStatus(report.rollback?.restored===true?'PASS':'PENDING')+'</header><p>'+(report.rollback?.restored===true?'PILOT → CLOSED → PILOT 복구가 운영 환경에서 확인되었습니다.':'운영 롤백 복구 연습이 아직 기록되지 않았습니다.')+'</p><div class="sanctuary-management-transition-targets">'+transitionTargetGroup('유지',report.targets?.preserve)+transitionTargetGroup('이관',report.targets?.migrate)+transitionTargetGroup('보관·해산',report.targets?.archive)+transitionTargetGroup('초기화',report.targets?.initialize)+transitionTargetGroup('중지',report.targets?.stop)+'</div><p class="sanctuary-management-transition-policy">'+escapeHtml(value(report.targets?.executionPolicy))+'</p></section>'
      +approvalHtml+'</div><footer><button class="kinojo-btn secondary" type="button" data-operation-close>닫기</button>'+(ready&&!approved?'<button class="kinojo-btn" type="button" data-transition-approve disabled>전환 범위 승인</button>':'')+'</footer></section>';
  }

  function bindTransitionApproval(report){
    const section=operationLayer?.querySelector('[data-transition-approval]');const button=operationLayer?.querySelector('[data-transition-approve]');
    if(!section||!button)return;
    const checks=Array.from(section.querySelectorAll('input[type="checkbox"]'));const confirmation=section.querySelector('input[type="text"]');const state=section.querySelector('[data-transition-approval-state]');
    const update=()=>{const checkedCount=checks.filter(item=>item.checked).length;const confirmationValue=value(confirmation?.value);const phraseReady=confirmationValue==='전환 범위 승인';const ready=checks.length===5&&checkedCount===5&&phraseReady;button.disabled=!ready;if(state){state.classList.remove('is-error');state.classList.toggle('is-ready',ready);state.textContent=ready?'5/5 범위와 확인 문구가 일치합니다. 승인할 수 있으며 Stage 7 실행은 별도 단계입니다.':checkedCount<5?checkedCount+'/5 범위를 확인했습니다. 남은 '+(5-checkedCount)+'개 범위를 확인해 주세요.':confirmationValue?'5/5 범위를 확인했습니다. 확인 문구가 일치하지 않습니다.':'5/5 범위를 확인했습니다. 확인 문구 “전환 범위 승인”을 입력해 주세요.';}};
    checks.forEach(input=>input.addEventListener('change',update));confirmation?.addEventListener('input',update);confirmation?.addEventListener('compositionend',update);update();
    button.addEventListener('click',async()=>{
      if(button.disabled)return;button.disabled=true;button.textContent='승인 기록 중';if(state)state.textContent='Server에서 범위 해시와 검증 결과를 다시 확인하고 있습니다.';
      try{const result=await ServerAdapter.approveTransition(value(report.scheduleComparison?.month)||selectedMonth,report,value(confirmation?.value));window.KinojoToast?.success?.(value(result.message)||'전환 범위가 승인되었습니다.');closeOperationLayer();await load();}
      catch(error){button.textContent='전환 범위 승인';button.disabled=false;if(state){state.textContent=value(error?.message)||'전환 범위를 승인하지 못했습니다.';state.classList.remove('is-ready');state.classList.add('is-error');}}
    });
  }

  async function openTransitionReview(opener){
    openOperationLayer(opener,'<section class="sanctuary-management-operation-dialog is-transition" role="dialog" aria-modal="true" aria-labelledby="sanctuaryTransitionLoading" tabindex="-1"><header><span>STAGE 6 · PARALLEL OPERATION</span><h2 id="sanctuaryTransitionLoading">병행 운영·전환 검수</h2><p>Server에서 비교·운영·복구·초기화 범위를 계산합니다.</p></header><div class="sanctuary-management-operation-loading">전환 검수 자료를 불러오는 중입니다.</div><footer><button class="kinojo-btn secondary" type="button" data-operation-close>닫기</button></footer></section>');
    try{const report=await ServerAdapter.transitionReport(selectedMonth);if(operationLayer?.hidden)return;openOperationLayer(opener,transitionReportMarkup(report));bindTransitionApproval(report);}
    catch(error){if(operationLayer?.hidden)return;openOperationLayer(opener,'<section class="sanctuary-management-operation-dialog is-transition" role="dialog" aria-modal="true" aria-labelledby="sanctuaryTransitionError" tabindex="-1"><header><span>STAGE 6 · PARALLEL OPERATION</span><h2 id="sanctuaryTransitionError">전환 검수 자료를 불러오지 못했습니다.</h2><p>'+escapeHtml(value(error?.message)||'잠시 후 다시 시도해 주세요.')+'</p></header><footer><button class="kinojo-btn secondary" type="button" data-operation-close>닫기</button></footer></section>');}
  }

  function renderTransitionReview(data){
    const button=byId('sanctuaryManagementTransitionReview');const state=byId('sanctuaryManagementAdminState')?.querySelector('span');const review=data.transitionReview||{};
    if(!button)return;
    button.hidden=!review.canReview;
    if(!review.canReview){if(state)state.textContent='권한이 있는 팀은 편집·카드 이동·팀 해산을 사용할 수 있습니다.';return;}
    button.textContent=review.approved?'전환 승인됨':'전환 검수';button.classList.toggle('is-approved',review.approved);
    if(state)state.textContent=review.approved?'전환 범위가 승인되었습니다. Stage 7 실행 전 다시 검증합니다.':review.unresolvedCount?'병행 운영 검수 '+transitionCount(review.unresolvedCount)+'건이 남아 있습니다.':'비교·복구 결과를 확인하고 전환 범위를 승인할 수 있습니다.';
  }

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

  function applyDeepLink(){
    if(deepLinkApplied||!bootstrapData)return;const params=new URLSearchParams(location.search);const teamId=Number(params.get('team')||0);if(!teamId)return;
    const team=selectedDraftTeam(teamId);if(!team)return;deepLinkApplied=true;
    const card=byId('sanctuaryManagementTeamList')?.querySelector('[data-sanctuary-team="'+CSS.escape(String(teamId))+'"]');card?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});card?.classList.add('is-deep-linked');setTimeout(()=>card?.classList.remove('is-deep-linked'),2400);
    if(params.get('support')==='1'&&bootstrapData.writeEnabled){const forceId=Number(params.get('force')||team.forces?.find(force=>force.canSupport)?.forceId||0);const trigger=card?.querySelector('[data-sanctuary-support-force="'+CSS.escape(String(forceId))+'"]');if(trigger)setTimeout(()=>window.KinojoSanctuaryManagementSupportUI?.open?.(team,forceId,trigger),180);}
  }

  function renderBootstrap(data){
    bootstrapData=data;
    selectedSanctuary=resolveInitialSelection(data);
    byId('sanctuaryManagementContract').textContent=contractLabel(data);
    byId('sanctuaryManagementSource').textContent='Server';
    setFlagState('sanctuaryManagementReadState',data.readEnabled);
    renderWriteState(data);
    renderScope();
    renderSelectedSanctuary();
    renderTeams();
    renderTransitionReview(data);
    loadMonth(selectedMonth);
    byId('sanctuaryManagementContent').hidden=false;
    if(data.readEnabled){
      if(data.rollout.mode==='PILOT'&&data.writeEnabled){
        setAccess('ready','성역 관리 시험 운영이 활성화되었습니다.','승인된 시험 사용자로 팀 생성·참여·편집·해산을 검수할 수 있습니다. 기존 성역·스케줄은 그대로 유지됩니다.');
      }else if(data.rollout.mode==='PILOT'){
        setAccess('ready','성역 관리 시험 운영을 읽기 전용으로 확인할 수 있습니다.','신규 쓰기는 승인된 시험 사용자만 사용할 수 있습니다. 기존 성역·스케줄 이용에는 영향이 없습니다.');
      }else{
        setAccess('ready','성역 팀과 참여 모집이 연결되었습니다.',data.writeEnabled?'로그인 이용자는 팀 생성·참여 지원을 사용할 수 있고, 권한 보유자는 팀 편집·해산·승인을 처리할 수 있습니다.':'현재 읽기 전용 상태입니다.');
      }
    }else{
      setAccess('rollout','Server 연결은 완료됐고 실제 팀 읽기는 준비 중입니다.','신규 read/write 플래그는 그대로 비활성 상태이며 기존 성역·스케줄·시트 데이터는 변경하지 않습니다.');
    }
    if(data.serverTime)window.dispatchEvent(new CustomEvent('kinojo:page-time',{detail:{value:data.serverTime,label:'Server'}}));
    requestAnimationFrame(applyDeepLink);
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
      selectedSanctuary=value(button.dataset.sanctuaryScope)||sanctuaryKey(bootstrapData.sanctuaries[0]);
      syncLocation();
      byId('sanctuaryManagementScope').querySelectorAll('[data-sanctuary-scope]').forEach(item=>item.setAttribute('aria-pressed',item.dataset.sanctuaryScope===selectedSanctuary?'true':'false'));
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
    byId('sanctuaryManagementTransitionReview')?.addEventListener('click',event=>{if(!bootstrapData?.transitionReview?.canReview)return;openTransitionReview(event.currentTarget);});
    byId('sanctuaryManagementTeamList')?.addEventListener('click',event=>{
      const support=event.target.closest('[data-sanctuary-support-force]');
      if(support){if(!bootstrapData?.writeEnabled||support.disabled)return;const team=selectedDraftTeam(support.dataset.sanctuarySupportTeam);if(team)window.KinojoSanctuaryManagementSupportUI?.open?.(team,Number(support.dataset.sanctuarySupportForce),support);return;}
      const edit=event.target.closest('[data-sanctuary-edit-team]');
      if(edit&&!edit.disabled){const team=selectedDraftTeam(edit.dataset.sanctuaryEditTeam);if(team)window.KinojoSanctuaryManagementDraftUI?.openDraft?.(team,edit);return;}
      const schedule=event.target.closest('[data-sanctuary-schedule-team]');
      if(schedule&&!schedule.disabled){const team=selectedDraftTeam(schedule.dataset.sanctuaryScheduleTeam);if(team)openScheduleOperation(team,schedule);return;}
      const archive=event.target.closest('[data-sanctuary-archive-team]');
      if(!archive||archive.disabled)return;
      const team=selectedDraftTeam(archive.dataset.sanctuaryArchiveTeam);if(!team)return;
      openArchiveOperation(team,archive);
    });
    byId('sanctuaryManagementScheduleState')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-sanctuary-month-shift]');if(!button)return;loadMonth(shiftedMonth(Number(button.dataset.sanctuaryMonthShift)||0));
    });
    byId('sanctuaryManagementScheduleState')?.addEventListener('click',event=>{
      const item=event.target.closest('[data-sanctuary-calendar-team]');if(!item)return;const team=selectedDraftTeam(item.dataset.sanctuaryCalendarTeam);if(!team)return;
      const card=byId('sanctuaryManagementTeamList')?.querySelector('[data-sanctuary-team="'+CSS.escape(String(team.teamId))+'"]');card?.scrollIntoView({behavior:'smooth',block:'center'});if(bootstrapData?.writeEnabled&&team.canEdit)openScheduleOperation(team,item,value(item.dataset.sanctuaryCalendarDate));
    });
    window.addEventListener('kinojo:auth-changed',load);
    load();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();
