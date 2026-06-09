window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.equipmentEditor = {
  render() {
    ArcanaApp.equipmentEditor.renderToggleButtons();
    ArcanaApp.equipmentEditor.renderCards();
  },

  renderToggleButtons() {
    const wrapper = document.getElementById('arcanaEquipmentToggleRow');
    if (!wrapper) return;

    wrapper.innerHTML = '';

    ArcanaApp.state.equipmentTypes.forEach(equipment => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'arcana-equipment-toggle';
      button.textContent = equipment.label;
      button.dataset.equipmentKey = equipment.key;

      if (ArcanaApp.state.selectedEquipmentKeys.includes(equipment.key)) {
        button.classList.add('is-active');
      }

      button.addEventListener('click', () => {
        ArcanaApp.equipmentEditor.toggleEquipment(equipment.key);
      });

      wrapper.appendChild(button);
    });
  },

  renderCards() {
    const wrapper = document.getElementById('arcanaEquipmentEditor');
    if (!wrapper) return;

    const selectedKeys = ArcanaApp.state.selectedEquipmentKeys;

    Array.from(wrapper.querySelectorAll('.arcana-equipment-card[data-equipment]')).forEach(card => {
      if (!selectedKeys.includes(card.dataset.equipment)) {
        card.remove();
      }
    });

    ArcanaApp.state.equipmentTypes
      .filter(equipment => selectedKeys.includes(equipment.key))
      .forEach(equipment => {
        if (wrapper.querySelector(`.arcana-equipment-card[data-equipment="${equipment.key}"]`)) {
          return;
        }

        const card = ArcanaApp.equipmentEditor.createEquipmentCard(equipment);
        card.classList.add('is-opening');
        wrapper.appendChild(card);
        window.setTimeout(() => card.classList.remove('is-opening'), 240);
      });
  },

  toggleEquipment(equipmentKey) {
    const panel = document.querySelector('[data-panel-key="equipmentOptions"]');
    if (panel && panel.classList.contains('is-saved')) return;

    const selected = ArcanaApp.state.selectedEquipmentKeys;
    const index = selected.indexOf(equipmentKey);

    if (index >= 0) {
      selected.splice(index, 1);
    } else {
      selected.push(equipmentKey);
    }

    ArcanaApp.equipmentEditor.render();
  },

  createEquipmentCard(equipment) {
    const card = document.createElement('article');
    card.className = 'arcana-equipment-card';
    card.dataset.equipment = equipment.key;

    const title = document.createElement('h3');
    title.textContent = equipment.label;
    card.appendChild(title);

    const savedSlots = ArcanaApp.state.equipmentOptions[equipment.key] || [];

    for (let index = 0; index < equipment.slots; index++) {
      card.appendChild(ArcanaApp.equipmentEditor.createSlot(equipment.key, index, savedSlots[index]));
    }

    return card;
  },

  createSlot(equipmentKey, index, savedSlot) {
    const slot = document.createElement('div');
    slot.className = 'arcana-equipment-slot';

    const select = ArcanaApp.customSelect.create({
      placeholder: '스킬 선택',
      options: ArcanaApp.skillSelector.getActiveSkills(),
      value: savedSlot?.skill || '',
      dataset: {
        equipment: equipmentKey,
        slotIndex: String(index),
        maxVisible: '5'
      }
    });

    const level = document.createElement('span');
    level.className = 'arcana-fixed-level';
    level.textContent = 'Lv. 1';

    slot.appendChild(select);
    slot.appendChild(level);
    return slot;
  },

  collect() {
    const options = { ring1: [], ring2: [] };

    document.querySelectorAll('.arcana-equipment-card[data-equipment]').forEach(card => {
      const equipmentKey = card.dataset.equipment;
      const used = new Set();

      if (!options[equipmentKey]) options[equipmentKey] = [];

      card.querySelectorAll('select[data-equipment]').forEach(select => {
        const skill = select.value.trim();

        if (!skill) {
          options[equipmentKey].push({ skill: '', level: 0 });
          return;
        }

        if (used.has(skill)) {
          const label = ArcanaApp.equipmentEditor.getEquipmentLabel(equipmentKey);
          throw new Error(`${label}: 같은 반지 안에는 같은 스킬을 중복 등록할 수 없습니다.`);
        }

        used.add(skill);
        options[equipmentKey].push({ skill, level: 1 });
      });
    });

    return options;
  },

  getEquipmentLabel(equipmentKey) {
    const found = ArcanaApp.state.equipmentTypes.find(item => item.key === equipmentKey);
    return found ? found.label : equipmentKey;
  }
};
