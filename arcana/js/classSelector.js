window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.classSelector = {
  render() {
    const state = ArcanaApp.state;
    const button = document.getElementById('arcanaClassPickerButton');
    const list = document.getElementById('arcanaClassCardList');
    const layout = document.getElementById('arcanaMainLayout');

    if (!button || !list || !layout) return;

    button.textContent = state.hasSelectedClass
      ? ArcanaApp.classSelector.getClassName(state.currentClassKey)
      : '클래스 선택';

    layout.classList.toggle('is-class-locked', !state.hasSelectedClass);

    list.innerHTML = '';
    state.classList.forEach(item => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'arcana-class-card';
      card.textContent = item.name;
      card.dataset.classKey = item.key;

      if ((state.pendingClassKey || state.currentClassKey) === item.key) {
        card.classList.add('is-selected');
      }

      card.addEventListener('click', () => {
        state.pendingClassKey = item.key;
        ArcanaApp.classSelector.render();
        ArcanaApp.classSelector.open();
      });

      list.appendChild(card);
    });
  },

  bind() {
    const pickerButton = document.getElementById('arcanaClassPickerButton');
    const confirmButton = document.getElementById('arcanaConfirmClass');
    const closeButton = document.getElementById('arcanaCloseClass');

    if (pickerButton) {
      pickerButton.addEventListener('click', () => {
        ArcanaApp.classSelector.toggle();
      });
    }

    if (confirmButton) {
      confirmButton.addEventListener('click', () => {
        ArcanaApp.classSelector.confirm();
      });
    }

    if (closeButton) {
      closeButton.addEventListener('click', () => {
        ArcanaApp.classSelector.close();
      });
    }

    document.addEventListener('click', event => {
      const picker = document.getElementById('arcanaClassPicker');
      if (!picker || picker.contains(event.target)) return;
      ArcanaApp.classSelector.close();
    });
  },

  toggle() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (!dropdown) return;
    dropdown.hidden ? ArcanaApp.classSelector.open() : ArcanaApp.classSelector.close();
  },

  open() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (dropdown) dropdown.hidden = false;
  },

  close() {
    const dropdown = document.getElementById('arcanaClassPickerDropdown');
    if (dropdown) dropdown.hidden = true;
  },

  confirm() {
    const state = ArcanaApp.state;
    const nextKey = state.pendingClassKey || state.currentClassKey || (state.classList[0] && state.classList[0].key);

    if (!nextKey) return;

    state.currentClassKey = nextKey;
    state.pendingClassKey = nextKey;
    state.hasSelectedClass = true;
    state.selectedTargetSkills = [];
    state.characterLevels = {};
    state.equipmentOptions = { weapon: [], guarder: [], ring1: [], ring2: [] };
    state.ringOptions = { ring1: [], ring2: [] };
    state.ownedCards = {};
    state.recommendationCards = {};

    ArcanaApp.classSelector.clearSavedPanels();
    ArcanaApp.classSelector.close();
    ArcanaApp.ui.renderAll();
  },

  clearSavedPanels() {
    const saveMap = {
      characterLevels: 'arcanaSaveCharacterLevels',
      equipmentOptions: 'arcanaSaveEquipment',
      ownedArcanaCards: 'arcanaSaveOwnedCards'
    };

    Object.entries(saveMap).forEach(([panelKey, buttonId]) => {
      ArcanaApp.panelLock.unlock(panelKey, document.getElementById(buttonId));
    });
  },

  getClassName(classKey) {
    const found = ArcanaApp.state.classList.find(item => item.key === classKey);
    return found ? found.name : '클래스 선택';
  }
};
