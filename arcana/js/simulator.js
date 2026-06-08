window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.simulator = {
  calculateCardLevels(cards) {
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

  calculateEquipmentLevels(equipmentOptions) {
    const levels = {};

    Object.values(equipmentOptions || {}).flat().forEach(slot => {
      if (!slot || !slot.skill) return;
      const skill = slot.skill.trim();
      if (!skill) return;
      levels[skill] = (levels[skill] || 0) + Number(slot.level || 1);
    });

    return levels;
  },

  calculateRingLevels(rings) {
    return ArcanaApp.simulator.calculateEquipmentLevels(rings);
  },

  calculateBaseLevels() {
    const levels = { ...ArcanaApp.state.characterLevels };
    const equipmentLevels = ArcanaApp.simulator.calculateEquipmentLevels(ArcanaApp.state.equipmentOptions);
    const ownedCardLevels = ArcanaApp.simulator.calculateCardLevels(ArcanaApp.state.ownedCards);

    [equipmentLevels, ownedCardLevels].forEach(source => {
      Object.entries(source).forEach(([skill, level]) => {
        levels[skill] = (levels[skill] || 0) + Number(level || 0);
      });
    });

    return levels;
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
