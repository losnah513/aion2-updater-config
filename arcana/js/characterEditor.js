window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.characterEditor = {
  render() {
    // ARC-0.2.01: 캐릭터 스킬 레벨 입력은 액티브 스킬 버튼 내부로 통합했습니다.
  },

  collect() {
    const levels = {};

    ArcanaApp.state.selectedTargetSkills.forEach(skill => {
      const input = document.querySelector(`[data-skill-level-input="${CSS.escape(skill)}"]`);
      const level = Number(input && input.value ? input.value : 0);

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
