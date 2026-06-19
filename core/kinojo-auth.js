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
  const LEGACY_ADMIN_PASSWORD = 'zlshwhghkdlxld';
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
  function getLevel(){ return Number(getSession()?.level || 0); }
  function isAdmin(){ return getLevel() >= 5; }

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
    if(!arr.length) return '일반회원';
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
    const prefix = location.pathname.includes('/hall-of-fame/') ? './assets/' : 'hall-of-fame/assets/';
    return prefix + 'class_icon_' + file + '.png';
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
      const level = Number(session.level || account?.level || 1);
      const isRoot = level >= 5;
      const className = account?.className || session.className || '';
      const icon = classIconFor(className);
      const role = isRoot ? '관리자' : '회원';
      if(label){
        label.innerHTML = (icon ? '<img class="kinojo-auth-class-icon" src="' + safeText(icon) + '" alt="" />' : '')
          + '<span class="kinojo-auth-name">' + safeText(name) + '</span>'
          + '<span class="kinojo-auth-role">' + role + '</span>';
      }
      if(loginBtn) loginBtn.style.display = 'none';
      if(logoutBtn) logoutBtn.style.display = '';
      if(adminWrap) adminWrap.style.display = isRoot ? '' : 'none';
      document.body.classList.add('kinojo-logged-in');
      document.body.classList.toggle('kinojo-admin-user', isRoot);
      resetIdleLogoutTimer();
    }else{
      if(label) label.textContent = '비회원 · 열람만 가능';
      if(loginBtn) loginBtn.style.display = '';
      if(logoutBtn) logoutBtn.style.display = 'none';
      if(adminWrap) adminWrap.style.display = 'none';
      document.body.classList.remove('kinojo-logged-in','kinojo-admin-user');
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
      + '<input id="kinojoLoginCodeInput" class="search kinojo-login-input" maxlength="12" placeholder="예: AB1234 또는 관리자 코드" autocomplete="one-time-code" />'
      + '<button id="kinojoLoginSubmitBtn" class="btn kinojo-login-submit" type="button">로그인</button>'
      + '<div id="kinojoLoginStatus" class="kinojo-login-status"></div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', e=>{ if(e.target === modal) closeLoginModal(); });
    modal.querySelector('#kinojoLoginCloseBtn')?.addEventListener('click', closeLoginModal);
    modal.querySelector('#kinojoLoginSubmitBtn')?.addEventListener('click', submitLogin);
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

  async function submitLogin(){
    const modal = ensureLoginModal();
    const input = modal.querySelector('#kinojoLoginCodeInput');
    const button = modal.querySelector('#kinojoLoginSubmitBtn');
    const status = modal.querySelector('#kinojoLoginStatus');
    const code = String(input?.value || '').trim();
    if(!code){ if(status) status.textContent = '로그인 코드를 입력해 주세요.'; return; }
    const old = button ? button.textContent : '';
    try{
      if(button){ button.disabled = true; button.textContent = '확인 중...'; }
      if(status) status.textContent = '';
      const res = await fetch(apiUrl(), { method:'POST', body:JSON.stringify({ action:'login', code }) });
      const data = await res.json();
      if(!data.ok) throw new Error(data.message || '로그인에 실패했습니다.');
      setSession(data.session, data.account);
      if(status) status.textContent = '로그인되었습니다.';
      setTimeout(closeLoginModal, 280);
    }catch(err){
      if(status) status.textContent = err.message || String(err);
    }finally{
      if(button){ button.disabled = false; button.textContent = old || '로그인'; }
    }
  }

  function requireLogin(message){
    if(isLoggedIn()) return true;
    openLoginModal(message || '로그인 후 이용할 수 있습니다.');
    return false;
  }

  function adminPassword(){
    return LEGACY_ADMIN_PASSWORD;
  }

  function ensureAccountAdminModal(){
    let modal = document.getElementById('kinojoAccountAdminModal');
    if(modal) return modal;

    modal = document.createElement('section');
    modal.id = 'kinojoAccountAdminModal';
    modal.className = 'kinojo-account-modal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML = '<div class="kinojo-account-card" role="dialog" aria-modal="true" aria-labelledby="kinojoAccountAdminTitle">'
      + '<button class="kinojo-login-close kinojo-account-x" id="kinojoAccountCloseBtn" type="button" aria-label="닫기">×</button>'
      + '<div class="kinojo-account-head">'
      + '<div><div class="kinojo-login-kicker">ADMIN</div><h2 id="kinojoAccountAdminTitle">회원 코드 관리</h2><p>본캐명을 직접 입력해 회원 코드를 생성하고, 필요한 권한만 ON/OFF로 관리합니다.</p></div>'
      + '</div>'
      + '<div class="kinojo-account-section">'
      + '<label class="kinojo-account-label" for="adminAccountMainInput">본캐명 입력</label>'
      + '<div class="kinojo-account-create-row">'
      + '<input id="adminAccountMainInput" class="search kinojo-account-input" placeholder="예: 깡채채" autocomplete="off" />'
      + '<button class="btn" id="adminAccountCreateBtn" type="button">코드 생성</button>'
      + '</div>'
      + '</div>'
      + '<div class="kinojo-account-section">'
      + '<div class="kinojo-account-toolbar">'
      + '<strong>회원 목록</strong>'
      + '<div class="kinojo-account-toolbar-actions">'
      + '<button class="btn" id="adminOwnerMapSyncBtn" type="button">캐릭터 소유정보 갱신</button>'
      + '<button class="btn" id="adminAccountListBtn" type="button">목록 새로고침</button>'
      + '</div>'
      + '</div>'
      + '<div class="admin-status" id="adminAccountStatus"></div>'
      + '<div class="admin-account-list" id="adminAccountList"></div>'
      + '</div>'
      + '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', e=>{ if(e.target === modal) closeAccountAdminModal(); });
    modal.querySelector('#kinojoAccountCloseBtn')?.addEventListener('click', closeAccountAdminModal);
    modal.querySelector('#adminAccountCreateBtn')?.addEventListener('click', createAccountCode);
    modal.querySelector('#adminAccountMainInput')?.addEventListener('keydown', e=>{ if(e.key === 'Enter') createAccountCode(); });
    modal.querySelector('#adminAccountListBtn')?.addEventListener('click', listAccountCodes);
    modal.querySelector('#adminOwnerMapSyncBtn')?.addEventListener('click', syncOwnerMap);
    modal.querySelector('#adminAccountList')?.addEventListener('click', handleAccountListClick);
    return modal;
  }

  function openAccountAdminModal(){
    const modal = ensureAccountAdminModal();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    listAccountCodes();
    setTimeout(()=>document.getElementById('adminAccountMainInput')?.focus(), 40);
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

  async function loadMainCharacters(){
    const select = document.getElementById('adminAccountMainSelect');
    if(!select) return;
    try{
      select.innerHTML = '<option value="">본캐 목록 불러오는 중...</option>';
      const data = await accountAdmin('listMains');
      if(!data.ok) throw new Error(data.message || '본캐 목록 조회 실패');
      const mains = data.mains || [];
      select.innerHTML = '<option value="">본캐 선택</option>' + mains.map(name => '<option value="' + safeText(name) + '">' + safeText(name) + '</option>').join('');
      if(!mains.length) setAccountStatus('등록된 본캐가 없습니다. 본캐/부캐 지도를 먼저 갱신해 주세요.', true);
    }catch(err){
      select.innerHTML = '<option value="">본캐 목록 조회 실패</option>';
      setAccountStatus(err.message || String(err), true);
    }
  }

  async function createAccountCode(){
    const input = document.getElementById('adminAccountMainInput');
    const mainCharacter = String(input?.value || '').trim();
    if(!mainCharacter){ setAccountStatus('본캐명을 입력해 주세요.', true); input?.focus(); return; }
    try{
      setAccountStatus('코드 생성 중...', false);
      const data = await accountAdmin('createCode', { mainCharacter, permissions:'' });
      if(!data.ok) throw new Error(data.message || '코드 생성 실패');
      const account = data.account || {};
      setAccountStatus('생성 완료: ' + (account.mainCharacter || mainCharacter) + ' / ' + (account.code || '-'), false);
      if(input) input.value = '';
      await listAccountCodes();
    }catch(err){ setAccountStatus(err.message || String(err), true); }
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

  function renderAccounts(accounts){
    const box = document.getElementById('adminAccountList');
    if(!box) return;
    if(!accounts.length){ box.innerHTML = '<div class="admin-account-empty">조회된 코드가 없습니다.</div>'; return; }

    box.innerHTML = accounts.map(account => {
      const active = account.active === true || String(account.active).toUpperCase() === 'TRUE';
      const isRoot = Number(account.level || 0) >= 5;
      const displayCode = isRoot ? '관리자 계정' : (account.code || '-');
      const permissions = permissionArray(account.permissions);
      const toggleHtml = Object.keys(PERMISSION_LABELS).map(key => {
        const on = permissions.includes(key) || permissions.includes('all');
        const disabled = isRoot ? ' disabled' : '';
        return '<button class="admin-permission-toggle ' + (on ? 'on' : '') + '" data-account-action="toggle-permission" data-code="' + safeText(account.code || '') + '" data-permission="' + key + '" type="button"' + disabled + '>' + safeText(PERMISSION_LABELS[key]) + '</button>';
      }).join('');
      const deleteButton = isRoot
        ? '<button class="admin-account-delete" type="button" disabled>삭제 불가</button>'
        : '<button class="admin-account-delete" data-account-action="delete-code" data-code="' + safeText(account.code || '') + '" type="button">코드 삭제</button>';

      return '<article class="admin-account-row" data-code="' + safeText(account.code || '') + '" data-permissions="' + safeText(account.permissions || '') + '">'
        + '<div class="admin-account-main"><strong>' + safeText(account.mainCharacter || '-') + '</strong><span>' + (active ? '활성' : '비활성') + ' · ' + permissionText(account.permissions) + '</span></div>'
        + '<code class="' + (isRoot ? 'admin-code-hidden' : '') + '">' + safeText(displayCode) + '</code>'
        + '<div class="admin-permission-list">' + toggleHtml + '</div>'
        + '<div class="admin-account-row-actions">' + deleteButton + '</div>'
        + '</article>';
    }).join('');
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
      const current = permissionArray(row?.dataset.permissions || '');
      const next = target.classList.contains('on')
        ? current.filter(item => item !== permission)
        : current.concat(permission).filter((item, index, arr) => arr.indexOf(item) === index);
      await updateAccountPermissions(code, next);
      return;
    }

    if(action === 'delete-code'){
      if(!confirm(code + ' 코드를 삭제할까요?')) return;
      await deleteAccountCode(code);
    }
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
    window.addEventListener('pagehide', ()=>{ clearSession(); });
  }

  function bind(){
    document.getElementById('kinojoLoginBtn')?.addEventListener('click', ()=>openLoginModal());
    document.getElementById('kinojoLogoutBtn')?.addEventListener('click', ()=>{ clearSession(); toast('로그아웃되었습니다.'); });
    document.getElementById('adminAccountBtn')?.addEventListener('click', openAccountAdminModal);
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
    openAccountAdminModal, closeAccountAdminModal,
    getSession, getAccount, getToken, getLevel, isLoggedIn, isAdmin,
    updateStatus, clearSession
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
