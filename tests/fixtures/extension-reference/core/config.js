window.AION2_CONFIG = {
  CONFIG_JSON_URL: "https://kinojo.info/config.json",
  EXT_VERSION: "1.3.1.47",
  BUILD_DATE: "260731",
  CLIENT_ROLE: "GUEST",
  DEFAULT_SERVER_ID: 2002,
  WATCHDOG_LIMIT_MS: 60 * 1000,
  STALE_RUN_LIMIT_MS: 12 * 60 * 60 * 1000,
  HTTP_TIMEOUT_MS: 90 * 1000,
  HTTP_CONFIG_TIMEOUT_MS: 30 * 1000,
  HTTP_STATUS_TIMEOUT_MS: 20 * 1000,
  HTTP_SUBMIT_TIMEOUT_MS: 90 * 1000,
  HTTP_LOG_TIMEOUT_MS: 15 * 1000,
  MAX_PASSWORD_FAILS: 5,
  SERVER_SHORT_MAP: {
    "시엘": 1001, "네자": 1002, "바이": 1003, "카이": 1004, "유스": 1005,
    "아리": 1006, "프레": 1007, "메스": 1008, "히타": 1009, "나니": 1010,
    "타하": 1011, "루터": 1012, "페르": 1013, "다미": 1014, "카사": 1015,
    "바카": 1016, "챈가": 1017, "코치": 1018, "이슈": 1019, "티아": 1020,
    "포에": 1021, "이스": 2001, "지켈": 2002, "트리": 2003, "루미": 2004,
    "마르": 2005, "아스": 2006, "에레": 2007, "브리": 2008, "네몬": 2009,
    "하달": 2010, "루드": 2011, "울고": 2012, "무닌": 2013, "오다": 2014,
    "젠카": 2015, "크로": 2016, "콰이": 2017, "바바": 2018, "파프": 2019,
    "인드": 2020, "이스할겐": 2021
  },
  KEYS: {
    STORAGE: "AION2_OFFICIAL_QUEUE",
    CURRENT: "AION2_OFFICIAL_CURRENT",
    RUNNING: "AION2_OFFICIAL_RUNNING",
    LOG: "AION2_OFFICIAL_LOGS",
    LAST_PROGRESS: "AION2_OFFICIAL_LAST_PROGRESS",
    AUTO_RECOVER: "AION2_OFFICIAL_AUTO_RECOVER",
    TOTAL: "AION2_OFFICIAL_TOTAL",
    DONE: "AION2_OFFICIAL_DONE",
    LAST_DONE: "AION2_OFFICIAL_LAST_DONE",
    RETRY_QUEUE: "AION2_OFFICIAL_RETRY_QUEUE",
    RETRY_ROUND: "AION2_OFFICIAL_RETRY_ROUND",
    PREP_STATUS: "AION2_OFFICIAL_PREP_STATUS",
    VERIFY_ROUND: "AION2_OFFICIAL_VERIFY_ROUND",
    VERIFY_RESULT: "AION2_OFFICIAL_VERIFY_RESULT",
    ITEM_TIMINGS: "AION2_OFFICIAL_ITEM_TIMINGS",
    LIST_DEBUG: "AION2_OFFICIAL_LIST_DEBUG",
    AUTH_OK: "AION2_AUTH_OK",
    AUTH_FAIL: "AION2_AUTH_FAIL_COUNT",
    AUTH_LOCK: "AION2_AUTH_LOCKED",
    AUTH_TIME: "AION2_AUTH_TIME",
    CLIENT_ROLE: "AION2_CLIENT_ROLE",
    POSTPROCESS_GUARD: "KINOJO_POSTPROCESS_SINGLE_FLIGHT_GUARD"
  },
  RELEASES_URL: "https://kinojo.info/",
  HALL_OF_FAME_URL: "https://kinojo.info/",
  ARCANA_URL: "https://kinojo.info/arcana/",
  MAIN_SERVER_ID: "2002",
  SUPABASE: {
    enabled: true,
    url: "https://josvoltpktvwysrasffq.supabase.co",
    publishableKey: "sb_publishable__v26JGbKRFKGbU0SseU5Iw_qwIoHUAC",
    lockTable: "crawl_locks",
    memberTable: "member_codes"
  }
};

window.AION2_HTTP = {
  requestViaBackground_(message, fallbackError, options = {}) {
    const timeoutMs = Number(options.timeoutMs || message?.timeoutMs || window.AION2_CONFIG.HTTP_TIMEOUT_MS || 90000);

    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };

      const timer = setTimeout(() => {
        finish(reject, new Error(`${fallbackError} · 응답 시간 초과`));
      }, timeoutMs);

      try {
        chrome.runtime.sendMessage(message, response => {
          const runtimeError = chrome.runtime && chrome.runtime.lastError;
          if (runtimeError) {
            finish(reject, new Error(runtimeError.message || fallbackError));
            return;
          }

          if (!response || !response.ok) {
            finish(reject, new Error(response?.error || fallbackError));
            return;
          }

          finish(resolve, response.data);
        });
      } catch (err) {
        finish(reject, new Error(String(err.message || err || fallbackError)));
      }
    });
  },

  getJson(url, options = {}) {
    return this.requestViaBackground_({ type: "HTTP_GET_JSON", url, timeoutMs: options.timeoutMs }, "GET 요청 실패", options);
  },

  postJson(url, data, options = {}) {
    return this.requestViaBackground_({ type: "HTTP_POST_JSON", url, data, timeoutMs: options.timeoutMs }, "POST 요청 실패", options);
  }
};

window.AION2_UTILS = {
  escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  },
  formatNow() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    return `${yy}/${mm}/${dd} ${hh}:${mi}`;
  },
  touchProgress() {
    localStorage.setItem(window.AION2_CONFIG.KEYS.LAST_PROGRESS, String(Date.now()));
  },

  normalizeVersionForCompare(str) {
    return String(str || "")
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

  compareVersionsForUpdate(latest, current) {
    const toParts = value => this.normalizeVersionForCompare(value)
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
  goToIndexPage() {
    const indexUrl = "https://aion2.plaync.com/ko-kr/characters/index";
    if (location.href !== indexUrl) location.href = indexUrl;
  }
};

window.AION2_REMOTE = {
  readCachedConfig_() {
    try {
      return JSON.parse(localStorage.getItem("AION2_REMOTE_CONFIG_CACHE") || "null") || null;
    } catch (e) {
      return null;
    }
  },

  cacheConfig_(config) {
    try {
      localStorage.setItem("AION2_REMOTE_CONFIG_CACHE", JSON.stringify({
        ...config,
        cachedAt: Date.now()
      }));
    } catch (e) {}
  },

  async load() {
    const C = window.AION2_CONFIG;
    let config = null;
    let remoteError = null;

    try {
      config = await window.AION2_HTTP.getJson(C.CONFIG_JSON_URL, {
        timeoutMs: Number(C.HTTP_CONFIG_TIMEOUT_MS || 30000)
      });
      this.cacheConfig_(config);
    } catch (err) {
      remoteError = err;
      config = this.readCachedConfig_();
      if (config && window.AION2_UI) {
        window.AION2_UI.pushLog("원격 설정 응답 지연 · 마지막 정상 설정 사용");
      }
    }

    if (!config) {
      throw new Error("원격 설정을 불러오지 못했습니다: " + String(remoteError && remoteError.message || remoteError || "unknown"));
    }

    const enabled = config.enabled === true || String(config.enabled).toUpperCase() === "TRUE";
    const notice = String(config.notice || "").trim();
    const latestVersion = String(config.version || "").trim();
    const downloadUrl = String(config.downloadUrl || "").trim();
    const testMode = config.testMode === true || String(config.testMode).toUpperCase() === "TRUE";
    const passwordHash = String(config.passwordHash || "").trim();

    if (latestVersion && window.AION2_UTILS.compareVersionsForUpdate(latestVersion, C.EXT_VERSION) > 0) {
      window.AION2_UI.showNotice(
        downloadUrl
          ? `새 버전 ${latestVersion}이 있습니다.`
          : `새 버전 ${latestVersion}이 있습니다.`,
        downloadUrl
      );
      if (downloadUrl) window.AION2_UI.pushLog("새 버전 확인됨");
    } else {
      window.AION2_UI.showNotice(notice);
    }

    if (!enabled) throw new Error(notice || "현재 자동조회 기능이 비활성화되어 있습니다.");

    if (config.supabase && typeof config.supabase === 'object') {
      C.SUPABASE = Object.assign({}, C.SUPABASE || {}, config.supabase);
    }

    const supabaseEnabled = !!(C.SUPABASE && (C.SUPABASE.enabled === true || String(C.SUPABASE.enabled).toLowerCase() === 'true'));

    if (!supabaseEnabled) {
      throw new Error("config.json의 Supabase Server Engine 설정이 비활성화되어 있습니다.");
    }

    // 1.3.1.45: 구형 Extension 직접 Apps Script 계약을 영구 정리합니다.
    localStorage.removeItem("AION2_OFFICIAL_WEBAPP");
    localStorage.removeItem("AION2_OFFICIAL_SHEET_SYNC_WEBAPP");
    localStorage.removeItem("kinojo_admin_webapp_url");

    return { ...config, notice, latestVersion, downloadUrl, testMode, passwordHash, supabaseEnabled, remoteError: remoteError ? String(remoteError.message || remoteError) : "" };
  }
};
