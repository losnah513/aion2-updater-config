window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.skillSelector = {
  getAllSkills() {
    const state = ArcanaApp.state;
    const classSkills = state.classSkills[state.currentClassKey] || {};
    const source = classSkills.active || state.activeSkills || [];

    if (source.length > 0) {
      return ArcanaApp.skillSelector.uniqueSkills(source);
    }

    const fallback = [];
    Object.values(state.skillsByArcana).forEach(list => {
      list.forEach(skill => fallback.push(skill));
    });

    return ArcanaApp.skillSelector.uniqueSkills(fallback);
  },

  uniqueSkills(list) {
    const seen = new Set();
    const result = [];

    (list || []).forEach(value => {
      const skill = String(value || '').trim();
      if (!skill || seen.has(skill)) return;
      seen.add(skill);
      result.push(skill);
    });

    return result;
  },

  render() {
    const state = ArcanaApp.state;
    const wrapper = document.getElementById('arcanaTargetSkillList');
    wrapper.innerHTML = '';

    ArcanaApp.skillSelector.getAllSkills().forEach(skill => {
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

  toggle(skill) {
    const state = ArcanaApp.state;
    const index = state.selectedTargetSkills.indexOf(skill);

    if (index >= 0) {
      state.selectedTargetSkills.splice(index, 1);
    } else {
      if (state.selectedTargetSkills.length >= state.maxTargetSkills) {
        alert('목표 스킬은 최대 7개까지 선택할 수 있습니다.');
        return;
      }
      state.selectedTargetSkills.push(skill);
    }

    ArcanaApp.skillSelector.render();
    ArcanaApp.ui.renderResults();
  }
};
