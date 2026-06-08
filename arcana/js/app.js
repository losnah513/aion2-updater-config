window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.app = {
  async init() {
    const data = await ArcanaApp.api.loadInitialData();
    const state = ArcanaApp.state;

    state.version = data.version || state.version;
    state.targetLevel = data.targetLevel || state.targetLevel;
    state.devanionBonus = data.devanionBonus || state.devanionBonus;
    state.maxCardLevel = data.maxCardLevel || state.maxCardLevel;
    state.maxSlotLevel = data.maxSlotLevel || state.maxSlotLevel;
    state.arcanaTypes = data.arcanaTypes || state.arcanaTypes;
    state.skillsByArcana = data.skillsByArcana || {};
    state.classList = data.classList || state.classList;
    state.classSkills = data.classSkills || {};

    if (!state.classList.some(item => item.key === state.currentClassKey)) {
      state.currentClassKey = state.classList[0] ? state.classList[0].key : state.currentClassKey;
    }
    state.activeSkills = data.activeSkills || [];
    state.passiveSkills = data.passiveSkills || [];
    state.ownedCards = ArcanaApp.api.mergeOwnedCards(data.ownedCards);
    state.characterLevels = ArcanaApp.api.loadCharacterLevelsFromLocal();
    state.equipmentOptions = ArcanaApp.api.loadEquipmentOptionsFromLocal();
    state.ringOptions = {
      ring1: state.equipmentOptions.ring1 || [],
      ring2: state.equipmentOptions.ring2 || []
    };

    ArcanaApp.app.renderClassOptions();
    ArcanaApp.ui.renderAll();
    ArcanaApp.app.bindEvents();
  },

  renderClassOptions() {
    const select = document.getElementById('arcanaClassSelect');
    if (!select) return;

    select.innerHTML = '';
    ArcanaApp.state.classList.forEach(item => {
      const option = document.createElement('option');
      option.value = item.key;
      option.textContent = item.name;
      select.appendChild(option);
    });

    select.value = ArcanaApp.state.currentClassKey;
  },

  bindEvents() {
    ArcanaApp.app.bindClassChange();
    ArcanaApp.app.bindCharacterSave();
    ArcanaApp.app.bindEquipmentSave();
    ArcanaApp.app.bindArcanaCardSave();
    ArcanaApp.app.bindSimulation();
  },

  bindClassChange() {
    const classSelect = document.getElementById('arcanaClassSelect');
    if (!classSelect) return;

    classSelect.addEventListener('change', event => {
      ArcanaApp.state.currentClassKey = event.target.value;
      ArcanaApp.state.selectedTargetSkills = [];
      ArcanaApp.state.recommendationCards = {};
      ArcanaApp.ui.renderAll();
    });
  },

  bindCharacterSave() {
    const saveButton = document.getElementById('arcanaSaveCharacterLevels');
    const clearButton = document.getElementById('arcanaClearCharacterLevels');

    saveButton.addEventListener('click', async () => {
      try {
        const levels = ArcanaApp.characterEditor.collect();
        ArcanaApp.panelLock.setSaving('characterLevels', saveButton);
        ArcanaApp.state.characterLevels = levels;
        await ArcanaApp.api.saveCharacterLevels(levels);
        ArcanaApp.panelLock.setSaved('characterLevels', saveButton, '캐릭터 스킬 레벨을 저장했습니다. 수정하려면 초기화를 눌러주세요.');
      } catch (error) {
        ArcanaApp.panelLock.unlock('characterLevels', saveButton);
        ArcanaApp.panelLock.showMessage('characterLevels', error.message);
      }
    });

    clearButton.addEventListener('click', () => {
      ArcanaApp.state.characterLevels = {};
      ArcanaApp.api.clearCharacterLevels();
      ArcanaApp.characterEditor.render();
      ArcanaApp.panelLock.unlock('characterLevels', saveButton);
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
        ArcanaApp.panelLock.setSaved('equipmentOptions', saveButton, '장비 스킬 옵션을 저장했습니다. 수정하려면 초기화를 눌러주세요.');
      } catch (error) {
        ArcanaApp.panelLock.unlock('equipmentOptions', saveButton);
        ArcanaApp.panelLock.showMessage('equipmentOptions', error.message);
      }
    });

    clearButton.addEventListener('click', () => {
      ArcanaApp.state.equipmentOptions = { weapon: [], guarder: [], ring1: [], ring2: [] };
      ArcanaApp.state.ringOptions = { ring1: [], ring2: [] };
      ArcanaApp.api.clearEquipmentOptions();
      ArcanaApp.equipmentEditor.render();
      ArcanaApp.panelLock.unlock('equipmentOptions', saveButton);
    });
  },

  bindArcanaCardSave() {
    const saveButton = document.getElementById('arcanaSaveOwnedCards');
    const clearButton = document.getElementById('arcanaClearOwnedCards');

    saveButton.addEventListener('click', async () => {
      try {
        const ownedCards = ArcanaApp.cardEditor.collect();
        ArcanaApp.panelLock.setSaving('arcanaCards', saveButton);
        ArcanaApp.state.ownedCards = ownedCards;
        await ArcanaApp.api.saveOwnedCards(ownedCards);
        ArcanaApp.panelLock.setSaved('arcanaCards', saveButton, '보유 아르카나 옵션을 저장했습니다. 수정하려면 초기화를 눌러주세요.');
      } catch (error) {
        ArcanaApp.panelLock.unlock('arcanaCards', saveButton);
        ArcanaApp.panelLock.showMessage('arcanaCards', error.message);
      }
    });

    clearButton.addEventListener('click', () => {
      ArcanaApp.state.ownedCards = {};
      ArcanaApp.state.recommendationCards = {};
      ArcanaApp.api.clearOwnedCards();
      ArcanaApp.cardEditor.render();
      ArcanaApp.panelLock.unlock('arcanaCards', saveButton);
    });
  },

  bindSimulation() {
    document.getElementById('arcanaRunSimulation').addEventListener('click', () => {
      try {
        ArcanaApp.state.characterLevels = ArcanaApp.characterEditor.collect();
        ArcanaApp.state.equipmentOptions = ArcanaApp.equipmentEditor.collect();
        ArcanaApp.state.ringOptions = {
          ring1: ArcanaApp.state.equipmentOptions.ring1 || [],
          ring2: ArcanaApp.state.equipmentOptions.ring2 || []
        };
        ArcanaApp.state.ownedCards = ArcanaApp.cardEditor.collect();
      } catch (error) {
        ArcanaApp.panelLock.showMessage('arcanaCards', error.message);
        return;
      }

      const cards = ArcanaApp.recommendation.generate();
      ArcanaApp.ui.renderRecommendationCards(cards);
    });
  }
};

document.addEventListener('DOMContentLoaded', ArcanaApp.app.init);
