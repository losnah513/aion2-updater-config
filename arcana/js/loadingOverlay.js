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

  async play(panelKey, message, callback) {
    ArcanaApp.loadingOverlay.show(panelKey, message);

    await new Promise(resolve => window.setTimeout(resolve, 420));

    if (typeof callback === 'function') {
      callback();
    }

    await new Promise(resolve => window.setTimeout(resolve, 180));
    ArcanaApp.loadingOverlay.hide(panelKey);
  }
};
