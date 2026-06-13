window.ArcanaApp = window.ArcanaApp || {};

/*
 * ARCANA CLASS SELECTOR
 * 역할: 상단 클래스 선택 버튼/드롭다운만 관리한다.
 * 과거 쇼케이스형 클래스 선택 UI는 이중 진입/중복 스타일 충돌 원인이어서 제거했다.
 */
ArcanaApp.classSelector = {
  normalizeClassKey(classKey) {
    return ArcanaApp.classService
      ? ArcanaApp.classService.normalizeKey(classKey)
      : (classKey || '');
  },

  normalizeClassList() {
    return ArcanaApp.classService
      ? ArcanaApp.classService.normalizeList()
      : [];
  },

  getDisplayClassList() {
    return ArcanaApp.classSelector.normalizeClassList();
  },

  getClassItem(classKey) {
    return ArcanaApp.classService
      ? ArcanaApp.classService.getItem(classKey)
      : null;
  },

  render() {
    const state = ArcanaApp.state;
    const button = document.getElementById('arcanaClassPickerButton');
    const list = document.getElementById('arcanaClassCardList');
    const layout = document.getElementById('arcanaMainLayout');
    const picker = document.getElementById('arcanaClassPicker');

    if (!button || !list || !layout) return;

    document.body.classList.toggle('arcana-has-selected-class', Boolean(state.hasSelectedClass));

    button.innerHTML = '';
    button.classList.toggle('has-class', state.hasSelectedClass);
    button.classList.toggle('is-initial-cta', !state.hasSelectedClass);
    if (picker) picker.classList.toggle('is-initial-cta', !state.hasSelectedClass);

    if (state.hasSelectedClass) {
      const buttonIcon = ArcanaApp.classSelector.createClassIcon(state.currentClassKey, true);
      if (buttonIcon) button.appendChild(buttonIcon);
    }

    const label = document.createElement('span');
    label.textContent = state.hasSelectedClass ? '클래스 변경' : '클래스 선택하기';
    button.appendChild(label);

    const arrow = document.createElement('span');
    arrow.className = 'arcana-class-arrow';
    arrow.textContent = '⌄';
    button.appendChild(arrow);

    layout.classList.toggle('is-class-locked', !state.hasSelectedClass);
    ArcanaApp.classSelector.renderCompactClassList();
  },

  renderCompactClassList() {
    const state = ArcanaApp.state;
    const list = document.getElementById('arcanaClassCardList');
    if (!list) return;

    const activeKey = state.pendingClassKey || state.currentClassKey || '';
    list.innerHTML = '';

    ArcanaApp.classSelector.getDisplayClassList().forEach(item => {
      const card = ArcanaApp.classSelector.createClassButton(item, 'arcana-class-card');
      card.classList.toggle('is-selected', activeKey === item.key);

      card.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        ArcanaApp.classSelector.selectCompactClass(item.key);
      });

      list.appendChild(card);
    });
  },

  selectCompactClass(classKey) {
    ArcanaApp.state.pendingClassKey = ArcanaApp.classSelector.normalizeClassKey(classKey);
    ArcanaApp.classSelector.renderCompactClassList();
  },

  bind() {
    if (ArcanaApp.classSelector._eventsBound) return;
    ArcanaApp.classSelector._eventsBound = true;

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
        ArcanaApp.classSelector.cancelCompactSelection();
      });
    }

    document.addEventListener('click', event => {
      const picker = document.getElementById('arcanaClassPicker');
      if (picker && picker.contains(event.target)) return;
      ArcanaApp.classSelector.close();
    });
  },

  openPicker() {
    const state = ArcanaApp.state;
    state.pendingClassKey = state.hasSelectedClass ? state.currentClassKey : '';
    ArcanaApp.classSelector.renderCompactClassList();
    ArcanaApp.classSelector.open();
  },

  toggle() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (!dropdown) return;
    dropdown.hidden ? ArcanaApp.classSelector.openPicker() : ArcanaApp.classSelector.close();
  },

  open() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (dropdown) {
      dropdown.hidden = false;
      dropdown.classList.add('is-compact');
    }
  },

  close() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (dropdown) dropdown.hidden = true;
  },

  cancelCompactSelection() {
    ArcanaApp.state.pendingClassKey = ArcanaApp.state.currentClassKey;
    ArcanaApp.classSelector.close();
    ArcanaApp.classSelector.render();
  },

  async confirm() {
    const state = ArcanaApp.state;
    const nextKey = ArcanaApp.classSelector.normalizeClassKey(state.pendingClassKey || state.currentClassKey);

    if (!nextKey) return;

    const isChangingClass = state.hasSelectedClass && state.currentClassKey !== nextKey;

    if (state.hasSelectedClass && !isChangingClass) {
      state.pendingClassKey = state.currentClassKey;
      ArcanaApp.classSelector.close();
      ArcanaApp.classSelector.render();
      return;
    }

    if (isChangingClass && ArcanaApp.classSelector.hasSavedData()) {
      ArcanaApp.classSelector.close();
      const confirmed = await ArcanaApp.confirmModal.open(
        '클래스를 변경하면 지금 저장한 내용은 초기화돼요. 그래도 새 클래스로 바꿔볼까요?'
      );

      if (!confirmed) {
        state.pendingClassKey = state.currentClassKey;
        ArcanaApp.classSelector.render();
        return;
      }
    }

    await ArcanaApp.classSelector.applyClassWithLoading(nextKey);
  },

  async applyClassWithLoading(nextKey) {
    const state = ArcanaApp.state;
    const normalizedKey = ArcanaApp.classSelector.normalizeClassKey(nextKey);

    ArcanaApp.classSelector.close();
    ArcanaApp.loadingOverlay.showPage('아르카나가 선택한 클래스의 스킬을 읽고 있어요.');

    try {
      state.currentClassKey = normalizedKey;
      state.pendingClassKey = normalizedKey;
      state.hasSelectedClass = true;
      ArcanaApp.classSelector.resetClassDependentState();
      ArcanaApp.classSelector.applyClassSkillData(normalizedKey);
      ArcanaApp.classSelector.clearSavedPanels();

      await ArcanaApp.classSelector.preloadClassAssets(normalizedKey);
      await new Promise(resolve => window.setTimeout(resolve, 700));

      ArcanaApp.ui.renderAll();
      await new Promise(resolve => window.setTimeout(resolve, 180));
    } finally {
      ArcanaApp.loadingOverlay.hidePage();
    }
  },

  applyClassSkillData(classKey) {
    const normalizedKey = ArcanaApp.classSelector.normalizeClassKey(classKey);
    const keys = ArcanaApp.classService
      ? ArcanaApp.classService.getLookupKeys(normalizedKey)
      : [normalizedKey];
    const classSkills = ArcanaApp.state.classSkills || {};
    const hasUsableData = data => Boolean(
      data && (
        (Array.isArray(data.active) && data.active.length > 0) ||
        (Array.isArray(data.passive) && data.passive.length > 0) ||
        (data.arcanaSkills && Object.values(data.arcanaSkills).some(list => Array.isArray(list) && list.length > 0))
      )
    );

    let classData = keys.map(key => classSkills[key]).find(hasUsableData) || {};

    const getFallbackClassData = () => {
      if (!ArcanaApp.api || !ArcanaApp.api.getFallbackData) return {};
      const fallbackSkills = (ArcanaApp.api.getFallbackData().classSkills || {});
      return keys
        .map(key => fallbackSkills[ArcanaApp.classSelector.normalizeClassKey(key)] || fallbackSkills[key])
        .find(hasUsableData) || {};
    };

    const fallbackData = getFallbackClassData();
    const classActive = Array.from(new Set((classData.active || []).map(skill => String(skill).trim()).filter(Boolean)));
    const classPassive = Array.from(new Set((classData.passive || []).map(skill => String(skill).trim()).filter(Boolean)));
    const fallbackActive = Array.from(new Set((fallbackData.active || []).map(skill => String(skill).trim()).filter(Boolean)));
    const fallbackPassive = Array.from(new Set((fallbackData.passive || []).map(skill => String(skill).trim()).filter(Boolean)));

    if (classActive.length === 0 && fallbackActive.length > 0) {
      classData = { ...classData, active: fallbackActive };
      console.warn('[Arcana] 클래스 액티브 스킬 DB가 비어 있어 내장 스킬 데이터로 보정합니다:', normalizedKey);
    }

    if (classPassive.length === 0 && fallbackPassive.length > 0) {
      classData = { ...classData, passive: fallbackPassive };
      console.warn('[Arcana] 클래스 패시브 스킬 DB가 비어 있어 내장 스킬 데이터로 보정합니다:', normalizedKey);
    }

    if (!hasUsableData(classData) && hasUsableData(fallbackData)) {
      classData = fallbackData;
      console.warn('[Arcana] 클래스 스킬 DB 전체가 비어 있어 내장 스킬 데이터로 보정합니다:', normalizedKey);
    }

    ArcanaApp.state.arcanaTypes = ['성배', '양피지', '나침반', '종', '거울', '천칭'];
    ArcanaApp.state.activeSkills = Array.from(new Set((classData.active || []).map(skill => String(skill).trim()).filter(Boolean)));
    ArcanaApp.state.passiveSkills = Array.from(new Set((classData.passive || []).map(skill => String(skill).trim()).filter(Boolean)));
    ArcanaApp.state.skillsByArcana = ArcanaApp.classSelector.normalizeArcanaSkillMap({
      active: ArcanaApp.state.activeSkills,
      passive: ArcanaApp.state.passiveSkills
    });
  },

  getArcanaSkillRuleSpecs() {
    return {
      '양피지': { type: 'active', letters: ['f', 'h', 'j', 'l', 'o', 'p'], expectedCount: 6 },
      '나침반': { type: 'active', letters: ['g', 'i', 'k', 'm', 'n', 'q'], expectedCount: 6 },
      '종': { type: 'passive', letters: ['f', 'h', 'j', 'l', 'n'], expectedCount: 5 },
      '거울': { type: 'passive', letters: ['g', 'i', 'k', 'm', 'o'], expectedCount: 5 }
    };
  },

  buildArcanaSkillRules(activeSkills, passiveSkills) {
    const active = Array.from(new Set((activeSkills || []).map(skill => String(skill).trim()).filter(Boolean)));
    const passive = Array.from(new Set((passiveSkills || []).map(skill => String(skill).trim()).filter(Boolean)));
    const skillColumnIndex = letter => {
      const text = String(letter || '').trim().toLowerCase();
      const index = 'abcdefghijklmnopqrstuvwxyz'.indexOf(text);
      const startIndex = 'abcdefghijklmnopqrstuvwxyz'.indexOf('f');
      return index >= startIndex ? index - startIndex : -1;
    };
    const byLetters = (source, letters) => (letters || [])
      .map(letter => source[skillColumnIndex(letter)])
      .filter(Boolean);

    const specs = ArcanaApp.classSelector.getArcanaSkillRuleSpecs();
    const map = {
      '성배': Array.from(new Set([...active, ...passive])),
      '천칭': Array.from(new Set([...active, ...passive]))
    };

    Object.keys(specs).forEach(arcanaName => {
      const spec = specs[arcanaName];
      const source = spec.type === 'passive' ? passive : active;
      map[arcanaName] = byLetters(source, spec.letters);
    });

    return map;
  },

  normalizeArcanaSkillMap(classData) {
    const active = Array.from(new Set((classData.active || []).map(skill => String(skill).trim()).filter(Boolean)));
    const passive = Array.from(new Set((classData.passive || []).map(skill => String(skill).trim()).filter(Boolean)));
    return ArcanaApp.classSelector.buildArcanaSkillRules(active, passive);
  },

  async preloadClassAssets(classKey) {
    const promises = [];
    const iconUrl = ArcanaApp.classSelector.getClassIconUrl(classKey);

    if (iconUrl) promises.push(ArcanaApp.classSelector.preloadImage(iconUrl));

    if (ArcanaApp.skillSelector && ArcanaApp.skillSelector.ensureIconData) {
      await ArcanaApp.skillSelector.ensureIconData();
      const iconMap = ArcanaApp.skillSelector.getCachedIconMap();
      ArcanaApp.skillSelector.getActiveSkills().forEach(skill => {
        const url = iconMap[skill];
        if (url) promises.push(ArcanaApp.classSelector.preloadImage(ArcanaApp.skillSelector.resolveIconUrl(url)));
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
    state.targetSkillLevels = {};
    state.targetSkillPriority20 = [];
    state.characterLevels = {};
    state.selectedEquipmentKeys = ['ring1', 'ring2'];
    state.equipmentOptions = { ring1: [], ring2: [] };
    state.ringOptions = { ring1: [], ring2: [] };
    state.ownedCards = {};
    state.recommendationCards = {};
    state.recommendationMeta = null;
    state.recommendationGenerated = false;
    state.recommendationTab = 'cards';
    state.activeSkillTargets = {};
    state.characterSkillsSaved = false;

    ArcanaApp.api.clearCharacterLevels();
    ArcanaApp.api.clearEquipmentOptions();
    ArcanaApp.api.clearOwnedCards();
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
    return ArcanaApp.classService
      ? ArcanaApp.classService.getName(classKey)
      : '클래스 선택';
  },

  getClassIconUrl(classKey) {
    return ArcanaApp.classService
      ? ArcanaApp.classService.getIconUrl(classKey)
      : '';
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
  },

  createClassButton(item, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.classKey = item.key;

    const icon = ArcanaApp.classSelector.createClassIcon(item.key, true);
    if (icon) button.appendChild(icon);

    const name = document.createElement('span');
    name.textContent = item.name;
    button.appendChild(name);

    return button;
  }
};
