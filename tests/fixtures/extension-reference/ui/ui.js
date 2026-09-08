/**
 * ============================================================
 * Kinojo UI Controller
 * ------------------------------------------------------------
 * Purpose:
 * - Creates and manages the floating Kinojo panel.
 * - Controls notices, update box, status box, local logs,
 *   draggable position, tooltips, minimize button, and modal.
 *
 * Important:
 * - This file is UI-only.
 * - Queue / search logic is handled by AION2_UPDATER.
 * - Utility helpers are handled by AION2_UTILS.
 * ============================================================
 */

window.AION2_UI = {

  createPanel() {
    const existingPanel = document.getElementById("aion2OfficialPanel");
    if (existingPanel) {
      const legacyLogBox = document.getElementById("aion2OfficialLogBox");
      if (legacyLogBox) legacyLogBox.remove();
      this.bindDebugDrawerEvents_();
      this.ensureInitialPanelContent_();
      return;
    }

    const panel = document.createElement("div");
    panel.id = "aion2OfficialPanel";

    /*
     * Initial position is handled by CSS.
     * - First load: right/bottom anchored, clean bottom-right placement.
     * - After drag: ui.js switches to left/top and stores the position.
     */
    // Initial position is handled by CSS. Drag restore switches to left/top only when needed.

    const dragHandle = this.createDragHandle_();
    const runtimeStateBar = this.createRuntimeStateBar_();
    const noticeBox = this.createNoticeBox_();
    const updateBox = this.createUpdateBox_();
    const statusBox = this.createStatusBox_();
    const lookupSettingsBar = this.createLookupSettingsBar_();
    const shell = this.createControlShell_();
    const bugBtn = this.createBugReportButton_();
    const quickLinks = this.createQuickLinkBox_(bugBtn);
    const versionText = this.createVersionText_();
    const tooltip = this.createTooltip_();

    panel.append(
      dragHandle,
      runtimeStateBar,
      noticeBox,
      updateBox,
      statusBox,
      lookupSettingsBar,
      shell,
      quickLinks,
      versionText
    );

    document.body.appendChild(panel);

    if (window.AION2_UI_THEME) {
      window.AION2_UI_THEME.apply();
      if (window.AION2_UI_THEME.applySize) window.AION2_UI_THEME.applySize();
    }

    /*
     * Tooltip is attached directly to body, not inside the scaled panel.
     * This prevents clipping, transform offset issues, and z-index hiding.
     */
    if (!document.getElementById("aion2Tooltip")) {
      document.body.appendChild(tooltip);
    }

    this.applyInitialPanelPosition(panel);
    this.enablePanelDrag(panel, dragHandle);
    this.bindViewportSafeGuard_(panel);
    this.keepPanelInViewport(panel);
    this.attachCloseButton(panel);
    this.registerGlobalHotkeys();
    this.bindDebugDrawerEvents_();
    this.updateServerStatusUi_();

    this.clearVisibleSessionLogs_();
    this.showCachedNotice();
    this.refreshNoticeFromRemote();

    this.updateButtonState();
    this.ensureInitialPanelContent_();

    this.setExternalBlockedState(
      localStorage.getItem("KINOJO_BLOCKED_BY_OTHER") === "true"
    );

    this.syncLockStateFromServer();
    this.startRuntimeStatePolling_();
  },

  clearVisibleSessionLogs_() {
    // 페이지 이동·패널 재생성·완료창 닫기에서는 로그를 지우지 않는다.
    // 모든 작업 기록 삭제는 사용자가 초기화 버튼을 누른 경우에만 수행한다.
    return;
  },

  escapeHtml_(value) {
    const text = String(value ?? "");
    const util = window.AION2_UTILS;
    if (util && typeof util.escapeHtml === "function") {
      return util.escapeHtml(text);
    }
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  renderInitialNotice_() {
    const noticeBox = document.getElementById("aion2NoticeBox");
    const noticeInner = document.getElementById("aion2NoticeInner");
    if (!noticeBox || !noticeInner) return;

    noticeBox.style.display = "block";
    noticeInner.classList.remove("marquee");
    noticeInner.innerHTML = `
      <div class="kinojoNoticeRow">
        <span class="kinojoNoticeLabel">공지</span>
        <div class="kinojoNewsWrap">
          <div class="kinojoNewsTitle">공지 확인 중...</div>
        </div>
      </div>
    `;
  },

  ensureInitialPanelContent_() {
    const noticeBox = document.getElementById("aion2NoticeBox");
    const noticeInner = document.getElementById("aion2NoticeInner");
    const statusBox = document.getElementById("aion2StatusBox");
    const legacyLogBox = document.getElementById("aion2OfficialLogBox");
    if (legacyLogBox) legacyLogBox.remove();

    if (noticeBox && noticeInner && !noticeInner.innerHTML.trim()) {
      this.renderInitialNotice_();
    } else if (noticeBox) {
      noticeBox.style.display = "block";
    }

    if (statusBox && !statusBox.innerHTML.trim()) {
      this.updateStatusBox();
    }

  },

  createDragHandle_() {
    const dragHandle = document.createElement("div");
    dragHandle.id = "aion2DragHandle";
    dragHandle.dataset.tip = "드래그해서 위치 이동";
    dragHandle.innerHTML = `
      <span class="kinojoDragTitle">✨ KINOJO</span>
      <button id="aion2PanelCloseBtn" type="button" title="Kinojo 종료" aria-label="Kinojo 종료">×</button>
    `;
    this.attachTooltip(dragHandle);
    return dragHandle;
  },

  createNoticeBox_() {
    const noticeBox = document.createElement("div");
    noticeBox.id = "aion2NoticeBox";
    noticeBox.className = "aion2-card";
    noticeBox.innerHTML = `<span id="aion2NoticeInner"></span>`;
    return noticeBox;
  },

  createUpdateBox_() {
    const updateBox = document.createElement("div");
    updateBox.id = "aion2UpdateBox";
    updateBox.className = "aion2-card";
    updateBox.innerHTML = `
      <div id="aion2UpdateText"></div>
      <button id="aion2UpdateDownloadBtn" type="button">업데이트 다운로드</button>
    `;
    return updateBox;
  },

  createStatusBox_() {
    const statusBox = document.createElement("div");
    statusBox.id = "aion2StatusBox";
    statusBox.className = "aion2-card kinojo-detail-launcher";
    return statusBox;
  },


  createRuntimeStateBar_() {
    const bar = document.createElement("div");
    bar.id = "kinojoRuntimeStateBar";
    bar.className = "kinojo-runtime-state-bar kinojo-runtime-idle";
    bar.innerHTML = `
      <span class="kinojo-runtime-dot" aria-hidden="true"></span>
      <span class="kinojo-runtime-copy"><b>Server Engine</b><em>상태 확인 중</em></span>
      <button id="kinojoRuntimeReleaseMineBtn" type="button" class="kinojo-runtime-release" style="display:none">내 Lock 해제</button>
    `;
    return bar;
  },

  startRuntimeStatePolling_() {
    if (this.runtimeStatePollingTimer_) return;
    this.runtimeStatePollingTimer_ = setInterval(() => this.syncLockStateFromServer(), 7000);
  },

  updateRuntimeStateBar_(status) {
    const bar = document.getElementById("kinojoRuntimeStateBar");
    if (!bar) return;
    const normalized = this.normalizeLockStatus_(status || {});
    const localSessionId = window.AION2_UPDATER && typeof window.AION2_UPDATER.getSessionId === 'function'
      ? window.AION2_UPDATER.getSessionId()
      : '';
    const ownDeviceId = window.KINOJO_SUPABASE && window.KINOJO_SUPABASE.getDeviceId && window.KINOJO_SUPABASE.getDeviceId();
    const isOwnSession = !!(localSessionId && normalized.sessionId && localSessionId === normalized.sessionId);
    const isOwnDevice = !!(ownDeviceId && normalized.deviceId && ownDeviceId === normalized.deviceId);
    const running = normalized.running === true;
    const who = normalized.owner ? `${normalized.owner}` : "확인 중";
    const releaseBtn = bar.querySelector("#kinojoRuntimeReleaseMineBtn");

    bar.classList.remove("kinojo-runtime-idle", "kinojo-runtime-running", "kinojo-runtime-own-stale", "kinojo-runtime-error");

    if (running) {
      const ownText = isOwnSession ? "내 조회 실행 중" : (isOwnDevice ? "내 이전 조회 Lock 감지" : `${who} 조회 중`);
      bar.classList.add(isOwnDevice && !isOwnSession ? "kinojo-runtime-own-stale" : "kinojo-runtime-running");
      bar.querySelector(".kinojo-runtime-copy").innerHTML = `<b>${this.escapeHtml_(ownText)}</b><em>진행 내용은 조회 상세에서 확인</em>`;
      if (releaseBtn) {
        releaseBtn.style.display = isOwnDevice ? "inline-flex" : "none";
        releaseBtn.onclick = async () => {
          if (!window.AION2_UPDATER || !window.AION2_UPDATER.releaseSupabaseLock_) return;
          await window.AION2_UPDATER.releaseSupabaseLock_('cancelled', '상단 상태바에서 내 조회 Lock을 해제했습니다.');
          localStorage.setItem(window.AION2_CONFIG.KEYS.RUNNING, 'false');
          // Lock 해제는 작업 기록 초기화가 아니다. 세션/진행 기록은 그대로 유지한다.
          this.setExternalBlockedState(false);
          this.syncLockStateFromServer();
          this.updateButtonState();
        };
      }
      return;
    }

    bar.classList.add("kinojo-runtime-idle");
    bar.querySelector(".kinojo-runtime-copy").innerHTML = `<b>Server Engine 대기</b><em>${this.escapeHtml_(normalized.message || '조회 가능')}</em>`;
    if (releaseBtn) releaseBtn.style.display = "none";
  },

  createLogBox_() {
    const logBox = document.createElement("div");
    logBox.id = "aion2OfficialLogBox";
    logBox.className = "aion2-card";
    return logBox;
  },

  createDebugDrawer_() {
    const drawer = document.createElement("div");
    drawer.id = "aion2DebugDrawer";
    drawer.className = "kinojo-sidecar-window";
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML = `
      <div class="kinojo-debug-head" id="aion2DebugDrawerHandle" title="드래그해서 이동">
        <strong>조회 상세 · 3 STEP</strong>
        <span class="kinojo-debug-hint">드래그 이동</span>
        <button id="aion2DebugDrawerClose" type="button" aria-label="조회 상세 닫기">×</button>
      </div>
      <div id="aion2DebugDrawerBody" class="kinojo-debug-body">대기 중</div>
    `;
    return drawer;
  },

  createTooltip_() {
    const tooltip = document.createElement("div");
    tooltip.id = "aion2Tooltip";
    return tooltip;
  },

  createLookupSettingsBar_() {
    const bar = document.createElement("div");
    bar.id = "kinojoLookupSettingsBar";
    bar.className = "aion2-card kinojo-lookup-settings-bar";
    const summary = document.createElement("div");
    summary.id = "kinojoLookupSettingsSummary";
    summary.className = "kinojo-lookup-settings-summary";
    summary.textContent = this.summarizeLookupSettings_(this.readLookupSettings_());
    const btn = document.createElement("button");
    btn.id = "kinojoLookupSettingsBtn";
    btn.type = "button";
    btn.className = "kinojo-lookup-settings-btn";
    btn.textContent = "조회 설정";
    btn.dataset.tip = "조회 조건 설정";
    btn.onclick = () => this.showLookupSettingsModal();
    this.attachTooltip(btn);
    bar.append(summary, btn);
    return bar;
  },

  getLookupServerCatalog_() {
    return [
      { id:'1001', name:'시엘', race:'ELYOS' }, { id:'1002', name:'네자칸', race:'ELYOS' }, { id:'1003', name:'바이젤', race:'ELYOS' },
      { id:'1004', name:'카이시넬', race:'ELYOS' }, { id:'1005', name:'유스티엘', race:'ELYOS' }, { id:'1006', name:'아리엘', race:'ELYOS' },
      { id:'1007', name:'프레기온', race:'ELYOS' }, { id:'1008', name:'메스람타에다', race:'ELYOS' }, { id:'1009', name:'히타이론', race:'ELYOS' },
      { id:'1010', name:'나니아', race:'ELYOS' }, { id:'1011', name:'타하바타', race:'ELYOS' }, { id:'1012', name:'루터', race:'ELYOS' },
      { id:'1013', name:'페렌토', race:'ELYOS' }, { id:'1014', name:'다미누', race:'ELYOS' }, { id:'1015', name:'카사카', race:'ELYOS' },
      { id:'1016', name:'바카르마', race:'ELYOS' }, { id:'1017', name:'챈가룽', race:'ELYOS' }, { id:'1018', name:'코치룽', race:'ELYOS' },
      { id:'1019', name:'이슈타르', race:'ELYOS' }, { id:'1020', name:'티아마트', race:'ELYOS' }, { id:'1021', name:'포에타', race:'ELYOS' },
      { id:'2001', name:'이스라펠', race:'ASMODIAN' }, { id:'2002', name:'지켈', race:'ASMODIAN' }, { id:'2003', name:'트리니엘', race:'ASMODIAN' },
      { id:'2004', name:'루미엘', race:'ASMODIAN' }, { id:'2005', name:'마르쿠탄', race:'ASMODIAN' }, { id:'2006', name:'아스펠', race:'ASMODIAN' },
      { id:'2007', name:'에레슈키갈', race:'ASMODIAN' }, { id:'2008', name:'브리트라', race:'ASMODIAN' }, { id:'2009', name:'네몬', race:'ASMODIAN' },
      { id:'2010', name:'하달', race:'ASMODIAN' }, { id:'2011', name:'루드라', race:'ASMODIAN' }, { id:'2012', name:'울고른', race:'ASMODIAN' },
      { id:'2013', name:'무닌', race:'ASMODIAN' }, { id:'2014', name:'오딘', race:'ASMODIAN' }, { id:'2015', name:'젠카카', race:'ASMODIAN' },
      { id:'2016', name:'크로메데', race:'ASMODIAN' }, { id:'2017', name:'콰이링', race:'ASMODIAN' }, { id:'2018', name:'바바', race:'ASMODIAN' },
      { id:'2019', name:'파프너', race:'ASMODIAN' }, { id:'2020', name:'인드라투', race:'ASMODIAN' }, { id:'2021', name:'이스할겐', race:'ASMODIAN' }
    ];
  },

  getDefaultLookupSettings_() {
    return { lookupMode: 'all', classes: [], gearTypes: [], races: [], servers: [], characterName: '', characterOnly: false, updatedAt: 0 };
  },

  readLookupSettings_() {
    try {
      const data = Object.assign(this.getDefaultLookupSettings_(), JSON.parse(localStorage.getItem('KINOJO_LOOKUP_SETTINGS') || 'null') || {});
      data.lookupMode = String(data.lookupMode || '').toLowerCase() === 'missing_only' ? 'missing_only' : 'all';
      return data;
    } catch (_e) {
      return this.getDefaultLookupSettings_();
    }
  },

  getLookupSettings() {
    return this.readLookupSettings_();
  },

  saveLookupSettings_(settings) {
    const data = Object.assign(this.getDefaultLookupSettings_(), settings || {}, { updatedAt: Date.now() });
    data.lookupMode = String(data.lookupMode || '').toLowerCase() === 'missing_only' ? 'missing_only' : 'all';
    data.characterName = String(data.characterName || '').trim();
    data.characterOnly = !!data.characterName;
    if (data.characterOnly) {
      data.classes = [];
      data.gearTypes = [];
      data.races = [];
      data.servers = [];
    }
    if (data.lookupMode === 'missing_only') {
      // 신규 캐릭터는 아직 Master 장비 정보가 없으므로 장비 유형 조건을 저장하지 않습니다.
      data.gearTypes = [];
    }
    localStorage.setItem('KINOJO_LOOKUP_SETTINGS', JSON.stringify(data));
    this.refreshLookupSettingsSummary_();
    return data;
  },

  resetLookupSettings_() {
    localStorage.removeItem('KINOJO_LOOKUP_SETTINGS');
    this.refreshLookupSettingsSummary_();
  },

  refreshLookupSettingsSummary_() {
    const summary = document.getElementById('kinojoLookupSettingsSummary');
    if (summary) summary.textContent = this.summarizeLookupSettings_(this.readLookupSettings_());
  },

  summarizeLookupSettings_(settings) {
    const s = Object.assign(this.getDefaultLookupSettings_(), settings || {});
    const lookupMode = String(s.lookupMode || '').toLowerCase() === 'missing_only' ? 'missing_only' : 'all';
    const scope = lookupMode === 'missing_only' ? '신규 캐릭터만' : '';
    if (s.characterName) return [scope, `캐릭터 ${s.characterName} 1명`].filter(Boolean).join(' · ');
    const parts = [];
    if (Array.isArray(s.classes) && s.classes.length) parts.push(`클래스 ${s.classes.length}`);
    if (lookupMode !== 'missing_only' && Array.isArray(s.gearTypes) && s.gearTypes.length) parts.push(s.gearTypes.join('/'));
    if (Array.isArray(s.races) && s.races.length) parts.push(s.races.map(v => v === 'ELYOS' ? '천족' : '마족').join('/'));
    if (Array.isArray(s.servers) && s.servers.length) parts.push(`서버 ${s.servers.length}`);
    if (scope) parts.unshift(scope);
    return parts.length ? parts.join(' · ') : '전체 캐릭터';
  },

  placeSidecarWindow_(box, options = {}) {
    const panel = document.getElementById('aion2OfficialPanel');
    const rect = panel ? panel.getBoundingClientRect() : null;
    const boxRect = box.getBoundingClientRect();
    const gap = Number(options.gap || 10);
    const margin = 12;
    const openBoxes = Array.from(document.querySelectorAll('.kinojo-sidecar-window.is-visible, .kinojo-debug-drawer-open'))
      .filter(el => el !== box && el.getBoundingClientRect().width > 0);
    const stackOffset = openBoxes.length * 18;
    let left;
    let top;
    if (rect) {
      const rightSpace = window.innerWidth - rect.right - margin;
      const leftSpace = rect.left - margin;
      if (rightSpace >= boxRect.width + gap) {
        left = rect.right + gap + stackOffset;
      } else if (leftSpace >= boxRect.width + gap) {
        left = rect.left - boxRect.width - gap - stackOffset;
      } else {
        left = Math.max(margin, window.innerWidth - boxRect.width - margin);
      }
      top = rect.bottom - boxRect.height;
    } else {
      left = window.innerWidth - boxRect.width - 24;
      top = window.innerHeight - boxRect.height - 24;
    }
    left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - boxRect.width - margin));
    top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - boxRect.height - margin));
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.right = 'auto';
    box.style.bottom = 'auto';
  },

  showLookupSettingsModal() {
    const old = document.getElementById('aion2LookupSettingsOverlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'aion2LookupSettingsOverlay';
    overlay.className = 'kinojo-sidecar-overlay';
    const activeTheme = (window.AION2_UI_THEME && window.AION2_UI_THEME.get)
      ? window.AION2_UI_THEME.get()
      : (document.documentElement.dataset.kinojoUpdaterTheme || 'classic');
    overlay.classList.add(activeTheme === 'modern' ? 'kinojo-theme-modern' : 'kinojo-theme-classic');

    const box = document.createElement('div');
    box.className = 'aion2-modal kinojo-sidecar-window kinojo-lookup-modal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '조회 설정');

    const current = this.readLookupSettings_();
    const classes = ['수호성','검성','살성','궁성','마도성','정령성','치유성','호법성','권성'];
    const gearTypes = [{ value:'PVE', label:'PVE 장비' }, { value:'PVP', label:'PVP 장비' }];
    const races = [{ value:'ELYOS', label:'천족' }, { value:'ASMODIAN', label:'마족' }];
    const servers = this.getLookupServerCatalog_();
    const checked = (arr, value) => Array.isArray(arr) && arr.includes(value) ? 'checked' : '';
    const group = (title, id, items, selected, help='') => `
      <section class="kinojo-filter-group" data-group="${id}">
        <button class="kinojo-filter-head" type="button" data-filter-toggle="${id}"><span>${title}</span><em>다중 선택</em></button>
        <div class="kinojo-filter-options" id="kinojoFilter_${id}">
          ${items.map(item => `
            <label class="kinojo-filter-option" data-race="${item.race || ''}">
              <input type="checkbox" data-filter="${id}" value="${this.escapeHtml_(item.value || item.id || item)}" ${checked(selected, String(item.value || item.id || item))}>
              <span>${this.escapeHtml_(item.label || item.name || item)}</span>
            </label>`).join('')}
        </div>
        ${help ? `<p class="kinojo-filter-help">${help}</p>` : ''}
      </section>`;

    box.innerHTML = `
      <div class="kinojo-modal-head">
        <div><div class="kinojo-auth-kicker">KINOJO UPDATER</div><div class="kinojo-auth-title">조회 설정</div></div>
        <button id="kinojoLookupSettingsClose" class="kinojo-sidecar-close" type="button" aria-label="닫기">×</button>
      </div>
      <section class="kinojo-lookup-scope-box">
        <div class="kinojo-lookup-scope-title"><b>조회 범위</b><span>신규 판정과 Target 생성은 Server Engine이 수행합니다.</span></div>
        <div class="kinojo-lookup-scope-options">
          <label class="kinojo-lookup-scope-option">
            <input type="radio" name="kinojoLookupMode" value="all" ${current.lookupMode !== 'missing_only' ? 'checked' : ''}>
            <span><b>전체 캐릭터</b><em>선택한 조건에 맞는 전체 대상 조회</em></span>
          </label>
          <label class="kinojo-lookup-scope-option">
            <input type="radio" name="kinojoLookupMode" value="missing_only" ${current.lookupMode === 'missing_only' ? 'checked' : ''}>
            <span><b>신규 캐릭터만</b><em>list에는 있고 Server Master에는 없는 대상만 조회</em></span>
          </label>
        </div>
      </section>
      <div class="kinojo-filter-note">캐릭터 이름을 입력하면 이름 조건이 우선 적용됩니다. 신규 캐릭터는 기존 Master 장비 정보가 없으므로 장비 유형 조건은 사용할 수 없습니다.</div>
      <div class="kinojo-filter-grid" id="kinojoLookupFilterGrid">
        ${group('클래스 선택', 'classes', classes, current.classes)}
        ${group('장비 유형', 'gearTypes', gearTypes, current.gearTypes)}
        ${group('종족 선택', 'races', races, current.races, '종족 선택에 따라 서버 목록이 자동으로 바뀝니다.')}
        ${group('서버 선택', 'servers', servers.map(s => ({ id:s.id, name:s.name, race:s.race })), current.servers)}
      </div>
      <section class="kinojo-character-only-box ${current.characterName ? 'is-active' : ''}">
        <label for="kinojoCharacterOnlyInput">캐릭터 이름 <span>특정 캐릭터만 조회</span></label>
        <div class="kinojo-character-only-row">
          <input id="kinojoCharacterOnlyInput" type="text" autocomplete="off" spellcheck="false" placeholder="캐릭터 이름을 입력하세요" value="${this.escapeHtml_(current.characterName || '')}">
          <button id="kinojoCharacterOnlyConfirm" type="button">확인</button>
        </div>
        <p id="kinojoCharacterOnlyHelp">이름 확인 시 다른 조건은 비활성화되고 입력한 캐릭터만 조회합니다.</p>
      </section>
      <div class="kinojo-filter-actions">
        <button id="kinojoLookupReset" type="button" class="aion2-modal-secondary">초기화</button>
        <span id="kinojoLookupSummaryInModal">${this.escapeHtml_(this.summarizeLookupSettings_(current))}</span>
        <button id="kinojoLookupCancel" type="button" class="aion2-modal-secondary">취소</button>
        <button id="kinojoLookupApply" type="button" class="aion2-modal-primary">적용</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const readChecks = name => Array.from(box.querySelectorAll(`input[data-filter="${name}"]:checked`)).map(input => String(input.value));
    const readLookupMode = () => String(box.querySelector('input[name="kinojoLookupMode"]:checked')?.value || 'all') === 'missing_only' ? 'missing_only' : 'all';
    const charInput = box.querySelector('#kinojoCharacterOnlyInput');
    const filterGrid = box.querySelector('#kinojoLookupFilterGrid');
    const summaryEl = box.querySelector('#kinojoLookupSummaryInModal');

    const syncServerOptions = () => {
      const selectedRaces = readChecks('races');
      const lockByRace = selectedRaces.length === 1;
      box.querySelectorAll('label[data-race]').forEach(label => {
        const race = label.dataset.race || '';
        const visible = !lockByRace || race === selectedRaces[0];
        label.style.display = visible ? '' : 'none';
        const input = label.querySelector('input');
        if (!visible && input) input.checked = false;
      });
    };
    const syncSettingsState = () => {
      const nameActive = !!String(charInput.value || '').trim();
      const lookupMode = readLookupMode();
      const missingOnly = lookupMode === 'missing_only';
      filterGrid.classList.toggle('is-disabled-by-name', nameActive);
      box.querySelector('.kinojo-character-only-box')?.classList.toggle('is-active', nameActive);
      filterGrid.querySelectorAll('input[data-filter]').forEach(input => {
        input.disabled = nameActive || (missingOnly && input.dataset.filter === 'gearTypes');
      });
      box.querySelector('[data-group="gearTypes"]')?.classList.toggle('is-disabled-by-scope', missingOnly);
      summaryEl.textContent = this.summarizeLookupSettings_({
        lookupMode,
        classes: readChecks('classes'),
        gearTypes: missingOnly ? [] : readChecks('gearTypes'),
        races: readChecks('races'),
        servers: readChecks('servers'),
        characterName: charInput.value.trim()
      });
    };
    const close = () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('keydown', onKey);
      box.classList.remove('is-visible');
      box.classList.add('is-hiding');
      setTimeout(() => overlay.remove(), 220);
    };
    const place = () => this.placeSidecarWindow_(box);
    const apply = () => {
      const name = String(charInput.value || '').trim();
      const lookupMode = readLookupMode();
      const data = name ? { lookupMode, characterName: name } : {
        lookupMode,
        classes: readChecks('classes'),
        gearTypes: lookupMode === 'missing_only' ? [] : readChecks('gearTypes'),
        races: readChecks('races'),
        servers: readChecks('servers'),
        characterName: ''
      };
      this.saveLookupSettings_(data);
      close();
      this.pushLog(`조회 설정 적용: ${this.summarizeLookupSettings_(data)}`);
    };
    const onKey = event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Enter' && document.activeElement === charInput) {
        event.preventDefault();
        syncSettingsState();
      }
    };

    box.addEventListener('change', event => {
      if (event.target && event.target.matches('input[data-filter]')) {
        syncServerOptions();
        syncSettingsState();
      }
    });
    box.addEventListener('click', event => {
      const toggle = event.target && event.target.closest && event.target.closest('[data-filter-toggle]');
      if (toggle) {
        const section = toggle.closest('.kinojo-filter-group');
        if (section) section.classList.toggle('is-collapsed');
      }
    });
    charInput.addEventListener('input', syncSettingsState);
    box.querySelectorAll('input[name="kinojoLookupMode"]').forEach(input => input.addEventListener('change', syncSettingsState));
    box.querySelector('#kinojoCharacterOnlyConfirm').onclick = syncSettingsState;
    box.querySelector('#kinojoLookupApply').onclick = apply;
    box.querySelector('#kinojoLookupCancel').onclick = close;
    box.querySelector('#kinojoLookupSettingsClose').onclick = close;
    box.querySelector('#kinojoLookupReset').onclick = () => {
      charInput.value = '';
      box.querySelectorAll('input[data-filter]').forEach(input => { input.checked = false; input.disabled = false; });
      const allMode = box.querySelector('input[name="kinojoLookupMode"][value="all"]');
      if (allMode) allMode.checked = true;
      this.resetLookupSettings_();
      syncServerOptions();
      syncSettingsState();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    syncServerOptions();
    syncSettingsState();
    requestAnimationFrame(() => {
      place();
      requestAnimationFrame(() => box.classList.add('is-visible'));
    });
    setTimeout(() => charInput.focus(), 140);
  },

  createControlShell_() {
    const shell = document.createElement("div");
    shell.id = "aion2ControlShell";
    shell.className = "kinojo-linear-controls";

    const resetBtn = this.makeCornerButton("aion2ResetBtn", "trash", "초기화");
    resetBtn.classList.add("kinojo-mini-control");
    resetBtn.onclick = () => window.AION2_UPDATER.resetState();

    const resumeBtn = this.makeCornerButton("aion2ResumeBtn", "resume", "이어서 시작");
    resumeBtn.classList.add("kinojo-mini-control");
    resumeBtn.onclick = () => window.AION2_UPDATER.resumeUpdate();

    const mainBtn = document.createElement("button");
    mainBtn.id = "aion2MainToggleBtn";
    mainBtn.className = "aion2-btn kinojo-main-control";
    mainBtn.dataset.tip = "새 조회 시작";
    mainBtn.onclick = () => window.AION2_UPDATER.mainToggle();
    mainBtn.innerHTML = `<span class="kinojo-main-icon" aria-hidden="true"></span><span class="kinojo-main-label">조회시작</span>`;
    this.attachTooltip(mainBtn);

    const indexBtn = this.makeCornerButton("aion2IndexBtn", "home", "검색 메인으로");
    indexBtn.classList.add("kinojo-mini-control");
    indexBtn.onclick = () => window.AION2_UTILS.goToIndexPage();

    const autoBtn = this.makeCornerButton("aion2AutoBtn", "shield", "자동복구 ON/OFF");
    autoBtn.classList.add("kinojo-mini-control");
    autoBtn.onclick = () => window.AION2_UPDATER.toggleAutoRecover();

    shell.append(resetBtn, resumeBtn, mainBtn, indexBtn, autoBtn);
    return shell;
  },

  createBugReportButton_() {
    const bugBtn = document.createElement("button");
    bugBtn.id = "aion2BugReportBtn";
    bugBtn.textContent = "⚠ 문제 신고";
    bugBtn.onclick = () => window.AION2_UPDATER.sendBugReport();
    return bugBtn;
  },

  createQuickLinkBox_(bugBtn) {
    const box = document.createElement("div");
    box.id = "aion2QuickLinkBox";
    box.className = "kinojo-link-row";

    const hallBtn = document.createElement("button");
    hallBtn.id = "aion2HallOfFameBtn";
    hallBtn.type = "button";
    hallBtn.className = "kinojo-link-btn";
    hallBtn.textContent = "📘 KINOJO INFO";
    hallBtn.dataset.tip = "KINOJO INFO 열기";
    hallBtn.onclick = () => {
      const url = (window.AION2_CONFIG && window.AION2_CONFIG.HALL_OF_FAME_URL)
        || "https://kinojo.info/";
      window.open(url, "_blank");
    };

    const arcanaBtn = document.createElement("button");
    arcanaBtn.id = "aion2ArcanaBtn";
    arcanaBtn.type = "button";
    arcanaBtn.className = "kinojo-link-btn kinojo-arcana-link-btn";
    arcanaBtn.textContent = "✦ ARCANA";
    arcanaBtn.dataset.tip = "ARCANA 페이지 열기";
    arcanaBtn.onclick = () => {
      const url = (window.AION2_CONFIG && window.AION2_CONFIG.ARCANA_URL)
        || "https://kinojo.info/arcana/";
      window.open(url, "_blank");
    };

    const patchBtn = document.createElement("button");
    patchBtn.id = "aion2PatchNoteBtn";
    patchBtn.type = "button";
    patchBtn.className = "kinojo-link-btn";
    patchBtn.textContent = "📜 패치노트";
    patchBtn.dataset.tip = "최신 릴리즈/패치노트 보기";
    patchBtn.onclick = () => {
      const url = (window.AION2_CONFIG && window.AION2_CONFIG.RELEASES_URL)
        || "https://kinojo.info/";
      window.open(url, "_blank");
    };

    const reportBtn = bugBtn || this.createBugReportButton_();
    reportBtn.classList.add("kinojo-link-btn", "kinojo-report-link-btn");

    const historyBtn = document.createElement("button");
    historyBtn.id = "aion2RunHistoryBtn";
    historyBtn.type = "button";
    historyBtn.className = "kinojo-link-btn kinojo-history-link-btn";
    historyBtn.textContent = "🗂 조회 기록";
    historyBtn.dataset.tip = "날짜·회차별 조회 결과 보기";
    historyBtn.onclick = () => {
      if (window.AION2_UPDATER && window.AION2_UPDATER.openRunHistory) {
        window.AION2_UPDATER.openRunHistory();
      }
    };

    const styleTabs = document.createElement("div");
    styleTabs.id = "aion2ThemeTabs";
    styleTabs.className = "kinojo-theme-tabs";

    const classicBtn = document.createElement("button");
    classicBtn.id = "aion2ThemeClassicBtn";
    classicBtn.type = "button";
    classicBtn.className = "kinojo-theme-tab";
    classicBtn.textContent = "Classic";
    classicBtn.dataset.themeValue = "classic";
    classicBtn.dataset.tip = "Classic 스타일 적용";
    classicBtn.onclick = () => {
      if (!window.AION2_UI_THEME) return;
      window.AION2_UI_THEME.set("classic");
    };

    const modernBtn = document.createElement("button");
    modernBtn.id = "aion2ThemeModernBtn";
    modernBtn.type = "button";
    modernBtn.className = "kinojo-theme-tab";
    modernBtn.textContent = "Modern";
    modernBtn.dataset.themeValue = "modern";
    modernBtn.dataset.tip = "Modern 스타일 적용";
    modernBtn.onclick = () => {
      if (!window.AION2_UI_THEME) return;
      window.AION2_UI_THEME.set("modern");
    };

    styleTabs.append(classicBtn, modernBtn);

    const sizeTabs = document.createElement("div");
    sizeTabs.id = "aion2SizeTabs";
    sizeTabs.className = "kinojo-size-tabs";

    const smallBtn = document.createElement("button");
    smallBtn.id = "aion2SizeSmallBtn";
    smallBtn.type = "button";
    smallBtn.className = "kinojo-size-tab";
    smallBtn.textContent = "작게";
    smallBtn.dataset.sizeValue = "small";
    smallBtn.dataset.tip = "업데이터 크기 70%";
    smallBtn.onclick = () => {
      if (!window.AION2_UI_THEME) return;
      window.AION2_UI_THEME.setSize("small");
    };

    const normalBtn = document.createElement("button");
    normalBtn.id = "aion2SizeNormalBtn";
    normalBtn.type = "button";
    normalBtn.className = "kinojo-size-tab";
    normalBtn.textContent = "보통";
    normalBtn.dataset.sizeValue = "normal";
    normalBtn.dataset.tip = "업데이터 크기 85%";
    normalBtn.onclick = () => {
      if (!window.AION2_UI_THEME) return;
      window.AION2_UI_THEME.setSize("normal");
    };

    const largeBtn = document.createElement("button");
    largeBtn.id = "aion2SizeLargeBtn";
    largeBtn.type = "button";
    largeBtn.className = "kinojo-size-tab";
    largeBtn.textContent = "크게";
    largeBtn.dataset.sizeValue = "large";
    largeBtn.dataset.tip = "업데이터 크기 100%";
    largeBtn.onclick = () => {
      if (!window.AION2_UI_THEME) return;
      window.AION2_UI_THEME.setSize("large");
    };

    sizeTabs.append(smallBtn, normalBtn, largeBtn);

    const makeSection = (title, child, extraClass = "") => {
      const section = document.createElement("div");
      section.className = `kinojo-control-section ${extraClass}`.trim();
      const titleEl = document.createElement("div");
      titleEl.className = "kinojo-section-title";
      titleEl.innerHTML = `<span>${title}</span>`;
      section.append(titleEl, child);
      return section;
    };

    const infoGrid = document.createElement("div");
    infoGrid.className = "kinojo-link-grid";
    infoGrid.append(hallBtn, patchBtn, historyBtn);

    const gameGrid = document.createElement("div");
    gameGrid.className = "kinojo-link-grid";
    gameGrid.append(arcanaBtn, reportBtn);

    box.append(
      makeSection("정보 및 기능", infoGrid, "kinojo-info-section"),
      makeSection("게임 정보", gameGrid, "kinojo-game-section"),
      makeSection("스타일", styleTabs, "kinojo-style-section"),
      makeSection("사이즈", sizeTabs, "kinojo-size-section")
    );
    [hallBtn, arcanaBtn, patchBtn, historyBtn, reportBtn, classicBtn, modernBtn, smallBtn, normalBtn, largeBtn].forEach(btn => this.attachTooltip(btn));

    if (window.AION2_UI_THEME) {
      setTimeout(() => {
        window.AION2_UI_THEME.apply();
        if (window.AION2_UI_THEME.applySize) window.AION2_UI_THEME.applySize();
      }, 0);
    }

    return box;
  },

  createVersionText_() {
    const versionText = document.createElement("div");
    versionText.id = "aion2VersionText";
    versionText.textContent = `현재버전: ${window.AION2_CONFIG.EXT_VERSION}`;
    return versionText;
  },

  makeCornerButton(id, icon, tip) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = "aion2-btn aion2-corner-btn";
    btn.dataset.tip = tip;
    btn.innerHTML = `
      <span class="aion2-corner-bg"></span>
      <span class="aion2-corner-icon">${window.AION2_ICONS[icon] || ""}</span>
    `;
    this.attachTooltip(btn);
    return btn;
  },

  attachTooltip(el) {
    if (!el) return;

    el.addEventListener("pointerenter", () => this.showTooltip(el));
    el.addEventListener("pointerleave", () => this.hideTooltip());
    el.addEventListener("pointermove", () => this.showTooltip(el));

    // Fallback for older mouse events
    el.addEventListener("mouseenter", () => this.showTooltip(el));
    el.addEventListener("mouseleave", () => this.hideTooltip());
  },

  showTooltip(el) {
    let tip = document.getElementById("aion2Tooltip");

    if (!tip) {
      tip = document.createElement("div");
      tip.id = "aion2Tooltip";
      document.body.appendChild(tip);
    }

    const text = el.dataset.tip || el.getAttribute("title") || "";
    if (!text) return;

    const rect = el.getBoundingClientRect();

    tip.textContent = text;
    tip.style.display = "block";
    tip.style.position = "fixed";
    tip.style.zIndex = "2147483647";
    tip.style.pointerEvents = "none";

    requestAnimationFrame(() => {
      const tw = tip.offsetWidth || 0;
      const th = tip.offsetHeight || 0;

      let left = rect.left + rect.width / 2 - tw / 2;
      let top = rect.top - th - 8;

      left = Math.min(Math.max(8, left), window.innerWidth - tw - 8);

      if (top < 8) {
        top = rect.bottom + 8;
      }

      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    });
  },

  hideTooltip() {
    const tip = document.getElementById("aion2Tooltip");
    if (tip) tip.style.display = "none";
  },

  applyInitialPanelPosition(panel) {
    /*
     * KINOJO panel position rule
     * ------------------------------------------------------------
     * - Every fresh page load starts from the bottom-right corner.
     * - Dragging is still allowed after the panel appears.
     * - The panel is clamped so it cannot move outside the browser viewport.
     * - Stored positions from older builds are ignored to avoid off-screen restores.
     */
    localStorage.removeItem("KINOJO_PANEL_POS");
    this.resetPanelToBottomRight_(panel);
    requestAnimationFrame(() => this.keepPanelInViewport(panel));
  },

  resetPanelToBottomRight_(panel) {
    if (!panel) return;
    panel.classList.remove("kinojo-lefttop-mode");
    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "24px";
    panel.style.bottom = "24px";
    panel.style.transformOrigin = "bottom right";
  },

  restorePanelPosition(panel) {
    this.applyInitialPanelPosition(panel);
  },

  readSavedPanelPosition_() {
    try {
      const saved = JSON.parse(localStorage.getItem("KINOJO_PANEL_POS") || "null");
      if (!saved || typeof saved.left !== "number" || typeof saved.top !== "number") return null;
      return saved;
    } catch (e) {
      return null;
    }
  },

  clamp_(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(Math.max(n, min), max);
  },

  getSafePanelBounds_(panel) {
    const margin = 12;
    const rect = panel ? panel.getBoundingClientRect() : { width: 0, height: 0 };
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const maxLeft = Math.max(margin, viewportWidth - rect.width - margin);
    const maxTop = Math.max(margin, viewportHeight - rect.height - margin);
    return { margin, maxLeft, maxTop };
  },

  keepPanelInViewport(panel) {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const safe = this.getSafePanelBounds_(panel);
    const nextLeft = this.clamp_(rect.left, safe.margin, safe.maxLeft);
    const nextTop = this.clamp_(rect.top, safe.margin, safe.maxTop);

    if (Math.round(nextLeft) !== Math.round(rect.left) || Math.round(nextTop) !== Math.round(rect.top)) {
      this.setPanelPosition_(panel, nextLeft, nextTop);
    }
  },

  bindViewportSafeGuard_(panel) {
    if (!panel) return;

    /*
     * 1.3.1.00
     * ------------------------------------------------------------
     * Restores the viewport guard that createPanel() calls.
     * This method owns only viewport clamping. Drag math and scale
     * remain in enablePanelDrag(), so no duplicate drag listeners are
     * introduced here.
     */
    if (this.viewportSafeGuardHandler_) {
      window.removeEventListener("resize", this.viewportSafeGuardHandler_);
      window.removeEventListener("orientationchange", this.viewportSafeGuardHandler_);
    }

    this.viewportSafeGuardHandler_ = () => {
      const currentPanel = document.getElementById("aion2OfficialPanel");
      if (!currentPanel) return;
      requestAnimationFrame(() => this.keepPanelInViewport(currentPanel));
    };

    window.addEventListener("resize", this.viewportSafeGuardHandler_, { passive: true });
    window.addEventListener("orientationchange", this.viewportSafeGuardHandler_, { passive: true });
  },



  attachCloseButton(panel) {
    const closeBtn = panel ? panel.querySelector("#aion2PanelCloseBtn") : document.getElementById("aion2PanelCloseBtn");
    if (!closeBtn || closeBtn.dataset.kinojoCloseBound === "true") return;
    closeBtn.dataset.kinojoCloseBound = "true";

    closeBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      this.hideTooltip();

      const currentPanel = document.getElementById("aion2OfficialPanel");
      if (currentPanel) currentPanel.style.display = "none";
      if (this.destroyDebugDrawer_) this.destroyDebugDrawer_();

      const overlays = [
        "aion2StartConfirmOverlay",
        "aion2PasswordOverlay",
        "aion2ResumeConfirmOverlay"
      ];
      overlays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    });
  },

  hasChromeRuntime_() {
    return !!(
      window.chrome &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    );
  },

  async getRemoteJsonSafe_(url) {
    const targetUrl = String(url || "").trim();
    if (!targetUrl) throw new Error("원격 설정 주소가 없습니다.");

    const cacheBustedUrl = targetUrl + (targetUrl.includes("?") ? "&" : "?") + "t=" + Date.now();

    if (
      this.hasChromeRuntime_() &&
      window.AION2_HTTP &&
      typeof window.AION2_HTTP.getJson === "function"
    ) {
      return window.AION2_HTTP.getJson(cacheBustedUrl);
    }

    const res = await fetch(cacheBustedUrl, {
      method: "GET",
      cache: "no-store"
    });
    const text = await res.text();

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
    if (!text.trim()) throw new Error("빈 응답입니다.");

    return JSON.parse(text);
  },

  registerGlobalHotkeys() {
    /*
     * 1.3.1.00
     * F-window-minimize UI was removed by design.
     * Keep this method as a safe no-op so createPanel() remains stable
     * without binding duplicate global key handlers.
     */
    if (this.globalHotkeysRegistered_) return;
    this.globalHotkeysRegistered_ = true;
  },

  normalizeLockStatus_(result) {
    const source = result && result.status && typeof result.status === "object"
      ? result.status
      : (result || {});

    return {
      ok: result?.ok === true || source.ok === true,
      running: source.running === true || result?.running === true,
      sessionId: String(source.sessionId || result?.sessionId || ""),
      deviceId: String(source.clientId || source.deviceId || result?.clientId || result?.deviceId || ""),
      count: Number(source.progressCurrent ?? source.count ?? result?.progressCurrent ?? result?.count ?? 0),
      total: Number(source.progressTotal ?? source.total ?? result?.progressTotal ?? result?.total ?? 0),
      percent: Number(source.progressPercent ?? result?.progressPercent ?? 0),
      currentCharacter: String(source.currentCharacter || result?.currentCharacter || ''),
      stage: String(source.stage || result?.stage || ''),
      lastPing: Number(source.lastPing ?? result?.lastPing ?? 0),
      startTime: Number(source.startTime ?? result?.startTime ?? 0),
      owner: String(source.owner || source.ownerCharacterName || result?.owner || ''),
      ownerRole: String(source.ownerRoleLabel || source.ownerRole || result?.ownerRole || ''),
      message: String(source.message || result?.message || '')
    };
  },

  cacheLockStatus_(status) {
    try {
      localStorage.setItem("KINOJO_LOCK_STATUS", JSON.stringify(status || {}));
    } catch (e) {}
  },

  readCachedLockStatus_() {
    try {
      return JSON.parse(localStorage.getItem("KINOJO_LOCK_STATUS") || "null") || {};
    } catch (e) {
      return {};
    }
  },

  clearCachedLockStatus_() {
    localStorage.removeItem("KINOJO_LOCK_STATUS");
  },

  async syncLockStateFromServer() {
    try {
      const K = window.AION2_CONFIG && window.AION2_CONFIG.KEYS;
      if (!K) return;

      if (!window.KINOJO_SUPABASE || typeof window.KINOJO_SUPABASE.getLockStatus !== 'function') return;

      const result = await window.KINOJO_SUPABASE.getLockStatus();
      const status = this.normalizeLockStatus_(result);
      if (!status.ok) return;
      if (this.updateRuntimeStateBar_) this.updateRuntimeStateBar_(status);

      const localSessionId = window.AION2_UPDATER && typeof window.AION2_UPDATER.getSessionId === 'function'
        ? window.AION2_UPDATER.getSessionId()
        : '';
      const localRunning = localStorage.getItem(K.RUNNING) === 'true';
      const isOwnSession = !!(localSessionId && status.sessionId && localSessionId === status.sessionId);

      if (status.running && !isOwnSession) {
        localStorage.setItem('KINOJO_BLOCKED_BY_OTHER', 'true');
        if (!localRunning) localStorage.setItem(K.RUNNING, 'false');

        this.cacheLockStatus_(status);
        this.setExternalBlockedState(true);
        this.showLockedStatus(status);
        this.updateButtonState();

        if (window.AION2_UPDATER && typeof window.AION2_UPDATER.startLockStatusPolling === 'function') {
          window.AION2_UPDATER.startLockStatusPolling();
        }
        return;
      }

      if (!status.running || isOwnSession) {
        localStorage.removeItem('KINOJO_BLOCKED_BY_OTHER');
        this.clearCachedLockStatus_();
        this.setExternalBlockedState(false);
        if (window.AION2_UPDATER && typeof window.AION2_UPDATER.stopLockStatusPolling === 'function' && !localRunning) {
          window.AION2_UPDATER.stopLockStatusPolling();
        }
        this.updateButtonState();
        this.updateStatusBox();
      }
    } catch (err) {
      console.warn('Kinojo lock sync failed:', err);
    }
  },


  setPanelPosition_(panel, left, top) {
    const safe = this.getSafePanelBounds_(panel);
    const safeLeft = this.clamp_(left, safe.margin, safe.maxLeft);
    const safeTop = this.clamp_(top, safe.margin, safe.maxTop);

    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = `${Math.round(safeLeft)}px`;
    panel.style.top = `${Math.round(safeTop)}px`;
    panel.style.transformOrigin = "top left";
    panel.classList.add("kinojo-lefttop-mode");
  },

  savePanelPosition_(panel) {
    const rect = panel.getBoundingClientRect();
    const safe = this.getSafePanelBounds_(panel);

    localStorage.setItem(
      "KINOJO_PANEL_POS",
      JSON.stringify({
        left: Math.round(this.clamp_(rect.left, safe.margin, safe.maxLeft)),
        top: Math.round(this.clamp_(rect.top, safe.margin, safe.maxTop))
      })
    );
  },

  getPanelScale_(panel) {
    const source = panel || document.getElementById("aion2OfficialPanel") || document.documentElement;
    const raw = getComputedStyle(source).getPropertyValue("--kinojo-scale")
      || getComputedStyle(document.documentElement).getPropertyValue("--kinojo-scale")
      || "1";
    const scale = Number.parseFloat(String(raw).trim());
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  },

  enablePanelDrag(panel, handle) {
    if (!panel || !handle) return;
    if (handle.dataset.kinojoDragBound === "true") return;
    handle.dataset.kinojoDragBound = "true";

    let dragging = false;
    let moved = false;
    let grabOffsetX = 0;
    let grabOffsetY = 0;

    const switchToLeftTopMode = () => {
      const before = panel.getBoundingClientRect();
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${Math.round(before.left)}px`;
      panel.style.top = `${Math.round(before.top)}px`;
      panel.style.transformOrigin = "top left";
      panel.classList.add("kinojo-lefttop-mode");

      const after = panel.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        panel.style.left = `${Math.round(before.left + dx)}px`;
        panel.style.top = `${Math.round(before.top + dy)}px`;
      }
      return panel.getBoundingClientRect();
    };

    const move = e => {
      if (!dragging) return;
      moved = true;
      const safe = this.getSafePanelBounds_(panel);
      const left = this.clamp_(e.clientX - grabOffsetX, safe.margin, safe.maxLeft);
      const top = this.clamp_(e.clientY - grabOffsetY, safe.margin, safe.maxTop);
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    };

    const up = () => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove("kinojo-dragging");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      this.keepPanelInViewport(panel);
      this.savePanelPosition_(panel);
      setTimeout(() => { moved = false; }, 0);
    };

    handle.addEventListener("mousedown", e => {
      if (e.target && e.target.closest && e.target.closest("#aion2PanelCloseBtn")) return;
      if (e.button !== 0) return;
      e.preventDefault();

      const rect = switchToLeftTopMode();
      grabOffsetX = e.clientX - rect.left;
      grabOffsetY = e.clientY - rect.top;

      dragging = true;
      moved = false;
      panel.classList.add("kinojo-dragging");
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });

    handle.addEventListener("click", e => {
      if (moved) e.preventDefault();
    });
  },

  updateButtonState() {
    const K = window.AION2_CONFIG.KEYS;
    const running = localStorage.getItem(K.RUNNING) === "true";
    const blockedByOther = localStorage.getItem("KINOJO_BLOCKED_BY_OTHER") === "true" && !running;
    const starting = !!(window.AION2_UPDATER && window.AION2_UPDATER.startInProgress);
    const retained = !running && !!(window.AION2_UPDATER && window.AION2_UPDATER.hasRetainedRunState_ && window.AION2_UPDATER.hasRetainedRunState_());
    const canResume = !running && !!(window.AION2_UPDATER && window.AION2_UPDATER.hasPendingResumeWork_ && window.AION2_UPDATER.hasPendingResumeWork_());
    const autoRecover = localStorage.getItem(K.AUTO_RECOVER) === "true";

    const mainBtn = document.getElementById("aion2MainToggleBtn");
    const resumeBtn = document.getElementById("aion2ResumeBtn");
    const resetBtn = document.getElementById("aion2ResetBtn");
    const autoBtn = document.getElementById("aion2AutoBtn");

    if (!mainBtn || !resumeBtn || !resetBtn || !autoBtn) return;

    const mainIcon = mainBtn.querySelector(".kinojo-main-icon");

    const mainLabel = mainBtn.querySelector(".kinojo-main-label");

    if (blockedByOther) {
      if (mainIcon) mainIcon.innerHTML = window.AION2_ICONS.shield || window.AION2_ICONS.pause || "";
      if (mainLabel) mainLabel.textContent = "잠금";
      mainBtn.classList.remove("running");
      mainBtn.classList.add("locked");
      mainBtn.disabled = true;
      resumeBtn.disabled = true;
      mainBtn.dataset.tip = "다른 PC에서 조회 중입니다";
    } else if (starting) {
      if (mainIcon) mainIcon.innerHTML = window.AION2_ICONS.play;
      if (mainLabel) mainLabel.textContent = "준비중";
      mainBtn.classList.remove("running", "locked");
      mainBtn.disabled = false;
      resumeBtn.disabled = false;
      mainBtn.dataset.tip = "조회 시작 준비 중입니다";
    } else if (running) {
      if (mainIcon) mainIcon.innerHTML = window.AION2_ICONS.pause;
      if (mainLabel) mainLabel.textContent = "일시정지";
      mainBtn.classList.remove("locked");
      mainBtn.disabled = false;
      resumeBtn.disabled = false;
      mainBtn.classList.add("running");
      mainBtn.dataset.tip = "조회 일시정지";
    } else if (retained) {
      if (mainIcon) mainIcon.innerHTML = window.AION2_ICONS.pause || window.AION2_ICONS.play;
      if (mainLabel) mainLabel.textContent = "기록 유지";
      mainBtn.classList.remove("running", "locked");
      mainBtn.disabled = true;
      resumeBtn.disabled = !canResume;
      mainBtn.dataset.tip = "기존 작업 기록 유지 중 · 초기화 후 새 조회 가능";
    } else {
      if (mainIcon) mainIcon.innerHTML = window.AION2_ICONS.play;
      if (mainLabel) mainLabel.textContent = "조회 시작";
      mainBtn.classList.remove("running", "locked");
      mainBtn.disabled = false;
      resumeBtn.disabled = true;
      mainBtn.dataset.tip = "새 조회 시작";
    }

    resumeBtn.dataset.tip = canResume ? "중단된 작업 이어서 시작" : "이어서 시작할 남은 작업 없음";
    resetBtn.dataset.tip = "초기화";
    autoBtn.dataset.tip = autoRecover ? "자동복구 ON" : "자동복구 OFF";


    resumeBtn.style.opacity = running ? "0.55" : "1";
    resetBtn.style.opacity = running ? "0.55" : "1";
    autoBtn.classList.toggle("off", !autoRecover);

    this.updateStatusBox();
  },



  ensureDebugDrawerAttached_() {
    let drawer = document.getElementById("aion2DebugDrawer");
    if (!drawer) {
      drawer = this.createDebugDrawer_();
      document.body.appendChild(drawer);
    } else if (drawer.parentElement !== document.body) {
      document.body.appendChild(drawer);
    }
    return drawer;
  },

  destroyDebugDrawer_() {
    const panel = document.getElementById("aion2OfficialPanel");
    const drawer = document.getElementById("aion2DebugDrawer");
    if (this._debugDrawerResizeHandler) {
      window.removeEventListener("resize", this._debugDrawerResizeHandler);
      this._debugDrawerResizeHandler = null;
    }
    if (panel) panel.classList.remove("kinojo-debug-open");
    document.body.classList.remove("kinojo-debug-open");
    if (drawer) drawer.remove();
  },

  bindDebugDrawerEvents_() {
    if (this._debugDrawerBound) return;
    this._debugDrawerBound = true;
    document.addEventListener("click", event => {
      const target = event.target;
      const toggle = target && target.closest && target.closest("#aion2DebugToggleBtn");
      if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        this.toggleDebugDrawer();
        return;
      }
      const close = target && target.closest && target.closest("#aion2DebugDrawerClose");
      if (close) {
        event.preventDefault();
        event.stopPropagation();
        this.toggleDebugDrawer(false);
        return;
      }
      const copyRun = target && target.closest && target.closest('[data-kinojo-action="copy-run-details"]');
      if (copyRun) {
        event.preventDefault();
        event.stopPropagation();
        this.copyCurrentRunDetails();
        return;
      }
      const retryPostprocess = target && target.closest && target.closest('[data-kinojo-action="retry-postprocess"]');
      if (retryPostprocess) {
        event.preventDefault();
        event.stopPropagation();
        if (window.AION2_UPDATER && typeof window.AION2_UPDATER.retryServerPostprocess_ === 'function') {
          window.AION2_UPDATER.retryServerPostprocess_();
        }
        return;
      }
      const copyFailures = target && target.closest && target.closest('[data-kinojo-action="copy-lookup-failures"]');
      if (copyFailures) {
        event.preventDefault();
        event.stopPropagation();
        this.copyLookupFailures();
      }
    }, true);
  },

  enableDebugDrawerDrag_() {
    const drawer = document.getElementById("aion2DebugDrawer");
    const handle = document.getElementById("aion2DebugDrawerHandle");
    if (!drawer || !handle || drawer.dataset.dragBound === "true") return;
    drawer.dataset.dragBound = "true";
    this.applyDebugDrawerPosition_(drawer);

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const move = event => {
      if (!dragging || !drawer.isConnected) return;
      const margin = 8;
      const nextLeft = Math.min(Math.max(margin, startLeft + event.clientX - startX), Math.max(margin, window.innerWidth - drawer.offsetWidth - margin));
      const nextTop = Math.min(Math.max(margin, startTop + event.clientY - startY), Math.max(margin, window.innerHeight - drawer.offsetHeight - margin));
      drawer.style.left = `${nextLeft}px`;
      drawer.style.top = `${nextTop}px`;
      drawer.style.right = "auto";
      drawer.style.bottom = "auto";
    };

    const up = () => {
      if (!dragging) return;
      dragging = false;
      drawer.classList.remove("kinojo-debug-dragging");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      if (!drawer.isConnected) return;
      try {
        localStorage.setItem("KINOJO_DEBUG_DRAWER_POS", JSON.stringify({
          left: parseInt(drawer.style.left, 10) || drawer.getBoundingClientRect().left,
          top: parseInt(drawer.style.top, 10) || drawer.getBoundingClientRect().top
        }));
      } catch (_e) {}
    };

    handle.addEventListener("mousedown", event => {
      if (event.button !== 0 || (event.target && event.target.closest && event.target.closest("button"))) return;
      event.preventDefault();
      const rect = drawer.getBoundingClientRect();
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      drawer.style.left = `${rect.left}px`;
      drawer.style.top = `${rect.top}px`;
      drawer.style.right = "auto";
      drawer.style.bottom = "auto";
      drawer.classList.add("kinojo-debug-dragging");
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });

    this._debugDrawerResizeHandler = () => {
      const currentDrawer = document.getElementById("aion2DebugDrawer");
      if (currentDrawer) this.keepDebugDrawerInViewport_(currentDrawer);
    };
    window.addEventListener("resize", this._debugDrawerResizeHandler);
  },

  applyDebugDrawerPosition_(drawer) {
    try {
      const pos = JSON.parse(localStorage.getItem("KINOJO_DEBUG_DRAWER_POS") || "null");
      if (!pos) {
        if (this.placeSidecarWindow_) this.placeSidecarWindow_(drawer);
        return;
      }
      drawer.style.left = `${Math.max(8, Number(pos.left || 0))}px`;
      drawer.style.top = `${Math.max(8, Number(pos.top || 0))}px`;
      drawer.style.right = "auto";
      drawer.style.bottom = "auto";
      this.keepDebugDrawerInViewport_(drawer);
    } catch (_e) {}
  },

  keepDebugDrawerInViewport_(drawer) {
    if (!drawer || !drawer.isConnected) return;
    const rect = drawer.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const margin = 8;
    const nextLeft = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - rect.width - margin));
    const nextTop = Math.min(Math.max(margin, rect.top), Math.max(margin, window.innerHeight - rect.height - margin));
    drawer.style.left = `${nextLeft}px`;
    drawer.style.top = `${nextTop}px`;
    drawer.style.right = "auto";
    drawer.style.bottom = "auto";
  },

  getServerStatus_() {
    return this.readJsonLocal_("KINOJO_SERVER_STATUS", {});
  },

  formatServerStatusAge_(time) {
    const ms = Date.now() - Number(time || 0);
    if (!time || ms < 0) return "-";
    if (ms < 1000) return "방금";
    if (ms < 60000) return `${Math.round(ms / 1000)}초 전`;
    return `${Math.round(ms / 60000)}분 전`;
  },

  getServerStatusHtml_() {
    const status = this.getServerStatus_();
    const supa = status.supabase || {};
    const chip = (label, data, fallback) => {
      const state = String(data.state || 'idle');
      const value = data.message || fallback;
      return `<span class="kinojo-server-chip ${this.escapeHtml_(state)}"><b>${label}</b>${this.escapeHtml_(value)}<em>${this.escapeHtml_(this.formatServerStatusAge_(data.updatedAt))}</em></span>`;
    };
    return `${chip('Server Engine', supa, window.KINOJO_SUPABASE && window.KINOJO_SUPABASE.isEnabled && window.KINOJO_SUPABASE.isEnabled() ? '대기' : '비활성')}`;
  },

  updateServerStatusUi_() {
    const bar = document.getElementById("aion2ServerStateBar");
    if (bar) bar.innerHTML = this.getServerStatusHtml_();
  },

  toggleDebugDrawer(forceOpen) {
    const panel = document.getElementById("aion2OfficialPanel");
    if (!panel) return;
    const existing = document.getElementById("aion2DebugDrawer");
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !existing;
    if (!shouldOpen) {
      this.destroyDebugDrawer_();
      return;
    }
    const drawer = this.ensureDebugDrawerAttached_();
    panel.classList.add("kinojo-debug-open");
    document.body.classList.add("kinojo-debug-open");
    drawer.classList.add("kinojo-debug-drawer-open", "is-visible");
    drawer.setAttribute("aria-hidden", "false");
    this.enableDebugDrawerDrag_();
    this.applyDebugDrawerPosition_(drawer);
    this.updateServerStatusUi_();
    this.renderDebugDrawer_();
    requestAnimationFrame(() => this.keepDebugDrawerInViewport_(drawer));
  },

  readJsonLocal_(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },

  getLookupDebug_() {
    const K = window.AION2_CONFIG && window.AION2_CONFIG.KEYS;
    if (!K) return {};
    return this.readJsonLocal_(K.LIST_DEBUG, {});
  },

  getRetryQueue_() {
    const K = window.AION2_CONFIG && window.AION2_CONFIG.KEYS;
    if (!K) return [];
    return this.readJsonLocal_(K.RETRY_QUEUE, []);
  },

  canRetryPostprocess_() {
    const running = localStorage.getItem(window.AION2_CONFIG.KEYS.RUNNING) === 'true';
    if (running) return false;
    if (window.AION2_UPDATER && typeof window.AION2_UPDATER.isPostprocessExecutionActive_ === 'function'
        && window.AION2_UPDATER.isPostprocessExecutionActive_()) return false;
    const sessionId = localStorage.getItem('KINOJO_ACTIVE_SESSION_ID') || localStorage.getItem('KINOJO_SESSION_ID') || '';
    const sessionToken = localStorage.getItem('KINOJO_SERVER_ENGINE_SESSION_TOKEN') || '';
    if (!sessionId || !sessionToken) return false;
    const history = this.getUpdaterPhaseHistory_ ? this.getUpdaterPhaseHistory_() : {};
    const hasLocalPhaseError = ['missing_recheck','master_sync','growth_review','ranking_rebuild','list_sheet_export']
      .some(id => String(history && history[id] && history[id].status || '').toLowerCase() === 'error');
    if (hasLocalPhaseError) return true;

    // 재시도 가능 여부는 Server 진단 응답을 그대로 사용한다.
    // Extension은 Queue 수치나 완료 조건을 계산하지 않는다.
    const snapshot = this.readJsonLocal_('KINOJO_LOOKUP_DEBUG_SNAPSHOT', {});
    const checks = snapshot && snapshot.checks || {};
    return checks.retryable === true;
  },

  getServerProgressSummary_() {
    const stored = this.readJsonLocal_('KINOJO_LOOKUP_PROGRESS_SUMMARY', null);
    if (stored && stored.ok === true) return stored;
    const snapshot = this.readJsonLocal_('KINOJO_LOOKUP_DEBUG_SNAPSHOT', {});
    if (snapshot && snapshot.progress && snapshot.progress.ok === true) return snapshot.progress;
    return null;
  },

  renderDebugDrawer_() {
    const body = document.getElementById("aion2DebugDrawerBody");
    if (!body || !window.AION2_CONFIG) return;
    const K = window.AION2_CONFIG.KEYS;
    const running = localStorage.getItem(K.RUNNING) === "true";
    const current = this.readJsonLocal_(K.CURRENT, null);
    const prep = this.readPreparationStatus_ ? this.readPreparationStatus_() : null;
    const phaseState = this.getUpdaterPhaseState_ ? this.getUpdaterPhaseState_() : null;
    const phaseBoardHtml = this.renderPhaseBoard_ ? this.renderPhaseBoard_(phaseState) : "";
    const progress = this.getServerProgressSummary_ ? this.getServerProgressSummary_() : null;

    const total = Number(progress?.total ?? localStorage.getItem(K.TOTAL) ?? 0);
    const activePosition = Number(progress?.activePosition ?? current?.activePosition ?? 0);
    const completed = Number(progress?.completedCount ?? localStorage.getItem(K.DONE) ?? 0);
    const success = Number(progress?.successCount ?? completed);
    const finalFailed = Number(progress?.finalFailedCount ?? 0);
    const retryPending = Number(progress?.retryPendingCount ?? 0);
    const currentName = progress?.currentCharacter || current?.originalName || current?.name || current?.characterName || "";
    const currentStep = Number(progress?.currentStep || 0);
    const stepLabel = progress?.currentStepLabel || (currentStep === 1 ? '원본 대조' : currentStep === 2 ? '공식 조회' : currentStep === 3 ? '서버 후처리' : '대기');
    const stateText = running ? `${stepLabel} 진행 중` : (prep ? "조회 준비 중" : (currentStep > 0 ? `${stepLabel} 기록` : "조회 대기"));
    const positionText = running && total > 0 && activePosition > 0
      ? `현재 ${activePosition} / ${total}`
      : (total > 0 ? `처리 완료 ${completed} / ${total}` : '대기');
    const prepText = prep && !running ? ` · ${Number(prep.step || 0)}/${Number(prep.total || 0)} ${prep.message || "준비 중"}` : "";

    body.innerHTML = `
      <div class="kinojo-detail-summary">
        <div class="kinojo-detail-summary-line">
          <strong>Server Engine</strong>
          <span>${this.escapeHtml_(stateText)} · ${this.escapeHtml_(positionText)}${this.escapeHtml_(prepText)}</span>
        </div>
        <div class="kinojo-detail-summary-line is-secondary">
          <strong>${this.escapeHtml_(currentName || '현재 캐릭터 대기')}</strong>
          <span>처리 완료 ${completed} · 정상 ${success} · 최종 실패 ${finalFailed} · 재조회 ${retryPending}</span>
        </div>
      </div>
      ${phaseBoardHtml ? `<section class="kinojo-debug-phase-section">${phaseBoardHtml}</section>` : '<div class="kinojo-detail-empty">STEP 진행 기록이 없습니다.</div>'}
    `;
  },

  getVerifyResultHtml_() {
    const K = window.AION2_CONFIG && window.AION2_CONFIG.KEYS;
    if (!K) return "";
    const result = this.readJsonLocal_(K.VERIFY_RESULT, null);
    if (!result) return "";
    const missing = Array.isArray(result.missing) ? result.missing : [];
    const rows = missing.slice(0, 20).map((item, idx) => `
      <li><span>${idx + 1}. ${this.escapeHtml_(item.name || item.characterName || "이름없음")}</span><em>${this.escapeHtml_(item.reason || "누락")}</em></li>
    `).join("");
    const more = missing.length > 20 ? `<li><span>외 ${missing.length - 20}명</span><em>목록 생략</em></li>` : "";
    return `
      <section class="kinojo-debug-section">
        <div class="kinojo-debug-label">저장 검산</div>
        <p>${missing.length ? `누락 ${missing.length}명 · 자동 재조회 예정` : `누락 0명 · 확인 ${this.escapeHtml_(result.checked || 0)}명`}</p>
        ${missing.length ? `<ul class="kinojo-retry-list">${rows}${more}</ul>` : ""}
      </section>
    `;
  },

  readPreparationStatus_() {
    const K = window.AION2_CONFIG.KEYS;
    try {
      const parsed = JSON.parse(localStorage.getItem(K.PREP_STATUS) || "null");
      if (!parsed || !parsed.message) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  },

  getRetrySummaryHtml_() {
    const K = window.AION2_CONFIG.KEYS;
    let retryQueue = [];
    try { retryQueue = JSON.parse(localStorage.getItem(K.RETRY_QUEUE) || "[]"); }
    catch (e) { retryQueue = []; }
    const retryRound = Number(localStorage.getItem(K.RETRY_ROUND) || "0");
    if (!retryQueue.length && !retryRound) return "";
    const text = retryQueue.length
      ? `재조회 대기 ${retryQueue.length}명${retryRound ? ` · ${retryRound}차 진행 후` : ""}`
      : `재조회 ${retryRound}차 진행 중`;
    return `
      <div class="kinojo-running-row kinojo-retry-row">
        <span class="kinojo-running-key">자동 재조회</span>
        <strong class="kinojo-running-value">${this.escapeHtml_(text)}</strong>
      </div>
    `;
  },

  formatRemainingTime_(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds || 0)));
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    if (minutes <= 0) return `${remainSeconds}초`;
    return `${minutes}분 ${String(remainSeconds).padStart(2, "0")}초`;
  },
  getDebugToggleHtml_() {
    return `<button id="aion2DebugToggleBtn" type="button" class="kinojo-debug-toggle">조회 상세</button>`;
  },


  getUpdaterPhaseState_() {
    try {
      return window.KINOJO_UPDATER_PHASES && window.KINOJO_UPDATER_PHASES.readState
        ? window.KINOJO_UPDATER_PHASES.readState()
        : null;
    } catch (_e) {
      return null;
    }
  },

  getUpdaterPhaseHistory_() {
    try {
      return window.KINOJO_UPDATER_PHASES && window.KINOJO_UPDATER_PHASES.readHistory
        ? window.KINOJO_UPDATER_PHASES.readHistory()
        : {};
    } catch (_e) {
      return {};
    }
  },

  renderPhaseBoard_(state) {
    const model = window.KINOJO_UPDATER_PHASES;
    if (!model || !Array.isArray(model.phases)) return "";

    const history = this.getUpdaterPhaseHistory_ ? this.getUpdaterPhaseHistory_() : {};
    if (state && state.phaseId && state.phaseId !== 'idle') history[state.phaseId] = state;
    const steps = Array.isArray(model.steps) && model.steps.length
      ? model.steps
      : [
          { id:'step1', no:1, title:'원본 LIST / SERVER 대조', phaseIds:['list_master_compare'] },
          { id:'step2', no:2, title:'캐릭터 공식 조회', phaseIds:['character_lookup'] },
          { id:'step3', no:3, title:'서버 후처리 / 원본 LIST 반영', phaseIds:['missing_recheck','master_sync','growth_review','ranking_rebuild','list_sheet_export'] }
        ];

    const getPhase = id => model.getPhase ? model.getPhase(id) : model.phases.find(p => p.id === id);
    const retryQueue = this.getRetryQueue_ ? this.getRetryQueue_() : [];
    const currentItem = (() => {
      try {
        const K = window.AION2_CONFIG && window.AION2_CONFIG.KEYS;
        return K ? JSON.parse(localStorage.getItem(K.CURRENT) || 'null') : null;
      } catch (_e) { return null; }
    })();
    const serverProgress = this.getServerProgressSummary_ ? this.getServerProgressSummary_() : null;

    const normalizeStatus = value => {
      const status = String(value || 'pending').toLowerCase();
      if (status === 'error' || status === 'failed') return 'error';
      if (status === 'done' || status === 'completed') return 'done';
      if (status === 'active' || status === 'running') return 'active';
      return 'pending';
    };
    const statusText = status => ({ done:'완료', active:'진행 중', error:'확인 필요', pending:'대기' }[status] || '대기');
    const statusIcon = status => ({ done:'✓', active:'•', error:'!', pending:'–' }[status] || '–');

    const renderIssues = phaseStates => {
      const issues = [];
      phaseStates.forEach(phaseState => {
        const rows = phaseState && phaseState.details && Array.isArray(phaseState.details.issues)
          ? phaseState.details.issues
          : [];
        rows.forEach(issue => issues.push(issue));
      });
      if (!issues.length) return '';
      return `
        <div class="kinojo-step-issues">
          ${issues.slice(-4).map(issue => {
            const character = issue.character ? `${this.escapeHtml_(issue.character)} · ` : '';
            const type = String(issue.type || '').toLowerCase();
            const cls = type === 'error' || type === 'failed' ? 'is-error' : 'is-warning';
            return `<div class="kinojo-step-issue ${cls}"><span>!</span><p>${character}${this.escapeHtml_(issue.message || '확인 필요')}</p></div>`;
          }).join('')}
        </div>
      `;
    };

    const renderStep1Details = phaseState => {
      const phase = getPhase('list_master_compare');
      const substeps = phase && Array.isArray(phase.substeps) ? phase.substeps : [];
      const currentSub = Number(phaseState && phaseState.details && phaseState.details.subStepNo || phaseState && phaseState.current || 0);
      const phaseStatus = normalizeStatus(phaseState && phaseState.status);
      return `<div class="kinojo-step-detail-list">
        ${substeps.map(sub => {
          let subStatus = 'pending';
          if (phaseStatus === 'error' && Number(sub.no) === Math.max(1, currentSub)) subStatus = 'error';
          else if (phaseStatus === 'done' || Number(sub.no) < currentSub) subStatus = 'done';
          else if (Number(sub.no) === currentSub && phaseStatus === 'active') subStatus = 'active';
          return `<div class="kinojo-step-detail-row is-${subStatus}"><span>${statusIcon(subStatus)}</span><b>${this.escapeHtml_(sub.title)}</b></div>`;
        }).join('')}
      </div>`;
    };

    const renderStep2Details = phaseState => {
      const details = phaseState && phaseState.details || {};
      const currentName = serverProgress?.currentCharacter || details.currentCharacter || currentItem?.originalName || currentItem?.characterName || currentItem?.name || '';
      const total = Number(serverProgress?.total ?? phaseState?.total ?? 0);
      const activePosition = Number(serverProgress?.activePosition ?? currentItem?.activePosition ?? 0);
      const completed = Number(serverProgress?.completedCount ?? phaseState?.current ?? 0);
      const successCount = Number(serverProgress?.successCount ?? completed);
      const failedCount = Number(serverProgress?.finalFailedCount ?? 0);
      const retryCount = Number(serverProgress?.retryPendingCount ?? retryQueue.length ?? 0);
      const etaSeconds = Number(serverProgress?.etaSeconds ?? details.etaSeconds ?? 0);
      const phaseStatus = normalizeStatus(phaseState && phaseState.status);
      const etaText = etaSeconds > 0
        ? `약 ${model.formatDuration ? model.formatDuration(etaSeconds * 1000) : this.formatRemainingTime_(etaSeconds)}`
        : (phaseStatus === 'done' ? '완료' : (phaseStatus === 'active' ? '계산 중' : '대기'));
      const diagnostics = this.readJsonLocal_('KINOJO_CURRENT_RUN_DIAGNOSTICS', {});
      const latestSnapshot = diagnostics && Array.isArray(diagnostics.events)
        ? diagnostics.events.slice().reverse().find(row => row.stage === 'SNAPSHOT_SUBMIT')
        : null;
      const latestResult = latestSnapshot && latestSnapshot.detail && latestSnapshot.detail.result || {};
      const latestResultText = latestSnapshot ? `${latestResult.gearType || latestResult.code || latestSnapshot.status || '-'} · ${latestResult.itemLevel ?? '-'} / ${latestResult.combatPower ?? '-'}` : '대기';
      const currentText = total > 0 && activePosition > 0
        ? `${activePosition}/${total} · ${currentName || '조회 중'}`
        : (currentName || '대기');
      return `<div class="kinojo-step-detail-list kinojo-step-lookup-detail">
        <div class="kinojo-step-detail-row is-${normalizeStatus(phaseState && phaseState.status)}"><span>${statusIcon(normalizeStatus(phaseState && phaseState.status))}</span><b>현재 조회</b><em>${this.escapeHtml_(currentText)}</em></div>
        <div class="kinojo-step-detail-row"><span>✓</span><b>정상 저장</b><em>${successCount}명</em></div>
        <div class="kinojo-step-detail-row ${failedCount ? 'is-error' : ''}"><span>${failedCount ? '!' : '✓'}</span><b>최종 실패</b><em>${failedCount}명</em></div>
        <div class="kinojo-step-detail-row ${retryCount ? 'is-active' : ''}"><span>${retryCount ? '•' : '✓'}</span><b>재조회 대기</b><em>${retryCount}명</em></div>
        <div class="kinojo-step-detail-row ${phaseStatus === 'active' ? 'is-active' : ''}"><span>◷</span><b>예상 남은 시간</b><em>${this.escapeHtml_(etaText)}</em></div>
        <div class="kinojo-step-detail-row"><span>·</span><b>최근 Server 결과</b><em>${this.escapeHtml_(latestResultText)}</em></div>
        ${failedCount ? `<button type="button" class="kinojo-copy-failures-btn" data-kinojo-action="copy-lookup-failures">실패 내역 복사</button>` : ''}
        <div class="kinojo-step-completed-note">처리 완료 ${completed} / ${total || 0}</div>
      </div>`;
    };

    const renderStep3Details = phaseIds => `<div class="kinojo-step-detail-list">
      ${phaseIds.map(phaseId => {
        const phase = getPhase(phaseId);
        const phaseState = history[phaseId];
        const rowStatus = normalizeStatus(phaseState && phaseState.status);
        const rowMessage = phaseState && phaseState.message ? phaseState.message : statusText(rowStatus);
        const result = phaseState && phaseState.details && phaseState.details.result || {};
        let resultText = statusText(rowStatus);
        if (phaseId === 'master_sync' && result) resultText = `성공 ${result.syncedCount ?? '-'} · 실패 ${result.failedCount ?? 0} · 불일치 ${result.incompleteCount ?? 0}`;
        if (phaseId === 'list_sheet_export' && result) resultText = `반영 ${result.updatedCount ?? result.syncedCount ?? '-'} · 실패 ${result.failedCount ?? 0}`;
        return `<div class="kinojo-step-detail-row is-${rowStatus}" title="${this.escapeHtml_(rowMessage)}"><span>${statusIcon(rowStatus)}</span><b>${this.escapeHtml_(phase && (phase.shortTitle || phase.title) || phaseId)}</b><em>${this.escapeHtml_(resultText)}</em></div>`;
      }).join('')}
    </div>`;

    const cards = steps.map(step => {
      const phaseStates = step.phaseIds.map(id => history[id]).filter(Boolean);
      const hasError = phaseStates.some(row => normalizeStatus(row.status) === 'error');
      const allDone = step.phaseIds.every(id => history[id] && normalizeStatus(history[id].status) === 'done');
      const hasActive = phaseStates.some(row => normalizeStatus(row.status) === 'active');
      let stepStatus = hasError ? 'error' : (allDone ? 'done' : (hasActive ? 'active' : 'pending'));
      const serverStatus = step.id === 'step1' ? serverProgress?.step1Status : step.id === 'step2' ? serverProgress?.step2Status : serverProgress?.step3Status;
      if (serverStatus) stepStatus = normalizeStatus(serverStatus);
      const latest = phaseStates.slice().sort((a,b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null;

      let percent = 0;
      let progressText = '대기';
      if (step.id === 'step1') {
        const phaseState = history.list_master_compare;
        const max = 5;
        const value = normalizeStatus(phaseState && phaseState.status) === 'done' ? max : Number(phaseState && phaseState.details && phaseState.details.subStepNo || phaseState && phaseState.current || 0);
        percent = Number.isFinite(Number(serverProgress?.step1Percent))
          ? Number(serverProgress.step1Percent)
          : Math.min(100, Math.round((value / max) * 100));
        progressText = `${Math.min(value, max)} / ${max}`;
      } else if (step.id === 'step2') {
        const phaseState = history.character_lookup;
        const current = Number(serverProgress?.completedCount ?? phaseState?.current ?? 0);
        const total = Number(serverProgress?.total ?? phaseState?.total ?? 0);
        percent = Number.isFinite(Number(serverProgress?.step2Percent))
          ? Number(serverProgress.step2Percent)
          : (total > 0 ? Math.min(100, Math.round((current / total) * 1000) / 10) : (stepStatus === 'done' ? 100 : 0));
        progressText = total > 0 ? `처리 완료 ${current} / ${total}` : statusText(stepStatus);
      } else {
        const doneCount = step.phaseIds.filter(id => history[id] && normalizeStatus(history[id].status) === 'done').length;
        const activePhase = step.phaseIds.find(id => history[id] && normalizeStatus(history[id].status) === 'active');
        let fractional = 0;
        if (activePhase) {
          const activeState = history[activePhase];
          fractional = activeState.total > 0 ? Math.min(1, Number(activeState.current || 0) / Number(activeState.total || 1)) : .15;
        }
        percent = Number.isFinite(Number(serverProgress?.step3Percent))
          ? Number(serverProgress.step3Percent)
          : Math.min(100, Math.round(((doneCount + fractional) / step.phaseIds.length) * 1000) / 10);
        if (stepStatus === 'done') percent = 100;
        progressText = `${doneCount} / ${step.phaseIds.length}`;
      }

      const message = latest && latest.message ? latest.message : (step.description || '대기 중');
      let detailHtml = '';
      if (step.id === 'step1') detailHtml = renderStep1Details(history.list_master_compare);
      else if (step.id === 'step2') detailHtml = renderStep2Details(history.character_lookup);
      else detailHtml = renderStep3Details(step.phaseIds);

      return `
        <section class="kinojo-step-panel kinojo-step-${stepStatus}">
          <header class="kinojo-step-panel-head">
            <span class="kinojo-step-number">STEP ${step.no}</span>
            <em>${this.escapeHtml_(statusText(stepStatus))}</em>
            <strong>${this.escapeHtml_(step.title)}</strong>
          </header>
          <p class="kinojo-step-message">${this.escapeHtml_(message)}</p>
          ${detailHtml}
          ${renderIssues(phaseStates)}
          <div class="kinojo-step-progress-meta"><span>${this.escapeHtml_(progressText)}</span><b>${percent}%</b></div>
          <div class="aion2-progress-track kinojo-step-progress"><div class="aion2-progress-fill" style="width:${percent}%"></div></div>
        </section>
      `;
    }).join('');

    const overallPercent = Math.min(100, Math.max(0, Number(serverProgress?.overallProgressPercent ?? state?.percent ?? 0)));
    const currentStep = Number(serverProgress?.currentStep || 0);
    const currentStepLabel = serverProgress?.currentStepLabel || (currentStep === 1 ? '원본 대조' : currentStep === 2 ? '공식 조회' : currentStep === 3 ? '서버 후처리' : '대기');
    const stepStatusFor = no => {
      const serverValue = no === 1 ? serverProgress?.step1Status : no === 2 ? serverProgress?.step2Status : serverProgress?.step3Status;
      if (serverValue) return normalizeStatus(serverValue);
      const ids = no === 1 ? ['list_master_compare'] : no === 2 ? ['character_lookup'] : ['missing_recheck','master_sync','growth_review','ranking_rebuild','list_sheet_export'];
      const rows = ids.map(id => history[id]).filter(Boolean);
      if (rows.some(row => normalizeStatus(row.status) === 'error')) return 'error';
      if (ids.every(id => history[id] && normalizeStatus(history[id].status) === 'done')) return 'done';
      if (rows.some(row => normalizeStatus(row.status) === 'active')) return 'active';
      return 'pending';
    };
    const step1Status = stepStatusFor(1);
    const step2Status = stepStatusFor(2);
    const step3Status = stepStatusFor(3);
    const connector1 = step1Status === 'done' ? 'is-done' : (step1Status === 'error' ? 'is-error' : '');
    const connector2 = step2Status === 'done' ? 'is-done' : (step2Status === 'error' ? 'is-error' : '');

    return `
      <div class="kinojo-step-board">
        <div class="kinojo-step-board-head">
          <strong>STEP 1 · 2 · 3</strong>
          ${this.canRetryPostprocess_ && this.canRetryPostprocess_() ? '<button type="button" class="kinojo-copy-run-btn kinojo-retry-postprocess-btn" data-kinojo-action="retry-postprocess">후처리 재시도</button>' : ''}
          <button type="button" class="kinojo-copy-run-btn" data-kinojo-action="copy-run-details">전체 내역 복사</button>
        </div>
        <div class="kinojo-step-panels">${cards}</div>
        <section class="kinojo-overall-progress" style="--kinojo-overall-percent:${overallPercent}%">
          <div class="kinojo-overall-stepper">
            <div class="kinojo-overall-node is-${step1Status}"><b>1</b><span>원본 대조</span></div>
            <div class="kinojo-overall-connector ${connector1}"></div>
            <div class="kinojo-overall-node is-${step2Status}"><b>2</b><span>공식 조회</span></div>
            <div class="kinojo-overall-connector ${connector2}"></div>
            <div class="kinojo-overall-node is-${step3Status}"><b>3</b><span>서버 후처리</span></div>
          </div>
          <div class="kinojo-overall-meter"><span></span></div>
          <div class="kinojo-overall-meta"><strong>전체 진행 ${overallPercent.toFixed(1).replace('.0','')}%</strong><span>STEP ${currentStep || '-'} · ${this.escapeHtml_(currentStepLabel)}</span></div>
        </section>
      </div>
    `;
  },

  renderCompactStatus_(_options = {}) {
    const box = document.getElementById("aion2StatusBox");
    if (!box) return;
    box.className = "aion2-card kinojo-detail-launcher";
    box.innerHTML = this.getDebugToggleHtml_ ? this.getDebugToggleHtml_() : "";
  },

  updateStatusBox() {
    this.renderCompactStatus_();
    if (this.updateServerStatusUi_) this.updateServerStatusUi_();
    if (document.getElementById("aion2DebugDrawer") && this.renderDebugDrawer_) {
      this.renderDebugDrawer_();
    }
  },

  showLockedStatus(_result) {
    this.renderCompactStatus_();
  },

  setExternalBlockedState(isBlocked) {
    const panel = document.getElementById("aion2OfficialPanel");
    if (panel) panel.classList.toggle("kinojo-locked", !!isBlocked);

    const mainBtn = document.getElementById("aion2MainToggleBtn");
    const resumeBtn = document.getElementById("aion2ResumeBtn");
    const locked = !!isBlocked;
    if (mainBtn) {
      mainBtn.disabled = locked;
      mainBtn.classList.toggle("locked", locked);
      mainBtn.setAttribute("aria-disabled", locked ? "true" : "false");
    }
    if (resumeBtn) {
      resumeBtn.disabled = locked;
      resumeBtn.setAttribute("aria-disabled", locked ? "true" : "false");
    }
  },

  showCachedNotice() {
    const cached = localStorage.getItem("AION2_NOTICE_CACHE") || "";
    const cachedUrl = localStorage.getItem("AION2_NOTICE_DOWNLOAD_URL") || "";
    const cachedNews = localStorage.getItem("AION2_NEWS_CACHE") || "";
    const cachedAt = Number(localStorage.getItem("AION2_NOTICE_CACHE_TIME") || "0");
    const now = Date.now();

    if ((cached || cachedNews) && cachedAt && now - cachedAt < 10 * 60 * 1000) {
      /*
       * Cached notices are display-only. Do not reuse cached downloadUrl,
       * because a previous version check can leave a stale update button visible.
       * The live remote check below is the only source allowed to show updates.
       */
      this.showNotice(cached, "", false, cachedNews);
      return;
    }

    this.clearNoticeCache();
    this.showNotice("공지 확인 중...", "", false, "");
  },

  normalizeVersionForCompare_(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^v/, "")
      .replace(/_/g, ".")
      .replace(/-/g, ".")
      .replace(/\.c/g, ".")
      .replace(/c(?=\d)/g, "")
      .replace(/[^0-9.]/g, "")
      .split(".")
      .filter(Boolean)
      .map(part => String(Number(part)))
      .join(".");
  },

  compareVersionsForUpdate_(latest, current) {
    const util = window.AION2_UTILS;
    if (util && typeof util.compareVersionsForUpdate === "function") {
      return util.compareVersionsForUpdate(latest, current);
    }
    const toParts = value => this.normalizeVersionForCompare_(value)
      .split(".")
      .filter(Boolean)
      .map(part => Number(part));
    const a = toParts(latest);
    const b = toParts(current);
    const length = Math.max(a.length, b.length, 4);
    for (let i = 0; i < length; i += 1) {
      const left = Number.isFinite(a[i]) ? a[i] : 0;
      const right = Number.isFinite(b[i]) ? b[i] : 0;
      if (left > right) return 1;
      if (left < right) return -1;
    }
    return 0;
  },

  async refreshNoticeFromRemote() {
    try {
      const C = window.AION2_CONFIG;

      const config = await this.getRemoteJsonSafe_(C.CONFIG_JSON_URL);

      const latestVersionRaw = String(config.version || "").trim();
      const latestVersion = this.normalizeVersionForCompare_(latestVersionRaw);
      const downloadUrl = String(config.downloadUrl || "").trim();
      const notice = String(config.notice || "").trim();
      const news = String(config.news || "").trim();
      const currentVersion = this.normalizeVersionForCompare_(C.EXT_VERSION);
      const isNewerVersion = latestVersionRaw && this.compareVersionsForUpdate_(latestVersionRaw, C.EXT_VERSION) > 0;

      if (!latestVersion || !isNewerVersion || latestVersion === currentVersion) {
        localStorage.removeItem("AION2_NOTICE_DOWNLOAD_URL");
        this.hideUpdateDownload();

        if (notice || news) {
          this.showNotice(notice, "", true, news);
        } else {
          this.showNotice("", "", true, "");
        }
        return;
      }

      this.showNotice(`새 버전 ${latestVersionRaw}이 있습니다.`, downloadUrl, true, news);
    } catch (err) {
      console.warn("Kinojo notice refresh failed:", err);
    }
  },

  clearNoticeCache() {
    localStorage.removeItem("AION2_NOTICE_CACHE");
    localStorage.removeItem("AION2_NOTICE_DOWNLOAD_URL");
    localStorage.removeItem("AION2_NEWS_CACHE");
    localStorage.removeItem("AION2_NOTICE_CACHE_TIME");
  },

  showNotice(message, downloadUrl = "", shouldCache = true, news = "") {
    const box = document.getElementById("aion2NoticeBox");
    const inner = document.getElementById("aion2NoticeInner");
    if (!box || !inner) return;

    const noticeText = String(message || "").trim();
    const newsText = String(news || "").trim();

    if (!noticeText && !newsText) {
      box.style.display = "block";
      inner.classList.remove("marquee");
      inner.innerHTML = `
        <div class="kinojoNoticeRow">
          <span class="kinojoNoticeLabel">공지</span>
          <div class="kinojoNewsWrap">
            <div class="kinojoNewsTitle">현재 표시할 공지가 없습니다.</div>
          </div>
        </div>
      `;
      this.hideUpdateDownload();
      if (shouldCache) this.clearNoticeCache();
      return;
    }

    if (shouldCache && noticeText !== "공지 확인 중...") {
      localStorage.setItem("AION2_NOTICE_CACHE", noticeText);
      localStorage.setItem("AION2_NOTICE_DOWNLOAD_URL", downloadUrl || "");
      localStorage.setItem("AION2_NEWS_CACHE", newsText || "");
      localStorage.setItem("AION2_NOTICE_CACHE_TIME", String(Date.now()));
    }

    const slashIndex = newsText.indexOf("/");
    const newsTitle = slashIndex >= 0 ? newsText.slice(0, slashIndex).trim() : newsText;
    const newsBody = slashIndex >= 0 ? newsText.slice(slashIndex + 1).trim() : "";

    box.style.display = "block";
    inner.classList.remove("marquee");

    inner.innerHTML = `
      <div class="kinojoNoticeRow">
        <span class="kinojoNoticeLabel">공지</span>
        <div class="kinojoNoticeMarqueeWrap">
          <div class="kinojoNoticeMarqueeText">
            <span>${this.escapeHtml_(noticeText)}</span>
            <span>${this.escapeHtml_(noticeText)}</span>
          </div>
        </div>
      </div>
      ${newsText ? `
        <div class="kinojoNoticeRow kinojoNewsRow">
          <span class="kinojoNoticeLabel">소식</span>
          <div class="kinojoNewsWrap">
            <div class="kinojoNewsTitle">${this.escapeHtml_(newsTitle)}</div>
            ${newsBody ? `<div class="kinojoNewsBody">${this.escapeHtml_(newsBody)}</div>` : ""}
          </div>
        </div>
      ` : ""}
    `;

    if (downloadUrl) {
      this.showUpdateDownload(noticeText, downloadUrl);
    } else {
      this.hideUpdateDownload();
    }

    setTimeout(() => {
      const wrap = inner.querySelector(".kinojoNoticeMarqueeWrap");
      const text = inner.querySelector(".kinojoNoticeMarqueeText");
      if (wrap && text) text.classList.toggle("marquee", text.scrollWidth > wrap.clientWidth);
    }, 80);
  },

  showUpdateDownload(message, downloadUrl) {
    const box = document.getElementById("aion2UpdateBox");
    const text = document.getElementById("aion2UpdateText");
    const btn = document.getElementById("aion2UpdateDownloadBtn");
    if (!box || !text || !btn) return;

    box.style.display = "block";
    text.textContent = message || "새 버전이 있습니다.";
    btn.onclick = e => {
      e.stopPropagation();
      window.open(downloadUrl, "_blank");
    };
  },

  hideUpdateDownload() {
    const box = document.getElementById("aion2UpdateBox");
    if (box) box.style.display = "none";
  },

  playBeep_(type = "done") {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const pattern = type === "error"
        ? [220, 180, 160]
        : [660, 880];

      pattern.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0.0001, ctx.currentTime + index * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + index * 0.16 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + index * 0.16 + 0.13);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + index * 0.16);
        osc.stop(ctx.currentTime + index * 0.16 + 0.14);
      });

      setTimeout(() => ctx.close(), 900);
    } catch (e) {
      console.warn("Kinojo beep failed:", e);
    }
  },

  notifyDone(message) {
    this.playBeep_("done");
    setTimeout(() => alert(message || "작업이 완료되었습니다."), 80);
  },

  getRunReportCounts_(report) {
    const counts = report && report.counts && typeof report.counts === 'object' ? report.counts : {};
    return {
      total: Number(counts.total ?? report?.total ?? 0),
      lookupDone: Number(counts.lookupDone ?? report?.done ?? 0),
      changed: Number(counts.changed || 0),
      unchanged: Number(counts.unchanged || 0),
      noComparison: Number(counts.noComparison || 0),
      pveUpdated: Number(counts.pveUpdated || 0),
      pvpUpdated: Number(counts.pvpUpdated || 0),
      newCount: Number(counts.new || 0),
      failed: Number(counts.failed ?? report?.failed ?? 0),
      skipped: Number(counts.skipped || 0),
      listSynced: Number(counts.listSynced || 0)
    };
  },

  formatRunDuration_(report) {
    if (report && report.elapsedText) return String(report.elapsedText);
    const seconds = Math.max(0, Number(report && report.elapsedSeconds || 0));
    const minutes = Math.floor(seconds / 60);
    const remain = Math.floor(seconds % 60);
    if (!minutes) return `${remain}초`;
    return `${minutes}분 ${String(remain).padStart(2, '0')}초`;
  },

  formatRunTime_(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  },

  getRunStatusLabel_(status) {
    const key = String(status || 'completed').toLowerCase();
    if (key === 'completed') return '완료';
    if (key === 'failed') return '실패';
    if (key === 'cancelled') return '취소';
    if (key === 'expired') return '만료';
    return key || '확인 필요';
  },

  notifyCompletion(report, handlers = {}) {
    this.playBeep_("done");
    const old = document.getElementById('kinojoCompletionOverlay');
    if (old) old.remove();
    const counts = this.getRunReportCounts_(report || {});
    const label = report && (report.displayLabel || report.completedAt) || '조회 완료';
    const overlay = document.createElement('div');
    overlay.id = 'kinojoCompletionOverlay';
    overlay.className = 'kinojo-completion-overlay';
    overlay.innerHTML = `
      <div class="kinojo-completion-modal kinojo-run-completion-modal">
        <button type="button" class="kinojo-completion-x" data-kinojo-complete-close="1" aria-label="완료창 닫기">×</button>
        <div class="kinojo-completion-icon">✓</div>
        <h3>조회 완료</h3>
        <p><b>${this.escapeHtml_(label)}</b><br>${this.escapeHtml_(report && report.lookupFilterSummary || '조회 조건 확인 완료')}</p>
        <div class="kinojo-completion-stats kinojo-completion-stats-four">
          <span><b>${this.escapeHtml_(String(counts.total))}</b><em>총 대상</em></span>
          <span><b>${this.escapeHtml_(String(counts.changed))}</b><em>변화 있음</em></span>
          <span><b>${this.escapeHtml_(String(counts.unchanged))}</b><em>변화 없음</em></span>
          <span><b>${this.escapeHtml_(String(counts.newCount))}</b><em>신규</em></span>
        </div>
        <div class="kinojo-completion-note">PVE ${counts.pveUpdated}명 · PVP ${counts.pvpUpdated}명 · 실패 ${counts.failed}명 · ${this.escapeHtml_(this.formatRunDuration_(report))}</div>
        <div class="kinojo-completion-actions">
          <button type="button" class="kinojo-completion-secondary" data-kinojo-complete-detail="1">상세 기록 보기</button>
          <button type="button" class="kinojo-completion-ok" data-kinojo-complete-reset="1">닫기 및 초기화</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    const close = () => {
      overlay.remove();
      if (typeof handlers.onClose === 'function') handlers.onClose();
    };
    overlay.querySelectorAll('[data-kinojo-complete-close]').forEach(btn => btn.addEventListener('click', close));

    const resetButton = overlay.querySelector('[data-kinojo-complete-reset]');
    resetButton?.addEventListener('click', async () => {
      if (resetButton.disabled) return;
      const originalText = resetButton.textContent;
      resetButton.disabled = true;
      resetButton.textContent = '초기화 중...';
      try {
        if (typeof handlers.onReset === 'function') await handlers.onReset();
        overlay.remove();
      } catch (error) {
        resetButton.disabled = false;
        resetButton.textContent = originalText;
        const message = '완료 기록 초기화 실패: ' + String(error && error.message || error);
        if (window.AION2_UI && typeof window.AION2_UI.notifyError === 'function') {
          window.AION2_UI.notifyError(message);
        } else {
          alert(message);
        }
      }
    });

    overlay.querySelector('[data-kinojo-complete-detail]')?.addEventListener('click', () => {
      overlay.remove();
      if (typeof handlers.onDetail === 'function') handlers.onDetail();
    });
  },

  closeRunHistory() {
    document.getElementById('kinojoRunHistoryOverlay')?.remove();
    document.getElementById('kinojoRunReportOverlay')?.remove();
  },

  showRunHistoryLoading() {
    this.closeRunHistory();
    const overlay = document.createElement('div');
    overlay.id = 'kinojoRunHistoryOverlay';
    overlay.className = 'kinojo-completion-overlay kinojo-run-history-overlay';
    overlay.innerHTML = `
      <div class="kinojo-completion-modal kinojo-run-history-modal">
        <button type="button" class="kinojo-completion-x" data-kinojo-history-close="1">×</button>
        <h3>조회 기록</h3>
        <div class="kinojo-run-history-loading"><span></span><b>Server Engine 기록을 불러오는 중...</b></div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    overlay.querySelector('[data-kinojo-history-close]')?.addEventListener('click', () => overlay.remove());
  },

  showRunHistory(result) {
    this.closeRunHistory();
    const items = Array.isArray(result && result.items) ? result.items : [];
    const overlay = document.createElement('div');
    overlay.id = 'kinojoRunHistoryOverlay';
    overlay.className = 'kinojo-completion-overlay kinojo-run-history-overlay';
    const listHtml = items.length ? items.map(item => {
      const counts = this.getRunReportCounts_(item);
      const status = String(item.status || 'completed').toLowerCase();
      return `
        <button type="button" class="kinojo-run-history-item" data-kinojo-run-session="${this.escapeHtml_(item.sessionId || '')}">
          <span class="kinojo-run-history-head">
            <b>${this.escapeHtml_(item.displayLabel || item.runDate || '조회 기록')}</b>
            <em class="is-${this.escapeHtml_(status)}">${this.escapeHtml_(this.getRunStatusLabel_(status))}</em>
          </span>
          <span class="kinojo-run-history-meta">${this.escapeHtml_(this.formatRunTime_(item.finishedAt))} · ${this.escapeHtml_(item.requestedBy || '실행자 미확인')} · ${this.escapeHtml_(this.formatRunDuration_(item))}</span>
          <span class="kinojo-run-history-counts">총 ${counts.total} · 변경 ${counts.changed} · 동일 ${counts.unchanged} · PVE ${counts.pveUpdated} · PVP ${counts.pvpUpdated} · 신규 ${counts.newCount}</span>
        </button>
      `;
    }).join('') : `<div class="kinojo-run-history-empty">저장된 조회 기록이 없습니다.</div>`;
    overlay.innerHTML = `
      <div class="kinojo-completion-modal kinojo-run-history-modal">
        <button type="button" class="kinojo-completion-x" data-kinojo-history-close="1">×</button>
        <div class="kinojo-run-history-title"><h3>조회 기록</h3><p>날짜와 회차를 선택하면 상세 결과를 다시 확인할 수 있습니다.</p></div>
        <div class="kinojo-run-history-list">${listHtml}</div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    overlay.querySelector('[data-kinojo-history-close]')?.addEventListener('click', () => overlay.remove());
    overlay.querySelectorAll('[data-kinojo-run-session]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sessionId = btn.getAttribute('data-kinojo-run-session') || '';
        if (sessionId && window.AION2_UPDATER && window.AION2_UPDATER.openRunReportDetail) {
          window.AION2_UPDATER.openRunReportDetail(sessionId);
        }
      });
    });
  },

  setRunHistoryBusy_(sessionId, busy) {
    const targetId = String(sessionId || '');
    const button = Array.from(document.querySelectorAll('[data-kinojo-run-session]'))
      .find(item => String(item.getAttribute('data-kinojo-run-session') || '') === targetId);
    if (!button) return;
    button.disabled = !!busy;
    button.classList.toggle('is-loading', !!busy);
  },

  renderRunReportItems_(items, kind) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return '<div class="kinojo-run-report-empty">해당 캐릭터 없음</div>';
    return `<div class="kinojo-run-report-items">${rows.map(item => {
      const title = `${item.characterName || '-'}${item.serverName ? ` · ${item.serverName}` : ''}`;
      let detail = '';
      if (kind === 'changed') detail = item.changeSummary || '수치 변경';
      else if (kind === 'failed') detail = item.reason || '처리 실패';
      else if (kind === 'skipped') detail = item.reason || '조회 제외';
      else if (kind === 'pve' || kind === 'pvp') detail = `${String(item.gearType || kind).toUpperCase()} 갱신`;
      else if (kind === 'new') detail = `${item.className || '클래스 미확인'} · 신규 등록`;
      else if (kind === 'none') detail = '조회 전·후 수치 동일';
      else detail = '비교 근거 없음';
      return `<div class="kinojo-run-report-item"><b>${this.escapeHtml_(title)}</b><span>${this.escapeHtml_(detail)}</span></div>`;
    }).join('')}</div>`;
  },

  renderRunReportSection_(title, count, items, kind, open) {
    return `
      <details class="kinojo-run-report-section" ${open ? 'open' : ''}>
        <summary><b>${this.escapeHtml_(title)}</b><em>${this.escapeHtml_(String(count || 0))}명</em></summary>
        ${this.renderRunReportItems_(items, kind)}
      </details>
    `;
  },

  showRunReportDetail(report, options = {}) {
    this.closeRunHistory();
    const counts = this.getRunReportCounts_(report || {});
    const details = report && report.details && typeof report.details === 'object' ? report.details : {};
    const overlay = document.createElement('div');
    overlay.id = 'kinojoRunReportOverlay';
    overlay.className = 'kinojo-completion-overlay kinojo-report-overlay';
    overlay.innerHTML = `
      <div class="kinojo-completion-modal kinojo-report-modal kinojo-run-report-modal">
        <button type="button" class="kinojo-completion-x" data-kinojo-report-close="1">×</button>
        <div class="kinojo-run-report-header">
          <h3>${this.escapeHtml_(report && report.displayLabel || '조회 상세 기록')}</h3>
          <p>${this.escapeHtml_(this.formatRunTime_(report && report.finishedAt || report && report.completedAt))} · ${this.escapeHtml_(report && report.requestedBy || '실행자 미확인')} · ${this.escapeHtml_(this.formatRunDuration_(report))}</p>
        </div>
        <div class="kinojo-run-report-summary">
          <span><b>${counts.total}</b><em>총 대상</em></span>
          <span><b>${counts.lookupDone}</b><em>조회 완료</em></span>
          <span><b>${counts.changed}</b><em>변화 있음</em></span>
          <span><b>${counts.unchanged}</b><em>변화 없음</em></span>
          <span><b>${counts.pveUpdated}</b><em>PVE 갱신</em></span>
          <span><b>${counts.pvpUpdated}</b><em>PVP 갱신</em></span>
          <span><b>${counts.newCount}</b><em>신규</em></span>
          <span><b>${counts.failed}</b><em>실패</em></span>
        </div>
        <div class="kinojo-run-report-meta">
          <span>조회 조건</span><b>${this.escapeHtml_(report && report.lookupFilterSummary || '전체 조회')}</b>
          <span>list 반영</span><b>${counts.listSynced}건</b>
          <span>관리자 제외</span><b>${counts.skipped}명</b>
          <span>확장 버전</span><b>${this.escapeHtml_(report && (report.extensionVersion || report.version) || '-')}</b>
        </div>
        <div class="kinojo-run-report-sections">
          ${this.renderRunReportSection_('전투력·아이템레벨 변화 있음', counts.changed, details.changedItems, 'changed', true)}
          ${this.renderRunReportSection_('조회 전·후 변화 없음', counts.unchanged, details.unchangedItems, 'none', false)}
          ${this.renderRunReportSection_('PVE 장비 갱신', counts.pveUpdated, details.pveUpdatedItems, 'pve', counts.pveUpdated > 0)}
          ${this.renderRunReportSection_('PVP 장비 갱신', counts.pvpUpdated, details.pvpUpdatedItems, 'pvp', counts.pvpUpdated > 0)}
          ${this.renderRunReportSection_('새로 추가된 캐릭터', counts.newCount, details.newItems, 'new', counts.newCount > 0)}
          ${this.renderRunReportSection_('최종 실패', counts.failed, details.failedItems, 'failed', counts.failed > 0)}
          ${this.renderRunReportSection_('조회 제외', counts.skipped, details.skippedItems, 'skipped', false)}
          ${this.renderRunReportSection_('비교 근거 없음', counts.noComparison, details.noComparisonItems, 'unknown', false)}
        </div>
        <div class="kinojo-completion-actions">
          ${typeof options.onBack === 'function' ? '<button type="button" class="kinojo-completion-secondary" data-kinojo-report-back="1">목록으로</button>' : ''}
          <button type="button" class="kinojo-completion-ok" data-kinojo-report-close="1">닫기</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    const close = () => {
      overlay.remove();
      if (typeof options.onClose === 'function') options.onClose();
    };
    overlay.querySelectorAll('[data-kinojo-report-close]').forEach(btn => btn.addEventListener('click', close));
    overlay.querySelector('[data-kinojo-report-back]')?.addEventListener('click', () => {
      overlay.remove();
      options.onBack();
    });
  },

  showCompletionReport(report) {
    this.showRunReportDetail(report || {});
  },

  notifyError(message, options = {}) {
    this.playBeep_("error");
    const old = document.getElementById('kinojoErrorOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'kinojoErrorOverlay';
    overlay.className = 'kinojo-completion-overlay kinojo-error-overlay';
    overlay.innerHTML = `
      <div class="kinojo-completion-modal kinojo-error-modal" role="dialog" aria-modal="true" aria-label="조회 오류">
        <button type="button" class="kinojo-completion-x" data-kinojo-error-close="1">×</button>
        <div class="kinojo-completion-icon kinojo-error-icon">!</div>
        <h3>조회 오류</h3>
        <p>${this.escapeHtml_(message || "작업 중 오류가 발생했습니다.").replace(/\n/g, '<br>')}</p>
        <div class="kinojo-completion-note">진행 상태와 오류 기록은 그대로 보존됩니다.</div>
        <div class="kinojo-completion-actions kinojo-error-actions">
          ${options && options.allowPostprocessRetry ? '<button type="button" class="kinojo-completion-ok kinojo-postprocess-retry" data-kinojo-error-retry="1">후처리만 재시도</button>' : ''}
          <button type="button" class="kinojo-completion-secondary" data-kinojo-error-copy="1">전체 내역 복사</button>
          <button type="button" class="kinojo-completion-secondary" data-kinojo-error-detail="1">상세보기</button>
          <button type="button" class="kinojo-completion-secondary" data-kinojo-error-close="1">확인</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-kinojo-error-close]').forEach(btn => btn.addEventListener('click', close));
    overlay.querySelector('[data-kinojo-error-copy]')?.addEventListener('click', async () => {
      await this.copyCurrentRunDetails();
    });
    overlay.querySelector('[data-kinojo-error-detail]')?.addEventListener('click', () => {
      close();
      if (this.ensureDebugDrawerAttached_) this.ensureDebugDrawerAttached_();
      if (this.toggleDebugDrawer) this.toggleDebugDrawer(true);
    });
    overlay.querySelector('[data-kinojo-error-retry]')?.addEventListener('click', async event => {
      const button = event && event.currentTarget;
      if (button && button.disabled) return;
      if (button) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        button.textContent = '후처리 진행 중';
      }
      close();
      if (window.AION2_UPDATER && typeof window.AION2_UPDATER.retryServerPostprocess_ === 'function') {
        await window.AION2_UPDATER.retryServerPostprocess_();
      }
    });
  },

  pushTaskLog(message) {
    this.pushLog(message);
  },

  pushLog(message) {
    const K = window.AION2_CONFIG.KEYS;
    const now = new Date();
    const time = now.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const logs = JSON.parse(localStorage.getItem(K.LOG) || "[]");
    logs.unshift({ time, message });
    localStorage.setItem(K.LOG, JSON.stringify(logs.slice(0, 10)));
    this.renderLogs();
  },


  getDefaultTaskSteps_() {
    return [
      { key: "character", label: "캐릭터 정보 확인", state: "pending" },
      { key: "history", label: "기존 성장 기록 비교", state: "pending" },
      { key: "pve", label: "PVE 장비 상태 분석", state: "pending" },
      { key: "pvp", label: "PVP 장비 상태 분석", state: "pending" },
      { key: "review", label: "키노조AI 리뷰 생성", state: "pending" },
      { key: "save", label: "조회 결과 저장", state: "pending" }
    ];
  },

  resetTaskStatus(characterName = "") {
    this.currentTaskCharacter = characterName || "";
    this.currentTaskDone = false;
    this.currentTaskSteps = this.getDefaultTaskSteps_();
    this.renderLogs();
  },

  setTaskCharacter(characterName, done = false) {
    this.currentTaskCharacter = characterName || "";
    this.currentTaskDone = done === true;
    if (!this.currentTaskSteps) {
      this.currentTaskSteps = this.getDefaultTaskSteps_();
    }
    this.renderLogs();
  },

  updateTaskStep(key, state = "done", label) {
    if (!this.currentTaskSteps) {
      this.currentTaskSteps = this.getDefaultTaskSteps_();
    }

    this.currentTaskSteps = this.currentTaskSteps.map(step => {
      if (step.key !== key) return step;
      return {
        ...step,
        state,
        label: label || step.label
      };
    });

    this.renderLogs();
  },

  setTaskProgress(characterName, activeKey) {
    this.resetTaskStatus(characterName);

    const order = ["character", "history", "pve", "pvp", "review", "save"];
    const activeIndex = order.indexOf(activeKey);

    this.currentTaskSteps = this.currentTaskSteps.map((step, index) => {
      if (activeIndex < 0) return step;
      if (index < activeIndex) return { ...step, state: "done" };
      if (index === activeIndex) return { ...step, state: "active" };
      return { ...step, state: "pending" };
    });

    this.renderLogs();
  },

  completeTaskStatus(characterName) {
    if (characterName) this.currentTaskCharacter = characterName;
    this.currentTaskDone = true;
    this.currentTaskSteps = this.getDefaultTaskSteps_().map(step => ({
      ...step,
      state: "done"
    }));
    this.renderLogs();
  },

  failTaskStatus(message) {
    if (!this.currentTaskSteps) {
      this.currentTaskSteps = this.getDefaultTaskSteps_();
    }

    const index = this.currentTaskSteps.findIndex(step => step.state === "active" || step.state === "pending");
    const failIndex = index >= 0 ? index : this.currentTaskSteps.length - 1;

    this.currentTaskSteps = this.currentTaskSteps.map((step, i) => {
      if (i === failIndex) {
        return {
          ...step,
          state: "error",
          label: message || step.label
        };
      }
      return step;
    });

    this.renderLogs();
  },
  renderTaskStatus_(logBox) {
    const characterName = this.currentTaskCharacter || "대기중";
    const done = this.currentTaskDone === true;
    const steps = this.currentTaskSteps || this.getDefaultTaskSteps_();
    const safeName = this.escapeHtml_(characterName);

    const stepState = key => {
      const found = steps.find(step => step.key === key);
      return done ? "done" : (found?.state || "pending");
    };

    const characterState = stepState("character");
    const historyState = stepState("history");
    const reviewState = stepState("review");
    const saveState = stepState("save");

    const rows = [
      { state: characterState === "pending" ? "active" : "done", text: `${safeName} 조회 시작` },
      { state: characterState, text: `전투력 ${characterState === "done" ? "조회 완료" : "조회 중"}` },
      { state: historyState, text: `성장 기록 ${historyState === "done" ? "비교 완료" : "비교 중"}` },
      { state: saveState, text: `시트 ${saveState === "done" ? "기록 완료" : "기록 중"}` },
      { state: reviewState, text: `리뷰 ${reviewState === "done" ? "작성 완료" : "작성 중"}` }
    ];

    const activeIndex = rows.findIndex(row => row.state === "active" || row.state === "error" || row.state === "pending");
    let visibleRows;
    if (done) {
      visibleRows = rows.filter(row => row.state === "done").slice(-3);
    } else if (activeIndex >= 0) {
      const start = Math.max(0, activeIndex - 2);
      visibleRows = rows.slice(start, activeIndex + 1);
      if (visibleRows.length < 3) {
        visibleRows = visibleRows.concat(rows.slice(activeIndex + 1, activeIndex + 1 + (3 - visibleRows.length)));
      }
    } else {
      visibleRows = rows.slice(0, 3);
    }

    logBox.style.display = "block";
    logBox.innerHTML = `
      <div class="kinojoTaskList">
        ${visibleRows.map(row => {
          const state = row.state || "pending";
          const mark =
            state === "done" ? "✓" :
            state === "active" ? "▶" :
            state === "error" ? "!" :
            "□";
          return `
            <div class="kinojoTaskLine ${state}">
              <span class="kinojoTaskMark">${mark}</span>
              <span class="kinojoTaskText">${row.text}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  },

  renderLogs() {
    const legacyLogBox = document.getElementById("aion2OfficialLogBox");
    if (legacyLogBox) legacyLogBox.remove();
    // 진행 상태와 로그는 조회 상세창에서만 표시한다.
    if (document.getElementById("aion2DebugDrawer") && this.renderDebugDrawer_) {
      this.renderDebugDrawer_();
    }
  },

  showResumeConfirmModal(stopReason) {
    return new Promise(resolve => {
      const old = document.getElementById("aion2StartConfirmOverlay");
      if (old) old.remove();

      const overlay = document.createElement("div");
      overlay.id = "aion2StartConfirmOverlay";

      const reasonText = stopReason?.reason || "UNKNOWN";
      const currentName =
        stopReason?.current?.originalName ||
        stopReason?.current?.name ||
        "확인 불가";

      const progressText =
        `${stopReason?.done || "0"}/${stopReason?.total || "0"}`;

      const box = document.createElement("div");
      box.className = "aion2-modal kinojo-sidecar-window";

      box.innerHTML = `
        <div style="font-size:14px;font-weight:900;color:#2563eb;margin-bottom:8px;">RESUME READY</div>
        <div style="font-size:22px;font-weight:900;margin-bottom:8px;">이어서 조회 준비 완료</div>
        <div style="font-size:14px;line-height:1.55;color:#64748b;margin-bottom:18px;">
          중단 사유: <b>${this.escapeHtml_(reasonText)}</b><br>
          진행 상태: <b>${this.escapeHtml_(progressText)}</b><br>
          마지막 대상: <b>${this.escapeHtml_(currentName)}</b><br><br>
          이어서 조회하려면 <b>F</b> 키를 누르거나<br>
          아래 버튼을 클릭하세요.
          <div class="kinojo-start-caution">
            ※ 브라우저 창을 전부 닫으면 조회가 중단됩니다.<br>
            ※ 조회 시작 후 <b>F</b>를 누르면 현재 창이 최소화됩니다.
          </div>
        </div>
        <button id="aion2ConfirmStartBtn" class="aion2-modal-primary">▶ 이어서 조회하기 [F]</button>
        <button id="aion2CancelStartBtn" class="aion2-modal-secondary">취소</button>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const placeBox = () => this.placeSidecarWindow_ ? this.placeSidecarWindow_(box) : null;
      window.addEventListener("resize", placeBox);
      requestAnimationFrame(() => { placeBox(); requestAnimationFrame(() => box.classList.add("is-visible")); });

      const cleanup = value => {
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", placeBox);
        overlay.remove();
        resolve(value);
      };

      const onKey = e => {
        if (e.key.toLowerCase() === "f") cleanup(true);
        if (e.key === "Escape") cleanup(false);
      };

      document.addEventListener("keydown", onKey);

      box.querySelector("#aion2ConfirmStartBtn").onclick = () => cleanup(true);
      box.querySelector("#aion2CancelStartBtn").onclick = () => cleanup(false);
    });
  },

  showStartConfirmModal() {
    return new Promise(resolve => {
      const old = document.getElementById("aion2StartConfirmOverlay");
      if (old) old.remove();

      const overlay = document.createElement("div");
      overlay.id = "aion2StartConfirmOverlay";

      const box = document.createElement("div");
      box.className = "aion2-modal kinojo-sidecar-window";

      box.innerHTML = `
        <div style="font-size:14px;font-weight:900;color:#2563eb;margin-bottom:8px;">PASSWORD OK</div>
        <div style="font-size:22px;font-weight:900;margin-bottom:8px;">조회 시작 준비 완료</div>
        <div style="font-size:14px;line-height:1.55;color:#64748b;margin-bottom:18px;">
          조회를 시작하려면 <b>F</b> 키를 누르거나<br>
          아래 버튼을 클릭하세요.
          <div class="kinojo-start-caution">
            ※ 브라우저 창을 전부 닫으면 조회가 중단됩니다.<br>
            ※ 조회 시작 후 <b>F</b>를 누르면 현재 창이 최소화됩니다.
          </div>
        </div>
        <button id="aion2ConfirmStartBtn" class="aion2-modal-primary">▶ 조회 시작하기 [F]</button>
        <button id="aion2CancelStartBtn" class="aion2-modal-secondary">취소</button>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const placeBox = () => this.placeSidecarWindow_ ? this.placeSidecarWindow_(box) : null;
      window.addEventListener("resize", placeBox);
      requestAnimationFrame(() => { placeBox(); requestAnimationFrame(() => box.classList.add("is-visible")); });

      const cleanup = value => {
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", placeBox);
        overlay.remove();
        resolve(value);
      };

      const onKey = e => {
        if (e.key.toLowerCase() === "f") cleanup(true);
        if (e.key === "Escape") cleanup(false);
      };

      document.addEventListener("keydown", onKey);
      box.querySelector("#aion2ConfirmStartBtn").onclick = () => cleanup(true);
      box.querySelector("#aion2CancelStartBtn").onclick = () => cleanup(false);
    });
  },

  normalizePassKeyText_(value) {
    return Array.from(String(value || '').replace(/[a-z]/g, ch => ch.toUpperCase()).replace(/\s+/g, '')).slice(0, 12).join('');
  },

  renderPassKeyOtp_(root, value) {
    const cells = Array.from(root?.querySelectorAll('.kinojo-code-otp-cell') || []);
    const chars = Array.from(this.normalizePassKeyText_(value));
    cells.forEach((cell, index) => {
      cell.textContent = chars[index] || '';
      cell.classList.toggle('filled', !!chars[index]);
    });
    root?.classList.toggle('is-filled', chars.length >= cells.length);
  },

  showPassKeyPromptModal(title = "키노조 PASS KEY를 입력하세요.") {
    return new Promise(resolve => {
      const old = document.getElementById("aion2PassKeyPromptOverlay");
      if (old) old.remove();

      const overlay = document.createElement("div");
      overlay.id = "aion2PassKeyPromptOverlay";
      const activeTheme = (window.AION2_UI_THEME && window.AION2_UI_THEME.get)
        ? window.AION2_UI_THEME.get()
        : (document.documentElement.dataset.kinojoUpdaterTheme || "classic");
      overlay.classList.add(activeTheme === "modern" ? "kinojo-auth-theme-modern" : "kinojo-auth-theme-classic");
      overlay.classList.add(activeTheme === "modern" ? "kinojo-theme-modern" : "kinojo-theme-classic");
      document.documentElement.dataset.kinojoUpdaterTheme = activeTheme === "modern" ? "modern" : "classic";

      const box = document.createElement("div");
      box.className = `aion2-modal kinojo-auth-modal kinojo-passkey-modal kinojo-auth-modal-${activeTheme === "modern" ? "modern" : "classic"}`;
      box.innerHTML = `
        <div class="kinojo-auth-kicker">KINOJO UPDATER</div>
        <div class="kinojo-auth-title">PASS KEY</div>
        <div class="kinojo-auth-desc">${this.escapeHtml_(title)}<br>웹 로그인과 같은 방식으로 입력합니다.</div>
        <input id="aion2PassKeyPromptInput" class="kinojo-login-input kinojo-login-text-input" type="text" autocomplete="one-time-code" inputmode="text" spellcheck="false" placeholder="PASS KEY를 입력하세요" aria-label="PASS KEY 입력" />
        <div class="kinojo-code-otp kinojo-login-otp kinojo-login-otp-display" id="aion2PassKeyOtp" aria-label="입력된 PASS KEY 미리보기">
          <span class="kinojo-code-otp-cell"></span>
          <span class="kinojo-code-otp-cell"></span>
          <span class="kinojo-code-otp-cell"></span>
          <span class="kinojo-code-otp-cell"></span>
          <span class="kinojo-code-otp-cell"></span>
          <span class="kinojo-code-otp-cell"></span>
        </div>
        <div class="kinojo-account-help">한글 PASS KEY와 영문/숫자 6자리 코드를 모두 지원합니다.</div>
        <button id="aion2PassKeyConfirmBtn" class="aion2-modal-primary"><span class="kinojo-login-btn-text">로그인</span></button>
        <button id="aion2PassKeyCancelBtn" class="aion2-modal-secondary">취소</button>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const input = box.querySelector("#aion2PassKeyPromptInput");
      const otp = box.querySelector("#aion2PassKeyOtp");
      let composing = false;

      const sync = force => {
        if (composing && !force) return;
        const normalized = this.normalizePassKeyText_(input.value || '');
        if (input.value !== normalized) input.value = normalized;
        this.renderPassKeyOtp_(otp, normalized);
      };

      const placeBox = () => {
        const panel = document.getElementById("aion2OfficialPanel");
        const rect = panel ? panel.getBoundingClientRect() : null;
        const boxRect = box.getBoundingClientRect();
        const gap = 10;

        let left = rect ? rect.left - boxRect.width - gap : window.innerWidth - boxRect.width - 24;
        let top = rect ? rect.bottom - boxRect.height : window.innerHeight - boxRect.height - 24;

        if (left < 12 && rect) left = Math.min(rect.right + gap, window.innerWidth - boxRect.width - 12);
        left = Math.min(Math.max(12, left), window.innerWidth - boxRect.width - 12);
        top = Math.min(Math.max(12, top), window.innerHeight - boxRect.height - 12);

        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
      };

      let settled = false;
      const cleanup = value => {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", placeBox);
        box.classList.remove("is-visible");
        box.classList.add("is-hiding");
        setTimeout(() => {
          overlay.remove();
          resolve(value);
        }, 260);
      };

      const submit = () => {
        sync(true);
        const value = this.normalizePassKeyText_(input.value || '');
        cleanup(value || '');
      };
      const onKey = e => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") cleanup(null);
      };

      input.addEventListener('compositionstart', () => { composing = true; otp.classList.add('is-composing'); });
      input.addEventListener('compositionend', () => { composing = false; otp.classList.remove('is-composing'); sync(true); });
      input.addEventListener('input', e => { if (!e.isComposing) sync(false); });
      document.addEventListener("keydown", onKey);
      window.addEventListener("resize", placeBox);
      box.querySelector("#aion2PassKeyConfirmBtn").onclick = submit;
      box.querySelector("#aion2PassKeyCancelBtn").onclick = () => cleanup(null);

      this.renderPassKeyOtp_(otp, '');
      requestAnimationFrame(() => {
        placeBox();
        requestAnimationFrame(() => box.classList.add("is-visible"));
      });
      setTimeout(() => input.focus(), 160);
    });
  },

  showPasswordPromptModal(title = "조회 비밀번호를 입력하세요.") {
    return new Promise(resolve => {
      const old = document.getElementById("aion2PasswordPromptOverlay");
      if (old) old.remove();

      const overlay = document.createElement("div");
      overlay.id = "aion2PasswordPromptOverlay";
      const activeTheme = (window.AION2_UI_THEME && window.AION2_UI_THEME.get)
        ? window.AION2_UI_THEME.get()
        : (document.documentElement.dataset.kinojoUpdaterTheme || "classic");
      overlay.classList.add(activeTheme === "modern" ? "kinojo-auth-theme-modern" : "kinojo-auth-theme-classic");
      overlay.classList.add(activeTheme === "modern" ? "kinojo-theme-modern" : "kinojo-theme-classic");
      document.documentElement.dataset.kinojoUpdaterTheme = activeTheme === "modern" ? "modern" : "classic";

      const box = document.createElement("div");
      box.className = `aion2-modal kinojo-auth-modal kinojo-auth-modal-${activeTheme === "modern" ? "modern" : "classic"}`;
      box.innerHTML = `
        <div class="kinojo-auth-kicker">KINOJO AUTH</div>
        <div class="kinojo-auth-title">비밀번호 확인</div>
        <div class="kinojo-auth-desc">${this.escapeHtml_(title)}</div>
        <div class="kinojo-password-field">
          <input id="aion2PasswordPromptInput" type="password" autocomplete="current-password" />
          <button id="aion2PasswordEyeBtn" class="kinojo-password-eye" type="button" aria-label="비밀번호 보기" aria-pressed="false">
            <span class="kinojo-eye-open" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 5C6.7 5 3 12 3 12s3.7 7 9 7 9-7 9-7-3.7-7-9-7Zm0 11.2A4.2 4.2 0 1 1 12 7.8a4.2 4.2 0 0 1 0 8.4Zm0-1.9A2.3 2.3 0 1 0 12 9.7a2.3 2.3 0 0 0 0 4.6Z"/></svg>
            </span>
            <span class="kinojo-eye-closed" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="m4.7 3.3 16 16-1.4 1.4-3-3A9.1 9.1 0 0 1 12 19c-5.3 0-9-7-9-7a17.3 17.3 0 0 1 3.1-4.1L3.3 4.7l1.4-1.4Zm4.1 6.9A4.2 4.2 0 0 0 14 15.4l-1.7-1.7a2.3 2.3 0 0 1-2.9-2.9l-.6-.6ZM12 5c5.3 0 9 7 9 7a17 17 0 0 1-2.4 3.4l-2.1-2.1a4.2 4.2 0 0 0-5.8-5.8L8.8 5.6A9 9 0 0 1 12 5Z"/></svg>
            </span>
          </button>
        </div>
        <button id="aion2PasswordConfirmBtn" class="aion2-modal-primary">확인</button>
        <button id="aion2PasswordCancelBtn" class="aion2-modal-secondary">취소</button>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const input = box.querySelector("#aion2PasswordPromptInput");
      const eyeBtn = box.querySelector("#aion2PasswordEyeBtn");

      const placeBox = () => {
        const panel = document.getElementById("aion2OfficialPanel");
        const rect = panel ? panel.getBoundingClientRect() : null;
        const boxRect = box.getBoundingClientRect();
        const gap = 10;

        let left = rect ? rect.left - boxRect.width - gap : window.innerWidth - boxRect.width - 24;
        let top = rect ? rect.bottom - boxRect.height : window.innerHeight - boxRect.height - 24;

        if (left < 12 && rect) left = Math.min(rect.right + gap, window.innerWidth - boxRect.width - 12);
        left = Math.min(Math.max(12, left), window.innerWidth - boxRect.width - 12);
        top = Math.min(Math.max(12, top), window.innerHeight - boxRect.height - 12);

        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
      };

      let settled = false;
      const cleanup = value => {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("resize", placeBox);
        box.classList.remove("is-visible");
        box.classList.add("is-hiding");
        setTimeout(() => {
          overlay.remove();
          resolve(value);
        }, 260);
      };

      const submit = () => cleanup(input.value);
      const onKey = e => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") cleanup(null);
      };

      eyeBtn.onclick = () => {
        const visible = input.type === "text";
        input.type = visible ? "password" : "text";
        eyeBtn.classList.toggle("is-visible", !visible);
        eyeBtn.setAttribute("aria-pressed", String(!visible));
        eyeBtn.setAttribute("aria-label", visible ? "비밀번호 보기" : "비밀번호 숨기기");
        input.focus();
      };

      document.addEventListener("keydown", onKey);
      window.addEventListener("resize", placeBox);
      box.querySelector("#aion2PasswordConfirmBtn").onclick = submit;
      box.querySelector("#aion2PasswordCancelBtn").onclick = () => cleanup(null);

      requestAnimationFrame(() => {
        placeBox();
        requestAnimationFrame(() => box.classList.add("is-visible"));
      });
      setTimeout(() => input.focus(), 160);
    });
  },


  buildCurrentRunCopyText_() {
    const K = window.AION2_CONFIG && window.AION2_CONFIG.KEYS || {};
    const history = this.getUpdaterPhaseHistory_ ? this.getUpdaterPhaseHistory_() : {};
    const diagnostics = this.readJsonLocal_('KINOJO_CURRENT_RUN_DIAGNOSTICS', {});
    const serverReport = this.readJsonLocal_('KINOJO_LOOKUP_SESSION_DETAIL_REPORT', diagnostics && diagnostics.serverReport || {});
    const debug = this.getLookupDebug_ ? this.getLookupDebug_() : {};
    const completion = this.readJsonLocal_('KINOJO_LAST_COMPLETION_REPORT', {});
    const lines = [
      'KINOJO 이번 조회 전체 내역',
      `생성시각: ${new Date().toISOString()}`,
      `확장버전: ${window.AION2_CONFIG && window.AION2_CONFIG.EXT_VERSION || '-'}`,
      `세션ID: ${localStorage.getItem('KINOJO_ACTIVE_SESSION_ID') || localStorage.getItem('KINOJO_SESSION_ID') || diagnostics.sessionId || '-'}`,
      `진행: ${localStorage.getItem(K.DONE) || 0} / ${localStorage.getItem(K.TOTAL) || 0}`,
      '',
      '[조회 조건 / LIST 대조]',
      JSON.stringify(debug || {}, null, 2),
      '',
      '[3 STEP 진행 상태]',
      JSON.stringify(history || {}, null, 2),
      '',
      '[Extension 상세 이벤트]',
      JSON.stringify(diagnostics && diagnostics.events || [], null, 2),
      '',
      '[Server Target → Payload → Master → LIST 상세]',
      JSON.stringify(serverReport || {}, null, 2),
      '',
      '[완료 리포트]',
      JSON.stringify(completion || {}, null, 2)
    ];
    return lines.join('\n');
  },

  async copyCurrentRunDetails() {
    if (window.AION2_UPDATER && window.AION2_UPDATER.captureSessionDetailReport_) {
      await window.AION2_UPDATER.captureSessionDetailReport_('manual_copy');
    }
    const text = this.buildCurrentRunCopyText_();
    try {
      const copied = await this.writeClipboardText_(text);
      if (!copied) throw new Error('copy command returned false');
      this.pushTaskLog('📋 이번 조회 전체 내역을 클립보드에 복사했습니다.');
    } catch (error) {
      this.pushTaskLog(`⚠️ 자동 복사 실패 · 직접 복사 창을 열었습니다. (${String(error && error.message || error)})`);
      this.showLookupFailureCopyFallback_(text, '조회 전체 내역 직접 복사');
    }
  },

  getLookupFailureDiagnostics_() {
    const history = this.getUpdaterPhaseHistory_ ? this.getUpdaterPhaseHistory_() : {};
    const phase = history.character_lookup || {};
    const issues = phase.details && Array.isArray(phase.details.issues) ? phase.details.issues : [];
    return issues
      .filter(row => String(row.type || '').toLowerCase() === 'failed')
      .map(row => row.diagnostic || {
        character: row.character || '',
        code: row.code || 'UNKNOWN',
        message: row.message || ''
      });
  },

  async writeClipboardText_(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    area.style.top = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    let copied = false;
    try { copied = document.execCommand('copy') === true; }
    finally { area.remove(); }
    return copied;
  },

  showLookupFailureCopyFallback_(text, title = '실패 내역 직접 복사') {
    const old = document.getElementById('kinojoLookupFailureCopyModal');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'kinojoLookupFailureCopyModal';
    overlay.className = 'kinojo-copy-fallback-overlay';
    overlay.innerHTML = `
      <div class="kinojo-copy-fallback-card" role="dialog" aria-modal="true" aria-label="${this.escapeHtml_(title)}">
        <strong>자동 복사에 실패했습니다.</strong>
        <p>아래 내용을 길게 누르거나 Ctrl+A 후 직접 복사하세요.</p>
        <textarea readonly></textarea>
        <button type="button">닫기</button>
      </div>`;
    const area = overlay.querySelector('textarea');
    const close = overlay.querySelector('button');
    area.value = text;
    close.addEventListener('click', () => overlay.remove(), { once:true });
    overlay.addEventListener('click', event => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      area.focus();
      area.select();
    });
  },

  async copyLookupFailures() {
    const rows = this.getLookupFailureDiagnostics_();
    if (!rows.length) {
      this.pushTaskLog('복사할 최종 실패 내역이 없습니다.');
      return;
    }
    const text = rows.map((row, index) => [
      `[${index + 1}] ${row.character || '캐릭터 미확인'}`,
      `서버: ${row.serverName || '-'} / ${row.serverId || '-'}`,
      `listRow: ${row.listRow || '-'}`,
      `sessionId: ${row.sessionId || '-'}`,
      `code: ${row.code || 'UNKNOWN'}`,
      `message: ${row.message || '-'}`,
      `profileHtml: ${Number(row.profileHtmlLength || 0)} chars`,
      `pageHtml: ${Number(row.pageHtmlLength || 0)} chars`,
      `visibleText: ${Number(row.visibleTextLength || 0)} chars`,
      `retryable: ${row.retryable === true ? 'true' : 'false'}`,
      `time: ${row.occurredAt || '-'}`
    ].join('\n')).join('\n\n');
    try {
      const copied = await this.writeClipboardText_(text);
      if (!copied) throw new Error('copy command returned false');
      this.pushTaskLog(`📋 최종 실패 ${rows.length}건을 클립보드에 복사했습니다.`);
    } catch (error) {
      this.pushTaskLog(`⚠️ 자동 복사 실패 · 직접 복사 창을 열었습니다. (${String(error && error.message || error)})`);
      this.showLookupFailureCopyFallback_(text);
    }
  },

};
