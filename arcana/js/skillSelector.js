window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.skillSelector = {
  render() {
    const state = ArcanaApp.state;
    const wrapper = document.getElementById('arcanaTargetSkillList');
    if (!wrapper) return;

    wrapper.innerHTML = '';

    const skills = ArcanaApp.skillSelector.getActiveSkills();

    ArcanaApp.skillSelector.updateSkillButtonWidth(wrapper, skills);
    ArcanaApp.skillSelector.updateCountText();

    skills.forEach(skill => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'arcana-skill-btn';
      button.textContent = skill;

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
    const classData = state.classSkills[state.currentClassKey] || {};
    const source = classData.active && classData.active.length > 0
      ? classData.active
      : state.activeSkills;

    return Array.from(new Set((source || []).map(skill => String(skill).trim()).filter(Boolean)));
  },

  toggle(skill) {
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
  },

  updateCountText(isLimitNotice) {
    const text = document.getElementById('arcanaTargetCountText');
    if (!text) return;

    const current = ArcanaApp.state.selectedTargetSkills.length;
    const max = ArcanaApp.state.maxTargetSkills;
    text.classList.toggle('is-limit', Boolean(isLimitNotice));

    if (isLimitNotice) {
      text.textContent = `최대치인 ${max}개를 선택했습니다`;
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
    const width = Math.min(136, Math.max(126, longest * 11 + 16));

    document.documentElement.style.setProperty('--arcana-skill-button-width', `${width}px`);
    document.documentElement.style.setProperty('--arcana-compact-panel-width', `${width * 2 + 30}px`);
    wrapper.style.setProperty('--arcana-skill-button-width', `${width}px`);
  }
};
