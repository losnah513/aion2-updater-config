window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.recommendation = {
  generate() {
    const state = ArcanaApp.state;
    const prepared = ArcanaApp.recommendation.prepareResources();
    const needMap = ArcanaApp.recommendation.createNeedMap(prepared.baseLevels, prepared.ownedLevels);
    const recommendationCards = ArcanaApp.recommendation.buildRecommendationSet(needMap, prepared.baseLevels, prepared.ownedCards);
    const meta = ArcanaApp.recommendation.buildMeta(recommendationCards, prepared.baseLevels, prepared.ownedLevels, prepared.autoRingOptions);

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

    const ownedCards = ArcanaApp.recommendation.cloneCards(state.ownedCards || {});
    const ownedLevels = ArcanaApp.simulator.calculateCardLevels(ownedCards);
    const manualRing = ArcanaApp.simulator.calculateEquipmentLevels(state.equipmentOptions || {});
    const baseLevels = {};

    (state.selectedTargetSkills || []).forEach(skill => {
      baseLevels[skill] = Number(state.baseSkillLevel || 10)
        + Number(state.devanionBonus || 0)
        + Number(manualRing[skill] || 0);
    });

    const autoRingOptions = { ring1: [], ring2: [] };
    if (!hasManualRing) {
      const targets = (state.selectedTargetSkills || [])
        .map(skill => ({
          skill,
          shortage: Math.max(
            0,
            Number(state.targetLevel || 20)
              - Number(baseLevels[skill] || 0)
              - Number(ownedLevels[skill] || 0)
          )
        }))
        .filter(item => item.shortage > 0)
        .sort((a, b) => b.shortage - a.shortage);

      targets.slice(0, 12).forEach((item, index) => {
        const key = index < 6 ? 'ring1' : 'ring2';
        autoRingOptions[key].push({ skill: item.skill, level: 1, auto: true });
        baseLevels[item.skill] = Number(baseLevels[item.skill] || 0) + 1;
      });
    }

    return { baseLevels, ownedLevels, ownedCards, autoRingOptions };
  },

  createNeedMap(baseLevels, ownedLevels) {
    const state = ArcanaApp.state;
    const needMap = {};

    state.selectedTargetSkills.forEach(skill => {
      needMap[skill] = Math.max(
        0,
        Number(state.targetLevel || 20)
          - Number(baseLevels[skill] || 0)
          - Number(ownedLevels[skill] || 0)
      );
    });

    return needMap;
  },

  buildRecommendationSet(needMap, baseLevels, ownedCards) {
    const state = ArcanaApp.state;
    const cards = ArcanaApp.recommendation.createStartingCards(ownedCards);
    const usage = ArcanaApp.recommendation.createUsageMap(cards);

    const sortedTargets = (state.selectedTargetSkills || []).slice().sort((a, b) => {
      const aArcana = ArcanaApp.recommendation.getAvailableArcanaForSkill(a).length || 99;
      const bArcana = ArcanaApp.recommendation.getAvailableArcanaForSkill(b).length || 99;
      if (aArcana !== bArcana) return aArcana - bArcana;
      return Number(needMap[b] || 0) - Number(needMap[a] || 0);
    });

    sortedTargets.forEach(skill => {
      ArcanaApp.recommendation.allocateSkill(skill, needMap, cards, usage, baseLevels, 3);
    });

    sortedTargets.forEach(skill => {
      ArcanaApp.recommendation.allocateSkill(skill, needMap, cards, usage, baseLevels, 4);
    });

    state.arcanaTypes.forEach(arcanaName => {
      ArcanaApp.recommendation.fillCardSlots(arcanaName, cards[arcanaName], baseLevels);
    });

    return cards;
  },

  cloneCards(cards) {
    const cloned = {};
    (ArcanaApp.state.arcanaTypes || []).forEach(arcanaName => {
      cloned[arcanaName] = (cards[arcanaName] || [])
        .filter(slot => slot && String(slot.skill || '').trim())
        .map(slot => ({
          skill: String(slot.skill || '').trim(),
          level: Number(slot.level || 0),
          isOwned: true
        }));
    });
    return cloned;
  },

  createStartingCards(ownedCards) {
    const cards = {};
    (ArcanaApp.state.arcanaTypes || []).forEach(arcanaName => {
      cards[arcanaName] = (ownedCards[arcanaName] || []).map(slot => ({ ...slot }));
    });
    return cards;
  },

  createUsageMap(cards) {
    const usage = {};
    (ArcanaApp.state.arcanaTypes || []).forEach(arcanaName => {
      usage[arcanaName] = {
        growth: (cards[arcanaName] || []).reduce((sum, slot) => {
          return sum + Math.max(0, Number(slot.level || 0) - 1);
        }, 0)
      };
    });
    return usage;
  },

  getAvailableArcanaForSkill(skill) {
    const state = ArcanaApp.state;
    return (state.arcanaTypes || []).filter(arcanaName => {
      const pool = state.skillsByArcana[arcanaName] || [];
      return pool.includes(skill);
    });
  },

  allocateSkill(skill, needMap, cards, usage, baseLevels, preferredMaxLevel) {
    let guard = 0;

    while (Number(needMap[skill] || 0) > 0 && guard < 80) {
      guard += 1;
      const currentCardLevels = ArcanaApp.simulator.calculateCardLevels(cards);
      const currentFinal = Number(baseLevels[skill] || 0) + Number(currentCardLevels[skill] || 0);

      if (currentFinal >= Number(ArcanaApp.state.targetLevel || 20)) {
        needMap[skill] = 0;
        break;
      }

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

      const nextFinal = Number(baseLevels[skill] || 0)
        + Number(ArcanaApp.simulator.calculateCardLevels(cards)[skill] || 0)
        + 1;

      const canGrow = nextFinal <= Number(ArcanaApp.state.targetLevel || 20)
        && Number(slot.level || 0) < preferredMaxLevel
        && Number(slot.level || 0) < Number(ArcanaApp.state.maxSlotLevel || 4)
        && Number(usage[candidate.arcanaName].growth || 0) < Number(ArcanaApp.state.maxCardLevel || 5);

      if (!canGrow) break;

      slot.level += 1;
      slot.isTarget = true;
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
            (existing ? 2000 : 0)
            + (existing && existing.isOwned ? 800 : 0)
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

  fillCardSlots(arcanaName, slots, baseLevels) {
    const availableSkills = ArcanaApp.state.skillsByArcana[arcanaName] || [];
    const targetSet = new Set(ArcanaApp.state.selectedTargetSkills || []);

    availableSkills.forEach(skill => {
      if (slots.length >= 4) return;
      if (slots.some(slot => slot.skill === skill)) return;
      if (targetSet.has(skill)) return;

      slots.push({ skill, level: 1, isTarget: false });
    });

    while (slots.length < 4) {
      slots.push({ skill: '', level: 0, isTarget: false });
    }

    slots.splice(4);
  },

  buildMeta(cards, baseLevels, ownedLevels, autoRingOptions) {
    const state = ArcanaApp.state;
    const finalCardLevels = ArcanaApp.simulator.calculateCardLevels(cards);
    const autoRingLevels = ArcanaApp.simulator.calculateEquipmentLevels(autoRingOptions || {});
    const manualRingLevels = ArcanaApp.simulator.calculateEquipmentLevels(state.equipmentOptions || {});

    const rows = state.selectedTargetSkills.map(skill => {
      const owned = Number(ownedLevels[skill] || 0);
      const cardTotal = Number(finalCardLevels[skill] || 0);
      const recommended = Math.max(0, cardTotal - owned);
      const finalLevel = Number(baseLevels[skill] || 0) + cardTotal;
      const shortage = Math.max(0, Number(state.targetLevel || 20) - finalLevel);
      const over = Math.max(0, finalLevel - Number(state.targetLevel || 20));

      return {
        skill,
        current: Number(state.baseSkillLevel || 10),
        equipment: Number(manualRingLevels[skill] || 0) + Number(autoRingLevels[skill] || 0),
        owned,
        recommended,
        bonus: Number(state.devanionBonus || 0),
        finalLevel,
        shortage,
        over,
        must: shortage > 0 || recommended >= 4
      };
    });

    const failedRows = rows.filter(row => row.shortage > 0 || row.over > 0);
    const successCount = rows.filter(row => row.finalLevel === Number(state.targetLevel || 20)).length;
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
    const overRows = rows.filter(row => row.over > 0);
    const hardRows = rows.filter(row => row.recommended >= 4);
    const autoRingSkills = Object.values(autoRingOptions || {}).flat().map(slot => slot.skill).filter(Boolean);
    const advice = [];

    if (overRows.length > 0) {
      const names = overRows.slice(0, 3).map(row => `${row.skill} ${row.over}레벨 초과`).join(', ');
      advice.push(`${names} 상태라서 20레벨을 넘지 않는 추천으로 확정할 수 없어요.`);
    } else if (shortageRows.length > 0) {
      const names = shortageRows.slice(0, 3).map(row => `${row.skill} ${row.shortage}레벨 부족`).join(', ');
      advice.push(`${names} 상태라서 현재 조건에서는 20레벨 추천을 확정할 수 없어요.`);
    } else {
      advice.push('현재 조건에서는 목표 스킬을 정확히 20레벨로 맞출 수 있어요.');
    }

    if (autoRingSkills.length > 0) {
      advice.push(`반지 옵션은 ${autoRingSkills.slice(0, 6).join(', ')} 중심으로 자동 활용했어요.`);
    }

    if (hardRows.length > 0) {
      const names = hardRows.slice(0, 3).map(row => row.skill).join(', ');
      advice.push(`${names}은 Lv4 부담이 있어요. 동일 달성 수에서는 Lv4를 줄이는 방향으로 계산했어요.`);
    }

    if (advice.length < 3 && shortageRows.length === 0 && overRows.length === 0) {
      advice.push('카드별 추가 포인트 5 제한과 20레벨 초과 금지 조건을 함께 적용했어요.');
    }

    return advice.slice(0, 3);
  }
};
