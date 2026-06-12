window.ArcanaApp = window.ArcanaApp || {};

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
    const state = ArcanaApp.state;
    state.pendingClassKey = ArcanaApp.classSelector.normalizeClassKey(classKey);
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

    state.pendingClassKey = state.hasSelectedClass ? state.currentClassKey : '';
    ArcanaApp.classSelector.openShowcase();
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
    state.touchPreviewClassKey = '';

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
      const hint = showcase.querySelector('.arcana-touch-hint');
      if (hint) hint.remove();
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
      if (event.target === showcase) {
        ArcanaApp.classSelector.cancelShowcaseSelection();
        return;
      }

      if (ArcanaApp.classSelector.isTouchMode()) {
        const interactive = event.target.closest('.arcana-showcase-card, .arcana-showcase-name-btn, .arcana-showcase-actions button');
        if (!interactive) ArcanaApp.classSelector.clearTouchPreview();
      }
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

      const front = document.createElement('span');
      front.className = 'arcana-showcase-card-face arcana-showcase-card-front';
      const icon = ArcanaApp.classSelector.createClassIcon(item.key, true);
      if (icon) front.appendChild(icon);
      const name = document.createElement('span');
      name.className = 'arcana-showcase-card-name';
      name.textContent = item.name;
      front.appendChild(name);

      const back = document.createElement('span');
      back.className = 'arcana-showcase-card-face arcana-showcase-card-back';
      const english = document.createElement('span');
      english.className = 'arcana-showcase-card-english';
      english.textContent = item.englishName || item.key;
      back.appendChild(english);

      inner.appendChild(front);
      inner.appendChild(back);
      card.appendChild(inner);

      card.addEventListener('mouseenter', () => ArcanaApp.classSelector.hoverShowcaseClass(item.key));
      card.addEventListener('focus', () => ArcanaApp.classSelector.hoverShowcaseClass(item.key));
      card.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        ArcanaApp.classSelector.handleShowcaseChoice(item.key, card);
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
        ArcanaApp.classSelector.handleShowcaseChoice(item.key, nameButton);
      });
      buttons.appendChild(nameButton);
    });
  },

  isTouchMode() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  },

  handleShowcaseChoice(classKey, targetElement) {
    const showcase = document.getElementById('arcanaClassShowcase');
    if (!showcase) return;

    if (ArcanaApp.classSelector.isTouchMode()) {
      const previewKey = ArcanaApp.state.touchPreviewClassKey || '';
      if (previewKey !== classKey) {
        ArcanaApp.state.touchPreviewClassKey = classKey;
        ArcanaApp.classSelector.hoverShowcaseClass(classKey);
        ArcanaApp.classSelector.showTouchHint(classKey, targetElement);
        return;
      }
    }

    ArcanaApp.classSelector.pickShowcaseClass(classKey);
  },

  clearTouchPreview() {
    const showcase = document.getElementById('arcanaClassShowcase');
    ArcanaApp.state.touchPreviewClassKey = '';

    if (!showcase) return;

    showcase.querySelectorAll('.arcana-showcase-card').forEach(card => card.classList.remove('is-hovered'));
    showcase.querySelectorAll('.arcana-showcase-name-btn').forEach(button => button.classList.remove('is-hovered'));

    const hint = showcase.querySelector('.arcana-touch-hint');
    if (hint) hint.remove();
  },

  showTouchHint(classKey, targetElement) {
    const showcase = document.getElementById('arcanaClassShowcase');
    const item = ArcanaApp.classSelector.getClassItem(classKey);
    if (!showcase || !item || !targetElement) return;

    let hint = showcase.querySelector('.arcana-touch-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'arcana-touch-hint';
      showcase.querySelector('.arcana-showcase-stage').appendChild(hint);
    }

    hint.innerHTML = `
      <strong>[${item.name}]</strong>
      <span>이 클래스로 진행하시는 거죠?</span>
      <small>맞으시면 한 번 더 터치,<br>다시 선택하시려면 아무 곳이나 터치해주세요.</small>
    `;

    const stage = showcase.querySelector('.arcana-showcase-stage');
    const targetRect = targetElement.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const left = targetRect.left + targetRect.width / 2 - stageRect.left;
    const top = Math.max(76, targetRect.top - stageRect.top - 86);
    hint.style.left = `${left}px`;
    hint.style.top = `${top}px`;
    hint.classList.add('is-visible');
  },

  hoverShowcaseClass(classKey) {
    const showcase = document.getElementById('arcanaClassShowcase');
    if (!showcase) return;

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
    if (!showcase) return;

    const nextKey = ArcanaApp.classSelector.normalizeClassKey(classKey);
    state.pendingClassKey = nextKey;
    state.showcaseSelectedKey = nextKey;
    state.touchPreviewClassKey = '';
    showcase.classList.add('is-picked');

    const hint = showcase.querySelector('.arcana-touch-hint');
    if (hint) hint.remove();

    showcase.querySelectorAll('.arcana-showcase-card').forEach(card => {
      const isSelected = card.dataset.classKey === nextKey;
      card.classList.toggle('is-selected', isSelected);
      card.classList.toggle('is-falling', !isSelected);
      card.classList.remove('is-hovered');
    });

    showcase.querySelectorAll('.arcana-showcase-name-btn').forEach(button => {
      button.classList.toggle('is-selected', button.dataset.classKey === nextKey);
      button.classList.remove('is-hovered');
    });

    const confirmButton = showcase.querySelector('#arcanaShowcaseConfirm');
    if (confirmButton) confirmButton.disabled = false;
  },

  cancelShowcaseSelection() {
    ArcanaApp.state.pendingClassKey = ArcanaApp.state.currentClassKey;
    ArcanaApp.state.showcaseSelectedKey = '';
    ArcanaApp.state.touchPreviewClassKey = '';
    ArcanaApp.classSelector.closeShowcase();
  },

  async confirmShowcase() {
    ArcanaApp.state.hasSeenClassShowcase = true;
    ArcanaApp.classSelector.closeShowcase();
    await ArcanaApp.classSelector.confirm();
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
    ArcanaApp.classSelector.closeShowcase();
    ArcanaApp.loadingOverlay.showPage('아르카나가 선택한 클래스의 스킬을 읽고 있어요.');

    try {
      state.currentClassKey = normalizedKey;
      state.pendingClassKey = normalizedKey;
      state.hasSelectedClass = true;
      state.hasSeenClassShowcase = true;
      ArcanaApp.classSelector.resetClassDependentState();
      ArcanaApp.classSelector.applyClassSkillData(normalizedKey);
      ArcanaApp.classSelector.clearSavedPanels();

      await ArcanaApp.classSelector.preloadClassAssets(normalizedKey);
      await new Promise(resolve => window.setTimeout(resolve, 1100));

      ArcanaApp.ui.renderAll();
      await new Promise(resolve => window.setTimeout(resolve, 250));
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

    if (!hasUsableData(classData) && ArcanaApp.api && ArcanaApp.api.getFallbackData) {
      const fallbackSkills = (ArcanaApp.api.getFallbackData().classSkills || {});
      classData = keys.map(key => fallbackSkills[ArcanaApp.classSelector.normalizeClassKey(key)] || fallbackSkills[key]).find(hasUsableData) || {};
      console.warn('[Arcana] 클래스 스킬 DB가 비어 있어 내장 스킬 데이터로 보정합니다:', normalizedKey);
    }

    ArcanaApp.state.arcanaTypes = ['성배', '양피지', '나침반', '종', '거울', '천칭'];
    ArcanaApp.state.activeSkills = Array.from(new Set((classData.active || []).map(skill => String(skill).trim()).filter(Boolean)));
    ArcanaApp.state.passiveSkills = Array.from(new Set((classData.passive || []).map(skill => String(skill).trim()).filter(Boolean)));
    ArcanaApp.state.skillsByArcana = ArcanaApp.classSelector.normalizeArcanaSkillMap({
      ...classData,
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

  validateArcanaSkillPool(arcanaName, pool, skillType) {
    const specs = ArcanaApp.classSelector.getArcanaSkillRuleSpecs();
    const spec = specs[arcanaName];
    const normalizedPool = Array.from(new Set((pool || []).map(skill => String(skill).trim()).filter(Boolean)));

    if (!spec) return normalizedPool;

    const activeSet = new Set((ArcanaApp.state.activeSkills || []).map(skill => String(skill).trim()).filter(Boolean));
    const passiveSet = new Set((ArcanaApp.state.passiveSkills || []).map(skill => String(skill).trim()).filter(Boolean));
    const expectedSet = spec.type === 'passive' ? passiveSet : activeSet;
    const wrongTypeSet = spec.type === 'passive' ? activeSet : passiveSet;
    const typeSafePool = normalizedPool.filter(skill => expectedSet.has(skill) && !wrongTypeSet.has(skill));
    const isValid = typeSafePool.length === spec.expectedCount;

    if (!isValid) {
      console.warn('[Arcana] 스킬 pool 검증 실패:', {
        arcanaName,
        expectedType: spec.type,
        expectedCount: spec.expectedCount,
        actualCount: typeSafePool.length,
        pool: typeSafePool
      });
      return [];
    }

    return typeSafePool;
  },

  normalizeArcanaSkillMap(classData) {
    const state = ArcanaApp.state;
    const ruleMap = ArcanaApp.classSelector.buildArcanaSkillRules(classData.active || [], classData.passive || []);
    const dbMap = classData.arcanaSkills || {};
    const allSkills = new Set([...(classData.active || []), ...(classData.passive || [])].map(skill => String(skill).trim()).filter(Boolean));
    const strictRuleSpecs = ArcanaApp.classSelector.getArcanaSkillRuleSpecs();

    return (state.arcanaTypes || []).reduce((map, arcanaName) => {
      const legacyName = arcanaName === '거울' ? '겨울' : arcanaName;
      const dbSource = dbMap[arcanaName] || dbMap[legacyName] || [];
      const normalizedDb = Array.from(new Set(dbSource.map(skill => String(skill).trim()).filter(skill => skill && allSkills.has(skill))));
      const ruleSource = ruleMap[arcanaName] || [];
      const normalizedRule = Array.from(new Set(ruleSource.map(skill => String(skill).trim()).filter(skill => skill && allSkills.has(skill))));
      const isStrictArcana = Boolean(strictRuleSpecs[arcanaName]);
      const source = isStrictArcana
        ? (normalizedDb.length > 0 ? normalizedDb : normalizedRule)
        : (normalizedDb.length > 0 ? normalizedDb : normalizedRule);
      map[arcanaName] = ArcanaApp.classSelector.validateArcanaSkillPool(arcanaName, source);
      return map;
    }, {});
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
