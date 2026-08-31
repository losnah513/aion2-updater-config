/* KINOJO Legion Tree organization editor · 차-1~차-10 · local draft only */
(function(){
  'use strict';

  const LEGION_ORDER=Object.freeze(['깡','낮','밤','키나노동조합']);
  const MAX_RENDERED_STAGES=50;
  let sourceModel=null;
  let drafts=new Map();
  let selectedLegionName='';
  let opener=null;
  let temporaryRoleSequence=0;
  let editorStatus='변경 내용은 이 창을 닫으면 폐기됩니다.';

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
              assignments.push({
                characterId,
                roleKey,
                parentRoleKey:text(group.parentRoleKey,180)||null
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

  function assignMember(draft,characterId,roleKey){
    const member=draft.members.find(item=>item.characterId===Number(characterId));
    const role=roleByKey(draft,roleKey);
    if(!member||!role)return {ok:false,code:'ASSIGNMENT_TARGET_INVALID'};
    const occupied=draft.assignments.filter(item=>item.roleKey===roleKey&&item.characterId!==member.characterId).length;
    if(role.maxMembers!==null&&occupied>=role.maxMembers)return {ok:false,code:'MAX_MEMBERS_EXCEEDED'};
    const current=assignmentByCharacterId(draft,member.characterId);
    if(current){
      current.roleKey=roleKey;
      current.parentRoleKey=null;
    }else{
      draft.assignments.push({characterId:member.characterId,roleKey,parentRoleKey:null});
    }
    draft.dirty=true;
    return {ok:true,code:'MEMBER_ASSIGNED'};
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
    if(!parentRoleKey){
      assignment.parentRoleKey=null;
      draft.dirty=true;
      return {ok:true,code:'PARENT_CLEARED'};
    }
    const childStage=stageByRoleKey(draft,assignment.roleKey);
    const parentStage=stageByRoleKey(draft,parentRoleKey);
    if(!childStage||!parentStage||parentStage.stageNo>=childStage.stageNo){
      return {ok:false,code:'PARENT_NOT_HIGHER_STAGE'};
    }
    assignment.parentRoleKey=parentRoleKey;
    draft.dirty=true;
    return {ok:true,code:'PARENT_UPDATED'};
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

  function renderParentOptions(draft,assignment,stageNo){
    const options=['<option value="">상위 소속 미지정</option>'];
    for(const stage of draft.stages){
      if(stage.stageNo>=stageNo)continue;
      for(const role of stage.roles){
        const selected=assignment.parentRoleKey===role.roleKey?' selected':'';
        options.push('<option value="'+esc(role.roleKey)+'"'+selected+'>'+esc(stage.stageNo+'단계 · '+role.roleName)+'</option>');
      }
    }
    return options.join('');
  }

  function renderAssignedMember(draft,assignment,stageNo){
    const member=memberById(draft,assignment.characterId);
    if(!member)return '';
    const kind=member.isMain?'본캐':'부캐';
    const parent=stageNo>1
      ?'<label class="legion-tree-editor-parent"><span>상위 소속</span><select data-editor-parent data-character-id="'+member.characterId+'">'+renderParentOptions(draft,assignment,stageNo)+'</select></label>'
      :'';
    return '<li class="legion-tree-editor-member" data-character-id="'+member.characterId+'">'
      +'<div><strong>'+esc(member.characterName)+'</strong><span>'+esc(member.className||'클래스 미확인')+' · '+kind+'</span></div>'
      +parent
      +'<button type="button" data-editor-unassign aria-label="'+esc(member.characterName)+' 배치 해제">배치 해제</button>'
      +'</li>';
  }

  function renderRole(draft,stage,role){
    const assignments=draft.assignments.filter(item=>item.roleKey===role.roleKey);
    const assignedIds=new Set(draft.assignments.map(item=>item.characterId));
    const available=draft.members.filter(member=>!assignedIds.has(member.characterId));
    const capacity=role.maxMembers===null?'인원 제한 없음':'최대 '+role.maxMembers+'명';
    const options=['<option value="">구성원 선택</option>'].concat(available.map(member=>
      '<option value="'+member.characterId+'">'+esc(member.characterName+' · '+(member.className||'클래스 미확인'))+'</option>'
    )).join('');
    return '<article class="legion-tree-editor-role" data-role-key="'+esc(role.roleKey)+'">'
      +'<header><label><span>직급명</span><input type="text" maxlength="120" value="'+esc(role.roleName)+'" data-editor-role-name></label>'
      +'<span class="legion-tree-editor-capacity">'+capacity+'</span>'
      +'<button type="button" class="is-danger" data-editor-delete-role>직급 삭제</button></header>'
      +'<ul class="legion-tree-editor-member-list">'+(assignments.length?assignments.map(item=>renderAssignedMember(draft,item,stage.stageNo)).join(''):'<li class="is-empty">지정된 구성원이 없습니다.</li>')+'</ul>'
      +'<label class="legion-tree-editor-assign"><span>구성원 지정</span><select data-editor-assign-member '+(!available.length?'disabled':'')+'>'+options+'</select></label>'
      +'</article>';
  }

  function renderStage(draft,stage){
    return '<section class="legion-tree-editor-stage" data-stage-no="'+stage.stageNo+'">'
      +'<header><strong>'+stage.stageNo+'단계</strong>'
      +'<label><span>단계명</span><input type="text" maxlength="120" value="'+esc(stage.stageName)+'" data-editor-stage-name></label>'
      +'<button type="button" data-editor-add-role>같은 단계 직급 추가</button></header>'
      +'<div class="legion-tree-editor-role-list">'+stage.roles.map(role=>renderRole(draft,stage,role)).join('')+'</div>'
      +'</section>';
  }

  function renderDialog(){
    const root=q('#legionTreeEditorRoot');
    const draft=currentDraft();
    if(!root||!draft)return;
    const legionOptions=LEGION_ORDER.map(name=>
      '<option value="'+esc(name)+'"'+(name===selectedLegionName?' selected':'')+'>'+esc(name)+'</option>'
    ).join('');
    const assigned=draft.assignments.length;
    const unassigned=Math.max(0,draft.members.length-assigned);
    root.innerHTML='<div class="legion-tree-editor-backdrop" data-editor-close></div>'
      +'<section class="legion-tree-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="legionTreeEditorTitle" aria-describedby="legionTreeEditorBoundary legionTreeEditorStatus" tabindex="-1">'
      +'<header class="legion-tree-editor-head"><div><span>ORGANIZATION DRAFT</span><h2 id="legionTreeEditorTitle">조직도 편집</h2><p id="legionTreeEditorBoundary">현재 단계에서는 화면 초안만 편집합니다. 실제 Server 저장은 타 단계에서 연결됩니다.</p></div>'
      +'<button type="button" class="legion-tree-editor-close" data-editor-close aria-label="조직도 편집 닫기">×</button></header>'
      +'<div class="legion-tree-editor-toolbar"><label><span>레기온 선택</span><select id="legionTreeEditorLegion">'+legionOptions+'</select></label>'
      +'<label><span>단계 수</span><input id="legionTreeEditorStageCount" type="number" min="1" max="'+MAX_RENDERED_STAGES+'" inputmode="numeric" value="'+draft.stageCount+'"></label>'
      +'<div class="legion-tree-editor-summary"><strong>'+draft.members.length+'명</strong><span>배치 '+assigned+' · 미배치 '+unassigned+' · revision '+draft.revision+'</span></div></div>'
      +'<div class="legion-tree-editor-scroll"><div class="legion-tree-editor-stage-list">'+draft.stages.map(stage=>renderStage(draft,stage)).join('')+'</div></div>'
      +'<footer class="legion-tree-editor-foot"><div><button type="button" data-editor-reset '+(!draft.fallbackApplied?'disabled title="기본 조직도 Server 계약은 타 단계에서 연결합니다."':'')+'>기본 조직도로 초기화</button>'
      +'<p id="legionTreeEditorStatus" role="status" data-tone="">'+esc(editorStatus)+'</p></div>'
      +'<div><button type="button" data-editor-cancel>취소</button><button type="button" class="is-primary" data-editor-save disabled title="타 단계에서 Server 저장을 연결합니다.">저장</button></div></footer>'
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

  function resetSelectedDraft(){
    const source=sourceLegion(selectedLegionName);
    if(!source||source.fallbackApplied!==true){
      setStatus('기본 조직도 Server 계약은 타 단계에서 연결합니다.','warning');
      return false;
    }
    drafts.set(selectedLegionName,createEditorDraft(source));
    editorStatus='Server가 반환한 기본 조직도로 초안을 초기화했습니다.';
    renderDialog();
    return true;
  }

  function close(){
    const root=q('#legionTreeEditorRoot');
    if(!root||root.hidden)return false;
    root.hidden=true;
    root.innerHTML='';
    document.body.classList.remove('legion-tree-editor-open');
    document.removeEventListener('keydown',handleKeydown);
    drafts=new Map();
    selectedLegionName='';
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
    const draft=currentDraft();
    if(!draft)return;
    if(target.closest('[data-editor-reset]')){
      resetSelectedDraft();
      return;
    }
    const stageElement=target.closest('[data-stage-no]');
    const roleElement=target.closest('[data-role-key]');
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
    if(target.id==='legionTreeEditorLegion'){
      selectedLegionName=text(target.value,120);
      editorStatus='선택한 레기온의 편집 초안을 표시합니다.';
      renderDialog();
      return;
    }
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
    if(target.matches('[data-editor-assign-member]')&&roleElement){
      const result=assignMember(draft,Number(target.value),roleElement.dataset.roleKey);
      if(result.ok)markChanged('구성원을 직급에 배치했습니다.');
      else setStatus(result.code==='MAX_MEMBERS_EXCEEDED'?'이 직급의 최대 인원을 초과할 수 없습니다.':'구성원을 배치하지 못했습니다.','warning');
      return;
    }
    if(target.matches('[data-editor-parent]')){
      const result=setParentRole(draft,Number(target.dataset.characterId),target.value);
      if(result.ok){draft.dirty=true;setStatus('상위 소속을 초안에 반영했습니다.');}
      else setStatus('상위 소속은 현재 직급보다 높은 단계에서 선택해 주세요.','warning');
    }
  }

  function ensureRoot(){
    const root=q('#legionTreeEditorRoot');
    if(!root)return null;
    if(root.dataset.bound!=='true'){
      root.dataset.bound='true';
      root.addEventListener('click',handleClick);
      root.addEventListener('change',handleChange);
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
    selectedLegionName=LEGION_ORDER.includes(options.legionName)?options.legionName:LEGION_ORDER[0];
    opener=options.opener||document.activeElement;
    editorStatus='변경 내용은 이 창을 닫으면 폐기됩니다.';
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
    assignMember,
    unassignMember,
    setParentRole,
    serializeDraft,
    getSelectedDraft:()=>currentDraft()
  });
})();
