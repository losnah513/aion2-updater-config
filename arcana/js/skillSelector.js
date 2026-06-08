window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.skillSelector = {
  render() {
    const state = ArcanaApp.state;
    const wrapper = document.getElementById('arcanaTargetSkillList');
    if (!wrapper) return;

    wrapper.innerHTML = '';

    const skills = ArcanaApp.skillSelector.getActiveSkills();

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
        alert('20레벨 목표 스킬은 최대 7개까지 선택할 수 있습니다.');
        return;
      }
      state.selectedTargetSkills.push(skill);
    }

    ArcanaApp.skillSelector.render();
  }
};
