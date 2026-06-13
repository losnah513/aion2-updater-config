window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.skillSelector = {
  iconCache: {},
  iconLoading: {},

  render() {
    const state = ArcanaApp.state;
    const wrapper = document.getElementById('arcanaTargetSkillList');
    if (!wrapper) return;

    wrapper.innerHTML = '';

    if (!state.hasSelectedClass) {
      ArcanaApp.skillSelector.updateCountText(false);
      const guide = document.createElement('div');
      guide.className = 'arcana-friendly-guide';
      guide.textContent = '어떤 클래스로 시뮬레이션을 진행할까요? 클래스를 선택하면 스킬 정보를 불러올 수 있어요.';
      wrapper.appendChild(guide);
      if (ArcanaApp.app && ArcanaApp.app.updateCharacterSaveButtonState) {
        ArcanaApp.app.updateCharacterSaveButtonState();
      }
      return;
    }

    const skills = ArcanaApp.skillSelector.getActiveSkills();
    const iconMap = ArcanaApp.skillSelector.getCachedIconMap();

    ArcanaApp.skillSelector.updateSkillButtonWidth(wrapper, skills);
    ArcanaApp.skillSelector.updateCountText();
    ArcanaApp.skillSelector.ensureIconData();

    skills.forEach(skill => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'arcana-skill-btn arcana-skill-icon-btn';
      if (ArcanaApp.skillSelector.lastPuddingSkill === skill) {
        button.classList.add('is-pudding');
      }

      const iconUrl = iconMap[skill];
      if (iconUrl) {
        const icon = document.createElement('img');
        icon.className = 'arcana-skill-icon';
        icon.src = ArcanaApp.skillSelector.resolveIconUrl(iconUrl);
        icon.alt = '';
        icon.loading = 'lazy';
        icon.decoding = 'async';
        button.appendChild(icon);
      } else {
        const emptyIcon = document.createElement('span');
        emptyIcon.className = 'arcana-skill-icon arcana-skill-icon-empty';
        emptyIcon.setAttribute('aria-hidden', 'true');
        button.appendChild(emptyIcon);
      }

      const name = document.createElement('span');
      name.className = 'arcana-skill-name';
      name.textContent = skill;
      button.appendChild(name);

      const level = Number((state.targetSkillLevels || {})[skill] || 0);
      if (level > 0) {
        button.classList.add('is-active', `is-level-${level}`);
        ArcanaApp.skillSelector.applyIndividualPrismTiming(button, skill);
        const badge = document.createElement('span');
        badge.className = 'arcana-skill-level-badge';
        badge.textContent = `Lv.${level}`;
        button.appendChild(badge);

        if (level === 20 && ArcanaApp.skillTargetRules) {
          const priorityNumber = ArcanaApp.skillTargetRules.getPriorityNumber(
            skill,
            state.targetSkillPriority20 || [],
            state.targetSkillLevels || {}
          );
          if (priorityNumber > 0) {
            const priority = document.createElement('span');
            priority.className = 'arcana-skill-priority-badge';
            priority.textContent = `중요도 ${priorityNumber}`;
            button.appendChild(priority);
          }
        }
      }

      button.addEventListener('click', () => {
        ArcanaApp.skillSelector.toggle(skill);
      });

      wrapper.appendChild(button);
    });

    if (ArcanaApp.app && ArcanaApp.app.updateCharacterSaveButtonState) {
      ArcanaApp.app.updateCharacterSaveButtonState();
    }
  },

  getActiveSkills() {
    const state = ArcanaApp.state;
    if (!state.hasSelectedClass || !state.currentClassKey) return [];

    const source = (state.activeSkills && state.activeSkills.length > 0)
      ? state.activeSkills
      : ((state.classSkills[state.currentClassKey] || {}).active || []);

    return Array.from(new Set((source || []).map(skill => String(skill).trim()).filter(Boolean)));
  },

  getClassIconFileKey() {
    const state = ArcanaApp.state;
    return ArcanaApp.classSelector && ArcanaApp.classSelector.normalizeClassKey
      ? ArcanaApp.classSelector.normalizeClassKey(state.currentClassKey || state.pendingClassKey || '')
      : '';
  },

  getCachedIconMap() {
    const key = ArcanaApp.skillSelector.getClassIconFileKey();
    return ArcanaApp.skillSelector.iconCache[key] || {};
  },

  ensureIconData() {
    const key = ArcanaApp.skillSelector.getClassIconFileKey();
    const fileName = ArcanaApp.classService
      ? ArcanaApp.classService.getSkillIconFile(key)
      : '';

    if (!key || !fileName) return Promise.resolve();
    if (ArcanaApp.skillSelector.iconCache[key]) return Promise.resolve();
    if (ArcanaApp.skillSelector.iconLoading[key]) return ArcanaApp.skillSelector.iconLoading[key];

    ArcanaApp.skillSelector.iconLoading[key] = fetch(`data/skills/${fileName}`, { cache: 'no-cache' })
      .then(response => {
        if (!response.ok) {
          throw new Error(`스킬 아이콘 데이터를 불러오지 못했습니다: ${fileName}`);
        }
        return response.json();
      })
      .then(data => {
        ArcanaApp.skillSelector.iconCache[key] = data || {};
        ArcanaApp.skillSelector.iconLoading[key] = null;
      })
      .catch(error => {
        console.warn('[Arcana] Skill icon load failed:', error);
        ArcanaApp.skillSelector.iconCache[key] = {};
        ArcanaApp.skillSelector.iconLoading[key] = null;
      });

    return ArcanaApp.skillSelector.iconLoading[key];
  },

  resolveIconUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';

    if (
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('data:image/')
    ) {
      return value;
    }

    return value.replace(/^\.?\//, './');
  },

  toggle(skill) {
    const panel = document.querySelector('[data-panel-key="characterLevels"]');
    if (panel && panel.classList.contains('is-saved')) return;

    const state = ArcanaApp.state;
    state.targetSkillLevels = state.targetSkillLevels || {};
    state.selectedTargetSkills = state.selectedTargetSkills || [];
    state.targetSkillPriority20 = state.targetSkillPriority20 || [];
    state.targetSkillPulseAt = state.targetSkillPulseAt || {};

    const currentLevel = Number(state.targetSkillLevels[skill] || 0);
    const nextLevel = currentLevel <= 0 ? 16 : (currentLevel === 16 ? 20 : 0);
    const ruleCheck = ArcanaApp.skillTargetRules
      ? ArcanaApp.skillTargetRules.canSetLevel(skill, nextLevel, state.targetSkillLevels)
      : { ok: true };

    if (!ruleCheck.ok) {
      ArcanaApp.skillSelector.updateCountText(true, ArcanaApp.skillTargetRules.getLimitText(ruleCheck.reason));
      return;
    }

    if (nextLevel <= 0) {
      state.selectedTargetSkills = state.selectedTargetSkills.filter(item => item !== skill);
      delete state.targetSkillLevels[skill];
      delete state.targetSkillPulseAt[skill];
      state.targetSkillPriority20 = state.targetSkillPriority20.filter(item => item !== skill);
    } else {
      if (!state.selectedTargetSkills.includes(skill)) state.selectedTargetSkills.push(skill);
      state.targetSkillLevels[skill] = nextLevel;
      state.targetSkillPulseAt[skill] = Date.now();

      if (nextLevel === 20 && !state.targetSkillPriority20.includes(skill)) {
        state.targetSkillPriority20.push(skill);
      }
      if (nextLevel === 16) {
        state.targetSkillPriority20 = state.targetSkillPriority20.filter(item => item !== skill);
      }
    }

    if (ArcanaApp.skillTargetRules) {
      state.targetSkillPriority20 = ArcanaApp.skillTargetRules.normalizePriorityOrder(
        state.targetSkillPriority20,
        state.targetSkillLevels
      );
    }

    state.activeSkillTargets = ArcanaApp.app && ArcanaApp.app.normalizeActiveSkillTargets
      ? ArcanaApp.app.normalizeActiveSkillTargets(state.selectedTargetSkills, state.targetSkillLevels)
      : state.targetSkillLevels;

    ArcanaApp.skillSelector.playPudding(skill);
    ArcanaApp.skillSelector.render();
    if (ArcanaApp.app && ArcanaApp.app.updateCharacterSaveButtonState) {
      ArcanaApp.app.updateCharacterSaveButtonState();
    }
    ArcanaApp.app.resetRecommendation();
  },

  playPudding(skill) {
    window.clearTimeout(ArcanaApp.skillSelector.puddingTimer);
    ArcanaApp.skillSelector.lastPuddingSkill = skill;
    ArcanaApp.skillSelector.puddingTimer = window.setTimeout(() => {
      ArcanaApp.skillSelector.lastPuddingSkill = '';
    }, 260);
  },

  applyIndividualPrismTiming(button, skill) {
    const state = ArcanaApp.state || {};
    state.targetSkillPulseAt = state.targetSkillPulseAt || {};

    if (!state.targetSkillPulseAt[skill]) {
      const activeOrder = (state.selectedTargetSkills || []).indexOf(skill);
      state.targetSkillPulseAt[skill] = Date.now() - Math.max(0, activeOrder) * 2310;
    }

    const durationMs = 20000;
    const elapsed = (Date.now() - state.targetSkillPulseAt[skill]) % durationMs;
    button.style.setProperty('--arcana-skill-flow-delay', `${-(elapsed / 1000).toFixed(2)}s`);
  },

  getTargetLevel(skill) {
    return Number((ArcanaApp.state.targetSkillLevels || {})[skill] || ArcanaApp.state.targetLevel || 20);
  },

  updateCountText(isLimitNotice, limitMessage) {
    const text = document.getElementById('arcanaTargetCountText');
    if (!text) return;

    text.classList.toggle('is-limit', Boolean(isLimitNotice));

    if (!ArcanaApp.state.hasSelectedClass) {
      text.textContent = '클래스를 선택하면 활성화됩니다';
      return;
    }

    if (isLimitNotice) {
      text.textContent = limitMessage || '현재 선택 조건에서는 더 선택할 수 없어요.';
      text.style.animation = 'none';
      text.offsetHeight;
      text.style.animation = '';
      window.clearTimeout(ArcanaApp.skillSelector.limitTimer);
      ArcanaApp.skillSelector.limitTimer = window.setTimeout(() => {
        ArcanaApp.skillSelector.updateCountText(false);
      }, 1600);
      return;
    }

    text.textContent = ArcanaApp.skillTargetRules
      ? ArcanaApp.skillTargetRules.getGuideText(ArcanaApp.state.targetSkillLevels || {})
      : `${ArcanaApp.state.selectedTargetSkills.length}개 선택`;
  },

  updateSkillButtonWidth(wrapper, skills) {
    const allSkills = Object.values(ArcanaApp.state.classSkills || {})
      .flatMap(item => item && item.active ? item.active : []);
    const source = allSkills.length > 0 ? allSkills : skills;
    const longest = source.reduce((max, skill) => Math.max(max, String(skill).length), 0);
    const width = Math.min(144, Math.max(126, longest * 9 + 54));

    document.documentElement.style.setProperty('--arcana-skill-button-width', `${width}px`);
    document.documentElement.style.setProperty('--arcana-compact-panel-width', `${width * 2 + 24}px`);
    wrapper.style.setProperty('--arcana-skill-button-width', `${width}px`);
  }
};
