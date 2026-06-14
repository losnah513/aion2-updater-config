window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.tabs = {
  setRecommendTab(tabKey) {
    ArcanaApp.state.recommendationTab = tabKey;
    ArcanaApp.cardEditor.renderRecommendationArea();
  }
};
