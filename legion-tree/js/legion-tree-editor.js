/* KINOJO Legion Tree organization editor · 차-1~차-10 + 타-1~타-9 + 카-1~카-10 · Server atomic save */
(function(){
  'use strict';

  const LEGION_ORDER=Object.freeze(['깡','낮','밤','키나노동조합']);
  const UNAFFILIATED_PARENT='__unaffiliated__';
  const MAX_RENDERED_STAGES=50;
  const MAX_ROLE_MEMBERS=2147483647;
  let sourceModel=null;
  let drafts=new Map();
  let selectedLegionName='';
  let opener=null;
  let temporaryRoleSequence=0;
  let editorStatus='변경 내용을 확인한 뒤 Server에 저장할 수 있습니다.';
  let saveRunning=false;
  let memberSearches=new Map();

  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>Array.from(root.querySelectorAll(selector));

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

  function cloneMember(member){
    const source=member&&typeof member==='object'?member:{};
    return {
      characterId:positiveInt(source.characterId),
      characterName:text(source.characterName,120),
      className:text(source.className,80),
      isMain:source.isMain===true,
      mainCharacterId:positiveInt(source.mainCharacterId),
      mainCharacterName:text(source.mainCharacterName,120),
      serverId:positiveInt(source.serverId),
      serverName:text(source.serverName,120),
      listRow:positiveInt(source.listRow)
    };
  }

  function temporaryRoleKey(stageNo){
    temporaryRoleSequence+=1;
    return 'draft_s'+stageNo+'_r'+temporaryRoleSequence;
  }

  function roleByKey(draft,roleKey){
    for(const stage of draft?.stages||[]){
      const role=stage.roles.find(item=>item.roleKey===roleKey);
      if(role)return role;
    }
    return null;
  }

  function stageByRoleKey(draft,roleKey){
    return (draft?.stages||[]).find(stage=>stage.roles.some(role=>role.roleKey===roleKey))||null;
  }

  function assignmentByCharacterId(draft,characterId){
    return (draft?.assignments||[]).find(item=>item.characterId===Number(characterId))||null;
  }

  function createEditorDraft(legion){
    if(!legion||!LEGION_ORDER.includes(legion.legionName))throw new Error('LEGION_EDITOR_SOURCE_INVALID');
    const members=[];
    const memberIds=new Set();
    const assignments=[];
    const assignmentIds=new Set();
    const rememberMember=member=>{
      const normalized=cloneMember(member);
      if(normalized.characterId===null||!normalized.characterName||memberIds.has(normalized.characterId))return;
      memberIds.add(normalized.characterId);
      members.push(normalized);
    };
    const stages=(legion.stages||[]).map((stage,stageIndex)=>({
      stageNo:positiveInt(stage.stageNo)||stageIndex+1,
      stageName:text(stage.stageName,120)||String(stageIndex+1)+'단계',
      roles:(stage.roles||[]).map((role,roleIndex)=>{
        const roleKey=text(role.roleKey,180)||temporaryRoleKey(stageIndex+1);
        for(const group of role.groups||[]){
          for(const member of group.members||[]){
            rememberMember(member);
            const characterId=positiveInt(member.characterId);
            if(characterId!==null&&!assignmentIds.has(characterId)){
              assignmentIds.add(characterId);
              const sourceParentRoleKey=text(group.parentRoleKey,180)||null;
              const unaffiliated=stageIndex>0&&(group.unaffiliated===true||sourceParentRoleKey===roleKey);
              assignments.push({
                characterId,
                roleKey,
                parentRoleKey:unaffiliated?null:sourceParentRoleKey,
                unaffiliated
              });
            }
          }
        }
        return {
          roleKey,
          roleName:text(role.roleName,120)||'직급',
          slotNo:positiveInt(role.slotNo)||roleIndex+1,
          maxMembers:positiveInt(role.maxMembers)
        };
      })
    }));
    for(const member of legion.unassignedMembers||[])rememberMember(member);
    return {
      legionName:legion.legionName,
      revision:Number(legion.revision)||0,
      fallbackApplied:legion.fallbackApplied===true,
      organizationConfigured:legion.organizationConfigured===true,
      stageCount:stages.length,
      stages,
      members,
      assignments,
      dirty:false
    };
  }

  function setStageCount(draft,value){
    const next=positiveInt(value);
    if(next===null||next>MAX_RENDERED_STAGES)return {ok:false,code:'STAGE_COUNT_INVALID'};
    if(next<draft.stages.length){
      const removed=draft.stages.slice(next);
      const removedKeys=new Set(removed.flatMap(stage=>stage.roles.map(role=>role.roleKey)));
      const inUse=draft.assignments.some(item=>removedKeys.has(item.roleKey)||removedKeys.has(item.parentRoleKey));
      if(inUse)return {ok:false,code:'STAGE_IN_USE'};
      draft.stages=draft.stages.slice(0,next);
    }else{
      while(draft.stages.length<next){
        const stageNo=draft.stages.length+1;
        draft.stages.push({
          stageNo,
          stageName:String(stageNo)+'단계',
          roles:[{roleKey:temporaryRoleKey(stageNo),roleName:'직급',slotNo:1,maxMembers:null}]
        });
      }
    }
    draft.stages.forEach((stage,index)=>{
      stage.stageNo=index+1;
      stage.roles.forEach((role,roleIndex)=>{role.slotNo=roleIndex+1;});
    });
    draft.stageCount=draft.stages.length;
    draft.dirty=true;
    return {ok:true,code:'STAGE_COUNT_UPDATED'};
  }

  function addRole(draft,stageNo){
    const stage=draft.stages.find(item=>item.stageNo===Number(stageNo));
    if(!stage)return {ok:false,code:'STAGE_NOT_FOUND'};
    const role={
      roleKey:temporaryRoleKey(stage.stageNo),
      roleName:'새 직급',
      slotNo:stage.roles.length+1,
      maxMembers:null
    };
    stage.roles.push(role);
    draft.dirty=true;
    return {ok:true,code:'ROLE_ADDED',role};
  }

  function deleteRole(draft,roleKey){
    const stage=stageByRoleKey(draft,roleKey);
    if(!stage)return {ok:false,code:'ROLE_NOT_FOUND'};
    if(stage.roles.length===1)return {ok:false,code:'LAST_ROLE'};
    if(draft.assignments.some(item=>item.roleKey===roleKey))return {ok:false,code:'ROLE_OCCUPIED'};
    if(draft.assignments.some(item=>item.parentRoleKey===roleKey))return {ok:false,code:'ROLE_IS_PARENT'};
    stage.roles=stage.roles.filter(role=>role.roleKey!==roleKey);
    stage.roles.forEach((role,index)=>{role.slotNo=index+1;});
    draft.dirty=true;
    return {ok:true,code:'ROLE_DELETED'};
  }

  function setRoleMaxMembers(draft,roleKey,value){
    const role=roleByKey(draft,roleKey);
    if(!role)return {ok:false,code:'ROLE_NOT_FOUND'};
    const unlimited=value===null||value===undefined||String(value).trim()==='';
    const next=unlimited?null:positiveInt(value);
    if(!unlimited&&(next===null||next>MAX_ROLE_MEMBERS))return {ok:false,code:'MAX_MEMBERS_INVALID'};
    const occupied=draft.assignments.filter(item=>item.roleKey===roleKey).length;
    if(next!==null&&next<occupied)return {ok:false,code:'MAX_MEMBERS_BELOW_OCCUPANCY',occupied};
    role.maxMembers=next;
    draft.dirty=true;
    return {ok:true,code:'MAX_MEMBERS_UPDATED',maxMembers:next};
  }

  function assignMember(draft,characterId,roleKey){
    const member=draft.members.find(item=>item.characterId===Number(characterId));
    const role=roleByKey(draft,roleKey);
    if(!member)return {ok:false,code:'CHARACTER_NOT_IN_LEGION'};
    if(!role)return {ok:false,code:'ROLE_NOT_FOUND'};
    const occupied=draft.assignments.filter(item=>item.roleKey===roleKey&&item.characterId!==member.characterId).length;
    if(role.maxMembers!==null&&occupied>=role.maxMembers)return {ok:false,code:'MAX_MEMBERS_EXCEEDED'};
    const current=assignmentByCharacterId(draft,member.characterId);
    if(current){
      current.roleKey=roleKey;
      current.parentRoleKey=null;
      current.unaffiliated=false;
    }else{
      draft.assignments.push({characterId:member.characterId,roleKey,parentRoleKey:null,unaffiliated:false});
    }
    draft.dirty=true;
    return {ok:true,code:'MEMBER_ASSIGNED'};
  }

  function assignMembers(draft,characterIds,roleKey){
    const role=roleByKey(draft,roleKey);
    if(!role)return {ok:false,code:'ROLE_NOT_FOUND'};
    const requested=Array.isArray(characterIds)?characterIds:[];
    const ids=[];
    const seen=new Set();
    for(const value of requested){
      const characterId=positiveInt(value);
      if(characterId===null||!draft.members.some(member=>member.characterId===characterId)){
        return {ok:false,code:'CHARACTER_NOT_IN_LEGION'};
      }
      if(!seen.has(characterId)){
        seen.add(characterId);
        ids.push(characterId);
      }
    }
    if(!ids.length)return {ok:false,code:'BATCH_EMPTY'};
    const selectedIds=new Set(ids);
    const occupiedOutsideBatch=draft.assignments.filter(item=>item.roleKey===roleKey&&!selectedIds.has(item.characterId)).length;
    if(role.maxMembers!==null&&occupiedOutsideBatch+ids.length>role.maxMembers){
      return {ok:false,code:'MAX_MEMBERS_EXCEEDED'};
    }
    for(const characterId of ids){
      const current=assignmentByCharacterId(draft,characterId);
      if(current){
        current.roleKey=roleKey;
        current.parentRoleKey=null;
        current.unaffiliated=false;
      }else{
        draft.assignments.push({characterId,roleKey,parentRoleKey:null,unaffiliated:false});
      }
    }
    draft.dirty=true;
    return {ok:true,code:'MEMBERS_ASSIGNED',count:ids.length};
  }

  function unassignMember(draft,characterId){
    const before=draft.assignments.length;
    draft.assignments=draft.assignments.filter(item=>item.characterId!==Number(characterId));
    if(before===draft.assignments.length)return {ok:false,code:'ASSIGNMENT_NOT_FOUND'};
    draft.dirty=true;
    return {ok:true,code:'MEMBER_UNASSIGNED'};
  }

  function setParentRole(draft,characterId,parentRoleKey){
    const assignment=assignmentByCharacterId(draft,characterId);
    if(!assignment)return {ok:false,code:'ASSIGNMENT_NOT_FOUND'};
    const childStage=stageByRoleKey(draft,assignment.roleKey);
    if(parentRoleKey===UNAFFILIATED_PARENT){
      if(!childStage||childStage.stageNo===1)return {ok:false,code:'UNAFFILIATED_NOT_ALLOWED_TOP_STAGE'};
      assignment.parentRoleKey=null;
      assignment.unaffiliated=true;
      draft.dirty=true;
      return {ok:true,code:'UNAFFILIATED_UPDATED'};
    }
    if(!parentRoleKey){
      assignment.parentRoleKey=null;
      assignment.unaffiliated=false;
      draft.dirty=true;
      return {ok:true,code:'PARENT_CLEARED'};
    }
    const parentStage=stageByRoleKey(draft,parentRoleKey);
    if(!childStage||!parentStage||parentStage.stageNo!==childStage.stageNo-1){
      return {ok:false,code:'PARENT_NOT_IMMEDIATE_STAGE'};
    }
    assignment.parentRoleKey=parentRoleKey;
    assignment.unaffiliated=false;
    draft.dirty=true;
    return {ok:true,code:'PARENT_UPDATED'};
  }

  function validationResult(errors){
    return errors.length
      ?{ok:false,code:errors[0].code,message:errors[0].message,errors}
      :{ok:true,code:'DRAFT_VALID',message:'저장 전 검증을 통과했습니다.',errors:[]};
  }

  function validateDraft(draft){
    const errors=[];
    const add=(code,message,details={})=>errors.push({code,message,...details});
    if(!draft||!LEGION_ORDER.includes(draft.legionName)){
      add('LEGION_INVALID','저장할 레기온을 확인하지 못했습니다.');
      return validationResult(errors);
    }
    if(!Array.isArray(draft.stages)||draft.stages.length<1||draft.stages.length>MAX_RENDERED_STAGES||draft.stageCount!==draft.stages.length){
      add('STAGE_COUNT_INVALID','단계 수는 1~'+MAX_RENDERED_STAGES+' 사이여야 합니다.',{path:'stageCount'});
    }
    const roleStageByKey=new Map();
    const roleByKeyMap=new Map();
    for(const [stageIndex,stage] of (draft.stages||[]).entries()){
      const expectedStageNo=stageIndex+1;
      if(stage.stageNo!==expectedStageNo)add('STAGE_SEQUENCE_INVALID',expectedStageNo+'단계 번호가 순서와 일치하지 않습니다.',{stageNo:expectedStageNo,path:'stage'});
      if(!text(stage.stageName,120))add('STAGE_NAME_REQUIRED',expectedStageNo+'단계 이름을 입력해 주세요.',{stageNo:expectedStageNo,path:'stageName'});
      if(!Array.isArray(stage.roles)||!stage.roles.length){
        add('STAGE_ROLES_REQUIRED',expectedStageNo+'단계에는 직급이 하나 이상 필요합니다.',{stageNo:expectedStageNo,path:'stage'});
        continue;
      }
      const slots=new Set();
      for(const [roleIndex,role] of stage.roles.entries()){
        const roleKey=text(role.roleKey,180);
        const roleLabel=text(role.roleName,120)||String(roleIndex+1)+'번 직급';
        if(!roleKey)add('ROLE_KEY_REQUIRED',expectedStageNo+'단계 '+roleLabel+'의 식별자가 없습니다.',{stageNo:expectedStageNo,path:'roleName'});
        else if(roleStageByKey.has(roleKey))add('DUPLICATE_ROLE_KEY',roleLabel+' 직급 식별자가 중복되었습니다.',{stageNo:expectedStageNo,roleKey,path:'roleName'});
        else{
          roleStageByKey.set(roleKey,expectedStageNo);
          roleByKeyMap.set(roleKey,role);
        }
        if(!text(role.roleName,120))add('ROLE_NAME_REQUIRED',expectedStageNo+'단계 직급명을 입력해 주세요.',{stageNo:expectedStageNo,roleKey,path:'roleName'});
        const slotNo=positiveInt(role.slotNo);
        if(slotNo===null)add('ROLE_SLOT_INVALID',expectedStageNo+'단계 '+roleLabel+'의 순서를 확인해 주세요.',{stageNo:expectedStageNo,roleKey,path:'roleName'});
        else if(slots.has(slotNo))add('DUPLICATE_ROLE_SLOT',expectedStageNo+'단계 직급 순서가 중복되었습니다.',{stageNo:expectedStageNo,roleKey,path:'roleName'});
        else slots.add(slotNo);
        if(role.maxMembers!==null&&(positiveInt(role.maxMembers)===null||role.maxMembers>MAX_ROLE_MEMBERS)){
          add('MAX_MEMBERS_INVALID',expectedStageNo+'단계 '+roleLabel+'의 최대 인원은 1명 이상이거나 제한 없음이어야 합니다.',{stageNo:expectedStageNo,roleKey,path:'maxMembers'});
        }
      }
    }
    const memberIds=new Set((draft.members||[]).map(member=>positiveInt(member.characterId)).filter(characterId=>characterId!==null));
    const assignmentIds=new Set();
    const occupiedByRole=new Map();
    for(const assignment of draft.assignments||[]){
      const characterId=positiveInt(assignment.characterId);
      const member=memberById(draft,characterId);
      const memberName=member?.characterName||'ID '+String(assignment.characterId??'?');
      if(characterId===null||!memberIds.has(characterId)){
        add('CHARACTER_NOT_IN_LEGION',memberName+' 캐릭터는 현재 레기온 구성원이 아닙니다.',{characterId,path:'assignment'});
        continue;
      }
      if(assignmentIds.has(characterId))add('DUPLICATE_ASSIGNMENT',memberName+' 캐릭터가 둘 이상의 직급에 배치되었습니다.',{characterId,path:'assignment'});
      else assignmentIds.add(characterId);
      const roleKey=text(assignment.roleKey,180);
      const stageNo=roleStageByKey.get(roleKey);
      if(!stageNo){
        add('ROLE_NOT_FOUND',memberName+' 캐릭터의 직급을 찾을 수 없습니다.',{characterId,roleKey,path:'assignment'});
        continue;
      }
      occupiedByRole.set(roleKey,(occupiedByRole.get(roleKey)||0)+1);
      const parentRoleKey=text(assignment.parentRoleKey,180);
      const unaffiliated=assignment.unaffiliated===true;
      if(stageNo===1){
        if(parentRoleKey||unaffiliated)add('PARENT_NOT_ALLOWED_TOP_STAGE',memberName+' 캐릭터는 최상위 단계이므로 소속을 지정할 수 없습니다.',{characterId,roleKey,path:'parentRole'});
        continue;
      }
      if(!parentRoleKey){
        if(!unaffiliated&&stageNo!==draft.stageCount)add('PARENT_REQUIRED',stageNo+'단계 '+memberName+' 캐릭터의 상위 소속 또는 소속 외를 선택해 주세요.',{stageNo,characterId,roleKey,path:'parentRole'});
        continue;
      }
      if(unaffiliated){
        add('AFFILIATION_CONFLICT',memberName+' 캐릭터의 상위 소속과 소속 외를 동시에 지정할 수 없습니다.',{stageNo,characterId,roleKey,path:'parentRole'});
        continue;
      }
      const parentStageNo=roleStageByKey.get(parentRoleKey);
      if(!parentStageNo)add('PARENT_ROLE_NOT_FOUND',memberName+' 캐릭터의 상위 소속 직급을 찾을 수 없습니다.',{stageNo,characterId,roleKey,path:'parentRole'});
      else if(parentStageNo!==stageNo-1)add('PARENT_NOT_IMMEDIATE_STAGE',stageNo+'단계 '+memberName+' 캐릭터의 상위 소속은 바로 윗 단계에서 선택해 주세요.',{stageNo,characterId,roleKey,path:'parentRole'});
    }
    for(const [roleKey,occupied] of occupiedByRole){
      const role=roleByKeyMap.get(roleKey);
      if(role?.maxMembers!==null&&positiveInt(role.maxMembers)!==null&&occupied>role.maxMembers){
        const stageNo=roleStageByKey.get(roleKey);
        add('MAX_MEMBERS_EXCEEDED',stageNo+'단계 '+(text(role.roleName,120)||'직급')+'의 최대 인원 '+role.maxMembers+'명을 초과했습니다.',{stageNo,roleKey,path:'maxMembers'});
      }
    }
    return validationResult(errors);
  }

  function serializeDraft(draft){
    return {
      legionName:draft.legionName,
      expectedRevision:draft.revision,
      stageCount:draft.stages.length,
      stages:draft.stages.map(stage=>({
        stageNo:stage.stageNo,
        stageName:text(stage.stageName,120),
        roles:stage.roles.map(role=>({
          roleKey:role.roleKey,
          stageNo:stage.stageNo,
          slotNo:role.slotNo,
          roleName:text(role.roleName,120),
          maxMembers:role.maxMembers
        }))
      })),
      assignments:draft.assignments.map((assignment,index)=>({
        characterId:assignment.characterId,
        roleKey:assignment.roleKey,
        parentRoleKey:assignment.parentRoleKey,
        unaffiliated:assignment.unaffiliated===true,
        sortOrder:index
      }))
    };
  }

  function currentDraft(){
    return drafts.get(selectedLegionName)||null;
  }

  function setStatus(message,tone=''){
    editorStatus=text(message,300);
    const status=q('#legionTreeEditorStatus');
    if(!status)return;
    status.textContent=editorStatus;
    status.dataset.tone=tone;
  }

  function memberById(draft,characterId){
    return draft.members.find(member=>member.characterId===Number(characterId))||null;
  }

  function searchLegionMembers(draft,query){
    const needle=text(query,120).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
    if(!needle)return [];
    return (draft?.members||[]).filter(member=>
      text(member.characterName,120).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,'').includes(needle)
    ).sort((a,b)=>a.characterName.localeCompare(b.characterName,'ko-KR')).slice(0,20);
  }

  function memberSearchKey(roleKey){
    return selectedLegionName+'::'+roleKey;
  }

  function renderParentOptions(draft,assignment,stageNo){
    const terminal=stageNo===draft.stageCount;
    const defaultLabel=terminal?'무소속 (상위 부서 없음)':'상위 소속 선택 (필수)';
    const options=['<option value="">'+esc(defaultLabel)+'</option>'];
    for(const stage of draft.stages){
      if(stage.stageNo!==stageNo-1)continue;
      for(const role of stage.roles){
        const selected=assignment.parentRoleKey===role.roleKey?' selected':'';
        options.push('<option value="'+esc(role.roleKey)+'"'+selected+'>'+esc(stage.stageName+' · '+role.roleName)+'</option>');
      }
    }
    options.push('<option value="'+UNAFFILIATED_PARENT+'"'+(assignment.unaffiliated===true?' selected':'')+'>소속 외 (독립 부서)</option>');
    return options.join('');
  }

  function renderAssignedMember(draft,assignment,stageNo){
    const member=memberById(draft,assignment.characterId);
    if(!member)return '';
    const kind=member.isMain?'본캐':'부캐';
    const parentRequired=stageNo>1&&stageNo<draft.stageCount;
    const parent=stageNo>1
      ?'<label class="legion-tree-editor-parent"><span>'+(parentRequired?'상위 소속':'소속')+'</span><select'+(parentRequired?' required':'')+' data-editor-parent data-character-id="'+member.characterId+'">'+renderParentOptions(draft,assignment,stageNo)+'</select></label>'
      :'';
    return '<li class="legion-tree-editor-member" data-character-id="'+member.characterId+'">'
      +'<div><strong>'+esc(member.characterName)+'</strong><span>'+esc(member.className||'클래스 미확인')+' · '+kind+'</span></div>'
      +parent
      +'<button type="button" data-editor-unassign aria-label="'+esc(member.characterName)+' 배치 해제">배치 해제</button>'
      +'</li>';
  }

  function renderMemberSearchResult(draft,role,member,full){
    const assignment=assignmentByCharacterId(draft,member.characterId);
    const assignedRole=assignment?roleByKey(draft,assignment.roleKey):null;
    const alreadyHere=assignment?.roleKey===role.roleKey;
    const disabled=alreadyHere||full;
    const state=alreadyHere?'현재 직급':assignedRole?'현재 '+assignedRole.roleName:'미배치';
    return '<li><div><strong>'+esc(member.characterName)+'</strong><span>'+esc((member.className||'클래스 미확인')+' · '+state)+'</span></div>'
      +'<button type="button" data-editor-assign-result data-character-id="'+member.characterId+'" '+(disabled?'disabled':'')+'>'+(alreadyHere?'배치됨':assignedRole?'이동':'배치')+'</button></li>';
  }

  function renderRole(draft,stage,role){
    const assignments=draft.assignments.filter(item=>item.roleKey===role.roleKey);
    const full=role.maxMembers!==null&&assignments.length>=role.maxMembers;
    const capacity=role.maxMembers===null?assignments.length+'명 · 제한 없음':assignments.length+' / '+role.maxMembers+'명';
    const search=memberSearches.get(memberSearchKey(role.roleKey))||{query:'',submitted:false};
    const matches=search.submitted?searchLegionMembers(draft,search.query):[];
    const resultMarkup=!search.submitted
      ?'<p>이 레기온의 캐릭터 이름을 입력해 조회하세요.</p>'
      :matches.length
        ?'<ul>'+matches.map(member=>renderMemberSearchResult(draft,role,member,full)).join('')+'</ul>'
        :'<p>이 레기온에서 일치하는 구성원을 찾지 못했습니다.</p>';
    return '<article class="legion-tree-editor-role" data-role-key="'+esc(role.roleKey)+'">'
      +'<header><label><span>직급명</span><input type="text" maxlength="120" value="'+esc(role.roleName)+'" data-editor-role-name></label>'
      +'<label class="legion-tree-editor-max-members"><span>최대 인원</span><input type="number" min="1" max="'+MAX_ROLE_MEMBERS+'" inputmode="numeric" placeholder="제한 없음" value="'+(role.maxMembers===null?'':role.maxMembers)+'" data-editor-max-members></label>'
      +'<span class="legion-tree-editor-capacity">'+capacity+'</span>'
      +'<button type="button" class="is-danger" data-editor-delete-role>직급 삭제</button></header>'
      +'<ul class="legion-tree-editor-member-list">'+(assignments.length?assignments.map(item=>renderAssignedMember(draft,item,stage.stageNo)).join(''):'<li class="is-empty">지정된 구성원이 없습니다.</li>')+'</ul>'
      +'<div class="legion-tree-editor-member-search"><label><span>구성원 조회</span><div><input type="search" maxlength="120" autocomplete="off" placeholder="캐릭터 이름" value="'+esc(search.query)+'" data-editor-member-query><button type="button" data-editor-member-search>조회</button></div></label>'
      +'<div class="legion-tree-editor-member-results" role="status">'+resultMarkup+'</div></div>'
      +'</article>';
  }

  function renderStage(draft,stage){
    return '<section class="legion-tree-editor-stage" data-stage-no="'+stage.stageNo+'">'
      +'<header><strong>'+stage.stageNo+'단계</strong>'
      +'<label><span>단계명</span><input type="text" maxlength="120" value="'+esc(stage.stageName)+'" data-editor-stage-name></label>'
      +'<button type="button" data-editor-add-role>같은 단계 직급 추가</button></header>'
      +'<div class="legion-tree-editor-role-list" data-role-count="'+stage.roles.length+'">'+stage.roles.map(role=>renderRole(draft,stage,role)).join('')+'</div>'
      +'</section>';
  }

  function renderDialog(){
    const root=q('#legionTreeEditorRoot');
    const draft=currentDraft();
    if(!root||!draft)return;
    const legionButtons=LEGION_ORDER.map(name=>
      '<button type="button" data-editor-legion="'+esc(name)+'" aria-pressed="'+(name===selectedLegionName?'true':'false')+'">'+esc(name)+'</button>'
    ).join('');
    const assigned=draft.assignments.length;
    const unassigned=Math.max(0,draft.members.length-assigned);
    root.innerHTML='<div class="legion-tree-editor-backdrop" data-editor-close></div>'
      +'<section class="legion-tree-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="legionTreeEditorTitle" aria-describedby="legionTreeEditorBoundary legionTreeEditorStatus" tabindex="-1">'
      +'<header class="legion-tree-editor-head"><div><span>SERVER ORGANIZATION</span><h2 id="legionTreeEditorTitle">조직도 편집</h2><p id="legionTreeEditorBoundary">저장 시 Server가 권한·revision·조직 무결성을 다시 확인하고 한 transaction으로 반영합니다.</p></div>'
      +'<button type="button" class="legion-tree-editor-close" data-editor-close aria-label="조직도 편집 닫기">×</button></header>'
      +'<div class="legion-tree-editor-toolbar"><div class="legion-tree-editor-legions"><span>레기온 선택</span><div role="group" aria-label="레기온 선택">'+legionButtons+'</div></div>'
      +'<label><span>단계 수</span><input id="legionTreeEditorStageCount" type="number" min="1" max="'+MAX_RENDERED_STAGES+'" inputmode="numeric" value="'+draft.stageCount+'"></label>'
      +'<div class="legion-tree-editor-summary"><strong>'+draft.members.length+'명</strong><span>배치 '+assigned+' · 미배치 '+unassigned+' · revision '+draft.revision+'</span></div></div>'
      +'<div class="legion-tree-editor-scroll"><div class="legion-tree-editor-stage-list">'+draft.stages.map(stage=>renderStage(draft,stage)).join('')+'</div></div>'
      +'<footer class="legion-tree-editor-foot"><div><button type="button" data-editor-reset '+(saveRunning?'disabled':'')+'>기본 조직도로 초기화</button>'
      +'<p id="legionTreeEditorStatus" role="status" data-tone="">'+esc(editorStatus)+'</p></div>'
      +'<div><button type="button" data-editor-cancel '+(saveRunning?'disabled':'')+'>취소</button><button type="button" class="is-primary" data-editor-save '+(saveRunning||!draft.dirty?'disabled':'')+'>'+(saveRunning?'저장 중…':'저장')+'</button></div></footer>'
      +'</section>';
    q('.legion-tree-editor-dialog',root)?.focus();
  }

  function markChanged(message){
    const draft=currentDraft();
    if(draft)draft.dirty=true;
    editorStatus=message;
    renderDialog();
  }

  function sourceLegion(name){
    return sourceModel?.legions?.find(legion=>legion.legionName===name)||null;
  }

  function saveErrorMessage(error){
    const data=error?.data&&typeof error.data==='object'?error.data:{};
    const code=text(data.code||error?.code,100);
    if(code==='REVISION_CONFLICT')return '다른 사용자가 먼저 저장했습니다. 창을 닫고 최신 조직도를 다시 확인해 주세요.';
    if(code==='ORGANIZATION_SAVE_FORBIDDEN')return '조직도를 저장할 권한이 없습니다.';
    return text(data.message||error?.message,300)||'조직도를 저장하지 못했습니다.';
  }

  function focusValidationError(error){
    const root=q('#legionTreeEditorRoot');
    if(!root||!error)return;
    const stageElement=qa('[data-stage-no]',root).find(element=>Number(element.dataset.stageNo)===Number(error.stageNo));
    const roleElement=qa('[data-role-key]',stageElement||root).find(element=>element.dataset.roleKey===error.roleKey);
    let target=null;
    if(error.path==='stageCount')target=q('#legionTreeEditorStageCount',root);
    else if(error.path==='stageName')target=q('[data-editor-stage-name]',stageElement||root);
    else if(error.path==='roleName')target=q('[data-editor-role-name]',roleElement||stageElement||root);
    else if(error.path==='maxMembers')target=q('[data-editor-max-members]',roleElement||root);
    else if(error.path==='parentRole')target=qa('[data-editor-parent]',roleElement||root).find(element=>Number(element.dataset.characterId)===Number(error.characterId));
    target=target||roleElement||stageElement||q('.legion-tree-editor-dialog',root);
    target?.setAttribute?.('aria-invalid','true');
    const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
    target?.scrollIntoView?.({block:'center',behavior:reduceMotion?'auto':'smooth'});
    target?.focus?.();
  }

  async function saveSelectedDraft(resetToDefault=false){
    if(saveRunning)return false;
    const draft=currentDraft();
    const api=window.KinojoSupabase;
    if(!draft||!api||typeof api.saveLegionTreeOrganization!=='function'){
      setStatus('조직도 저장 API를 준비하지 못했습니다. 새로고침해 주세요.','warning');
      return false;
    }
    if(resetToDefault&&typeof window.confirm==='function'&&!window.confirm('이 레기온의 저장된 조직도를 지우고 기본 조직도로 복원할까요?'))return false;
    if(!resetToDefault){
      const validation=validateDraft(draft);
      if(!validation.ok){
        editorStatus=validation.message;
        renderDialog();
        setStatus(validation.message,'warning');
        focusValidationError(validation.errors[0]);
        return false;
      }
    }
    saveRunning=true;
    editorStatus=resetToDefault?'기본 조직도로 복원하는 중…':'Server에서 조직도를 저장하고 다시 확인하는 중…';
    renderDialog();
    try{
      const result=await api.saveLegionTreeOrganization(serializeDraft(draft),resetToDefault);
      if(!result||result.ok!==true||result.readbackVerified!==true||!result.tree)throw Object.assign(new Error(result?.message||'조직도 저장 readback을 확인하지 못했습니다.'),{data:result||{}});
      close();
      const applied=window.KinojoLegionTree?.applyTreePayload?.(result.tree);
      if(!applied)throw new Error('저장된 조직도를 화면에 다시 표시하지 못했습니다. 새로고침해 주세요.');
      if(window.KinojoCommonUI?.toast)window.KinojoCommonUI.toast(resetToDefault?'기본 조직도로 복원했습니다.':'조직도를 저장했습니다.');
      return true;
    }catch(error){
      saveRunning=false;
      editorStatus=saveErrorMessage(error);
      renderDialog();
      setStatus(editorStatus,'warning');
      return false;
    }
  }

  function close(){
    const root=q('#legionTreeEditorRoot');
    if(!root||root.hidden)return false;
    root.hidden=true;
    root.innerHTML='';
    document.body.classList.remove('legion-tree-editor-open');
    document.removeEventListener('keydown',handleKeydown);
    drafts=new Map();
    memberSearches=new Map();
    selectedLegionName='';
    saveRunning=false;
    const restore=opener;
    opener=null;
    restore?.focus?.();
    return true;
  }

  function focusableElements(){
    const root=q('#legionTreeEditorRoot');
    return root?qa('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',root):[];
  }

  function applyStageCountInput(target){
    const draft=currentDraft();
    if(!draft)return false;
    const result=setStageCount(draft,target.value);
    const message=result.code==='STAGE_IN_USE'
      ?'구성원 또는 상위 소속이 연결된 단계는 바로 줄일 수 없습니다.'
      :'단계 수는 1~'+MAX_RENDERED_STAGES+' 사이로 입력해 주세요.';
    if(result.ok)markChanged('단계 수를 '+draft.stageCount+'단계로 변경했습니다.');
    else{
      target.value=String(draft.stageCount);
      setStatus(message,'warning');
    }
    return result.ok;
  }

  function runMemberSearch(roleElement){
    const roleKey=roleElement?.dataset.roleKey||'';
    const input=q('[data-editor-member-query]',roleElement);
    const query=text(input?.value,120);
    if(!roleKey||!query){
      setStatus('조회할 캐릭터 이름을 입력해 주세요.','warning');
      input?.focus?.();
      return false;
    }
    memberSearches.set(memberSearchKey(roleKey),{query,submitted:true});
    editorStatus='선택한 레기온 구성원 안에서 조회했습니다.';
    renderDialog();
    return true;
  }

  function handleKeydown(event){
    if(event.key==='Escape'){
      event.preventDefault();
      close();
      return;
    }
    if(event.key==='Enter'&&event.target?.id==='legionTreeEditorStageCount'){
      event.preventDefault();
      applyStageCountInput(event.target);
      return;
    }
    if(event.key==='Enter'&&event.target?.matches?.('[data-editor-member-query]')){
      event.preventDefault();
      runMemberSearch(event.target.closest('[data-role-key]'));
      return;
    }
    if(event.key!=='Tab')return;
    const focusable=focusableElements();
    if(!focusable.length)return;
    const first=focusable[0];
    const last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){
      event.preventDefault();
      last.focus();
    }else if(!event.shiftKey&&document.activeElement===last){
      event.preventDefault();
      first.focus();
    }
  }

  function handleClick(event){
    const target=event.target;
    if(target.closest('[data-editor-close],[data-editor-cancel]')){
      close();
      return;
    }
    const legionButton=target.closest('[data-editor-legion]');
    if(legionButton){
      selectedLegionName=text(legionButton.dataset.editorLegion,120);
      editorStatus='선택한 레기온의 편집 초안을 표시합니다.';
      renderDialog();
      return;
    }
    const draft=currentDraft();
    if(!draft)return;
    if(target.closest('[data-editor-reset]')){
      void saveSelectedDraft(true);
      return;
    }
    if(target.closest('[data-editor-save]')){
      void saveSelectedDraft(false);
      return;
    }
    const stageElement=target.closest('[data-stage-no]');
    const roleElement=target.closest('[data-role-key]');
    if(target.closest('[data-editor-member-search]')&&roleElement){
      runMemberSearch(roleElement);
      return;
    }
    const assignResult=target.closest('[data-editor-assign-result]');
    if(assignResult&&roleElement){
      const result=assignMember(draft,Number(assignResult.dataset.characterId),roleElement.dataset.roleKey);
      if(result.ok){
        memberSearches.delete(memberSearchKey(roleElement.dataset.roleKey));
        markChanged('조회한 레기온 구성원을 직급에 배치했습니다.');
      }else setStatus(result.code==='MAX_MEMBERS_EXCEEDED'?'이 직급의 최대 인원을 초과할 수 없습니다.':'구성원을 배치하지 못했습니다.','warning');
      return;
    }
    if(target.closest('[data-editor-add-role]')){
      const result=addRole(draft,Number(stageElement?.dataset.stageNo));
      if(result.ok)markChanged('같은 단계에 새 직급을 추가했습니다.');
      return;
    }
    if(target.closest('[data-editor-delete-role]')){
      const result=deleteRole(draft,roleElement?.dataset.roleKey||'');
      const message={
        LAST_ROLE:'각 단계에는 직급이 하나 이상 필요합니다.',
        ROLE_OCCUPIED:'구성원이 배치된 직급은 바로 삭제할 수 없습니다.',
        ROLE_IS_PARENT:'상위 소속으로 사용 중인 직급은 바로 삭제할 수 없습니다.'
      }[result.code]||'직급을 삭제하지 못했습니다.';
      if(result.ok)markChanged('직급을 초안에서 삭제했습니다.');
      else setStatus(message,'warning');
      return;
    }
    const memberElement=target.closest('[data-character-id]');
    if(target.closest('[data-editor-unassign]')&&memberElement){
      const result=unassignMember(draft,Number(memberElement.dataset.characterId));
      if(result.ok)markChanged('구성원 배치를 해제했습니다.');
    }
  }

  function handleChange(event){
    const target=event.target;
    const draft=currentDraft();
    if(!draft)return;
    if(target.id==='legionTreeEditorStageCount'){
      applyStageCountInput(target);
      return;
    }
    const stageElement=target.closest('[data-stage-no]');
    const roleElement=target.closest('[data-role-key]');
    if(target.matches('[data-editor-stage-name]')&&stageElement){
      const stage=draft.stages.find(item=>item.stageNo===Number(stageElement.dataset.stageNo));
      if(stage){stage.stageName=text(target.value,120)||String(stage.stageNo)+'단계';draft.dirty=true;setStatus('단계명을 초안에 반영했습니다.');}
      return;
    }
    if(target.matches('[data-editor-role-name]')&&roleElement){
      const role=roleByKey(draft,roleElement.dataset.roleKey);
      if(role){role.roleName=text(target.value,120)||'직급';draft.dirty=true;setStatus('직급명을 초안에 반영했습니다.');}
      return;
    }
    if(target.matches('[data-editor-max-members]')&&roleElement){
      const result=setRoleMaxMembers(draft,roleElement.dataset.roleKey,target.value);
      const message={
        MAX_MEMBERS_INVALID:'최대 인원은 1명 이상의 정수로 입력하거나 비워서 제한 없음으로 설정해 주세요.',
        MAX_MEMBERS_BELOW_OCCUPANCY:'현재 '+String(result.occupied||0)+'명이 배치되어 있어 그보다 작게 설정할 수 없습니다.'
      }[result.code]||'최대 인원을 변경하지 못했습니다.';
      if(result.ok)markChanged(result.maxMembers===null?'최대 인원을 제한 없음으로 변경했습니다.':'최대 인원을 '+result.maxMembers+'명으로 변경했습니다.');
      else{
        const role=roleByKey(draft,roleElement.dataset.roleKey);
        target.value=role?.maxMembers===null?'':String(role?.maxMembers||'');
        setStatus(message,'warning');
      }
      return;
    }
    if(target.matches('[data-editor-parent]')){
      const result=setParentRole(draft,Number(target.dataset.characterId),target.value);
      if(result.ok){draft.dirty=true;setStatus('상위 소속을 초안에 반영했습니다.');}
      else setStatus('상위 소속은 바로 윗 단계에서 선택해 주세요.','warning');
    }
  }

  function handleInput(event){
    const target=event.target;
    if(!target.matches?.('[data-editor-member-query]'))return;
    const roleElement=target.closest('[data-role-key]');
    if(!roleElement)return;
    memberSearches.set(memberSearchKey(roleElement.dataset.roleKey),{query:text(target.value,120),submitted:false});
  }

  function ensureRoot(){
    const root=q('#legionTreeEditorRoot');
    if(!root)return null;
    if(root.dataset.bound!=='true'){
      root.dataset.bound='true';
      root.addEventListener('click',handleClick);
      root.addEventListener('change',handleChange);
      root.addEventListener('input',handleInput);
    }
    return root;
  }

  function setModel(model){
    sourceModel=model&&Array.isArray(model.legions)?model:null;
    if(!sourceModel)close();
  }

  function open(options={}){
    if(!sourceModel)return false;
    const root=ensureRoot();
    if(!root)return false;
    drafts=new Map(sourceModel.legions.map(legion=>[legion.legionName,createEditorDraft(legion)]));
    memberSearches=new Map();
    selectedLegionName=LEGION_ORDER.includes(options.legionName)?options.legionName:LEGION_ORDER[0];
    opener=options.opener||document.activeElement;
    saveRunning=false;
    editorStatus='변경 내용을 확인한 뒤 Server에 저장할 수 있습니다.';
    root.hidden=false;
    document.body.classList.add('legion-tree-editor-open');
    document.addEventListener('keydown',handleKeydown);
    renderDialog();
    return true;
  }

  window.KinojoLegionTreeEditor=Object.freeze({
    setModel,
    open,
    close,
    createEditorDraft,
    setStageCount,
    addRole,
    deleteRole,
    setRoleMaxMembers,
    assignMember,
    assignMembers,
    unassignMember,
    setParentRole,
    searchLegionMembers,
    validateDraft,
    serializeDraft,
    saveSelectedDraft,
    getSelectedDraft:()=>currentDraft()
  });
})();
