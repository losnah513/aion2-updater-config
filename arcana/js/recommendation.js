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

        const allowLevelFour = need >= 4 && remainingCardPoint >= 4;
        const preferredMax = allowLevelFour ? 4 : 3;
        const level = Math.min(preferredMax, need, remainingCardPoint);
        if (level <= 0) return;

        recommendationCards[arcanaName].push({ skill: targetSkill, level });
        remainingCardPoint -= level;
      });

      while (recommendationCards[arcanaName].length < 4) {
        recommendationCards[arcanaName].push({ skill: '', level: 0 });
      }
    });

    const meta = ArcanaApp.recommendation.buildMeta(recommendationCards, baseLevels);
    state.recommendationCards = recommendationCards;
    state.recommendationMeta = meta;
    state.recommendationGenerated = true;
    return { cards: recommendationCards, meta };
  },

  buildMeta(cards, baseLevels) {
    const state = ArcanaApp.state;
    const recommendedLevels = ArcanaApp.simulator.calculateCardLevels(cards);
    const rows = state.selectedTargetSkills.map(skill => {
      const current = Number(state.characterLevels[skill] || 0);
      const equipment = Number(ArcanaApp.simulator.calculateEquipmentLevels(state.equipmentOptions)[skill] || 0);
      const owned = Number(ArcanaApp.simulator.calculateCardLevels(state.ownedCards)[skill] || 0);
      const recommended = Number(recommendedLevels[skill] || 0);
      const finalLevel = current + equipment + owned + recommended + state.devanionBonus;
      const shortage = Math.max(0, state.targetLevel - finalLevel);
      const must = shortage > 0 || recommended >= 4;

      return {
        skill,
        current,
        equipment,
        owned,
        recommended,
        bonus: state.devanionBonus,
        finalLevel,
        shortage,
        must
      };
    });

    const advice = ArcanaApp.recommendation.buildAdvice(rows);
    return { rows, advice };
  },

  buildAdvice(rows) {
    if (!rows || rows.length === 0) {
      return ['목표 스킬을 선택하면 부족한 부분을 기준으로 조언이 표시됩니다.'];
    }

    const shortageRows = rows.filter(row => row.shortage > 0);
    const hardRows = rows.filter(row => row.recommended >= 4);
    const advice = [];

    if (shortageRows.length > 0) {
      const names = shortageRows.slice(0, 3).map(row => `${row.skill} ${row.shortage}레벨 부족`).join(', ');
      advice.push(`${names} 상태입니다. 장비 옵션이나 현재 아르카나에서 보충이 필요합니다.`);
    }

    if (hardRows.length > 0) {
      const names = hardRows.slice(0, 3).map(row => row.skill).join(', ');
      advice.push(`${names}은 추천 아르카나에서 높은 레벨 확보가 중요합니다.`);
    }

    if (advice.length === 0) {
      advice.push('현재 입력값 기준으로 목표 스킬 20레벨 달성이 가능합니다.');
      advice.push('다른 세팅 추천을 눌러 대체 조합도 확인할 수 있습니다.');
    }

    return advice.slice(0, 3);
  }
};
