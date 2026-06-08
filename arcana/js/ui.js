window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.ui = {
  renderAll() {
    ArcanaApp.skillSelector.render();
    ArcanaApp.cardEditor.render();
    ArcanaApp.ui.renderResults();
    ArcanaApp.ui.renderRecommendationCards({});
  },

  renderResults() {
    const wrapper = document.getElementById('arcanaResultSummary');
    const state = ArcanaApp.state;
    const results = ArcanaApp.simulator.calculateFinalResult(state.ownedCards, state.recommendationCards);

    wrapper.innerHTML = '';

    if (state.selectedTargetSkills.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'arcana-result-empty';
      empty.textContent = '20레벨을 원하는 스킬을 먼저 선택하세요.';
      wrapper.appendChild(empty);
      return;
    }

    results.forEach(result => {
      const row = document.createElement('div');
      row.className = `arcana-result-row ${result.success ? 'is-success' : 'is-fail'}`;
      row.innerHTML = `
        <strong>${result.skill}</strong>
        <span>보유 ${result.owned} + 추천 ${result.recommended} + 데바니온 ${result.devanionBonus} = ${result.finalLevel}레벨 ${result.success ? '달성' : `부족 ${result.shortage}`}</span>
      `;
      wrapper.appendChild(row);
    });
  },

  renderRecommendationCards(cards) {
    const state = ArcanaApp.state;
    const wrapper = document.getElementById('arcanaRecommendationCards');
    wrapper.innerHTML = '';

    state.arcanaTypes.forEach(arcanaName => {
      const card = document.createElement('article');
      card.className = 'arcana-card';

      const title = document.createElement('h3');
      title.textContent = arcanaName;
      card.appendChild(title);

      const slots = cards[arcanaName] || [];

      for (let index = 0; index < 4; index++) {
        const slot = slots[index] || { skill: '', level: 0 };
        const slotEl = document.createElement('div');
        slotEl.className = 'arcana-slot';
        slotEl.innerHTML = `
          <select disabled><option>${slot.skill || '추천 없음'}</option></select>
          <input disabled value="${slot.level || ''}" placeholder="Lv" />
        `;
        card.appendChild(slotEl);
      }

      wrapper.appendChild(card);
    });
  }
};
