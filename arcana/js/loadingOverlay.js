window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.loadingOverlay = {
  show(panelKey, message) {
    const panel = document.querySelector(`[data-panel-key="${panelKey}"]`);
    if (!panel) return;

    panel.classList.add('is-panel-loading');

    let overlay = panel.querySelector('.arcana-loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'arcana-loading-overlay';
      overlay.innerHTML = `
        <div class="arcana-loading-box">
          <img src="assets/images/loading-spinner.png" alt="로딩" />
          <span></span>
          <small>잠시만 기다려주세요</small>
        </div>
      `;
      panel.appendChild(overlay);
    }

    overlay.querySelector('span').textContent = message || '처리중입니다';
  },

  hide(panelKey) {
    const panel = document.querySelector(`[data-panel-key="${panelKey}"]`);
    if (!panel) return;

    panel.classList.remove('is-panel-loading');

    const overlay = panel.querySelector('.arcana-loading-overlay');
    if (overlay) overlay.remove();
  },

  showPage(message) {
    let overlay = document.getElementById('arcanaPageLoadingOverlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'arcanaPageLoadingOverlay';
      overlay.className = 'arcana-page-loading-overlay';
      overlay.innerHTML = `
        <div class="arcana-page-loading-box" role="status" aria-live="polite">
          <div class="arcana-page-spinner" aria-hidden="true"></div>
          <strong></strong>
          <small>잠시만 기다려주세요.</small>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    overlay.querySelector('strong').textContent = message || '아르카나가 정보를 읽고 있어요.';
    overlay.hidden = false;

    window.requestAnimationFrame(() => {
      overlay.classList.add('is-visible');
    });
  },

  hidePage() {
    const overlay = document.getElementById('arcanaPageLoadingOverlay');
    if (!overlay) return;

    overlay.classList.remove('is-visible');

    window.setTimeout(() => {
      if (!overlay.classList.contains('is-visible')) overlay.hidden = true;
    }, 220);
  },

  async play(panelKey, message, callback) {
    ArcanaApp.loadingOverlay.show(panelKey, message);

    await new Promise(resolve => window.setTimeout(resolve, 3200));

    if (typeof callback === 'function') {
      callback();
    }

    await new Promise(resolve => window.setTimeout(resolve, 420));
    ArcanaApp.loadingOverlay.hide(panelKey);
  }
};
