window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.recommendation = {
  generate() {
    const state = ArcanaApp.state;
    const baseLevels = ArcanaApp.simulator.calculateBaseLevels();
    const needMap = ArcanaApp.recommendation.createNeedMap(baseLevels);
    const recommendationCards = ArcanaApp.recommendation.buildRecommendationSet(needMap);

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

  buildRecommendationSet(needMap) {
    const state = ArcanaApp.state;
    const cards = {};
    const workingNeed = { ...needMap };
    const usage = {};

    state.arcanaTypes.forEach(arcanaName => {
      cards[arcanaName] = [];
      usage[arcanaName] = { growth: 0 };
    });

    const targetSkills = (state.selectedTargetSkills || []).slice();
    const sortedTargets = targetSkills.sort((a, b) => {
      const aArcana = ArcanaApp.recommendation.getAvailableArcanaForSkill(a).length || 99;
      const bArcana = ArcanaApp.recommendation.getAvailableArcanaForSkill(b).length || 99;
      if (aArcana !== bArcana) return aArcana - bArcana;
      return Number(workingNeed[b] || 0) - Number(workingNeed[a] || 0);
    });

    sortedTargets.forEach(skill => {
      ArcanaApp.recommendation.allocateSkillAcrossCards(skill, workingNeed, cards, usage, 3);
    });

    sortedTargets.forEach(skill => {
      ArcanaApp.recommendation.allocateSkillAcrossCards(skill, workingNeed, cards, usage, 4);
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

  allocateSkillAcrossCards(skill, needMap, cards, usage, preferredMaxLevel) {
    let guard = 0;

    while (Number(needMap[skill] || 0) > 0 && guard < 30) {
      guard += 1;
      const candidate = ArcanaApp.recommendation.findBestCardForSkill(skill, cards, usage, preferredMaxLevel);
      if (!candidate) break;

      const cardSlots = cards[candidate.arcanaName];
      let slot = cardSlots.find(item => item.skill === skill);

      if (!slot) {
        if (cardSlots.length >= 4) break;
        slot = { skill, level: 1, isTarget: true };
        cardSlots.push(slot);
        needMap[skill] = Math.max(0, Number(needMap[skill] || 0) - 1);
        if (Number(needMap[skill] || 0) <= 0) break;
      }

      if (Number(slot.level || 0) >= preferredMaxLevel) continue;
      if (Number(usage[candidate.arcanaName].growth || 0) >= ArcanaApp.state.maxCardLevel) continue;

      slot.level += 1;
      usage[candidate.arcanaName].growth += 1;
      needMap[skill] = Math.max(0, Number(needMap[skill] || 0) - 1);
    }
  },

  findBestCardForSkill(skill, cards, usage, preferredMaxLevel) {
    const state = ArcanaApp.state;
    const candidates = ArcanaApp.recommendation.getAvailableArcanaForSkill(skill)
      .map(arcanaName => {
        const slots = cards[arcanaName] || [];
        const existing = slots.find(slot => slot.skill === skill);
        const hasSlotRoom = slots.length < 4;
        const hasGrowthRoom = Number(usage[arcanaName].growth || 0) < state.maxCardLevel;
        const canUseExisting = existing && Number(existing.level || 0) < preferredMaxLevel && hasGrowthRoom;
        const canAdd = !existing && hasSlotRoom;

        if (!canUseExisting && !canAdd) return null;

        return {
          arcanaName,
          existing,
          score:
            (existing ? 100 : 0) +
            (hasGrowthRoom ? 20 : 0) -
            (slots.length * 2) -
            Number(usage[arcanaName].growth || 0)
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    return candidates[0] || null;
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
