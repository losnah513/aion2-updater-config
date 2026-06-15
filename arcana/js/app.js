window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.app = {
  async init() {
    const data = await ArcanaApp.api.loadInitialData();
    const state = ArcanaApp.state;

    state.version = (ArcanaApp.versionManager && ArcanaApp.versionManager.appVersion) || ArcanaApp.config.version || data.version || 'ARC-0.3.02';
    state.targetLevel = Number(data.targetLevel || state.targetLevel || 20);
    state.baseSkillLevel = Number(data.baseSkillLevel || state.baseSkillLevel || 10);
    state.devanionBonus = Number(data.devanionBonus || state.devanionBonus || 4);
    state.maxCardLevel = Number(data.maxCardLevel || state.maxCardLevel || 5);
    state.maxSlotLevel = Number(data.maxSlotLevel || state.maxSlotLevel || 4);
    state.arcanaTypes = data.arcanaTypes || state.arcanaTypes;
    state.classList = ArcanaApp.classSelector.normalizeClassList(data.classList || state.classList);
    state.classSkills = ArcanaApp.app.normalizeClassSkillData(data.classSkills || {});

    ArcanaApp.app.hydrateSavedState(data);

    ArcanaApp.ui.renderAll();
    if (ArcanaApp.classEntryGate && typeof ArcanaApp.classEntryGate.init === 'function') ArcanaApp.classEntryGate.init();
    if (ArcanaApp.cta && typeof ArcanaApp.cta.init === 'function') ArcanaApp.cta.init();
    ArcanaApp.app.bindEvents();
  },



  normalizeClassSkillData(classSkills = {}) {
    const result = {};
    const mergeSkillData = (current = {}, next = {}) => {
      const mergeList = (a, b) => Array.from(new Set([...(a || []), ...(b || [])].map(item => String(item || '').trim()).filter(Boolean)));
      const mergeArcana = (a = {}, b = {}) => {
        const arcanaMap = {};
        [...Object.keys(a || {}), ...Object.keys(b || {})].forEach(arcanaName => {
          arcanaMap[arcanaName] = mergeList(a[arcanaName], b[arcanaName]);
        });
        return arcanaMap;
      };

      return {
        active: mergeList(current.active, next.active),
        passive: mergeList(current.passive, next.passive),
        arcanaSkills: mergeArcana(current.arcanaSkills, next.arcanaSkills)
      };
    };

    Object.entries(classSkills || {}).forEach(([rawKey, value]) => {
      const key = ArcanaApp.classService
        ? ArcanaApp.classService.normalizeKey(rawKey)
        : rawKey;
      if (!key) return;

      result[key] = mergeSkillData(result[key], value || {});
    });

    return result;
  },

  hydrateSavedState(data = {}) {
    const state = ArcanaApp.state;
    const savedCharacter = ArcanaApp.api.loadCharacterLevelsFromLocal();
    const savedEquipment = ArcanaApp.api.loadEquipmentOptionsFromLocal();
    const savedOwnedCards = ArcanaApp.api.mergeOwnedCards(data.ownedCards || {});
    const selectedSkills = Array.isArray(savedCharacter.selectedTargetSkills)
      ? savedCharacter.selectedTargetSkills
      : [];

    state.pendingClassKey = '';
    state.currentClassKey = '';
    state.hasSelectedClass = false;
    state.activeSkills = [];
    state.passiveSkills = [];
    state.skillsByArcana = {};
    state.selectedTargetSkills = selectedSkills;
    state.targetSkillLevels = savedCharacter.targetSkillLevels || {};
    state.targetSkillPriority20 = ArcanaApp.skillTargetRules
      ? ArcanaApp.skillTargetRules.normalizePriorityOrder(savedCharacter.targetSkillPriority20 || [], state.targetSkillLevels)
      : (savedCharacter.targetSkillPriority20 || []);
    state.activeSkillTargets = ArcanaApp.app.normalizeActiveSkillTargets(selectedSkills, state.targetSkillLevels);
    state.characterLevels = savedCharacter.characterLevels || {};
    state.characterSkillsSaved = selectedSkills.length > 0;
    state.equipmentOptions = ArcanaApp.app.normalizeRingOptions(savedEquipment);
    state.ringOptions = ArcanaApp.app.normalizeRingOptions(savedEquipment);
    state.selectedEquipmentKeys = ['ring1', 'ring2'];
    state.ownedCards = savedOwnedCards || {};
    state.recommendationCards = {};
    state.recommendationMeta = null;
    state.recommendationResult = null;
    state.recommendationGenerated = false;
    state.recommendationTab = 'cards';
  },

  normalizeRingOptions(options = {}) {
    return {
      ring1: Array.isArray(options.ring1) ? options.ring1 : [],
      ring2: Array.isArray(options.ring2) ? options.ring2 : []
    };
  },

  normalizeActiveSkillTargets(selectedSkills = [], targetSkillLevels = {}) {
    return selectedSkills.reduce((map, skill) => {
      map[skill] = Number(targetSkillLevels[skill] || ArcanaApp.state.targetLevel || 20);
      return map;
    }, {});
  },

  bindEvents() {
    if (ArcanaApp.app._eventsBound) return;
    ArcanaApp.app._eventsBound = true;

    ArcanaApp.classSelector.bind();
    ArcanaApp.confirmModal.bind();
    ArcanaApp.app.bindCharacterSave();
    ArcanaApp.app.bindEquipmentSave();
    ArcanaApp.app.bindArcanaCardSave();
    ArcanaApp.app.bindSimulation();
  },

  isTouchMode() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  },

  clearRecommendationTouchPreview() {
    const button = document.getElementById('arcanaRunSimulation');
    ArcanaApp.state.recommendationTouchArmed = false;
    if (button) button.classList.remove('is-touch-preview');
  },


  bindCharacterSave() {
    const saveButton = document.getElementById('arcanaSaveCharacterLevels');
    const clearButton = document.getElementById('arcanaClearCharacterLevels');
    if (!saveButton || !clearButton) return;

    saveButton.addEventListener('click', async () => {
      if (saveButton.dataset.editMode === 'saved') {
        ArcanaApp.panelLock.unlock('characterLevels', saveButton);
        ArcanaApp.panelLock.showMessage('characterLevels', '기존 선택을 유지한 채 수정할 수 있어요. 변경 후 다시 저장해주세요.');
        return;
      }

      if (!ArcanaApp.state.selectedTargetSkills || ArcanaApp.state.selectedTargetSkills.length === 0) {
        ArcanaApp.panelLock.showMessage('characterLevels', '최소 1개 이상 선택해야 저장할 수 있어요.');
        ArcanaApp.app.updateCharacterSaveButtonState();
        return;
      }

      try {
        ArcanaApp.panelLock.setSaving('characterLevels', saveButton);
        ArcanaApp.state.targetSkillPriority20 = ArcanaApp.skillTargetRules
          ? ArcanaApp.skillTargetRules.normalizePriorityOrder(ArcanaApp.state.targetSkillPriority20 || [], ArcanaApp.state.targetSkillLevels || {})
          : (ArcanaApp.state.targetSkillPriority20 || []);
        ArcanaApp.state.activeSkillTargets = ArcanaApp.app.normalizeActiveSkillTargets(ArcanaApp.state.selectedTargetSkills, ArcanaApp.state.targetSkillLevels || {});
        await ArcanaApp.api.saveCharacterLevels({
          selectedTargetSkills: ArcanaApp.state.selectedTargetSkills,
          targetSkillLevels: ArcanaApp.state.targetSkillLevels || {},
          targetSkillPriority20: ArcanaApp.state.targetSkillPriority20 || [],
          activeSkillTargets: ArcanaApp.state.activeSkillTargets
        });
        ArcanaApp.state.characterSkillsSaved = true;
        ArcanaApp.panelLock.setSaved('characterLevels', saveButton, '선택한 액티브 스킬이 저장되었어요. 다시 고르려면 초기화를 눌러주세요.');
        ArcanaApp.app.updateCharacterSaveButtonState();
        ArcanaApp.app.updateRecommendationButtonState();
      } catch (error) {
        ArcanaApp.panelLock.unlock('characterLevels', saveButton);
        ArcanaApp.panelLock.showMessage('characterLevels', error.message);
      }
    });

    clearButton.addEventListener('click', () => {
      ArcanaApp.state.selectedTargetSkills = [];
      ArcanaApp.state.targetSkillLevels = {};
      ArcanaApp.state.targetSkillPriority20 = [];
      ArcanaApp.state.characterLevels = {};
      ArcanaApp.state.activeSkillTargets = {};
      ArcanaApp.state.characterSkillsSaved = false;
      ArcanaApp.api.clearCharacterLevels();
      ArcanaApp.skillSelector.render();
      ArcanaApp.panelLock.unlock('characterLevels', saveButton);
      ArcanaApp.app.resetRecommendation();
      ArcanaApp.app.updateCharacterSaveButtonState();
      ArcanaApp.app.updateRecommendationButtonState();
    });
  },

  bindEquipmentSave() {
    const saveButton = document.getElementById('arcanaSaveEquipment');
    const clearButton = document.getElementById('arcanaClearEquipment');
    if (!saveButton || !clearButton) return;

    saveButton.addEventListener('click', async () => {
      if (saveButton.dataset.editMode === 'saved') {
        ArcanaApp.panelLock.unlock('equipmentOptions', saveButton);
        ArcanaApp.panelLock.showMessage('equipmentOptions', '저장된 반지 옵션을 유지한 채 수정할 수 있어요. 변경 후 다시 저장해주세요.');
        return;
      }

      try {
        const equipment = ArcanaApp.equipmentEditor.collect();
        ArcanaApp.panelLock.setSaving('equipmentOptions', saveButton);
        ArcanaApp.state.equipmentOptions = equipment;
        ArcanaApp.state.ringOptions = {
          ring1: equipment.ring1 || [],
          ring2: equipment.ring2 || []
        };
        await ArcanaApp.api.saveEquipmentOptions(equipment);
        ArcanaApp.panelLock.setSaved('equipmentOptions', saveButton, '반지 스킬 옵션이 저장되었어요. 수정하려면 수정하기를 눌러주세요.');
      } catch (error) {
        ArcanaApp.panelLock.unlock('equipmentOptions', saveButton);
        ArcanaApp.panelLock.showMessage('equipmentOptions', error.message);
      }
    });

    clearButton.addEventListener('click', () => {
      ArcanaApp.state.equipmentOptions = { ring1: [], ring2: [] };
      ArcanaApp.state.ringOptions = { ring1: [], ring2: [] };
      ArcanaApp.state.selectedEquipmentKeys = ['ring1', 'ring2'];
      ArcanaApp.api.clearEquipmentOptions();
      ArcanaApp.equipmentEditor.render();
      ArcanaApp.panelLock.unlock('equipmentOptions', saveButton);
      ArcanaApp.app.resetRecommendation();
    });
  },

  bindArcanaCardSave() {
    const saveButton = document.getElementById('arcanaSaveOwnedCards');
    const clearButton = document.getElementById('arcanaClearOwnedCards');
    if (!saveButton || !clearButton) return;

    saveButton.addEventListener('click', async () => {
      if (saveButton.dataset.editMode === 'saved') {
        ArcanaApp.panelLock.unlock('ownedArcanaCards', saveButton);
        ArcanaApp.panelLock.showMessage('ownedArcanaCards', '저장된 보유 아르카나를 유지한 채 수정할 수 있어요. 변경 후 다시 저장해주세요.');
        return;
      }

      try {
        const ownedCards = ArcanaApp.cardEditor.collect();
        ArcanaApp.panelLock.setSaving('ownedArcanaCards', saveButton);
        ArcanaApp.state.ownedCards = ownedCards;
        await ArcanaApp.api.saveOwnedCards(ownedCards);
        ArcanaApp.panelLock.setSaved('ownedArcanaCards', saveButton, '보유 아르카나 정보가 저장되었어요. 수정하려면 수정하기를 눌러주세요.');
        ArcanaApp.app.resetRecommendation();
      } catch (error) {
        ArcanaApp.panelLock.unlock('ownedArcanaCards', saveButton);
        ArcanaApp.panelLock.showMessage('ownedArcanaCards', error.message);
      }
    });

    clearButton.addEventListener('click', () => {
      ArcanaApp.state.ownedCards = {};
      ArcanaApp.api.clearOwnedCards();
      ArcanaApp.cardEditor.renderOwnedCards();
      ArcanaApp.panelLock.unlock('ownedArcanaCards', saveButton);
      ArcanaApp.app.resetRecommendation();
    });
  },

  bindSimulation() {
    const button = document.getElementById('arcanaRunSimulation');
    if (!button) return;

    const lockedMessage = '먼저 액티브 스킬을 선택하고 저장을 눌러주세요.';
    const showLockedMessage = () => {
      if (!ArcanaApp.app.canRunRecommendation()) {
        ArcanaApp.panelLock.showMessage('recommendArcanaCards', lockedMessage);
      }
    };

    button.addEventListener('mouseenter', showLockedMessage);
    button.addEventListener('touchstart', showLockedMessage, { passive: true });

    document.addEventListener('click', event => {
      if (!ArcanaApp.state.recommendationTouchArmed) return;
      if (button.contains(event.target)) return;
      ArcanaApp.app.clearRecommendationTouchPreview();
      ArcanaApp.panelLock.showMessage('recommendArcanaCards', '분석 실행을 취소했어요.');
    });

    button.addEventListener('click', async event => {
      if (!ArcanaApp.app.canRunRecommendation()) {
        showLockedMessage();
        return;
      }

      if (ArcanaApp.app.isTouchMode() && !ArcanaApp.state.recommendationTouchArmed) {
        event.preventDefault();
        ArcanaApp.state.recommendationTouchArmed = true;
        button.classList.add('is-touch-preview');
        ArcanaApp.panelLock.showMessage('recommendArcanaCards', '한 번 더 터치하면 분석을 시작합니다. 다른 곳을 터치하면 취소됩니다.');
        return;
      }

      ArcanaApp.app.clearRecommendationTouchPreview();

      try {
        ArcanaApp.state.equipmentOptions = ArcanaApp.equipmentEditor.collect();
        ArcanaApp.state.ringOptions = {
          ring1: ArcanaApp.state.equipmentOptions.ring1 || [],
          ring2: ArcanaApp.state.equipmentOptions.ring2 || []
        };
        ArcanaApp.state.ownedCards = ArcanaApp.cardEditor.collect();
      } catch (error) {
        ArcanaApp.panelLock.showMessage('recommendArcanaCards', error.message);
        return;
      }

      const recommendPanel = document.querySelector('[data-panel-key="recommendArcanaCards"]');
      let recommendationSucceeded = false;
      button.disabled = true;
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.classList.add('is-loading');
      if (ArcanaApp.cta && typeof ArcanaApp.cta.setLoading === 'function') {
        ArcanaApp.cta.setLoading();
      } else if (recommendPanel) {
        recommendPanel.classList.add('is-cta-loading');
      }

      try {
        // 추천 계산이 빨리 끝나도 CTA 진행 UX는 최소 시간 동안 유지한다.
        const result = ArcanaApp.recommendation.generate();
        if (ArcanaApp.cta && typeof ArcanaApp.cta.waitForMinimumDuration === 'function') {
          await ArcanaApp.cta.waitForMinimumDuration(5200);
        } else {
          await new Promise(resolve => window.setTimeout(resolve, 5200));
        }
        ArcanaApp.ui.renderRecommendationResult(result);
        recommendationSucceeded = true;
        ArcanaApp.panelLock.showMessage('recommendArcanaCards', ArcanaApp.state.recommendationMeta && ArcanaApp.state.recommendationMeta.ok === false ? '현재 조건에서는 20레벨 달성 조합을 찾지 못했어요. 분석 탭에서 부족 스킬을 확인해주세요.' : '추천 결과가 준비되었어요. 탭을 눌러 분석과 조언을 확인해보세요.');
      } catch (error) {
        if (ArcanaApp.cta && typeof ArcanaApp.cta.waitForMinimumDuration === 'function') {
          await ArcanaApp.cta.waitForMinimumDuration(5200);
        }
        ArcanaApp.state.recommendationGenerated = false;
        ArcanaApp.panelLock.showMessage('recommendArcanaCards', error.message || '분석 중 오류가 발생했어요.');
      } finally {
        if (ArcanaApp.cta && typeof ArcanaApp.cta.setSuccess === 'function' && typeof ArcanaApp.cta.setError === 'function') {
          recommendationSucceeded ? ArcanaApp.cta.setSuccess() : ArcanaApp.cta.setError();
        } else if (recommendPanel) {
          recommendPanel.classList.remove('is-cta-loading');
        }
        button.disabled = false;
        if (ArcanaApp.cta && typeof ArcanaApp.cta.setIdle === 'function') ArcanaApp.cta.setIdle();
        else button.textContent = '분석 시작';
        button.classList.remove('is-vanishing', 'is-loading');
        ArcanaApp.app.updateRecommendationButtonState();
      }
    });

    ArcanaApp.app.updateRecommendationButtonState();
  },

  updateCharacterSaveButtonState() {
    const saveButton = document.getElementById('arcanaSaveCharacterLevels');
    if (!saveButton) return;

    const panel = document.querySelector('[data-panel-key="characterLevels"]');
    const isSaved = Boolean(panel && panel.classList.contains('is-saved'));
    const hasClass = Boolean(ArcanaApp.state.hasSelectedClass);
    const hasSelection = Boolean((ArcanaApp.state.selectedTargetSkills || []).length > 0);

    if (isSaved) {
      saveButton.disabled = false;
      return;
    }

    saveButton.disabled = !(hasClass && hasSelection);

    if (hasClass && !hasSelection) {
      ArcanaApp.panelLock.showMessage('characterLevels', '최소 1개 이상 선택해야 저장할 수 있어요.');
    }
  },

  canRunRecommendation() {
    return Boolean(
      ArcanaApp.state.hasSelectedClass &&
      ArcanaApp.state.characterSkillsSaved &&
      Array.isArray(ArcanaApp.state.selectedTargetSkills) &&
      ArcanaApp.state.selectedTargetSkills.length > 0
    );
  },

  updateRecommendationButtonState() {
    const button = document.getElementById('arcanaRunSimulation');
    if (!button) return;

    const canRun = ArcanaApp.app.canRunRecommendation();
    button.hidden = false;
    button.classList.toggle('is-soft-disabled', !canRun);
    button.setAttribute('aria-disabled', canRun ? 'false' : 'true');

    if (!ArcanaApp.state.recommendationGenerated) {
      ArcanaApp.panelLock.showMessage(
        'recommendArcanaCards',
        canRun ? '분석을 시작할 준비가 되었어요.' : '액티브 스킬을 저장하면 분석을 시작할 수 있어요.'
      );
    }
  },

  resetRecommendation() {
    ArcanaApp.state.recommendationCards = {};
    ArcanaApp.state.recommendationMeta = null;
    ArcanaApp.state.recommendationResult = null;
    ArcanaApp.state.recommendationGenerated = false;
    ArcanaApp.state.recommendationTab = 'cards';
    ArcanaApp.cardEditor.renderRecommendationArea();

    const button = document.getElementById('arcanaRunSimulation');
    if (button) {
      button.hidden = false;
      button.disabled = false;
      if (ArcanaApp.cta && typeof ArcanaApp.cta.setIdle === 'function') ArcanaApp.cta.setIdle();
      else button.textContent = '분석 시작';
      button.classList.remove('is-vanishing', 'is-loading', 'is-touch-preview');
    }

    ArcanaApp.panelLock.showMessage('recommendArcanaCards', '');
    ArcanaApp.app.updateRecommendationButtonState();
  }
};

document.addEventListener('DOMContentLoaded', ArcanaApp.app.init);
