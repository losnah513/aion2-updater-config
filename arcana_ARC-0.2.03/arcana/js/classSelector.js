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

  defaultClassList: [
    { key: 'templar', name: '수호성' },
    { key: 'gladiator', name: '검성' },
    { key: 'assassin', name: '살성' },
    { key: 'ranger', name: '궁성' },
    { key: 'sorcerer', name: '마도성' },
    { key: 'elementalist', name: '정령성' },
    { key: 'cleric', name: '치유성' },
    { key: 'chanter', name: '호법성' }
  ],

  classAliases: {
    guardian: 'templar',
    spiritmaster: 'elementalist'
  },

  render() {
    const state = ArcanaApp.state;
    const button = document.getElementById('arcanaClassPickerButton');
    const list = document.getElementById('arcanaClassCardList');
    const showcase = document.getElementById('arcanaClassShowcase');
    const layout = document.getElementById('arcanaMainLayout');

    if (!button || !list || !layout) return;

    button.innerHTML = '';
    const label = document.createElement('span');
    label.textContent = state.hasSelectedClass ? '클래스 변경' : '클래스 선택';
    button.appendChild(label);

    const arrow = document.createElement('span');
    arrow.className = 'arcana-class-arrow';
    arrow.textContent = '⌄';
    button.appendChild(arrow);

    const currentName = state.hasSelectedClass
      ? ArcanaApp.classSelector.getClassName(state.currentClassKey)
      : '클래스 미선택';
    button.title = state.hasSelectedClass
      ? `현재 클래스: ${currentName}`
      : '어떤 클래스로 시뮬레이션을 진행할까요?';

    layout.classList.toggle('is-class-locked', !state.hasSelectedClass);

    ArcanaApp.classSelector.renderShowcase(showcase);
    ArcanaApp.classSelector.renderClassButtons(list);
  },

  renderShowcase(showcase) {
    if (!showcase) return;

    const state = ArcanaApp.state;
    const classList = ArcanaApp.classSelector.getOrderedClassList();
    const selectedKey = state.showcaseSelectedClassKey || state.pendingClassKey || '';

    showcase.innerHTML = '';
    classList.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'arcana-showcase-card';
      card.dataset.classKey = item.key;
      card.style.setProperty('--arcana-card-index', String(index));

      const face = document.createElement('div');
      face.className = 'arcana-showcase-card-face';

      const icon = ArcanaApp.classSelector.createClassIcon(item.key, true);
      if (icon) face.appendChild(icon);

      const name = document.createElement('span');
      name.textContent = item.name;
      face.appendChild(name);

      card.appendChild(face);

      if (selectedKey === item.key) {
        card.classList.add('is-selected-showcase');
      }

      if (selectedKey && selectedKey !== item.key) {
        card.classList.add('is-falling-showcase');
      }

      showcase.appendChild(card);
    });
  },

  renderClassButtons(list) {
    const state = ArcanaApp.state;
    const classList = ArcanaApp.classSelector.getOrderedClassList();

    list.innerHTML = '';
    classList.forEach(item => {
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

      card.addEventListener('mouseenter', () => {
        ArcanaApp.classSelector.setShowcaseHover(item.key);
      });

      card.addEventListener('mouseleave', () => {
        ArcanaApp.classSelector.setShowcaseHover('');
      });

      card.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        ArcanaApp.classSelector.selectClass(item.key);
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
        ArcanaApp.state.showcaseSelectedClassKey = '';
        ArcanaApp.classSelector.close();
        ArcanaApp.classSelector.render();
      });
    }

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        ArcanaApp.state.pendingClassKey = ArcanaApp.state.currentClassKey;
        ArcanaApp.state.showcaseSelectedClassKey = '';
        ArcanaApp.classSelector.close();
        ArcanaApp.classSelector.render();
      }
    });
  },

  toggle() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (!dropdown) return;
    dropdown.hidden ? ArcanaApp.classSelector.open() : ArcanaApp.classSelector.close();
  },

  open() {
    const state = ArcanaApp.state;
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (!dropdown) return;

    state.showcaseSelectedClassKey = '';
    dropdown.hidden = false;
    dropdown.classList.toggle('is-full-showcase', !state.hasSelectedClass);
    dropdown.classList.toggle('is-compact-change', state.hasSelectedClass);
    ArcanaApp.classSelector.render();
  },

  close() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (dropdown) dropdown.hidden = true;
  },

  selectClass(classKey) {
    const state = ArcanaApp.state;
    state.pendingClassKey = classKey;

    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    const isFullShowcase = dropdown && dropdown.classList.contains('is-full-showcase');

    if (isFullShowcase) {
      state.showcaseSelectedClassKey = classKey;
    }

    ArcanaApp.classSelector.render();
    if (dropdown) dropdown.hidden = false;
  },

  setShowcaseHover(classKey) {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (!dropdown || !dropdown.classList.contains('is-full-showcase')) return;
    if (ArcanaApp.state.showcaseSelectedClassKey) return;

    document.querySelectorAll('.arcana-showcase-card').forEach(card => {
      card.classList.toggle('is-hover-showcase', Boolean(classKey) && card.dataset.classKey === classKey);
    });
  },

  async confirm() {
    const state = ArcanaApp.state;
    const nextKey = state.pendingClassKey || state.currentClassKey;

    if (!nextKey) return;

    const isChangingClass = state.hasSelectedClass && state.currentClassKey !== nextKey;

    if (state.hasSelectedClass && !isChangingClass) {
      state.pendingClassKey = state.currentClassKey;
      state.showcaseSelectedClassKey = '';
      ArcanaApp.classSelector.close();
      ArcanaApp.classSelector.render();
      return;
    }

    if (isChangingClass && ArcanaApp.classSelector.hasSavedData()) {
      const confirmed = await ArcanaApp.confirmModal.open(
        '클래스를 변경하면 기존 저장한 내용은 초기화됩니다. 변경하시겠습니까?'
      );

      if (!confirmed) {
        state.pendingClassKey = state.currentClassKey;
        state.showcaseSelectedClassKey = '';
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
    state.hasPlayedClassIntro = true;
    state.showcaseSelectedClassKey = '';
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
    const canonicalKey = ArcanaApp.classSelector.getCanonicalClassKey(classKey);
    const classData = ArcanaApp.state.classSkills[canonicalKey] || ArcanaApp.state.classSkills[classKey] || {};
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

  getOrderedClassList() {
    const source = Array.isArray(ArcanaApp.state.classList) ? ArcanaApp.state.classList : [];
    const byKey = {};

    source.forEach(item => {
      const key = ArcanaApp.classSelector.getCanonicalClassKey(item.key);
      if (!key) return;
      byKey[key] = { key, name: item.name || ArcanaApp.classSelector.getDefaultClassName(key) };
    });

    return ArcanaApp.classSelector.defaultClassList.map(item => ({
      key: item.key,
      name: byKey[item.key] ? byKey[item.key].name : item.name
    }));
  },

  getCanonicalClassKey(classKey) {
    return ArcanaApp.classSelector.classAliases[classKey] || classKey || '';
  },

  getDefaultClassName(classKey) {
    const found = ArcanaApp.classSelector.defaultClassList.find(item => item.key === classKey);
    return found ? found.name : '클래스';
  },

  getClassName(classKey) {
    const canonicalKey = ArcanaApp.classSelector.getCanonicalClassKey(classKey);
    const found = ArcanaApp.classSelector.getOrderedClassList().find(item => item.key === canonicalKey);
    return found ? found.name : '클래스 선택';
  },

  getClassIconUrl(classKey) {
    const canonicalKey = ArcanaApp.classSelector.getCanonicalClassKey(classKey);
    return ArcanaApp.classSelector.classIconMap[canonicalKey] || '';
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
