/*
 * KINOJO Auth UI
 * Role: 코드 로그인, 세션 보관, 권한 상태 표시, 회원 코드 관리 모달을 담당합니다.
 * Note: 실제 권한 판정은 Supabase member_codes / Server Engine 기준으로 처리합니다.
 */
(function(){
  const authSessionCore=window.KinojoAuthSessionCore;
  if(!authSessionCore) throw new Error('KinojoAuthSessionCore가 먼저 로드되어야 합니다.');
  const {ACTIVITY_WRITE_THROTTLE_MS,SERVER_TOUCH_THROTTLE_MS,getIdleState,getSession,getAccount,isLoggedIn,getToken,roleOf,roleLabel,canOpenManage,getLevel,isAdmin,canManageAccounts}=authSessionCore;
  let idleLogoutTimer=null;
  let idleCountdownTimer=null;
  let idleWarningOpen=false;
  let idleWarningDeadlineAt=0;
  let idleExtendPending=false;
  let lastActivityWriteAt=0;
  let lastServerTouchAt=0;
  let serverTouchPending=false;
  let serverRestorePending=false;
  const PERMISSION_LABELS = {
    sanctuary_edit: '성역 관리',
    visit_manage: '방문자수 조정',
    snapshot_manage: '성장왕 스냅샷',
    account_manage: '회원 코드 관리'
  };
  let codeRequestLookupCharacter = null;
  let codeRequestSubmitted = false;
  const AUTH_SCHEMA_VERSION = 'supabase-passkey-v5-server-session-320-20260816';




  function apiUrl(){
    if(window.KinojoApi && typeof window.KinojoApi.getBaseUrl === 'function') return window.KinojoApi.getBaseUrl();
    const param = new URLSearchParams(location.search).get('api');
    if(param) return param;
    return '';
  }













  function setSession(session,account){
    authSessionCore.setStoredSession(session,account);
    if(window.KinojoAuthService?.isServerSessionToken?.(session?.token)) lastServerTouchAt=Date.now();
    closeIdleLogoutWarning();
    updateStatus();
  }

  function clearSession(reason){
    closeIdleLogoutWarning();
    authSessionCore.clearStoredSession(reason||'user_logout');
    const modal=document.getElementById('kinojoLoginModal');
    if(modal){const input=modal.querySelector('#kinojoLoginCodeInput');if(input)input.value='';resetCodeRequestPanel(true);}
    updateStatus();
  }









  function currentAdminAccount_(){ return typeof getAccount === 'function' ? getAccount() : null; }
  function canEditManagedAccount_(account){
    const actor=currentAdminAccount_();
    const actorLevel=roleLevel(roleOf(actor));
    const targetLevel=roleLevel(roleOf(account));
    if(!actor || actorLevel<3) return false;
    if((actor.id&&account.id&&String(actor.id)===String(account.id)) || (actor.mainCharacter&&account.mainCharacter&&String(actor.mainCharacter)===String(account.mainCharacter))) return false;
    return targetLevel<actorLevel;
  }
  function assignableRoles_(actorRole){
    if(actorRole==='MASTER') return ['MEMBER','STAFF','MANAGER','SUB_MASTER'];
    if(actorRole==='SUB_MASTER') return ['MEMBER','STAFF','MANAGER'];
    if(actorRole==='MANAGER') return ['MEMBER','STAFF'];
    return [];
  }

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
    return window.KinojoCommonUI?.classIconFor?.(className) || '';
  }

  function updateStatus(){
    const label = document.getElementById('kinojoAuthLabel');
    const loginBtn = document.getElementById('kinojoLoginBtn');
    const logoutBtn = document.getElementById('kinojoLogoutBtn');
    const adminWrap = document.querySelector('#kinojoUserStatus .admin-menu-wrap');
    const session = getSession();
    const account = getAccount();

    if(session){
      if(isServerSessionToken_(session.token)&&!lastServerTouchAt) lastServerTouchAt=Date.now();
      const name = account?.mainCharacter || session.mainCharacter || '회원';
      const role = roleOf(session) || roleOf(account) || '';
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
    if(modal && modal.querySelector('#kinojoLoginCodeInput')) return modal;
    if(modal) modal.remove();
    modal = document.createElement('section');
    modal.id = 'kinojoLoginModal';
    modal.className = 'kinojo-login-modal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML = '<div class="kinojo-login-card" role="dialog" aria-modal="true" aria-labelledby="kinojoLoginTitle">'
      + '<button class="kinojo-login-close" id="kinojoLoginCloseBtn" type="button" aria-label="닫기">×</button>'
      + '<div class="kinojo-login-kicker">KINOJO LOGIN</div>'
      + '<h2 id="kinojoLoginTitle">PASS KEY</h2>'
      + '<p id="kinojoLoginHelpText">관리자가 발급한 PASS KEY로 로그인하면 좋아요·싫어요와 제안 기능을 사용할 수 있습니다.</p>'
      + '<input id="kinojoLoginCodeInput" class="kinojo-login-input kinojo-login-text-input" type="text" autocomplete="one-time-code" inputmode="text" spellcheck="false" placeholder="PASS KEY를 입력하세요" aria-label="PASS KEY 입력" />'
      + '<div class="kinojo-code-otp kinojo-login-otp kinojo-login-otp-display" id="kinojoLoginOtp" aria-label="입력된 PASS KEY 미리보기">'
      + '<span class="kinojo-code-otp-cell"></span>'
      + '<span class="kinojo-code-otp-cell"></span>'
      + '<span class="kinojo-code-otp-cell"></span>'
      + '<span class="kinojo-code-otp-cell"></span>'
      + '<span class="kinojo-code-otp-cell"></span>'
      + '<span class="kinojo-code-otp-cell"></span>'
      + '</div>'
      + '<button id="kinojoLoginSubmitBtn" class="kinojo-login-submit" type="button"><span class="kinojo-login-btn-text">로그인</span></button>'
      + '<div id="kinojoLoginStatus" class="kinojo-login-status"></div>'
      + '<div class="kinojo-code-request-panel" id="kinojoCodeRequestPanel">'
      + '<div class="kinojo-code-request-title"><span>코드가 없거나</span> <span class="kinojo-code-request-title-blue">잊으셨나요?</span></div>'
      + '<div class="kinojo-code-request-row">'
      + '<input id="kinojoCodeRequestCharacterInput" class="kinojo-login-input kinojo-code-request-character" placeholder="캐릭터 이름" autocomplete="off" />'
      + '<button id="kinojoCodeRequestLookupBtn" class="kinojo-code-request-lookup" type="button">조회</button>'
      + '</div>'
      + '<div id="kinojoCodeRequestLookupStatus" class="kinojo-login-status kinojo-code-request-status"></div>'
      + '<div id="kinojoCodeRequestCodeBox" class="kinojo-code-request-code-box" hidden>'
      + '<div class="kinojo-code-request-character-result" id="kinojoCodeRequestCharacterResult"></div>'
      + '<div class="kinojo-code-otp" id="kinojoCodeRequestOtp" aria-label="요청 코드 6자리 입력">'
      + '<input class="kinojo-code-otp-cell" maxlength="1" inputmode="text" autocomplete="one-time-code" />'
      + '<input class="kinojo-code-otp-cell" maxlength="1" inputmode="text" />'
      + '<input class="kinojo-code-otp-cell" maxlength="1" inputmode="text" />'
      + '<input class="kinojo-code-otp-cell" maxlength="1" inputmode="text" />'
      + '<input class="kinojo-code-otp-cell" maxlength="1" inputmode="text" />'
      + '<input class="kinojo-code-otp-cell" maxlength="1" inputmode="text" />'
      + '</div>'
      + '<div class="kinojo-account-help">영문 2자 + 숫자 4자, 순서는 자유입니다.</div>'
      + '<button id="kinojoCodeRequestSubmitBtn" class="kinojo-login-submit kinojo-code-request-submit" type="button" disabled>요청하기</button>'
      + '</div>'
      + '</div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', e=>{ if(e.target === modal) closeLoginModal(); });
    modal.querySelector('#kinojoLoginCloseBtn')?.addEventListener('click', closeLoginModal);
    modal.querySelector('#kinojoLoginSubmitBtn')?.addEventListener('click', submitLogin);
    bindLoginOtpInput(modal.querySelector('#kinojoLoginOtp'));
    modal.querySelector('#kinojoLoginCodeInput')?.addEventListener('keydown', e=>{ if(e.key === 'Enter') submitLogin(); });
    modal.querySelector('#kinojoCodeRequestLookupBtn')?.addEventListener('click', lookupCodeRequestCharacter);
    modal.querySelector('#kinojoCodeRequestCharacterInput')?.addEventListener('keydown', e=>{ if(e.key === 'Enter') lookupCodeRequestCharacter(); });
    modal.querySelector('#kinojoCodeRequestSubmitBtn')?.addEventListener('click', submitCodeRequest);
    bindOtpInput(modal.querySelector('#kinojoCodeRequestOtp'), validateCodeRequestOtp);
    return modal;
  }

  function loginHelpText_(context){
    const key = String(context || '').trim();
    if(key === 'sanctuary'){
      return '관리자가 발급한 PASS KEY로 로그인하면<br>클립보드 복사 기능을 사용할 수 있고<br>상위 권한이 있는 경우 수정 기능도 사용할 수 있습니다.';
    }
    if(key === 'hall' || key === 'reaction'){
      return '관리자가 발급한 PASS KEY로 로그인하면<br>좋아요/싫어요와 다양한 기능을 사용할 수 있습니다';
    }
    if(key === 'meter'){
      return '관리자가 발급한 PASS KEY로 로그인하면<br>연결 캐릭터를 선택하고 내 DPS를 Server 통계와 비교할 수 있습니다.';
    }
    return '관리자가 발급한 PASS KEY로 로그인하면 좋아요·싫어요와 제안 기능을 사용할 수 있습니다.';
  }

  function openLoginModal(reason, options){
    const modal = ensureLoginModal();
    const status = modal.querySelector('#kinojoLoginStatus');
    const input = modal.querySelector('#kinojoLoginCodeInput');
    const help = modal.querySelector('#kinojoLoginHelpText');
    const opts = (options && typeof options === 'object') ? options : {};
    if(help) help.innerHTML = opts.helperHtml || loginHelpText_(opts.context || '');
    if(status) status.textContent = reason || '';
    if(input) input.value = '';
    setLoginOtpValue(modal.querySelector('#kinojoLoginOtp'), '');
    resetCodeRequestPanel(true);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    setTimeout(()=>modal.querySelector('#kinojoLoginCodeInput')?.focus(), 30);
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
      ? '<span class="kinojo-spinner" aria-hidden="true"></span><span class="kinojo-login-btn-text">PASS KEY 확인 중...</span>'
      : '<span class="kinojo-login-btn-text">로그인</span>';
  }

  async function submitLogin(){
    const modal = ensureLoginModal();
    const input = modal.querySelector('#kinojoLoginCodeInput');
    const button = modal.querySelector('#kinojoLoginSubmitBtn');
    const status = modal.querySelector('#kinojoLoginStatus');
    if(button?.disabled) return;
    const root = modal.querySelector('#kinojoLoginOtp');
    setLoginOtpValue(root, input?.value || '', { skipInput:true });
    const code = normalizeLoginCodeText_(input?.value || '').trim();
    if(input && input.value !== code) input.value = code;
    if(!code){ if(status) status.textContent = 'PASS KEY를 입력해 주세요.'; return; }
    try{
      setLoginLoading_(button, true);
      if(status) status.textContent = '';
      let data = null;
      let supabaseError = null;
      let supabasePreferred = false;
      let allowLegacyAppsScriptLogin = true;

      if(window.KinojoSupabase && typeof window.KinojoSupabase.verifyPassKey === 'function'){
        try{
          if(typeof window.KinojoSupabase.loadRemoteConfig === 'function') await window.KinojoSupabase.loadRemoteConfig();
          supabasePreferred = typeof window.KinojoSupabase.isPreferred === 'function' ? window.KinojoSupabase.isPreferred() : true;
          const cfg = window.KinojoSupabase.getConfig ? window.KinojoSupabase.getConfig() : null;
          allowLegacyAppsScriptLogin = !!(cfg && cfg.fallbackToAppsScript === true);

          if(supabasePreferred){
            data = await window.KinojoAuthService.verifyPassKey(code);
          }
        }catch(err){
          supabaseError = err;
          const cfg = window.KinojoSupabase.getConfig ? window.KinojoSupabase.getConfig() : null;
          allowLegacyAppsScriptLogin = !!(cfg && cfg.fallbackToAppsScript === true);

          // Supabase 이관 이후 로그인은 member_codes 단일 경로로 처리한다.
          // legacy API에 과거 코드가 남아 있어도 여기로 넘기지 않아 중복 로그인/오류 누적을 막는다.
          if(supabasePreferred && !allowLegacyAppsScriptLogin){
            throw err;
          }
          if(err && err.kinojoSupabaseConfigError){
            throw err;
          }
        }
      }
      if(!data){
        if(supabasePreferred && !allowLegacyAppsScriptLogin){
          throw supabaseError || new Error('PASS KEY가 없거나 비활성화된 계정입니다.');
        }
        data = window.KinojoApi
          ? await window.KinojoApi.postAction('login', { code })
          : await (await fetch(apiUrl(), { method:'POST', body:JSON.stringify({ action:'login', code }) })).json();
      }
      if(!data.ok) throw new Error(data.message || (supabaseError && supabaseError.message) || '로그인에 실패했습니다.');
      const sessionRole = roleOf(data.session) || roleOf(data.account);
      if(!sessionRole){
        if(supabasePreferred && supabaseError){
          throw new Error('Supabase 로그인 실패: ' + (supabaseError.message || supabaseError));
        }
        throw new Error('로그인 응답에 등급 정보가 없습니다. Supabase member_codes 등록 상태를 확인해 주세요.');
      }
      if(data.session){
        data.session.role = sessionRole;
        data.session.roleLabel = data.session.roleLabel || roleLabel(sessionRole);
      }
      if(data.account){
        data.account.role = roleOf(data.account) || sessionRole;
        data.account.roleLabel = data.account.roleLabel || roleLabel(data.account.role);
      }
      setSession(data.session, data.account);
      window.KinojoSupabase?.logLoginVisit?.().catch(()=>{});
      if(status) status.textContent = '로그인되었습니다.';
      if(input) input.value = '';
      setLoginOtpValue(modal.querySelector('#kinojoLoginOtp'), '');
      resetCodeRequestPanel(true);
      setTimeout(closeLoginModal, 280);
    }catch(err){
      if(status) status.textContent = err.message || String(err);
    }finally{
      setLoginLoading_(button, false);
    }
  }

  function requireLogin(message, options){
    if(isLoggedIn()) return true;
    openLoginModal(message || '로그인 후 이용할 수 있습니다.', options);
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


  function otpValue(root){
    return Array.from(root?.querySelectorAll('.kinojo-code-otp-cell') || []).map(input => input.value || '').join('').toUpperCase();
  }

  function setOtpValue(root, value){
    const cells = Array.from(root?.querySelectorAll('.kinojo-code-otp-cell') || []);
    const chars = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).split('');
    cells.forEach((cell, index) => { cell.value = chars[index] || ''; });
  }

  function normalizeLoginCodeText_(value){
    // PASS KEY는 관리자 고정 한글 코드(예: 키노조화이팅)와 일반 영문/숫자 코드를 모두 허용합니다.
    // 한글 IME 조합 중간값을 강제로 분해하지 않기 위해 실제 입력은 input 1개에서 처리하고,
    // 6칸은 완성된 문자열을 보여주는 preview 역할만 합니다.
    return Array.from(String(value || '').replace(/[a-z]/g, ch => ch.toUpperCase()).replace(/\s+/g, '')).slice(0, 12).join('');
  }

  function setLoginOtpValue(root, value, options){
    const input = document.getElementById('kinojoLoginCodeInput');
    const normalized = normalizeLoginCodeText_(value);
    const skipInput = options && options.skipInput;
    if(input && !skipInput && input.value !== normalized) input.value = normalized;
    renderLoginOtpDisplay(root, normalized);
  }

  function renderLoginOtpDisplay(root, value){
    const cells = Array.from(root?.querySelectorAll('.kinojo-code-otp-cell') || []);
    const chars = Array.from(normalizeLoginCodeText_(value));
    cells.forEach((cell, index) => {
      cell.textContent = chars[index] || '';
      cell.classList.toggle('filled', !!chars[index]);
    });
    root?.classList.toggle('is-filled', chars.length >= cells.length);
  }

  function bindLoginOtpInput(root){
    if(!root || root.dataset.loginOtpBound) return;
    root.dataset.loginOtpBound = '1';
    const input = document.getElementById('kinojoLoginCodeInput');
    if(!input) return;
    let composing = false;

    function sync(options){
      if(composing && !(options && options.force)) return;
      const normalized = normalizeLoginCodeText_(input.value || '');
      if(input.value !== normalized) input.value = normalized;
      setLoginOtpValue(root, normalized, { skipInput:true });
    }

    input.addEventListener('compositionstart', () => { composing = true; root.classList.add('is-composing'); });
    input.addEventListener('compositionend', () => { composing = false; root.classList.remove('is-composing'); sync({ force:true }); });
    input.addEventListener('input', event => {
      if(event.isComposing || composing) return;
      sync();
    });
    input.addEventListener('paste', () => setTimeout(()=>sync({ force:true }), 0));
    input.addEventListener('focus', () => root.classList.add('is-focused'));
    input.addEventListener('blur', () => root.classList.remove('is-focused'));
    root.addEventListener('click', () => input.focus());
    renderLoginOtpDisplay(root, input.value || '');
  }

  function bindOtpInput(root, onChange){
    if(!root || root.dataset.otpBound) return;
    root.dataset.otpBound = '1';
    const cells = Array.from(root.querySelectorAll('.kinojo-code-otp-cell'));
    cells.forEach((cell, index) => {
      cell.addEventListener('input', event => {
        const raw = String(event.target.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if(raw.length > 1){
          setOtpValue(root, raw);
          const nextIndex = Math.min(raw.length, cells.length - 1);
          cells[nextIndex]?.focus();
        }else{
          event.target.value = raw;
          if(raw && index < cells.length - 1) cells[index + 1].focus();
        }
        if(typeof onChange === 'function') onChange();
      });
      cell.addEventListener('keydown', event => {
        if(event.key === 'Backspace' && !cell.value && index > 0){
          cells[index - 1].focus();
          cells[index - 1].value = '';
          event.preventDefault();
          if(typeof onChange === 'function') onChange();
        }
        if(event.key === 'ArrowLeft' && index > 0){ event.preventDefault(); cells[index - 1].focus(); }
        if(event.key === 'ArrowRight' && index < cells.length - 1){ event.preventDefault(); cells[index + 1].focus(); }
      });
      cell.addEventListener('paste', event => {
        const text = event.clipboardData?.getData('text') || '';
        if(!text) return;
        event.preventDefault();
        setOtpValue(root, text);
        const value = otpValue(root);
        cells[Math.min(value.length, cells.length - 1)]?.focus();
        if(typeof onChange === 'function') onChange();
      });
    });
  }

  function codeRequestStatus(message, isError){
    const el = document.getElementById('kinojoCodeRequestLookupStatus');
    if(!el) return;
    el.className = 'kinojo-login-status kinojo-code-request-status ' + (isError ? 'error' : 'success');
    const text = String(message || '');
    const sentenceLines = {
      '요청 코드는 영문 2자와 숫자 4자로 구성해야 합니다. 순서는 자유입니다.': [
        '요청 코드는 영문 2자와 숫자 4자로 구성해야 합니다.',
        '순서는 자유입니다.'
      ]
    };
    if(sentenceLines[text]){
      el.innerHTML = sentenceLines[text].map(line => '<span>' + safeText(line) + '</span>').join('');
      return;
    }
    el.textContent = text;
  }

  function resetCodeRequestPanel(clearName){
    codeRequestLookupCharacter = null;
    codeRequestSubmitted = false;
    const modal = document.getElementById('kinojoLoginModal');
    if(!modal) return;
    const nameInput = modal.querySelector('#kinojoCodeRequestCharacterInput');
    const lookupBtn = modal.querySelector('#kinojoCodeRequestLookupBtn');
    const codeBox = modal.querySelector('#kinojoCodeRequestCodeBox');
    const result = modal.querySelector('#kinojoCodeRequestCharacterResult');
    const submitBtn = modal.querySelector('#kinojoCodeRequestSubmitBtn');
    if(clearName && nameInput) nameInput.value = '';
    if(lookupBtn){ lookupBtn.disabled = false; lookupBtn.textContent = '조회'; }
    if(codeBox) codeBox.hidden = true;
    if(result) result.innerHTML = '';
    setOtpValue(modal.querySelector('#kinojoCodeRequestOtp'), '');
    if(submitBtn) submitBtn.disabled = true;
    codeRequestStatus('', false);
  }

  async function codeRequest(command, extra={}){
    const body = Object.assign({ command, version:document.documentElement.dataset.kinojoVersion || '', url:location.href }, extra);
    if(window.KinojoSupabase && typeof window.KinojoSupabase.publicCodeRequest === 'function'){
      if(typeof window.KinojoSupabase.ensureReady === 'function') await window.KinojoSupabase.ensureReady();
      else if(typeof window.KinojoSupabase.loadRemoteConfig === 'function') await window.KinojoSupabase.loadRemoteConfig();
      return window.KinojoAuthService.publicCodeRequest(command, body);
    }
    throw new Error('회원 코드 신청은 Supabase 서버 이관 후 사용 가능합니다. config.json과 code_requests 정책을 확인해 주세요.');
  }

  async function lookupCodeRequestCharacter(){
    const modal = ensureLoginModal();
    const input = modal.querySelector('#kinojoCodeRequestCharacterInput');
    const button = modal.querySelector('#kinojoCodeRequestLookupBtn');
    const name = String(input?.value || '').trim();
    codeRequestLookupCharacter = null;
    codeRequestSubmitted = false;
    const box = modal.querySelector('#kinojoCodeRequestCodeBox');
    if(box) box.hidden = true;
    if(!name){ codeRequestStatus('캐릭터 이름을 입력해 주세요.', true); input?.focus(); return; }
    try{
      setButtonLoading(button, true, '조회중');
      codeRequestStatus('조회중...', false);
      const data = await codeRequest('lookupCharacter', { characterName:name });
      if(!data.ok) throw new Error(data.message || '캐릭터 조회 실패');
      codeRequestLookupCharacter = data.character || null;
      const result = modal.querySelector('#kinojoCodeRequestCharacterResult');
      if(result){
        result.innerHTML = '<strong>' + safeText(codeRequestLookupCharacter?.mainCharacter || name) + '</strong>'
          + '<span>' + safeText(codeRequestLookupCharacter?.className || '클래스 미확인') + ' · 본캐 확인</span>';
      }
      if(box) box.hidden = false;
      if(button){ button.disabled = true; button.textContent = '조회완료'; delete button.dataset.originalText; button.classList.remove('is-loading'); }
      codeRequestStatus('조회 완료. 요청할 회원 코드를 입력해 주세요.', false);
      modal.querySelector('#kinojoCodeRequestOtp .kinojo-code-otp-cell')?.focus();
      validateCodeRequestOtp();
    }catch(err){ codeRequestStatus(err.message || String(err), true); }
    finally{
      if(!codeRequestLookupCharacter) setButtonLoading(button, false);
    }
  }

  function validateCodeRequestOtp(){
    const modal = document.getElementById('kinojoLoginModal');
    const otp = modal?.querySelector('#kinojoCodeRequestOtp');
    const submitBtn = modal?.querySelector('#kinojoCodeRequestSubmitBtn');
    const value = otpValue(otp);
    const valid = isValidMemberCode(value);
    if(submitBtn) submitBtn.disabled = codeRequestSubmitted || !codeRequestLookupCharacter || !valid;
    if(value.length === 6 && !valid){
      codeRequestStatus('요청 코드는 영문 2자와 숫자 4자로 구성해야 합니다. 순서는 자유입니다.', true);
    }else if(codeRequestLookupCharacter){
      codeRequestStatus('조회 완료. 요청할 회원 코드를 입력해 주세요.', false);
    }
  }

  function showCodeRequestComplete(){
    const modal = ensureLoginModal();
    const card = modal.querySelector('.kinojo-login-card');
    if(!card) return;
    card.classList.add('kinojo-code-request-complete-card');
    card.innerHTML = '<button class="kinojo-login-close" id="kinojoLoginCompleteCloseBtn" type="button" aria-label="닫기">×</button>'
      + '<div class="kinojo-login-kicker">REQUEST COMPLETE</div>'
      + '<h2>코드 요청 완료되었습니다</h2>'
      + '<p class="kinojo-code-request-complete-text">관리자가 확인 후 등록하면 요청한 코드로 로그인할 수 있습니다.</p>'
      + '<button class="kinojo-login-submit primary" id="kinojoLoginCompleteDoneBtn" type="button">닫기</button>';
    const done = () => {
      closeLoginModal();
      setTimeout(() => {
        const current = document.getElementById('kinojoLoginModal');
        if(current) current.remove();
      }, 180);
    };
    card.querySelector('#kinojoLoginCompleteCloseBtn')?.addEventListener('click', done);
    card.querySelector('#kinojoLoginCompleteDoneBtn')?.addEventListener('click', done);
  }

  async function submitCodeRequest(){
    const modal = ensureLoginModal();
    const button = modal.querySelector('#kinojoCodeRequestSubmitBtn');
    const code = otpValue(modal.querySelector('#kinojoCodeRequestOtp'));
    if(!codeRequestLookupCharacter){ codeRequestStatus('먼저 캐릭터를 조회해 주세요.', true); return; }
    if(!isValidMemberCode(code)){ codeRequestStatus('요청 코드는 영문 2자와 숫자 4자로 구성해야 합니다. 순서는 자유입니다.', true); return; }
    try{
      setButtonLoading(button, true, '요청중');
      codeRequestStatus('요청 접수 중...', false);
      const data = await codeRequest('submitRequest', { characterName:codeRequestLookupCharacter.mainCharacter, requestedCode:code });
      if(!data.ok) throw new Error(data.message || '코드 요청 실패');
      codeRequestSubmitted = true;
      resetCodeRequestPanel(true);
      showCodeRequestComplete();
      return;
    }catch(err){ codeRequestStatus(err.message || String(err), true); }
    finally{ setButtonLoading(button, false); validateCodeRequestOtp(); }
  }

  function accountAdminMarkup_(){
    return '<div class="kinojo-account-card kinojo-account-inline-card" aria-labelledby="kinojoAccountAdminTitle">'
      + '<div class="kinojo-account-head">'
      + '<div><div class="kinojo-login-kicker">MANAGE</div><h2 id="kinojoAccountAdminTitle">회원 관리</h2><p>캐릭터 조회 후 6자리 코드로 계정을 만들고, 변경사항은 저장하기를 눌렀을 때만 반영합니다.</p></div>'
      + '</div>'
      + '<div class="kinojo-account-section kinojo-account-create-section">'
      + '<div class="kinojo-account-mini-title">캐릭터명 조회</div>'
      + '<div class="kinojo-account-create-row">'
      + '<input id="adminAccountCharacterInput" class="search kinojo-account-input" placeholder="캐릭터명 입력" autocomplete="off" />'
      + '<button class="btn" id="adminAccountLookupBtn" type="button">조회</button>'
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
      + '<strong>회원 관리</strong>'
      + '<div class="kinojo-account-toolbar-actions">'
      + '<button class="btn admin-account-save" id="adminAccountSaveBtn" type="button" disabled>변경내용 저장하기</button>'
      + '<button class="btn admin-account-revert" id="adminAccountRevertBtn" type="button" disabled>되돌리기</button>'
      + '<button class="btn" id="adminOwnerMapSyncBtn" type="button">캐릭터 소유정보 갱신</button>'
      + '<button class="btn" id="adminAccountListBtn" type="button">목록 새로고침</button>'
      + '</div>'
      + '</div>'
      + '<div class="kinojo-account-filters">'
      + '<input class="search" id="adminAccountSearchInput" placeholder="회원 검색" autocomplete="off" />'
      + '<select class="admin-account-role-select" id="adminAccountRoleFilter"><option value="">전체 등급</option><option value="MASTER">Master</option><option value="SUB_MASTER">Sub Master</option><option value="MANAGER">Manager</option><option value="STAFF">Staff</option><option value="MEMBER">Member</option></select>'
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
    const body = Object.assign({ command, sessionToken:getToken() }, extra);
    if(window.KinojoSupabase && typeof window.KinojoSupabase.adminAccount === 'function'){
      if(typeof window.KinojoSupabase.ensureReady === 'function') await window.KinojoSupabase.ensureReady();
      else if(typeof window.KinojoSupabase.loadRemoteConfig === 'function') await window.KinojoSupabase.loadRemoteConfig();
      return window.KinojoAuthService.adminAccount(command, body);
    }
    throw new Error('관리자 페이지 기능은 Supabase 서버 이관 후 사용 가능합니다. config.json과 관리자 테이블 정책을 확인해 주세요.');
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
      const actorRole = roleOf(currentAdminAccount_());
      const editable = canEditManagedAccount_(account);
      const displayCode = isRoot ? '마스터 계정' : (account.code || '-');
      const permissions = normalizePermissions_(account.permissions);
      const permDataset = permissions.join(',');
      const toggleHtml = Object.keys(PERMISSION_LABELS).map(key => {
        const on = permissions.includes(key) || permissions.includes('all');
        const disabled = editable ? '' : ' disabled';
        return '<label class="admin-switch-row"><span>' + safeText(PERMISSION_LABELS[key]) + '</span><button aria-label="' + safeText(PERMISSION_LABELS[key]) + ' 권한" aria-pressed="' + (on ? 'true' : 'false') + '" class="admin-permission-toggle ' + (on ? 'on' : '') + '" data-account-action="toggle-permission" data-code="' + safeText(account.code || '') + '" data-permission="' + key + '" type="button"' + disabled + '><span></span></button></label>';
      }).join('');
      const roleOptions = assignableRoles_(actorRole).map(r => '<option value="' + r + '"' + (role === r ? ' selected' : '') + '>' + safeText(roleLabel(r)) + '</option>').join('');
      const roleSelect = !editable ? '<span class="admin-account-role-fixed">' + safeText(roleLabel(role)) + '</span>' : '<select class="admin-account-role-select" data-account-action="change-role" data-code="' + safeText(account.code || '') + '">' + roleOptions + '</select>'; 
      const deleteButton = !editable
        ? '<button class="btn admin-account-delete" type="button" disabled>수정 불가</button>'
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

  function isServerSessionToken_(token){
    return window.KinojoAuthService?.isServerSessionToken?.(token)===true;
  }

  function sessionErrorCode_(error){
    return String(error?.code||error?.data?.code||'').trim().toUpperCase();
  }

  function isSessionRejected_(error){
    return [
      'SESSION_TOKEN_REQUIRED','SESSION_TOKEN_INVALID','SESSION_NOT_FOUND','SESSION_REVOKED',
      'SESSION_EXPIRED','MEMBER_INACTIVE','NO_LOOKUP_PERMISSION'
    ].includes(sessionErrorCode_(error));
  }

  async function touchServerSession_(force){
    if(serverTouchPending) return null;
    const session=readJson(STORAGE_KEY);
    const token=String(session?.token||'').trim();
    if(!isServerSessionToken_(token)) return null;
    const now=Date.now();
    if(!force&&now-lastServerTouchAt<Number(SERVER_TOUCH_THROTTLE_MS||300000)) return null;

    serverTouchPending=true;
    lastServerTouchAt=now;
    try{
      const data=await window.KinojoAuthService?.touchSession?.(token);
      if(!data||data.ok===false||!data.session) throw new Error(data?.message||'Server 로그인 세션을 연장하지 못했습니다.');
      setSession(data.session,data.account||getAccount()||{});
      return data;
    }catch(error){
      if(isSessionRejected_(error)) clearSession('server_session_rejected');
      throw error;
    }finally{
      serverTouchPending=false;
    }
  }

  async function restoreServerSession_(){
    if(serverRestorePending) return null;
    const session=readJson(STORAGE_KEY);
    const token=String(session?.token||'').trim();
    if(!isServerSessionToken_(token)) return null;

    serverRestorePending=true;
    try{
      const data=await window.KinojoAuthService?.touchSession?.(token);
      if(!data||data.ok===false||!data.session) throw new Error(data?.message||'Server 로그인 세션을 확인하지 못했습니다.');
      lastServerTouchAt=Date.now();
      setSession(data.session,data.account||getAccount()||{});
      return data;
    }catch(error){
      if(isSessionRejected_(error)) clearSession('server_session_restore_rejected');
      return null;
    }finally{
      serverRestorePending=false;
    }
  }

  function clearIdleLogoutTimer(){
    if(idleLogoutTimer){ clearTimeout(idleLogoutTimer); idleLogoutTimer = null; }
    if(idleCountdownTimer){ clearInterval(idleCountdownTimer); idleCountdownTimer = null; }
  }

  function ensureIdleLogoutModal(){
    let modal = document.getElementById('kinojoIdleLogoutModal');
    if(modal) return modal;
    modal = document.createElement('section');
    modal.id = 'kinojoIdleLogoutModal';
    modal.className = 'kinojo-idle-modal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML = '<div class="kinojo-idle-card" role="alertdialog" aria-modal="true" aria-labelledby="kinojoIdleTitle" aria-describedby="kinojoIdleMessage">'
      + '<div class="kinojo-idle-kicker">SESSION NOTICE</div>'
      + '<h2 id="kinojoIdleTitle">자동 로그아웃 안내</h2>'
      + '<p id="kinojoIdleMessage">30분 동안 조작이 없으면 자동 로그아웃됩니다. 계속 사용하려면 로그인 시간을 연장해 주세요.</p>'
      + '<div class="kinojo-idle-count"><strong id="kinojoIdleCountdown">5:00</strong><span>후 로그아웃</span></div>'
      + '<div class="kinojo-idle-actions"><button type="button" id="kinojoIdleExtendBtn">로그인 연장</button><button type="button" id="kinojoIdleLogoutBtn">로그아웃</button></div>'
      + '</div>';
    document.body.appendChild(modal);
    modal.querySelector('#kinojoIdleExtendBtn')?.addEventListener('click', event=>extendIdleSession(event.currentTarget));
    modal.querySelector('#kinojoIdleLogoutBtn')?.addEventListener('click', ()=>{
      closeIdleLogoutWarning();
      clearSession();
      toast('로그아웃되었습니다.');
    });
    return modal;
  }

  function closeIdleLogoutWarning(){
    idleWarningOpen = false;
    idleWarningDeadlineAt = 0;
    if(idleCountdownTimer){ clearInterval(idleCountdownTimer); idleCountdownTimer = null; }
    const modal = document.getElementById('kinojoIdleLogoutModal');
    if(modal){ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }
  }

  function forceIdleLogout(){
    closeIdleLogoutWarning();
    clearSession('idle_timeout');
    toast('일정 시간 조작이 없어 자동 로그아웃되었습니다.');
  }

  function idleCountdownText(remainingMs){
    const seconds=Math.max(0,Math.ceil(Number(remainingMs||0)/1000));
    const minutes=Math.floor(seconds/60);
    return minutes+':'+String(seconds%60).padStart(2,'0');
  }

  function openIdleLogoutWarning(deadlineAt){
    const session=readJson(STORAGE_KEY);
    if(!session?.token) return;
    const modal = ensureIdleLogoutModal();
    idleWarningOpen = true;
    idleWarningDeadlineAt = Number(deadlineAt||getIdleState(session).expiresAt);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    const countdown = modal.querySelector('#kinojoIdleCountdown');
    const tick = ()=>{
      const remaining = Math.max(0, idleWarningDeadlineAt - Date.now());
      if(countdown) countdown.textContent = idleCountdownText(remaining);
      if(remaining <= 0) forceIdleLogout();
    };
    tick();
    if(idleCountdownTimer) clearInterval(idleCountdownTimer);
    idleCountdownTimer = setInterval(tick, 250);
  }

  function scheduleIdleLogoutCheck(){
    clearIdleLogoutTimer();
    const session = readJson(STORAGE_KEY);
    if(!session?.token){ closeIdleLogoutWarning(); return; }
    const idle = getIdleState(session);
    if(idle.expired){ forceIdleLogout(); return; }
    if(idle.warning){ openIdleLogoutWarning(idle.expiresAt); return; }
    closeIdleLogoutWarning();
    idleLogoutTimer = setTimeout(scheduleIdleLogoutCheck, Math.max(250, idle.warningAt-Date.now()));
  }

  function markActivity(forceWrite){
    const session = readJson(STORAGE_KEY);
    if(!session || !session.token) return;
    if(getIdleState(session).expired){ forceIdleLogout(); return; }
    if(idleWarningOpen&&!forceWrite) return;
    const now = Date.now();
    if(forceWrite || now - lastActivityWriteAt >= ACTIVITY_WRITE_THROTTLE_MS){
      session.lastActivityAt = now;
      delete session.expiresAt;
      authSessionCore.writeJson(authSessionCore.STORAGE_KEY, session);
      lastActivityWriteAt = now;
    }
    scheduleIdleLogoutCheck();
    if(isServerSessionToken_(session.token)&&!serverTouchPending&&now-lastServerTouchAt>=Number(SERVER_TOUCH_THROTTLE_MS||300000)){
      touchServerSession_(false).catch(()=>{});
    }
  }

  function resetIdleLogoutTimer(){ markActivity(false); }

  async function extendIdleSession(button){
    if(idleExtendPending) return;
    const session=readJson(STORAGE_KEY);
    if(!session?.token||getIdleState(session).expired){forceIdleLogout();return;}
    const account=getAccount()||{};
    idleExtendPending=true;
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='확인 중...';}
    try{
      let data=null;
      if(isServerSessionToken_(session.token)){
        data=await touchServerSession_(true);
      }else{
        clearSession('legacy_session_unsupported');
        toast('로그인 방식을 갱신했습니다. 다시 로그인해 주세요.');
        return;
      }
      if(!data||data.ok===false||!data.session)throw new Error(data?.message||'로그인 상태를 확인하지 못했습니다.');
      toast('Server 세션 확인 후 로그인 시간이 30분 연장되었습니다.');
    }catch(error){
      const current=readJson(STORAGE_KEY);
      if(!current?.token||getIdleState(current).expired||isSessionRejected_(error))forceIdleLogout();
      else toast('로그인 연장에 실패했습니다. '+(error?.message||String(error)));
    }finally{
      idleExtendPending=false;
      if(button){button.disabled=false;button.removeAttribute('aria-busy');button.textContent='로그인 연장';}
    }
  }

  function bindIdleLogout(){
    ['click','keydown','scroll','touchstart','pointerdown'].forEach(type=>{
      window.addEventListener(type, resetIdleLogoutTimer, { passive:true });
    });
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState === 'visible'){ updateStatus(); scheduleIdleLogoutCheck(); }
    });
    window.addEventListener('focus', scheduleIdleLogoutCheck);
    window.addEventListener('pageshow', scheduleIdleLogoutCheck);
    window.addEventListener('storage', event=>{
      if(event.key === STORAGE_KEY){ updateStatus(); scheduleIdleLogoutCheck(); }
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
    restoreServerSession_().catch(()=>{});
  }



  function loadAdminNotificationBridge_(){
    if(document.querySelector('script[data-kinojo-admin-notifications]')) return;
    const authScript=Array.from(document.scripts).reverse().find(script=>/\/core\/kinojo-auth-ui\.js(?:[?#]|$)/.test(String(script.src||'')));
    if(!authScript?.src) return;
    const bridge=document.createElement('script');
    bridge.dataset.kinojoAdminNotifications='1';
    bridge.src=new URL('../ui/kinojo-admin-notifications.js?cache=2026082401',authScript.src).toString();
    bridge.defer=true;
    document.head.appendChild(bridge);
  }

  window.KinojoAuth = {
    openLoginModal, closeLoginModal, requireLogin,
    openAccountAdminModal, closeAccountAdminModal, renderAccountAdminInline,
    getSession, getAccount, getToken, getLevel, isLoggedIn, isAdmin,
    updateStatus, clearSession, resetIdleLogoutTimer
  };

  loadAdminNotificationBridge_();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
