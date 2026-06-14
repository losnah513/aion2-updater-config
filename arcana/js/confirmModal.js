window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.confirmModal = {
  pendingResolve: null,

  bind() {
    const okButton = document.getElementById('arcanaConfirmOk');
    const cancelButton = document.getElementById('arcanaConfirmCancel');
    const modal = document.getElementById('arcanaConfirmModal');

    if (okButton) {
      okButton.addEventListener('click', () => ArcanaApp.confirmModal.close(true));
    }

    if (cancelButton) {
      cancelButton.addEventListener('click', () => ArcanaApp.confirmModal.close(false));
    }

    if (modal) {
      modal.addEventListener('click', event => {
        if (event.target === modal) {
          ArcanaApp.confirmModal.close(false);
        }
      });
    }
  },

  open(message) {
    const modal = document.getElementById('arcanaConfirmModal');
    const messageEl = document.getElementById('arcanaConfirmMessage');

    if (!modal) {
      return Promise.resolve(false);
    }

    if (messageEl && message) {
      messageEl.textContent = message;
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');

    return new Promise(resolve => {
      ArcanaApp.confirmModal.pendingResolve = resolve;
    });
  },

  close(result) {
    const modal = document.getElementById('arcanaConfirmModal');

    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }

    if (ArcanaApp.confirmModal.pendingResolve) {
      ArcanaApp.confirmModal.pendingResolve(Boolean(result));
      ArcanaApp.confirmModal.pendingResolve = null;
    }
  }
};
