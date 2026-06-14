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

    ['ring1', 'ring2'].forEach(key => {
      (equipmentOptions[key] || []).forEach(slot => {
        if (!slot || !slot.skill) return;
        const skill = slot.skill.trim();
        if (!skill) return;
        levels[skill] = (levels[skill] || 0) + Number(slot.level || 1);
      });
    });

    return levels;
  },

  calculateRingLevels(rings) {
    return ArcanaApp.simulator.calculateEquipmentLevels(rings);
  },

  calculateBaseLevels() {
    const levels = {};
    const state = ArcanaApp.state;
    const equipmentLevels = ArcanaApp.simulator.calculateEquipmentLevels(state.equipmentOptions);
    const ownedCardLevels = ArcanaApp.simulator.calculateCardLevels(state.ownedCards);

    state.selectedTargetSkills.forEach(skill => {
      levels[skill] = state.baseSkillLevel || 10;
    });

    [equipmentLevels, ownedCardLevels].forEach(source => {
      Object.entries(source).forEach(([skill, level]) => {
        levels[skill] = (levels[skill] || 0) + Number(level || 0);
      });
    });

    return levels;
  },

  validateCardSlots(slots, arcanaName) {
    const state = ArcanaApp.state;
    const usedSkills = new Set();
    const availableSkills = state.skillsByArcana[arcanaName] || [];
    let growthPoint = 0;

    for (const slot of slots) {
      if (!slot || !slot.skill) continue;

      const skill = slot.skill.trim();
      const level = Number(slot.level || 0);

      if (usedSkills.has(skill)) {
        return { ok: false, message: '한 카드 안에는 같은 스킬을 중복 입력할 수 없습니다.' };
      }

      if (availableSkills.length > 0 && !availableSkills.includes(skill)) {
        return { ok: false, message: `${skill} 스킬은 ${arcanaName}에 등록할 수 없습니다.` };
      }

      if (level < 1 || level > state.maxSlotLevel) {
        return { ok: false, message: '선택한 슬롯의 스킬 레벨은 1~4까지만 입력할 수 있습니다.' };
      }

      usedSkills.add(skill);
      growthPoint += Math.max(0, level - 1);
    }

    if (growthPoint > state.maxCardLevel) {
      return { ok: false, message: '카드 하나의 성장 포인트는 최대 5입니다.' };
    }

    return { ok: true };
  }
};
