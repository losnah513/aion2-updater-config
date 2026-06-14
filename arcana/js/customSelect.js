window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.customSelect = {
  create(config) {
    const wrapper = document.createElement('div');
    wrapper.className = 'arcana-custom-select';

    const hiddenSelect = document.createElement('select');
    hiddenSelect.className = 'arcana-native-select-hidden';
    hiddenSelect.tabIndex = -1;

    Object.entries(config.dataset || {}).forEach(([key, value]) => {
      hiddenSelect.dataset[key] = String(value);
    });

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = config.placeholder || '선택';
    hiddenSelect.appendChild(emptyOption);

    (config.options || []).forEach(optionValue => {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionValue;
      hiddenSelect.appendChild(option);
    });

    hiddenSelect.value = config.value || '';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'arcana-custom-select-button';
    button.textContent = hiddenSelect.value || config.placeholder || '선택';

    const dropdown = document.createElement('div');
    dropdown.className = 'arcana-custom-select-menu';
    dropdown.hidden = true;

    const renderOptions = () => {
      dropdown.innerHTML = '';

      const emptyItem = ArcanaApp.customSelect.createItem('', config.placeholder || '선택', hiddenSelect.value === '');
      dropdown.appendChild(emptyItem);

      (config.options || []).forEach(optionValue => {
        const item = ArcanaApp.customSelect.createItem(optionValue, optionValue, hiddenSelect.value === optionValue);
        dropdown.appendChild(item);
      });
    };

    dropdown.addEventListener('click', event => {
      const item = event.target.closest('.arcana-custom-select-item');
      if (!item) return;
      if (item.disabled || item.classList.contains('is-disabled')) return;

      hiddenSelect.value = item.dataset.value || '';
      button.textContent = hiddenSelect.value || config.placeholder || '선택';
      dropdown.hidden = true;
      wrapper.classList.remove('is-open');
      renderOptions();
      hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    button.addEventListener('click', event => {
      event.stopPropagation();
      if (wrapper.classList.contains('is-disabled')) return;

      ArcanaApp.customSelect.closeAll(wrapper);
      const nextHidden = !dropdown.hidden;
      dropdown.hidden = nextHidden;
      wrapper.classList.toggle('is-open', !nextHidden);
    });

    if (config.disabled) {
      button.disabled = true;
      hiddenSelect.disabled = true;
      wrapper.classList.add('is-disabled');
    }

    renderOptions();

    wrapper.appendChild(button);
    wrapper.appendChild(hiddenSelect);
    wrapper.appendChild(dropdown);

    return wrapper;
  },

  createItem(value, label, isSelected) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'arcana-custom-select-item';
    item.dataset.value = value;
    item.textContent = label;

    if (isSelected) {
      item.classList.add('is-selected');
    }

    return item;
  },

  closeAll(exceptWrapper) {
    document.querySelectorAll('.arcana-custom-select').forEach(wrapper => {
      if (wrapper === exceptWrapper) return;
      wrapper.classList.remove('is-open');
      const menu = wrapper.querySelector('.arcana-custom-select-menu');
      if (menu) menu.hidden = true;
    });
  },

  syncDisabledState(root) {
    const target = root || document;
    target.querySelectorAll('.arcana-custom-select').forEach(wrapper => {
      const select = wrapper.querySelector('select');
      const button = wrapper.querySelector('.arcana-custom-select-button');
      const disabled = Boolean(select && select.disabled);

      wrapper.classList.toggle('is-disabled', disabled);
      if (button) button.disabled = disabled;
    });
  },

  setDisabledValues(select, disabledValues) {
    if (!select) return;
    const disabledSet = disabledValues instanceof Set ? disabledValues : new Set(disabledValues || []);
    const wrapper = select.closest('.arcana-custom-select');

    Array.from(select.options || []).forEach(option => {
      const value = option.value || '';
      option.disabled = Boolean(value && disabledSet.has(value));
    });

    if (!wrapper) return;
    wrapper.querySelectorAll('.arcana-custom-select-item').forEach(item => {
      const value = item.dataset.value || '';
      const isDisabled = Boolean(value && disabledSet.has(value));
      item.disabled = isDisabled;
      item.classList.toggle('is-disabled', isDisabled);
      item.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
    });
  }
};

document.addEventListener('click', () => {
  if (window.ArcanaApp && ArcanaApp.customSelect) {
    ArcanaApp.customSelect.closeAll();
  }
});
