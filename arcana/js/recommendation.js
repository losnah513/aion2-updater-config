window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.recommendation = {
  generate() {
    const state = ArcanaApp.state;
    const baseLevels = ArcanaApp.simulator.calculateBaseLevels();
    const recommendationCards = {};

    state.arcanaTypes.forEach(arcanaName => {
      recommendationCards[arcanaName] = [];
      const availableSkills = state.skillsByArcana[arcanaName] || [];
      let remainingCardPoint = state.maxCardLevel;

      state.selectedTargetSkills.forEach(targetSkill => {
        if (remainingCardPoint <= 0) return;
        if (!availableSkills.includes(targetSkill)) return;
        if (recommendationCards[arcanaName].some(slot => slot.skill === targetSkill)) return;

        const currentLevel = baseLevels[targetSkill] || 0;
        const alreadyRecommended = ArcanaApp.simulator.calculateCardLevels(recommendationCards)[targetSkill] || 0;
        const need = Math.max(0, state.targetLevel - state.devanionBonus - currentLevel - alreadyRecommended);

        if (need <= 0) return;

        const level = Math.min(3, need, remainingCardPoint);
        if (level <= 0) return;

        recommendationCards[arcanaName].push({ skill: targetSkill, level });
        remainingCardPoint -= level;
      });

      while (recommendationCards[arcanaName].length < 4) {
        recommendationCards[arcanaName].push({ skill: '', level: 0 });
      }
    });

    state.recommendationCards = recommendationCards;
    return recommendationCards;
  }
};
