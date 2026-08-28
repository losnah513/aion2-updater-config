/* KINOJO Admin Code requests, members, and role permissions v2026082101 */
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

  const MEMBER_PAGE_LIMIT=20;
  let memberSearchTimer_=0;

  function memberListFilters_(){
    return {
      query:String($('#memberSearch')?.value||'').trim(),
      role:String($('#memberRoleFilter')?.value||'').trim()
    };
  }

  function syncMemberPagination_(){
    const previous=$('#memberPrevBtn');
    const next=$('#memberNextBtn');
    const info=$('#memberPageInfo');
    if(previous)previous.disabled=state.memberCursorStack.length===0;
    if(next)next.disabled=!state.memberHasMore||!state.memberNextCursor;
    if(info)info.textContent=state.memberPage+'페이지 · '+state.accounts.length+'건 / 총 '+state.memberTotalCount+'건';
  }

  async function loadAccounts(options={}){
    const reset=options.reset!==false;
    if(reset){
      state.memberPage=1;
      state.memberCursor='';
      state.memberNextCursor='';
      state.memberCursorStack=[];
    }
    setStatus('#memberStatus','회원 목록을 불러오는 중...','');
    try{
      const filters=memberListFilters_();
      const data=await adminAccount('listCodes',{limit:MEMBER_PAGE_LIMIT,cursor:state.memberCursor,query:filters.query,role:filters.role});
      state.accounts=data.accounts||[];
      const page=data.pageInfo||{};
      state.memberTotalCount=Number(page.totalCount||0);
      state.memberHasMore=page.hasMore===true;
      state.memberNextCursor=String(page.nextCursor||'');
      state.memberCodeVisibility=String(data.codeVisibility||'VISIBLE').toUpperCase();
      const search=$('#memberSearch');
      if(search)search.placeholder=state.memberCodeVisibility==='MASKED'?'회원명 앞부분 검색':'회원명 앞부분 / 코드 검색';
      renderAccounts(state.accounts);
      syncMemberPagination_();
      setStatus('#memberStatus','회원 '+state.accounts.length+'건 표시 / 검색 결과 '+state.memberTotalCount+'건','ok');
    }
    catch(err){ setStatus('#memberStatus',err.message||String(err),'error'); }
  }

  function scheduleMemberSearch_(){
    if(memberSearchTimer_)clearTimeout(memberSearchTimer_);
    memberSearchTimer_=setTimeout(()=>{memberSearchTimer_=0;loadAccounts({reset:true});},250);
  }

  async function loadNextMemberPage_(){
    if(!state.memberHasMore||!state.memberNextCursor)return;
    state.memberCursorStack.push(state.memberCursor||'');
    state.memberCursor=state.memberNextCursor;
    state.memberPage+=1;
    await loadAccounts({reset:false});
  }

  async function loadPreviousMemberPage_(){
    if(!state.memberCursorStack.length)return;
    state.memberCursor=state.memberCursorStack.pop()||'';
    state.memberPage=Math.max(1,state.memberPage-1);
    await loadAccounts({reset:false});
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
  let memberImagePreviewRequestId=0;
  let memberImageReviewRequestId=0;
  let memberImageReviewSearchTimer=0;
  let memberImageModalData=null;
  let selectedMemberImageCharacterId=0;
  let memberImageProductionListRequestId=0;
  let memberImageProductionDetailRequestId=0;
  let memberImageProductionAssetRequestId=0;
  let selectedMemberImageRequestId=0;
  const ADMIN_IMAGE_SLOTS=['FRONT','BACK','UPPER_BODY'];
  const ADMIN_IMAGE_SLOT_LABELS={FRONT:'정면',BACK:'후면',UPPER_BODY:'상반신'};
  const ADMIN_IMAGE_REQUEST_STYLE_LABELS={SHONEN_MANGA:'소년만화',ROMANCE_MANGA:'순정만화',ANIMATION:'애니메이션',REALISTIC:'실사풍',CUSTOM:'직접 요청'};
  const ADMIN_IMAGE_REQUEST_STATUS_LABELS={SUBMITTED:'접수',IN_PROGRESS:'제작 중',COMPLETED:'완료',REJECTED:'반려'};

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
    return '<div class="admin-row" data-admin-image-slot="'+esc(slot)+'"><div class="admin-row-main"><strong>'+esc(label)+'</strong><span>'+mime+' · '+size+' · 만료 '+expires+'</span></div><div class="admin-row-actions"><span class="admin-pill ok">등록됨</span><button class="admin-btn" data-admin-image-preview type="button">미리보기</button></div></div>';
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
      +'<div class="admin-list"><div class="admin-row" data-admin-image-slot="PROFILE"><div class="admin-row-main"><strong>프로필 이미지</strong><span>'+profileMeta+'</span></div><div class="admin-row-actions"><span class="admin-pill '+(hasOverride?'ok':'info')+'">'+(hasOverride?'사용자 이미지':'공식 이미지')+'</span>'+(hasOverride?'<button class="admin-btn" data-admin-image-preview type="button">미리보기</button>':'')+'</div></div></div>'
      +'<div class="admin-list" style="margin-top:8px">'+ADMIN_IMAGE_SLOTS.map(slot=>renderAdminReferenceSlot_(slot,bySlot[slot]||null)).join('')+'</div>'
      +'<section class="admin-member-image-request-console" data-admin-image-request-console data-character-id="'+(Number.isInteger(id)&&id>0?id:'')+'" aria-live="polite"><div class="admin-empty">이미지 제작 요청을 불러오는 중입니다.</div></section>'
      +'</section>';
  }

  function adminImageRequestStatusClass_(status){
    const value=String(status||'').toUpperCase();
    if(value==='COMPLETED')return 'ok';
    if(value==='REJECTED')return 'error';
    if(value==='IN_PROGRESS')return 'info';
    return 'pending';
  }

  function adminImageRequestStyleLabel_(styleCode){
    const value=String(styleCode||'').toUpperCase();
    return ADMIN_IMAGE_REQUEST_STYLE_LABELS[value]||'스타일 미지정';
  }

  function adminImageRequestStatusLabel_(status){
    const value=String(status||'').toUpperCase();
    return ADMIN_IMAGE_REQUEST_STATUS_LABELS[value]||value||'-';
  }

  function renderMemberImageRequestCards_(requests,selectedId=selectedMemberImageRequestId){
    const list=Array.isArray(requests)?requests:[];
    const cards=list.length?'<div class="admin-member-image-request-list" role="list" aria-label="이미지 제작 요청 목록">'+list.map(request=>{
      const requestId=Number(request?.requestId||0);
      const status=String(request?.status||'').toUpperCase();
      const slots=(Array.isArray(request?.slots)?request.slots:[]).map(slot=>ADMIN_IMAGE_SLOT_LABELS[String(slot||'').toUpperCase()]||String(slot||'')).filter(Boolean);
      const selected=requestId===Number(selectedId||0);
      return '<div role="listitem"><button class="admin-member-image-request-card '+(selected?'is-selected':'')+'" data-admin-image-request-select="'+requestId+'" type="button" aria-pressed="'+(selected?'true':'false')+'">'
        +'<span class="admin-member-image-request-card-main"><strong>요청 #'+requestId+'</strong><small>'+esc(adminImageRequestStyleLabel_(request?.styleCode))+' · '+esc(slots.join(' · ')||'첨부 없음')+'</small></span>'
        +'<span class="admin-member-image-request-card-side"><em class="admin-pill '+adminImageRequestStatusClass_(status)+'">'+esc(adminImageRequestStatusLabel_(status))+'</em><time>'+esc(formatAdminImageTime_(request?.submittedAt||request?.createdAt))+'</time></span>'
        +'</button></div>';
    }).join('')+'</div>':'<div class="admin-empty">이 캐릭터의 이미지 제작 요청이 없습니다.</div>';
    return '<div class="admin-member-image-request-head"><div><strong>이미지 제작 요청</strong><span>요청을 선택하면 첨부 이미지와 제작 지시를 확인할 수 있습니다.</span></div><em>'+list.length+'건</em></div>'+cards+'<div class="admin-member-image-request-detail" data-admin-image-request-detail-host></div>';
  }

  function renderMemberImageRequestDetail_(request){
    const requestId=Number(request?.requestId||0);
    const status=String(request?.status||'').toUpperCase();
    const items=Array.isArray(request?.items)?request.items:[];
    const history=Array.isArray(request?.history)?request.history:[];
    const allowed=Array.isArray(request?.allowedNextStatuses)?request.allowedNextStatuses.map(value=>String(value||'').toUpperCase()):[];
    const note=String(request?.requestNote||'').trim();
    const itemHtml=items.length?items.map(item=>{
      const slot=String(item?.slot||'').toUpperCase();
      const available=item?.available===true;
      return '<article class="admin-member-image-request-asset" data-admin-image-request-slot="'+esc(slot)+'"><div><strong>'+esc(ADMIN_IMAGE_SLOT_LABELS[slot]||slot)+'</strong><span>'+esc(item?.mimeType||'-')+' · '+esc(formatAdminImageBytes_(item?.sizeBytes))+'</span><small>'+(available?'이미지 보존 '+esc(formatAdminImageTime_(request?.imageExpiresAt))+'까지':'이미지 보존 기간 만료 또는 정리됨')+'</small></div><footer>'
        +(available?'<button class="admin-btn" data-admin-image-request-preview type="button">미리보기</button><button class="admin-btn" data-admin-image-request-download type="button">다운로드</button>':'<span class="admin-pill error">열람 불가</span>')
        +'</footer></article>';
    }).join(''):'<div class="admin-empty">이 요청에 첨부된 이미지가 없습니다.</div>';
    const historyHtml=history.length?'<ol class="admin-member-image-request-history">'+history.map(entry=>'<li><span class="admin-pill '+adminImageRequestStatusClass_(entry?.newStatus)+'">'+esc(adminImageRequestStatusLabel_(entry?.newStatus))+'</span><div><strong>'+esc(entry?.actorKind==='MASTER'?'관리자':'회원')+' 처리</strong><time>'+esc(formatAdminImageTime_(entry?.createdAt))+'</time></div></li>').join('')+'</ol>':'<div class="admin-empty">상태 변경 이력이 없습니다.</div>';
    const actionHtml=allowed.length?'<footer class="admin-member-image-request-actions">'+allowed.map(next=>'<button class="admin-btn '+(next==='REJECTED'?'danger':'primary')+'" data-admin-image-request-status="'+esc(next)+'" type="button">'+esc(next==='IN_PROGRESS'?'제작 시작':next==='COMPLETED'?'완료 처리':'반려 처리')+'</button>').join('')+'</footer>':'';
    return '<article class="admin-member-image-request-detail-card" data-admin-image-request-detail-view="'+requestId+'">'
      +'<header><div><span>제작 요청 #'+requestId+'</span><h3>'+esc(adminImageRequestStyleLabel_(request?.styleCode))+'</h3></div><em class="admin-pill '+adminImageRequestStatusClass_(status)+'">'+esc(adminImageRequestStatusLabel_(status))+'</em></header>'
      +'<dl class="admin-member-image-request-meta"><div><dt>요청 접수</dt><dd>'+esc(formatAdminImageTime_(request?.submittedAt))+'</dd></div><div><dt>첨부 이미지</dt><dd>'+items.length+'장 · 열람 가능 '+items.filter(item=>item?.available===true).length+'장</dd></div></dl>'
      +'<section class="admin-member-image-request-note"><strong>제작 요청 내용</strong><p>'+esc(note||'별도 요청 내용 없음')+'</p></section>'
      +'<section><h4>첨부 이미지</h4><div class="admin-member-image-request-assets">'+itemHtml+'</div></section>'
      +'<section><h4>처리 이력</h4>'+historyHtml+'</section>'+actionHtml+'</article>';
  }

  function renderMemberImageRequestError_(message){
    return '<div class="admin-callout error"><strong>제작 요청을 불러오지 못했습니다.</strong><span>'+esc(message||'알 수 없는 오류')+'</span></div>';
  }

  async function loadMemberImageRequests_(memberId,characterId,preserveRequestId=0){
    const modal=$('#adminMemberImageModal');
    const host=modal?.querySelector('[data-admin-image-request-console][data-character-id="'+Number(characterId)+'"]');
    const token=memberImageSessionToken_();
    const client=window.KinojoSupabaseClientCore;
    const requestId=++memberImageProductionListRequestId;
    memberImageProductionDetailRequestId+=1;
    memberImageProductionAssetRequestId+=1;
    selectedMemberImageRequestId=Number(preserveRequestId||0);
    if(host)host.innerHTML='<div class="admin-empty">이미지 제작 요청을 불러오는 중입니다.</div>';
    try{
      if(!token)throw new Error('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.');
      if(!client||typeof client.invokeEdgeFunction!=='function')throw new Error('제작 요청 조회 모듈을 준비하지 못했습니다.');
      const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'admin-image-request-list',sessionToken:token,memberId:Number(memberId),characterId:Number(characterId),requestStatus:'ALL',limit:100});
      if(requestId!==memberImageProductionListRequestId||!modal?.classList.contains('active')||modal.dataset.memberId!==String(memberId)||Number(selectedMemberImageCharacterId)!==Number(characterId))return null;
      if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'ADMIN_IMAGE_REQUEST_LIST_FAILED');
      if(Number(data.targetMemberId)!==Number(memberId)||Number(data.characterId)!==Number(characterId))throw new Error('ADMIN_IMAGE_REQUEST_LIST_BINDING_MISMATCH');
      if(String(data.privacy||'')!=='NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS')throw new Error('ADMIN_IMAGE_REQUEST_LIST_PRIVACY_MISMATCH');
      const requests=Array.isArray(data.requests)?data.requests:[];
      if(!requests.some(request=>Number(request?.requestId||0)===selectedMemberImageRequestId))selectedMemberImageRequestId=0;
      if(host)host.innerHTML=renderMemberImageRequestCards_(requests,selectedMemberImageRequestId);
      if(selectedMemberImageRequestId)loadMemberImageRequestDetail_(memberId,characterId,selectedMemberImageRequestId).catch(error=>{const detail=host?.querySelector('[data-admin-image-request-detail-host]');if(detail)detail.innerHTML=renderMemberImageRequestError_(error?.message||error);});
      return data;
    }catch(error){
      if(requestId===memberImageProductionListRequestId&&host)host.innerHTML=renderMemberImageRequestError_(error?.message||error);
      return null;
    }
  }

  async function loadMemberImageRequestDetail_(memberId,characterId,imageRequestId){
    const modal=$('#adminMemberImageModal');
    const host=modal?.querySelector('[data-admin-image-request-console][data-character-id="'+Number(characterId)+'"]');
    const detail=host?.querySelector('[data-admin-image-request-detail-host]');
    const token=memberImageSessionToken_();
    const client=window.KinojoSupabaseClientCore;
    const requestId=++memberImageProductionDetailRequestId;
    selectedMemberImageRequestId=Number(imageRequestId||0);
    host?.querySelectorAll('[data-admin-image-request-select]').forEach(button=>{const selected=Number(button.dataset.adminImageRequestSelect||0)===selectedMemberImageRequestId;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',selected?'true':'false');});
    if(detail)detail.innerHTML='<div class="admin-empty">선택한 제작 요청을 불러오는 중입니다.</div>';
    if(!token)throw new Error('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.');
    if(!client||typeof client.invokeEdgeFunction!=='function')throw new Error('제작 요청 상세 모듈을 준비하지 못했습니다.');
    const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'admin-image-request-detail',sessionToken:token,memberId:Number(memberId),characterId:Number(characterId),requestId:Number(imageRequestId)});
    if(requestId!==memberImageProductionDetailRequestId||selectedMemberImageRequestId!==Number(imageRequestId)||!modal?.classList.contains('active')||modal.dataset.memberId!==String(memberId)||Number(selectedMemberImageCharacterId)!==Number(characterId))return null;
    if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'ADMIN_IMAGE_REQUEST_DETAIL_FAILED');
    if(Number(data.targetMemberId)!==Number(memberId)||Number(data.characterId)!==Number(characterId)||Number(data.requestId)!==Number(imageRequestId))throw new Error('ADMIN_IMAGE_REQUEST_DETAIL_BINDING_MISMATCH');
    if(String(data.privacy||'')!=='NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS')throw new Error('ADMIN_IMAGE_REQUEST_DETAIL_PRIVACY_MISMATCH');
    if(detail){detail.innerHTML=renderMemberImageRequestDetail_(data);detail.scrollIntoView({block:'nearest'});}
    return data;
  }

  function defaultMemberImageCharacterId_(characters){
    const list=Array.isArray(characters)?characters:[];
    const preferred=list.find(character=>character?.isMain===true)||list[0]||null;
    const id=Number(preferred?.characterId||0);
    return Number.isInteger(id)&&id>0?id:0;
  }

  function renderMemberImageCharacterSelector_(characters,selectedId){
    return '<div class="admin-member-image-character-selector" role="listbox" aria-label="이미지를 확인할 캐릭터">'+characters.map(character=>{
      const id=Number(character?.characterId||0);
      const selected=id===Number(selectedId||0);
      const name=esc(character?.characterName||'이름 없음');
      const server=esc(character?.serverName||'-');
      const className=esc(character?.className||'-');
      return '<button class="admin-member-image-character-btn '+(selected?'is-selected':'')+'" data-admin-image-character-select="'+id+'" type="button" role="option" aria-selected="'+(selected?'true':'false')+'"><span><strong>'+name+'</strong><small>'+server+' · '+className+'</small></span><em class="admin-pill '+(character?.isMain===true?'info':'')+'">'+(character?.isMain===true?'본캐':'부캐')+'</em></button>';
    }).join('')+'</div>';
  }

  function renderMemberImageGroups_(data,selectedCharacterId=selectedMemberImageCharacterId){
    const characters=Array.isArray(data?.characters)?data.characters:[];
    if(!characters.length){
      const reason=data?.ownerResolved===false?'회원 소유 캐릭터를 확정하지 못했습니다.':'등록된 보유 캐릭터가 없습니다.';
      return '<div class="admin-empty">'+esc(reason)+'</div>';
    }
    const selectedId=characters.some(character=>Number(character?.characterId||0)===Number(selectedCharacterId||0))?Number(selectedCharacterId):defaultMemberImageCharacterId_(characters);
    const selected=characters.find(character=>Number(character?.characterId||0)===selectedId)||characters[0];
    const summary='<div class="admin-statusline ok">캐릭터 '+characters.length+'명 · 사용자 프로필 '+Number(data?.profileOverrideCount||0)+'건 · 활성 참고 이미지 '+Number(data?.referenceCount||0)+'건</div>';
    const selector='<section class="admin-member-image-selector-wrap"><div class="admin-member-image-selector-head"><strong>캐릭터 선택</strong><span>한 캐릭터씩 이미지 상태를 확인합니다.</span></div>'+renderMemberImageCharacterSelector_(characters,selectedId)+'</section>';
    const preview='<section class="admin-card" id="adminMemberImagePreview" hidden aria-live="polite"></section>';
    const detail='<div class="admin-member-image-detail" data-admin-member-image-detail>'+renderAdminCharacterImageGroup_(selected)+'</div>';
    return summary+selector+preview+detail;
  }

  function selectMemberImageCharacter_(characterId){
    const id=Number(characterId||0);
    const characters=Array.isArray(memberImageModalData?.characters)?memberImageModalData.characters:[];
    const selected=characters.find(character=>Number(character?.characterId||0)===id)||null;
    if(!selected)return false;
    selectedMemberImageCharacterId=id;
    clearAdminImagePreview_();
    const modal=$('#adminMemberImageModal');
    if(!modal?.classList.contains('active'))return false;
    modal.querySelectorAll('[data-admin-image-character-select]').forEach(button=>{
      const active=Number(button.dataset.adminImageCharacterSelect||0)===id;
      button.classList.toggle('is-selected',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
    const detail=$('[data-admin-member-image-detail]',modal);
    if(detail)detail.innerHTML=renderAdminCharacterImageGroup_(selected);
    const memberId=Number(modal.dataset.memberId||0);
    if(Number.isInteger(memberId)&&memberId>0)loadMemberImageRequests_(memberId,id).catch(()=>{});
    return true;
  }

  function clearAdminImagePreview_(){
    memberImagePreviewRequestId+=1;
    memberImageProductionAssetRequestId+=1;
    const host=$('#adminMemberImagePreview');
    if(!host)return;
    const img=host.querySelector('img');
    if(img)img.removeAttribute('src');
    host.innerHTML='';
    host.hidden=true;
  }

  async function showAdminImagePreview_(button){
    if(!isMaster())return;
    const modal=$('#adminMemberImageModal');
    const host=$('#adminMemberImagePreview',modal||document);
    const character=button?.closest?.('[data-admin-member-image-character]');
    const slotRow=button?.closest?.('[data-admin-image-slot]');
    const memberId=String(modal?.dataset.memberId||'').trim();
    const characterId=String(character?.dataset.adminMemberImageCharacter||'').trim();
    const slot=String(slotRow?.dataset.adminImageSlot||'').trim().toUpperCase();
    if(!modal?.classList.contains('active')||!/^\d+$/.test(memberId)||!/^\d+$/.test(characterId)||!['PROFILE',...ADMIN_IMAGE_SLOTS].includes(slot)||!host)return;
    const token=memberImageSessionToken_();
    const client=window.KinojoSupabaseClientCore;
    if(!token||!client||typeof client.invokeEdgeFunction!=='function')throw new Error('회원 이미지 미리보기 모듈을 준비하지 못했습니다.');
    const requestId=++memberImagePreviewRequestId;
    host.hidden=false;
    host.innerHTML='<div class="admin-empty">안전한 미리보기 주소를 발급하는 중입니다.</div>';
    const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'admin-image-preview',sessionToken:token,memberId:Number(memberId),characterId:Number(characterId),slot});
    if(requestId!==memberImagePreviewRequestId||!modal.classList.contains('active')||modal.dataset.memberId!==memberId)return null;
    if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'ADMIN_MEMBER_IMAGE_PREVIEW_FAILED');
    if(Number(data.targetMemberId)!==Number(memberId)||Number(data.characterId)!==Number(characterId)||String(data.slot||'')!==slot)throw new Error('ADMIN_MEMBER_IMAGE_PREVIEW_BINDING_MISMATCH');
    if(String(data.privacy||'')!=='SIGNED_PREVIEW_URL_ONLY_NO_OBJECT_PATH'||String(data.purpose||'')!=='INLINE_PREVIEW_ONLY'||data.preview?.download!==false)throw new Error('ADMIN_MEMBER_IMAGE_PREVIEW_PRIVACY_MISMATCH');
    const cfg=await client.ensureConfig();
    const previewUrl=new URL(String(data.preview?.url||''));
    const expected=new URL(String(cfg.url||''));
    if(previewUrl.origin!==expected.origin||!previewUrl.pathname.startsWith('/storage/v1/object/sign/')||!previewUrl.searchParams.get('token')||previewUrl.searchParams.has('download'))throw new Error('ADMIN_MEMBER_IMAGE_PREVIEW_URL_INVALID');
    const ttl=Math.max(1,Math.min(60,Number(data.preview?.expiresInSeconds||0)));
    const label=slot==='PROFILE'?'프로필 이미지':(ADMIN_IMAGE_SLOT_LABELS[slot]||slot);
    host.innerHTML='<div class="admin-card-head"><div><h2>'+esc(label)+' 미리보기</h2><p>최대 '+ttl+'초 동안만 유효한 관리자용 미리보기입니다. 필요한 파일은 각 이미지의 다운로드 버튼으로 받을 수 있습니다.</p></div><button class="admin-btn" data-admin-image-preview-close type="button">미리보기 닫기</button></div><img src="'+esc(previewUrl.toString())+'" alt="'+esc(label)+' 미리보기" style="display:block;max-width:100%;max-height:60vh;object-fit:contain;margin:12px auto 0" referrerpolicy="no-referrer" />';
    host.scrollIntoView({block:'nearest'});
    return data;
  }

  function adminImageRequestContext_(button){
    const modal=$('#adminMemberImageModal');
    const consoleRoot=button?.closest?.('[data-admin-image-request-console]');
    const requestRoot=button?.closest?.('[data-admin-image-request-detail-view]');
    const slotRoot=button?.closest?.('[data-admin-image-request-slot]');
    const memberId=Number(modal?.dataset.memberId||0);
    const characterId=Number(consoleRoot?.dataset.characterId||0);
    const requestId=Number(requestRoot?.dataset.adminImageRequestDetailView||button?.dataset.adminImageRequestSelect||0);
    const slot=String(slotRoot?.dataset.adminImageRequestSlot||'').toUpperCase();
    if(!modal?.classList.contains('active')||!Number.isInteger(memberId)||memberId<=0||!Number.isInteger(characterId)||characterId<=0||!Number.isInteger(requestId)||requestId<=0)return null;
    return {modal,consoleRoot,memberId,characterId,requestId,slot};
  }

  async function showAdminImageRequestPreview_(button){
    if(!isMaster())return null;
    const context=adminImageRequestContext_(button);
    const host=$('#adminMemberImagePreview',context?.modal||document);
    if(!context||!ADMIN_IMAGE_SLOTS.includes(context.slot)||!host)return null;
    const token=memberImageSessionToken_();
    const client=window.KinojoSupabaseClientCore;
    if(!token||!client||typeof client.invokeEdgeFunction!=='function')throw new Error('제작 요청 이미지 미리보기 모듈을 준비하지 못했습니다.');
    const assetRequestId=++memberImageProductionAssetRequestId;
    host.hidden=false;
    host.innerHTML='<div class="admin-empty">제작 요청 이미지의 안전한 미리보기 주소를 발급하는 중입니다.</div>';
    const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'admin-image-request-preview',sessionToken:token,memberId:context.memberId,characterId:context.characterId,requestId:context.requestId,slot:context.slot});
    if(assetRequestId!==memberImageProductionAssetRequestId||!context.modal.classList.contains('active')||context.modal.dataset.memberId!==String(context.memberId)||selectedMemberImageRequestId!==context.requestId)return null;
    if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'ADMIN_IMAGE_REQUEST_PREVIEW_FAILED');
    if(Number(data.targetMemberId)!==context.memberId||Number(data.characterId)!==context.characterId||Number(data.requestId)!==context.requestId||String(data.slot||'')!==context.slot)throw new Error('ADMIN_IMAGE_REQUEST_PREVIEW_BINDING_MISMATCH');
    if(String(data.privacy||'')!=='SIGNED_PREVIEW_URL_ONLY_NO_OBJECT_PATH'||String(data.purpose||'')!=='INLINE_PREVIEW_ONLY'||data.preview?.download!==false)throw new Error('ADMIN_IMAGE_REQUEST_PREVIEW_PRIVACY_MISMATCH');
    const cfg=await client.ensureConfig();
    const previewUrl=new URL(String(data.preview?.url||''));
    const expected=new URL(String(cfg.url||''));
    if(previewUrl.origin!==expected.origin||!previewUrl.pathname.startsWith('/storage/v1/object/sign/')||!previewUrl.searchParams.get('token')||previewUrl.searchParams.has('download'))throw new Error('ADMIN_IMAGE_REQUEST_PREVIEW_URL_INVALID');
    const ttl=Math.max(1,Math.min(60,Number(data.preview?.expiresInSeconds||0)));
    const label=ADMIN_IMAGE_SLOT_LABELS[context.slot]||context.slot;
    host.innerHTML='<div class="admin-card-head"><div><h2>요청 #'+context.requestId+' · '+esc(label)+' 미리보기</h2><p>최대 '+ttl+'초 동안만 유효한 MASTER 전용 미리보기입니다.</p></div><button class="admin-btn" data-admin-image-preview-close type="button">미리보기 닫기</button></div><img src="'+esc(previewUrl.toString())+'" alt="요청 #'+context.requestId+' '+esc(label)+' 미리보기" referrerpolicy="no-referrer" />';
    host.scrollIntoView({block:'nearest'});
    return data;
  }

  async function downloadAdminImageRequest_(button){
    if(!isMaster())return null;
    const context=adminImageRequestContext_(button);
    if(!context||!ADMIN_IMAGE_SLOTS.includes(context.slot))return null;
    const token=memberImageSessionToken_();
    const client=window.KinojoSupabaseClientCore;
    if(!token||!client||typeof client.invokeEdgeFunction!=='function')throw new Error('제작 요청 이미지 다운로드 모듈을 준비하지 못했습니다.');
    button.disabled=true;
    try{
      const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'admin-image-request-download',sessionToken:token,memberId:context.memberId,characterId:context.characterId,requestId:context.requestId,slot:context.slot});
      if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'ADMIN_IMAGE_REQUEST_DOWNLOAD_FAILED');
      if(Number(data.targetMemberId)!==context.memberId||Number(data.characterId)!==context.characterId||Number(data.requestId)!==context.requestId||String(data.slot||'')!==context.slot)throw new Error('ADMIN_IMAGE_REQUEST_DOWNLOAD_BINDING_MISMATCH');
      if(String(data.privacy||'')!=='SIGNED_DOWNLOAD_URL_ONLY_NO_OBJECT_PATH'||String(data.purpose||'')!=='EXPLICIT_DOWNLOAD_ONLY'||data.download?.attachment!==true)throw new Error('ADMIN_IMAGE_REQUEST_DOWNLOAD_PRIVACY_MISMATCH');
      const cfg=await client.ensureConfig();
      const url=new URL(String(data.download?.url||''));
      const expected=new URL(String(cfg.url||''));
      const filename=String(data.download?.filename||'').trim();
      if(!/^[A-Za-z0-9._-]{1,180}$/.test(filename))throw new Error('ADMIN_IMAGE_REQUEST_DOWNLOAD_FILENAME_INVALID');
      if(url.origin!==expected.origin||!url.pathname.startsWith('/storage/v1/object/sign/')||!url.searchParams.get('token')||url.searchParams.get('download')!==filename)throw new Error('ADMIN_IMAGE_REQUEST_DOWNLOAD_URL_INVALID');
      const link=document.createElement('a');
      link.href=url.toString();link.download=filename;link.rel='noopener';link.hidden=true;
      document.body.appendChild(link);link.click();link.remove();
      toast('요청 #'+context.requestId+' '+(ADMIN_IMAGE_SLOT_LABELS[context.slot]||context.slot)+' 이미지 다운로드를 시작했습니다.');
      return data;
    }finally{button.disabled=false;}
  }

  async function updateMemberImageRequestStatus_(button){
    if(!isMaster())return null;
    const context=adminImageRequestContext_(button);
    const nextStatus=String(button?.dataset.adminImageRequestStatus||'').toUpperCase();
    if(!context||!['IN_PROGRESS','COMPLETED','REJECTED'].includes(nextStatus))return null;
    const nextLabel=adminImageRequestStatusLabel_(nextStatus);
    if(!confirm('요청 #'+context.requestId+'을(를) '+nextLabel+' 상태로 변경할까요?'))return null;
    const token=memberImageSessionToken_();
    const client=window.KinojoSupabaseClientCore;
    if(!token||!client||typeof client.invokeEdgeFunction!=='function')throw new Error('제작 요청 상태 처리 모듈을 준비하지 못했습니다.');
    button.disabled=true;
    try{
      const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'admin-image-request-status',sessionToken:token,memberId:context.memberId,characterId:context.characterId,requestId:context.requestId,nextStatus});
      if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'ADMIN_IMAGE_REQUEST_STATUS_FAILED');
      if(Number(data.targetMemberId)!==context.memberId||Number(data.characterId)!==context.characterId||Number(data.requestId)!==context.requestId||String(data.status||'')!==nextStatus)throw new Error('ADMIN_IMAGE_REQUEST_STATUS_BINDING_MISMATCH');
      toast('요청 #'+context.requestId+'을(를) '+nextLabel+' 상태로 변경했습니다.');
      addLog('MEMBER_IMAGE_REQUEST','요청 #'+context.requestId+' · '+nextLabel);
      await loadMemberImageRequests_(context.memberId,context.characterId,context.requestId);
      await refreshDashboard();
      await loadMemberImageReviews();
      return data;
    }finally{button.disabled=false;}
  }

  async function loadMemberImageGroups_(memberId,requestId,preferredCharacterId=0,preferredRequestId=0){
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
    memberImageModalData=data;
    const preferredId=Number(preferredCharacterId||0);
    selectedMemberImageCharacterId=(Array.isArray(data.characters)&&data.characters.some(character=>Number(character?.characterId||0)===preferredId))?preferredId:defaultMemberImageCharacterId_(data.characters);
    if(body)body.innerHTML=renderMemberImageGroups_(data,selectedMemberImageCharacterId);
    if(selectedMemberImageCharacterId){
      const requestToOpen=selectedMemberImageCharacterId===preferredId?Number(preferredRequestId||0):0;
      loadMemberImageRequests_(memberId,selectedMemberImageCharacterId,requestToOpen).catch(()=>{});
    }
    return data;
  }

  function ensureMemberImageModal(){
    let modal=$('#adminMemberImageModal');
    if(modal)return modal;
    document.body.insertAdjacentHTML('beforeend','<div class="admin-event-preview-modal" id="adminMemberImageModal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="adminMemberImageModalTitle"><div class="admin-event-preview-backdrop" data-member-image-modal-close></div><section class="admin-event-preview-panel"><header class="admin-event-preview-head"><div><h2 id="adminMemberImageModalTitle">캐릭터 이미지 보기</h2><p id="adminMemberImageModalMember">회원 선택 대기</p></div><button class="admin-icon-btn" data-member-image-modal-close type="button" aria-label="캐릭터 이미지 모달 닫기">×</button></header><div class="admin-event-preview-body" id="adminMemberImageModalBody"><div class="admin-empty">회원의 캐릭터 이미지 목록을 불러올 준비가 되었습니다.</div></div><footer class="admin-event-preview-actions"><button class="admin-btn" data-member-image-modal-close type="button">닫기</button></footer></section></div>');
    modal=$('#adminMemberImageModal');
    modal?.addEventListener('click',event=>{const close=event.target.closest('[data-member-image-modal-close]');if(close){closeMemberImageModal();return;}const selector=event.target.closest('[data-admin-image-character-select]');if(selector){selectMemberImageCharacter_(selector.dataset.adminImageCharacterSelect);return;}const requestSelector=event.target.closest('[data-admin-image-request-select]');if(requestSelector){const context=adminImageRequestContext_(requestSelector);if(context)loadMemberImageRequestDetail_(context.memberId,context.characterId,context.requestId).catch(error=>{const detail=context.consoleRoot?.querySelector('[data-admin-image-request-detail-host]');if(detail)detail.innerHTML=renderMemberImageRequestError_(error?.message||error);});return;}const previewClose=event.target.closest('[data-admin-image-preview-close]');if(previewClose){clearAdminImagePreview_();return;}const requestPreview=event.target.closest('[data-admin-image-request-preview]');if(requestPreview){showAdminImageRequestPreview_(requestPreview).catch(error=>{const host=$('#adminMemberImagePreview',modal);if(host){host.hidden=false;host.innerHTML='<div class="admin-callout error"><strong>미리보기를 열지 못했습니다.</strong><span>'+esc(error?.message||error)+'</span></div>';}});return;}const requestDownload=event.target.closest('[data-admin-image-request-download]');if(requestDownload){downloadAdminImageRequest_(requestDownload).catch(error=>toast(error?.message||String(error)));return;}const requestStatus=event.target.closest('[data-admin-image-request-status]');if(requestStatus){updateMemberImageRequestStatus_(requestStatus).catch(error=>toast(error?.message||String(error)));return;}const preview=event.target.closest('[data-admin-image-preview]');if(preview)showAdminImagePreview_(preview).catch(error=>{const host=$('#adminMemberImagePreview',modal);if(host){host.hidden=false;host.innerHTML='<div class="admin-callout error"><strong>미리보기를 열지 못했습니다.</strong><span>'+esc(error?.message||error)+'</span></div>';}});});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&modal?.classList.contains('active'))closeMemberImageModal();});
    return modal;
  }

  function closeMemberImageModal(){
    clearAdminImagePreview_();
    memberImageModalRequestId+=1;
    memberImageProductionListRequestId+=1;
    memberImageProductionDetailRequestId+=1;
    memberImageProductionAssetRequestId+=1;
    memberImageModalData=null;
    selectedMemberImageCharacterId=0;
    selectedMemberImageRequestId=0;
    document.body.classList.remove('admin-member-image-modal-open');
    const modal=$('#adminMemberImageModal');
    if(!modal)return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden','true');
    delete modal.dataset.memberId;
    const trigger=modal._kinojoTrigger;
    modal._kinojoTrigger=null;
    if(trigger?.isConnected)trigger.focus();
    else $('#memberImageReviewReloadBtn')?.focus();
  }

  function openMemberImageModal(target,options={}){
    if(!isMaster())return;
    const row=target?.closest?.('[data-member-id]');
    const memberId=String(row?.dataset.memberId||'').trim();
    if(!/^\d+$/.test(memberId))return;
    const memberName=String(row?.dataset.memberName||'회원').trim()||'회원';
    const modal=ensureMemberImageModal();
    if(!modal)return;
    const requestId=++memberImageModalRequestId;
    memberImageModalData=null;
    selectedMemberImageCharacterId=0;
    selectedMemberImageRequestId=0;
    modal.dataset.memberId=memberId;
    modal._kinojoTrigger=target;
    const label=$('#adminMemberImageModalMember',modal);
    if(label)label.textContent=memberName+' · 회원 #'+memberId;
    const body=$('#adminMemberImageModalBody',modal);
    if(body)body.innerHTML='<div class="admin-empty">캐릭터 이미지 상태를 불러오는 중입니다.</div>';
    modal.setAttribute('aria-hidden','false');
    modal.classList.add('active');
    document.body.classList.add('admin-member-image-modal-open');
    modal.querySelector('[data-member-image-modal-close]')?.focus();
    loadMemberImageGroups_(memberId,requestId,Number(options.characterId||0),Number(options.requestId||0)).catch(error=>{
      if(requestId!==memberImageModalRequestId||!modal.classList.contains('active')||modal.dataset.memberId!==memberId)return;
      if(body)body.innerHTML='<div class="admin-callout error"><strong>이미지 목록을 불러오지 못했습니다.</strong><span>'+esc(error?.message||error)+'</span></div>';
    });
  }

  function updateMemberImageReviewBadges_(pendingUploadCount,activeRequestCount){
    const uploadCount=Math.max(0,Number(pendingUploadCount||0));
    const requestCount=Math.max(0,Number(activeRequestCount||0));
    state.memberImageReviewPendingCount=uploadCount;
    state.memberImageRequestPendingCount=requestCount;
    const total=uploadCount+requestCount;
    document.querySelectorAll('#adminMemberImageBadge,[data-admin-subtab="character-images"] .badge').forEach(badge=>{badge.textContent=String(total);});
  }

  function renderMemberImageReviewSummary_(actionRequiredCount,pendingUploadCount,activeRequestCount,totalCount){
    const root=$('#memberImageReviewSummary');if(!root)return;
    root.innerHTML='<span>처리 필요 <strong>'+Math.max(0,Number(actionRequiredCount||0))+'</strong>건</span><span>이미지 확인 <strong>'+Math.max(0,Number(pendingUploadCount||0))+'</strong>건</span><span>진행 중 제작 요청 <strong>'+Math.max(0,Number(activeRequestCount||0))+'</strong>건</span><span>현재 이미지 업로더 <strong>'+Math.max(0,Number(totalCount||0))+'</strong>명</span>';
  }

  function memberImageKindLabel_(latest){
    if(String(latest?.kind||'').toUpperCase()==='PROFILE')return '프로필 이미지';
    const slot=String(latest?.slot||'').toUpperCase();
    return (ADMIN_IMAGE_SLOT_LABELS[slot]||'참고')+' 이미지';
  }

  function renderMemberImageReviewRows_(items){
    const root=$('#memberImageReviewList');if(!root)return;
    const list=Array.isArray(items)?items:[];
    root.innerHTML=list.length?list.map(item=>{
      const memberId=Number(item?.memberId||0);
      const name=esc(item?.mainCharacterName||'회원');
      const role=normalizeMemberRole(item?.role||'MEMBER');
      const roleName=esc(item?.roleLabel||MEMBER_ROLE_LABELS[role]||role);
      const itemType=String(item?.itemType||'IMAGE_REVIEW').toUpperCase();
      if(itemType==='PRODUCTION_REQUEST'){
        const characterId=Number(item?.characterId||0);
        const requestId=Number(item?.requestId||0);
        const requestStatus=String(item?.status||'').toUpperCase();
        const requestActive=['SUBMITTED','IN_PROGRESS'].includes(requestStatus);
        const characterName=esc(item?.characterName||'-');
        const serverName=esc(item?.serverName||'-');
        const className=esc(item?.className||'-');
        const slots=(Array.isArray(item?.slots)?item.slots:[]).map(slot=>ADMIN_IMAGE_SLOT_LABELS[String(slot||'').toUpperCase()]||String(slot||'')).filter(Boolean);
        const itemCount=Math.max(0,Number(item?.itemCount||0));
        const availableCount=Math.max(0,Number(item?.availableImageCount||0));
        return '<article class="admin-member-image-review-row is-request '+(requestActive?'is-pending':'is-reviewed')+'" data-work-item-type="PRODUCTION_REQUEST" data-member-id="'+memberId+'" data-member-name="'+name+'" data-character-id="'+characterId+'" data-request-id="'+requestId+'">'
          +'<div class="admin-member-image-review-main"><header><div><strong>'+name+'</strong><span class="admin-member-role-badge role-'+esc(role.toLowerCase())+'">'+roleName+'</span><span class="admin-work-kind request">제작 요청</span></div><span class="admin-pill '+adminImageRequestStatusClass_(requestStatus)+'">'+esc(adminImageRequestStatusLabel_(requestStatus))+'</span></header>'
          +'<p><b>'+characterName+'</b>의 제작 요청 #'+requestId+' · '+esc(adminImageRequestStyleLabel_(item?.styleCode))+'</p>'
          +'<dl><div><dt>캐릭터</dt><dd>'+characterName+' <small>'+serverName+' · '+className+'</small></dd></div><div><dt>첨부 이미지</dt><dd>'+itemCount+'장 <small>현재 열람 가능 '+availableCount+'장 · '+esc(slots.join(' · ')||'첨부 없음')+'</small></dd></div><div><dt>최근 처리</dt><dd>'+esc(formatAdminImageTime_(item?.activityAt||item?.updatedAt||item?.submittedAt))+'<small>'+(requestActive?'관리자 처리 필요':'처리 완료')+'</small></dd></div></dl></div>'
          +'<footer><button class="admin-btn primary" data-member-image-request-view type="button">요청 바로 보기</button></footer></article>';
      }
      const names=(Array.isArray(item?.characterNames)?item.characterNames:[]).map(value=>String(value||'').trim()).filter(Boolean);
      const latest=item?.latestImage&&typeof item.latestImage==='object'?item.latestImage:{};
      const latestName=esc(latest.characterName||names[0]||'-');
      const latestType=esc(memberImageKindLabel_(latest));
      const latestAt=String(item?.latestUploadedAt||latest.uploadedAt||'').trim();
      const pending=item?.pending===true;
      const imageCount=Math.max(0,Number(item?.imageCount||0));
      const profileCount=Math.max(0,Number(item?.profileImageCount||0));
      const referenceCount=Math.max(0,Number(item?.referenceImageCount||0));
      const reviewedAt=esc(formatAdminImageTime_(item?.reviewedAt));
      return '<article class="admin-member-image-review-row '+(pending?'is-pending':'is-reviewed')+'" data-work-item-type="IMAGE_REVIEW" data-member-id="'+memberId+'" data-member-name="'+name+'" data-latest-uploaded-at="'+esc(latestAt)+'">'
        +'<div class="admin-member-image-review-main"><header><div><strong>'+name+'</strong><span class="admin-member-role-badge role-'+esc(role.toLowerCase())+'">'+roleName+'</span><span class="admin-work-kind image">이미지 확인</span></div><span class="admin-pill '+(pending?'pending':'ok')+'">'+(pending?'미확인':'확인 완료')+'</span></header>'
        +'<p><b>'+latestName+'</b>의 '+latestType+'가 마지막으로 등록되었습니다.</p>'
        +'<dl><div><dt>현재 이미지</dt><dd>'+imageCount+'장 <small>프로필 '+profileCount+' · 참고 '+referenceCount+'</small></dd></div><div><dt>등록 캐릭터</dt><dd>'+Math.max(0,Number(item?.characterCount||0))+'명 <small>'+esc(names.join(' · ')||'-')+'</small></dd></div><div><dt>최근 업로드</dt><dd>'+esc(formatAdminImageTime_(latestAt))+'<small>'+(pending?'관리자 확인 필요':'확인 '+reviewedAt)+'</small></dd></div></dl></div>'
        +'<footer><button class="admin-btn" data-member-image-view type="button">이미지 보기</button>'+(pending?'<button class="admin-btn primary" data-member-image-review-ack type="button">확인 완료</button>':'')+'</footer></article>';
    }).join(''):'<div class="admin-empty">'+({ACTION_REQUIRED:'현재 처리할 이미지나 제작 요청이 없습니다.',IMAGE_REVIEW:'현재 확인할 새 이미지가 없습니다.',PRODUCTION_REQUEST:'현재 진행 중인 제작 요청이 없습니다.',COMPLETED:'처리 완료된 이미지 작업이 없습니다.',ALL:'조건에 맞는 이미지 작업이 없습니다.'}[String($('#memberImageReviewStatus')?.value||'ACTION_REQUIRED')]||'조건에 맞는 이미지 작업이 없습니다.')+'</div>';
  }

  async function loadMemberImageReviews(){
    if(!isMaster())return;
    const root=$('#memberImageReviewList');
    const token=memberImageSessionToken_();
    const client=window.KinojoSupabaseClientCore;
    const filter=String($('#memberImageReviewStatus')?.value||'ACTION_REQUIRED').toUpperCase();
    const search=String($('#memberImageReviewSearch')?.value||'').trim();
    const requestId=++memberImageReviewRequestId;
    setStatus('#memberImageReviewStatusLine','이미지 처리 목록을 불러오는 중...','');
    if(root)root.innerHTML='<div class="admin-empty">확인이 필요한 이미지 작업을 확인하는 중입니다.</div>';
    try{
      if(!token)throw new Error('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.');
      if(!client||typeof client.invokeEdgeFunction!=='function')throw new Error('회원 이미지 조회 모듈을 준비하지 못했습니다.');
      const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'admin-image-work-queue-list',sessionToken:token,filter,search,limit:200});
      if(requestId!==memberImageReviewRequestId)return null;
      if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'ADMIN_MEMBER_IMAGE_WORK_QUEUE_FAILED');
      if(String(data.privacy||'')!=='NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS'||String(data.filter||'')!==filter)throw new Error('ADMIN_MEMBER_IMAGE_WORK_QUEUE_CONTRACT_MISMATCH');
      const items=Array.isArray(data.items)?data.items:[];
      state.memberImageReviewItems=items;
      state.memberImageReviewTotalCount=Math.max(0,Number(data.totalUploaderCount||0));
      updateMemberImageReviewBadges_(data.pendingUploadCount,data.activeRequestCount);
      renderMemberImageReviewSummary_(data.actionRequiredCount,data.pendingUploadCount,data.activeRequestCount,data.totalUploaderCount);
      renderMemberImageReviewRows_(items);
      setStatus('#memberImageReviewStatusLine','조건에 맞는 작업 '+items.length+'건 · 현재 처리 필요 '+Math.max(0,Number(data.actionRequiredCount||0))+'건','ok');
      return data;
    }catch(err){
      if(requestId!==memberImageReviewRequestId)return null;
      if(root)root.innerHTML='<div class="admin-callout error"><strong>이미지 처리 목록을 불러오지 못했습니다.</strong><span>'+esc(err?.message||err)+'</span></div>';
      setStatus('#memberImageReviewStatusLine',err?.message||String(err),'error');
      return null;
    }
  }

  function scheduleMemberImageReviewSearch_(){
    clearTimeout(memberImageReviewSearchTimer);
    memberImageReviewSearchTimer=setTimeout(loadMemberImageReviews,260);
  }

  async function acknowledgeMemberImageReview_(button){
    if(!isMaster()||!button)return;
    const row=button.closest('[data-member-id]');
    const memberId=Number(row?.dataset.memberId||0);
    const reviewedThrough=String(row?.dataset.latestUploadedAt||'').trim();
    const name=String(row?.dataset.memberName||'회원');
    if(!Number.isInteger(memberId)||memberId<=0||!reviewedThrough)return;
    const token=memberImageSessionToken_();
    const client=window.KinojoSupabaseClientCore;
    button.disabled=true;
    button.textContent='처리 중...';
    try{
      if(!token||!client||typeof client.invokeEdgeFunction!=='function')throw new Error('회원 이미지 확인 모듈을 준비하지 못했습니다.');
      const data=await client.invokeEdgeFunction('kinojo-member-profile',{action:'admin-image-review-ack',sessionToken:token,memberId,reviewedThrough});
      if(!data||data.ok!==true||Number(data.memberId)!==memberId)throw new Error(data?.message||data?.code||'ADMIN_MEMBER_IMAGE_REVIEW_ACK_FAILED');
      toast(name+' 회원의 현재 이미지를 확인 완료로 처리했습니다.');
      addLog('MEMBER_IMAGE',name+' 이미지 확인 완료');
      await loadMemberImageReviews();
    }catch(err){
      button.disabled=false;
      button.textContent='확인 완료';
      setStatus('#memberImageReviewStatusLine',err?.message||String(err),'error');
    }
  }

  function handleMemberImageReviewClick_(target){
    const requestView=target?.closest?.('[data-member-image-request-view]');
    if(requestView){
      const row=requestView.closest('[data-member-id]');
      openMemberImageModal(requestView,{characterId:Number(row?.dataset.characterId||0),requestId:Number(row?.dataset.requestId||0)});
      return;
    }
    const view=target?.closest?.('[data-member-image-view]');
    if(view){openMemberImageModal(view);return;}
    const ack=target?.closest?.('[data-member-image-review-ack]');
    if(ack)acknowledgeMemberImageReview_(ack);
  }

  function applyMemberFilters(){
    scheduleMemberSearch_();
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

  Object.assign(A,{renderRequestPreview,requestRowHtml,loadCodeRequests,processRequest,loadAccounts,loadNextMemberPage_,loadPreviousMemberPage_,MEMBER_ROLE_LABELS,normalizeMemberRole,getAccountId,getAccountCode,getAccountName,getAccountRole,getAccountRoleLabel,getAccountCanEdit,getAccountAllowedRoles,memberImageSessionToken_,renderMemberImageGroups_,selectMemberImageCharacter_,loadMemberImageGroups_,clearAdminImagePreview_,showAdminImagePreview_,adminImageRequestStyleLabel_,adminImageRequestStatusLabel_,renderMemberImageRequestCards_,renderMemberImageRequestDetail_,loadMemberImageRequests_,loadMemberImageRequestDetail_,showAdminImageRequestPreview_,downloadAdminImageRequest_,updateMemberImageRequestStatus_,ensureMemberImageModal,openMemberImageModal,closeMemberImageModal,updateMemberImageReviewBadges_,renderMemberImageReviewSummary_,renderMemberImageReviewRows_,loadMemberImageReviews,scheduleMemberImageReviewSearch_,acknowledgeMemberImageReview_,handleMemberImageReviewClick_,applyMemberFilters,renderAccounts,handleMemberAction,SANCTUARY_ROLE_LABELS,renderSanctuaryRolePermissions,loadSanctuaryRolePermissions,setSanctuaryRolePermission});
})(window.KinojoAdmin);
