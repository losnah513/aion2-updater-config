(function(){
  'use strict';

  const API_VERSION=2.2;
  const SCHEMA_VERSION=452;
  const SLOT_CLASS_CODES=Object.freeze(['ALL','TEMPLAR','GLADIATOR','ASSASSIN','RANGER','SORCERER','ELEMENTALIST','CLERIC','CHANTER','FIGHTER']);
  const CLASS_ICON_MAP=Object.freeze({'수호성':'templar','검성':'gladiator','살성':'assassin','궁성':'ranger','마도성':'sorcerer','정령성':'elementalist','치유성':'cleric','호법성':'chanter','권성':'fighter'});
  const CLASS_NAME_BY_CODE=Object.freeze({TEMPLAR:'수호성',GLADIATOR:'검성',ASSASSIN:'살성',RANGER:'궁성',SORCERER:'마도성',ELEMENTALIST:'정령성',CLERIC:'치유성',CHANTER:'호법성',FIGHTER:'권성'});
  const POWER_ICON_URL='https://assets.playnccdn.com/static-aion2/characters/img/info/profile_power_icon_pc.png';
  const BACKGROUND_CHECK_INTERVAL=60000;
  let requestSequence=0;
  let monthRequestSequence=0;
  let bootstrapData=null;
  let pendingBootstrapData=null;
  let currentBootstrapFingerprint='';
  let backgroundCheckActive=false;
  let monthData=null;
  let selectedSanctuary='';
  let sanctuaryMasterData=null;
  let selectedMonth=new Date(Date.now()+9*60*60*1000).toISOString().slice(0,7);
  let operationLayer=null;
  let operationOpener=null;
  let forceOverviewLayer=null;
  let forceOverviewOpener=null;
  let forceOverviewTeamId=0;
  let forceOverviewForceId=0;
  let deepLinkApplied=false;
  let currentAuthProjection='';

  const byId=id=>document.getElementById(id);
  const value=value=>String(value??'').trim();
  const integer=input=>Number.isSafeInteger(Number(input))?Number(input):0;
  const escapeHtml=input=>String(input??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function classIconFor(className){const key=CLASS_ICON_MAP[value(className).replace(/[\s\u200B-\u200D\uFEFF]+/g,'').replace(/[\[(（].*?[\])）]\s*$/g,'')];return key?'/assets/images/classes/class_icon_'+key+'.png':'';}

  function contractSupported(data){
    const api=Number(data?.apiVersion),schema=Number(data?.schemaVersion);
    return api===API_VERSION&&schema===SCHEMA_VERSION||api===2.1&&schema===451||api===2&&schema===450||api===1.9&&schema===449||api===1.8&&schema===446;
  }
  function combatPowerValue(input){const power=Number(input);return Number.isFinite(power)&&power>0?Math.round(power):0;}
  function itemLevelValue(input){const level=Number(input);return Number.isFinite(level)&&level>0?Math.round(level):0;}
  function formatCombatPower(input){const power=combatPowerValue(input);return power?(power/1000).toFixed(1)+'K':'—';}
  function combatPowerMarkup(input,prefix=''){return '<span class="sanctuary-management-power-value" title="전투력 '+escapeHtml(formatCombatPower(input))+'">'+(prefix?'<span>'+escapeHtml(prefix)+'</span>':'')+'<img src="'+POWER_ICON_URL+'" alt="전투력"><b>'+escapeHtml(formatCombatPower(input))+'</b></span>';}
  function validateCombatPower(item){
    const source=item&&typeof item==='object'&&!Array.isArray(item)?item:{};
    const power={average:combatPowerValue(source.average),total:combatPowerValue(source.total),knownCount:integer(source.knownCount),occupiedCount:integer(source.occupiedCount),unknownCount:integer(source.unknownCount)};
    if(power.knownCount<0||power.occupiedCount<0||power.unknownCount<0||power.knownCount+power.unknownCount!==power.occupiedCount)throw new Error('성역 관리 전투력 집계가 올바르지 않습니다.');
    return power;
  }
  function validateRequirements(item,capacity){
    const source=item&&typeof item==='object'&&!Array.isArray(item)?item:{};
    const rules=(Array.isArray(source.rules)?source.rules:[]).map(rule=>({
      compositionRuleId:integer(rule?.compositionRuleId),scopeType:value(rule?.scopeType).toUpperCase(),ruleType:value(rule?.ruleType).toUpperCase(),
      minimumCount:integer(rule?.minimumCount),powerThreshold:combatPowerValue(rule?.powerThreshold),itemLevelThreshold:itemLevelValue(rule?.itemLevelThreshold),matchingCount:integer(rule?.matchingCount),
      satisfied:rule?.satisfied===true,message:value(rule?.message)
    }));
    if(rules.some(rule=>!['FORCE','PARTY'].includes(rule.scopeType)||!['MAIN_MIN','POWER_MIN','ITEM_LEVEL_MIN'].includes(rule.ruleType)||rule.minimumCount<1||rule.minimumCount>capacity||rule.matchingCount<0||rule.matchingCount>capacity||rule.satisfied!==(rule.matchingCount>=rule.minimumCount)||rule.ruleType==='POWER_MIN'&&(!rule.powerThreshold||rule.itemLevelThreshold)||rule.ruleType==='ITEM_LEVEL_MIN'&&(!rule.itemLevelThreshold||rule.powerThreshold)||rule.ruleType==='MAIN_MIN'&&(rule.powerThreshold||rule.itemLevelThreshold)))throw new Error('성역 관리 포스 구성 조건이 올바르지 않습니다.');
    const unsatisfiedCount=rules.filter(rule=>!rule.satisfied).length;
    const result={satisfied:unsatisfiedCount===0,ruleCount:rules.length,unsatisfiedCount,rules};
    if(source.ruleCount!=null&&integer(source.ruleCount)!==result.ruleCount||source.unsatisfiedCount!=null&&integer(source.unsatisfiedCount)!==result.unsatisfiedCount||source.satisfied!=null&&(source.satisfied===true)!==result.satisfied)throw new Error('성역 관리 포스 구성 조건 집계가 올바르지 않습니다.');
    return result;
  }

  function validateSlot(item){
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('성역 관리 슬롯 데이터가 올바르지 않습니다.');
    const occupied=item.occupied===true;
    const assignmentKind=value(item.assignmentKind||'ACTUAL_CHARACTER').toUpperCase();
    const requiredClassCode=value(item.requiredClassCode||'ALL').toUpperCase();
    const placementLocked=item.placementLocked===true;
    const character=item.character&&typeof item.character==='object'&&!Array.isArray(item.character)?Object.assign({},item.character,{power:combatPowerValue(item.character.power??item.character.latestPveCombatPower??item.character.latest_pve_combat_power),itemLevel:itemLevelValue(item.character.itemLevel??item.character.latestPveItemLevel??item.character.latest_pve_item_level)}):null;
    if(occupied!==Boolean(character))throw new Error('성역 관리 슬롯 점유 상태가 일치하지 않습니다.');
    const slot=Object.assign({},item,{
      slotId:integer(item.slotId),
      slotNo:integer(item.slotNo),
      revision:integer(item.revision),
      assignmentKind,
      requiredClassCode,
      requiredClassName:value(item.requiredClassName),
      placementLocked,
      occupied,
      character
    });
    const actualValid=assignmentKind==='ACTUAL_CHARACTER'&&(!occupied||integer(character?.characterId)>0&&value(character?.name));
    const randomValid=assignmentKind==='RANDOM_ALT'&&occupied&&integer(character?.mainCharacterId)>0&&value(character?.name)&&character?.isRandomAlt===true&&requiredClassCode==='ALL';
    if(slot.slotId<1||slot.slotNo<1||slot.revision<1||!SLOT_CLASS_CODES.includes(requiredClassCode)||!['ACTUAL_CHARACTER','RANDOM_ALT'].includes(assignmentKind)||!(actualValid||randomValid)||placementLocked&&!occupied){
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
      combatPower:validateCombatPower(item.combatPower),
      requirements:validateRequirements(item.requirements,5),
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
      isMain:item.isMain===true,
      ownerMemberId:integer(item.ownerMemberId)
      ,power:combatPowerValue(item.power??item.latestPveCombatPower??item.latest_pve_combat_power)
      ,itemLevel:itemLevelValue(item.itemLevel??item.latestPveItemLevel??item.latest_pve_item_level)
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
      classCode:value(item.classCode).toUpperCase(),
      availableForceIds:Array.isArray(item.availableForceIds)?item.availableForceIds.map(integer).filter(id=>id>0):[],
      disabledCode:value(item.disabledCode),disabledMessage:value(item.disabledMessage),
      conflicts:Array.isArray(item.conflicts)?item.conflicts.filter(conflict=>conflict&&typeof conflict==='object'):[],
      power:combatPowerValue(item.power??item.latestPveCombatPower??item.latest_pve_combat_power),
      itemLevel:itemLevelValue(item.itemLevel??item.latestPveItemLevel??item.latest_pve_item_level)
    });
    if(character.characterId<1||character.mainCharacterId<1||character.serverId<1||!character.characterName||!character.serverName||!['MAIN','ALT'].includes(character.relation))throw new Error('지원 캐릭터 식별 정보가 올바르지 않습니다.');
    if(new Set(character.availableForceIds).size!==character.availableForceIds.length)throw new Error('지원 가능한 포스 정보가 중복되었습니다.');
    return character;
  }

  function validateRandomSupportCharacter(item){
    if(!item||typeof item!=='object'||Array.isArray(item))return null;
    const candidate=Object.assign({},item,{
      assignmentKind:'RANDOM_ALT',characterId:integer(item.characterId),mainCharacterId:integer(item.mainCharacterId),
      serverId:integer(item.serverId),characterName:value(item.characterName),serverName:value(item.serverName),
      relation:'RANDOM_ALT',isMain:false,isRandomAlt:true,eligibleAltCount:integer(item.eligibleAltCount),
      availableForceIds:Array.isArray(item.availableForceIds)?item.availableForceIds.map(integer).filter(id=>id>0):[]
    });
    if(candidate.mainCharacterId<1||candidate.serverId<1||!candidate.characterName||!candidate.serverName||candidate.eligibleAltCount<1||new Set(candidate.availableForceIds).size!==candidate.availableForceIds.length)throw new Error('랜덤 부캐 지원 후보가 올바르지 않습니다.');
    return candidate;
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

  function validateForce(item,options={}){
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
      combatPower:validateCombatPower(item.combatPower),
      requirements:validateRequirements(item.requirements,10),
      parties
    });
    const occupiedCount=parties.reduce((sum,party)=>sum+party.occupiedCount,0);
    const candidateIds=new Set(force.creatorCandidates.map(candidate=>candidate.characterId));
    const publicRead=options.publicRead===true;
    if(force.forceId<1||force.capacity!==10||force.revision<1||force.occupiedCount!==occupiedCount||force.vacancyCount!==force.capacity-occupiedCount||(!publicRead&&force.creatorMemberId<1)||force.creatorCandidateCount!==force.creatorCandidates.length||candidateIds.size!==force.creatorCandidates.length||(!force.creatorOwnerResolved&&force.creatorCandidates.length)||(force.creatorAlreadyAssigned&&force.creatorCandidates.length)){
      throw new Error('성역 관리 포스 인원 집계가 올바르지 않습니다.');
    }
    return force;
  }

  function validateTeam(item,options={}){
    if(!item||typeof item!=='object'||Array.isArray(item)||!Array.isArray(item.forces))throw new Error('성역 관리 팀 편성 데이터가 올바르지 않습니다.');
    const forces=item.forces.map(force=>validateForce(force,options)).sort((left,right)=>left.forceNo-right.forceNo);
    if(forces.length<1||forces.length>9||forces.some((force,index)=>force.forceNo!==index+1))throw new Error('성역 관리 포스 순서가 올바르지 않습니다.');
    const team=Object.assign({},item,{
      schedule:item.schedule&&typeof item.schedule==='object'&&!Array.isArray(item.schedule)?Object.assign({},item.schedule):null,
      forceCount:integer(item.forceCount),
      slotCount:integer(item.slotCount),
      occupiedCount:integer(item.occupiedCount),
      vacancyCount:integer(item.vacancyCount),
      forces,
      difficulty:value(item.difficulty||'NORMAL').toUpperCase(),
      minimumItemLevel:item.minimumItemLevel==null?null:itemLevelValue(item.minimumItemLevel),
      supportCharacters:item.supportCharacters&&typeof item.supportCharacters==='object'&&!Array.isArray(item.supportCharacters)?{
        ownerResolved:item.supportCharacters.ownerResolved===true,
        code:value(item.supportCharacters.code),
        candidateCount:integer(item.supportCharacters.candidateCount),
        minimumItemLevel:item.supportCharacters.minimumItemLevel==null?null:itemLevelValue(item.supportCharacters.minimumItemLevel),
        characters:Array.isArray(item.supportCharacters.characters)?item.supportCharacters.characters.map(validateSupportCharacter):[],
        randomAltCandidate:validateRandomSupportCharacter(item.supportCharacters.randomAltCandidate)
      }:{ownerResolved:false,code:'MISSING',candidateCount:0,minimumItemLevel:null,characters:[],randomAltCandidate:null},
      supportBatches:Array.isArray(item.supportBatches)?item.supportBatches.map(validateSupportBatch):[],
      canEdit:item.canEdit===true,
      canArchive:item.canArchive===true,
      scheduleEditScopes:Array.isArray(item.scheduleEditScopes)?item.scheduleEditScopes.map(value):[]
    });
    const slotCount=forces.reduce((sum,force)=>sum+force.capacity,0);
    const occupiedCount=forces.reduce((sum,force)=>sum+force.occupiedCount,0);
    if(!['NORMAL','HARD'].includes(team.difficulty)||team.forceCount!==forces.length||team.slotCount!==slotCount||team.occupiedCount!==occupiedCount||team.vacancyCount!==slotCount-occupiedCount||team.supportCharacters.candidateCount!==team.supportCharacters.characters.length){
      throw new Error('성역 관리 팀 인원 집계가 올바르지 않습니다.');
    }
    return team;
  }

  function validateBootstrap(data){
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('성역 관리 Server 응답이 올바르지 않습니다.');
    if(!contractSupported(data)){
      throw new Error('성역 관리 Server 계약 버전이 일치하지 않습니다.');
    }
    if(!Array.isArray(data.sanctuaries)||!Array.isArray(data.teams))throw new Error('성역 관리 Server 데이터 형식이 올바르지 않습니다.');
    const publicRead=data.publicRead===true;
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
      executed:sourceTransition.executed===true,
      completed:sourceTransition.completed===true,
      runId:sourceTransition.runId==null?null:integer(sourceTransition.runId),
      stage7State:value(sourceTransition.stage7State),
      scopeHash:value(sourceTransition.scopeHash),
      unresolvedCount:integer(sourceTransition.unresolvedCount)
    };
    if(transitionReview.canReview&&(!/^[0-9a-f]{64}$/.test(transitionReview.scopeHash)||transitionReview.unresolvedCount<0)){
      throw new Error('성역 관리 전환 검수 상태가 올바르지 않습니다.');
    }
    if(transitionReview.completed&&transitionReview.stage7State!=='COMPLETE'){
      throw new Error('성역 관리 전환 완료 상태가 Server 응답과 일치하지 않습니다.');
    }
    const composerSource=data.composerCharacters&&typeof data.composerCharacters==='object'&&!Array.isArray(data.composerCharacters)?data.composerCharacters:{};
    const composerCharacters={
      ownerResolved:composerSource.ownerResolved===true,
      code:value(composerSource.code)||'MISSING',
      candidateCount:integer(composerSource.candidateCount),
      characters:Array.isArray(composerSource.characters)?composerSource.characters.map(validateCreatorCandidate):[]
    };
    if(composerCharacters.candidateCount!==composerCharacters.characters.length||new Set(composerCharacters.characters.map(item=>item.characterId)).size!==composerCharacters.characters.length)throw new Error('팀 편성용 내 캐릭터 목록이 올바르지 않습니다.');
    return {
      apiVersion:Number(data.apiVersion),
      schemaVersion:Number(data.schemaVersion),
      serverTime:value(data.serverTime),
      publicRead,
      readEnabled:data.readEnabled===true,
      writeEnabled:data.writeEnabled===true,
      globalWriteEnabled:data.globalWriteEnabled===true,
      rollout,
      transitionReview,
      actor:data.actor&&typeof data.actor==='object'?data.actor:{},
      composerCharacters,
      sanctuaries:data.sanctuaries.filter(item=>item&&typeof item==='object'),
      teams:data.teams.filter(item=>item&&typeof item==='object').map(item=>validateTeam(item,{publicRead}))
    };
  }

  function validateCharacterCard(item){
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('캐릭터 조회 결과가 올바르지 않습니다.');
    const card=Object.assign({},item,{
      characterId:integer(item.characterId),serverId:integer(item.serverId),raceId:integer(item.raceId),
      mainCharacterId:integer(item.mainCharacterId),ownerMemberId:integer(item.ownerMemberId),
      characterName:value(item.characterName),serverName:value(item.serverName),className:value(item.className),
      legionName:value(item.legionName),profileImageUrl:value(item.profileImageUrl),relation:value(item.relation).toUpperCase(),
      isOperationalLegion:item.isOperationalLegion===true,
      canSelectAlts:item.canSelectAlts===true,
      power:combatPowerValue(item.power??item.latestPveCombatPower??item.latest_pve_combat_power),
      itemLevel:itemLevelValue(item.itemLevel??item.latestPveItemLevel??item.latest_pve_item_level)
    });
    if(card.characterId<1||card.serverId<1||!card.characterName||!card.serverName||!['MAIN','ALT','GUEST'].includes(card.relation))throw new Error('캐릭터 조회 식별 정보가 올바르지 않습니다.');
    return card;
  }

  function validateCharacterSearch(data){
    if(!data||typeof data!=='object'||data.ok!==true||!contractSupported(data))throw new Error(value(data?.message)||'캐릭터 검색 Server 계약이 올바르지 않습니다.');
    if(value(data.source)==='CHARACTER_MASTER')return Object.assign({},data,{character:validateCharacterCard(data.character)});
    if(value(data.source)!=='OFFICIAL'||!data.candidate||typeof data.candidate!=='object')throw new Error('공식 캐릭터 조회 결과가 올바르지 않습니다.');
    const candidate=Object.assign({},data.candidate,{
      candidateId:value(data.candidate.candidateId),characterName:value(data.candidate.characterName),serverId:integer(data.candidate.serverId),raceId:integer(data.candidate.raceId),
      serverName:value(data.candidate.serverName),className:value(data.candidate.className),legionName:value(data.candidate.legionName),profileImageUrl:value(data.candidate.profileImageUrl),
      isOperationalLegion:data.candidate.isOperationalLegion===true,
      allowedRelations:Array.isArray(data.candidate.allowedRelations)?data.candidate.allowedRelations.map(item=>value(item).toUpperCase()):[],
      power:combatPowerValue(data.candidate.power??data.candidate.pveCombatPower),
      itemLevel:itemLevelValue(data.candidate.itemLevel??data.candidate.pveItemLevel)
    });
    if(!candidate.candidateId||candidate.serverId<1||!candidate.characterName||!candidate.serverName||!candidate.allowedRelations.length||candidate.allowedRelations.some(item=>!['MAIN','ALT','GUEST'].includes(item)))throw new Error('공식 캐릭터 관계 정보가 올바르지 않습니다.');
    return Object.assign({},data,{candidate});
  }

  function validateLinkedAlts(data){
    if(!data||typeof data!=='object'||data.ok!==true||!contractSupported(data)||!data.mainCharacter||typeof data.mainCharacter!=='object'||!Array.isArray(data.characters))throw new Error(value(data?.message)||'연결된 부캐 목록이 올바르지 않습니다.');
    const main={characterId:integer(data.mainCharacter.characterId),characterName:value(data.mainCharacter.characterName),serverId:integer(data.mainCharacter.serverId),serverName:value(data.mainCharacter.serverName),ownerMemberId:integer(data.mainCharacter.ownerMemberId)};
    if(main.characterId<1||!main.characterName)throw new Error('연결된 본캐 식별 정보가 올바르지 않습니다.');
    const characters=data.characters.map(validateCharacterCard);
    const random=data.randomCandidate?Object.assign({},data.randomCandidate, {assignmentKind:'RANDOM_ALT',mainCharacterId:integer(data.randomCandidate?.mainCharacterId),ownerMemberId:integer(data.randomCandidate?.ownerMemberId),characterName:value(data.randomCandidate?.characterName),serverId:integer(data.randomCandidate?.serverId),serverName:value(data.randomCandidate?.serverName),relation:'ALT',isMain:false,isRandomAlt:true,power:0,itemLevel:0}):null;
    if(random&&(random.mainCharacterId!==main.characterId||random.ownerMemberId<1||!random.characterName))throw new Error('랜덤 부캐 후보 정보가 올바르지 않습니다.');
    return Object.assign({},data,{mainCharacter:main,randomCandidate:random,characters});
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
      if(!result||typeof result!=='object'||result.ok!==true||!contractSupported(result)||!Array.isArray(result.occurrences)||!Array.isArray(result.weekStarts))throw new Error(value(result?.message)||'월간 일정 Server 계약이 올바르지 않습니다.');
      return Object.assign({},result,{month:value(result.month),rangeStart:value(result.rangeStart),rangeEnd:value(result.rangeEnd),weekStarts:result.weekStarts.map(value),occurrences:result.occurrences.filter(item=>item&&typeof item==='object')});
    },
    async transitionReport(month){
      const api=window.KinojoSupabase;
      if(!api||typeof api.getSanctuaryManagementTransitionReport!=='function')throw new Error('전환 검수 Server 어댑터를 불러오지 못했습니다.');
      const result=await api.getSanctuaryManagementTransitionReport(value(month));
      if(!result||typeof result!=='object'||result.ok!==true||!contractSupported(result)||!result.targets||typeof result.targets!=='object'||!Array.isArray(result.evidence)||!result.operations||typeof result.operations!=='object'||!/^[0-9a-f]{64}$/.test(value(result.scopeHash))){
        throw new Error(value(result?.message)||'전환 검수 Server 계약이 올바르지 않습니다.');
      }
      return result;
    },
    async approveTransition(month,report,confirmation){
      const api=window.KinojoSupabase;
      if(!api||typeof api.approveSanctuaryManagementTransition!=='function')throw new Error('전환 승인 Server 어댑터를 불러오지 못했습니다.');
      const result=await api.approveSanctuaryManagementTransition(value(month),value(report?.scopeHash),report?.targets,value(confirmation));
      if(!result||typeof result!=='object'||result.ok!==true||result.approved!==true||!contractSupported(result))throw new Error(value(result?.message)||'전환 범위를 승인하지 못했습니다.');
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
      if(!result||result.ok!==true||!contractSupported(result))throw new Error(value(result?.message)||'팀 해산 영향을 확인하지 못했습니다.');
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
    const memberId=integer(combined.memberId||combined.member_id||combined.id||combined.userId||combined.user_id);
    const role=value(combined.role||combined.grade||combined.permission).toUpperCase();
    return {loggedIn,canEdit,projection:loggedIn?['MEMBER',memberId||'pending',role||'pending',canEdit?'edit':'read'].join(':'):'PUBLIC'};
  }

  function setAccess(state,title,message,action){
    const region=byId('sanctuaryManagementAccess');
    if(!region)return;
    const folded=state==='ready'||state==='rollout';
    region.hidden=folded;
    region.dataset.state=state;
    region.setAttribute('aria-busy',state==='loading'?'true':'false');
    byId('sanctuaryManagementAccessTitle').textContent=title;
    byId('sanctuaryManagementAccessMessage').textContent=message;
    const button=byId('sanctuaryManagementAccessAction');
    button.hidden=!action;
    button.textContent=action==='login'?'로그인':action==='back'?'성역으로 돌아가기':'다시 시도';
    button.dataset.action=action||'';
    const summary=byId('sanctuaryManagementConnectionCard');
    if(summary){
      summary.dataset.state=state;
      byId('sanctuaryManagementConnectionState').textContent=state==='ready'?'연결됨':state==='rollout'?'준비 중':'확인 중';
      const summaryTitle=byId('sanctuaryManagementConnectionTitle');
      const summaryMessage=byId('sanctuaryManagementConnectionMessage');
      summaryTitle.textContent=title;
      summaryTitle.title=title;
      summaryMessage.textContent=message;
      summaryMessage.title=message;
    }
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
  const SANCTUARY_BANNER_FALLBACK=Object.freeze({
    rudra:Object.freeze({image:'/assets/images/sanctuary/backgrounds/rudra.webp',bossName:'루드라'}),
    bagot:Object.freeze({image:'/assets/images/sanctuary/backgrounds/bagot.webp',bossName:'중합체 바고트'}),
    kaldrix:Object.freeze({image:'/assets/images/sanctuary/backgrounds/kaldrix.webp',bossName:'지저의 재앙 칼드릭스'})
  });
  function sanctuaryMasterForSelection(){return sanctuaryMasterData?.items?.find(item=>sanctuaryKey(item)===selectedSanctuary)||null;}
  function safeHeroImage(input){const image=value(input);return image&&(image.startsWith('/')||image.startsWith('https://'))?image.replace(/["'()]/g,encodeURIComponent):'';}
  function renderSanctuaryBanner(){
    const item=sanctuaryForSelection();if(!item)return;
    const master=sanctuaryMasterForSelection()||{};
    const code=sanctuaryKey(item);const order=sanctuaryOrder(item);const fallback=SANCTUARY_BANNER_FALLBACK[code]||{};
    const image=safeHeroImage(master.bannerImage||item.bannerImage||fallback.image);
    const background=value(master.cardBackground||item.cardBackground);
    const bg=byId('sanctuaryManagementHeroBg');
    if(bg){
      bg.style.background='';bg.style.backgroundImage='';
      if(image)bg.style.backgroundImage='url("'+image+'")';
      else if(/^(radial-gradient|linear-gradient)\(/i.test(background)&&!/[;{}]/.test(background))bg.style.background=background;
    }
    const hero=byId('sanctuaryManagementHero');if(hero)hero.dataset.sanctuaryCode=code;
    byId('sanctuaryManagementHeroKicker').textContent='성역 '+order;
    byId('sanctuaryManagementTitle').textContent=sanctuaryOfficialName(item)||value(master.name)||sanctuaryLabel(item);
    const boss=value(master.bossName||item.bossName||fallback.bossName);
    byId('sanctuaryManagementHeroSub').textContent=boss?'Boss. '+boss+' · 성역 '+order:'성역 '+order+' · 팀·포스 운영 관리';
  }
  function acceptSanctuaryMaster(payload){if(!Array.isArray(payload?.items))return;sanctuaryMasterData=payload;if(bootstrapData)renderSanctuaryBanner();}

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
    if(data.publicRead){
      label='로그인 필요';
      detail='팀·일정 공개 · 쓰기는 로그인 후';
    }else if(rollout.mode==='PILOT'){
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

  function bootstrapFingerprint(data){
    return JSON.stringify({
      readEnabled:data?.readEnabled===true,writeEnabled:data?.writeEnabled===true,globalWriteEnabled:data?.globalWriteEnabled===true,
      rollout:data?.rollout||{},actor:data?.actor||{},composerCharacters:data?.composerCharacters||{},sanctuaries:data?.sanctuaries||[],teams:data?.teams||[]
    });
  }

  function renderRefreshIndicator(hasUpdate,checking=false){
    const card=byId('sanctuaryManagementRefreshCard');
    const state=byId('sanctuaryManagementRefreshState');
    const meta=byId('sanctuaryManagementRefreshMeta');
    const action=byId('sanctuaryManagementRefreshAction');
    if(!card||!state||!meta||!action)return;
    card.classList.toggle('has-update',hasUpdate);
    card.classList.toggle('is-checking',checking);
    state.textContent=checking?'확인 중':hasUpdate?'새 내용':'최신';
    meta.textContent=hasUpdate?'새로운 내용이 추가되었습니다.':checking?'백그라운드에서 확인하고 있습니다.':'변경 없음';
    action.hidden=!hasUpdate;
    action.disabled=checking;
  }

  function teamModeLabel(team){return value(team.mode)==='FIXED'?'고정 팀':value(team.mode)==='PARTICIPATION'?'참여 팀':value(team.mode)||'팀';}
  function teamStatusLabel(team){
    const status=value(team.status);
    return ({DRAFT:'DRAFT',ACTIVE:'운영 중',FULL:'모집 완료',ARCHIVED:'보관됨'})[status]||status||'상태 확인 중';
  }
  function durationLabel(minutes){const normalized=integer(minutes)||30;return normalized===720?'무제한':normalized===60?'1시간':normalized===120?'2시간':normalized+'분';}
  function scheduleLabel(team){
    const occurrence=(monthData?.occurrences||[]).filter(item=>Number(item.teamId)===Number(team?.teamId)).sort((left,right)=>value(left.startAt).localeCompare(value(right.startAt)))[0];
    if(occurrence){
      const time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(occurrence.startAt));
      return value(occurrence.occurrenceDate)+' '+time+' · '+durationLabel(occurrence.durationMinutes);
    }
    const schedule=team?.schedule||{};
    const time=value(schedule.startsAt).slice(0,5)||'시간 미정';
    const duration=integer(schedule.durationMinutes)||30;
    if(value(schedule.kind)==='ONCE')return value(schedule.startsOn)+' '+time+' · '+durationLabel(duration);
    const labels={1:'월',2:'화',3:'수',4:'목',5:'금',6:'토',7:'일'};
    const days=(Array.isArray(schedule.weekdays)?schedule.weekdays:[]).map(day=>labels[Number(day)]).filter(Boolean).join('·');
    return '매주 '+(days||'요일 미정')+' '+time+' · '+durationLabel(duration);
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

  function viewerCharacterMap(){
    return new Map((bootstrapData?.composerCharacters?.characters||[]).map(character=>[integer(character.characterId),character]));
  }

  function slotCharacterState(character){
    const owned=viewerCharacterMap().get(integer(character?.characterId))||null;
    const relation=value(character?.relation||owned?.relation).toUpperCase();
    return {owned,relation:relation==='MAIN'||character?.isMain===true||owned?.isMain===true?'MAIN':relation==='ALT'?'ALT':''};
  }

  function createMaskedCharacterName(name){
    const fullName=value(name)||'이름 없음';
    const characters=Array.from(fullName);
    const node=document.createElement('strong');
    node.className='sanctuary-management-force-slot-name';
    node.setAttribute('aria-label',fullName);
    node.title=fullName;
    characters.slice(0,7).forEach((character,index)=>{
      const letter=document.createElement('span');
      letter.textContent=character;
      if(characters.length>6&&index===6)letter.className='is-faded';
      node.appendChild(letter);
    });
    return node;
  }

  function createForceCard(team,force){
    const participation=value(team.mode)==='PARTICIPATION'&&['ACTIVE','FULL'].includes(value(team.status));
    const supportEnabled=participation&&bootstrapData?.writeEnabled&&force.canSupport;
    const card=document.createElement('article');
    if(participation){
      card.dataset.sanctuarySupportForce=value(force.forceId);card.dataset.sanctuarySupportTeam=value(team.teamId);card.dataset.sanctuarySupportAvailable=supportEnabled?'true':'false';
      card.setAttribute('role',supportEnabled?'button':'group');
      if(supportEnabled)card.tabIndex=0;
    }
    card.className='sanctuary-management-force-card'+(participation?' is-supportable':'')+(force.canSupport?' can-support':' is-unavailable')+(force.viewerAlreadyAssigned?' is-assigned':'')+(force.viewerPending?' is-pending':'');
    if(participation)card.setAttribute('aria-label',force.forceNo+'포스. '+(supportEnabled?'지원 창 열기':value(force.supportDisabledMessage)||'지원 상태 확인'));
    const head=document.createElement('span');head.className='sanctuary-management-force-card-head';
    const titleWrap=document.createElement('span');titleWrap.className='sanctuary-management-force-title-row';
    const name=document.createElement('strong');name.textContent=force.forceNo+'포스';
    const power=document.createElement('small');power.className='sanctuary-management-force-average';power.innerHTML=combatPowerMarkup(force.combatPower?.average,'평균')+'<span> · '+escapeHtml(force.combatPower.knownCount)+'/'+escapeHtml(force.occupiedCount)+'명 확인</span>';
    const copyButton=document.createElement('button');copyButton.type='button';copyButton.className='sanctuary-management-copy-button';copyButton.dataset.sanctuaryCopyForce=value(force.forceId);copyButton.dataset.sanctuaryCopyTeam=value(team.teamId);copyButton.setAttribute('aria-label',force.forceNo+'포스 이미지 클립보드 복사');copyButton.title='해당 포스 전체를 이미지로 복사';copyButton.innerHTML='<span aria-hidden="true"><i></i><i></i></span>';
    titleWrap.append(name,copyButton);titleWrap.appendChild(power);
    const count=document.createElement('em');count.textContent=force.occupiedCount+'/'+force.capacity+'명';head.append(titleWrap,count);
    const parties=document.createElement('span');parties.className='sanctuary-management-force-parties';
    force.parties.forEach(party=>{
      const partyNode=document.createElement('span');partyNode.className='sanctuary-management-force-party'+(party.requirements.satisfied?'':' has-unmet-requirements');
      const partyHead=document.createElement('span');partyHead.className='sanctuary-management-force-party-head';
      const label=document.createElement('strong');label.textContent=party.partyNo+'파티';
      const partyCount=document.createElement('small');partyCount.textContent=party.occupiedCount+'/'+party.capacity+'명';partyHead.append(label,partyCount);partyNode.appendChild(partyHead);
      party.slots.forEach(slot=>{
        const characterState=slotCharacterState(slot.character);
        const item=document.createElement('span');item.className='sanctuary-management-force-slot'+(slot.occupied?' is-occupied':'')+(characterState.relation==='MAIN'?' is-main':characterState.relation==='ALT'?' is-alt':' is-guest')+(characterState.owned?' is-viewer-character':'')+(!slot.occupied&&value(slot.requiredClassCode).toUpperCase()!=='ALL'?' is-class-slot':'');item.dataset.slotNumber=String((party.partyNo-1)*5+slot.slotNo);
        const icon=document.createElement('span');icon.className='sanctuary-management-force-slot-icon';
        const requiredClass=value(slot.requiredClassCode).toUpperCase();
        const iconPath=slot.occupied&&!slot.character?.isRandomAlt?classIconFor(slot.character?.className):requiredClass&&requiredClass!=='ALL'?classIconFor(CLASS_NAME_BY_CODE[requiredClass]):'';
        if(iconPath){const image=document.createElement('img');image.src=iconPath;image.alt=value(slot.character?.className)||'클래스';icon.appendChild(image);}
        else icon.textContent=slot.character?.isRandomAlt?'R':slot.occupied?Array.from(value(slot.character?.className)||'?')[0]||'?':requiredClass&&requiredClass!=='ALL'?'!':'+';
        const copy=document.createElement('span');copy.className='sanctuary-management-force-slot-copy';
        const slotName=slot.occupied?createMaskedCharacterName(slot.character?.name):createMaskedCharacterName(requiredClass&&requiredClass!=='ALL'?(CLASS_NAME_BY_CODE[requiredClass]||'지정')+' 클래스 슬롯':'빈 슬롯');
        const slotMeta=document.createElement('small');slotMeta.className='sanctuary-management-force-slot-server';slotMeta.textContent=slot.occupied?'['+(value(slot.character?.serverName)||'서버 미상')+']':requiredClass&&requiredClass!=='ALL'?'[지원 클래스]':'[대기]';
        const slotPower=document.createElement('small');slotPower.className='sanctuary-management-force-slot-power';slotPower.innerHTML=slot.character?.isRandomAlt?'랜덤 부캐':slot.occupied?combatPowerMarkup(slot.character?.power):'캐릭터 대기';copy.append(slotName,slotMeta,slotPower);item.append(icon,copy);
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
    if(!force.requirements.satisfied){card.classList.add('has-unmet-requirements');const warning=document.createElement('span');warning.className='sanctuary-management-requirement-warning';warning.textContent='구성 조건 '+force.requirements.unsatisfiedCount+'개 미충족';card.append(head,parties,warning,stateText);}
    else card.append(head,parties,stateText);
    return card;
  }

  function forceCarouselCards(track){return Array.from(track?.querySelectorAll(':scope > .sanctuary-management-force-card')||[]);}
  function forceCarouselCurrent(carousel){return Math.max(0,integer(carousel?.dataset.forceIndex));}
  function setForceCardVisibility(card,active){
    if(!card)return;
    if(!card.dataset.carouselTabindex)card.dataset.carouselTabindex=String(card.tabIndex);
    card.classList.toggle('is-active',active);
    card.toggleAttribute('inert',!active);
    if(active){card.removeAttribute('aria-hidden');card.tabIndex=integer(card.dataset.carouselTabindex);}
    else{card.setAttribute('aria-hidden','true');card.tabIndex=-1;}
  }
  function updateForceCarousel(carousel){
    const track=carousel?.querySelector('.sanctuary-management-force-grid');const cards=forceCarouselCards(track);if(!track||!cards.length)return;
    const current=Math.min(cards.length-1,forceCarouselCurrent(carousel));carousel.dataset.forceIndex=String(current);
    cards.forEach((card,index)=>setForceCardVisibility(card,index===current));
    const previous=carousel.querySelector('[data-sanctuary-force-shift="-1"]');const next=carousel.querySelector('[data-sanctuary-force-shift="1"]');
    const position=carousel.querySelector('[data-sanctuary-force-position]');const announcer=carousel.querySelector('[data-sanctuary-force-announcer]');const force=cards[current];
    carousel.classList.toggle('has-pages',cards.length>1);if(previous)previous.disabled=current===0;if(next)next.disabled=current===cards.length-1;
    if(position)position.textContent=(current+1)+' / '+cards.length;
    if(announcer)announcer.textContent=(force?.querySelector('.sanctuary-management-force-card-head strong')?.textContent||current+1+'포스')+' · '+(force?.querySelector('.sanctuary-management-force-card-head em')?.textContent||'편성 정보');
  }
  function setForceCarouselIndex(carousel,targetIndex,animate=true){
    const track=carousel?.querySelector('.sanctuary-management-force-grid');const cards=forceCarouselCards(track);if(!track||!cards.length||carousel.dataset.forceAnimating==='true')return;
    const current=Math.min(cards.length-1,forceCarouselCurrent(carousel));const target=Math.max(0,Math.min(cards.length-1,integer(targetIndex)));
    if(current===target){updateForceCarousel(carousel);return;}
    const outgoing=cards[current],incoming=cards[target];const direction=target>current?'forward':'backward';const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    carousel.dataset.forceIndex=String(target);setForceCardVisibility(outgoing,false);setForceCardVisibility(incoming,true);
    if(!animate||reduced){updateForceCarousel(carousel);return;}
    carousel.dataset.forceAnimating='true';outgoing.classList.add('is-leaving-'+direction);incoming.classList.add('is-entering-'+direction);
    window.setTimeout(()=>{outgoing.classList.remove('is-leaving-forward','is-leaving-backward');incoming.classList.remove('is-entering-forward','is-entering-backward');carousel.dataset.forceAnimating='false';updateForceCarousel(carousel);},480);
    updateForceCarousel(carousel);
  }
  function shiftForceCarousel(button){
    const carousel=button.closest('.sanctuary-management-force-carousel');if(!carousel)return;
    setForceCarouselIndex(carousel,forceCarouselCurrent(carousel)+Number(button.dataset.sanctuaryForceShift||0));
  }
  function bindForceCarouselGestures(carousel){
    if(carousel.dataset.carouselBound==='true')return;carousel.dataset.carouselBound='true';
    let touchStart=null;
    carousel.addEventListener('touchstart',event=>{const touch=event.touches?.[0];touchStart=touch?{x:touch.clientX,y:touch.clientY}:null;},{passive:true});
    carousel.addEventListener('touchend',event=>{if(!touchStart)return;const touch=event.changedTouches?.[0];if(!touch){touchStart=null;return;}const deltaX=touch.clientX-touchStart.x,deltaY=touch.clientY-touchStart.y;touchStart=null;if(Math.abs(deltaX)<48||Math.abs(deltaX)<=Math.abs(deltaY)*1.2)return;event.preventDefault();carousel.dataset.swipeSuppress='true';setForceCarouselIndex(carousel,forceCarouselCurrent(carousel)+(deltaX<0?1:-1));window.setTimeout(()=>{carousel.dataset.swipeSuppress='false';},360);},{passive:false});
    carousel.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key)||event.target.matches('input,textarea,select'))return;event.preventDefault();setForceCarouselIndex(carousel,forceCarouselCurrent(carousel)+(event.key==='ArrowRight'?1:-1));});
  }
  function initializeForceCarousels(){
    document.querySelectorAll('.sanctuary-management-force-carousel').forEach(carousel=>{
      bindForceCarouselGestures(carousel);updateForceCarousel(carousel);
    });
  }

  function ensureForceOverviewLayer(){
    if(forceOverviewLayer)return forceOverviewLayer;
    forceOverviewLayer=document.createElement('div');forceOverviewLayer.className='sanctuary-management-force-overview-layer';forceOverviewLayer.hidden=true;forceOverviewLayer.setAttribute('aria-hidden','true');document.body.appendChild(forceOverviewLayer);
    forceOverviewLayer.addEventListener('click',event=>{
      if(event.target.closest('[data-force-overview-close]')){closeForceOverview();return;}
      const support=event.target.closest('[data-sanctuary-support-force]');
      if(support){
        const team=selectedDraftTeam(support.dataset.sanctuarySupportTeam);if(!team||!bootstrapData?.writeEnabled)return;
        forceOverviewForceId=integer(support.dataset.sanctuarySupportForce);suspendForceOverview();
        window.KinojoSanctuaryManagementSupportUI?.open?.(team,forceOverviewForceId,forceOverviewOpener,{onClose:()=>resumeForceOverview(forceOverviewForceId)});return;
      }
      const edit=event.target.closest('[data-force-overview-edit]');
      if(edit&&!edit.disabled){const team=selectedDraftTeam(edit.dataset.forceOverviewEdit);const opener=forceOverviewOpener;closeForceOverview({restoreFocus:false});if(team)window.KinojoSanctuaryManagementDraftUI?.openDraft?.(team,opener);}
    });
    forceOverviewLayer.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();closeForceOverview();return;}if(event.key!=='Tab')return;
      const focusable=Array.from(forceOverviewLayer.querySelectorAll('button:not(:disabled),[tabindex="0"]')).filter(item=>item.offsetParent!==null);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    return forceOverviewLayer;
  }
  function renderForceOverview(preferredForceId=0){
    const team=selectedDraftTeam(forceOverviewTeamId);const layer=ensureForceOverviewLayer();if(!team){closeForceOverview();return;}
    forceOverviewForceId=integer(preferredForceId)||integer(team.forces?.[0]?.forceId);
    const backdrop=document.createElement('div');backdrop.className='sanctuary-management-force-overview-backdrop';backdrop.dataset.forceOverviewClose='';
    const dialog=document.createElement('section');dialog.className='sanctuary-management-force-overview-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','sanctuaryForceOverviewTitle');dialog.tabIndex=-1;
    const header=document.createElement('header');const heading=document.createElement('div');const kicker=document.createElement('span');kicker.textContent='ALL FORCE ROSTER';const title=document.createElement('h2');title.id='sanctuaryForceOverviewTitle';title.textContent=(value(team.title)||'이름 없는 팀')+' 전체 포스';const summary=document.createElement('p');summary.textContent=scheduleLabel(team)+' · '+value(team.forceCount)+'포스 · '+value(team.occupiedCount)+'/'+value(team.slotCount)+'명';heading.append(kicker,title,summary);
    const close=document.createElement('button');close.type='button';close.dataset.forceOverviewClose='';close.setAttribute('aria-label','전체 포스 보기 닫기');close.textContent='×';header.append(heading,close);
    const scroll=document.createElement('div');scroll.className='sanctuary-management-force-overview-scroll';
    const grid=document.createElement('div');grid.className='sanctuary-management-force-overview-grid';grid.setAttribute('aria-label',value(team.title)+' 전체 포스 편성');team.forces.forEach(force=>grid.appendChild(createForceCard(team,force)));scroll.appendChild(grid);
    const footer=document.createElement('footer');const status=document.createElement('p');status.textContent=value(team.mode)==='PARTICIPATION'?'포스 카드를 누르면 기존 다중 포스 지원·승인 화면으로 연결됩니다.':'고정 팀 편성을 한 화면에서 확인할 수 있습니다.';const actions=document.createElement('div');
    const teamCopy=document.createElement('button');teamCopy.type='button';teamCopy.className='kinojo-btn secondary';teamCopy.dataset.sanctuaryCopyTeam=value(team.teamId);teamCopy.textContent='팀 이미지 복사';actions.appendChild(teamCopy);
    if(team.canEdit&&value(team.status)!=='ARCHIVED'){
      const edit=document.createElement('button');edit.type='button';edit.className='kinojo-btn';edit.dataset.forceOverviewEdit=value(team.teamId);edit.disabled=!bootstrapData?.writeEnabled;edit.textContent='포스·캐릭터 편집';actions.appendChild(edit);
    }
    const done=document.createElement('button');done.type='button';done.className='kinojo-btn secondary';done.dataset.forceOverviewClose='';done.textContent='닫기';actions.appendChild(done);footer.append(status,actions);dialog.append(header,scroll,footer);layer.replaceChildren(backdrop,dialog);
  }
  function openForceOverview(team,opener,preferredForceId=0){
    if(!team)return;forceOverviewTeamId=integer(team.teamId);forceOverviewForceId=integer(preferredForceId)||integer(team.forces?.[0]?.forceId);forceOverviewOpener=opener||document.activeElement;renderForceOverview(forceOverviewForceId);const layer=ensureForceOverviewLayer();layer.hidden=false;layer.setAttribute('aria-hidden','false');document.body.classList.add('sanctuary-management-force-overview-open');requestAnimationFrame(()=>layer.querySelector('.sanctuary-management-force-overview-dialog')?.focus());
  }
  function suspendForceOverview(){const layer=ensureForceOverviewLayer();layer.hidden=true;layer.setAttribute('aria-hidden','true');document.body.classList.remove('sanctuary-management-force-overview-open');}
  function resumeForceOverview(preferredForceId=0){
    if(!forceOverviewTeamId||!selectedDraftTeam(forceOverviewTeamId))return;renderForceOverview(preferredForceId);const layer=ensureForceOverviewLayer();layer.hidden=false;layer.setAttribute('aria-hidden','false');document.body.classList.add('sanctuary-management-force-overview-open');requestAnimationFrame(()=>{const force=layer.querySelector('[data-sanctuary-support-force="'+CSS.escape(String(preferredForceId))+'"]');(force||layer.querySelector('.sanctuary-management-force-overview-dialog'))?.focus?.({preventScroll:true});});
  }
  function closeForceOverview(options={}){const restoreFocus=options.restoreFocus!==false;const target=forceOverviewOpener,layer=ensureForceOverviewLayer();layer.hidden=true;layer.setAttribute('aria-hidden','true');layer.replaceChildren();document.body.classList.remove('sanctuary-management-force-overview-open');forceOverviewTeamId=0;forceOverviewForceId=0;forceOverviewOpener=null;if(restoreFocus)target?.focus?.({preventScroll:true});}

  function createTeamCard(team){
    const card=document.createElement('article');card.className='sanctuary-management-team-card';card.dataset.sanctuaryTeam=value(team.teamId);
    const head=document.createElement('div');head.className='sanctuary-management-team-card-head';
    const titleWrap=document.createElement('div');
    const titleRow=document.createElement('div');titleRow.className='sanctuary-management-team-title-row';
    const title=document.createElement('h3');title.textContent=value(team.title)||'이름 없는 팀';
    const copyButton=document.createElement('button');copyButton.type='button';copyButton.className='sanctuary-management-copy-button';copyButton.dataset.sanctuaryCopyTeam=value(team.teamId);copyButton.setAttribute('aria-label',(value(team.title)||'이름 없는 팀')+' 전체 이미지 클립보드 복사');copyButton.title='해당 팀의 모든 포스를 이미지로 복사';copyButton.innerHTML='<span aria-hidden="true"><i></i><i></i></span>';
    titleRow.append(title,copyButton);titleWrap.append(titleRow);
    const headActions=document.createElement('div');headActions.className='sanctuary-management-team-head-actions';
    if(['ACTIVE','FULL'].includes(value(team.status))){const difficulty=document.createElement('span');difficulty.className='sanctuary-management-team-badge is-difficulty '+(value(team.difficulty)==='HARD'?'is-hard':'is-normal');difficulty.textContent=value(team.difficulty)==='HARD'?'어려움':'보통';headActions.appendChild(difficulty);}
    else{const badge=document.createElement('span');badge.className='sanctuary-management-team-badge';badge.textContent=teamStatusLabel(team);headActions.appendChild(badge);}
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
    const carousel=document.createElement('div');carousel.className='sanctuary-management-force-carousel';
    const carouselHead=document.createElement('div');carouselHead.className='sanctuary-management-force-carousel-head';
    const position=document.createElement('span');position.className='sanctuary-management-force-position';position.dataset.sanctuaryForcePosition='';position.textContent='1 / '+team.forces.length;const announcer=document.createElement('span');announcer.className='sanctuary-management-sr-only';announcer.dataset.sanctuaryForceAnnouncer='';announcer.setAttribute('aria-live','polite');
    const overview=document.createElement('button');overview.type='button';overview.className='kinojo-btn secondary sanctuary-management-force-overview-button';overview.dataset.sanctuaryForceOverview=value(team.teamId);overview.textContent='전체 포스 보기';carouselHead.append(position,announcer,overview);
    const viewport=document.createElement('div');viewport.className='sanctuary-management-force-viewport';
    const previous=document.createElement('button');previous.type='button';previous.className='sanctuary-management-force-arrow is-previous';previous.dataset.sanctuaryForceShift='-1';previous.setAttribute('aria-label','이전 포스 보기');previous.textContent='‹';
    const forces=document.createElement('div');forces.className='sanctuary-management-force-grid';forces.setAttribute('aria-label',value(team.title)+' 포스 편성');
    team.forces.forEach(force=>forces.appendChild(createForceCard(team,force)));
    const next=document.createElement('button');next.type='button';next.className='sanctuary-management-force-arrow is-next';next.dataset.sanctuaryForceShift='1';next.setAttribute('aria-label','다음 포스 보기');next.textContent='›';
    viewport.append(previous,forces,next);carousel.append(carouselHead,viewport);card.append(head,meta,carousel);
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
    addButton.title=bootstrapData.writeEnabled?'새 성역 팀을 생성합니다.':bootstrapData.publicRead?'로그인 후 팀을 생성할 수 있습니다.':value(bootstrapData.rollout?.message)||'현재 읽기 전용입니다.';
    if(!bootstrapData.readEnabled){
      byId('sanctuaryManagementTeamStatus').textContent='Server 읽기 플래그가 비활성 상태입니다. 팀 생성도 운영 승인 전까지 열리지 않습니다.';
      root.appendChild(createEmpty('실제 팀 읽기는 아직 열리지 않았습니다.','Server 어댑터 연결은 완료됐으며 별도 승인 전까지 운영 팀 데이터는 표시하지 않습니다.'));
      return;
    }
    const teams=visibleTeams();
    byId('sanctuaryManagementTeamStatus').textContent=bootstrapData.writeEnabled?'Server 팀 데이터를 생성·참여·편집할 수 있습니다.':bootstrapData.publicRead?'운영 팀과 포스는 로그인 없이 볼 수 있습니다. 팀 생성·지원·편집은 로그인 후 사용할 수 있습니다.':value(bootstrapData.rollout?.message)||'읽기 전용으로 Server 팀 데이터를 표시합니다.';
    if(!teams.length){
      root.appendChild(createEmpty('등록된 팀이 없습니다.','선택한 성역에 Server가 반환한 운영 팀이 없습니다.'));
      return;
    }
    teams.forEach(team=>root.appendChild(createTeamCard(team)));
    requestAnimationFrame(initializeForceCarousels);
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
    try{const data=await ServerAdapter.month(month);if(sequence!==monthRequestSequence)return;monthData=data;renderMonth();}
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

  async function saveComposition(model){
    if(!bootstrapData?.writeEnabled)throw new Error('Server 쓰기 기능이 아직 활성화되지 않았습니다.');
    const source=model&&typeof model==='object'?model:{};const teamId=Number(source.teamId||0);
    const composition=Array.isArray(source.composition)?source.composition.map(force=>({
      sourceForceId:Number(force?.sourceForceId)||null,
      slots:Array.isArray(force?.slots)?force.slots.map(slot=>({partyNo:Number(slot?.partyNo),slotNo:Number(slot?.slotNo),characterId:Number(slot?.characterId)||null,mainCharacterId:Number(slot?.mainCharacterId)||null,assignmentKind:value(slot?.assignmentKind).toUpperCase()==='RANDOM_ALT'?'RANDOM_ALT':'ACTUAL_CHARACTER',requiredClassCode:SLOT_CLASS_CODES.includes(value(slot?.requiredClassCode).toUpperCase())?value(slot?.requiredClassCode).toUpperCase():'ALL',placementLocked:slot?.placementLocked===true})):[],
      requirements:Array.isArray(force?.requirements)?force.requirements.map(rule=>({scopeType:value(rule?.scopeType).toUpperCase(),partyNo:rule?.partyNo==null?null:Number(rule.partyNo),ruleType:value(rule?.ruleType).toUpperCase(),minimumCount:Number(rule?.minimumCount),powerThreshold:rule?.powerThreshold==null?null:Number(rule.powerThreshold),itemLevelThreshold:rule?.itemLevelThreshold==null?null:Number(rule.itemLevelThreshold)})):[]
    })):[];
    if(!composition.length||composition.length>9||composition.some(force=>force.slots.length!==10||force.slots.some(slot=>![1,2].includes(slot.partyNo)||slot.slotNo<1||slot.slotNo>5)))throw new Error('포스 편성안을 다시 확인해 주세요.');
    const payload={
      teamId:teamId||null,
      sanctuaryCode:value(source.sanctuaryCode),
      title:value(source.title),
      activity:value(source.activity),
      difficulty:value(source.difficulty||'NORMAL').toUpperCase()==='HARD'?'HARD':'NORMAL',
      mode:value(source.mode).toUpperCase()==='PARTICIPATION'?'PARTICIPATION':'FIXED',
      joinPolicy:value(source.joinPolicy).toUpperCase()==='APPROVAL'?'APPROVAL':'INSTANT',
      schedule:source.schedule&&typeof source.schedule==='object'?source.schedule:{},
      composition,
      compositionRulesVersion:2,
      leaseToken:value(source.leaseToken),
      balanceProposalToken:value(source.balanceProposalToken)
    };
    const result=await ServerAdapter.command('SAVE_COMPOSITION',payload,teamId?Number(source.revision):null,value(source.requestKey));
    await load();return result;
  }

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
    const normalized=Array.isArray(assignments)?assignments.map(item=>value(item.assignmentKind).toUpperCase()==='RANDOM_ALT'?{forceId:Number(item.forceId),assignmentKind:'RANDOM_ALT',mainCharacterId:Number(item.mainCharacterId)}:{forceId:Number(item.forceId),assignmentKind:'ACTUAL_CHARACTER',characterId:Number(item.characterId)}):[];
    const actualIds=normalized.filter(item=>item.assignmentKind==='ACTUAL_CHARACTER').map(item=>item.characterId);
    if(!normalized.length||normalized.length>9||normalized.some(item=>!Number.isSafeInteger(item.forceId)||item.forceId<1||(item.assignmentKind==='RANDOM_ALT'?(!Number.isSafeInteger(item.mainCharacterId)||item.mainCharacterId<1):(!Number.isSafeInteger(item.characterId)||item.characterId<1)))||new Set(normalized.map(item=>item.forceId)).size!==normalized.length||new Set(actualIds).size!==actualIds.length)throw new Error('포스와 캐릭터를 1:1로 하나 이상 선택해 주세요.');
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
  async function linkedAlts(teamId,mainCharacterId){
    const api=window.KinojoSupabase;
    if(!api||typeof api.getSanctuaryManagementLinkedAlts!=='function')throw new Error('연결된 부캐 Server 어댑터를 불러오지 못했습니다.');
    return validateLinkedAlts(await api.getSanctuaryManagementLinkedAlts(Number(teamId),Number(mainCharacterId)));
  }

  async function balanceProposal(teamId,expectedRevision,leaseToken,stableSeed,lockOverrides){
    const api=window.KinojoSupabase;
    if(!api||typeof api.getSanctuaryManagementBalanceProposal!=='function')throw new Error('균형 배치 Server 어댑터를 불러오지 못했습니다.');
    const result=await api.getSanctuaryManagementBalanceProposal(Number(teamId),Number(expectedRevision),value(leaseToken),value(stableSeed),lockOverrides);
    const assignments=Array.isArray(result?.assignments)?result.assignments:[];
    const excluded=Array.isArray(result?.excluded)?result.excluded:[];
    if(!value(result?.proposalToken)||!value(result?.expiresAt)||assignments.some(item=>integer(item?.supportItemId)<1||integer(item?.slotId)<1||integer(item?.forceId)<1||integer(item?.characterId)<1||!value(item?.characterName))){
      throw new Error('균형 배치 제안 응답이 올바르지 않습니다.');
    }
    return Object.assign({},result,{assignments,excluded,beforeAverages:Array.isArray(result.beforeAverages)?result.beforeAverages:[],afterAverages:Array.isArray(result.afterAverages)?result.afterAverages:[]});
  }

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
    if(review.completed){button.hidden=true;if(state)state.textContent='Stage 7 전환이 완료되었습니다. 권한이 있는 팀은 편집·카드 이동·팀 해산을 사용할 수 있습니다.';return;}
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
    saveComposition,
    addForce,
    setSlot,
    lease,
    publishTeam,
    moveSlot,
    archiveTeam,
    searchCharacter,
    registerCharacter,
    linkedAlts,
    balanceProposal,
    reload:load
  });

  window.KinojoSanctuaryManagementSupportBridge=Object.freeze({
    kind:'SERVER_ONLY_SUPPORT',schemaVersion:SCHEMA_VERSION,
    snapshot(){return bootstrapData;},findTeam:selectedDraftTeam,submitSupport,decideSupport,cancelSupport,reload:load
  });
  window.KinojoSanctuaryManagementCopyBridge=Object.freeze({
    kind:'BROWSER_IMAGE_COPY',schemaVersion:SCHEMA_VERSION,
    snapshot(){return bootstrapData;},findTeam:selectedDraftTeam,selectedSanctuary:sanctuaryForSelection
  });

  function applyDeepLink(){
    if(deepLinkApplied||!bootstrapData)return;const params=new URLSearchParams(location.search);
    if(params.get('view')==='schedule'){
      const panel=byId('sanctuaryManagementSchedulePanel');if(!panel)return;deepLinkApplied=true;
      panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});panel.classList.add('is-deep-linked');setTimeout(()=>panel.classList.remove('is-deep-linked'),2400);return;
    }
    const teamId=Number(params.get('team')||0);if(!teamId)return;
    const team=selectedDraftTeam(teamId);if(!team)return;deepLinkApplied=true;
    const card=byId('sanctuaryManagementTeamList')?.querySelector('[data-sanctuary-team="'+CSS.escape(String(teamId))+'"]');card?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});card?.classList.add('is-deep-linked');setTimeout(()=>card?.classList.remove('is-deep-linked'),2400);
    if(params.get('support')==='1'&&bootstrapData.writeEnabled){const forceId=Number(params.get('force')||team.forces?.find(force=>force.canSupport)?.forceId||0);const trigger=card?.querySelector('[data-sanctuary-support-force="'+CSS.escape(String(forceId))+'"]');if(trigger)setTimeout(()=>window.KinojoSanctuaryManagementSupportUI?.open?.(team,forceId,trigger),180);}
  }

  function renderBootstrap(data){
    bootstrapData=data;
    pendingBootstrapData=null;
    currentBootstrapFingerprint=bootstrapFingerprint(data);
    selectedSanctuary=resolveInitialSelection(data);
    byId('sanctuaryManagementContract').textContent=contractLabel(data);
    renderSanctuaryBanner();
    setFlagState('sanctuaryManagementReadState',data.readEnabled);
    renderWriteState(data);
    renderScope();
    renderRefreshIndicator(false);
    renderTeams();
    renderTransitionReview(data);
    loadMonth(selectedMonth);
    byId('sanctuaryManagementContent').hidden=false;
    if(data.readEnabled){
      if(data.publicRead){
        setAccess('ready','성역 팀과 일정을 공개 보기로 표시합니다.','팀·포스·일정은 로그인 없이 볼 수 있습니다. 팀 생성·지원·편집은 로그인 후 사용할 수 있습니다.');
      }else if(data.rollout.mode==='PILOT'&&data.writeEnabled){
        setAccess('ready','성역 시험 운영이 활성화되었습니다.','승인된 시험 사용자로 팀 생성·참여·편집·해산을 검수할 수 있습니다.');
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

  async function checkForUpdates(){
    if(!bootstrapData||backgroundCheckActive||document.hidden)return;
    backgroundCheckActive=true;
    try{
      const next=await ServerAdapter.bootstrap();
      const changed=bootstrapFingerprint(next)!==currentBootstrapFingerprint;
      pendingBootstrapData=changed?next:null;
      renderRefreshIndicator(changed);
    }catch(_error){
      if(pendingBootstrapData)renderRefreshIndicator(true);
    }finally{backgroundCheckActive=false;}
  }

  async function refreshContent(){
    if(!bootstrapData)return;
    renderRefreshIndicator(false,true);
    try{renderBootstrap(pendingBootstrapData||await ServerAdapter.bootstrap());}
    catch(error){renderRefreshIndicator(Boolean(pendingBootstrapData));window.KinojoToast?.error?.(value(error?.message)||'새 내용을 불러오지 못했습니다.');}
  }

  function handleAuthChanged(){
    // A token renewal can dispatch the same auth event repeatedly. Only an
    // actual public/member/role projection change may replace visible data;
    // same-viewer renewals stay on the manual refresh path.
    const next=authState().projection;
    if(bootstrapData&&next===currentAuthProjection){checkForUpdates();return;}
    currentAuthProjection=next;
    load();
  }

  async function load(){
    const sequence=++requestSequence;
    const auth=authState();
    currentAuthProjection=auth.projection;
    bootstrapData=null;
    byId('sanctuaryManagementContent').hidden=true;
    byId('sanctuaryManagementScopeShell').hidden=true;
    byId('sanctuaryManagementContract').textContent='API 계약 확인 중';
    setAccess('loading','Server 성역 데이터를 확인하고 있습니다.',auth.loggedIn?'로그인 이용자의 팀·포스·지원 데이터를 불러옵니다.':'공개된 팀·포스·월간 일정을 불러옵니다.');
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
      renderSanctuaryBanner();
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
      const sourceCarousel=event.target.closest('.sanctuary-management-force-carousel');if(sourceCarousel?.dataset.swipeSuppress==='true'){event.preventDefault();return;}
      const carouselButton=event.target.closest('[data-sanctuary-force-shift]');
      if(carouselButton){shiftForceCarousel(carouselButton);return;}
      const overview=event.target.closest('[data-sanctuary-force-overview]');
      if(overview){const team=selectedDraftTeam(overview.dataset.sanctuaryForceOverview);if(team)openForceOverview(team,overview,team.forces?.[forceCarouselCurrent(overview.closest('.sanctuary-management-force-carousel'))]?.forceId);return;}
      const support=event.target.closest('[data-sanctuary-support-force]');
      if(support){if(support.dataset.sanctuarySupportAvailable!=='true')return;const team=selectedDraftTeam(support.dataset.sanctuarySupportTeam);if(team)window.KinojoSanctuaryManagementSupportUI?.open?.(team,Number(support.dataset.sanctuarySupportForce),support);return;}
      const edit=event.target.closest('[data-sanctuary-edit-team]');
      if(edit&&!edit.disabled){const team=selectedDraftTeam(edit.dataset.sanctuaryEditTeam);if(team)window.KinojoSanctuaryManagementDraftUI?.openDraft?.(team,edit);return;}
      const schedule=event.target.closest('[data-sanctuary-schedule-team]');
      if(schedule&&!schedule.disabled){const team=selectedDraftTeam(schedule.dataset.sanctuaryScheduleTeam);if(team)openScheduleOperation(team,schedule);return;}
      const archive=event.target.closest('[data-sanctuary-archive-team]');
      if(!archive||archive.disabled)return;
      const team=selectedDraftTeam(archive.dataset.sanctuaryArchiveTeam);if(!team)return;
      openArchiveOperation(team,archive);
    });
    byId('sanctuaryManagementTeamList')?.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const card=event.target.closest('[data-sanctuary-support-force]');if(!card||event.target.closest('[data-sanctuary-copy-team]'))return;
      event.preventDefault();if(card.dataset.sanctuarySupportAvailable!=='true')return;
      const team=selectedDraftTeam(card.dataset.sanctuarySupportTeam);if(team)window.KinojoSanctuaryManagementSupportUI?.open?.(team,Number(card.dataset.sanctuarySupportForce),card);
    });
    byId('sanctuaryManagementScheduleState')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-sanctuary-month-shift]');if(!button)return;loadMonth(shiftedMonth(Number(button.dataset.sanctuaryMonthShift)||0));
    });
    byId('sanctuaryManagementScheduleState')?.addEventListener('click',event=>{
      const item=event.target.closest('[data-sanctuary-calendar-team]');if(!item)return;const team=selectedDraftTeam(item.dataset.sanctuaryCalendarTeam);if(!team)return;
      const card=byId('sanctuaryManagementTeamList')?.querySelector('[data-sanctuary-team="'+CSS.escape(String(team.teamId))+'"]');card?.scrollIntoView({behavior:'smooth',block:'center'});if(bootstrapData?.writeEnabled&&team.canEdit)openScheduleOperation(team,item,value(item.dataset.sanctuaryCalendarDate));
    });
    byId('sanctuaryManagementRefreshAction')?.addEventListener('click',refreshContent);
    window.addEventListener('kinojo:sanctuary-master-rendered',event=>acceptSanctuaryMaster(event.detail));
    if(typeof window.KinojoSanctuaryMaster?.load==='function')window.KinojoSanctuaryMaster.load().then(acceptSanctuaryMaster).catch(()=>{});
    window.addEventListener('kinojo:auth-changed',handleAuthChanged);
    window.addEventListener('focus',checkForUpdates);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkForUpdates();});
    window.addEventListener('resize',()=>requestAnimationFrame(initializeForceCarousels),{passive:true});
    window.setInterval(checkForUpdates,BACKGROUND_CHECK_INTERVAL);
    load();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();
