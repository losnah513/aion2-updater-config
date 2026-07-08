window.AION2_CONFIG = {
  CONFIG_JSON_URL: "https://kinojo.info/config.json",
  EXT_VERSION: "1.c2.04",
  BUILD_DATE: "260607",
  CLIENT_ROLE: "unknown",
  DEFAULT_SERVER_ID: 2002,
  WATCHDOG_LIMIT_MS: 60 * 1000,
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
    "인드": 2020
  },
  KEYS: {
    STORAGE: "AION2_OFFICIAL_QUEUE",
    CURRENT: "AION2_OFFICIAL_CURRENT",
    WEBAPP: "AION2_OFFICIAL_WEBAPP",
    RUNNING: "AION2_OFFICIAL_RUNNING",
    LOG: "AION2_OFFICIAL_LOGS",
    LAST_PROGRESS: "AION2_OFFICIAL_LAST_PROGRESS",
    AUTO_RECOVER: "AION2_OFFICIAL_AUTO_RECOVER",
    TOTAL: "AION2_OFFICIAL_TOTAL",
    DONE: "AION2_OFFICIAL_DONE",
    LAST_DONE: "AION2_OFFICIAL_LAST_DONE",
    AUTH_OK: "AION2_AUTH_OK",
    AUTH_FAIL: "AION2_AUTH_FAIL_COUNT",
    AUTH_LOCK: "AION2_AUTH_LOCKED",
    CLIENT_ROLE: "AION2_CLIENT_ROLE"
  },
  RELEASES_URL: "https://github.com/losnah513/aion2-updater-config/releases/latest",
  HALL_OF_FAME_URL: "https://kinojo.info/hof/",
  MAIN_SERVER_ID: "2002"
};

window.AION2_HTTP = {
  getJson(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "HTTP_GET_JSON", url }, response => {
        if (!response || !response.ok) return reject(new Error(response?.error || "GET 요청 실패"));
        resolve(response.data);
      });
    });
  },
  postJson(url, data) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "HTTP_POST_JSON", url, data }, response => {
        if (!response || !response.ok) return reject(new Error(response?.error || "POST 요청 실패"));
        resolve(response.data);
      });
    });
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
  goToIndexPage() {
    const indexUrl = "https://aion2.plaync.com/ko-kr/characters/index";
    if (location.href !== indexUrl) location.href = indexUrl;
  }
};

window.AION2_REMOTE = {
  async load() {
    const C = window.AION2_CONFIG;
    const config = await window.AION2_HTTP.getJson(C.CONFIG_JSON_URL);

    const enabled = config.enabled === true || String(config.enabled).toUpperCase() === "TRUE";
    const rawWebAppUrl = config.webAppUrl || config.appsScriptUrl || config.sheetSyncWebAppUrl || (config.bridge && config.bridge.webAppUrl) || "";
    const webAppUrl = String(rawWebAppUrl || "").trim();
    const notice = String(config.notice || "").trim();
    const latestVersion = String(config.version || "").trim();
    const downloadUrl = String(config.downloadUrl || "").trim();
    const testMode = config.testMode === true || String(config.testMode).toUpperCase() === "TRUE";
    const passwordHash = String(config.passwordHash || "").trim();

    if (latestVersion && latestVersion !== C.EXT_VERSION) {
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
    // 20260706_05: Supabase 전환 이후에도 list 시트 실제 반영에는 Apps Script Bridge URL이 필요하다.
    // URL이 없으면 기존 정상 저장값을 유지하고, URL이 있을 때만 검증/저장한다.
    if (webAppUrl) {
      if (!/^https:\/\/script\.google\.com\/macros\/s\//.test(webAppUrl)) {
        localStorage.removeItem(C.KEYS.WEBAPP);
        throw new Error("config.json의 webAppUrl이 Apps Script 배포 URL이 아닙니다.");
      }
      localStorage.setItem(C.KEYS.WEBAPP, webAppUrl);
    }
    return { ...config, webAppUrl, notice, latestVersion, downloadUrl, testMode, passwordHash };
  }
};