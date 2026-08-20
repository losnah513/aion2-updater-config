/* KINOJO Admin Code requests, members, and role permissions v2026082001 */
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

  Object.assign(A,{renderRequestPreview,requestRowHtml,loadCodeRequests,processRequest,loadAccounts,MEMBER_ROLE_LABELS,normalizeMemberRole,getAccountId,getAccountCode,getAccountName,getAccountRole,getAccountRoleLabel,getAccountCanEdit,getAccountAllowedRoles,applyMemberFilters,renderAccounts,handleMemberAction,SANCTUARY_ROLE_LABELS,renderSanctuaryRolePermissions,loadSanctuaryRolePermissions,setSanctuaryRolePermission});
})(window.KinojoAdmin);
