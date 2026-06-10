window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.recommendation = {
  generate() {
    const state = ArcanaApp.state;
    const prepared = ArcanaApp.recommendation.prepareResources();
    const needMap = ArcanaApp.recommendation.createNeedMap(prepared.baseLevels);
    const recommendationCards = ArcanaApp.recommendation.buildRecommendationSet(needMap);
    const meta = ArcanaApp.recommendation.buildMeta(recommendationCards, prepared.baseLevels, prepared.autoRingOptions);

    state.recommendationCards = recommendationCards;
    state.recommendationMeta = meta;
    state.recommendationGenerated = true;
    return { cards: recommendationCards, meta };
  },

  prepareResources() {
    const state = ArcanaApp.state;
    const hasManualRing = Object.values(state.equipmentOptions || {})
      .flat()
      .some(slot => slot && String(slot.skill || '').trim());

    const owned = ArcanaApp.simulator.calculateCardLevels(state.ownedCards);
    const manualRing = ArcanaApp.simulator.calculateEquipmentLevels(state.equipmentOptions);
    const baseLevels = {};

    (state.selectedTargetSkills || []).forEach(skill => {
      baseLevels[skill] = Number(state.baseSkillLevel || 10)
        + Number(state.devanionBonus || 0)
        + Number(owned[skill] || 0)
        + Number(manualRing[skill] || 0);
    });

    const autoRingOptions = { ring1: [], ring2: [] };
    if (!hasManualRing) {
      const targets = (state.selectedTargetSkills || [])
        .map(skill => ({ skill, shortage: Math.max(0, Number(state.targetLevel || 20) - Number(baseLevels[skill] || 0)) }))
        .filter(item => item.shortage > 0)
        .sort((a, b) => b.shortage - a.shortage);

      targets.slice(0, 12).forEach((item, index) => {
        const key = index < 6 ? 'ring1' : 'ring2';
        autoRingOptions[key].push({ skill: item.skill, level: 1, auto: true });
        baseLevels[item.skill] = Number(baseLevels[item.skill] || 0) + 1;
      });
    }

    return { baseLevels, autoRingOptions };
  },

  createNeedMap(baseLevels) {
    const state = ArcanaApp.state;
    const needMap = {};

    state.selectedTargetSkills.forEach(skill => {
      needMap[skill] = Math.max(0, Number(state.targetLevel || 20) - Number(baseLevels[skill] || 0));
    });

    return needMap;
  },

  buildRecommendationSet(needMap) {
    const state = ArcanaApp.state;
    const cards = {};
    const usage = {};

    state.arcanaTypes.forEach(arcanaName => {
      cards[arcanaName] = [];
      usage[arcanaName] = { growth: 0 };
    });

    const sortedTargets = (state.selectedTargetSkills || []).slice().sort((a, b) => {
      const aArcana = ArcanaApp.recommendation.getAvailableArcanaForSkill(a).length || 99;
      const bArcana = ArcanaApp.recommendation.getAvailableArcanaForSkill(b).length || 99;
      if (aArcana !== bArcana) return aArcana - bArcana;
      return Number(needMap[b] || 0) - Number(needMap[a] || 0);
    });

    sortedTargets.forEach(skill => {
      ArcanaApp.recommendation.allocateSkill(skill, needMap, cards, usage, 3);
    });

    sortedTargets.forEach(skill => {
      ArcanaApp.recommendation.allocateSkill(skill, needMap, cards, usage, 4);
    });

    state.arcanaTypes.forEach(arcanaName => {
      ArcanaApp.recommendation.fillCardSlots(arcanaName, cards[arcanaName]);
    });

    return cards;
  },

  getAvailableArcanaForSkill(skill) {
    const state = ArcanaApp.state;
    return (state.arcanaTypes || []).filter(arcanaName => {
      const pool = state.skillsByArcana[arcanaName] || [];
      return pool.includes(skill);
    });
  },

  allocateSkill(skill, needMap, cards, usage, preferredMaxLevel) {
    let guard = 0;

    while (Number(needMap[skill] || 0) > 0 && guard < 80) {
      guard += 1;
      const candidate = ArcanaApp.recommendation.findBestCardForSkill(skill, cards, usage, preferredMaxLevel);
      if (!candidate) break;

      const cardSlots = cards[candidate.arcanaName];
      let slot = cardSlots.find(item => item.skill === skill);

      if (!slot) {
        slot = { skill, level: 1, isTarget: true };
        cardSlots.push(slot);
        needMap[skill] = Math.max(0, Number(needMap[skill] || 0) - 1);
        if (Number(needMap[skill] || 0) <= 0) break;
      }

      const canGrow = Number(slot.level || 0) < preferredMaxLevel
        && Number(slot.level || 0) < Number(ArcanaApp.state.maxSlotLevel || 4)
        && Number(usage[candidate.arcanaName].growth || 0) < Number(ArcanaApp.state.maxCardLevel || 5);

      if (!canGrow) continue;

      slot.level += 1;
      usage[candidate.arcanaName].growth += 1;
      needMap[skill] = Math.max(0, Number(needMap[skill] || 0) - 1);
    }
  },

  findBestCardForSkill(skill, cards, usage, preferredMaxLevel) {
    const state = ArcanaApp.state;
    return ArcanaApp.recommendation.getAvailableArcanaForSkill(skill)
      .map(arcanaName => {
        const slots = cards[arcanaName] || [];
        const existing = slots.find(slot => slot.skill === skill);
        const growth = Number(usage[arcanaName].growth || 0);
        const canUseExisting = existing && Number(existing.level || 0) < preferredMaxLevel && growth < state.maxCardLevel;
        const canAdd = !existing && slots.length < 4;

        if (!canUseExisting && !canAdd) return null;

        return {
          arcanaName,
          score:
            (existing ? 1000 : 0)
            + (state.maxCardLevel - growth) * 10
            - slots.length * 4
            - ArcanaApp.recommendation.getCardDifficulty(slots)
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)[0] || null;
  },

  getCardDifficulty(slots) {
    return (slots || []).reduce((sum, slot) => sum + Math.max(0, Number(slot.level || 0) - 1), 0);
  },

  fillCardSlots(arcanaName, slots) {
    const availableSkills = ArcanaApp.state.skillsByArcana[arcanaName] || [];

    availableSkills.forEach(skill => {
      if (slots.length >= 4) return;
      if (slots.some(slot => slot.skill === skill)) return;
      slots.push({ skill, level: 1, isTarget: false });
    });

    while (slots.length < 4) {
      slots.push({ skill: '', level: 0, isTarget: false });
    }

    slots.splice(4);
  },

  buildMeta(cards, baseLevels, autoRingOptions) {
    const state = ArcanaApp.state;
    const recommendedLevels = ArcanaApp.simulator.calculateCardLevels(cards);
    const autoRingLevels = ArcanaApp.simulator.calculateEquipmentLevels(autoRingOptions || {});
    const manualRingLevels = ArcanaApp.simulator.calculateEquipmentLevels(state.equipmentOptions || {});
    const ownedLevels = ArcanaApp.simulator.calculateCardLevels(state.ownedCards || {});

    const rows = state.selectedTargetSkills.map(skill => {
      const recommended = Number(recommendedLevels[skill] || 0);
      const finalLevel = Number(baseLevels[skill] || 0) + recommended;
      const shortage = Math.max(0, Number(state.targetLevel || 20) - finalLevel);

      return {
        skill,
        current: Number(state.baseSkillLevel || 10),
        equipment: Number(manualRingLevels[skill] || 0) + Number(autoRingLevels[skill] || 0),
        owned: Number(ownedLevels[skill] || 0),
        recommended,
        bonus: Number(state.devanionBonus || 0),
        finalLevel,
        shortage,
        must: shortage > 0 || recommended >= 4
      };
    });

    const failedRows = rows.filter(row => row.shortage > 0);
    const successCount = rows.filter(row => row.finalLevel >= Number(state.targetLevel || 20)).length;
    const advice = ArcanaApp.recommendation.buildAdvice(rows, autoRingOptions);

    return {
      rows,
      advice,
      autoRingOptions,
      ok: failedRows.length === 0,
      successCount,
      failedSkills: failedRows.map(row => row.skill)
    };
  },

  buildAdvice(rows, autoRingOptions) {
    if (!rows || rows.length === 0) {
      return ['목표 스킬을 선택하면 키노조 AI가 부족한 부분을 함께 살펴볼게요.'];
    }

    const shortageRows = rows.filter(row => row.shortage > 0);
    const hardRows = rows.filter(row => row.recommended >= 4);
    const autoRingSkills = Object.values(autoRingOptions || {}).flat().map(slot => slot.skill).filter(Boolean);
    const advice = [];

    if (shortageRows.length > 0) {
      const names = shortageRows.slice(0, 3).map(row => `${row.skill} ${row.shortage}레벨 부족`).join(', ');
      advice.push(`${names} 상태라서 현재 조건에서는 20레벨 추천을 확정할 수 없어요.`);
    } else {
      advice.push('현재 조건에서는 목표 스킬 20레벨 달성이 가능해 보여요.');
    }

    if (autoRingSkills.length > 0) {
      advice.push(`반지 옵션은 ${autoRingSkills.slice(0, 6).join(', ')} 중심으로 자동 활용했어요.`);
    }

    if (hardRows.length > 0) {
      const names = hardRows.slice(0, 3).map(row => row.skill).join(', ');
      advice.push(`${names}은 Lv4 부담이 있어요. 동일 달성 수에서는 Lv4를 줄이는 방향으로 계산했어요.`);
    }

    if (advice.length < 3 && shortageRows.length === 0) {
      advice.push('카드별 추가 포인트 5 제한을 넘는 조합은 제외했어요.');
    }

    return advice.slice(0, 3);
  }
};
