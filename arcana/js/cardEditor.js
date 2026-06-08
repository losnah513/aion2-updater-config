window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.cardEditor = {
  render() {
    const wrapper = document.getElementById('arcanaCardCompare');
    if (!wrapper) return;

    wrapper.innerHTML = '';

    ArcanaApp.state.arcanaTypes.forEach(arcanaName => {
      const row = document.createElement('section');
      row.className = 'arcana-compare-row';
      row.dataset.arcana = arcanaName;

      const title = document.createElement('h3');
      title.className = 'arcana-compare-title';
      title.textContent = arcanaName;
      row.appendChild(title);

      const inner = document.createElement('div');
      inner.className = 'arcana-compare-inner';

      inner.appendChild(ArcanaApp.cardEditor.createOwnedCard(arcanaName));
      inner.appendChild(ArcanaApp.cardEditor.createRecommendationCard(arcanaName));

      row.appendChild(inner);
      wrapper.appendChild(row);
    });
  },

  createOwnedCard(arcanaName) {
    const card = document.createElement('article');
    card.className = 'arcana-card-box arcana-owned-card';
    card.dataset.arcana = arcanaName;

    const title = document.createElement('h4');
    title.textContent = '현재 내 아르카나';
    card.appendChild(title);

    const savedSlots = ArcanaApp.state.ownedCards[arcanaName] || [];

    for (let index = 0; index < 4; index++) {
      card.appendChild(ArcanaApp.cardEditor.createEditableSlot(arcanaName, index, savedSlots[index]));
    }

    const note = document.createElement('div');
    note.className = 'arcana-card-note';
    note.textContent = '카드 총합 최대 5 / 슬롯당 최대 4 / 같은 카드 내 중복 불가';
    card.appendChild(note);

    return card;
  },

  createRecommendationCard(arcanaName) {
    const card = document.createElement('article');
    card.className = 'arcana-card-box arcana-recommend-card';

    const title = document.createElement('h4');
    title.textContent = '추천 아르카나';
    card.appendChild(title);

    const slots = ArcanaApp.state.recommendationCards[arcanaName] || [];

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

    const note = document.createElement('div');
    note.className = 'arcana-card-note';
    note.textContent = '추천 계산 후 표시됩니다.';
    card.appendChild(note);

    return card;
  },

  createEditableSlot(arcanaName, index, savedSlot) {
    const slot = document.createElement('div');
    slot.className = 'arcana-slot';

    const select = document.createElement('select');
    select.dataset.arcana = arcanaName;
    select.dataset.slotIndex = String(index);

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '스킬 선택';
    select.appendChild(empty);

    (ArcanaApp.state.skillsByArcana[arcanaName] || []).forEach(skill => {
      const option = document.createElement('option');
      option.value = skill;
      option.textContent = skill;
      select.appendChild(option);
    });

    select.value = savedSlot?.skill || '';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '4';
    input.placeholder = 'Lv';
    input.value = savedSlot?.level || '';
    input.dataset.arcana = arcanaName;
    input.dataset.slotIndex = String(index);

    slot.appendChild(select);
    slot.appendChild(input);
    return slot;
  },

  collect() {
    const cards = {};

    document.querySelectorAll('.arcana-owned-card[data-arcana]').forEach(card => {
      const arcanaName = card.dataset.arcana;
      const slots = [];

      card.querySelectorAll('.arcana-slot').forEach(slotEl => {
        const select = slotEl.querySelector('select');
        const input = slotEl.querySelector('input');
        slots.push({
          skill: select.value,
          level: Number(input.value || 0)
        });
      });

      const validation = ArcanaApp.simulator.validateCardSlots(slots);
      if (!validation.ok) {
        throw new Error(`${arcanaName}: ${validation.message}`);
      }

      cards[arcanaName] = slots;
    });

    return cards;
  }
};
