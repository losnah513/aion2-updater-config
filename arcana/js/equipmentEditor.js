window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.equipmentEditor = {
  render() {
    ArcanaApp.equipmentEditor.ensureDefaultEquipmentKeys();
    ArcanaApp.equipmentEditor.renderToggleButtons();
    ArcanaApp.equipmentEditor.renderCards();
  },

  ensureDefaultEquipmentKeys() {
    ArcanaApp.state.selectedEquipmentKeys = ArcanaApp.state.equipmentTypes.map(equipment => equipment.key);
  },

  renderToggleButtons() {
    const wrapper = document.getElementById('arcanaEquipmentToggleRow');
    if (!wrapper) return;

    wrapper.innerHTML = '';
    wrapper.hidden = true;
  },

  renderCards() {
    const wrapper = document.getElementById('arcanaEquipmentEditor');
    if (!wrapper) return;

    ArcanaApp.equipmentEditor.ensureDefaultEquipmentKeys();
    wrapper.innerHTML = '';

    ArcanaApp.state.equipmentTypes.forEach(equipment => {
      const card = ArcanaApp.equipmentEditor.createEquipmentCard(equipment);
      wrapper.appendChild(card);
    });

    ArcanaApp.equipmentEditor.bindLiveUpdates(wrapper);
    ArcanaApp.equipmentEditor.updateDuplicateSkillLocks(wrapper);
    ArcanaApp.equipmentEditor.updateSaveButtonLabel();
  },

  toggleEquipment() {
    ArcanaApp.equipmentEditor.ensureDefaultEquipmentKeys();
    ArcanaApp.equipmentEditor.render();
  },

  bindLiveUpdates(wrapper) {
    if (!wrapper || wrapper.dataset.arcanaBound === 'true') return;
    wrapper.dataset.arcanaBound = 'true';

    wrapper.addEventListener('change', event => {
      if (!event.target.matches('select[data-equipment]')) return;
      ArcanaApp.equipmentEditor.updateDuplicateSkillLocks(wrapper);
      ArcanaApp.equipmentEditor.updateSaveButtonLabel();
    });
  },

  updateDuplicateSkillLocks(root) {
    const wrapper = root || document.getElementById('arcanaEquipmentEditor');
    if (!wrapper) return;

    wrapper.querySelectorAll('.arcana-equipment-card[data-equipment]').forEach(card => {
      const selects = Array.from(card.querySelectorAll('select[data-equipment]'));
      const selected = selects
        .map(select => String(select.value || '').trim())
        .filter(Boolean);

      selects.forEach(select => {
        const currentValue = String(select.value || '').trim();
        const disabledValues = new Set(selected.filter(skill => skill && skill !== currentValue));
        ArcanaApp.customSelect.setDisabledValues(select, disabledValues);
      });
    });
  },

  updateSaveButtonLabel() {
    const button = document.getElementById('arcanaSaveEquipment');
    if (!button) return;

    const hasSelectedSkill = Array.from(document.querySelectorAll('select[data-equipment]'))
      .some(select => String(select.value || '').trim());

    button.textContent = hasSelectedSkill ? '반지 옵션 저장' : '옵션 추천 받기';
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
