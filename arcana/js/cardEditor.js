window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.cardEditor = {
  render() {
    const ownedGrid = document.getElementById('arcanaOwnedCardGrid');
    const recommendGrid = document.getElementById('arcanaRecommendCardGrid');

    if (ownedGrid) {
      ownedGrid.innerHTML = '';
      ArcanaApp.state.arcanaTypes.forEach(arcanaName => {
        ownedGrid.appendChild(ArcanaApp.cardEditor.createOwnedCard(arcanaName));
      });
    }

    if (recommendGrid) {
      recommendGrid.innerHTML = '';
      ArcanaApp.state.arcanaTypes.forEach(arcanaName => {
        recommendGrid.appendChild(ArcanaApp.cardEditor.createRecommendationCard(arcanaName));
      });
    }

    ArcanaApp.cardEditor.refreshRecommendState();
  },

  refreshRecommendState() {
    const panel = document.querySelector('[data-panel-key="recommendArcanaCards"]');
    if (!panel) return;

    const hasRecommendation = Object.values(ArcanaApp.state.recommendationCards || {})
      .some(slots => Array.isArray(slots) && slots.some(slot => slot.skill));

    panel.classList.toggle('is-recommend-ready', hasRecommendation);
    panel.classList.toggle('is-recommend-locked', !hasRecommendation);
  },

  createOwnedCard(arcanaName) {
    const card = document.createElement('article');
    card.className = 'arcana-card-box arcana-owned-card';
    card.dataset.arcana = arcanaName;

    const title = document.createElement('h4');
    title.textContent = arcanaName;
    card.appendChild(title);

    const savedSlots = ArcanaApp.state.ownedCards[arcanaName] || [];

    for (let index = 0; index < 4; index++) {
      card.appendChild(ArcanaApp.cardEditor.createEditableSlot(arcanaName, index, savedSlots[index]));
    }

    return card;
  },

  createRecommendationCard(arcanaName) {
    const card = document.createElement('article');
    card.className = 'arcana-card-box arcana-recommend-card';

    const title = document.createElement('h4');
    title.textContent = arcanaName;
    card.appendChild(title);

    const slots = ArcanaApp.state.recommendationCards[arcanaName] || [];

    for (let index = 0; index < 4; index++) {
      const slot = slots[index] || { skill: '', level: 0 };
      const slotEl = document.createElement('div');
      slotEl.className = 'arcana-slot';

      const select = document.createElement('select');
      select.disabled = true;
      const option = document.createElement('option');
      option.textContent = slot.skill || '추천 없음';
      select.appendChild(option);

      const level = document.createElement('input');
      level.disabled = true;
      level.value = slot.level || '';
      level.placeholder = 'Lv';

      slotEl.appendChild(select);
      slotEl.appendChild(level);
      card.appendChild(slotEl);
    }

    return card;
  },

  createEditableSlot(arcanaName, index, savedSlot) {
    const slot = document.createElement('div');
    slot.className = 'arcana-slot';

    const select = document.createElement('select');
    select.dataset.arcana = arcanaName;
    select.dataset.slotIndex = String(index);
    select.dataset.maxVisible = '5';

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
