/* KINOJO Admin Code requests, members, and role permissions v2026082003 */
(function(A){
  'use strict';
  if(!A) throw new Error('KINOJO Admin shared module is required.');
  const $=A.$;
  const state=A.state;
  const action=(...args)=>A.action(...args);
  const addLog=(...args)=>A.addLog(...args);
  const adminAccount=(...args)=>A.adminAccount(...args);
  const esc=(...args)=>A.esc(...args);
  const isMaster=(...args)=>A.isMaster(...args);
  const option=(...args)=>A.option(...args);
  const refreshDashboard=(...args)=>A.refreshDashboard(...args);
  const roleKey=(...args)=>A.roleKey(...args);
  const roleLabel=(...args)=>A.roleLabel(...args);
  const setStatus=(...args)=>A.setStatus(...args);
  const toast=(...args)=>A.toast(...args);

  function renderRequestPreview(list){
    const root=$('#recentRequests'); if(!root)return;
    root.innerHTML = list.length ? list.map(r=>requestRowHtml(r,true)).join('') : '<div class="admin-empty">대기 중인 코드 요청이 없습니다.</div>';
  }

  function requestRowHtml(r,compact){
    const id=esc(r.requestId||r.request_id||''); const name=esc(r.characterName||r.character_name||'-'); const code=esc(r.requestedCode||r.requested_code||'-');
    const time=esc(r.time||r.requestedAt||r.created_at||'');
    return '<article class="admin-row" data-request-id="'+id+'"><div class="admin-row-main"><strong>'+name+'</strong><span>요청 코드 '+code+' · '+time+'</span></div><div class="admin-row-actions"><span class="admin-pill pending">대기</span>'+(compact?'':'<button class="admin-btn primary" data-approve-request>승인</button><button class="admin-btn danger" data-reject-request>거절</button>')+'</div></article>';
  }

  async function loadCodeRequests(){
    setStatus('#requestStatus','코드 요청 목록을 불러오는 중...','');
    try{ const data=await adminAccount('listCodeRequests',{status:'PENDING',limit:100}); state.requests=data.requests||[]; $('#requestList').innerHTML=state.requests.length?state.requests.map(r=>requestRowHtml(r,false)).join(''):'<div class="admin-empty">대기 중인 코드 요청이 없습니다.</div>'; $('#adminPendingBadge').textContent=String(state.requests.length); setStatus('#requestStatus','요청 '+state.requests.length+'건','ok'); }
    catch(err){ setStatus('#requestStatus',err.message||String(err),'error'); }
  }

  async function processRequest(btn,cmd){
    const row=btn.closest('[data-request-id]'); const requestId=row?.dataset.requestId; if(!requestId)return;
    btn.disabled=true;
    try{ const res=await adminAccount(cmd,{requestId}); if(res.ok===false) throw new Error(res.message||'처리 실패'); toast(cmd==='approveCodeRequest'?'승인 완료':'거절 완료'); addLog('CODE',requestId+' '+cmd); await loadCodeRequests(); await refreshDashboard(); }
    catch(err){ toast(err.message||String(err)); btn.disabled=false; }
  }

  async function loadAccounts(){
    setStatus('#memberStatus','회원 목록을 불러오는 중...','');
    try{
      const data=await adminAccount('listCodes',{});
      state.accounts=data.accounts||[];
      state.memberCodeVisibility=String(data.codeVisibility||'VISIBLE').toUpperCase();
      const search=$('#memberSearch');
      if(search)search.placeholder=state.memberCodeVisibility==='MASKED'?'회원명 / 등급 검색':'회원명 / 코드 / 등급 검색';
      applyMemberFilters();
    }
    catch(err){ setStatus('#memberStatus',err.message||String(err),'error'); }
  }

  const MEMBER_ROLE_LABELS={MEMBER:'Member',STAFF:'Staff',MANAGER:'Manager',SUB_MASTER:'Sub Master',MASTER:'Master'};

  function normalizeMemberRole(value){ return String(value||'MEMBER').trim().toUpperCase().replace(/[\s-]+/g,'_').replace('SUBMASTER','SUB_MASTER'); }

  function getAccountId(a){ return String(a.memberId ?? a.member_id ?? a.id ?? ''); }

  function getAccountCode(a){ return a.codeDisplay || a.code_display || a.code || a.passCode || a.pass_code || ''; }

  function getAccountName(a){ return a.mainCharacter || a.main_character_name || a.mainCharacterName || '-'; }

  function getAccountRole(a){ return normalizeMemberRole(a.role || a.roleLabel || 'MEMBER'); }

  function getAccountRoleLabel(a){ const role=getAccountRole(a); return a.roleLabel || a.role_label || MEMBER_ROLE_LABELS[role] || role; }

  function getAccountCanEdit(a){ return a.canEdit===true || a.can_edit===true; }

  function getAccountAllowedRoles(a){
    const source=Array.isArray(a.allowedRoles)?a.allowedRoles:Array.isArray(a.allowed_roles)?a.allowed_roles:[];
    return source.map(normalizeMemberRole).filter(role=>MEMBER_ROLE_LABELS[role]);
  }

  let memberImageModalRequestId=0;
  const ADMIN_IMAGE_SLOTS=['FRONT','BACK','UPPER_BODY'];
  const ADMIN_IMAGE_SLOT_LABELS={FRONT:'정면',BACK:'후면',UPPER_BODY:'상반신'};

  function memberImageSessionToken_(){
    const token=String(window.KinojoAuth?.getSession?.()?.token||'').trim();
    return /^kws_[A-Za-z0-9_-]{40,80}$/.test(token)?token:'';
  }

  function formatAdminImageBytes_(value){
    const bytes=Number(value||0);
    if(!Number.isFinite(bytes)||bytes<=0)return '-';
    if(bytes<1024)return Math.round(bytes)+' B';
    if(bytes<1024*1024)return (bytes/1024).toFixed(bytes<10240?1:0)+' KB';
    return (bytes/(1024*1024)).toFixed(1)+' MB';
  }

  function formatAdminImageTime_(value){
    const text=String(value||'').trim();
    if(!text)return '-';
    const date=new Date(text);
    return Number.isNaN(date.getTime())?text:date.toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  }

  function renderAdminReferenceSlot_(slot,reference){
    const label=ADMIN_IMAGE_SLOT_LABELS[slot]||slot;
    if(!reference){
      return '<div class="admin-row" data-admin-image-slot="'+esc(slot)+'"><div class="admin-row-main"><strong>'+esc(label)+'</strong><span>등록된 참고 이미지 없음</span></div><span class="admin-pill">미등록</span></div>';
    }
    const mime=esc(reference.mimeType||'-');
    const size=esc(formatAdminImageBytes_(reference.sizeBytes));
    const expires=esc(formatAdminImageTime_(reference.expiresAt));
    return '<div class="admin-row" data-admin-image-slot="'+esc(slot)+'"><div class="admin-row-main"><strong>'+esc(label)+'</strong><span>'+mime+' · '+size+' · 만료 '+expires+'</span></div><span class="admin-pill ok">등록됨</span></div>';
  }

  function renderAdminCharacterImageGroup_(character){
    const id=Number(character?.characterId||0);
    const name=esc(character?.characterName||'이름 없음');
    const server=esc(character?.serverName||'-');
    const className=esc(character?.className||'-');
    const isMain=character?.isMain===true;
    const profile=character?.profile&&typeof character.profile==='object'?character.profile:{};
    const override=profile.override&&typeof profile.override==='object'?profile.override:null;
    const hasOverride=profile.hasOverride===true&&override;
    const profileMeta=hasOverride
      ? esc(override.mimeType||'-')+' · '+esc(formatAdminImageBytes_(override.sizeBytes))+' · 등록 '+esc(formatAdminImageTime_(override.uploadedAt))
      : '등록된 사용자 프로필 이미지 없음 · 공식 이미지 사용';
    const refs=Array.isArray(character?.references)?character.references:[];
    const bySlot={};
    refs.forEach(reference=>{const slot=String(reference?.slot||'');if(ADMIN_IMAGE_SLOTS.includes(slot)&&reference?.active===true)bySlot[slot]=reference;});
    return '<section class="admin-card" data-admin-member-image-character="'+(Number.isInteger(id)&&id>0?id:'')+'">'
      +'<div class="admin-card-head"><div><h2>'+name+'</h2><p>'+server+' · '+className+'</p></div><span class="admin-pill '+(isMain?'info':'')+'">'+(isMain?'본캐':'부캐')+'</span></div>'
      +'<div class="admin-list"><div class="admin-row" data-admin-image-slot="PROFILE"><div class="admin-row-main"><strong>프로필 이미지</strong><span>'+profileMeta+'</span></div><span class="admin-pill '+(hasOverride?'ok':'info')+'">'+(hasOverride?'사용자 이미지':'공식 이미지')+'</span></div></div>'
      +'<div class="admin-list" style="margin-top:8px">'+ADMIN_IMAGE_SLOTS.map(slot=>renderAdminReferenceSlot_(slot,bySlot[slot]||null)).join('')+'</div>'
      +'</section>';
  }

  function renderMemberImageGroups_(data){
    const characters=Array.isArray(data?.characters)?data.characters:[];
    if(!characters.length){
      const reason=data?.ownerResolved===false?'회원 소유 캐릭터를 확정하지 못했습니다.':'등록된 보유 캐릭터가 없습니다.';
      return '<div class="admin-empty">'+esc(reason)+'</div>';
    }
    const summary='<div class="admin-statusline ok">캐릭터 '+characters.length+'명 · 사용자 프로필 '+Number(data?.profileOverrideCount||0)+'건 · 활성 참고 이미지 '+Number(data?.referenceCount||0)+'건</div>';
    return summary+'<div class="admin-list">'+characters.map(renderAdminCharacterImageGroup_).join('')+'</div>';
  }

  async function loadMemberImageGroups_(memberId,requestId){
    const modal=$('#adminMemberImageModal');
    const body=$('#adminMemberImageModalBody',modal||document);
    const token=memberImageSessionToken_();
    const client=window.KinojoSupabaseClientCore;
    if(!token)throw new Error('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.');
    if(!client||typeof client.invokeEdgeFunction!=='function')throw new Error('회원 이미지 조회 모듈을 준비하지 못했습니다.');
    const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'admin-image-list',sessionToken:token,memberId:Number(memberId)});
    if(requestId!==memberImageModalRequestId||!modal?.classList.contains('active')||modal.dataset.memberId!==String(memberId))return null;
    if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'ADMIN_MEMBER_IMAGE_LIST_FAILED');
    if(Number(data?.targetMember?.id)!==Number(memberId))throw new Error('ADMIN_MEMBER_IMAGE_LIST_BINDING_MISMATCH');
    if(String(data?.privacy||'')!=='NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS')throw new Error('ADMIN_MEMBER_IMAGE_PRIVACY_CONTRACT_MISMATCH');
    if(body)body.innerHTML=renderMemberImageGroups_(data);
    return data;
  }

  function ensureMemberImageModal(){
    let modal=$('#adminMemberImageModal');
    if(modal)return modal;
    document.body.insertAdjacentHTML('beforeend','<div class="admin-event-preview-modal" id="adminMemberImageModal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="adminMemberImageModalTitle"><div class="admin-event-preview-backdrop" data-member-image-modal-close></div><section class="admin-event-preview-panel"><header class="admin-event-preview-head"><div><h2 id="adminMemberImageModalTitle">캐릭터 이미지 보기</h2><p id="adminMemberImageModalMember">회원 선택 대기</p></div><button class="admin-icon-btn" data-member-image-modal-close type="button" aria-label="캐릭터 이미지 모달 닫기">×</button></header><div class="admin-event-preview-body" id="adminMemberImageModalBody"><div class="admin-empty">회원의 캐릭터 이미지 목록을 불러올 준비가 되었습니다.</div></div><footer class="admin-event-preview-actions"><button class="admin-btn" data-member-image-modal-close type="button">닫기</button></footer></section></div>');
    modal=$('#adminMemberImageModal');
    modal?.addEventListener('click',event=>{if(event.target.matches('[data-member-image-modal-close]'))closeMemberImageModal();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal?.classList.contains('active'))closeMemberImageModal();});
    return modal;
  }

  function closeMemberImageModal(){
    memberImageModalRequestId+=1;
    const modal=$('#adminMemberImageModal');
    if(!modal)return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden','true');
    delete modal.dataset.memberId;
    const trigger=modal._kinojoTrigger;
    modal._kinojoTrigger=null;
    if(trigger?.isConnected)trigger.focus();
  }

  function openMemberImageModal(target){
    if(!isMaster())return;
    const row=target?.closest?.('[data-member-id]');
    const memberId=String(row?.dataset.memberId||'').trim();
    if(!/^\d+$/.test(memberId))return;
    const memberName=String(row?.dataset.memberName||'회원').trim()||'회원';
    const modal=ensureMemberImageModal();
    if(!modal)return;
    const requestId=++memberImageModalRequestId;
    modal.dataset.memberId=memberId;
    modal._kinojoTrigger=target;
    const label=$('#adminMemberImageModalMember',modal);
    if(label)label.textContent=memberName+' · 회원 #'+memberId;
    const body=$('#adminMemberImageModalBody',modal);
    if(body)body.innerHTML='<div class="admin-empty">캐릭터 이미지 상태를 불러오는 중입니다.</div>';
    modal.setAttribute('aria-hidden','false');
    modal.classList.add('active');
    modal.querySelector('[data-member-image-modal-close]')?.focus();
    loadMemberImageGroups_(memberId,requestId).catch(error=>{
      if(requestId!==memberImageModalRequestId||!modal.classList.contains('active')||modal.dataset.memberId!==memberId)return;
      if(body)body.innerHTML='<div class="admin-callout error"><strong>이미지 목록을 불러오지 못했습니다.</strong><span>'+esc(error?.message||error)+'</span></div>';
    });
  }

  function applyMemberFilters(){
    const q = String($('#memberSearch')?.value || '').trim().toLowerCase();
    const role = String($('#memberRoleFilter')?.value || '').trim();
    const filtered = (state.accounts || []).filter(a=>{
      const searchableCode=(a.codeMasked===true||a.code_masked===true)?'':getAccountCode(a);
      const hay = [getAccountName(a), searchableCode, getAccountRole(a), getAccountRoleLabel(a)].join(' ').toLowerCase();
      if(q && !hay.includes(q)) return false;
      if(role && String(getAccountRole(a)).toUpperCase() !== role) return false;
      return true;
    });
    renderAccounts(filtered);
    setStatus('#memberStatus','회원 '+filtered.length+'건 표시 / 전체 '+(state.accounts||[]).length+'건','ok');
  }

  function renderAccounts(list){
    const root=$('#memberList'); if(!root)return;
    root.innerHTML=list.length?list.map(a=>{
      const memberId=esc(getAccountId(a)); const code=esc(getAccountCode(a)||'••••••'); const name=esc(getAccountName(a));
      const roleKey=getAccountRole(a); const role=esc(roleKey); const roleName=esc(getAccountRoleLabel(a));
      const active=(a.isActive ?? a.is_active ?? a.active)!==false;
      const masked=a.codeMasked===true||a.code_masked===true;
      const canEdit=getAccountCanEdit(a);
      const allowed=getAccountAllowedRoles(a);
      const options=allowed.map(option=>'<option value="'+option+'" '+(option===roleKey?'selected':'')+'>'+esc(MEMBER_ROLE_LABELS[option])+'</option>').join('');
      const imageButton=isMaster()
        ? '<button class="admin-btn" data-member-image-view type="button" aria-label="'+name+' 캐릭터 이미지 보기">캐릭터 이미지 보기</button>'
        : '';
      const controls=canEdit
        ? '<button class="admin-btn admin-member-role-open" data-member-role-open type="button">등급 변경</button>'+(active?'<button class="admin-btn danger" data-member-disable type="button">비활성</button>':'<button class="admin-btn primary" data-member-enable type="button">활성화</button>')+'<button class="admin-btn" data-member-delete type="button">삭제</button>'
        : '<span class="admin-member-locked">변경 권한 없음</span>';
      const editor=canEdit&&options
        ? '<div class="admin-member-role-editor" data-member-role-editor hidden><span><b>현재 '+roleName+'</b>에서 변경</span><select class="admin-select compact" data-member-role-select>'+options+'</select><button class="admin-btn primary" data-member-role-save type="button">적용</button><button class="admin-btn ghost" data-member-role-cancel type="button">취소</button></div>'
        : '';
      return '<article class="admin-row admin-member-row" data-member-id="'+memberId+'" data-member-name="'+name+'" data-member-role="'+role+'"><div class="admin-member-summary"><div class="admin-row-main"><strong>'+name+'</strong><div class="admin-member-meta"><span class="admin-member-code '+(masked?'is-masked':'')+'">회원 코드 <b>'+code+'</b></span><span class="admin-member-role-badge role-'+role.toLowerCase()+'">'+roleName+'</span></div></div><div class="admin-row-actions"><span class="admin-pill '+(active?'ok':'error')+'">'+(active?'활성':'비활성')+'</span>'+imageButton+controls+'</div></div>'+editor+'</article>';
    }).join(''):'<div class="admin-empty">회원 코드가 없습니다.</div>';
    root.querySelectorAll('[data-member-image-view]').forEach(button=>button.addEventListener('click',()=>openMemberImageModal(button)));
  }

  async function handleMemberAction(target){
    const row=target.closest('[data-member-id]'); const memberId=row?.dataset.memberId; if(!memberId)return;
    const memberName=row.dataset.memberName||'회원';
    const currentRole=normalizeMemberRole(row.dataset.memberRole);
    const editor=$('[data-member-role-editor]',row);
    if(target.matches('[data-member-role-open]')){
      if(editor)editor.hidden=!editor.hidden;
      return;
    }
    if(target.matches('[data-member-role-cancel]')){
      if(editor)editor.hidden=true;
      return;
    }
    target.disabled=true;
    try{
      let res;
      if(target.matches('[data-member-role-save]')){
        const nextRole=normalizeMemberRole($('[data-member-role-select]',row)?.value);
        if(nextRole===currentRole){ if(editor)editor.hidden=true; target.disabled=false; return; }
        const before=MEMBER_ROLE_LABELS[currentRole]||currentRole;
        const after=MEMBER_ROLE_LABELS[nextRole]||nextRole;
        if(!confirm(memberName+' 회원의 등급을 '+before+' → '+after+'로 변경할까요?')){target.disabled=false;return;}
        res=await adminAccount('updateRole',{memberId,role:nextRole});
      }
      else if(target.matches('[data-member-disable]')){
        if(!confirm(memberName+' 회원 코드를 비활성화할까요?')){target.disabled=false;return;}
        res=await adminAccount('disableCode',{memberId});
      }
      else if(target.matches('[data-member-enable]')){
        if(!confirm(memberName+' 회원 코드를 활성화할까요?\n\nGoogle list 조회 대상에서 제외된 캐릭터라도 웹 로그인, 미터기 다운로드·실행을 포함한 PASS KEY 기능을 사용할 수 있게 됩니다.')){target.disabled=false;return;}
        res=await adminAccount('enableCode',{memberId});
      }
      else if(target.matches('[data-member-delete]')){
        if(!confirm(memberName+' 회원 코드를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')){target.disabled=false;return;}
        res=await adminAccount('deleteCode',{memberId});
      }
      if(res && res.ok===false) throw new Error(res.message||'회원 처리 실패');
      toast(res?.message||'회원 정보 처리 완료'); addLog('MEMBER',(res?.message||'회원 처리')+' · '+memberName); await loadAccounts();
    }catch(err){ setStatus('#memberStatus',err.message||String(err),'error'); target.disabled=false; }
  }

  const SANCTUARY_ROLE_LABELS={MEMBER:'Member',STAFF:'Staff',MANAGER:'Manager',SUB_MASTER:'Sub Master',MASTER:'Master'};

  function renderSanctuaryRolePermissions(data){
    const root=$('#sanctuaryRolePermissionMatrix');
    const card=$('#sanctuaryRolePermissionCard');
    if(card)card.hidden=!isMaster();
    if(!root||!isMaster())return;
    const roles=Array.isArray(data?.roles)?data.roles:['MEMBER','STAFF','MANAGER','SUB_MASTER','MASTER'];
    const items=Array.isArray(data?.items)?data.items:[];
    root.innerHTML=items.length?'<table class="admin-role-permission-table"><thead><tr><th>기능</th>'+roles.map(role=>'<th>'+esc(SANCTUARY_ROLE_LABELS[role]||role)+'</th>').join('')+'</tr></thead><tbody>'+items.map(item=>'<tr><th><strong>'+esc(item.label||item.permissionKey)+'</strong><small>'+esc(item.description||'')+'</small></th>'+roles.map(role=>{const checked=role==='MASTER'||item.roles?.[role]===true;return '<td><label class="admin-permission-toggle"><input type="checkbox" data-sanctuary-role-permission data-role="'+esc(role)+'" data-permission="'+esc(item.permissionKey)+'" '+(checked?'checked':'')+' '+(role==='MASTER'?'disabled':'')+'/><span>'+(checked?'ON':'OFF')+'</span></label></td>';}).join('')+'</tr>').join('')+'</tbody></table>':'<div class="admin-empty">등록된 성역 권한 항목이 없습니다.</div>';
  }

  async function loadSanctuaryRolePermissions(){
    const card=$('#sanctuaryRolePermissionCard');
    if(card)card.hidden=!isMaster();
    if(!isMaster())return;
    setStatus('#sanctuaryRolePermissionStatus','등급별 권한을 불러오는 중...','');
    try{
      const data=await action('sanctuaryRolePermissions',{});
      if(!data||data.ok===false)throw new Error(data?.message||'권한표 조회 실패');
      state.sanctuaryRolePermissions=data;
      renderSanctuaryRolePermissions(data);
      setStatus('#sanctuaryRolePermissionStatus','등급별 기본 권한이 적용 중입니다. MASTER 권한은 항상 ON입니다.','ok');
    }catch(err){setStatus('#sanctuaryRolePermissionStatus',err.message||String(err),'error');}
  }

  async function setSanctuaryRolePermission(input){
    if(!isMaster()||!input)return;
    input.disabled=true;
    try{
      const data=await action('sanctuaryRolePermissionSet',{role:input.dataset.role,permissionKey:input.dataset.permission,enabled:input.checked});
      if(!data||data.ok===false)throw new Error(data?.message||'권한 저장 실패');
      state.sanctuaryRolePermissions=data;
      renderSanctuaryRolePermissions(data);
      setStatus('#sanctuaryRolePermissionStatus','권한 설정을 저장했습니다. 다음 Server 요청부터 적용됩니다.','ok');
    }catch(err){
      input.checked=!input.checked;
      input.disabled=false;
      setStatus('#sanctuaryRolePermissionStatus',err.message||String(err),'error');
    }
  }

  Object.assign(A,{renderRequestPreview,requestRowHtml,loadCodeRequests,processRequest,loadAccounts,MEMBER_ROLE_LABELS,normalizeMemberRole,getAccountId,getAccountCode,getAccountName,getAccountRole,getAccountRoleLabel,getAccountCanEdit,getAccountAllowedRoles,memberImageSessionToken_,renderMemberImageGroups_,loadMemberImageGroups_,ensureMemberImageModal,openMemberImageModal,closeMemberImageModal,applyMemberFilters,renderAccounts,handleMemberAction,SANCTUARY_ROLE_LABELS,renderSanctuaryRolePermissions,loadSanctuaryRolePermissions,setSanctuaryRolePermission});
})(window.KinojoAdmin);
