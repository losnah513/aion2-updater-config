window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.app = {
  async init() {
    const data = await ArcanaApp.api.loadInitialData();
    const state = ArcanaApp.state;

    state.version = data.version || state.version;
    state.targetLevel = data.targetLevel || state.targetLevel;
    state.devanionBonus = data.devanionBonus || state.devanionBonus;
    state.arcanaTypes = data.arcanaTypes || state.arcanaTypes;
    state.skillsByArcana = data.skillsByArcana || {};
    state.ownedCards = data.ownedCards || ArcanaApp.api.loadOwnedCardsFromLocal() || {};

    ArcanaApp.ui.renderAll();
    ArcanaApp.app.bindEvents();
  },

  bindEvents() {
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
