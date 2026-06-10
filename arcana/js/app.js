window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.app = {
  async init() {
    const data = await ArcanaApp.api.loadInitialData();
    const state = ArcanaApp.state;

    state.version = ArcanaApp.config.version || 'ARC-0.2.04';
    state.targetLevel = data.targetLevel || state.targetLevel;
    state.baseSkillLevel = data.baseSkillLevel || state.baseSkillLevel;
    state.devanionBonus = data.devanionBonus || state.devanionBonus;
    state.maxCardLevel = data.maxCardLevel || state.maxCardLevel;
    state.maxSlotLevel = data.maxSlotLevel || state.maxSlotLevel;
    state.arcanaTypes = data.arcanaTypes || state.arcanaTypes;
    state.classList = ArcanaApp.classSelector.normalizeClassList(data.classList || state.classList);
    state.classSkills = data.classSkills || {};
    state.skillsByArcana = {};

    state.pendingClassKey = '';
    state.currentClassKey = '';
    state.hasSelectedClass = false;
    state.hasSeenClassShowcase = false;
    state.showcaseSelectedKey = '';
    state.activeSkills = [];
    state.passiveSkills = [];
    state.ownedCards = {};
    state.characterLevels = {};
    state.equipmentOptions = { ring1: [], ring2: [] };
    state.ringOptions = { ring1: [], ring2: [] };
    state.selectedEquipmentKeys = ['ring1', 'ring2'];
    state.recommendationCards = {};
    state.recommendationMeta = null;
    state.recommendationGenerated = false;
    state.recommendationTab = 'cards';
    state.characterSkillsSaved = false;

    ArcanaApp.ui.renderAll();
    ArcanaApp.app.bindEvents();
  },

  bindEvents() {
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

    saveButton.addEventListener('click', async () => {
      if (!ArcanaApp.state.selectedTargetSkills || ArcanaApp.state.selectedTargetSkills.length === 0) {
        ArcanaApp.panelLock.showMessage('characterLevels', '최소 1개 이상 선택해야 저장할 수 있어요.');
        ArcanaApp.app.updateCharacterSaveButtonState();
        return;
      }

      try {
        ArcanaApp.panelLock.setSaving('characterLevels', saveButton);
        await ArcanaApp.api.saveCharacterLevels({ selectedTargetSkills: ArcanaApp.state.selectedTargetSkills });
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
      ArcanaApp.state.characterLevels = {};
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

    saveButton.addEventListener('click', async () => {
      try {
        const equipment = ArcanaApp.equipmentEditor.collect();
        ArcanaApp.panelLock.setSaving('equipmentOptions', saveButton);
        ArcanaApp.state.equipmentOptions = equipment;
        ArcanaApp.state.ringOptions = {
          ring1: equipment.ring1 || [],
          ring2: equipment.ring2 || []
        };
        await ArcanaApp.api.saveEquipmentOptions(equipment);
        ArcanaApp.panelLock.setSaved('equipmentOptions', saveButton, '반지 스킬 옵션이 저장되었어요. 추천 계산에 함께 반영할게요.');
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

    saveButton.addEventListener('click', async () => {
      try {
        const ownedCards = ArcanaApp.cardEditor.collect();
        ArcanaApp.panelLock.setSaving('ownedArcanaCards', saveButton);
        ArcanaApp.state.ownedCards = ownedCards;
        await ArcanaApp.api.saveOwnedCards(ownedCards);
        ArcanaApp.panelLock.setSaved('ownedArcanaCards', saveButton, '보유 아르카나 정보가 저장되었어요. 이제 추천 시작을 눌러보세요.');
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
      ArcanaApp.panelLock.showMessage('recommendArcanaCards', '추천 실행을 취소했어요.');
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
        ArcanaApp.panelLock.showMessage('recommendArcanaCards', '한 번 더 터치하면 추천 계산을 시작합니다. 다른 곳을 터치하면 취소됩니다.');
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

      button.disabled = true;
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = '분석중';
      button.classList.add('is-vanishing', 'is-loading');
      await new Promise(resolve => window.setTimeout(resolve, 460));
      button.hidden = true;

      await ArcanaApp.loadingOverlay.play('recommendArcanaCards', '아르카나가 저장한 스킬 흐름을 살펴보고 있어요.', () => {
        const result = ArcanaApp.recommendation.generate();
        ArcanaApp.ui.renderRecommendationResult(result);
      });

      button.hidden = false;
      button.disabled = false;
      button.textContent = '추천 시작';
      button.classList.remove('is-vanishing', 'is-loading');
      button.hidden = true;
      ArcanaApp.panelLock.showMessage('recommendArcanaCards', ArcanaApp.state.recommendationMeta && ArcanaApp.state.recommendationMeta.ok === false ? '현재 조건에서는 20레벨 달성 조합을 찾지 못했어요. 분석 탭에서 부족 스킬을 확인해주세요.' : '추천 결과가 준비되었어요. 탭을 눌러 분석과 조언을 확인해보세요.');
      ArcanaApp.app.updateRecommendationButtonState();
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
      saveButton.disabled = true;
      return;
    }

    saveButton.disabled = !(hasClass && hasSelection);

    if (hasClass && !hasSelection) {
      ArcanaApp.panelLock.showMessage('characterLevels', '최소 1개 이상 선택해야 저장할 수 있어요.');
    }
  },

  canRunRecommendation() {
    return Boolean(ArcanaApp.state.characterSkillsSaved && ArcanaApp.state.selectedTargetSkills.length > 0);
  },

  updateRecommendationButtonState() {
    const button = document.getElementById('arcanaRunSimulation');
    if (!button) return;

    const canRun = ArcanaApp.app.canRunRecommendation();
    button.hidden = Boolean(ArcanaApp.state.recommendationGenerated);
    button.classList.toggle('is-soft-disabled', !canRun);
    button.setAttribute('aria-disabled', canRun ? 'false' : 'true');

    if (!ArcanaApp.state.recommendationGenerated) {
      ArcanaApp.panelLock.showMessage(
        'recommendArcanaCards',
        canRun ? '추천을 시작할 준비가 되었어요.' : '액티브 스킬을 저장하면 추천을 시작할 수 있어요.'
      );
    }
  },

  resetRecommendation() {
    ArcanaApp.state.recommendationCards = {};
    ArcanaApp.state.recommendationMeta = null;
    ArcanaApp.state.recommendationGenerated = false;
    ArcanaApp.state.recommendationTab = 'cards';
    ArcanaApp.cardEditor.renderRecommendationArea();

    const button = document.getElementById('arcanaRunSimulation');
    if (button) {
      button.hidden = false;
      button.disabled = false;
      button.textContent = '추천 시작';
      button.classList.remove('is-vanishing', 'is-loading', 'is-touch-preview');
    }

    ArcanaApp.panelLock.showMessage('recommendArcanaCards', '');
    ArcanaApp.app.updateRecommendationButtonState();
  }
};

document.addEventListener('DOMContentLoaded', ArcanaApp.app.init);
