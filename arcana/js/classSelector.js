window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.classSelector = {
  classOrder: [
    'guardian',
    'templar',
    'gladiator',
    'assassin',
    'ranger',
    'sorcerer',
    'spiritmaster',
    'elementalist',
    'cleric',
    'chanter'
  ],

  classNameMap: {
    templar: '수호성',
    guardian: '수호성',
    gladiator: '검성',
    assassin: '살성',
    ranger: '궁성',
    sorcerer: '마도성',
    elementalist: '정령성',
    spiritmaster: '정령성',
    cleric: '치유성',
    chanter: '호법성'
  },

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

  normalizeClassList(classList) {
    const source = Array.isArray(classList) ? classList : [];
    const uniqueByName = new Map();

    source.forEach(item => {
      if (!item || !item.key) return;
      const normalized = {
        key: item.key,
        name: ArcanaApp.classSelector.classNameMap[item.key] || item.name || item.key
      };
      if (!uniqueByName.has(normalized.name)) uniqueByName.set(normalized.name, normalized);
    });

    return Array.from(uniqueByName.values()).sort((a, b) => {
      const ai = ArcanaApp.classSelector.classOrder.indexOf(a.key);
      const bi = ArcanaApp.classSelector.classOrder.indexOf(b.key);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  },

  getDisplayClassList() {
    return ArcanaApp.classSelector.normalizeClassList(ArcanaApp.state.classList);
  },

  render() {
    const state = ArcanaApp.state;
    const button = document.getElementById('arcanaClassPickerButton');
    const list = document.getElementById('arcanaClassCardList');
    const layout = document.getElementById('arcanaMainLayout');

    if (!button || !list || !layout) return;

    button.innerHTML = '';
    button.classList.toggle('has-class', state.hasSelectedClass);

    if (state.hasSelectedClass) {
      const buttonIcon = ArcanaApp.classSelector.createClassIcon(state.currentClassKey, true);
      if (buttonIcon) button.appendChild(buttonIcon);
    }

    const label = document.createElement('span');
    label.textContent = state.hasSelectedClass ? '클래스 변경' : '클래스 선택';
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

    list.innerHTML = '';
    ArcanaApp.classSelector.getDisplayClassList().forEach(item => {
      const card = ArcanaApp.classSelector.createClassButton(item, 'arcana-class-card');

      if ((state.pendingClassKey || state.currentClassKey) === item.key) {
        card.classList.add('is-selected');
      }

      card.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        state.pendingClassKey = item.key;
        ArcanaApp.classSelector.renderCompactClassList();
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
        ArcanaApp.classSelector.openPicker();
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
      const showcase = document.getElementById('arcanaClassShowcase');
      if (picker && picker.contains(event.target)) return;
      if (showcase && !showcase.hidden && showcase.contains(event.target)) return;
      ArcanaApp.classSelector.close();
    });
  },

  openPicker() {
    const state = ArcanaApp.state;

    if (!state.hasSelectedClass && !state.hasSeenClassShowcase) {
      ArcanaApp.classSelector.openShowcase();
      return;
    }

    state.pendingClassKey = state.currentClassKey || state.pendingClassKey || '';
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

  openShowcase() {
    const state = ArcanaApp.state;
    const showcase = ArcanaApp.classSelector.ensureShowcase();
    if (!showcase) return;

    state.pendingClassKey = '';
    state.showcaseSelectedKey = '';

    ArcanaApp.classSelector.renderShowcase();
    showcase.hidden = false;
    showcase.setAttribute('aria-hidden', 'false');

    window.requestAnimationFrame(() => {
      showcase.classList.add('is-open');
    });
  },

  closeShowcase() {
    const showcase = document.getElementById('arcanaClassShowcase');
    if (!showcase) return;

    showcase.classList.remove('is-open', 'is-picked');
    showcase.setAttribute('aria-hidden', 'true');

    window.setTimeout(() => {
      showcase.hidden = true;
      showcase.querySelectorAll('.arcana-showcase-card').forEach(card => {
        card.classList.remove('is-selected', 'is-falling', 'is-hovered');
      });
    }, 240);
  },

  ensureShowcase() {
    let showcase = document.getElementById('arcanaClassShowcase');
    if (showcase) return showcase;

    showcase = document.createElement('div');
    showcase.id = 'arcanaClassShowcase';
    showcase.className = 'arcana-class-showcase';
    showcase.hidden = true;
    showcase.setAttribute('aria-hidden', 'true');

    showcase.innerHTML = `
      <div class="arcana-showcase-stage" role="dialog" aria-modal="true" aria-labelledby="arcanaShowcaseTitle">
        <div class="arcana-showcase-copy">
          <h2 id="arcanaShowcaseTitle">어떤 클래스로 시뮬레이션을 진행할까요?</h2>
          <p>클래스를 선택하면 스킬 정보를 불러올 수 있어요.</p>
        </div>
        <div class="arcana-showcase-ring-wrap">
          <div id="arcanaShowcaseRing" class="arcana-showcase-ring"></div>
        </div>
        <div id="arcanaShowcaseButtons" class="arcana-showcase-buttons"></div>
        <div class="arcana-showcase-actions">
          <button id="arcanaShowcaseConfirm" class="arcana-btn arcana-btn-primary" type="button" disabled>확인</button>
          <button id="arcanaShowcaseClose" class="arcana-btn arcana-btn-ghost" type="button">닫기</button>
        </div>
      </div>
    `;

    document.body.appendChild(showcase);

    showcase.addEventListener('click', event => {
      if (event.target === showcase) ArcanaApp.classSelector.cancelShowcaseSelection();
    });

    showcase.querySelector('#arcanaShowcaseConfirm').addEventListener('click', event => {
      event.stopPropagation();
      ArcanaApp.classSelector.confirmShowcase();
    });

    showcase.querySelector('#arcanaShowcaseClose').addEventListener('click', event => {
      event.stopPropagation();
      ArcanaApp.classSelector.cancelShowcaseSelection();
    });

    return showcase;
  },

  renderShowcase() {
    const state = ArcanaApp.state;
    const showcase = ArcanaApp.classSelector.ensureShowcase();
    const ring = showcase.querySelector('#arcanaShowcaseRing');
    const buttons = showcase.querySelector('#arcanaShowcaseButtons');
    const confirmButton = showcase.querySelector('#arcanaShowcaseConfirm');
    const classList = ArcanaApp.classSelector.getDisplayClassList();

    if (!ring || !buttons || !confirmButton) return;

    ring.innerHTML = '';
    buttons.innerHTML = '';
    confirmButton.disabled = true;

    classList.forEach((item, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'arcana-showcase-card';
      card.dataset.classKey = item.key;
      card.style.setProperty('--arcana-card-index', index);
      card.style.setProperty('--arcana-card-count', classList.length);
      card.setAttribute('aria-label', item.name);

      const inner = document.createElement('span');
      inner.className = 'arcana-showcase-card-inner';

      const icon = ArcanaApp.classSelector.createClassIcon(item.key, true);
      if (icon) inner.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'arcana-showcase-card-name';
      name.textContent = item.name;
      inner.appendChild(name);
      card.appendChild(inner);

      card.addEventListener('mouseenter', () => ArcanaApp.classSelector.hoverShowcaseClass(item.key));
      card.addEventListener('focus', () => ArcanaApp.classSelector.hoverShowcaseClass(item.key));
      card.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        ArcanaApp.classSelector.pickShowcaseClass(item.key);
      });

      ring.appendChild(card);

      const nameButton = document.createElement('button');
      nameButton.type = 'button';
      nameButton.className = 'arcana-showcase-name-btn';
      nameButton.dataset.classKey = item.key;
      nameButton.textContent = item.name;
      nameButton.addEventListener('mouseenter', () => ArcanaApp.classSelector.hoverShowcaseClass(item.key));
      nameButton.addEventListener('focus', () => ArcanaApp.classSelector.hoverShowcaseClass(item.key));
      nameButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        ArcanaApp.classSelector.pickShowcaseClass(item.key);
      });
      buttons.appendChild(nameButton);
    });
  },

  hoverShowcaseClass(classKey) {
    const showcase = document.getElementById('arcanaClassShowcase');
    if (!showcase || showcase.classList.contains('is-picked')) return;

    showcase.querySelectorAll('.arcana-showcase-card').forEach(card => {
      card.classList.toggle('is-hovered', card.dataset.classKey === classKey);
    });

    showcase.querySelectorAll('.arcana-showcase-name-btn').forEach(button => {
      button.classList.toggle('is-hovered', button.dataset.classKey === classKey);
    });
  },

  pickShowcaseClass(classKey) {
    const state = ArcanaApp.state;
    const showcase = document.getElementById('arcanaClassShowcase');
    if (!showcase || showcase.classList.contains('is-picked')) return;

    state.pendingClassKey = classKey;
    state.showcaseSelectedKey = classKey;
    showcase.classList.add('is-picked');

    showcase.querySelectorAll('.arcana-showcase-card').forEach(card => {
      const isSelected = card.dataset.classKey === classKey;
      card.classList.toggle('is-selected', isSelected);
      card.classList.toggle('is-falling', !isSelected);
      card.classList.remove('is-hovered');
    });

    showcase.querySelectorAll('.arcana-showcase-name-btn').forEach(button => {
      button.classList.toggle('is-selected', button.dataset.classKey === classKey);
      button.classList.remove('is-hovered');
    });

    const confirmButton = showcase.querySelector('#arcanaShowcaseConfirm');
    if (confirmButton) confirmButton.disabled = false;
  },

  cancelShowcaseSelection() {
    ArcanaApp.state.pendingClassKey = ArcanaApp.state.currentClassKey;
    ArcanaApp.state.showcaseSelectedKey = '';
    ArcanaApp.classSelector.closeShowcase();
  },

  async confirmShowcase() {
    ArcanaApp.state.hasSeenClassShowcase = true;
    ArcanaApp.classSelector.closeShowcase();
    await ArcanaApp.classSelector.confirm();
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
    state.hasSeenClassShowcase = true;
    ArcanaApp.classSelector.resetClassDependentState();
    ArcanaApp.classSelector.applyClassSkillData(nextKey);
    ArcanaApp.classSelector.clearSavedPanels();

    await ArcanaApp.classSelector.preloadClassAssets(nextKey);
    await new Promise(resolve => window.setTimeout(resolve, 3200));

    ArcanaApp.classSelector.close();
    ArcanaApp.classSelector.closeShowcase();
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
    const found = ArcanaApp.classSelector.getDisplayClassList().find(item => item.key === classKey);
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
