window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.recommendation = {
  generate() {
    const state = ArcanaApp.state;
    const baseLevels = ArcanaApp.simulator.calculateBaseLevels();
    const needMap = ArcanaApp.recommendation.createNeedMap(baseLevels);
    const recommendationCards = {};

    state.arcanaTypes.forEach(arcanaName => {
      recommendationCards[arcanaName] = ArcanaApp.recommendation.buildCard(arcanaName, needMap);
    });

    const meta = ArcanaApp.recommendation.buildMeta(recommendationCards, baseLevels);
    state.recommendationCards = recommendationCards;
    state.recommendationMeta = meta;
    state.recommendationGenerated = true;
    return { cards: recommendationCards, meta };
  },

  createNeedMap(baseLevels) {
    const state = ArcanaApp.state;
    const needMap = {};

    state.selectedTargetSkills.forEach(skill => {
      const current = Number(baseLevels[skill] || 0) + Number(state.devanionBonus || 0);
      needMap[skill] = Math.max(0, state.targetLevel - current);
    });

    return needMap;
  },

  buildCard(arcanaName, needMap) {
    const state = ArcanaApp.state;
    const availableSkills = state.skillsByArcana[arcanaName] || [];
    const targetCandidates = state.selectedTargetSkills
      .filter(skill => availableSkills.includes(skill))
      .filter(skill => Number(needMap[skill] || 0) > 0)
      .slice(0, 4);

    const slots = targetCandidates.map(skill => ({ skill, level: 1, isTarget: true }));

    slots.forEach(slot => {
      needMap[slot.skill] = Math.max(0, Number(needMap[slot.skill] || 0) - 1);
    });

    availableSkills.forEach(skill => {
      if (slots.length >= 4) return;
      if (slots.some(slot => slot.skill === skill)) return;
      slots.push({ skill, level: 1, isTarget: false });
    });

    let growthPoint = state.maxCardLevel;
    growthPoint = ArcanaApp.recommendation.distributeGrowth(slots, needMap, growthPoint, 3);
    growthPoint = ArcanaApp.recommendation.distributeGrowth(slots, needMap, growthPoint, 4);

    while (slots.length < 4) {
      slots.push({ skill: '', level: 0, isTarget: false });
    }

    return slots.map(slot => ({ skill: slot.skill, level: slot.level || 0 }));
  },

  distributeGrowth(slots, needMap, growthPoint, maxLevel) {
    let changed = true;

    while (growthPoint > 0 && changed) {
      changed = false;

      const targets = slots
        .filter(slot => slot.isTarget)
        .filter(slot => slot.skill)
        .filter(slot => Number(needMap[slot.skill] || 0) > 0)
        .filter(slot => Number(slot.level || 0) < maxLevel)
        .sort((a, b) => Number(needMap[b.skill] || 0) - Number(needMap[a.skill] || 0));

      for (const slot of targets) {
        if (growthPoint <= 0) break;
        if (Number(needMap[slot.skill] || 0) <= 0) continue;
        if (Number(slot.level || 0) >= maxLevel) continue;

        slot.level += 1;
        needMap[slot.skill] = Math.max(0, Number(needMap[slot.skill] || 0) - 1);
        growthPoint -= 1;
        changed = true;
      }
    }

    return growthPoint;
  },

  buildMeta(cards, baseLevels) {
    const state = ArcanaApp.state;
    const recommendedLevels = ArcanaApp.simulator.calculateCardLevels(cards);
    const rows = state.selectedTargetSkills.map(skill => {
      const base = Number(state.baseSkillLevel || 10);
      const equipment = Number(ArcanaApp.simulator.calculateEquipmentLevels(state.equipmentOptions)[skill] || 0);
      const owned = Number(ArcanaApp.simulator.calculateCardLevels(state.ownedCards)[skill] || 0);
      const recommended = Number(recommendedLevels[skill] || 0);
      const finalLevel = base + equipment + owned + recommended + state.devanionBonus;
      const shortage = Math.max(0, state.targetLevel - finalLevel);
      const must = shortage > 0 || recommended >= 4;

      return {
        skill,
        current: base,
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
      return ['목표 스킬을 선택하면 키노조 AI가 부족한 부분을 함께 살펴볼게요.'];
    }

    const shortageRows = rows.filter(row => row.shortage > 0);
    const hardRows = rows.filter(row => row.recommended >= 4);
    const advice = [];

    if (shortageRows.length > 0) {
      const names = shortageRows.slice(0, 3).map(row => `${row.skill} ${row.shortage}레벨 부족`).join(', ');
      advice.push(`${names} 상태예요. 반지 옵션이나 현재 아르카나에서 조금 더 보충하면 좋아요.`);
    }

    if (hardRows.length > 0) {
      const names = hardRows.slice(0, 3).map(row => row.skill).join(', ');
      advice.push(`${names}은 현재 조건에서 Lv4 부담이 있어요. 가능하면 반지 옵션으로 부담을 나누는 걸 추천해요.`);
    }

    if (advice.length === 0) {
      advice.push('현재 조건에서는 목표 스킬 20레벨 달성이 가능해 보여요.');
      advice.push('제작 부담이 한 카드에 몰리지 않도록 여러 아르카나에 나눠서 추천했어요.');
    }

    return advice.slice(0, 3);
  }
};
