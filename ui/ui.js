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
    if (document.getElementById("aion2OfficialPanel")) return;

    const panel = document.createElement("div");
    panel.id = "aion2OfficialPanel";

    /*
     * Initial position is handled by CSS.
     * - First load: right/bottom anchored, clean bottom-right placement.
     * - After drag: ui.js switches to left/top and stores the position.
     */
    // Initial position is handled by CSS. Drag restore switches to left/top only when needed.

    const dragHandle = this.createDragHandle_();
    const noticeBox = this.createNoticeBox_();
    const updateBox = this.createUpdateBox_();
    const statusBox = this.createStatusBox_();
    const logBox = this.createLogBox_();
    const shell = this.createControlShell_();
    const minimizeBtn = this.createMinimizeButton_();
    const bugBtn = this.createBugReportButton_();
    const quickLinks = this.createQuickLinkBox_();
    const versionText = this.createVersionText_();
    const tooltip = this.createTooltip_();

    panel.append(
      dragHandle,
      noticeBox,
      updateBox,
      statusBox,
      logBox,
      shell,
      minimizeBtn,
      bugBtn,
      quickLinks,
      versionText
    );

    document.body.appendChild(panel);

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

    this.showCachedNotice();
    this.refreshNoticeFromRemote();

    this.updateButtonState();
    this.updateStatusBox();
    this.keepPanelInViewport(document.getElementById("aion2OfficialPanel"));
    this.renderLogs();

    this.setExternalBlockedState(
      localStorage.getItem("KINOJO_BLOCKED_BY_OTHER") === "true"
    );

    this.syncLockStateFromServer();
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
    statusBox.className = "aion2-card";
    return statusBox;
  },

  createLogBox_() {
    const logBox = document.createElement("div");
    logBox.id = "aion2OfficialLogBox";
    logBox.className = "aion2-card";
    return logBox;
  },

  createTooltip_() {
    const tooltip = document.createElement("div");
    tooltip.id = "aion2Tooltip";
    return tooltip;
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

  createMinimizeButton_() {
    const minimizeBtn = document.createElement("button");
    minimizeBtn.id = "aion2MinimizeWindowBtn";
    minimizeBtn.innerHTML = `
      <span class="kinojoKeycap">F</span>
      <span>창 최소화</span>
    `;
    minimizeBtn.onclick = () => {
      const K = window.AION2_CONFIG.KEYS;
      if (localStorage.getItem(K.RUNNING) !== "true") return;
      this.minimizeCurrentWindow();
    };
    minimizeBtn.dataset.tip = "조회 시작 후 사용 가능합니다";
    this.attachTooltip(minimizeBtn);
    return minimizeBtn;
  },


  createQuickLinkBox_() {
    const box = document.createElement("div");
    box.id = "aion2QuickLinkBox";
    box.className = "kinojo-link-row";

    const patchBtn = document.createElement("button");
    patchBtn.id = "aion2PatchNoteBtn";
    patchBtn.type = "button";
    patchBtn.className = "kinojo-link-btn";
    patchBtn.textContent = "📜 패치노트";
    patchBtn.dataset.tip = "최신 릴리즈/패치노트 보기";
    patchBtn.onclick = () => {
      const url = (window.AION2_CONFIG && window.AION2_CONFIG.RELEASES_URL)
        || "https://github.com/losnah513/aion2-updater-config/releases/latest";
      window.open(url, "_blank");
    };

    const hallBtn = document.createElement("button");
    hallBtn.id = "aion2HallOfFameBtn";
    hallBtn.type = "button";
    hallBtn.className = "kinojo-link-btn";
    hallBtn.textContent = "📘 KINOJO INFO";
    hallBtn.dataset.tip = "KINOJO INFO 열기";
    hallBtn.onclick = () => {
      const url = (window.AION2_CONFIG && window.AION2_CONFIG.HALL_OF_FAME_URL)
        || "https://bit.ly/kinojo-index";
      window.open(url, "_blank");
    };

    box.append(patchBtn, hallBtn);
    this.attachTooltip(patchBtn);
    this.attachTooltip(hallBtn);
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
    const saved = this.readSavedPanelPosition_();

    if (!saved) {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "24px";
      panel.style.bottom = "24px";
      panel.style.transformOrigin = "bottom right";
      requestAnimationFrame(() => this.keepPanelInViewport(panel));
      return;
    }

    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transformOrigin = "top left";

    const safe = this.getSafePanelBounds_(panel);
    this.setPanelPosition_(
      panel,
      this.clamp_(saved.left, safe.margin, safe.maxLeft),
      this.clamp_(saved.top, safe.margin, safe.maxTop)
    );

    requestAnimationFrame(() => this.keepPanelInViewport(panel));
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

  enablePanelDrag(panel, handle) {
    if (!panel || !handle) return;

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const enterLeftTopMode = () => {
      const rect = panel.getBoundingClientRect();
      const safe = this.getSafePanelBounds_(panel);

      startLeft = this.clamp_(rect.left, safe.margin, safe.maxLeft);
      startTop = this.clamp_(rect.top, safe.margin, safe.maxTop);

      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${Math.round(startLeft)}px`;
      panel.style.top = `${Math.round(startTop)}px`;
      panel.style.transformOrigin = "top left";
      panel.classList.add("kinojo-lefttop-mode");
    };

    const move = e => {
      if (!dragging) return;
      moved = true;

      const safe = this.getSafePanelBounds_(panel);
      const left = this.clamp_(startLeft + e.clientX - startX, safe.margin, safe.maxLeft);
      const top = this.clamp_(startTop + e.clientY - startY, safe.margin, safe.maxTop);

      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      panel.style.transformOrigin = "top left";
    };

    const up = () => {
      if (!dragging) return;

      dragging = false;
      panel.classList.remove("kinojo-dragging");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);

      this.keepPanelInViewport(panel);
      this.savePanelPosition_(panel);

      setTimeout(() => {
        moved = false;
      }, 0);
    };

    handle.addEventListener("mousedown", e => {
      if (e.target && e.target.id === "aion2PanelCloseBtn") return;
      if (e.button !== 0) return;

      e.preventDefault();

      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;

      enterLeftTopMode();
      panel.classList.add("kinojo-dragging");

      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });

    handle.addEventListener("click", e => {
      if (moved) e.preventDefault();
    });
  },

  getSafePanelBounds_(panel) {
    const margin = 16;
    const bottomMargin = 16;
    const rect = panel.getBoundingClientRect();
    const visualWidth = Math.ceil(rect.width || panel.offsetWidth || 300);
    const visualHeight = Math.ceil(rect.height || panel.offsetHeight || 420);

    return {
      margin,
      maxLeft: Math.max(margin, window.innerWidth - visualWidth - margin),
      maxTop: Math.max(margin, window.innerHeight - visualHeight - bottomMargin)
    };
  },


  keepPanelInViewport(panel) {
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const safe = this.getSafePanelBounds_(panel);

    let left = rect.left;
    let top = rect.top;

    if (rect.right > window.innerWidth - safe.margin) left = safe.maxLeft;
    if (rect.bottom > window.innerHeight - 18) top = safe.maxTop;
    if (rect.left < safe.margin) left = safe.margin;
    if (rect.top < safe.margin) top = safe.margin;

    if (
      Math.round(left) !== Math.round(rect.left) ||
      Math.round(top) !== Math.round(rect.top)
    ) {
      this.setPanelPosition_(panel, left, top);
      this.savePanelPosition_(panel);
    }
  },


  bindViewportSafeGuard_(panel) {
    if (!panel || panel.dataset.kinojoSafeGuard === "1") return;
    panel.dataset.kinojoSafeGuard = "1";

    window.addEventListener("resize", () => {
      this.keepPanelInViewport(panel);
    });

    window.addEventListener("orientationchange", () => {
      setTimeout(() => this.keepPanelInViewport(panel), 250);
    });
  },

  clamp_(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },

  attachCloseButton(panel) {
    const closeBtn = panel.querySelector("#aion2PanelCloseBtn");
    if (!closeBtn) return;

    closeBtn.onclick = e => {
      e.stopPropagation();
      panel.style.display = "none";
    };
  },


  /**
   * Chrome extension runtime 사용 가능 여부 확인
   * ------------------------------------------------------------
   * 확장프로그램 재로드 직후, 서비스워커 비활성화, 일반 웹페이지 실행 등
   * chrome.runtime이 일시적으로 없을 수 있습니다.
   * 이때 sendMessage를 바로 호출하면 UI 전체 오류가 발생하므로 방어합니다.
   */
  hasChromeRuntime_() {
    return !!(
      window.chrome &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function"
    );
  },


  /**
   * 원격 JSON 안전 조회
   * ------------------------------------------------------------
   * 기본은 background.js의 chrome.runtime.sendMessage 경유를 사용합니다.
   * chrome.runtime이 없는 경우에는 공지/config 정도는 직접 fetch로 대체합니다.
   */
  async getRemoteJsonSafe_(url) {
    const cacheBustedUrl =
      url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();

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

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    if (!text.trim()) {
      throw new Error("빈 응답입니다.");
    }

    return JSON.parse(text);
  },

  async minimizeCurrentWindow() {
    try {
      if (!this.hasChromeRuntime_()) {
        console.warn("Kinojo minimize skipped: chrome.runtime unavailable");
        return;
      }

      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "MINIMIZE_WINDOW" },
          response => {
            if (!response || !response.ok) {
              return reject(new Error(response?.error || "창 최소화 실패"));
            }
            resolve(response);
          }
        );
      });
    } catch (err) {
      alert(String(err.message || err));
    }
  },

  registerGlobalHotkeys() {
    document.addEventListener("keydown", e => {
      const K = window.AION2_CONFIG.KEYS;

      if (
        e.key &&
        e.key.toLowerCase() === "f" &&
        localStorage.getItem(K.RUNNING) === "true" &&
        !document.getElementById("aion2StartConfirmOverlay")
      ) {
        e.preventDefault();
        this.minimizeCurrentWindow();
      }
    });
  },

  async syncLockStateFromServer() {
    try {
      const K = window.AION2_CONFIG.KEYS;
      const webAppUrl = localStorage.getItem(K.WEBAPP);

      if (!webAppUrl) return;
      if (!/^https:\/\/script\.google\.com\/macros\/s\//.test(webAppUrl)) {
        localStorage.removeItem(K.WEBAPP);
        console.warn("Kinojo lock sync skipped: invalid webAppUrl", webAppUrl);
        return;
      }

      // Apps Script status 조회는 background 통신이 필요할 수 있으므로
      // chrome.runtime이 없으면 조용히 건너뜁니다.
      if (!this.hasChromeRuntime_()) {
        console.warn("Kinojo lock sync skipped: chrome.runtime unavailable");
        return;
      }

      const status = await window.AION2_HTTP.getJson(`${webAppUrl}?action=status&t=${Date.now()}`);

      if (status && status.ok && status.running === false) {
        localStorage.removeItem("KINOJO_BLOCKED_BY_OTHER");
        localStorage.removeItem(K.RUNNING);
        localStorage.removeItem(K.CURRENT);
        localStorage.removeItem(K.STORAGE);
        localStorage.removeItem(K.TOTAL);
        localStorage.removeItem(K.DONE);

        this.setExternalBlockedState(false);
        this.updateButtonState();
        this.updateStatusBox();
      }
    } catch (err) {
      console.warn("Kinojo lock sync failed:", err);
    }
  },

  updateButtonState() {
    const K = window.AION2_CONFIG.KEYS;
    const running = localStorage.getItem(K.RUNNING) === "true";
    const autoRecover = localStorage.getItem(K.AUTO_RECOVER) === "true";

    const mainBtn = document.getElementById("aion2MainToggleBtn");
    const resumeBtn = document.getElementById("aion2ResumeBtn");
    const resetBtn = document.getElementById("aion2ResetBtn");
    const autoBtn = document.getElementById("aion2AutoBtn");
    const minimizeBtn = document.getElementById("aion2MinimizeWindowBtn");

    if (!mainBtn || !resumeBtn || !resetBtn || !autoBtn) return;

    const mainIcon = mainBtn.querySelector(".kinojo-main-icon");

    const mainLabel = mainBtn.querySelector(".kinojo-main-label");

    if (running) {
      if (mainIcon) mainIcon.innerHTML = window.AION2_ICONS.pause;
      if (mainLabel) mainLabel.textContent = "일시정지";
      mainBtn.classList.add("running");
      mainBtn.dataset.tip = "조회 일시정지";
    } else {
      if (mainIcon) mainIcon.innerHTML = window.AION2_ICONS.play;
      if (mainLabel) mainLabel.textContent = "조회 시작";
      mainBtn.classList.remove("running");
      mainBtn.dataset.tip = "새 조회 시작";
    }

    resumeBtn.dataset.tip = "이어서 시작";
    resetBtn.dataset.tip = "초기화";
    autoBtn.dataset.tip = autoRecover ? "자동복구 ON" : "자동복구 OFF";

    if (minimizeBtn) {
      minimizeBtn.style.display = "flex";
      minimizeBtn.classList.toggle("active", running);
      minimizeBtn.disabled = false;
      minimizeBtn.setAttribute("aria-disabled", running ? "false" : "true");
      minimizeBtn.dataset.tip = running ? "조회 중 창을 최소화합니다" : "조회 시작 후 사용 가능합니다";
    }

    resumeBtn.style.opacity = running ? "0.55" : "1";
    resetBtn.style.opacity = running ? "0.55" : "1";
    autoBtn.classList.toggle("off", !autoRecover);

    this.updateStatusBox();
  },

  formatRemainingTime_(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds || 0)));
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = seconds % 60;
    if (minutes <= 0) return `${remainSeconds}초`;
    return `${minutes}분 ${String(remainSeconds).padStart(2, "0")}초`;
  },
  updateStatusBox() {
    const K = window.AION2_CONFIG.KEYS;
    const box = document.getElementById("aion2StatusBox");
    if (!box) return;

    const total = Number(localStorage.getItem(K.TOTAL) || "0");
    const done = Number(localStorage.getItem(K.DONE) || "0");
    const running = localStorage.getItem(K.RUNNING) === "true";
    const current = JSON.parse(localStorage.getItem(K.CURRENT) || "null");
    const lastDone = localStorage.getItem(K.LAST_DONE);

    if (running && total > 0) {
      const currentNo = Math.min(done + 1, total);
      const percentValue = total > 0 ? (done / total * 100) : 0;
      const percent = Math.min(100, Math.round(percentValue * 10) / 10);
      const name = current?.originalName || current?.name || "대기 중";

      const startedAt = Number(localStorage.getItem("KINOJO_STARTED_AT") || "0");
      let remainText = "계산 중";
      if (startedAt > 0 && done > 0) {
        const elapsedSec = (Date.now() - startedAt) / 1000;
        const avgSec = elapsedSec / Math.max(1, done);
        const remainSec = avgSec * Math.max(0, total - done);
        remainText = `약 ${this.formatRemainingTime_(remainSec)}`;
      }

      box.innerHTML = `
        <div class="label">AUTO CHECK RUNNING</div>
        <div class="kinojo-status-grid">
          <span>현재 조회</span><strong>${window.AION2_UTILS.escapeHtml(name)}</strong>
          <span>진행도</span><strong>${done} / ${total}</strong>
          <span>남은시간</span><strong>${remainText}</strong>
        </div>
        <div class="aion2-progress-track">
          <div class="aion2-progress-fill" style="width:${Math.min(100, percentValue)}%"></div>
        </div>
        <div class="kinojo-progress-percent">${percent}%</div>
      `;
      return;
    }

    if (lastDone) {
      box.innerHTML = `
        <div class="label">READY</div>
        <div class="title">조회 대기 상태</div>
        <div class="sub">마지막 완료 ${window.AION2_UTILS.escapeHtml(lastDone)}</div>
      `;
      return;
    }

    box.innerHTML = `
      <div class="label">READY</div>
      <div class="title">조회 대기 상태</div>
      <div class="sub">가운데 버튼을 눌러 시작하세요</div>
    `;
  },

  showLockedStatus(result) {
    const status = result?.status || result || {};
    const count = Number(status.count || result?.count || 0);
    const total = Number(status.total || result?.total || 0);
    const sid = status.sessionId || result?.sessionId || "";

    const box = document.getElementById("aion2StatusBox");
    if (!box) return;

    box.innerHTML = `
      <div class="label">LOCKED</div>
      <div class="title">다른 사용자가 조회 중입니다</div>
      <div class="sub">${sid ? sid + " / " : ""}${total ? count + "/" + total : "상태 확인 중"} · 5초마다 자동 확인</div>
    `;
  },

  setExternalBlockedState(isBlocked) {
    const panel = document.getElementById("aion2OfficialPanel");
    if (panel) panel.classList.toggle("kinojo-locked", !!isBlocked);
  },

  showCachedNotice() {
    const cached = localStorage.getItem("AION2_NOTICE_CACHE") || "";
    const cachedUrl = localStorage.getItem("AION2_NOTICE_DOWNLOAD_URL") || "";
    const cachedNews = localStorage.getItem("AION2_NEWS_CACHE") || "";
    const cachedAt = Number(localStorage.getItem("AION2_NOTICE_CACHE_TIME") || "0");
    const now = Date.now();

    if ((cached || cachedNews) && cachedAt && now - cachedAt < 10 * 60 * 1000) {
      this.showNotice(cached, cachedUrl, false, cachedNews);
      return;
    }

    this.clearNoticeCache();
    this.showNotice("공지 확인 중...", "", false, "");
  },

  async refreshNoticeFromRemote() {
    try {
      const C = window.AION2_CONFIG;

      const config = await this.getRemoteJsonSafe_(C.CONFIG_JSON_URL);

      const latestVersionRaw = String(config.version || "").trim();
      const latestVersion = latestVersionRaw.toLowerCase();
      const downloadUrl = String(config.downloadUrl || "").trim();
      const notice = String(config.notice || "").trim();
      const news = String(config.news || "").trim();
      const currentVersion = String(C.EXT_VERSION || "").trim().toLowerCase();

      if (!latestVersion || latestVersion === currentVersion) {
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
      box.style.display = "none";
      inner.innerHTML = "";
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
            <span>${window.AION2_UTILS.escapeHtml(noticeText)}</span>
            <span>${window.AION2_UTILS.escapeHtml(noticeText)}</span>
          </div>
        </div>
      </div>
      ${newsText ? `
        <div class="kinojoNoticeRow kinojoNewsRow">
          <span class="kinojoNoticeLabel">소식</span>
          <div class="kinojoNewsWrap">
            <div class="kinojoNewsTitle">${window.AION2_UTILS.escapeHtml(newsTitle)}</div>
            ${newsBody ? `<div class="kinojoNewsBody">${window.AION2_UTILS.escapeHtml(newsBody)}</div>` : ""}
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

  notifyError(message) {
    this.playBeep_("error");
    setTimeout(() => alert(message || "작업 중 오류가 발생했습니다."), 80);
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
      { key: "save", label: "growth_history 저장", state: "pending" }
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
    const safeName = window.AION2_UTILS.escapeHtml(characterName);

    const stepState = key => {
      const found = steps.find(step => step.key === key);
      return done ? "done" : (found?.state || "pending");
    };

    const characterState = stepState("character");
    const historyState = stepState("history");
    const reviewState = stepState("review");
    const saveState = stepState("save");

    const rows = [
      { state: characterState === "pending" ? "active" : "done", text: `${safeName} 조회를 시작합니다.` },
      { state: characterState, text: `${safeName} 전투력을 ${characterState === "done" ? "조회했습니다." : "조회중입니다."}` },
      { state: historyState, text: `${safeName} 기존 성장 기록을 ${historyState === "done" ? "비교했습니다." : "비교중입니다."}` },
      { state: saveState, text: `${safeName} 전투력을 시트에 ${saveState === "done" ? "적었습니다." : "적고 있습니다."}` },
      { state: reviewState, text: `${safeName} 리뷰를 ${reviewState === "done" ? "작성했습니다." : "작성중입니다."}` }
    ];

    logBox.style.display = "block";
    logBox.innerHTML = `
      <div class="kinojoTaskList">
        ${rows.map(row => {
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
  },  renderLogs() {
    const K = window.AION2_CONFIG.KEYS;
    const logBox = document.getElementById("aion2OfficialLogBox");
    if (!logBox) return;

    const running = localStorage.getItem(K.RUNNING) === "true";

    /*
     * 1.b2.01b
     * ------------------------------------------------------------
     * 기존 로그 리스트 UI 대신 캐릭터별 6단계 체크리스트형 작업 상태창을 우선 표시합니다.
     * 오른쪽 시간 표시는 제거하고, 현재 캐릭터와 단계별 완료 여부만 보여줍니다.
     */
    if (running || this.currentTaskCharacter) {
      this.renderTaskStatus_(logBox);
      return;
    }

    const logs = JSON.parse(localStorage.getItem(K.LOG) || "[]");

    const filteredLogs = logs.filter(log =>
      !String(log?.message || "").startsWith("상세 확인:")
    );

    if (!filteredLogs.length) {
      logBox.style.display = "none";
      return;
    }

    logBox.style.display = "block";
    logBox.innerHTML = "";

    filteredLogs.slice(0, 4).forEach(log => {
      const row = document.createElement("div");
      row.className = "aion2-log-line";
      row.textContent = String(log.message || "");
      logBox.appendChild(row);
    });
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
      box.className = "aion2-modal";

      box.innerHTML = `
        <div style="font-size:14px;font-weight:900;color:#2563eb;margin-bottom:8px;">RESUME READY</div>
        <div style="font-size:22px;font-weight:900;margin-bottom:8px;">이어서 조회 준비 완료</div>
        <div style="font-size:14px;line-height:1.55;color:#64748b;margin-bottom:18px;">
          중단 사유: <b>${window.AION2_UTILS.escapeHtml(reasonText)}</b><br>
          진행 상태: <b>${window.AION2_UTILS.escapeHtml(progressText)}</b><br>
          마지막 대상: <b>${window.AION2_UTILS.escapeHtml(currentName)}</b><br><br>
          이어서 조회하려면 <b>F</b> 키를 누르거나<br>
          아래 버튼을 클릭하세요.
        </div>
        <button id="aion2ConfirmStartBtn" class="aion2-modal-primary">▶ 이어서 조회하기 [F]</button>
        <button id="aion2CancelStartBtn" class="aion2-modal-secondary">취소</button>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const cleanup = value => {
        document.removeEventListener("keydown", onKey);
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
      box.className = "aion2-modal";

      box.innerHTML = `
        <div style="font-size:14px;font-weight:900;color:#2563eb;margin-bottom:8px;">PASSWORD OK</div>
        <div style="font-size:22px;font-weight:900;margin-bottom:8px;">조회 시작 준비 완료</div>
        <div style="font-size:14px;line-height:1.55;color:#64748b;margin-bottom:18px;">
          조회를 시작하려면 <b>F</b> 키를 누르거나<br>
          아래 버튼을 클릭하세요.
        </div>
        <button id="aion2ConfirmStartBtn" class="aion2-modal-primary">▶ 조회 시작하기 [F]</button>
        <button id="aion2CancelStartBtn" class="aion2-modal-secondary">취소</button>
      `;

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const cleanup = value => {
        document.removeEventListener("keydown", onKey);
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
  }
};








