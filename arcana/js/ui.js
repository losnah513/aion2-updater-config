window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.ui = {
  renderOrder: [
    ['classSelector', 'render'],
    ['skillSelector', 'render'],
    ['characterEditor', 'render'],
    ['equipmentEditor', 'render'],
    ['cardEditor', 'render']
  ],

  renderAll() {
    const errors = [];

    ArcanaApp.ui.renderOrder.forEach(([moduleName, methodName]) => {
      try {
        const module = ArcanaApp[moduleName];
        if (module && typeof module[methodName] === 'function') {
          module[methodName]();
        }
      } catch (error) {
        errors.push({ moduleName, error });
        console.error(`[Arcana] renderAll: ${moduleName}.${methodName} 실패`, error);
      }
    });

    if (ArcanaApp.app && typeof ArcanaApp.app.updateCharacterSaveButtonState === 'function') {
      try { ArcanaApp.app.updateCharacterSaveButtonState(); } catch (error) { console.error('[Arcana] 스킬 저장 버튼 상태 갱신 실패', error); }
    }

    if (ArcanaApp.app && typeof ArcanaApp.app.updateRecommendationButtonState === 'function') {
      try { ArcanaApp.app.updateRecommendationButtonState(); } catch (error) { console.error('[Arcana] 추천 버튼 상태 갱신 실패', error); }
    }

    return { ok: errors.length === 0, errors };
  },

  renderRecommendationResult(result) {
    const payload = result || {};
    ArcanaApp.state.recommendationCards = payload.cards || payload || {};
    ArcanaApp.state.recommendationMeta = payload.meta || ArcanaApp.state.recommendationMeta;
    ArcanaApp.state.recommendationResult = payload;
    ArcanaApp.state.recommendationGenerated = true;
    ArcanaApp.state.recommendationTab = 'cards';
    ArcanaApp.cardEditor.renderRecommendationArea();
  }
};
