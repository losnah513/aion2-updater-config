window.ArcanaApp = window.ArcanaApp || {};

/**
 * ARCANA SkillTargetRules
 *
 * 20레벨/16레벨 목표 선택 제한과 중요도 표시 규칙만 담당합니다.
 * 기본 14레벨 상태에서 20목표는 +6, 16목표는 +2, 전체 예산은 42포인트입니다.
 */
ArcanaApp.skillTargetRules = {
  totalBudget: 42,
  pointFor20: 6,
  pointFor16: 2,
  maxLevel20: 7,
  priorityVisibleCount: 5,

  getCounts(targetSkillLevels = {}) {
    const values = Object.values(targetSkillLevels || {}).map(Number);
    return {
      level20: values.filter(level => level === 20).length,
      level16: values.filter(level => level === 16).length
    };
  },

  getBudget(targetSkillLevels = {}) {
    const counts = ArcanaApp.skillTargetRules.getCounts(targetSkillLevels);
    const used = (counts.level20 * ArcanaApp.skillTargetRules.pointFor20) + (counts.level16 * ArcanaApp.skillTargetRules.pointFor16);
    const remaining = Math.max(0, ArcanaApp.skillTargetRules.totalBudget - used);
    const max16ByCurrent20 = Math.max(0, Math.floor((ArcanaApp.skillTargetRules.totalBudget - (counts.level20 * ArcanaApp.skillTargetRules.pointFor20)) / ArcanaApp.skillTargetRules.pointFor16));

    return {
      ...counts,
      used,
      remaining,
      max20: ArcanaApp.skillTargetRules.maxLevel20,
      max16: max16ByCurrent20,
      remaining16Slots: Math.max(0, max16ByCurrent20 - counts.level16)
    };
  },

  canSetLevel(skill, nextLevel, targetSkillLevels = {}) {
    const draft = { ...(targetSkillLevels || {}) };
    if (!nextLevel) {
      delete draft[skill];
    } else {
      draft[skill] = Number(nextLevel);
    }

    const budget = ArcanaApp.skillTargetRules.getBudget(draft);
    if (budget.level20 > ArcanaApp.skillTargetRules.maxLevel20) {
      return { ok: false, reason: '20레벨 목표는 최대 7개까지 선택할 수 있어요.' };
    }

    if (budget.used > ArcanaApp.skillTargetRules.totalBudget) {
      return { ok: false, reason: '현재 20레벨 목표 개수 기준으로 16레벨 목표를 더 선택할 수 없어요.' };
    }

    return { ok: true, budget };
  },

  normalizePriorityOrder(priorityOrder = [], targetSkillLevels = {}) {
    const level20Set = new Set(Object.keys(targetSkillLevels || {}).filter(skill => Number(targetSkillLevels[skill]) === 20));
    const result = [];

    (priorityOrder || []).forEach(skill => {
      if (level20Set.has(skill) && !result.includes(skill)) result.push(skill);
    });

    Object.keys(targetSkillLevels || {}).forEach(skill => {
      if (Number(targetSkillLevels[skill]) === 20 && !result.includes(skill)) result.push(skill);
    });

    return result;
  },

  getPriorityNumber(skill, priorityOrder = [], targetSkillLevels = {}) {
    const order = ArcanaApp.skillTargetRules.normalizePriorityOrder(priorityOrder, targetSkillLevels);
    const index = order.indexOf(skill);
    return index >= 0 && index < ArcanaApp.skillTargetRules.priorityVisibleCount ? index + 1 : 0;
  },

  getGuideText(targetSkillLevels = {}) {
    const budget = ArcanaApp.skillTargetRules.getBudget(targetSkillLevels);
    if (budget.level20 >= 7) {
      return '20레벨 7개 선택 완료 / 16레벨 추가 선택 불가';
    }

    return `20레벨 ${budget.level20}개 선택 / 16레벨 ${budget.max16}개까지 선택 가능 (현재 ${budget.level16}개)`;
  },

  getLimitText(reason) {
    return reason || '현재 선택 조건에서는 더 선택할 수 없어요.';
  }
};
