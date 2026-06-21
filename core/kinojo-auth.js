/*
 * KINOJO Login UI Bridge
 * Role: 코드 로그인, 세션 보관, 권한 상태 표시, 회원 코드 관리 모달을 담당합니다.
 * Note: 실제 권한 판정은 Apps Script account_logic.gs / reaction_logic.gs가 최종 처리합니다.
 */
(function(){
  const STORAGE_KEY = 'kinojo_login_session_v1';
  const ACCOUNT_KEY = 'kinojo_login_account_v1';
  const IDLE_LOGOUT_MS = 5 * 60 * 1000;
  let idleLogoutTimer = null;
  const PERMISSION_LABELS = {
    sanctuary_edit: '성역 관리',
    visit_manage: '방문자수 조정',
    snapshot_manage: '성장왕 스냅샷',
    account_manage: '회원 코드 관리'
  };

  function apiUrl(){
    const param = new URLSearchParams(location.search).get('api');
    if(param) return param;
    try{
      if(typeof WEB_APP_URL !== 'undefined' && WEB_APP_URL) return WEB_APP_URL;
    }catch(_err){}
    return 'https://script.google.com/macros/s/AKfycbztXbGEbiId1yOfa3CVmErivNVi5IUi64qxIQRf8Sm_KduCPieeAKlNRMGyYkKL5iPaYg/exec';
  }

  function readJson(key){
    try{ return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch(_err){ return null; }
  }

  function writeJson(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

  function getSession(){
    const session = readJson(STORAGE_KEY);
    if(!session || !session.token) return null;
    if(Number(session.expiresAt || 0) && Date.now() > Number(session.expiresAt)){
      clearSession();
      return null;
    }
    return session;
  }

  function getAccount(){ return readJson(ACCOUNT_KEY); }

  function setSession(session, account){
    writeJson(STORAGE_KEY, session || {});
    writeJson(ACCOUNT_KEY, account || {});
    updateStatus();
  }

  function clearSession(){
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
    updateStatus();
  }

  function isLoggedIn(){ return !!getSession(); }
  function getToken(){ return getSession()?.token || ''; }
  function roleOf(source){
    const raw = String(source?.role || '').toUpperCase();
    if(raw === 'MASTER' || raw === 'SUB_MASTER' || raw === 'MANAGER' || raw === 'MEMBER') return raw;
    const level = Number(source?.level || 0);
    if(level >= 5) return 'MASTER';
    if(level >= 4) return 'SUB_MASTER';
    if(level >= 3) return 'MANAGER';
    return source ? 'MEMBER' : '';
  }
  function roleLabel(role){
    return ({MASTER:'MASTER', SUB_MASTER:'SUB MASTER', MANAGER:'MANAGER', MEMBER:'MEMBER'}[role] || 'MEMBER');
  }
  function canOpenManage(role){ return ['MASTER','SUB_MASTER','MANAGER'].includes(role); }
  function getLevel(){
    const role = roleOf(getSession());
    return role === 'MASTER' ? 5 : role === 'SUB_MASTER' ? 4 : role === 'MANAGER' ? 3 : role === 'MEMBER' ? 1 : 0;
  }
  function isAdmin(){ return canOpenManage(roleOf(getSession())); }

  function safeText(value){
    return String(value ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  function permissionArray(value){
    return String(value || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  function permissionText(value){
    const arr = permissionArray(value);
    if(arr.includes('all')) return '전체 권한';
    if(!arr.length) return 'MEMBER';
    return arr.map(key => PERMISSION_LABELS[key] || key).join(', ');
  }

  function classIconFor(className){
    const key = String(className || '').trim();
    const map = {
      '검성':'gladiator', '수호성':'templar', '궁성':'ranger', '살성':'assassin',
      '마도성':'sorcerer', '정령성':'elementalist', '치유성':'cleric', '호법성':'chanter',
      'gladiator':'gladiator', 'templar':'templar', 'ranger':'ranger', 'assassin':'assassin',
      'sorcerer':'sorcerer', 'elementalist':'elementalist', 'cleric':'cleric', 'chanter':'chanter'
    };
    const file = map[key];
    if(!file) return '';
    const path = location.pathname;
    const prefix = path.includes('/hall-of-fame/') ? './assets/' : (path.includes('/sanctuary/') || path.includes('/arcana/') ? '../hall-of-fame/assets/' : 'hall-of-fame/assets/');
    return prefix + 'class_icon_' + file + '.png';
  }


  function visitorId_(){
    let id = localStorage.getItem('kinojoVisitorId');
    if(!id){ id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2); localStorage.setItem('kinojoVisitorId', id); }
    return id;
  }

  async function submitLoginCodeRequest(){
    const modal = ensureLoginModal();
    const input = modal.querySelector('#kinojoCodeRequestCharacter');
    const memo = modal.querySelector('#kinojoCodeRequestMemo');
    const status = modal.querySelector('#kinojoCodeRequestStatus');
    const button = modal.querySelector('#kinojoCodeRequestBtn');
    const characterName = String(input?.value || '').trim();
    const memoText = String(memo?.value || '').trim();
    if(!characterName){ if(status) status.textContent = '코드를 발급받을 캐릭터명을 입력해 주세요.'; return; }
    try{
      if(button) button.disabled = true;
      if(status) status.textContent = '요청 접수 중...';
      const res = await fetch(apiUrl(), { method:'POST', body:JSON.stringify({
        action:'inquiryRequest',
        category:'코드요청',
        characterName,
        memo:memoText,
        requester:visitorId_(),
        url:location.href
      })});
      const data = await res.json();
      if(!data.ok) throw new Error(data.message || '요청 접수 실패');
      if(status) status.textContent = '요청이 접수되었습니다. 관리자가 확인 후 코드를 발급합니다.';
      if(input) input.value = '';
      if(memo) memo.value = '';
    }catch(err){
      if(status) status.textContent = err.message || String(err);
    }finally{
      if(button) button.disabled = false;
    }
  }

  async function checkAdminInquiries_(){
    const session = getSession();
    if(!session || !canOpenManage(roleOf(session))) return;
    try{
      const res = await fetch(apiUrl(), { method:'POST', body:JSON.stringify({ action:'adminInquiryList', sessionToken:getToken() }) });
      const data = await res.json();
      if(!data.ok || !Number(data.openCount || 0)) return;
      showAdminInquiryNotice_(data.inquiries || [], Number(data.openCount || 0));
    }catch(e){}
  }

  function showAdminInquiryNotice_(inquiries, openCount){
    if(document.getElementById('kinojoAdminInquiryNotice')) return;
    const modal = document.createElement('section');
    modal.id = 'kinojoAdminInquiryNotice';
    modal.className = 'kinojo-login-modal open kinojo-inquiry-notice-modal';
    modal.setAttribute('aria-hidden','false');
    const items = (inquiries || []).slice(0,5).map(item=>{
      return '<li><strong>' + safeText(item.category || '문의') + '</strong> '
        + '<span>' + safeText(item.characterName || item.memo || '-') + '</span>'
        + '<small>' + safeText(item.createdAt || '') + '</small></li>';
    }).join('');
    modal.innerHTML = '<div class="kinojo-login-card kinojo-inquiry-notice-card" role="dialog" aria-modal="true">'
      + '<button class="kinojo-login-close" type="button" aria-label="닫기">×</button>'
      + '<div class="kinojo-login-kicker">ADMIN REQUEST</div>'
      + '<h2>확인할 요청이 있습니다</h2>'
      + '<p>미확인 문의/코드요청 ' + safeText(openCount) + '건이 접수되어 있습니다.</p>'
      + '<ul class="kinojo-inquiry-list">' + items + '</ul>'
      + '<button class="kinojo-login-submit" type="button" id="kinojoInquiryNoticeOkBtn">확인</button>'
      + '</div>';
    document.body.appendChild(modal);
    const close = ()=>{ modal.remove(); };
    modal.querySelector('.kinojo-login-close')?.addEventListener('click', close);
    modal.querySelector('#kinojoInquiryNoticeOkBtn')?.addEventListener('click', close);
    modal.addEventListener('click', e=>{ if(e.target === modal) close(); });
  }

  function updateStatus(){
    const label = document.getElementById('kinojoAuthLabel');
    const loginBtn = document.getElementById('kinojoLoginBtn');
    const logoutBtn = document.getElementById('kinojoLogoutBtn');
    const adminWrap = document.querySelector('#kinojoUserStatus .admin-menu-wrap');
    const session = getSession();
    const account = getAccount();

    if(session){
      const name = account?.mainCharacter || session.mainCharacter || '회원';
      const role = roleOf(session) || roleOf(account) || 'MEMBER';
      const className = account?.className || session.className || '';
      const icon = classIconFor(className);
      if(label){
        label.innerHTML = '<span class="kinojo-auth-profile">'
          + (icon ? '<img class="kinojo-auth-class-icon" src="' + safeText(icon) + '" alt="" />' : '')
          + '<span class="kinojo-auth-name">' + safeText(name) + '</span>'
          + '<span class="kinojo-auth-role kinojo-auth-role-' + role.toLowerCase().replace('_','-') + '">' + safeText(roleLabel(role)) + '</span>'
          + '<span class="kinojo-auth-online" aria-hidden="true">●</span>'
          + '</span>';
      }
      if(loginBtn) loginBtn.style.display = 'none';
      if(logoutBtn) logoutBtn.style.display = '';
      if(adminWrap) adminWrap.style.display = canOpenManage(role) ? '' : 'none';
      document.body.classList.add('kinojo-logged-in');
      document.body.classList.toggle('kinojo-admin-user', canOpenManage(role));
      document.body.dataset.kinojoRole = role;
      resetIdleLogoutTimer();
    }else{
      if(label) label.textContent = '비회원 · 열람만 가능';
      if(loginBtn) loginBtn.style.display = '';
      if(logoutBtn) logoutBtn.style.display = 'none';
      if(adminWrap) adminWrap.style.display = 'none';
      document.body.classList.remove('kinojo-logged-in','kinojo-admin-user');
      delete document.body.dataset.kinojoRole;
      clearIdleLogoutTimer();
      closeAccountAdminModal();
    }
  }

  function toast(message){
    const text = String(message || '');
    if(window.KinojoToast && typeof window.KinojoToast.show === 'function') return window.KinojoToast.show(text);
    alert(text);
  }

  function ensureLoginModal(){
    let modal = document.getElementById('kinojoLoginModal');
    if(modal) return modal;
    modal = document.createElement('section');
    modal.id = 'kinojoLoginModal';
    modal.className = 'kinojo-login-modal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML = '<div class="kinojo-login-card" role="dialog" aria-modal="true" aria-labelledby="kinojoLoginTitle">'
      + '<button class="kinojo-login-close" id="kinojoLoginCloseBtn" type="button" aria-label="닫기">×</button>'
      + '<div class="kinojo-login-kicker">KINOJO LOGIN</div>'
      + '<h2 id="kinojoLoginTitle">회원 코드 로그인</h2>'
      + '<p>관리자가 발급한 코드로 로그인하면 좋아요·싫어요와 제안 기능을 사용할 수 있습니다.</p>'
      + '<input id="kinojoLoginCodeInput" class="kinojo-login-input" maxlength="12" placeholder="예: AB1234 또는 관리자 코드" autocomplete="one-time-code" />'
      + '<button id="kinojoLoginSubmitBtn" class="kinojo-login-submit" type="button"><span class="kinojo-login-btn-text">로그인</span></button>'
      + '<div id="kinojoLoginStatus" class="kinojo-login-status"></div>'
      + '<div class="kinojo-code-request-box">'
      + '<strong>코드를 발급받고 싶으신가요?</strong>'
      + '<p>캐릭터명을 남겨주시면 관리자가 확인 후 코드를 발급합니다.</p>'
      + '<input id="kinojoCodeRequestCharacter" class="kinojo-login-input" placeholder="캐릭터명" autocomplete="off" />'
      + '<input id="kinojoCodeRequestMemo" class="kinojo-login-input" placeholder="남길 말 선택 입력" autocomplete="off" />'
      + '<button id="kinojoCodeRequestBtn" class="kinojo-code-request-submit" type="button">코드 요청하기</button>'
      + '<div id="kinojoCodeRequestStatus" class="kinojo-login-status"></div>'
      + '</div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', e=>{ if(e.target === modal) closeLoginModal(); });
    modal.querySelector('#kinojoLoginCloseBtn')?.addEventListener('click', closeLoginModal);
    modal.querySelector('#kinojoLoginSubmitBtn')?.addEventListener('click', submitLogin);
    modal.querySelector('#kinojoCodeRequestBtn')?.addEventListener('click', submitLoginCodeRequest);
    modal.querySelector('#kinojoLoginCodeInput')?.addEventListener('keydown', e=>{ if(e.key === 'Enter') submitLogin(); });
    return modal;
  }

  function openLoginModal(reason){
    const modal = ensureLoginModal();
    const status = modal.querySelector('#kinojoLoginStatus');
    const input = modal.querySelector('#kinojoLoginCodeInput');
    if(status) status.textContent = reason || '';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    setTimeout(()=>input?.focus(), 30);
  }

  function closeLoginModal(){
    const modal = document.getElementById('kinojoLoginModal');
    if(!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
  }

  function setLoginLoading_(button, loading){
    if(!button) return;
    button.disabled = !!loading;
    button.innerHTML = loading
      ? '<span class="kinojo-spinner" aria-hidden="true"></span><span class="kinojo-login-btn-text">확인중...</span>'
      : '<span class="kinojo-login-btn-text">로그인</span>';
  }

  async function submitLogin(){
    const modal = ensureLoginModal();
    const input = modal.querySelector('#kinojoLoginCodeInput');
    const button = modal.querySelector('#kinojoLoginSubmitBtn');
    const status = modal.querySelector('#kinojoLoginStatus');
    if(button?.disabled) return;
    const code = String(input?.value || '').trim();
    if(!code){ if(status) status.textContent = '로그인 코드를 입력해 주세요.'; return; }
    try{
      setLoginLoading_(button, true);
      if(status) status.textContent = '';
      const res = await fetch(apiUrl(), { method:'POST', body:JSON.stringify({ action:'login', code }) });
      const data = await res.json();
      if(!data.ok) throw new Error(data.message || '로그인에 실패했습니다.');
      setSession(data.session, data.account);
      if(status) status.textContent = '로그인되었습니다.';
      setTimeout(checkAdminInquiries_, 450);
      setTimeout(closeLoginModal, 280);
    }catch(err){
      if(status) status.textContent = err.message || String(err);
    }finally{
      setLoginLoading_(button, false);
    }
  }

  function requireLogin(message){
    if(isLoggedIn()) return true;
    openLoginModal(message || '로그인 후 이용할 수 있습니다.');
    return false;
  }

  function spinnerHtml(label){
    return '<span class="kinojo-spinner" aria-hidden="true"><span></span></span>' + (label ? '<span class="kinojo-spinner-label">' + safeText(label) + '</span>' : '');
  }

  function setButtonLoading(button, loading, label){
    if(!button) return;
    if(loading){
      if(!button.dataset.originalText) button.dataset.originalText = button.textContent || '';
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = spinnerHtml(label || button.dataset.originalText || '처리 중');
    }else{
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = button.dataset.originalText || button.textContent || '확인';
      delete button.dataset.originalText;
    }
  }

  function isValidMemberCode(code){
    const value = String(code || '').trim().toUpperCase();
    if(!/^[A-Z0-9]{6}$/.test(value)) return false;
    const letters = (value.match(/[A-Z]/g) || []).length;
    const numbers = (value.match(/[0-9]/g) || []).length;
    return letters === 2 && numbers === 4;
  }

  function accountAdminMarkup_(){
    return '<div class="kinojo-account-card kinojo-account-inline-card" aria-labelledby="kinojoAccountAdminTitle">'
      + '<div class="kinojo-account-head">'
      + '<div><div class="kinojo-login-kicker">MANAGE</div><h2 id="kinojoAccountAdminTitle">회원 관리</h2><p>캐릭터 조회 후 6자리 코드로 계정을 만들고, 변경사항은 저장하기를 눌렀을 때만 반영합니다.</p></div>'
      + '</div>'
      + '<div class="kinojo-account-section kinojo-account-create-section">'
      + '<label class="kinojo-account-label" for="adminAccountCharacterInput">캐릭터 이름 입력</label>'
      + '<div class="kinojo-account-create-row">'
      + '<input id="adminAccountCharacterInput" class="search kinojo-account-input" placeholder="예: 청소기" autocomplete="off" />'
      + '<button class="btn" id="adminAccountLookupBtn" type="button">캐릭터 조회하기</button>'
      + '</div>'
      + '<div class="admin-status" id="adminAccountLookupStatus"></div>'
      + '<div class="kinojo-account-issue-box" id="adminAccountIssueBox" hidden>'
      + '<div class="kinojo-account-character-result" id="adminAccountCharacterResult"></div>'
      + '<label class="kinojo-account-label" for="adminAccountCodeInput">회원 코드 입력</label>'
      + '<input id="adminAccountCodeInput" class="search kinojo-account-input kinojo-code-input" maxlength="6" placeholder="알파벳 2개 + 숫자 4개, 위치 자유" autocomplete="off" />'
      + '<div class="kinojo-account-help">예: AB1234, 12AB34, A1B234, 1234AB</div>'
      + '<button class="btn" id="adminAccountCreateBtn" type="button" disabled>코드 생성하기</button>'
      + '</div>'
      + '</div>'
      + '<div class="kinojo-account-section kinojo-account-list-section">'
      + '<div class="kinojo-account-toolbar">'
      + '<strong>회원 목록</strong>'
      + '<div class="kinojo-account-toolbar-actions">'
      + '<button class="btn admin-account-save" id="adminAccountSaveBtn" type="button" disabled>변경내용 저장하기</button>'
      + '<button class="btn admin-account-revert" id="adminAccountRevertBtn" type="button" disabled>되돌리기</button>'
      + '<button class="btn" id="adminOwnerMapSyncBtn" type="button">캐릭터 소유정보 갱신</button>'
      + '<button class="btn" id="adminAccountListBtn" type="button">목록 새로고침</button>'
      + '</div>'
      + '</div>'
      + '<div class="kinojo-account-filters">'
      + '<input class="search" id="adminAccountSearchInput" placeholder="회원 검색" autocomplete="off" />'
      + '<select class="admin-account-role-select" id="adminAccountRoleFilter"><option value="">전체 등급</option><option value="MASTER">MASTER</option><option value="SUB_MASTER">SUB MASTER</option><option value="MANAGER">MANAGER</option><option value="MEMBER">MEMBER</option></select>'
      + '<select class="admin-account-role-select" id="adminAccountPermissionFilter"><option value="">전체 권한</option><option value="sanctuary_edit">성역 관리</option><option value="visit_manage">방문자수 조정</option><option value="snapshot_manage">성장왕 스냅샷</option><option value="account_manage">회원 관리</option></select>'
      + '</div>'
      + '<div class="admin-status" id="adminAccountStatus"></div>'
      + '<div class="admin-account-list" id="adminAccountList"></div>'
      + '</div>'
      + '</div>';
  }

  function bindAccountAdminEvents_(root){
    if(!root || root.dataset.accountAdminBound) return;
    root.dataset.accountAdminBound = '1';
    root.querySelector('#adminAccountLookupBtn')?.addEventListener('click', lookupAccountCharacter);
    root.querySelector('#adminAccountCharacterInput')?.addEventListener('keydown', e=>{ if(e.key === 'Enter') lookupAccountCharacter(); });
    root.querySelector('#adminAccountCodeInput')?.addEventListener('input', validateAccountCodeInput);
    root.querySelector('#adminAccountCreateBtn')?.addEventListener('click', createAccountCode);
    root.querySelector('#adminAccountListBtn')?.addEventListener('click', listAccountCodes);
    root.querySelector('#adminOwnerMapSyncBtn')?.addEventListener('click', syncOwnerMap);
    root.querySelector('#adminAccountSaveBtn')?.addEventListener('click', savePendingAccountChanges);
    root.querySelector('#adminAccountRevertBtn')?.addEventListener('click', revertPendingAccountChanges);
    root.querySelector('#adminAccountList')?.addEventListener('click', handleAccountListClick);
    root.querySelector('#adminAccountList')?.addEventListener('change', handleAccountListChange);
    root.querySelector('#adminAccountSearchInput')?.addEventListener('input', applyAccountListFilters);
    root.querySelector('#adminAccountRoleFilter')?.addEventListener('change', applyAccountListFilters);
    root.querySelector('#adminAccountPermissionFilter')?.addEventListener('change', applyAccountListFilters);
  }

  function ensureAccountAdminPanel(){
    const inline = document.getElementById('kinojoAccountAdminInline');
    if(!inline) return null;
    if(!inline.dataset.rendered){
      inline.innerHTML = accountAdminMarkup_();
      inline.dataset.rendered = '1';
      bindAccountAdminEvents_(inline);
    }
    return inline;
  }

  function renderAccountAdminInline(options){
    const panel = ensureAccountAdminPanel();
    if(!panel) return null;
    if(options?.load !== false) listAccountCodes();
    if(options?.focus) setTimeout(()=>document.getElementById('adminAccountCharacterInput')?.focus(), 40);
    return panel;
  }

  function openAccountAdminModal(){
    const panel = renderAccountAdminInline({ load:true, focus:true });
    if(!panel) toast('관리 패널에서 회원 탭을 연 뒤 사용할 수 있습니다.');
    return panel;
  }

  function closeAccountAdminModal(){
    const modal = document.getElementById('kinojoAccountAdminModal');
    if(!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
  }

  function setAccountStatus(message, isError){
    const el = document.getElementById('adminAccountStatus');
    if(!el) return;
    el.className = 'admin-status ' + (isError ? 'error' : 'success');
    el.textContent = message || '';
  }

  async function accountAdmin(command, extra={}){
    const res = await fetch(apiUrl(), {
      method:'POST',
      body:JSON.stringify(Object.assign({ action:'accountAdmin', command, sessionToken:getToken() }, extra))
    });
    return res.json();
  }

  let pendingIssueCharacter = null;
  let pendingAccountChanges = {};
  let accountAdminRendered = false;

  function setLookupStatus(message, isError){
    const el = document.getElementById('adminAccountLookupStatus');
    if(!el) return;
    el.className = 'admin-status ' + (isError ? 'error' : 'success');
    el.textContent = message || '';
  }

  function resetIssueBox(){
    pendingIssueCharacter = null;
    const box = document.getElementById('adminAccountIssueBox');
    const result = document.getElementById('adminAccountCharacterResult');
    const codeInput = document.getElementById('adminAccountCodeInput');
    const createBtn = document.getElementById('adminAccountCreateBtn');
    if(box) box.hidden = true;
    if(result) result.innerHTML = '';
    if(codeInput) codeInput.value = '';
    if(createBtn) createBtn.disabled = true;
  }

  async function lookupAccountCharacter(){
    const input = document.getElementById('adminAccountCharacterInput');
    const button = document.getElementById('adminAccountLookupBtn');
    const name = String(input?.value || '').trim();
    resetIssueBox();
    if(!name){ setLookupStatus('캐릭터 이름을 입력해 주세요.', true); input?.focus(); return; }
    try{
      setLookupStatus('', false);
      setButtonLoading(button, true, '조회 중');
      const data = await accountAdmin('lookupCharacter', { characterName:name });
      if(!data.ok) throw new Error(data.message || '캐릭터 조회 실패');
      pendingIssueCharacter = data.character || null;
      const result = document.getElementById('adminAccountCharacterResult');
      const box = document.getElementById('adminAccountIssueBox');
      if(result){
        result.innerHTML = '<strong>' + safeText(pendingIssueCharacter?.mainCharacter || name) + '</strong>'
          + '<span>' + safeText(pendingIssueCharacter?.className || '클래스 미확인') + ' · 코드 생성 가능</span>';
      }
      if(box) box.hidden = false;
      setLookupStatus('조회 완료. 사용할 회원 코드를 입력해 주세요.', false);
      document.getElementById('adminAccountCodeInput')?.focus();
    }catch(err){ setLookupStatus(err.message || String(err), true); }
    finally{ setButtonLoading(button, false); }
  }

  function validateAccountCodeInput(){
    const input = document.getElementById('adminAccountCodeInput');
    const button = document.getElementById('adminAccountCreateBtn');
    const value = String(input?.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0,6);
    if(input && input.value !== value) input.value = value;
    const valid = isValidMemberCode(value);
    if(button) button.disabled = !pendingIssueCharacter || !valid;
    if(value && value.length === 6 && !valid){
      setLookupStatus('코드는 6자리 안에 알파벳 2개와 숫자 4개가 포함되어야 합니다.', true);
    }else if(pendingIssueCharacter){
      setLookupStatus('조회 완료. 사용할 회원 코드를 입력해 주세요.', false);
    }
  }

  async function createAccountCode(){
    const button = document.getElementById('adminAccountCreateBtn');
    const codeInput = document.getElementById('adminAccountCodeInput');
    const code = String(codeInput?.value || '').trim().toUpperCase();
    if(!pendingIssueCharacter){ setLookupStatus('먼저 캐릭터를 조회해 주세요.', true); return; }
    if(!isValidMemberCode(code)){ setLookupStatus('코드는 총 6자리이며 알파벳 2개와 숫자 4개를 포함해야 합니다.', true); return; }
    try{
      setButtonLoading(button, true, '생성 중');
      setLookupStatus('코드 생성 중...', false);
      const data = await accountAdmin('createCode', { mainCharacter:pendingIssueCharacter.mainCharacter, code, permissions:'' });
      if(!data.ok) throw new Error(data.message || '코드 생성 실패');
      const account = data.account || {};
      setLookupStatus('생성 완료: ' + (account.mainCharacter || pendingIssueCharacter.mainCharacter) + ' / ' + (account.code || code), false);
      document.getElementById('adminAccountCharacterInput').value = '';
      resetIssueBox();
      await listAccountCodes();
    }catch(err){ setLookupStatus(err.message || String(err), true); }
    finally{ setButtonLoading(button, false); validateAccountCodeInput(); }
  }

  async function listAccountCodes(){
    try{
      setAccountStatus('목록 조회 중...', false);
      const data = await accountAdmin('listCodes');
      if(!data.ok) throw new Error(data.message || '목록 조회 실패');
      setAccountStatus('회원 코드 ' + (data.accounts || []).length + '개 조회 완료', false);
      renderAccounts(data.accounts || []);
    }catch(err){ setAccountStatus(err.message || String(err), true); }
  }

  async function syncOwnerMap(){
    try{
      setAccountStatus('캐릭터 소유정보 갱신 중...', false);
      const data = await accountAdmin('syncOwnerMap');
      if(!data.ok) throw new Error(data.message || '캐릭터 소유정보 갱신 실패');
      setAccountStatus('갱신 완료: 캐릭터 ' + Number(data.count || 0) + '명 / 본캐 ' + Number(data.mainCount || 0) + '명', false);
    }catch(err){ setAccountStatus(err.message || String(err), true); }
  }

  function normalizePermissions_(permissions){
    return permissionArray(permissions).filter((item, index, arr) => item && arr.indexOf(item) === index);
  }

  function updateAccountSaveButtons_(){
    const hasChanges = Object.keys(pendingAccountChanges || {}).length > 0;
    const saveBtn = document.getElementById('adminAccountSaveBtn');
    const revertBtn = document.getElementById('adminAccountRevertBtn');
    if(saveBtn) saveBtn.disabled = !hasChanges;
    if(revertBtn) revertBtn.disabled = !hasChanges;
    const status = document.getElementById('adminAccountStatus');
    if(status && hasChanges){
      status.className = 'admin-status pending';
      status.textContent = '저장하지 않은 변경사항이 있습니다. 저장하기 또는 되돌리기를 선택해 주세요.';
    }
  }

  function markAccountRowDirty_(row){
    if(!row) return;
    const code = row.dataset.code || '';
    if(!code) return;
    const originalRole = row.dataset.originalRole || 'MEMBER';
    const originalPermissions = normalizePermissions_(row.dataset.originalPermissions || '').join(',');
    const nextRole = row.dataset.role || 'MEMBER';
    const nextPermissions = normalizePermissions_(row.dataset.permissions || '').join(',');
    const changed = originalRole !== nextRole || originalPermissions !== nextPermissions;
    row.classList.toggle('dirty', changed);
    if(changed){
      pendingAccountChanges[code] = {
        code,
        originalRole,
        role: nextRole,
        originalPermissions,
        permissions: nextPermissions
      };
    }else{
      delete pendingAccountChanges[code];
    }
    updateAccountSaveButtons_();
  }

  function setPermissionToggleState_(button, on){
    if(!button) return;
    button.classList.toggle('on', !!on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function refreshPermissionSummary_(row){
    const summary = row?.querySelector('[data-account-summary]');
    if(!summary) return;
    summary.textContent = roleLabel(row.dataset.role || 'MEMBER') + ' · ' + permissionText(row.dataset.permissions || '');
  }

  async function savePendingAccountChanges(){
    const changes = Object.values(pendingAccountChanges || {});
    if(!changes.length){ setAccountStatus('저장할 변경사항이 없습니다.', false); return; }
    const btn = document.getElementById('adminAccountSaveBtn');
    try{
      setButtonLoading(btn, true, '저장 중');
      setAccountStatus('변경내용 저장 중...', false);
      for(const change of changes){
        if(change.originalRole !== change.role){
          const roleRes = await accountAdmin('updateRole', { code: change.code, role: change.role });
          if(!roleRes.ok) throw new Error(roleRes.message || '등급 수정 실패');
        }
        if(change.originalPermissions !== change.permissions){
          const permRes = await accountAdmin('updatePermissions', { code: change.code, permissions: normalizePermissions_(change.permissions) });
          if(!permRes.ok) throw new Error(permRes.message || '권한 수정 실패');
        }
      }
      pendingAccountChanges = {};
      setAccountStatus('변경내용이 저장되었습니다.', false);
      await listAccountCodes();
    }catch(err){ setAccountStatus(err.message || String(err), true); }
    finally{ setButtonLoading(btn, false); updateAccountSaveButtons_(); }
  }

  function revertPendingAccountChanges(){
    pendingAccountChanges = {};
    renderAccounts(window.__KINOJO_ACCOUNT_LIST__ || []);
    setAccountStatus('변경내용을 되돌렸습니다.', false);
  }

  function renderAccounts(accounts){
    const box = document.getElementById('adminAccountList');
    if(!box) return;
    window.__KINOJO_ACCOUNT_LIST__ = accounts || [];
    pendingAccountChanges = {};
    updateAccountSaveButtons_();
    if(!accounts.length){ box.innerHTML = '<div class="admin-account-empty">조회된 코드가 없습니다.</div>'; return; }

    box.innerHTML = accounts.map(account => {
      const role = roleOf(account);
      const isRoot = role === 'MASTER';
      const displayCode = isRoot ? '마스터 계정' : (account.code || '-');
      const permissions = normalizePermissions_(account.permissions);
      const permDataset = permissions.join(',');
      const toggleHtml = Object.keys(PERMISSION_LABELS).map(key => {
        const on = permissions.includes(key) || permissions.includes('all');
        const disabled = isRoot ? ' disabled' : '';
        return '<label class="admin-switch-row"><span>' + safeText(PERMISSION_LABELS[key]) + '</span><button aria-label="' + safeText(PERMISSION_LABELS[key]) + ' 권한" aria-pressed="' + (on ? 'true' : 'false') + '" class="admin-permission-toggle ' + (on ? 'on' : '') + '" data-account-action="toggle-permission" data-code="' + safeText(account.code || '') + '" data-permission="' + key + '" type="button"' + disabled + '><span></span></button></label>';
      }).join('');
      const roleOptions = ['MEMBER','MANAGER','SUB_MASTER'].map(r => '<option value="' + r + '"' + (role === r ? ' selected' : '') + '>' + safeText(roleLabel(r)) + '</option>').join('');
      const roleSelect = isRoot ? '<span class="admin-account-role-fixed">MASTER</span>' : '<select class="admin-account-role-select" data-account-action="change-role" data-code="' + safeText(account.code || '') + '">' + roleOptions + '</select>'; 
      const deleteButton = isRoot
        ? '<button class="btn admin-account-delete" type="button" disabled>삭제 불가</button>'
        : '<button class="btn admin-account-delete" data-account-action="delete-code" data-code="' + safeText(account.code || '') + '" type="button">코드 삭제</button>';

      return '<article class="admin-account-row" data-original-role="' + safeText(role) + '" data-original-permissions="' + safeText(permDataset) + '" data-role="' + safeText(role) + '" data-name="' + safeText(account.mainCharacter || '') + '" data-code="' + safeText(account.code || '') + '" data-permissions="' + safeText(permDataset) + '">'
        + roleSelect
        + '<div class="admin-account-main"><strong>' + safeText(account.mainCharacter || '-') + '</strong><code class="' + (isRoot ? 'admin-code-hidden' : '') + '">' + safeText(displayCode) + '</code></div>'
        + '<div class="admin-switch-list">' + toggleHtml + '</div>'
        + '<div class="admin-account-row-actions">' + deleteButton + '</div>'
        + '</article>';
    }).join('');
    applyAccountListFilters();
  }

  function applyAccountListFilters(){
    const q = String(document.getElementById('adminAccountSearchInput')?.value || '').toLowerCase().trim();
    const role = String(document.getElementById('adminAccountRoleFilter')?.value || '');
    const perm = String(document.getElementById('adminAccountPermissionFilter')?.value || '');
    document.querySelectorAll('#adminAccountList .admin-account-row').forEach(row => {
      const hay = ((row.dataset.name || '') + ' ' + (row.dataset.code || '')).toLowerCase();
      const rowRole = row.dataset.role || '';
      const rowPerm = row.dataset.permissions || '';
      const visible = (!q || hay.includes(q)) && (!role || rowRole === role) && (!perm || rowPerm.split(',').includes(perm) || rowPerm === 'all');
      row.style.display = visible ? '' : 'none';
    });
  }

  async function handleAccountListClick(event){
    const target = event.target.closest('[data-account-action]');
    if(!target) return;
    const action = target.dataset.accountAction;
    const code = target.dataset.code || target.closest('.admin-account-row')?.dataset.code || '';
    if(!code) return;

    if(action === 'toggle-permission'){
      const row = target.closest('.admin-account-row');
      const permission = target.dataset.permission || '';
      const current = normalizePermissions_(row?.dataset.permissions || '');
      const next = target.classList.contains('on')
        ? current.filter(item => item !== permission)
        : current.concat(permission).filter((item, index, arr) => arr.indexOf(item) === index);
      if(row) row.dataset.permissions = next.join(',');
      setPermissionToggleState_(target, next.includes(permission));
      refreshPermissionSummary_(row);
      markAccountRowDirty_(row);
      return;
    }

    if(action === 'delete-code'){
      if(!confirm(code + ' 코드를 삭제할까요?')) return;
      await deleteAccountCode(code);
    }
  }

  async function handleAccountListChange(event){
    const target = event.target.closest('[data-account-action="change-role"]');
    if(!target) return;
    const row = target.closest('.admin-account-row');
    const role = target.value || 'MEMBER';
    if(row) row.dataset.role = role;
    refreshPermissionSummary_(row);
    markAccountRowDirty_(row);
  }

  async function updateAccountRole(code, role){
    try{
      setAccountStatus('등급 수정 중...', false);
      const data = await accountAdmin('updateRole', { code, role });
      if(!data.ok) throw new Error(data.message || '등급 수정 실패');
      setAccountStatus('등급이 수정되었습니다.', false);
      await listAccountCodes();
    }catch(err){ setAccountStatus(err.message || String(err), true); }
  }

  async function updateAccountPermissions(code, permissions){
    try{
      setAccountStatus('권한 수정 중...', false);
      const data = await accountAdmin('updatePermissions', { code, permissions });
      if(!data.ok) throw new Error(data.message || '권한 수정 실패');
      setAccountStatus('권한이 수정되었습니다.', false);
      await listAccountCodes();
    }catch(err){ setAccountStatus(err.message || String(err), true); }
  }

  async function deleteAccountCode(code){
    try{
      setAccountStatus('코드 삭제 중...', false);
      const data = await accountAdmin('deleteCode', { code });
      if(!data.ok) throw new Error(data.message || '코드 삭제 실패');
      setAccountStatus('코드가 삭제되었습니다.', false);
      await listAccountCodes();
    }catch(err){ setAccountStatus(err.message || String(err), true); }
  }

  function clearIdleLogoutTimer(){
    if(idleLogoutTimer){ clearTimeout(idleLogoutTimer); idleLogoutTimer = null; }
  }

  function resetIdleLogoutTimer(){
    if(!getSession()) return;
    clearIdleLogoutTimer();
    idleLogoutTimer = setTimeout(()=>{
      clearSession();
      toast('5분 동안 조작이 없어 자동 로그아웃되었습니다.');
    }, IDLE_LOGOUT_MS);
  }

  function bindIdleLogout(){
    ['click','keydown','scroll','touchstart','mousemove'].forEach(type=>{
      window.addEventListener(type, resetIdleLogoutTimer, { passive:true });
    });
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState === 'visible') resetIdleLogoutTimer();
    });
  }

  function bind(){
    document.getElementById('kinojoLoginBtn')?.addEventListener('click', ()=>openLoginModal());
    document.getElementById('kinojoLogoutBtn')?.addEventListener('click', ()=>{ clearSession(); toast('로그아웃되었습니다.'); });
        document.addEventListener('keydown', e=>{
      if(e.key === 'Escape'){
        closeLoginModal();
        closeAccountAdminModal();
      }
    });
    bindIdleLogout();
    updateStatus();
  }

  window.KinojoAuth = {
    openLoginModal, closeLoginModal, requireLogin,
    openAccountAdminModal, closeAccountAdminModal, renderAccountAdminInline,
    getSession, getAccount, getToken, getLevel, isLoggedIn, isAdmin,
    updateStatus, clearSession
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
