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

    text.classList.toggle('is-limit', current >= max);

    if (current >= max || isLimitNotice) {
      text.textContent = `최대치인 ${max}개를 선택했습니다`;
      return;
    }

    text.textContent = `최대 ${max}개 선택 가능 / 현재 ${current}개 선택`;
  },

  updateSkillButtonWidth(wrapper, skills) {
    const longest = skills.reduce((max, skill) => Math.max(max, String(skill).length), 0);
    const width = Math.min(170, Math.max(112, longest * 13 + 28));
    wrapper.style.setProperty('--arcana-skill-button-width', `${width}px`);
  }
};
