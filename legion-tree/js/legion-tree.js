/* KINOJO Legion Tree · Server data + listless character add + atomic organization save + character detail · 마-2~6 + 사-1~7 + 아-1~6 + 자-1~7 + 차-1~10 + 타-1~9 + 파-1~3 */
(function(){
  'use strict';

  const q=(selector,root=document)=>root.querySelector(selector);
  const SERVER_REFERENCE_RPC='kinojo_web_legion_tree_server_reference_v372';
  const TREE_RPC='kinojo_web_get_legion_tree';
  const TREE_CONTRACT='web-legion-tree-v1';
  const TREE_DATABASE_CONTRACT='453';
  const ADD_CONTRACT='legion-tree-character-add-v1';
  const ADD_ACCEPTED_CODE='ADD_QUEUE_ACCEPTED';
  const ADD_POLL_INTERVAL_MS=1400;
  const ADD_POLL_TIMEOUT_MS=15*60*1000;
  const LEGION_ORDER=Object.freeze(['깡','낮','밤','키나노동조합']);
  const DEFAULT_SERVER_ID=2002;
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
  let addRequestRunning=false;
  let activeAddSessionId='';
  let activeAddProgressIndex=0;
  let addPollGeneration=0;
  let currentTreeModel=null;

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

  function array(value){
    return Array.isArray(value)?value:[];
  }

  function toast(message){
    if(window.KinojoCommonUI?.toast)return window.KinojoCommonUI.toast(message);
    if(window.KinojoToast?.show)return window.KinojoToast.show(message);
  }

  function normalStatusMessage(){
    if(serverReferenceError)return serverReferenceError;
    return serverReferenceReady?`이름[서버약칭] · 미표기 시 지켈 · ${treeStatusMessage}`:treeStatusMessage;
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

  function setAddControlsRunning(running){
    const add=q('#legionTreeAddBtn');
    const reset=q('#legionTreeResetBtn');
    if(add)add.disabled=running===true;
    if(reset)reset.disabled=running===true;
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
    }else{
      candidates=serverReference.filter(server=>server.serverId===DEFAULT_SERVER_ID);
      if(candidates.length!==1)return {ok:false,code:'DEFAULT_SERVER_NOT_FOUND',message:'기준 서버 지켈을 확인할 수 없습니다.'};
    }
    const server=candidates[0];
    return {ok:true,raw,characterName,serverSuffix,serverId:server.serverId,serverName:server.serverName,raceId:server.raceId};
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
      serverName:text(source.serverName??source.server_name,120)
    };
  }

  function normalizeGroup(item,index){
    const source=item&&typeof item==='object'?item:{};
    return {
      groupKey:text(source.groupKey??source.group_key,180)||`group_${index+1}`,
      groupName:text(source.groupName??source.group_name,120),
      parentRoleKey:text(source.parentRoleKey??source.parent_role_key,180),
      sortOrder:positiveInt(source.sortOrder??source.sort_order)||index+1,
      members:array(source.members).map(normalizeMember).filter(Boolean)
    };
  }

  function normalizeRole(item,index){
    const source=item&&typeof item==='object'?item:{};
    const roleName=text(source.roleName??source.role_name,120);
    if(!roleName)throw new Error('LEGION_TREE_ROLE_INVALID');
    return {
      roleKey:text(source.roleKey??source.role_key,180)||`role_${index+1}`,
      roleName,
      slotNo:positiveInt(source.slotNo??source.slot_no)||index+1,
      maxMembers:positiveInt(source.maxMembers??source.max_members),
      groups:array(source.groups).map(normalizeGroup).sort((a,b)=>a.sortOrder-b.sortOrder)
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
      unassignedMembers:array(source.unassignedMembers??source.unassigned_members).map(normalizeMember).filter(Boolean)
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

  function renderCharacter(member){
    const kind=member.isMain?'본캐':'부캐';
    const icon=classIconPath(member.className);
    const owner=member.isMain?member.characterName:member.mainCharacterName;
    const nameOverflow=Array.from(member.characterName).length>5;
    const image=icon
      ?`<img src="${esc(icon)}" alt="" loading="lazy"/>`
      :'<span class="legion-tree-class-fallback" aria-hidden="true">?</span>';
    return `<button class="legion-tree-character ${member.isMain?'is-main':'is-alt'}" type="button" data-character-id="${member.characterId}" data-character-name="${esc(member.characterName)}" data-class-name="${esc(member.className)}" data-is-main="${member.isMain?'true':'false'}" data-main-character-id="${member.mainCharacterId||''}" data-main-character-name="${esc(owner)}" data-server-id="${member.serverId||''}" data-server-name="${esc(member.serverName)}" title="${esc(member.characterName)}" aria-label="${esc(member.characterName)} · ${esc(member.className||'클래스 정보 없음')} · ${kind}"><span class="legion-tree-kind">${kind}</span>${image}<span class="legion-tree-name${nameOverflow?' is-faded':''}" data-name-overflow="${nameOverflow?'true':'false'}">${esc(member.characterName)}</span></button>`;
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

  function renderGroup(group,roleName,branchCount){
    const label=group.groupName&&group.groupName!==roleName
      ?`<small class="legion-tree-group-label">${esc(group.groupName)}</small>`:'';
    const members=group.members.map(renderCharacter).join('');
    return `<section class="legion-tree-group" data-group-key="${esc(group.groupKey)}">${label}<div class="legion-tree-member-grid" data-branch-count="${branchCount}" aria-label="${esc(roleName)} 구성원">${members}</div></section>`;
  }

  function renderRole(role,stageNo){
    const branchCount=Math.min(Math.max(role.groups.length,1),5);
    const groups=role.groups.map(group=>renderGroup(group,role.roleName,branchCount)).join('');
    const memberCount=role.groups.reduce((total,group)=>total+group.members.length,0);
    const assignment=memberCount
      ?`<div class="legion-tree-role-groups" data-branch-count="${branchCount}">${groups}</div>`
      :`<p class="legion-tree-empty-role" aria-label="${esc(role.roleName)} 배정 상태">지정 전</p>`;
    return `<article class="legion-tree-role" data-role-key="${esc(role.roleKey)}" data-is-empty="${memberCount?'false':'true'}"><div class="legion-tree-role-plate"><small>${stageNo}단계</small><strong>${esc(role.roleName)}</strong></div>${assignment}</article>`;
  }

  function renderStage(stage){
    const roles=stage.roles.map(role=>renderRole(role,stage.stageNo)).join('');
    return `<section class="legion-tree-stage" data-stage="${stage.stageNo}"><div class="legion-tree-stage-roles">${roles}</div></section>`;
  }

  function renderLegion(legion){
    const headingId=`legionTreeLegion${legion.legionOrder}Title`;
    const stages=legion.stages.map((stage,index)=>{
      const connector=index?'<div class="legion-tree-connector" aria-hidden="true"></div>':'';
      return connector+renderStage(stage);
    }).join('');
    const kicker=legion.legionOrder===1?'MAIN LEGION':`LEGION ${String(legion.legionOrder).padStart(2,'0')}`;
    const fallbackBadge=legion.fallbackApplied?'<span class="legion-tree-fallback-badge">기본 단계</span>':'';
    return `<section class="legion-tree-legion${legion.legionOrder===1?' is-main-legion':''}" data-legion-name="${esc(legion.legionName)}" data-tree-state="${esc(legion.treeState)}" data-fallback-applied="${legion.fallbackApplied?'true':'false'}" aria-labelledby="${headingId}"><header class="legion-tree-legion-head"><div><span>${kicker}</span><h2 id="${headingId}">${esc(legion.legionName)} 레기온</h2></div><div class="legion-tree-legion-meta">${fallbackBadge}<small>${legion.memberCount}명 · ${legion.stageCount}단계</small></div></header><div class="legion-tree-stage-list">${stages}</div></section>`;
  }

  function renderTreeMarkup(model){
    return model.legions.map(renderLegion).join('');
  }

  function renderTreeData(model){
    const root=q('#legionTreeRoot');
    if(!root)throw new Error('LEGION_TREE_ROOT_MISSING');
    root.innerHTML=renderTreeMarkup(model);
    root.setAttribute('aria-busy','false');
    currentTreeModel=model;
    window.KinojoLegionTreeEditor?.setModel?.(model);
    const edit=q('#legionTreeEditBtn');
    if(edit)edit.disabled=false;
  }

  function applyTreePayload(payload){
    try{
      const model=normalizeTreePayload(payload);
      renderTreeData(model);
      const memberCount=model.legions.reduce((sum,legion)=>sum+legion.memberCount,0);
      treeStatusMessage=`조직도 저장 readback 완료 · 레기온 ${model.legions.length}개 · 구성원 ${memberCount}명`;
      refreshStatus();
      return model;
    }catch(error){
      console.warn('[KINOJO][LegionTree] saved tree apply failed',error);
      return null;
    }
  }

  async function loadTreeData(){
    const root=q('#legionTreeRoot');
    treeStatusMessage='레기온 데이터를 확인하는 중…';
    refreshStatus();
    if(root){
      root.setAttribute('aria-busy','true');
      root.innerHTML='<div class="legion-tree-load-state">Server 레기온 데이터를 불러오는 중…</div>';
    }
    try{
      const api=window.KinojoSupabase;
      if(!api||typeof api.rpc!=='function')throw new Error('LEGION_TREE_API_UNAVAILABLE');
      const model=normalizeTreePayload(await api.rpc(TREE_RPC,{}));
      renderTreeData(model);
      const memberCount=model.legions.reduce((sum,legion)=>sum+legion.memberCount,0);
      treeStatusMessage=`레기온 ${model.legions.length}개 · 구성원 ${memberCount}명`;
      refreshStatus();
      window.dispatchEvent(new CustomEvent('kinojo:page-time',{detail:{value:new Date(),label:'레기온 데이터'}}));
      return model;
    }catch(error){
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
      console.warn('[KINOJO][LegionTree] tree load failed',error);
      return null;
    }
  }

  async function loadServerReference(){
    const add=q('#legionTreeAddBtn');
    if(add)add.disabled=true;
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
      if(add)add.disabled=false;
      refreshStatus();
    }catch(error){
      serverReference=[];
      serverReferenceReady=false;
      serverReferenceError='서버 기준정보를 불러오지 못했습니다.';
      if(add)add.disabled=true;
      refreshStatus();
      console.warn('[KINOJO][LegionTree] server reference load failed',error);
    }
  }

  function resetInputs(){
    if(addRequestRunning){
      setStatus('캐릭터 추가가 진행 중이라 입력을 초기화할 수 없습니다.','#b45309');
      return false;
    }
    const main=q('#legionTreeMainName');
    const alt=q('#legionTreeAltName');
    if(main)main.value='';
    if(alt)alt.value='';
    setMainRequiredError(false);
    resetAddProgress();
    return true;
  }

  function validateAddBeforeNetwork(){
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
    return {mainCharacterName:mainName,altCharacterName:altName,serverId:DEFAULT_SERVER_ID};
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
    const add=q('#legionTreeAddBtn');
    if(add){
      add.disabled=false;
      add.addEventListener('click',()=>{void handleAdd();});
    }
    q('#legionTreeResetBtn')?.addEventListener('click',resetInputs);
    q('#legionTreeEditBtn')?.addEventListener('click',event=>{
      if(!currentTreeModel||!window.KinojoLegionTreeEditor?.open){
        toast('조직도 편집 화면을 준비하지 못했습니다. 새로고침해 주세요.');
        return;
      }
      window.KinojoLegionTreeEditor.open({opener:event.currentTarget});
    });
    q('#legionTreeMainName')?.addEventListener('input',event=>{
      if(String(event.currentTarget?.value||'').trim())setMainRequiredError(false);
    });
    const root=q('#legionTreeRoot');
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
  }

  function start(){
    bindPage();
    void Promise.allSettled([loadServerReference(),loadTreeData()]);
  }

  window.KinojoLegionTree=Object.freeze({
    normalizeTreePayload,
    renderTreeMarkup,
    classIconPath,
    applyTreePayload,
    loadTreeData,
    handleAdd,
    resetInputs,
    parseCharacterAddInput,
    progressIndexForRuntime,
    characterTargetFromCard,
    openCharacterDetail,
    getTreeModel:()=>currentTreeModel,
    getAddState:()=>Object.freeze({running:addRequestRunning,sessionId:activeAddSessionId,progressIndex:activeAddProgressIndex})
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
