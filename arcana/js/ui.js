window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.ui = {
  renderAll() {
    ArcanaApp.skillSelector.render();
    ArcanaApp.characterEditor.render();
    ArcanaApp.equipmentEditor.render();
    ArcanaApp.cardEditor.render();
  },

  renderRecommendationCards(cards) {
    ArcanaApp.state.recommendationCards = cards || {};
    ArcanaApp.cardEditor.render();
  }
};
