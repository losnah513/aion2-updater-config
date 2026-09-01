/* KINOJO Legion Tree · all-server candidate search + selected listless add + atomic organization save + character detail */
(function(){
  'use strict';

  const q=(selector,root=document)=>root.querySelector(selector);
  const SERVER_REFERENCE_RPC='kinojo_web_legion_tree_server_reference_v372';
  const TREE_RPC='kinojo_web_get_legion_tree';
  const TREE_CONTRACT='web-legion-tree-v1';
  const TREE_DATABASE_CONTRACT='460';
  const ADD_CONTRACT='legion-tree-character-add-v1';
  const SEARCH_CONTRACT='legion-tree-character-search-v1';
  const ADD_ACCEPTED_CODE='ADD_QUEUE_ACCEPTED';
  const ADD_POLL_INTERVAL_MS=1400;
  const ADD_POLL_TIMEOUT_MS=15*60*1000;
  const TREE_CACHE_KEY='kinojo:legion-tree:v464:last-good';
  const TREE_CACHE_MAX_AGE_MS=24*60*60*1000;
  const TREE_READ_RETRY_DELAYS_MS=Object.freeze([0,300,900]);
  const TREE_RECOVERY_DELAYS_MS=Object.freeze([5000,15000,30000]);
  const LEGION_ORDER=Object.freeze(['깡','낮','밤','키나노동조합']);
  const MAIN_REQUIRED_MESSAGE='본캐 이름을 입력해 주세요.';
  const ADD_STEPS=Object.freeze([
    Object.freeze({key:'official',label:'공식 확인'}),
    Object.freeze({key:'master',label:'정보 반영'}),
    Object.freeze({key:'tree',label:'트리 확인'}),
    Object.freeze({key:'complete',label:'완료'})
  ]);
  const CLASS_ICON_MAP=Object.freeze({
    '수호성':'templar','검성':'gladiator','살성':'assassin','궁성':'ranger',
    '마도성':'sorcerer','정령성':'elementalist','치유성':'cleric','호법성':'chanter','권성':'fighter'
  });

  let serverReference=[];
  let serverReferenceReady=false;
  let serverReferenceError='';
  let treeStatusMessage='레기온 데이터를 불러오는 중…';
  let searchRequestRunning=false;
  let addRequestRunning=false;
  let activeAddSessionId='';
  let activeAddProgressIndex=0;
  let addPollGeneration=0;
  let currentTreeModel=null;
  let activeLegionIndex=0;
  let treeRecoveryTimer=null;
  let treeRecoveryAttempt=0;
  let searchGroups={main:null,alt:null};
  let selectedCandidates={main:null,alt:null};

  function text(value,max=160){
    return String(value??'').trim().slice(0,max);
  }

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function positiveInt(value){
    const number=Number(value);
    return Number.isInteger(number)&&number>0?number:null;
  }

  function boolean(value){
    return value===true||value===1||String(value).toLowerCase()==='true';
  }

  function nonNegativeNumber(value){
    if(value===null||value===undefined||value==='')return null;
    const number=Number(value);
    return Number.isFinite(number)&&number>=0?number:null;
  }

  function array(value){
    return Array.isArray(value)?value:[];
  }

  function wait(ms){
    return new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms)||0)));
  }

  function transientTreeReadError(error){
    const message=text(error?.message||error?.code||error,500).toLowerCase();
    return /statement timeout|canceling statement|query_canceled|57014|pgrst00[013]|fetch failed|failed to fetch|networkerror|network error|gateway timeout|timed out|timeout/.test(message);
  }

  function treeCacheStorage(){
    try{return window.localStorage||null;}catch(_error){return null;}
  }

  function writeTreeCache(payload){
    try{
      normalizeTreePayload(payload);
      const storage=treeCacheStorage();
      if(!storage||typeof storage.setItem!=='function')return false;
      storage.setItem(TREE_CACHE_KEY,JSON.stringify({savedAt:Date.now(),payload}));
      return true;
    }catch(_error){
      return false;
    }
  }

  function readTreeCache(){
    try{
      const storage=treeCacheStorage();
      if(!storage||typeof storage.getItem!=='function')return null;
      const cached=JSON.parse(storage.getItem(TREE_CACHE_KEY)||'null');
      const savedAt=Number(cached?.savedAt);
      if(!Number.isFinite(savedAt)||Date.now()-savedAt>TREE_CACHE_MAX_AGE_MS)return null;
      normalizeTreePayload(cached?.payload);
      return cached.payload;
    }catch(_error){
      return null;
    }
  }

  async function requestTreePayloadWithRetry(api){
    let lastError=new Error('LEGION_TREE_READ_FAILED');
    for(let index=0;index<TREE_READ_RETRY_DELAYS_MS.length;index+=1){
      const delay=TREE_READ_RETRY_DELAYS_MS[index];
      if(delay>0)await wait(delay);
      try{
        const payload=await api.rpc(TREE_RPC,{});
        if(payload?.ok!==true){
          const error=new Error(text(payload?.message||payload?.code||'LEGION_TREE_READ_FAILED',500));
          error.code=text(payload?.code,120);
          throw error;
        }
        normalizeTreePayload(payload);
        return Object.freeze({payload,attemptCount:index+1});
      }catch(error){
        lastError=error;
        if(!transientTreeReadError(error)||index===TREE_READ_RETRY_DELAYS_MS.length-1)throw error;
      }
    }
    throw lastError;
  }

  function clearTreeRecovery(){
    if(treeRecoveryTimer!==null)clearTimeout(treeRecoveryTimer);
    treeRecoveryTimer=null;
    treeRecoveryAttempt=0;
  }

  function scheduleTreeRecovery(){
    if(treeRecoveryTimer!==null||treeRecoveryAttempt>=TREE_RECOVERY_DELAYS_MS.length)return false;
    const delay=TREE_RECOVERY_DELAYS_MS[treeRecoveryAttempt];
    treeRecoveryAttempt+=1;
    treeRecoveryTimer=setTimeout(()=>{
      treeRecoveryTimer=null;
      void loadTreeData({background:true});
    },delay);
    return true;
  }

  function toast(message){
    if(window.KinojoCommonUI?.toast)return window.KinojoCommonUI.toast(message);
    if(window.KinojoToast?.show)return window.KinojoToast.show(message);
  }

  function normalStatusMessage(){
    if(serverReferenceError)return serverReferenceError;
    return serverReferenceReady?`이름만 입력하면 모든 활성 서버 · 이름[서버약칭]은 해당 서버 · ${treeStatusMessage}`:treeStatusMessage;
  }

  function setStatus(message,color=''){
    const status=q('#legionTreeStatus');
    if(!status)return;
    status.textContent=message;
    status.title=message;
    status.style.color=color;
  }

  function refreshStatus(){
    setStatus(normalStatusMessage(),serverReferenceError?'#dc2626':'');
  }

  function setMainRequiredError(active){
    const main=q('#legionTreeMainName');
    if(main){
      if(active){
        main.setAttribute('aria-invalid','true');
        main.style.borderColor='#dc2626';
        main.style.boxShadow='0 0 0 3px rgba(220,38,38,.10)';
      }else{
        main.removeAttribute('aria-invalid');
        main.style.removeProperty('border-color');
        main.style.removeProperty('box-shadow');
      }
    }
    if(active)setStatus(MAIN_REQUIRED_MESSAGE,'#dc2626');
    else refreshStatus();
  }

  function renderAddProgress(activeIndex=0,state='running'){
    const progress=q('#legionTreeAddProgress');
    if(!progress)return;
    const bounded=Math.min(Math.max(Number(activeIndex)||0,0),ADD_STEPS.length-1);
    activeAddProgressIndex=bounded;
    progress.hidden=false;
    progress.setAttribute('aria-busy',state==='running'?'true':'false');
    progress.innerHTML=ADD_STEPS.map((step,index)=>{
      let itemState='pending';
      if(state==='done'||index<bounded)itemState='done';
      else if(index===bounded)itemState=state==='error'?'error':'active';
      const current=itemState==='active'?' aria-current="step"':'';
      return `<li data-add-step="${step.key}" data-state="${itemState}"${current}><span>${index+1}</span>${step.label}</li>`;
    }).join('');
  }

  function resetAddProgress(){
    const progress=q('#legionTreeAddProgress');
    activeAddProgressIndex=0;
    if(!progress)return;
    progress.hidden=true;
    progress.innerHTML='';
    progress.setAttribute('aria-busy','false');
  }

  function canManageLegionTree(){
    const account=window.KinojoAuth?.getAccount?.()||null;
    return window.KinojoPermissions?.canManage?.(account)===true||account?.canManage===true;
  }

  function hasRequiredSelection(){
    return Boolean(selectedCandidates.main)&&(!searchGroups.alt||Boolean(selectedCandidates.alt));
  }

  function syncManagementControls(){
    const allowed=canManageLegionTree();
    const busy=searchRequestRunning||addRequestRunning;
    const search=q('#legionTreeSearchBtn'),add=q('#legionTreeAddBtn'),edit=q('#legionTreeEditBtn');
    const main=q('#legionTreeMainName'),alt=q('#legionTreeAltName');
    if(search)search.disabled=busy||!serverReferenceReady||!allowed;
    if(add)add.disabled=busy||!allowed||!hasRequiredSelection();
    if(edit)edit.disabled=busy||!currentTreeModel||!allowed;
    if(main)main.disabled=busy||!allowed;
    if(alt)alt.disabled=busy||!allowed;
  }

  function setAddControlsRunning(running){
    const add=q('#legionTreeAddBtn');
    const reset=q('#legionTreeResetBtn');
    const close=q('#legionTreeSearchCloseBtn');
    const search=q('#legionTreeSearchBtn');
    const main=q('#legionTreeMainName'),alt=q('#legionTreeAltName');
    if(add)add.disabled=running===true;
    if(reset)reset.disabled=running===true;
    if(close)close.disabled=running===true;
    if(search)search.disabled=running===true;
    if(main)main.disabled=running===true;
    if(alt)alt.disabled=running===true;
    if(running!==true)syncManagementControls();
  }

  function wait(milliseconds){
    return new Promise(resolve=>setTimeout(resolve,milliseconds));
  }

  function runtimeStage(value){
    return text(value?.stage??value?.currentStage??value?.current_stage,120).toUpperCase();
  }

  function progressIndexForRuntime(value){
    const status=value&&typeof value==='object'?value:{};
    const state=text(status.status,40).toLowerCase();
    const stage=runtimeStage(status);
    if(state==='completed')return 3;
    if(stage==='SERVER_QUEUE_CHARACTER_MASTER_DONE')return 2;
    if(/MASTER_SYNC|GROWTH_REVIEW|RANKING_REBUILD|POSTPROCESS/.test(stage))return 1;
    return 0;
  }

  function addErrorMessage(error){
    const source=error?.data&&typeof error.data==='object'?error.data:{};
    return text(source.message||error?.message||'캐릭터 추가 요청을 완료하지 못했습니다.',300);
  }

  async function pollAddCompletion(sessionId,generation){
    const api=window.KinojoSupabase;
    if(!api||typeof api.runtimeGetStatus!=='function')throw new Error('캐릭터 추가 진행 상태 API를 확인할 수 없습니다.');
    const deadline=Date.now()+ADD_POLL_TIMEOUT_MS;
    while(addRequestRunning&&generation===addPollGeneration&&Date.now()<deadline){
      const runtime=await api.runtimeGetStatus();
      if(text(runtime?.sessionId,240)!==sessionId){
        await wait(ADD_POLL_INTERVAL_MS);
        continue;
      }

      const state=text(runtime?.status,40).toLowerCase();
      const stage=runtimeStage(runtime);
      if(state==='completed'){
        renderAddProgress(2,'running');
        setStatus('캐릭터 Master 반영 완료 · 레기온 트리를 다시 확인하는 중…','#2563eb');
        const reloaded=await loadTreeData();
        if(!reloaded)throw new Error('캐릭터 추가는 완료됐지만 레기온 트리를 다시 불러오지 못했습니다. 새로고침해 주세요.');
        renderAddProgress(3,'done');
        resetInputs({keepStatus:true,force:true});
        setStatus('캐릭터 정보 반영과 레기온 트리 재확인이 완료되었습니다.','#15803d');
        toast('캐릭터 추가가 완료되었습니다.');
        return runtime;
      }
      if(['failed','cancelled','canceled'].includes(state)){
        const error=new Error(text(runtime?.message,300)||'Server 캐릭터 추가 작업이 완료되지 않았습니다.');
        error.code=stage||state.toUpperCase();
        throw error;
      }

      const index=progressIndexForRuntime(runtime);
      renderAddProgress(index,'running');
      setStatus(text(runtime?.message,300)||ADD_STEPS[index].label+' 진행 중…','#2563eb');
      await wait(ADD_POLL_INTERVAL_MS);
    }
    if(generation!==addPollGeneration)throw new Error('캐릭터 추가 상태 확인이 초기화되었습니다.');
    throw new Error('캐릭터 추가 상태 확인 시간이 초과되었습니다. 잠시 후 레기온 트리를 다시 확인해 주세요.');
  }

  function normalizeServer(item){
    const source=item&&typeof item==='object'?item:{};
    const serverId=positiveInt(source.serverId??source.server_id);
    const raceId=positiveInt(source.raceId??source.race_id);
    const serverName=text(source.serverName??source.server_name);
    const shortName=text(source.shortName??source.server_short_name);
    if(serverId===null||![1,2].includes(raceId)||!serverName)return null;
    return {serverId,raceId,serverName,shortName};
  }

  function serverKey(value){
    return text(value,120).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
  }

  function parseCharacterAddInput(value){
    const raw=text(value,180).normalize('NFKC').trim();
    if(!raw)return {ok:false,code:'CHARACTER_NAME_REQUIRED',message:'캐릭터 이름을 입력해 주세요.'};
    const match=raw.match(/^(.+?)(?:\s*\[([^\[\]]+)\])?$/u);
    if(!match||((raw.includes('[')||raw.includes(']'))&&!match[2])){
      return {ok:false,code:'SERVER_TAG_INVALID',message:'서버는 캐릭터명[약칭] 형식으로 입력해 주세요.'};
    }
    const characterName=text(match[1],120).normalize('NFKC').trim();
    const serverSuffix=text(match[2],80).normalize('NFKC').trim();
    if(!characterName)return {ok:false,code:'CHARACTER_NAME_REQUIRED',message:'캐릭터 이름을 입력해 주세요.'};
    let candidates=[];
    if(serverSuffix){
      const key=serverKey(serverSuffix);
      candidates=serverReference.filter(server=>serverKey(server.serverName)===key||serverKey(server.shortName)===key);
      if(candidates.length>1&&key==='이스')candidates=candidates.filter(server=>server.serverId===2001);
      if(!candidates.length)return {ok:false,code:'SERVER_SUFFIX_NOT_FOUND',message:`서버 약칭 [${serverSuffix}]을(를) 확인할 수 없습니다.`};
      if(candidates.length!==1)return {ok:false,code:'SERVER_SUFFIX_AMBIGUOUS',message:`서버 약칭 [${serverSuffix}]이(가) 중복됩니다. 원본 서버명을 입력해 주세요.`};
    }else return {ok:true,raw,characterName,serverSuffix:'',serverId:null,serverName:'',raceId:null,allActiveServers:true};
    const server=candidates[0];
    return {ok:true,raw,characterName,serverSuffix,serverId:server.serverId,serverName:server.serverName,raceId:server.raceId,allActiveServers:false};
  }

  function normalizeSearchCandidate(item){
    const source=item&&typeof item==='object'?item:{};
    const characterId=text(source.characterId,300),characterName=text(source.characterName,120);
    const serverId=positiveInt(source.serverId),serverName=text(source.serverName,120);
    if(!characterId||!characterName||serverId===null||!serverName)return null;
    return {
      candidateKey:text(source.candidateKey,420)||`${serverId}:${characterId}`,
      characterId,characterName,serverId,serverName,
      serverShortName:text(source.serverShortName,80),
      raceId:positiveInt(source.raceId),raceName:text(source.raceName,40),
      level:positiveInt(source.level),profileImageUrl:text(source.profileImageUrl,500),
      registered:boolean(source.registered)
    };
  }

  function normalizeSearchGroup(item,role){
    const source=item&&typeof item==='object'?item:{};
    if(source.ok!==true||text(source.role,20)!==role)throw new Error('캐릭터 조회 결과 형식을 확인하지 못했습니다.');
    const query=source.query&&typeof source.query==='object'?source.query:{};
    return {role,query:{raw:text(query.raw,180),characterName:text(query.characterName,120),serverSpecified:boolean(query.serverSpecified),serverId:positiveInt(query.serverId),serverName:text(query.serverName,120)},candidates:array(source.candidates).map(normalizeSearchCandidate).filter(Boolean)};
  }

  function candidateExactInput(candidate){
    return candidate?`${candidate.characterName}[${candidate.serverName}]`:'';
  }

  function renderSearchCards(group){
    if(!group||!group.candidates.length)return '<p class="legion-tree-search-empty">정확히 일치하는 캐릭터를 찾지 못했습니다.</p>';
    return group.candidates.map(candidate=>{
      const selected=selectedCandidates[group.role]?.candidateKey===candidate.candidateKey;
      const registered=candidate.registered===true;
      const image=candidate.profileImageUrl?`<img src="${esc(candidate.profileImageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>`:`<span class="legion-tree-search-avatar" aria-hidden="true">${esc(candidate.characterName.slice(0,1))}</span>`;
      const meta=[candidate.serverName,candidate.raceName,candidate.level?`Lv.${candidate.level}`:''].filter(Boolean).join(' · ');
      const registeredBadge=registered?'<span class="legion-tree-search-registered">추가된 캐릭터</span>':'';
      return `<button class="legion-tree-search-card${registered?' is-registered':''}" type="button" data-search-role="${group.role}" data-candidate-key="${esc(candidate.candidateKey)}" aria-pressed="${selected?'true':'false'}" aria-label="${registered?'추가된 캐릭터 · ':''}${esc(candidate.characterName)} · ${esc(meta)}">${registeredBadge}${image}<span><strong>${esc(candidate.characterName)}</strong><small>${esc(meta)}</small></span></button>`;
    }).join('');
  }

  function renderSearchResults(){
    const root=q('#legionTreeSearchResults'),main=q('#legionTreeMainResults'),alt=q('#legionTreeAltResults'),altGroup=q('#legionTreeAltResultsGroup');
    if(!root||!main||!alt||!altGroup)return;
    main.innerHTML=renderSearchCards(searchGroups.main);
    alt.innerHTML=renderSearchCards(searchGroups.alt);
    altGroup.hidden=!searchGroups.alt;
    root.dataset.groupCount=searchGroups.alt?'2':'1';
    positionSearchResults();
    root.hidden=false;
    syncManagementControls();
  }

  function positionSearchResults(){
    const root=q('#legionTreeSearchResults'),subbar=q('.legion-tree-subbar');
    if(!root||!subbar)return false;
    root.style.setProperty('--legion-tree-search-top',`${Math.ceil(subbar.getBoundingClientRect().bottom+8)}px`);
    return true;
  }

  function normalizeMember(item){
    const source=item&&typeof item==='object'?item:{};
    const characterId=positiveInt(source.characterId??source.character_id);
    const characterName=text(source.characterName??source.character_name,120);
    if(characterId===null||!characterName)return null;
    return {
      characterId,
      characterName,
      className:text(source.className??source.class_name,80),
      isMain:boolean(source.isMain??source.is_main),
      mainCharacterId:positiveInt(source.mainCharacterId??source.main_character_id),
      mainCharacterName:text(source.mainCharacterName??source.main_character_name,120),
      serverId:positiveInt(source.serverId??source.server_id),
      serverName:text(source.serverName??source.server_name,120),
      combatPower:nonNegativeNumber(source.combatPower??source.combat_power)
    };
  }

  function sortMembersByCombatPower(members){
    return array(members).map((member,index)=>({member,index})).sort((left,right)=>{
      const leftPower=nonNegativeNumber(left.member?.combatPower);
      const rightPower=nonNegativeNumber(right.member?.combatPower);
      if(leftPower===null&&rightPower!==null)return 1;
      if(leftPower!==null&&rightPower===null)return -1;
      if(leftPower!==null&&rightPower!==null&&leftPower!==rightPower)return rightPower-leftPower;
      return left.index-right.index;
    }).map(entry=>entry.member);
  }

  function normalizeGroup(item,index){
    const source=item&&typeof item==='object'?item:{};
    return {
      groupKey:text(source.groupKey??source.group_key,180)||`group_${index+1}`,
      groupName:text(source.groupName??source.group_name,120),
      parentRoleKey:text(source.parentRoleKey??source.parent_role_key,180),
      unaffiliated:boolean(source.unaffiliated??source.isUnaffiliated??source.is_unaffiliated),
      defaultAffiliation:boolean(source.defaultAffiliation??source.isDefaultAffiliation??source.default_affiliation),
      sortOrder:positiveInt(source.sortOrder??source.sort_order)||index+1,
      members:sortMembersByCombatPower(array(source.members).map(normalizeMember).filter(Boolean))
    };
  }

  function normalizeRole(item,index){
    const source=item&&typeof item==='object'?item:{};
    const roleName=text(source.roleName??source.role_name,120);
    if(!roleName)throw new Error('LEGION_TREE_ROLE_INVALID');
    const roleKey=text(source.roleKey??source.role_key,180)||`role_${index+1}`;
    const groups=array(source.groups).map(normalizeGroup).sort((a,b)=>a.sortOrder-b.sortOrder);
    for(const group of groups){
      if(group.parentRoleKey===roleKey){
        group.parentRoleKey='';
        group.unaffiliated=true;
        group.groupName='소속 외';
      }
    }
    return {
      roleKey,
      roleName,
      slotNo:positiveInt(source.slotNo??source.slot_no)||index+1,
      maxMembers:positiveInt(source.maxMembers??source.max_members),
      groups
    };
  }

  function normalizeStage(item,index){
    const source=item&&typeof item==='object'?item:{};
    const stageNo=positiveInt(source.stageNo??source.stage_no)||index+1;
    const roles=array(source.roles).map(normalizeRole).sort((a,b)=>a.slotNo-b.slotNo);
    if(!roles.length)throw new Error('LEGION_TREE_STAGE_ROLES_EMPTY');
    return {
      stageNo,
      stageName:text(source.stageName??source.stage_name,120)||`${stageNo}단계`,
      roles
    };
  }

  function normalizeLegion(item,expectedName,expectedOrder){
    const source=item&&typeof item==='object'?item:{};
    const legionName=text(source.legionName??source.legion_name,120);
    if(legionName!==expectedName)throw new Error('LEGION_TREE_LEGION_IDENTITY_INVALID');
    const stages=array(source.stages).map(normalizeStage).sort((a,b)=>a.stageNo-b.stageNo);
    if(!stages.length)throw new Error('LEGION_TREE_STAGES_EMPTY');
    const treeState=text(source.treeState??source.tree_state,80);
    const fallbackApplied=boolean(source.fallbackApplied??source.fallback_applied);
    if((treeState==='DEFAULT_FALLBACK')!==fallbackApplied){
      throw new Error('LEGION_TREE_FALLBACK_STATE_INVALID');
    }
    return {
      legionName,
      legionOrder:positiveInt(source.legionOrder??source.legion_order)||expectedOrder,
      revision:Number(source.revision)||0,
      treeState,
      fallbackApplied,
      organizationConfigured:boolean(source.organizationConfigured??source.organization_configured),
      stageCount:positiveInt(source.stageCount??source.stage_count)||stages.length,
      memberCount:Number.isInteger(Number(source.memberCount??source.member_count))
        ?Math.max(0,Number(source.memberCount??source.member_count)):0,
      stages,
      unassignedMembers:sortMembersByCombatPower(array(source.unassignedMembers??source.unassigned_members).map(normalizeMember).filter(Boolean))
    };
  }

  function normalizeTreePayload(payload){
    const source=payload&&typeof payload==='object'?payload:{};
    if(source.ok!==true||text(source.contract,80)!==TREE_CONTRACT||text(source.databaseContract??source.database_contract,40)!==TREE_DATABASE_CONTRACT){
      throw new Error('LEGION_TREE_READ_CONTRACT_INVALID');
    }
    const sourceLegions=array(source.legions);
    const byName=new Map();
    sourceLegions.forEach(item=>{
      const name=text(item?.legionName??item?.legion_name,120);
      if(name&&byName.has(name))throw new Error('LEGION_TREE_DUPLICATE_LEGION');
      if(name)byName.set(name,item);
    });
    const legions=LEGION_ORDER.map((name,index)=>{
      if(!byName.has(name))throw new Error('LEGION_TREE_REQUIRED_LEGION_MISSING');
      return normalizeLegion(byName.get(name),name,index+1);
    });
    return {
      contract:TREE_CONTRACT,
      databaseContract:TREE_DATABASE_CONTRACT,
      generatedAt:text(source.generatedAt??source.generated_at,80),
      legions
    };
  }

  function normalizedClassName(className){
    return text(className,80)
      .replace(/[\s\u200B-\u200D\uFEFF]+/g,'')
      .replace(/[\[(（].*?[\])）]\s*$/g,'')
      .trim();
  }

  function classIconPath(className){
    const file=CLASS_ICON_MAP[normalizedClassName(className)];
    return file?`/assets/images/classes/class_icon_${file}.png`:'';
  }

  function characterIdentityKey(value){
    return text(value,120).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\u200B-\u200D\uFEFF]+/g,'');
  }

  function currentAccountMainCharacterName(){
    const account=window.KinojoAuth?.getAccount?.()||null;
    return text(account?.mainCharacterName??account?.mainCharacter,120);
  }

  function isCurrentAccountCharacter(member){
    const accountKey=characterIdentityKey(currentAccountMainCharacterName());
    if(!accountKey)return false;
    const ownerName=member?.mainCharacterName||(member?.isMain?member?.characterName:'');
    return characterIdentityKey(ownerName)===accountKey;
  }

  function renderCharacter(member){
    const owner=member.isMain?member.characterName:member.mainCharacterName;
    const kind=member.isMain?'본캐':owner?`${owner}의-부캐`:'부캐';
    const icon=classIconPath(member.className);
    const currentAccountCharacter=isCurrentAccountCharacter(member);
    const nameOverflow=Array.from(member.characterName).length>5;
    const image=icon
      ?`<img src="${esc(icon)}" alt="" loading="lazy"/>`
      :'<span class="legion-tree-class-fallback" aria-hidden="true">?</span>';
    return `<button class="legion-tree-character ${member.isMain?'is-main':'is-alt'}${currentAccountCharacter?' is-current-account':''}" type="button" data-character-id="${member.characterId}" data-character-name="${esc(member.characterName)}" data-class-name="${esc(member.className)}" data-is-main="${member.isMain?'true':'false'}" data-main-character-id="${member.mainCharacterId||''}" data-main-character-name="${esc(owner)}" data-server-id="${member.serverId||''}" data-server-name="${esc(member.serverName)}" data-combat-power="${member.combatPower??''}" data-current-account-character="${currentAccountCharacter?'true':'false'}" title="${esc(member.characterName)}" aria-label="${esc(member.characterName)} · ${esc(member.className||'클래스 정보 없음')} · ${esc(kind)}${currentAccountCharacter?' · 내 캐릭터':''}"><span class="legion-tree-kind" title="${esc(kind)}">${esc(kind)}</span>${image}<span class="legion-tree-name${nameOverflow?' is-faded':''}" data-name-overflow="${nameOverflow?'true':'false'}">${esc(member.characterName)}</span></button>`;
  }

  function refreshCurrentAccountHighlights(){
    const root=q('#legionTreeRoot');
    if(!root||typeof root.querySelectorAll!=='function')return 0;
    const ownerKey=characterIdentityKey(currentAccountMainCharacterName());
    let highlighted=0;
    root.querySelectorAll('.legion-tree-character').forEach(card=>{
      const active=Boolean(ownerKey)&&characterIdentityKey(card?.dataset?.mainCharacterName)===ownerKey;
      card.classList?.toggle?.('is-current-account',active);
      if(card?.dataset)card.dataset.currentAccountCharacter=active?'true':'false';
      const original=text(card?.getAttribute?.('aria-label'),300).replace(/ · 내 캐릭터$/,'');
      if(original)card.setAttribute('aria-label',original+(active?' · 내 캐릭터':''));
      if(active)highlighted+=1;
    });
    return highlighted;
  }

  function characterTargetFromCard(card){
    return {
      characterId:text(card?.dataset?.characterId,40),
      name:text(card?.dataset?.characterName,120),
      className:text(card?.dataset?.className,80),
      owner:text(card?.dataset?.mainCharacterName,120),
      serverId:text(card?.dataset?.serverId,40),
      server:text(card?.dataset?.serverName,120),
      legionName:text(card?.closest?.('[data-legion-name]')?.dataset?.legionName,120),
      classIconUrl:classIconPath(card?.dataset?.className)
    };
  }

  function openCharacterDetail(card){
    const modal=window.KinojoCharacterReaction;
    if(!modal||typeof modal.open!=='function'){
      toast('캐릭터 상세 화면을 불러오지 못했습니다. 새로고침해 주세요.');
      return false;
    }
    const target=characterTargetFromCard(card);
    if(!target.characterId||!target.name||!target.serverId){
      toast('캐릭터 식별 정보를 확인하지 못했습니다.');
      return false;
    }
    modal.open({
      source:'legion-tree',
      context:'legion-tree',
      limitPrefix:'kinojo_legion_tree_react',
      target
    });
    return true;
  }

  function renderGroup(group,roleName,hideLabel=false){
    const label=!hideLabel&&group.groupName&&group.groupName!==roleName
      ?`<small class="legion-tree-group-label">${esc(group.groupName)}</small>`:'';
    const members=group.members.map(renderCharacter).join('');
    return `<section class="legion-tree-group" data-group-key="${esc(group.groupKey)}">${label}<div class="legion-tree-member-grid" data-member-count="${group.members.length}" aria-label="${esc(roleName)} 구성원">${members}</div></section>`;
  }

  function renderRoleAssignment(role,{hideGroupLabels=false}={}){
    const branchCount=Math.min(Math.max(role.groups.length,1),5);
    const groups=role.groups.map(group=>renderGroup(group,role.roleName,hideGroupLabels)).join('');
    const memberCount=role.groups.reduce((total,group)=>total+group.members.length,0);
    return memberCount
      ?`<div class="legion-tree-role-groups" data-branch-count="${branchCount}">${groups}</div>`
      :`<p class="legion-tree-empty-role" aria-label="${esc(role.roleName)} 배정 상태">지정 전</p>`;
  }

  function renderRole(role,stage,previousStage,{hideGroupLabels=false}={}){
    const memberCount=role.groups.reduce((total,group)=>total+group.members.length,0);
    const displayName=role.roleName||stage.stageName;
    return `<article class="legion-tree-role" data-role-key="${esc(role.roleKey)}" data-is-empty="${memberCount?'false':'true'}"><div class="legion-tree-role-plate"><strong>${esc(displayName)}</strong></div>${renderRoleAssignment(role,{hideGroupLabels:hideGroupLabels||previousStage?.roles.length===1})}</article>`;
  }

  function renderStage(stage,previousStage){
    const roles=stage.roles.map(role=>renderRole(role,stage,previousStage)).join('');
    return `<section class="legion-tree-stage" data-stage="${stage.stageNo}"><div class="legion-tree-stage-roles" data-role-count="${stage.roles.length}" style="--legion-tree-role-count:${Math.max(stage.roles.length,1)}">${roles}</div></section>`;
  }

  function terminalGroups(stage){
    return stage.roles.flatMap(role=>role.groups.map(group=>({role,group})));
  }

  function terminalRolesForEntries(stage,entries,{renderEmpty=false}={}){
    return stage.roles.map(role=>{
      const groups=entries.filter(entry=>entry.role.roleKey===role.roleKey).map(entry=>entry.group);
      if(!renderEmpty&&!groups.length)return '';
      return renderRole({...role,groups},stage,null,{hideGroupLabels:true});
    }).join('');
  }

  function renderRankBranch(role,stage,terminalStage,entries,previousStage){
    const headCount=role.groups.reduce((total,group)=>total+group.members.length,0);
    const displayName=role.roleName||stage.stageName;
    const terminalRoles=terminalRolesForEntries(terminalStage,entries,{renderEmpty:true});
    return `<article class="legion-tree-role legion-tree-rank-branch" data-role-key="${esc(role.roleKey)}" data-is-empty="${headCount?'false':'true'}"><div class="legion-tree-rank-block"><div class="legion-tree-role-plate"><strong>${esc(displayName)}</strong></div>${renderRoleAssignment(role,{hideGroupLabels:previousStage?.roles.length===1})}</div><div class="legion-tree-connector" aria-hidden="true"></div><div class="legion-tree-terminal-ranks">${terminalRoles}</div></article>`;
  }

  function renderDetachedRankBranch(entries,terminalStage,{unaffiliated=false}={}){
    if(!entries.length)return '';
    const roleKey=unaffiliated?'unaffiliated':'unassigned';
    const title=unaffiliated?'소속 외':'무소속';
    const terminalRoles=terminalRolesForEntries(terminalStage,entries);
    return `<article class="legion-tree-role legion-tree-rank-branch ${unaffiliated?'is-unaffiliated':'is-unassigned'}" data-role-key="${roleKey}"><div class="legion-tree-affiliation-plate">${title}</div><div class="legion-tree-connector" aria-hidden="true"></div><div class="legion-tree-terminal-ranks">${terminalRoles}</div></article>`;
  }

  function renderTerminalBranchStage(stage,terminalStage,previousStage){
    const allTerminal=terminalGroups(terminalStage);
    const parentKeys=new Set(stage.roles.map(role=>role.roleKey));
    const defaults=allTerminal.filter(entry=>entry.group.unaffiliated!==true&&!entry.group.parentRoleKey);
    const automaticParentRoleKey=stage.roles.length===1?stage.roles[0].roleKey:'';
    const branches=stage.roles.map(role=>renderRankBranch(
      role,
      stage,
      terminalStage,
      allTerminal.filter(entry=>entry.group.parentRoleKey===role.roleKey||(automaticParentRoleKey===role.roleKey&&!entry.group.parentRoleKey&&entry.group.unaffiliated!==true)),
      previousStage
    ));
    const independent=allTerminal.filter(entry=>entry.group.unaffiliated===true);
    const unassigned=allTerminal.filter(entry=>entry.group.unaffiliated!==true&&Boolean(entry.group.parentRoleKey)&&!parentKeys.has(entry.group.parentRoleKey));
    if(defaults.length&&!automaticParentRoleKey)branches.push(renderDetachedRankBranch(defaults,terminalStage));
    if(independent.length)branches.push(renderDetachedRankBranch(independent,terminalStage,{unaffiliated:true}));
    if(unassigned.length)branches.push(renderDetachedRankBranch(unassigned,terminalStage));
    return `<section class="legion-tree-stage is-terminal-branches" data-stage="${stage.stageNo}" data-terminal-stage="${terminalStage.stageNo}"><div class="legion-tree-stage-roles" data-role-count="${branches.length}" style="--legion-tree-role-count:${Math.max(branches.length,1)}">${branches.join('')}</div></section>`;
  }

  function renderLegion(legion,index){
    const headingId=`legionTreeLegion${legion.legionOrder}Title`;
    const displayedStages=legion.stages.length>1?legion.stages.slice(0,-1):legion.stages;
    const terminalStage=legion.stages.length>1?legion.stages.at(-1):null;
    const stages=displayedStages.map((stage,index)=>{
      const connector=index?'<div class="legion-tree-connector" aria-hidden="true"></div>':'';
      const previousStage=index?displayedStages[index-1]:null;
      const markup=terminalStage&&index===displayedStages.length-1
        ?renderTerminalBranchStage(stage,terminalStage,previousStage)
        :renderStage(stage,previousStage);
      return connector+markup;
    }).join('');
    const fallbackBadge=legion.fallbackApplied?'<span class="legion-tree-fallback-badge">기본 단계</span>':'';
    const hidden=index===0?'':' hidden';
    return `<section class="legion-tree-legion${legion.legionOrder===1?' is-main-legion':''}" data-legion-index="${index}" data-legion-name="${esc(legion.legionName)}" data-tree-state="${esc(legion.treeState)}" data-fallback-applied="${legion.fallbackApplied?'true':'false'}" aria-hidden="${index===0?'false':'true'}" aria-labelledby="${headingId}"${hidden}><header class="legion-tree-legion-head"><div class="legion-tree-legion-title"><h2 id="${headingId}">${esc(legion.legionName)}</h2></div><div class="legion-tree-legion-meta">${fallbackBadge}<small>${legion.memberCount}명 · ${legion.stageCount}단계</small></div></header><div class="legion-tree-stage-list">${stages}</div></section>`;
  }

  function renderTreeMarkup(model){
    return model.legions.map(renderLegion).join('');
  }

  function updateViewerFade(){
    const root=q('#legionTreeRoot');
    const fade=q('#legionTreeViewerFade');
    if(!root||!fade)return false;
    const remaining=(Number(root.scrollHeight)||0)-(Number(root.clientHeight)||0)-(Number(root.scrollTop)||0);
    const visible=remaining>2;
    fade.dataset.visible=visible?'true':'false';
    fade.setAttribute('aria-hidden','true');
    return visible;
  }

  function animateViewerCard(direction){
    const card=q('#legionTreeViewerCard');
    if(!card?.classList)return false;
    const className=Number(direction)<0?'is-turning-previous':'is-turning-next';
    card.classList.remove('is-turning-previous','is-turning-next');
    card.dataset.turnDirection=Number(direction)<0?'previous':'next';
    void card.offsetWidth;
    card.classList.add(className);
    return true;
  }

  function showLegionAt(index,{resetScroll=true,animate=false,direction=0}={}){
    const root=q('#legionTreeRoot');
    if(!root||typeof root.querySelectorAll!=='function')return false;
    const legions=Array.from(root.querySelectorAll('.legion-tree-legion'));
    if(!legions.length)return false;
    const count=legions.length;
    activeLegionIndex=((Number(index)||0)%count+count)%count;
    legions.forEach((section,sectionIndex)=>{
      const active=sectionIndex===activeLegionIndex;
      section.hidden=!active;
      section.setAttribute('aria-hidden',active?'false':'true');
    });
    if(resetScroll)root.scrollTop=0;
    const active=legions[activeLegionIndex];
    const previous=legions[(activeLegionIndex-1+count)%count];
    const next=legions[(activeLegionIndex+1)%count];
    const previousButton=q('#legionTreePrevBtn');
    const nextButton=q('#legionTreeNextBtn');
    const previousName=text(previous?.dataset?.legionName,120);
    const nextName=text(next?.dataset?.legionName,120);
    if(previousButton){
      previousButton.disabled=count<2;
      previousButton.setAttribute('aria-label',`이전 레기온: ${previousName}`);
      previousButton.title=`이전 레기온: ${previousName}`;
    }
    if(nextButton){
      nextButton.disabled=count<2;
      nextButton.setAttribute('aria-label',`다음 레기온: ${nextName}`);
      nextButton.title=`다음 레기온: ${nextName}`;
    }
    const previousLabel=q('#legionTreePrevName');
    const nextLabel=q('#legionTreeNextName');
    if(previousLabel)previousLabel.textContent=previousName;
    if(nextLabel)nextLabel.textContent=nextName;
    root.dataset.activeLegionIndex=String(activeLegionIndex);
    root.dataset.activeLegionName=text(active?.dataset?.legionName,120);
    const status=q('#legionTreeViewerStatus');
    if(status)status.textContent=`${root.dataset.activeLegionName} 레기온 · ${activeLegionIndex+1}/${count}`;
    if(animate&&count>1)animateViewerCard(direction||1);
    if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(updateViewerFade);
    else updateViewerFade();
    return true;
  }

  function renderTreeData(model){
    const root=q('#legionTreeRoot');
    if(!root)throw new Error('LEGION_TREE_ROOT_MISSING');
    root.innerHTML=renderTreeMarkup(model);
    root.setAttribute('aria-busy','false');
    currentTreeModel=model;
    showLegionAt(activeLegionIndex);
    window.KinojoLegionTreeEditor?.setModel?.(model);
    syncManagementControls();
  }

  function applyTreePayload(payload){
    try{
      const model=normalizeTreePayload(payload);
      renderTreeData(model);
      writeTreeCache(payload);
      clearTreeRecovery();
      const memberCount=model.legions.reduce((sum,legion)=>sum+legion.memberCount,0);
      treeStatusMessage=`조직도 저장 readback 완료 · 레기온 ${model.legions.length}개 · 구성원 ${memberCount}명`;
      refreshStatus();
      return model;
    }catch(error){
      console.warn('[KINOJO][LegionTree] saved tree apply failed',error);
      return null;
    }
  }

  async function loadTreeData(options={}){
    const background=options?.background===true;
    const root=q('#legionTreeRoot');
    if(!background){
      treeStatusMessage='레기온 데이터를 확인하는 중…';
      refreshStatus();
    }
    if(root&&!background&&!currentTreeModel){
      root.setAttribute('aria-busy','true');
      root.innerHTML='<div class="legion-tree-load-state">Server 레기온 데이터를 불러오는 중…</div>';
    }
    try{
      const api=window.KinojoSupabase;
      if(!api||typeof api.rpc!=='function')throw new Error('LEGION_TREE_API_UNAVAILABLE');
      const response=await requestTreePayloadWithRetry(api);
      const payload=response.payload;
      const model=normalizeTreePayload(payload);
      renderTreeData(model);
      writeTreeCache(payload);
      clearTreeRecovery();
      const memberCount=model.legions.reduce((sum,legion)=>sum+legion.memberCount,0);
      const snapshotState=text(payload?.snapshotState,40);
      const snapshotNotice=snapshotState.startsWith('STALE_')?'최근 정상 Server snapshot · ':'';
      const retryNotice=response.attemptCount>1?`재시도 ${response.attemptCount}회 후 연결 · `:'';
      treeStatusMessage=`${snapshotNotice}${retryNotice}레기온 ${model.legions.length}개 · 구성원 ${memberCount}명`;
      refreshStatus();
      window.dispatchEvent(new CustomEvent('kinojo:page-time',{detail:{value:new Date(),label:'레기온 데이터'}}));
      return model;
    }catch(error){
      const cachedPayload=readTreeCache();
      if(cachedPayload){
        const model=normalizeTreePayload(cachedPayload);
        renderTreeData(model);
        treeStatusMessage=`최근 정상 데이터 표시 · 서버 재연결 중 · 레기온 ${model.legions.length}개 · 구성원 ${model.legions.reduce((sum,legion)=>sum+legion.memberCount,0)}명`;
        refreshStatus();
        if(transientTreeReadError(error))scheduleTreeRecovery();
        console.warn('[KINOJO][LegionTree] tree load fallback to cache',error);
        return model;
      }
      if(currentTreeModel){
        treeStatusMessage='현재 레기온 데이터 유지 · 서버 재연결 중';
        refreshStatus();
        if(transientTreeReadError(error))scheduleTreeRecovery();
        console.warn('[KINOJO][LegionTree] tree reload retained current model',error);
        return currentTreeModel;
      }
      currentTreeModel=null;
      window.KinojoLegionTreeEditor?.setModel?.(null);
      const edit=q('#legionTreeEditBtn');
      if(edit)edit.disabled=true;
      treeStatusMessage='레기온 데이터를 불러오지 못했습니다.';
      setStatus(treeStatusMessage,'#dc2626');
      if(root){
        root.setAttribute('aria-busy','false');
        root.innerHTML='<div class="legion-tree-load-state is-error">레기온 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>';
      }
      const fade=q('#legionTreeViewerFade');
      if(fade)fade.dataset.visible='false';
      const previous=q('#legionTreePrevBtn'),next=q('#legionTreeNextBtn');
      if(previous)previous.disabled=true;
      if(next)next.disabled=true;
      if(transientTreeReadError(error))scheduleTreeRecovery();
      console.warn('[KINOJO][LegionTree] tree load failed',error);
      return null;
    }
  }

  async function loadServerReference(){
    const search=q('#legionTreeSearchBtn');
    if(search)search.disabled=true;
    serverReferenceError='';

    try{
      const api=window.KinojoSupabase;
      if(!api||typeof api.rpc!=='function')throw new Error('SERVER_REFERENCE_API_UNAVAILABLE');
      const data=await api.rpc(SERVER_REFERENCE_RPC,{});
      if(!data||data.ok!==true||String(data.contract||'')!=='web-legion-tree-server-reference-v1')throw new Error('SERVER_REFERENCE_CONTRACT_INVALID');
      const normalized=array(data.servers).map(normalizeServer).filter(Boolean);
      if(!normalized.some(item=>item.raceId===1)||!normalized.some(item=>item.raceId===2))throw new Error('SERVER_REFERENCE_EMPTY_RACE');
      serverReference=normalized;
      serverReferenceReady=true;
      syncManagementControls();
      refreshStatus();
    }catch(error){
      serverReference=[];
      serverReferenceReady=false;
      serverReferenceError='서버 기준정보를 불러오지 못했습니다.';
      if(search)search.disabled=true;
      refreshStatus();
      console.warn('[KINOJO][LegionTree] server reference load failed',error);
    }
  }

  function hideSearchResults(){
    const root=q('#legionTreeSearchResults');
    if(root)root.hidden=true;
    return true;
  }

  function clearSearchState(){
    searchGroups={main:null,alt:null};
    selectedCandidates={main:null,alt:null};
    const main=q('#legionTreeMainResults'),alt=q('#legionTreeAltResults');
    if(main)main.innerHTML='';if(alt)alt.innerHTML='';
    hideSearchResults();
  }

  function resetInputs(options={}){
    if((addRequestRunning||searchRequestRunning)&&options.force!==true){
      setStatus('캐릭터 작업이 진행 중이라 입력을 초기화할 수 없습니다.','#b45309');
      return false;
    }
    const main=q('#legionTreeMainName');
    const alt=q('#legionTreeAltName');
    if(main)main.value='';
    if(alt)alt.value='';
    main?.removeAttribute('aria-invalid');
    main?.style.removeProperty('border-color');
    main?.style.removeProperty('box-shadow');
    clearSearchState();
    resetAddProgress();
    syncManagementControls();
    if(options.keepStatus!==true)refreshStatus();
    return true;
  }

  function validateSearchBeforeNetwork(){
    const main=q('#legionTreeMainName');
    const alt=q('#legionTreeAltName');
    const mainName=main?.value.trim()||'';
    const altName=alt?.value.trim()||'';

    // 라-2 hard guard: this branch must stay before every future Server/network call.
    if(!mainName){
      setMainRequiredError(true);
      main?.focus();
      return null;
    }

    setMainRequiredError(false);
    if(!serverReferenceReady){
      setStatus(serverReferenceError||'서버 기준정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.','#dc2626');
      return null;
    }
    const parsedMain=parseCharacterAddInput(mainName);
    const parsedAlt=altName?parseCharacterAddInput(altName):{ok:true};
    if(parsedMain.ok!==true||parsedAlt.ok!==true){
      const invalid=parsedMain.ok!==true?parsedMain:parsedAlt;
      setStatus(invalid.message,'#dc2626');
      (parsedMain.ok!==true?main:alt)?.focus();
      return null;
    }
    if(!canManageLegionTree()){
      setStatus('레기온 트리 캐릭터를 조회·추가할 관리 권한이 없습니다.','#dc2626');
      return null;
    }
    return {mainCharacterName:mainName,altCharacterName:altName};
  }

  async function handleSearch(){
    if(searchRequestRunning||addRequestRunning)return false;
    const request=validateSearchBeforeNetwork();if(!request)return false;
    const api=window.KinojoSupabase;
    if(!api||typeof api.searchLegionTreeCharacters!=='function'){
      setStatus('캐릭터 조회 API를 확인할 수 없습니다. 새로고침해 주세요.','#dc2626');return false;
    }
    searchRequestRunning=true;syncManagementControls();
    setStatus('모든 활성 서버에서 정확히 일치하는 캐릭터를 조회하는 중…','#2563eb');
    try{
      const result=await api.searchLegionTreeCharacters(request);
      if(result?.ok!==true||text(result?.contract,120)!==SEARCH_CONTRACT||result?.readOnly!==true||result?.createsTarget!==false||result?.createsQueue!==false)throw new Error(text(result?.message,300)||'Server 캐릭터 조회 결과를 확인하지 못했습니다.');
      searchGroups={main:normalizeSearchGroup(result.main,'main'),alt:result.alt?normalizeSearchGroup(result.alt,'alt'):null};
      selectedCandidates={main:null,alt:null};
      renderSearchResults();
      const count=searchGroups.main.candidates.length+(searchGroups.alt?.candidates.length||0);
      setStatus(count?`정확히 일치하는 후보 ${count}건 · 본캐${searchGroups.alt?'와 부캐를 각각 ': '를 '}선택해 주세요.`:'정확히 일치하는 캐릭터를 찾지 못했습니다.','#2563eb');
      return true;
    }catch(error){
      setStatus(addErrorMessage(error),'#dc2626');
      console.warn('[KINOJO][LegionTree] character search failed',error);return false;
    }finally{searchRequestRunning=false;syncManagementControls();}
  }

  function selectSearchCandidate(role,key){
    const group=role==='main'?searchGroups.main:role==='alt'?searchGroups.alt:null;
    const candidate=group?.candidates.find(item=>item.candidateKey===key)||null;
    if(!candidate)return false;
    const current=selectedCandidates[role];
    const deselected=current?.candidateKey===candidate.candidateKey;
    selectedCandidates={...selectedCandidates,[role]:deselected?null:candidate};
    renderSearchResults();
    setStatus(hasRequiredSelection()
      ?'선택 완료 · 추가 버튼을 누르면 Server 작업을 시작합니다.'
      :deselected?'후보 선택을 해제했습니다. 필요한 후보를 다시 선택해 주세요.':'본캐와 부캐 후보를 각각 선택해 주세요.'
    ,'#2563eb');
    return true;
  }

  function validateAddBeforeNetwork(){
    if(!canManageLegionTree()){
      setStatus('레기온 트리 캐릭터를 추가할 관리 권한이 없습니다.','#dc2626');return null;
    }
    if(!selectedCandidates.main){setStatus('조회 결과에서 본캐를 선택해 주세요.','#dc2626');return null;}
    if(searchGroups.alt&&!selectedCandidates.alt){setStatus('조회 결과에서 부캐를 선택해 주세요.','#dc2626');return null;}
    return {mainCharacterName:candidateExactInput(selectedCandidates.main),altCharacterName:candidateExactInput(selectedCandidates.alt)};
  }

  async function handleAdd(){
    if(addRequestRunning)return false;
    const request=validateAddBeforeNetwork();
    if(!request)return false;
    const api=window.KinojoSupabase;
    if(!api||typeof api.addLegionTreeCharacter!=='function'){
      setStatus('캐릭터 추가 API를 확인할 수 없습니다. 새로고침해 주세요.','#dc2626');
      return false;
    }

    addRequestRunning=true;
    activeAddSessionId='';
    const generation=++addPollGeneration;
    setAddControlsRunning(true);
    renderAddProgress(0,'running');
    setStatus('Server에서 공식 캐릭터 확인을 시작하는 중…','#2563eb');
    try{
      const accepted=await api.addLegionTreeCharacter(request);
      const sessionId=text(accepted?.queue?.sessionId,240);
      if(accepted?.ok!==true||text(accepted?.contract,120)!==ADD_CONTRACT||text(accepted?.code,80)!==ADD_ACCEPTED_CODE||accepted?.listlessCharacterAdd!==true||accepted?.listAppendPending!==false||!sessionId){
        throw new Error(text(accepted?.message,300)||'Server가 캐릭터 추가 요청을 승인하지 않았습니다.');
      }
      activeAddSessionId=sessionId;
      setStatus(text(accepted.message,300)||'캐릭터 조회를 Server Worker에 인계했습니다.','#2563eb');
      await pollAddCompletion(sessionId,generation);
      return true;
    }catch(error){
      renderAddProgress(activeAddProgressIndex,'error');
      setStatus(addErrorMessage(error),'#dc2626');
      console.warn('[KINOJO][LegionTree] character add failed',error);
      return false;
    }finally{
      if(generation===addPollGeneration){
        addRequestRunning=false;
        activeAddSessionId='';
        setAddControlsRunning(false);
      }
    }
  }

  function bindPage(){
    const search=q('#legionTreeSearchBtn');
    if(search)search.addEventListener('click',()=>{void handleSearch();});
    const add=q('#legionTreeAddBtn');
    if(add){
      add.addEventListener('click',()=>{void handleAdd();});
    }
    q('#legionTreeResetBtn')?.addEventListener('click',resetInputs);
    q('#legionTreeSearchCloseBtn')?.addEventListener('click',hideSearchResults);
    q('#legionTreeEditBtn')?.addEventListener('click',event=>{
      if(!canManageLegionTree()){
        toast('조직도를 편집할 관리 권한이 없습니다.');
        syncManagementControls();
        return;
      }
      if(!currentTreeModel||!window.KinojoLegionTreeEditor?.open){
        toast('조직도 편집 화면을 준비하지 못했습니다. 새로고침해 주세요.');
        return;
      }
      window.KinojoLegionTreeEditor.open({opener:event.currentTarget});
    });
    [q('#legionTreeMainName'),q('#legionTreeAltName')].filter(Boolean).forEach(input=>{
      input.addEventListener('input',event=>{
        clearSearchState();resetAddProgress();syncManagementControls();
        if(event.currentTarget===q('#legionTreeMainName')&&String(event.currentTarget?.value||'').trim())setMainRequiredError(false);
      });
      input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void handleSearch();}});
    });
    q('#legionTreeSearchResults')?.addEventListener('click',event=>{
      const card=event.target?.closest?.('.legion-tree-search-card');
      if(card)selectSearchCandidate(text(card.dataset?.searchRole,20),text(card.dataset?.candidateKey,420));
    });
    document.addEventListener('pointerdown',event=>{
      const panel=q('#legionTreeSearchResults');
      if(!panel||panel.hidden||panel.contains(event.target)||q('#legionTreeSearchBtn')?.contains(event.target))return;
      hideSearchResults();
    });
    document.addEventListener('keydown',event=>{
      const panel=q('#legionTreeSearchResults');
      if(event.key!=='Escape'||!panel||panel.hidden)return;
      event.preventDefault();
      hideSearchResults();
      q('#legionTreeSearchBtn')?.focus();
    });
    window.addEventListener('resize',positionSearchResults,{passive:true});
    window.addEventListener('scroll',positionSearchResults,{passive:true});
    const root=q('#legionTreeRoot');
    q('#legionTreePrevBtn')?.addEventListener('click',()=>showLegionAt(activeLegionIndex-1,{animate:true,direction:-1}));
    q('#legionTreeNextBtn')?.addEventListener('click',()=>showLegionAt(activeLegionIndex+1,{animate:true,direction:1}));
    q('#legionTreeViewer')?.addEventListener('keydown',event=>{
      if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
      if(event.key==='ArrowLeft'){
        event.preventDefault();
        showLegionAt(activeLegionIndex-1,{animate:true,direction:-1});
      }else if(event.key==='ArrowRight'){
        event.preventDefault();
        showLegionAt(activeLegionIndex+1,{animate:true,direction:1});
      }
    });
    root?.addEventListener('scroll',updateViewerFade,{passive:true});
    window.addEventListener('resize',updateViewerFade,{passive:true});
    root?.addEventListener('click',event=>{
      const card=event.target?.closest?.('.legion-tree-character');
      if(card)openCharacterDetail(card);
    });
    root?.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const card=event.target?.closest?.('.legion-tree-character');
      if(!card)return;
      event.preventDefault();
      openCharacterDetail(card);
    });
    window.addEventListener('kinojo:auth-changed',()=>{syncManagementControls();refreshStatus();refreshCurrentAccountHighlights();});
    syncManagementControls();
  }

  function start(){
    bindPage();
    void Promise.allSettled([loadServerReference(),loadTreeData()]);
  }

  window.KinojoLegionTree=Object.freeze({
    normalizeTreePayload,
    sortMembersByCombatPower,
    renderTreeMarkup,
    showLegionAt,
    animateViewerCard,
    updateViewerFade,
    classIconPath,
    characterIdentityKey,
    currentAccountMainCharacterName,
    isCurrentAccountCharacter,
    refreshCurrentAccountHighlights,
    applyTreePayload,
    loadTreeData,
    requestTreePayloadWithRetry,
    transientTreeReadError,
    readTreeCache,
    writeTreeCache,
    clearTreeRecovery,
    handleSearch,
    handleAdd,
    resetInputs,
    parseCharacterAddInput,
    normalizeSearchCandidate,
    normalizeSearchGroup,
    renderSearchCards,
    selectSearchCandidate,
    candidateExactInput,
    progressIndexForRuntime,
    characterTargetFromCard,
    openCharacterDetail,
    getTreeModel:()=>currentTreeModel,
    getViewerState:()=>Object.freeze({activeLegionIndex}),
    getAddState:()=>Object.freeze({running:addRequestRunning,searchRunning:searchRequestRunning,sessionId:activeAddSessionId,progressIndex:activeAddProgressIndex,searchGroups,selectedCandidates})
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
