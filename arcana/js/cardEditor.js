window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.cardEditor = {
  render() {
    const state = ArcanaApp.state;
    const wrapper = document.getElementById('arcanaOwnedCardEditor');
    wrapper.innerHTML = '';

    state.arcanaTypes.forEach(arcanaName => {
      const card = document.createElement('article');
      card.className = 'arcana-card';
      card.dataset.arcana = arcanaName;

      const title = document.createElement('h3');
      title.textContent = arcanaName;
      card.appendChild(title);

      const savedSlots = state.ownedCards[arcanaName] || [];

      for (let index = 0; index < 4; index++) {
        const slot = document.createElement('div');
        slot.className = 'arcana-slot';

        const select = document.createElement('select');
        select.dataset.arcana = arcanaName;
        select.dataset.slotIndex = String(index);

        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '스킬 선택';
        select.appendChild(empty);

        (state.skillsByArcana[arcanaName] || []).forEach(skill => {
          const option = document.createElement('option');
          option.value = skill;
          option.textContent = skill;
          select.appendChild(option);
        });

        select.value = savedSlots[index]?.skill || '';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '4';
        input.placeholder = 'Lv';
        input.value = savedSlots[index]?.level || '';
        input.dataset.arcana = arcanaName;
        input.dataset.slotIndex = String(index);

        slot.appendChild(select);
        slot.appendChild(input);
        card.appendChild(slot);
      }

      const note = document.createElement('div');
      note.className = 'arcana-card-note';
      note.textContent = '카드 총합 최대 5 / 슬롯당 최대 4 / 같은 카드 내 중복 불가';
      card.appendChild(note);

      wrapper.appendChild(card);
    });
  },

  collect() {
    const cards = {};

    document.querySelectorAll('.arcana-card[data-arcana]').forEach(card => {
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
