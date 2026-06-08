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
    state.activeSkills = data.activeSkills || [];
    state.passiveSkills = data.passiveSkills || [];
    state.ownedCards = ArcanaApp.api.mergeOwnedCards(data.ownedCards);
    state.characterLevels = ArcanaApp.api.loadCharacterLevelsFromLocal();
    state.ringOptions = ArcanaApp.api.loadRingOptionsFromLocal();

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
    const classSelect = document.getElementById('arcanaClassSelect');
    if (classSelect) {
      classSelect.addEventListener('change', event => {
        ArcanaApp.state.currentClassKey = event.target.value;
        ArcanaApp.state.selectedTargetSkills = [];
        ArcanaApp.state.recommendationCards = {};
        ArcanaApp.ui.renderAll();
      });
    }

    document.getElementById('arcanaSaveCharacterLevels').addEventListener('click', async () => {
      try {
        const levels = ArcanaApp.characterEditor.collect();
        ArcanaApp.state.characterLevels = levels;
        await ArcanaApp.api.saveCharacterLevels(levels);
        alert('캐릭터 스킬 레벨이 저장되었습니다.');
      } catch (error) {
        alert(error.message);
      }
    });

    document.getElementById('arcanaClearCharacterLevels').addEventListener('click', () => {
      ArcanaApp.state.characterLevels = {};
      ArcanaApp.api.clearCharacterLevels();
      ArcanaApp.characterEditor.render();
    });

    document.getElementById('arcanaSaveRings').addEventListener('click', async () => {
      try {
        const rings = ArcanaApp.ringEditor.collect();
        ArcanaApp.state.ringOptions = rings;
        await ArcanaApp.api.saveRingOptions(rings);
        ArcanaApp.ringEditor.render();
        alert('반지 옵션이 저장되었습니다.');
      } catch (error) {
        alert(error.message);
      }
    });

    document.getElementById('arcanaClearRings').addEventListener('click', () => {
      ArcanaApp.state.ringOptions = { ring1: [], ring2: [] };
      ArcanaApp.api.clearRingOptions();
      ArcanaApp.ringEditor.render();
    });

    document.getElementById('arcanaSaveOwnedCards').addEventListener('click', async () => {
      try {
        const ownedCards = ArcanaApp.cardEditor.collect();
        ArcanaApp.state.ownedCards = ownedCards;
        await ArcanaApp.api.saveOwnedCards(ownedCards);
        alert('보유 아르카나가 저장되었습니다.');
      } catch (error) {
        alert(error.message);
      }
    });

    document.getElementById('arcanaClearOwnedCards').addEventListener('click', () => {
      ArcanaApp.state.ownedCards = {};
      ArcanaApp.state.recommendationCards = {};
      ArcanaApp.api.clearOwnedCards();
      ArcanaApp.cardEditor.render();
    });

    document.getElementById('arcanaRunSimulation').addEventListener('click', () => {
      try {
        ArcanaApp.state.characterLevels = ArcanaApp.characterEditor.collect();
        ArcanaApp.state.ringOptions = ArcanaApp.ringEditor.collect();
        ArcanaApp.state.ownedCards = ArcanaApp.cardEditor.collect();
      } catch (error) {
        alert(error.message);
        return;
      }

      const cards = ArcanaApp.recommendation.generate();
      ArcanaApp.ui.renderRecommendationCards(cards);
    });
  }
};

document.addEventListener('DOMContentLoaded', ArcanaApp.app.init);
