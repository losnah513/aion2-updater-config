/**
 * Kinojo UI Theme / Size Controller
 * ------------------------------------------------------------
 * Purpose:
 * - Keeps Classic / Modern visual modes separated from updater logic.
 * - Stores the user's selected updater UI theme and size in localStorage.
 * - Applies only CSS variables/classes/data attributes.
 */
window.AION2_UI_THEME = {
  KEY: "KINOJO_UPDATER_UI_THEME",
  SIZE_KEY: "KINOJO_UPDATER_UI_SIZE",
  BUILD_KEY: "KINOJO_UPDATER_UI_THEME_BUILD",
  BUILD_ID: "1.3.1.00-20260618-01",

  CLASSIC: "classic",
  MODERN: "modern",

  DEFAULT_SIZE: "normal",
  SIZES: {
    small: 0.70,
    normal: 0.85,
    large: 1.00
  },

  ensureDefault_() {
    const appliedBuild = localStorage.getItem(this.BUILD_KEY);
    const currentTheme = localStorage.getItem(this.KEY);
    const currentSize = localStorage.getItem(this.SIZE_KEY);

    if (currentTheme !== this.CLASSIC && currentTheme !== this.MODERN) {
      localStorage.setItem(this.KEY, this.CLASSIC);
    }

    if (!Object.prototype.hasOwnProperty.call(this.SIZES, currentSize)) {
      localStorage.setItem(this.SIZE_KEY, this.DEFAULT_SIZE);
    }

    /*
     * 1.3.1.00
     * ------------------------------------------------------------
     * Size defaults must not inherit stale values from earlier test builds.
     * On first load of this build, reset size to normal(85%) once.
     * User selections made after that are preserved.
     */
    if (appliedBuild !== this.BUILD_ID) {
      localStorage.setItem(this.SIZE_KEY, this.DEFAULT_SIZE);
      localStorage.setItem(this.BUILD_KEY, this.BUILD_ID);
    }
  },

  get() {
    this.ensureDefault_();
    const value = localStorage.getItem(this.KEY);
    return value === this.MODERN ? this.MODERN : this.CLASSIC;
  },

  getSize() {
    this.ensureDefault_();
    const value = localStorage.getItem(this.SIZE_KEY);
    return Object.prototype.hasOwnProperty.call(this.SIZES, value) ? value : this.DEFAULT_SIZE;
  },

  getScale(size = this.getSize()) {
    return this.SIZES[size] || this.SIZES[this.DEFAULT_SIZE];
  },

  set(theme, options = {}) {
    const next = theme === this.MODERN ? this.MODERN : this.CLASSIC;
    localStorage.setItem(this.KEY, next);
    this.apply(next);
    if (options.notify !== false) this.showSwitchToast(next);
    return next;
  },

  setSize(size, options = {}) {
    const next = Object.prototype.hasOwnProperty.call(this.SIZES, size) ? size : this.DEFAULT_SIZE;
    localStorage.setItem(this.SIZE_KEY, next);
    this.applySize(next);
    if (options.notify !== false) this.showSizeToast(next);
    return next;
  },

  toggle() {
    return this.set(this.get() === this.MODERN ? this.CLASSIC : this.MODERN);
  },

  apply(theme = this.get()) {
    const next = theme === this.MODERN ? this.MODERN : this.CLASSIC;
    const panel = document.getElementById("aion2OfficialPanel");
    if (panel) {
      panel.dataset.kinojoTheme = next;
      panel.classList.toggle("kinojo-theme-modern", next === this.MODERN);
      panel.classList.toggle("kinojo-theme-classic", next === this.CLASSIC);
    }
    document.documentElement.dataset.kinojoUpdaterTheme = next;

    const classicBtn = document.getElementById("aion2ThemeClassicBtn");
    const modernBtn = document.getElementById("aion2ThemeModernBtn");

    if (classicBtn) {
      const active = next === this.CLASSIC;
      classicBtn.classList.toggle("is-active", active);
      classicBtn.disabled = active;
      classicBtn.setAttribute("aria-pressed", String(active));
      classicBtn.dataset.tip = active ? "현재 Classic 스타일" : "Classic 스타일 적용";
    }

    if (modernBtn) {
      const active = next === this.MODERN;
      modernBtn.classList.toggle("is-active", active);
      modernBtn.disabled = active;
      modernBtn.setAttribute("aria-pressed", String(active));
      modernBtn.dataset.tip = active ? "현재 Modern 스타일" : "Modern 스타일 적용";
    }

    this.applySize();
  },

  applySize(size = this.getSize()) {
    const next = Object.prototype.hasOwnProperty.call(this.SIZES, size) ? size : this.DEFAULT_SIZE;
    const scale = this.getScale(next);
    const panel = document.getElementById("aion2OfficialPanel");

    document.documentElement.style.setProperty("--kinojo-scale", String(scale));
    document.documentElement.dataset.kinojoUpdaterSize = next;

    if (panel) {
      panel.style.setProperty("--kinojo-scale", String(scale));
      panel.dataset.kinojoSize = next;
      panel.classList.toggle("kinojo-size-small", next === "small");
      panel.classList.toggle("kinojo-size-normal", next === "normal");
      panel.classList.toggle("kinojo-size-large", next === "large");
      if (window.AION2_UI && typeof window.AION2_UI.keepPanelInViewport === "function") {
        requestAnimationFrame(() => window.AION2_UI.keepPanelInViewport(panel));
      }
    }

    ["small", "normal", "large"].forEach(key => {
      const btn = document.getElementById(`aion2Size${key.charAt(0).toUpperCase()}${key.slice(1)}Btn`);
      if (!btn) return;
      const active = key === next;
      btn.classList.toggle("is-active", active);
      btn.disabled = active;
      btn.setAttribute("aria-pressed", String(active));
    });
  },

  showSwitchToast(theme = this.get()) {
    const text = theme === this.MODERN ? "Modern 스타일로 변경" : "Classic 스타일로 변경";
    this.showToast_(text);
  },

  showSizeToast(size = this.getSize()) {
    const labels = { small: "작게", normal: "보통", large: "크게" };
    this.showToast_(`업데이터 크기: ${labels[size] || labels.normal}`);
  },

  showToast_(text) {
    const panel = document.getElementById("aion2OfficialPanel");
    if (!panel) return;

    let toast = document.getElementById("aion2ThemeSwitchToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "aion2ThemeSwitchToast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }

    const rect = panel.getBoundingClientRect();
    toast.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
    toast.style.top = `${Math.round(rect.bottom + 8)}px`;
    toast.textContent = text;

    toast.classList.remove("is-visible");
    void toast.offsetWidth;
    toast.classList.add("is-visible");

    clearTimeout(this.toastTimer_);
    this.toastTimer_ = setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 1400);
  }
};
