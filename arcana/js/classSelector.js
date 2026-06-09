window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.classSelector = {
  classIconMap: {
    templar: '../hall-of-fame/assets/class_icon_templar.png',
    guardian: '../hall-of-fame/assets/class_icon_templar.png',
    gladiator: '../hall-of-fame/assets/class_icon_gladiator.png',
    assassin: '../hall-of-fame/assets/class_icon_assassin.png',
    ranger: '../hall-of-fame/assets/class_icon_ranger.png',
    sorcerer: '../hall-of-fame/assets/class_icon_sorcerer.png',
    elementalist: '../hall-of-fame/assets/class_icon_elementalist.png',
    spiritmaster: '../hall-of-fame/assets/class_icon_elementalist.png',
    cleric: '../hall-of-fame/assets/class_icon_cleric.png',
    chanter: '../hall-of-fame/assets/class_icon_chanter.png'
  },

  render() {
    const state = ArcanaApp.state;
    const button = document.getElementById('arcanaClassPickerButton');
    const list = document.getElementById('arcanaClassCardList');
    const layout = document.getElementById('arcanaMainLayout');

    if (!button || !list || !layout) return;

    button.innerHTML = '';
    const buttonIcon = ArcanaApp.classSelector.createClassIcon(state.currentClassKey, state.hasSelectedClass);
    if (buttonIcon) button.appendChild(buttonIcon);

    const label = document.createElement('span');
    label.textContent = state.hasSelectedClass
      ? ArcanaApp.classSelector.getClassName(state.currentClassKey)
      : '클래스 선택';
    button.appendChild(label);

    const arrow = document.createElement('span');
    arrow.className = 'arcana-class-arrow';
    arrow.textContent = '⌄';
    button.appendChild(arrow);

    layout.classList.toggle('is-class-locked', !state.hasSelectedClass);

    list.innerHTML = '';
    state.classList.forEach(item => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'arcana-class-card';
      card.dataset.classKey = item.key;

      const icon = ArcanaApp.classSelector.createClassIcon(item.key, true);
      if (icon) card.appendChild(icon);

      const name = document.createElement('span');
      name.textContent = item.name;
      card.appendChild(name);

      if ((state.pendingClassKey || state.currentClassKey) === item.key) {
        card.classList.add('is-selected');
      }

      card.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        state.pendingClassKey = item.key;
        ArcanaApp.classSelector.render();
        ArcanaApp.classSelector.open();
      });

      list.appendChild(card);
    });
  },

  bind() {
    const pickerButton = document.getElementById('arcanaClassPickerButton');
    const confirmButton = document.getElementById('arcanaConfirmClass');
    const closeButton = document.getElementById('arcanaCloseClass');

    if (pickerButton) {
      pickerButton.addEventListener('click', event => {
        event.stopPropagation();
        ArcanaApp.classSelector.toggle();
      });
    }

    if (confirmButton) {
      confirmButton.addEventListener('click', event => {
        event.stopPropagation();
        ArcanaApp.classSelector.confirm();
      });
    }

    if (closeButton) {
      closeButton.addEventListener('click', event => {
        event.stopPropagation();
        ArcanaApp.state.pendingClassKey = ArcanaApp.state.currentClassKey;
        ArcanaApp.classSelector.close();
        ArcanaApp.classSelector.render();
      });
    }

    document.addEventListener('click', event => {
      const picker = document.getElementById('arcanaClassPicker');
      if (!picker || picker.contains(event.target)) return;
      ArcanaApp.classSelector.close();
    });
  },

  toggle() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (!dropdown) return;
    dropdown.hidden ? ArcanaApp.classSelector.open() : ArcanaApp.classSelector.close();
  },

  open() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (dropdown) dropdown.hidden = false;
  },

  close() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (dropdown) dropdown.hidden = true;
  },

  async confirm() {
    const state = ArcanaApp.state;
    const nextKey = state.pendingClassKey || state.currentClassKey;

    if (!nextKey) return;

    const isChangingClass = state.hasSelectedClass && state.currentClassKey !== nextKey;

    if (state.hasSelectedClass && !isChangingClass) {
      state.pendingClassKey = state.currentClassKey;
      ArcanaApp.classSelector.close();
      ArcanaApp.classSelector.render();
      return;
    }

    if (isChangingClass && ArcanaApp.classSelector.hasSavedData()) {
      const confirmed = await ArcanaApp.confirmModal.open(
        '클래스를 변경하면 지금 저장한 내용은 초기화돼요. 그래도 새 클래스로 바꿔볼까요?'
      );

      if (!confirmed) {
        state.pendingClassKey = state.currentClassKey;
        ArcanaApp.classSelector.render();
        ArcanaApp.classSelector.open();
        return;
      }
    }

    await ArcanaApp.classSelector.applyClassWithLoading(nextKey);
  },

  async applyClassWithLoading(nextKey) {
    const state = ArcanaApp.state;
    const panelKeys = ['characterLevels', 'equipmentOptions', 'ownedArcanaCards', 'recommendArcanaCards'];

    panelKeys.forEach(panelKey => {
      ArcanaApp.loadingOverlay.show(panelKey, '클래스 정보를 불러오는 중입니다');
    });

    state.currentClassKey = nextKey;
    state.pendingClassKey = nextKey;
    state.hasSelectedClass = true;
    ArcanaApp.classSelector.resetClassDependentState();
    ArcanaApp.classSelector.applyClassSkillData(nextKey);
    ArcanaApp.classSelector.clearSavedPanels();

    await ArcanaApp.classSelector.preloadClassAssets(nextKey);
    await new Promise(resolve => window.setTimeout(resolve, 3200));

    ArcanaApp.classSelector.close();
    ArcanaApp.ui.renderAll();

    await new Promise(resolve => window.setTimeout(resolve, 250));
    panelKeys.forEach(panelKey => ArcanaApp.loadingOverlay.hide(panelKey));
  },

  applyClassSkillData(classKey) {
    const classData = ArcanaApp.state.classSkills[classKey] || {};
    ArcanaApp.state.activeSkills = classData.active || [];
    ArcanaApp.state.passiveSkills = classData.passive || [];
    ArcanaApp.state.skillsByArcana = classData.arcanaSkills || {};
  },

  async preloadClassAssets(classKey) {
    const promises = [];
    const iconUrl = ArcanaApp.classSelector.getClassIconUrl(classKey);

    if (iconUrl) {
      promises.push(ArcanaApp.classSelector.preloadImage(iconUrl));
    }

    if (ArcanaApp.skillSelector && ArcanaApp.skillSelector.ensureIconData) {
      await ArcanaApp.skillSelector.ensureIconData();
      const iconMap = ArcanaApp.skillSelector.getCachedIconMap();
      ArcanaApp.skillSelector.getActiveSkills().forEach(skill => {
        const url = iconMap[skill];
        if (url) {
          promises.push(ArcanaApp.classSelector.preloadImage(ArcanaApp.skillSelector.resolveIconUrl(url)));
        }
      });
    }

    return Promise.allSettled(promises);
  },

  preloadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = src;
    });
  },

  hasSavedData() {
    return Boolean(
      document.querySelector('.arcana-panel.is-saved') ||
      ArcanaApp.state.recommendationGenerated
    );
  },

  resetClassDependentState() {
    const state = ArcanaApp.state;

    state.selectedTargetSkills = [];
    state.characterLevels = {};
    state.selectedEquipmentKeys = [];
    state.equipmentOptions = { ring1: [], ring2: [] };
    state.ringOptions = { ring1: [], ring2: [] };
    state.ownedCards = {};
    state.recommendationCards = {};
    state.recommendationMeta = null;
    state.recommendationGenerated = false;
    state.recommendationTab = 'cards';
  },

  clearSavedPanels() {
    const saveMap = {
      characterLevels: 'arcanaSaveCharacterLevels',
      equipmentOptions: 'arcanaSaveEquipment',
      ownedArcanaCards: 'arcanaSaveOwnedCards'
    };

    Object.entries(saveMap).forEach(([panelKey, buttonId]) => {
      ArcanaApp.panelLock.unlock(panelKey, document.getElementById(buttonId));
    });
  },

  getClassName(classKey) {
    const found = ArcanaApp.state.classList.find(item => item.key === classKey);
    return found ? found.name : '클래스 선택';
  },

  getClassIconUrl(classKey) {
    return ArcanaApp.classSelector.classIconMap[classKey] || '';
  },

  createClassIcon(classKey, visible) {
    const url = ArcanaApp.classSelector.getClassIconUrl(classKey);
    if (!url && !visible) return null;

    const icon = document.createElement('img');
    icon.className = 'arcana-class-icon';
    icon.alt = '';
    icon.src = url || '../hall-of-fame/assets/class_icon_gladiator.png';
    icon.decoding = 'async';
    icon.loading = 'lazy';
    return icon;
  }
};
