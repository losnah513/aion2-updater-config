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
        ArcanaApp.skillSelector.render();
        ArcanaApp.ui.renderResults();
        ArcanaApp.ui.renderRecommendationCards({});
      });
    }

    document.getElementById('arcanaSaveOwnedCards').addEventListener('click', async () => {
      try {
        const ownedCards = ArcanaApp.cardEditor.collect();
        ArcanaApp.state.ownedCards = ownedCards;
        await ArcanaApp.api.saveOwnedCards(ownedCards);
        ArcanaApp.ui.renderResults();
        alert('보유 카드가 저장되었습니다.');
      } catch (error) {
        alert(error.message);
      }
    });

    document.getElementById('arcanaClearOwnedCards').addEventListener('click', () => {
      ArcanaApp.state.ownedCards = {};
      ArcanaApp.state.recommendationCards = {};
      ArcanaApp.api.clearOwnedCards();
      ArcanaApp.cardEditor.render();
      ArcanaApp.ui.renderResults();
      ArcanaApp.ui.renderRecommendationCards({});
    });

    document.getElementById('arcanaRunSimulation').addEventListener('click', () => {
      try {
        ArcanaApp.state.ownedCards = ArcanaApp.cardEditor.collect();
      } catch (error) {
        alert(error.message);
        return;
      }

      const cards = ArcanaApp.recommendation.generate();
      ArcanaApp.ui.renderRecommendationCards(cards);
      ArcanaApp.ui.renderResults();
    });
  }
};

document.addEventListener('DOMContentLoaded', ArcanaApp.app.init);
