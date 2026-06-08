window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.recommendation = {
  generate() {
    const state = ArcanaApp.state;
    const ownedLevels = ArcanaApp.simulator.calculateLevels(state.ownedCards);
    const recommendationCards = {};

    state.arcanaTypes.forEach(arcanaName => {
      recommendationCards[arcanaName] = [];
      const availableSkills = state.skillsByArcana[arcanaName] || [];
      let remainingCardPoint = state.maxCardLevel;

      state.selectedTargetSkills.forEach(targetSkill => {
        if (remainingCardPoint <= 0) return;
        if (!availableSkills.includes(targetSkill)) return;
        if (recommendationCards[arcanaName].some(slot => slot.skill === targetSkill)) return;

        const currentLevel = ownedLevels[targetSkill] || 0;
        const alreadyRecommended = ArcanaApp.simulator.calculateLevels(recommendationCards)[targetSkill] || 0;
        const needWithoutDevanion = Math.max(0, state.targetLevel - state.devanionBonus - currentLevel - alreadyRecommended);

        if (needWithoutDevanion <= 0) return;

        const preferredLevel = Math.min(3, needWithoutDevanion, remainingCardPoint);
        const emergencyLevel = Math.min(state.maxSlotLevel, needWithoutDevanion, remainingCardPoint);
        const level = preferredLevel > 0 ? preferredLevel : emergencyLevel;

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
