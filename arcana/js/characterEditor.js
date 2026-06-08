window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.characterEditor = {
  render() {
    const wrapper = document.getElementById('arcanaCharacterSkillEditor');
    if (!wrapper) return;

    wrapper.innerHTML = '';

    ArcanaApp.skillSelector.getActiveSkills().forEach(skill => {
      const row = document.createElement('div');
      row.className = 'arcana-level-row';

      const name = document.createElement('div');
      name.className = 'arcana-level-name';
      name.textContent = skill;
      name.title = skill;

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '20';
      input.placeholder = 'Lv';
      input.dataset.skill = skill;
      input.value = ArcanaApp.state.characterLevels[skill] || '';

      row.appendChild(name);
      row.appendChild(input);
      wrapper.appendChild(row);
    });
  },

  collect() {
    const levels = {};

    document.querySelectorAll('#arcanaCharacterSkillEditor input[data-skill]').forEach(input => {
      const skill = input.dataset.skill;
      const level = Number(input.value || 0);

      if (level < 0 || level > 20) {
        throw new Error(`${skill}: 캐릭터 스킬 레벨은 0~20 사이로 입력해주세요.`);
      }

      if (level > 0) {
        levels[skill] = level;
      }
    });

    return levels;
  }
};
