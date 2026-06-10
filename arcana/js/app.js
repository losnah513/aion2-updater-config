window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.app = {
  async init() {
    const data = await ArcanaApp.api.loadInitialData();
    const state = ArcanaApp.state;

    state.version = ArcanaApp.config.version || 'ARC-0.2.05';
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
    state.selectedEquipmentKeys = [];
    state.recommendationCards = {};
    state.recommendationMeta = null;
    state.recommendationGenerated = false;
    state.recommendationTab = 'cards';

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

  bindCharacterSave() {
    const saveButton = document.getElementById('arcanaSaveCharacterLevels');
    const clearButton = document.getElementById('arcanaClearCharacterLevels');

    saveButton.addEventListener('click', async () => {
      try {
        ArcanaApp.panelLock.setSaving('characterLevels', saveButton);
        await ArcanaApp.api.saveCharacterLevels({ selectedTargetSkills: ArcanaApp.state.selectedTargetSkills });
        ArcanaApp.panelLock.setSaved('characterLevels', saveButton, '선택한 액티브 스킬이 저장되었어요. 다시 고르려면 초기화를 눌러주세요.');
      } catch (error) {
        ArcanaApp.panelLock.unlock('characterLevels', saveButton);
        ArcanaApp.panelLock.showMessage('characterLevels', error.message);
      }
    });

    clearButton.addEventListener('click', () => {
      ArcanaApp.state.selectedTargetSkills = [];
      ArcanaApp.state.characterLevels = {};
      ArcanaApp.api.clearCharacterLevels();
      ArcanaApp.skillSelector.render();
      ArcanaApp.panelLock.unlock('characterLevels', saveButton);
      ArcanaApp.app.resetRecommendation();
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
      ArcanaApp.state.selectedEquipmentKeys = [];
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
    button.addEventListener('click', async () => {
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
      button.textContent = '추천 분석중';

      await ArcanaApp.loadingOverlay.play('recommendArcanaCards', '키노조 AI가 분석 중입니다', () => {
        const result = ArcanaApp.recommendation.generate();
        ArcanaApp.ui.renderRecommendationResult(result);
      });

      button.disabled = false;
      button.textContent = '다른 세팅 추천';
      ArcanaApp.panelLock.showMessage('recommendArcanaCards', '추천 결과가 준비되었어요. 탭을 눌러 분석과 조언을 확인해보세요.');
    });
  },

  resetRecommendation() {
    ArcanaApp.state.recommendationCards = {};
    ArcanaApp.state.recommendationMeta = null;
    ArcanaApp.state.recommendationGenerated = false;
    ArcanaApp.state.recommendationTab = 'cards';
    ArcanaApp.cardEditor.renderRecommendationArea();

    const button = document.getElementById('arcanaRunSimulation');
    if (button) {
      button.disabled = false;
      button.textContent = '추천 시작';
    }

    ArcanaApp.panelLock.showMessage('recommendArcanaCards', '');
  }
};

document.addEventListener('DOMContentLoaded', ArcanaApp.app.init);
