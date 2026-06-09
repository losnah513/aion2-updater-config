window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.panelLock = {
  setSaving(panelKey, button) {
    const panel = ArcanaApp.panelLock.getPanel(panelKey);
    if (!panel) return;

    panel.classList.remove('is-saved');
    panel.classList.add('is-saving');
    ArcanaApp.panelLock.setPanelInputs(panel, true);

    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = '저장중입니다';
    }
  },

  setSaved(panelKey, button, message) {
    const panel = ArcanaApp.panelLock.getPanel(panelKey);
    if (!panel) return;

    panel.classList.remove('is-saving');
    panel.classList.add('is-saved');
    ArcanaApp.panelLock.setPanelInputs(panel, true);

    if (button) {
      button.disabled = true;
      button.textContent = '저장 완료';
    }

    const clearButton = ArcanaApp.panelLock.getClearButton(panelKey);
    if (clearButton) {
      clearButton.disabled = false;
      clearButton.classList.add('is-ready-reset');
    }

    ArcanaApp.panelLock.showMessage(panelKey, message || '저장 완료. 수정하려면 초기화를 눌러주세요.');
  },

  unlock(panelKey, saveButton) {
    const panel = ArcanaApp.panelLock.getPanel(panelKey);
    if (!panel) return;

    panel.classList.remove('is-saving', 'is-saved');
    ArcanaApp.panelLock.setPanelInputs(panel, false);

    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = saveButton.dataset.originalText || saveButton.textContent;
    }

    const clearButton = ArcanaApp.panelLock.getClearButton(panelKey);
    if (clearButton) {
      clearButton.classList.remove('is-ready-reset');
    }

    ArcanaApp.panelLock.showMessage(panelKey, '');
  },

  getPanel(panelKey) {
    return document.querySelector(`[data-panel-key="${panelKey}"]`);
  },

  getClearButton(panelKey) {
    const map = {
      characterLevels: 'arcanaClearCharacterLevels',
      equipmentOptions: 'arcanaClearEquipment',
      ownedArcanaCards: 'arcanaClearOwnedCards'
    };
    return map[panelKey] ? document.getElementById(map[panelKey]) : null;
  },

  showMessage(panelKey, message) {
    const messageEl = document.querySelector(`[data-message-for="${panelKey}"]`);
    if (!messageEl) return;

    messageEl.textContent = message || '';
    messageEl.classList.toggle('is-visible', Boolean(message));
  },

  setPanelInputs(panel, disabled) {
    panel.querySelectorAll('input, select, textarea').forEach(input => {
      input.disabled = disabled;
    });

    if (ArcanaApp.customSelect) {
      ArcanaApp.customSelect.syncDisabledState(panel);
    }
  }
};
