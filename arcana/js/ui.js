window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.ui = {
  renderAll() {
    ArcanaApp.classSelector.render();
    ArcanaApp.skillSelector.render();
    ArcanaApp.characterEditor.render();
    ArcanaApp.equipmentEditor.render();
    ArcanaApp.cardEditor.render();
  },

  renderRecommendationResult(result) {
    const payload = result || {};
    ArcanaApp.state.recommendationCards = payload.cards || payload || {};
    ArcanaApp.state.recommendationMeta = payload.meta || ArcanaApp.state.recommendationMeta;
    ArcanaApp.state.recommendationGenerated = true;
    ArcanaApp.state.recommendationTab = 'cards';
    ArcanaApp.cardEditor.renderRecommendationArea();
  }
};
