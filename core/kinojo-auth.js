/*
 * KINOJO Login UI Bridge
 * Role: 코드 로그인, 세션 보관, 권한 상태 표시, 관리자 회원 코드 관리 UI를 담당합니다.
 * Note: 실제 권한 판정은 Apps Script account_logic.gs / reaction_logic.gs가 최종 처리합니다.
 */
(function(){
  const STORAGE_KEY = 'kinojo_login_session_v1';
  const ACCOUNT_KEY = 'kinojo_login_account_v1';
  const LEGACY_ADMIN_PASSWORD = 'zlshwhghkdlxld';

  function apiUrl(){
    const param = new URLSearchParams(location.search).get('api');
    if(param) return param;
    try{
      if(typeof WEB_APP_URL !== 'undefined' && WEB_APP_URL) return WEB_APP_URL;
    }catch(_err){}
    return 'https://script.google.com/macros/s/AKfycbztXbGEbiId1yOfa3CVmErivNVi5IUi64qxIQRf8Sm_KduCPieeAKlNRMGyYkKL5iPaYg/exec';
  }

  function buildUrl(action, params={}){
    const base = apiUrl();
    const joiner = base.includes('?') ? '&' : '?';
    const q = new URLSearchParams(Object.assign({ action, t:String(Date.now()) }, params));
    return base + joiner + q.toString();
  }

  function readJson(key){
    try{ return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch(_err){ return null; }
  }

  function writeJson(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getSession(){
    const session = readJson(STORAGE_KEY);
    if(!session || !session.token) return null;
    if(Number(session.expiresAt || 0) && Date.now() > Number(session.expiresAt)){
      clearSession();
      return null;
    }
    return session;
  }

  function getAccount(){
    return readJson(ACCOUNT_KEY);
  }

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
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }

  function updateStatus(){
    const label = document.getElementById('kinojoAuthLabel');
    const loginBtn = document.getElementById('kinojoLoginBtn');
    const logoutBtn = document.getElementById('kinojoLogoutBtn');
    const session = getSession();
    const account = getAccount();

    if(session){
      const name = account?.mainCharacter || session.mainCharacter || '회원';
      const level = Number(session.level || account?.level || 1);
      if(label) label.textContent = 'Lv.' + level + ' · ' + name;
      if(loginBtn) loginBtn.style.display = 'none';
      if(logoutBtn) logoutBtn.style.display = '';
      document.body.classList.add('kinojo-logged-in');
      document.body.classList.toggle('kinojo-admin-user', level >= 5);
    }else{
      if(label) label.textContent = '비회원 · 열람만 가능';
      if(loginBtn) loginBtn.style.display = '';
      if(logoutBtn) logoutBtn.style.display = 'none';
      document.body.classList.remove('kinojo-logged-in','kinojo-admin-user');
    }
  }

  function toast(message){
    const text = String(message || '');
    if(window.KinojoToast && typeof window.KinojoToast.show === 'function') return window.KinojoToast.show(text);
    alert(text);
  }

  function ensureModal(){
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
    const modal = ensureModal();
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
    const modal = ensureModal();
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
    return document.getElementById('adminPasswordInput')?.value || LEGACY_ADMIN_PASSWORD;
  }

  function ensureAccountAdminPanel(){
    let panel = document.getElementById('adminAccountPanel');
    const host = document.getElementById('adminControlPanel');
    if(panel || !host) return panel;
    panel = document.createElement('div');
    panel.id = 'adminAccountPanel';
    panel.className = 'admin-account-panel';
    panel.style.display = 'none';
    panel.innerHTML = '<div class="admin-account-title">회원 코드 관리</div>'
      + '<div class="admin-account-grid">'
      + '<input class="search" id="adminAccountMainInput" placeholder="본캐 이름" />'
      + '<input class="search" id="adminAccountPermInput" placeholder="권한 플래그 예: sanctuary_edit" />'
      + '<input class="search" id="adminAccountMemoInput" placeholder="메모" />'
      + '</div>'
      + '<div class="admin-account-actions">'
      + '<button class="btn" id="adminAccountCreateBtn" type="button">코드 생성</button>'
      + '<button class="btn" id="adminAccountListBtn" type="button">목록 조회</button>'
      + '<button class="btn" id="adminOwnerMapSyncBtn" type="button">본캐/부캐 지도 갱신</button>'
      + '</div>'
      + '<div class="admin-status" id="adminAccountStatus"></div>'
      + '<div class="admin-account-list" id="adminAccountList"></div>';
    host.appendChild(panel);
    panel.querySelector('#adminAccountCreateBtn')?.addEventListener('click', createAccountCode);
    panel.querySelector('#adminAccountListBtn')?.addEventListener('click', listAccountCodes);
    panel.querySelector('#adminOwnerMapSyncBtn')?.addEventListener('click', syncOwnerMap);
    return panel;
  }

  function openAccountAdminPanel(){
    const panel = ensureAccountAdminPanel();
    if(!panel) return toast('회원 코드 관리 영역을 만들지 못했습니다.');
    panel.style.display = panel.style.display === 'none' ? 'grid' : 'none';
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
      body:JSON.stringify(Object.assign({ action:'accountAdmin', command, password:adminPassword() }, extra))
    });
    return res.json();
  }

  async function createAccountCode(){
    const mainCharacter = document.getElementById('adminAccountMainInput')?.value.trim() || '';
    const permissions = document.getElementById('adminAccountPermInput')?.value.trim() || '';
    const memo = document.getElementById('adminAccountMemoInput')?.value.trim() || '';
    if(!mainCharacter){ setAccountStatus('본캐 이름을 입력해 주세요.', true); return; }
    try{
      setAccountStatus('코드 생성 중...', false);
      const data = await accountAdmin('createCode', { mainCharacter, permissions, memo });
      if(!data.ok) throw new Error(data.message || '코드 생성 실패');
      const account = data.account || {};
      setAccountStatus('생성 완료: ' + (account.mainCharacter || mainCharacter) + ' / ' + (account.code || '-'), false);
      renderAccounts([account]);
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
      setAccountStatus('본캐/부캐 지도 갱신 중...', false);
      const data = await accountAdmin('syncOwnerMap');
      if(!data.ok) throw new Error(data.message || '지도 갱신 실패');
      setAccountStatus('갱신 완료: 캐릭터 ' + Number(data.count || 0) + '명 / 본캐 ' + Number(data.mainCount || 0) + '명', false);
    }catch(err){ setAccountStatus(err.message || String(err), true); }
  }

  function renderAccounts(accounts){
    const box = document.getElementById('adminAccountList');
    if(!box) return;
    if(!accounts.length){ box.innerHTML = '<div class="admin-account-empty">조회된 코드가 없습니다.</div>'; return; }
    box.innerHTML = accounts.map(account => {
      const active = account.active === true || String(account.active).toUpperCase() === 'TRUE';
      return '<div class="admin-account-row">'
        + '<strong>' + safeText(account.mainCharacter || '-') + '</strong>'
        + '<code>' + safeText(account.code || '-') + '</code>'
        + '<span>Lv.' + Number(account.level || 0) + ' · ' + (active ? '활성' : '비활성') + '</span>'
        + '<small>' + safeText(account.permissions || account.memo || '') + '</small>'
        + '</div>';
    }).join('');
  }

  function bind(){
    document.getElementById('kinojoLoginBtn')?.addEventListener('click', ()=>openLoginModal());
    document.getElementById('kinojoLogoutBtn')?.addEventListener('click', ()=>{ clearSession(); toast('로그아웃되었습니다.'); });
    document.getElementById('adminAccountBtn')?.addEventListener('click', openAccountAdminPanel);
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeLoginModal(); });
    updateStatus();
  }

  window.KinojoAuth = {
    openLoginModal, closeLoginModal, requireLogin,
    getSession, getAccount, getToken, getLevel, isLoggedIn, isAdmin,
    updateStatus, clearSession
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
