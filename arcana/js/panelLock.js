window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.panelLock = {

  defaultMessages: {
    characterLevels: '스킬을 선택하고 저장을 눌러주세요.',
    equipmentOptions: '반지 스킬을 선택하고 저장을 눌러주세요.',
    ownedArcanaCards: '보유 아르카나를 입력하고 저장을 눌러주세요.',
    recommendArcanaCards: ''
  },
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
      button.disabled = false;
      button.textContent = '수정하기';
      button.dataset.editMode = 'saved';
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
      delete saveButton.dataset.editMode;
    }

    const clearButton = ArcanaApp.panelLock.getClearButton(panelKey);
    if (clearButton) {
      clearButton.classList.remove('is-ready-reset');
    }

    ArcanaApp.panelLock.showMessage(panelKey);
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

    const text = message || ArcanaApp.panelLock.defaultMessages[panelKey] || '';
    messageEl.textContent = ArcanaApp.panelLock.formatMessage(text);
    messageEl.classList.toggle('is-visible', Boolean(text));
    messageEl.classList.toggle('is-default', !message);
  },

  formatMessage(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/(\.)(\s+)/g, '$1\n')
      .replace(/(요\.)(\s*)/g, '$1\n')
      .replace(/(다\.)(\s*)/g, '$1\n')
      .replace(/(세요\.)(\s*)/g, '$1\n')
      .trim();
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
