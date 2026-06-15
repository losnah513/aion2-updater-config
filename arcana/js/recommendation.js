window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.recommendation = {
  generate() {
    const state = ArcanaApp.state;
    const validation = ArcanaApp.recommendation.validateBeforeGenerate(state.ownedCards || {});
    if (!validation.ok) {
      if (ArcanaApp.cardEditor && typeof ArcanaApp.cardEditor.renderOwnedCards === 'function') {
        ArcanaApp.cardEditor.renderOwnedCards();
      }
      const error = new Error(validation.message || '현재 저장된 아르카나 조건으로는 추천 분석을 진행할 수 없습니다.');
      error.validationResult = validation;
      throw error;
    }
    const prepared = ArcanaApp.recommendation.prepareResources();
    const needMap = ArcanaApp.recommendation.createNeedMap(prepared.baseLevels, prepared.ownedLevels);
    const recommendationCards = ArcanaApp.recommendation.buildRecommendationSet(needMap, prepared.baseLevels, prepared.ownedCards);
    const meta = ArcanaApp.recommendation.buildMeta(recommendationCards, prepared.baseLevels, prepared.ownedLevels, prepared.manualRingLevels, prepared.hasManualRing);

    state.recommendationCards = recommendationCards;
    state.recommendationMeta = meta;
    state.recommendationGenerated = true;
    return { cards: recommendationCards, meta };
  },

  getSkillTargetLevel(skill) {
    const level = Number((ArcanaApp.state.targetSkillLevels || {})[skill] || 0);
    return level > 0 ? level : Number(ArcanaApp.state.targetLevel || 20);
  },


  getTargetSummary() {
    const state = ArcanaApp.state;
    const targetLevels = state.targetSkillLevels || {};
    const explicit = (state.selectedTargetSkills || []).filter(Boolean);
    const level20 = explicit.filter(skill => Number(targetLevels[skill] || 0) === 20);
    const level16 = explicit.filter(skill => Number(targetLevels[skill] || 0) === 16);
    const totalPointBudget = Number(state.arcanaTotalSkillBudget || 42);
    const usedBy20 = level20.length * 6;
    const usedBy16 = level16.length * 2;
    const remainPoints = Math.max(0, totalPointBudget - usedBy20 - usedBy16);
    const auto16Limit = Math.floor(remainPoints / 2);

    return {
      explicit,
      level20,
      level16,
      totalPointBudget,
      usedBy20,
      usedBy16,
      remainPoints,
      auto16Limit
    };
  },

  getEffectiveTargetSkills() {
    const state = ArcanaApp.state;
    const summary = ArcanaApp.recommendation.getTargetSummary();
    const result = summary.explicit.slice();
    const seen = new Set(result);
    const explicit16Count = summary.level16.length;
    const needAuto16 = Math.max(0, summary.auto16Limit - explicit16Count);

    if (needAuto16 <= 0) return result;

    const activeSkills = ArcanaApp.skillSelector && typeof ArcanaApp.skillSelector.getActiveSkills === 'function'
      ? ArcanaApp.skillSelector.getActiveSkills()
      : (state.activeSkills || []);

    const candidates = (activeSkills || [])
      .map(skill => String(skill || '').trim())
      .filter(skill => skill && !seen.has(skill))
      .sort((a, b) => {
        const aArcana = ArcanaApp.recommendation.getAvailableArcanaForSkill(a).length || 99;
        const bArcana = ArcanaApp.recommendation.getAvailableArcanaForSkill(b).length || 99;
        if (aArcana !== bArcana) return aArcana - bArcana;
        return a.localeCompare(b, 'ko');
      });

    candidates.slice(0, needAuto16).forEach(skill => {
      result.push(skill);
      seen.add(skill);
    });

    return result;
  },

  getResolvedTargetLevel(skill) {
    const state = ArcanaApp.state;
    const savedLevel = Number((state.targetSkillLevels || {})[skill] || 0);
    if (savedLevel > 0) return savedLevel;
    return 16;
  },

  validateSevenTwentyOwnedCards(ownedCards) {
    const state = ArcanaApp.state;
    const summary = ArcanaApp.recommendation.getTargetSummary();
    const level20Set = new Set(summary.level20);
    const requiredArcana = ['성배', '양피지', '나침반', '천칭'];
    const invalidSlots = [];
    const invalidCards = [];

    if (summary.level20.length !== 7) {
      return { ok: true, invalidSlots, invalidCards, message: '' };
    }

    requiredArcana.forEach(arcanaName => {
      const slots = (ownedCards && ownedCards[arcanaName]) || [];
      const filledSlots = slots.filter(slot => slot && String(slot.skill || '').trim());
      const targetSlots = slots
        .map((slot, index) => ({ slot, index }))
        .filter(item => item.slot && level20Set.has(String(item.slot.skill || '').trim()));
      const hasLv4Target = targetSlots.some(item => Number(item.slot.level || 0) >= 4);

      targetSlots.forEach(item => {
        if (Number(item.slot.level || 0) > 0 && Number(item.slot.level || 0) < 4) {
          invalidSlots.push({
            arcanaName,
            slotIndex: item.index,
            skill: String(item.slot.skill || '').trim(),
            level: Number(item.slot.level || 0),
            reason: '20레벨 7개 목표에서는 이 아르카나에 4레벨 액티브가 필요합니다.'
          });
        }
      });

      if (!hasLv4Target && filledSlots.length >= 4) {
        invalidCards.push({
          arcanaName,
          reason: `${arcanaName}에 20레벨 목표 스킬 4레벨 슬롯을 추가할 공간이 없습니다.`
        });
      }
    });

    const ok = invalidSlots.length === 0 && invalidCards.length === 0;
    return {
      ok,
      invalidSlots,
      invalidCards,
      message: ok ? '' : '20레벨 스킬 7개를 달성하려면 성배, 양피지, 나침반, 천칭에 각각 4레벨 액티브 스킬이 최소 1개씩 필요합니다. 빨간색으로 표시된 보유 아르카나를 먼저 수정해주세요.'
    };
  },

  validateBeforeGenerate(ownedCards) {
    const summary = ArcanaApp.recommendation.getTargetSummary();
    const validation = ArcanaApp.recommendation.validateSevenTwentyOwnedCards(ownedCards || ArcanaApp.state.ownedCards || {});
    const result = { ...validation, summary };
    ArcanaApp.state.recommendationValidation = result;
    return result;
  },

  prepareResources() {
    const state = ArcanaApp.state;
    const hasManualRing = Object.values(state.equipmentOptions || {})
      .flat()
      .some(slot => slot && String(slot.skill || '').trim());

    const ownedCards = ArcanaApp.recommendation.cloneCards(state.ownedCards || {});
    const ownedLevels = ArcanaApp.simulator.calculateCardLevels(ownedCards);
    const manualRingLevels = ArcanaApp.simulator.calculateEquipmentLevels(state.equipmentOptions || {});
    const baseLevels = {};

    ArcanaApp.recommendation.getEffectiveTargetSkills().forEach(skill => {
      baseLevels[skill] = Number(state.baseSkillLevel || 10)
        + Number(state.devanionBonus || 0)
        + Number(manualRingLevels[skill] || 0);
    });

    return { baseLevels, ownedLevels, ownedCards, manualRingLevels, hasManualRing };
  },

  createNeedMap(baseLevels, ownedLevels) {
    const needMap = {};

    ArcanaApp.recommendation.getEffectiveTargetSkills().forEach(skill => {
      const targetLevel = ArcanaApp.recommendation.getResolvedTargetLevel(skill);
      needMap[skill] = Math.max(
        0,
        targetLevel
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

    const sortedTargets = ArcanaApp.recommendation.getEffectiveTargetSkills().slice().sort((a, b) => {
      const aTarget = ArcanaApp.recommendation.getResolvedTargetLevel(a);
      const bTarget = ArcanaApp.recommendation.getResolvedTargetLevel(b);
      if (aTarget !== bTarget) return bTarget - aTarget;
      const aArcana = ArcanaApp.recommendation.getAvailableArcanaForSkill(a).length || 99;
      const bArcana = ArcanaApp.recommendation.getAvailableArcanaForSkill(b).length || 99;
      if (aArcana !== bArcana) return aArcana - bArcana;
      return Number(needMap[b] || 0) - Number(needMap[a] || 0);
    });

    // Lv4는 목표 달성에 꼭 필요한 경우에만 사용한다.
    // 20레벨 목표가 7개일 때만 4레벨 앵커 조건을 먼저 강제한다.
    ArcanaApp.recommendation.enforceSevenTwentyLv4Anchors(cards, usage, needMap, baseLevels);

    sortedTargets.forEach(skill => {
      const targetLevel = ArcanaApp.recommendation.getResolvedTargetLevel(skill);
      ArcanaApp.recommendation.allocateSkill(skill, needMap, cards, usage, baseLevels, 3);
    });

    // 3레벨 분산으로도 목표가 남을 때만 Lv4를 허용한다.
    // 목표가 이미 달성된 스킬은 allocateSkill 내부에서 추가 성장하지 않는다.
    sortedTargets.forEach(skill => {
      if (Number(needMap[skill] || 0) > 0) {
        ArcanaApp.recommendation.allocateSkill(skill, needMap, cards, usage, baseLevels, 4);
      }
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

  prioritizeTwentyLevelLv4Slots(cards, usage, needMap, baseLevels) {
    const summary = ArcanaApp.recommendation.getTargetSummary();
    const targets = (summary.level20 || []).slice();

    targets.forEach(skill => {
      if (Number(needMap[skill] || 0) <= 0) return;

      const existingLv4 = ArcanaApp.recommendation.getAvailableArcanaForSkill(skill).some(arcanaName => {
        return (cards[arcanaName] || []).some(slot => String(slot.skill || '').trim() === skill && Number(slot.level || 0) >= 4);
      });
      if (existingLv4) return;

      const candidates = ArcanaApp.recommendation.getAvailableArcanaForSkill(skill)
        .map(arcanaName => {
          const slots = cards[arcanaName] || [];
          const existing = slots.find(slot => String(slot.skill || '').trim() === skill);
          const growth = Number((usage[arcanaName] || {}).growth || 0);
          const freeSlots = 4 - slots.filter(slot => slot && String(slot.skill || '').trim()).length;
          const needGrowthToLv4 = existing ? Math.max(0, 4 - Number(existing.level || 0)) : 3;
          const canUse = existing || freeSlots > 0;
          const hasGrowth = growth + needGrowthToLv4 <= Number(ArcanaApp.state.maxCardLevel || 5);
          if (!canUse || !hasGrowth) return null;

          return {
            arcanaName,
            existing,
            score:
              (existing ? 3000 : 0)
              + (existing && existing.isOwned ? 900 : 0)
              + freeSlots * 20
              + (Number(ArcanaApp.state.maxCardLevel || 5) - growth) * 14
              - slots.length * 5
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      const selected = candidates[0];
      if (!selected) return;

      const slots = cards[selected.arcanaName];
      let slot = selected.existing;
      if (!slot) {
        slot = { skill, level: 1, isTarget: true, targetLevel: 20, isTwentyLv4Priority: true };
        slots.push(slot);
        needMap[skill] = Math.max(0, Number(needMap[skill] || 0) - 1);
      }

      while (Number(slot.level || 0) < 4 && Number(needMap[skill] || 0) > 0) {
        const currentCardLevels = ArcanaApp.simulator.calculateCardLevels(cards);
        const currentFinal = Number(baseLevels[skill] || 0) + Number(currentCardLevels[skill] || 0);
        if (currentFinal + 1 > 20) break;
        if (Number((usage[selected.arcanaName] || {}).growth || 0) >= Number(ArcanaApp.state.maxCardLevel || 5)) break;

        slot.level = Number(slot.level || 0) + 1;
        slot.isTarget = true;
        slot.targetLevel = 20;
        slot.isTwentyLv4Priority = true;
        usage[selected.arcanaName].growth += 1;
        needMap[skill] = Math.max(0, Number(needMap[skill] || 0) - 1);
      }
    });
  },

  enforceSevenTwentyLv4Anchors(cards, usage, needMap, baseLevels) {
    const summary = ArcanaApp.recommendation.getTargetSummary();
    if (summary.level20.length !== 7) return;

    const requiredArcana = ['성배', '양피지', '나침반', '천칭'];
    const usedAnchorSkills = new Set();

    requiredArcana.forEach(arcanaName => {
      const slots = cards[arcanaName] || [];
      let anchor = slots.find(slot => {
        const skill = String(slot.skill || '').trim();
        return summary.level20.includes(skill) && Number(slot.level || 0) >= 4;
      });

      if (anchor) {
        usedAnchorSkills.add(String(anchor.skill || '').trim());
        return;
      }

      const candidates = summary.level20
        .filter(skill => ArcanaApp.recommendation.getAvailableArcanaForSkill(skill).includes(arcanaName))
        .sort((a, b) => {
          const aExisting = slots.some(slot => String(slot.skill || '').trim() === a) ? 1 : 0;
          const bExisting = slots.some(slot => String(slot.skill || '').trim() === b) ? 1 : 0;
          if (aExisting !== bExisting) return bExisting - aExisting;
          if (usedAnchorSkills.has(a) !== usedAnchorSkills.has(b)) return usedAnchorSkills.has(a) ? 1 : -1;
          return Number(needMap[b] || 0) - Number(needMap[a] || 0);
        });

      for (const skill of candidates) {
        let slot = slots.find(item => String(item.skill || '').trim() === skill);
        if (!slot) {
          if (slots.filter(item => item && String(item.skill || '').trim()).length >= 4) continue;
          slot = { skill, level: 1, isTarget: true, targetLevel: 20, isSevenTwentyAnchor: true };
          slots.push(slot);
          needMap[skill] = Math.max(0, Number(needMap[skill] || 0) - 1);
        }

        while (Number(slot.level || 0) < 4) {
          const cardGrowth = Number(usage[arcanaName].growth || 0);
          const currentCardLevels = ArcanaApp.simulator.calculateCardLevels(cards);
          const currentFinal = Number(baseLevels[skill] || 0) + Number(currentCardLevels[skill] || 0);

          if (cardGrowth >= Number(ArcanaApp.state.maxCardLevel || 5)) break;
          if (currentFinal + 1 > 20) break;

          slot.level = Number(slot.level || 0) + 1;
          usage[arcanaName].growth += 1;
          needMap[skill] = Math.max(0, Number(needMap[skill] || 0) - 1);
        }

        if (Number(slot.level || 0) >= 4) {
          slot.isTarget = true;
          slot.targetLevel = 20;
          slot.isSevenTwentyAnchor = true;
          usedAnchorSkills.add(skill);
          break;
        }
      }
    });
  },

  allocateSkill(skill, needMap, cards, usage, baseLevels, preferredMaxLevel) {
    let guard = 0;
    const targetLevel = ArcanaApp.recommendation.getResolvedTargetLevel(skill);

    while (Number(needMap[skill] || 0) > 0 && guard < 80) {
      guard += 1;
      const currentCardLevels = ArcanaApp.simulator.calculateCardLevels(cards);
      const currentFinal = Number(baseLevels[skill] || 0) + Number(currentCardLevels[skill] || 0);

      if (currentFinal >= targetLevel) {
        needMap[skill] = 0;
        break;
      }

      const candidate = ArcanaApp.recommendation.findBestCardForSkill(skill, cards, usage, preferredMaxLevel);
      if (!candidate) break;

      const cardSlots = cards[candidate.arcanaName];
      let slot = cardSlots.find(item => item.skill === skill);

      if (!slot) {
        if (currentFinal + 1 > targetLevel) break;
        slot = { skill, level: 1, isTarget: true, targetLevel };
        cardSlots.push(slot);
        needMap[skill] = Math.max(0, Number(needMap[skill] || 0) - 1);
        if (Number(needMap[skill] || 0) <= 0) break;
      }

      const nextFinal = Number(baseLevels[skill] || 0)
        + Number(ArcanaApp.simulator.calculateCardLevels(cards)[skill] || 0)
        + 1;

      const canGrow = nextFinal <= targetLevel
        && Number(slot.level || 0) < preferredMaxLevel
        && Number(slot.level || 0) < Number(ArcanaApp.state.maxSlotLevel || 4)
        && Number(usage[candidate.arcanaName].growth || 0) < Number(ArcanaApp.state.maxCardLevel || 5);

      if (!canGrow) break;

      slot.level += 1;
      slot.isTarget = true;
      slot.targetLevel = targetLevel;
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

  fillCardSlots(arcanaName, slots) {
    // 목표 달성 후 남는 슬롯에 임의 스킬을 채우지 않는다.
    // 빈 슬롯은 추천 카드에서 '스킬 여유'로 표시한다.
    while (slots.length < 4) {
      slots.push({ skill: '스킬 여유', level: 0, isTarget: false, isFreeSlot: true });
    }

    slots.splice(4);
  },

  buildMeta(cards, baseLevels, ownedLevels, manualRingLevels, hasManualRing) {
    const state = ArcanaApp.state;
    const finalCardLevels = ArcanaApp.simulator.calculateCardLevels(cards);
    const autoRingOptions = hasManualRing ? { ring1: [], ring2: [] } : ArcanaApp.recommendation.createAutoRingOptions(baseLevels, finalCardLevels);
    const autoRingLevels = ArcanaApp.simulator.calculateEquipmentLevels(autoRingOptions || {});

    const rows = ArcanaApp.recommendation.getEffectiveTargetSkills().map(skill => {
      const targetLevel = ArcanaApp.recommendation.getResolvedTargetLevel(skill);
      const owned = Number(ownedLevels[skill] || 0);
      const cardTotal = Number(finalCardLevels[skill] || 0);
      const recommended = Math.max(0, cardTotal - owned);
      const equipment = Number(manualRingLevels[skill] || 0) + Number(autoRingLevels[skill] || 0);
      const finalLevel = Number(state.baseSkillLevel || 10) + Number(state.devanionBonus || 0) + equipment + cardTotal;
      const shortage = Math.max(0, targetLevel - finalLevel);
      const over = Math.max(0, finalLevel - targetLevel);

      return {
        skill,
        targetLevel,
        autoTarget: !((state.selectedTargetSkills || []).includes(skill)),
        current: Number(state.baseSkillLevel || 10),
        equipment,
        manualRing: Number(manualRingLevels[skill] || 0),
        autoRing: Number(autoRingLevels[skill] || 0),
        owned,
        recommended,
        bonus: Number(state.devanionBonus || 0),
        finalLevel,
        shortage,
        over,
        achieved: shortage === 0 && over === 0,
        must: shortage > 0 || recommended >= 4
      };
    });

    const failedRows = rows.filter(row => row.shortage > 0 || row.over > 0);
    const successCount = rows.filter(row => row.achieved).length;
    const advice = ArcanaApp.recommendation.buildAdvice(rows, autoRingOptions, hasManualRing);

    return {
      rows,
      targetSummary: ArcanaApp.recommendation.getTargetSummary(),
      effectiveTargetSkills: ArcanaApp.recommendation.getEffectiveTargetSkills(),
      advice,
      autoRingOptions,
      hasManualRing,
      ok: failedRows.length === 0,
      successCount,
      failedSkills: failedRows.map(row => row.skill)
    };
  },

  createAutoRingOptions(baseLevels, cardLevels) {
    const state = ArcanaApp.state;
    const options = { ring1: [], ring2: [] };
    const shortages = ArcanaApp.recommendation.getEffectiveTargetSkills()
      .map(skill => {
        const targetLevel = ArcanaApp.recommendation.getResolvedTargetLevel(skill);
        const finalLevel = Number(baseLevels[skill] || 0) + Number(cardLevels[skill] || 0);
        return { skill, shortage: Math.max(0, targetLevel - finalLevel), targetLevel, finalLevel };
      })
      .filter(item => item.shortage > 0)
      .sort((a, b) => b.targetLevel - a.targetLevel || b.shortage - a.shortage);

    ['ring1', 'ring2'].forEach(ringKey => {
      shortages.forEach(item => {
        if (options[ringKey].length >= 6) return;
        if (item.shortage <= 0) return;
        if (item.finalLevel + 1 > item.targetLevel) return;
        options[ringKey].push({ skill: item.skill, level: 1, auto: true });
        item.shortage -= 1;
        item.finalLevel += 1;
      });
    });

    return options;
  },

  buildAdvice(rows, autoRingOptions, hasManualRing) {
    if (!rows || rows.length === 0) {
      return ['목표 스킬을 선택하면 키노조 AI가 부족한 부분을 함께 살펴볼게요.'];
    }

    const shortageRows = rows.filter(row => row.shortage > 0);
    const overRows = rows.filter(row => row.over > 0);
    const achieved20 = rows.filter(row => row.targetLevel === 20 && row.achieved).length;
    const achieved16 = rows.filter(row => row.targetLevel === 16 && row.achieved).length;
    const autoRingSkills = Object.values(autoRingOptions || {}).flat().map(slot => slot.skill).filter(Boolean);
    const summary = ArcanaApp.recommendation.getTargetSummary();
    const auto16Rows = rows.filter(row => row.autoTarget && Number(row.targetLevel || 0) === 16);
    const advice = [];

    advice.push(`20레벨 목표 ${summary.level20.length}개는 ${summary.usedBy20}포인트, 16레벨 직접 목표 ${summary.level16.length}개는 ${summary.usedBy16}포인트로 계산했어요.`);

    if (auto16Rows.length > 0) {
      advice.push(`남는 ${summary.remainPoints}포인트는 직접 지정하지 않은 액티브 스킬 ${auto16Rows.length}개를 16레벨 목표로 자동 분산했어요. 목표 달성 후 남는 아르카나 칸은 스킬 여유로 표시했어요.`);
    } else {
      advice.push(`20레벨 목표 ${achieved20}개, 16레벨 목표 ${achieved16}개를 달성 기준으로 검토했어요. 목표 달성 후 남는 아르카나 칸은 스킬 여유로 표시했어요.`);
    }

    if (summary.level20.length > 0) {
      advice.push('20레벨 목표는 3레벨 분산을 먼저 시도하고, 목표가 남을 때만 4레벨 슬롯을 사용했어요.');
    }

    if (summary.level20.length === 7) {
      advice.push('20레벨 목표가 7개라서 성배, 양피지, 나침반, 천칭에 각각 4레벨 액티브 슬롯을 강제 조건으로 확인했어요.');
    }

    if (overRows.length > 0) {
      const names = overRows.slice(0, 4).map(row => `${row.skill} ${row.over}레벨 초과`).join(', ');
      advice.push(`${names} 상태라서 목표 레벨을 넘지 않는 조정이 필요해요.`);
    }

    if (shortageRows.length > 0) {
      const names = shortageRows.slice(0, 4).map(row => `${row.skill} ${row.shortage}레벨 부족`).join(', ');
      advice.push(`${names} 상태예요. 아르카나만으로 부족한 경우 반지 옵션 교체를 검토해야 해요.`);
    } else if (overRows.length === 0) {
      advice.push('현재 추천 조합은 목표 레벨을 넘기지 않고 달성할 수 있어요.');
    }

    if (hasManualRing && shortageRows.length > 0) {
      const names = shortageRows.slice(0, 3).map(row => row.skill).join(', ');
      advice.push(`저장된 반지 옵션 중 사용하지 않는 옵션을 ${names} 쪽으로 바꾸면 목표 달성 가능성이 높아져요.`);
    } else if (hasManualRing) {
      advice.push('저장된 반지 옵션은 현재 추천 계산의 기본 정보로 반영했어요.');
    } else if (autoRingSkills.length > 0) {
      advice.push(`반지는 마지막 보정 수단으로 ${autoRingSkills.slice(0, 6).join(', ')} 중심을 추천했어요.`);
    } else {
      advice.push('반지 옵션을 입력하면 더 현실적인 교체 가이드를 제공할 수 있어요.');
    }

    return advice.slice(0, 5);
  }
};
