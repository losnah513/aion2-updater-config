window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.ringEditor = {
  render() {
    const wrapper = document.getElementById('arcanaRingEditor');
    if (!wrapper) return;

    wrapper.innerHTML = '';

    [
      { key: 'ring1', label: '반지1' },
      { key: 'ring2', label: '반지2' }
    ].forEach(ring => {
      const card = document.createElement('article');
      card.className = 'arcana-ring-card';
      card.dataset.ring = ring.key;

      const title = document.createElement('h3');
      title.textContent = ring.label;
      card.appendChild(title);

      const savedSlots = ArcanaApp.state.ringOptions[ring.key] || [];

      for (let index = 0; index < 6; index++) {
        const slot = document.createElement('div');
        slot.className = 'arcana-ring-slot';

        const select = document.createElement('select');
        select.dataset.ring = ring.key;
        select.dataset.slotIndex = String(index);

        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '스킬 선택';
        select.appendChild(empty);

        ArcanaApp.skillSelector.getActiveSkills().forEach(skill => {
          const option = document.createElement('option');
          option.value = skill;
          option.textContent = skill;
          select.appendChild(option);
        });

        select.value = savedSlots[index]?.skill || '';

        const level = document.createElement('input');
        level.value = savedSlots[index]?.skill ? '1' : '';
        level.placeholder = 'Lv1';
        level.disabled = true;

        slot.appendChild(select);
        slot.appendChild(level);
        card.appendChild(slot);
      }

      wrapper.appendChild(card);
    });
  },

  collect() {
    const rings = { ring1: [], ring2: [] };

    document.querySelectorAll('.arcana-ring-card[data-ring]').forEach(card => {
      const ringKey = card.dataset.ring;
      const used = new Set();

      card.querySelectorAll('select[data-ring]').forEach(select => {
        const skill = select.value.trim();
        if (!skill) {
          rings[ringKey].push({ skill: '', level: 0 });
          return;
        }

        if (used.has(skill)) {
          throw new Error(`${ringKey === 'ring1' ? '반지1' : '반지2'}: 같은 반지 안에는 같은 스킬을 중복 등록할 수 없습니다.`);
        }

        used.add(skill);
        rings[ringKey].push({ skill, level: 1 });
      });
    });

    return rings;
  }
};
