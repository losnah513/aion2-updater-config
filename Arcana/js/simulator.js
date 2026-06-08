window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.simulator = {
  calculateLevels(cards) {
    const state = ArcanaApp.state;
    const levels = {};

    Object.values(cards || {}).flat().forEach(slot => {
      if (!slot || !slot.skill) return;

      const skill = slot.skill.trim();
      const level = Number(slot.level || 0);

      if (!skill || level <= 0) return;
      levels[skill] = (levels[skill] || 0) + level;
    });

    return levels;
  },

  calculateFinalResult(ownedCards, recommendationCards) {
    const state = ArcanaApp.state;
    const ownedLevels = ArcanaApp.simulator.calculateLevels(ownedCards);
    const recommendationLevels = ArcanaApp.simulator.calculateLevels(recommendationCards);

    return state.selectedTargetSkills.map(skill => {
      const owned = ownedLevels[skill] || 0;
      const recommended = recommendationLevels[skill] || 0;
      const finalLevel = owned + recommended + state.devanionBonus;

      return {
        skill,
        owned,
        recommended,
        devanionBonus: state.devanionBonus,
        finalLevel,
        shortage: Math.max(0, state.targetLevel - finalLevel),
        success: finalLevel >= state.targetLevel
      };
    });
  },

  validateCardSlots(slots) {
    const state = ArcanaApp.state;
    const usedSkills = new Set();
    let totalLevel = 0;

    for (const slot of slots) {
      if (!slot || !slot.skill) continue;

      const skill = slot.skill.trim();
      const level = Number(slot.level || 0);

      if (usedSkills.has(skill)) {
        return { ok: false, message: '한 카드 안에는 같은 스킬을 중복 입력할 수 없습니다.' };
      }

      if (level < 0 || level > state.maxSlotLevel) {
        return { ok: false, message: '슬롯 스킬 레벨은 0~4까지만 입력할 수 있습니다.' };
      }

      usedSkills.add(skill);
      totalLevel += level;
    }

    if (totalLevel > state.maxCardLevel) {
      return { ok: false, message: '카드 하나의 총 레벨은 최대 5입니다.' };
    }

    return { ok: true };
  }
};
