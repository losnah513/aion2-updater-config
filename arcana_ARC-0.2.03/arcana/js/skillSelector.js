window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.skillSelector = {
  iconFiles: {
    templar: 'guardian.json',
    guardian: 'guardian.json',
    gladiator: 'gladiator.json',
    ranger: 'ranger.json',
    assassin: 'assassin.json',
    sorcerer: 'sorcerer.json',
    elementalist: 'spiritmaster.json',
    spiritmaster: 'spiritmaster.json',
    cleric: 'cleric.json',
    chanter: 'chanter.json',

    수호성: 'guardian.json',
    검성: 'gladiator.json',
    궁성: 'ranger.json',
    살성: 'assassin.json',
    마도성: 'sorcerer.json',
    정령성: 'spiritmaster.json',
    치유성: 'cleric.json',
    호법성: 'chanter.json'
  },

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

      if (state.selectedTargetSkills.includes(skill)) {
        button.classList.add('is-active');
      }

      button.addEventListener('click', () => {
        ArcanaApp.skillSelector.toggle(skill);
      });

      wrapper.appendChild(button);
    });
  },

  getActiveSkills() {
    const state = ArcanaApp.state;
    if (!state.hasSelectedClass || !state.currentClassKey) return [];

    const classData = state.classSkills[state.currentClassKey] || {};
    const source = classData.active || [];

    return Array.from(new Set((source || []).map(skill => String(skill).trim()).filter(Boolean)));
  },

  getClassIconFileKey() {
    const state = ArcanaApp.state;
    const classKey = state.currentClassKey || state.pendingClassKey || '';
    const className = ArcanaApp.classSelector && ArcanaApp.classSelector.getClassName
      ? ArcanaApp.classSelector.getClassName(classKey)
      : '';

    return ArcanaApp.skillSelector.iconFiles[classKey]
      ? classKey
      : className;
  },

  getCachedIconMap() {
    const key = ArcanaApp.skillSelector.getClassIconFileKey();
    return ArcanaApp.skillSelector.iconCache[key] || {};
  },

  ensureIconData() {
    const key = ArcanaApp.skillSelector.getClassIconFileKey();
    const fileName = ArcanaApp.skillSelector.iconFiles[key];

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
    const index = state.selectedTargetSkills.indexOf(skill);

    if (index >= 0) {
      state.selectedTargetSkills.splice(index, 1);
    } else {
      if (state.selectedTargetSkills.length >= state.maxTargetSkills) {
        ArcanaApp.skillSelector.updateCountText(true);
        return;
      }
      state.selectedTargetSkills.push(skill);
    }

    ArcanaApp.skillSelector.render();
    ArcanaApp.app.resetRecommendation();
  },

  updateCountText(isLimitNotice) {
    const text = document.getElementById('arcanaTargetCountText');
    if (!text) return;

    const current = ArcanaApp.state.selectedTargetSkills.length;
    const max = ArcanaApp.state.maxTargetSkills;
    text.classList.toggle('is-limit', Boolean(isLimitNotice));

    if (!ArcanaApp.state.hasSelectedClass) {
      text.textContent = '클래스를 선택하면 활성화됩니다';
      return;
    }

    if (isLimitNotice) {
      text.textContent = `${max}개를 선택했습니다`;
      text.style.animation = 'none';
      text.offsetHeight;
      text.style.animation = '';
      window.clearTimeout(ArcanaApp.skillSelector.limitTimer);
      ArcanaApp.skillSelector.limitTimer = window.setTimeout(() => {
        ArcanaApp.skillSelector.updateCountText(false);
      }, 1200);
      return;
    }

    text.textContent = current === 0
      ? `최대 ${max}개 선택 가능`
      : `${current}개 선택 / 최대 ${max}개`;
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
