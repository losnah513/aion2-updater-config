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
      ArcanaApp.customSelect.close(wrapper);
      renderOptions();
      hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    button.addEventListener('click', event => {
      event.stopPropagation();
      if (wrapper.classList.contains('is-disabled')) return;

      ArcanaApp.customSelect.closeAll(wrapper);
      const shouldOpen = dropdown.hidden;

      if (shouldOpen) {
        ArcanaApp.customSelect.open(wrapper);
      } else {
        ArcanaApp.customSelect.close(wrapper);
      }
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


  open(wrapper) {
    if (!wrapper) return;

    const menu = wrapper.querySelector('.arcana-custom-select-menu');
    if (!menu) return;

    menu.hidden = false;
    wrapper.classList.add('is-open');
    ArcanaApp.customSelect.positionMenu(wrapper);
  },

  close(wrapper) {
    if (!wrapper) return;

    const menu = wrapper.querySelector('.arcana-custom-select-menu');
    if (menu) {
      menu.hidden = true;
      menu.classList.remove('is-floating-menu');
      menu.style.removeProperty('--arcana-floating-menu-top');
      menu.style.removeProperty('--arcana-floating-menu-left');
      menu.style.removeProperty('--arcana-floating-menu-width');
      menu.style.removeProperty('--arcana-floating-menu-max-height');
    }

    wrapper.classList.remove('is-open', 'is-drop-up');
  },

  positionMenu(wrapper) {
    const button = wrapper && wrapper.querySelector('.arcana-custom-select-button');
    const menu = wrapper && wrapper.querySelector('.arcana-custom-select-menu');
    if (!button || !menu || menu.hidden) return;

    const rect = button.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const gap = 4;
    const defaultMaxHeight = 150;
    const preferredHeight = Math.min(menu.scrollHeight || defaultMaxHeight, defaultMaxHeight);
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap);
    const spaceAbove = Math.max(0, rect.top - gap);
    const shouldDropUp = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
    const availableHeight = shouldDropUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(72, Math.min(defaultMaxHeight, availableHeight));
    const top = shouldDropUp
      ? Math.max(gap, rect.top - maxHeight - gap)
      : Math.min(viewportHeight - gap - maxHeight, rect.bottom + gap);

    wrapper.classList.toggle('is-drop-up', shouldDropUp);
    menu.classList.add('is-floating-menu');
    menu.style.setProperty('--arcana-floating-menu-top', `${Math.max(gap, top)}px`);
    menu.style.setProperty('--arcana-floating-menu-left', `${Math.round(rect.left)}px`);
    menu.style.setProperty('--arcana-floating-menu-width', `${Math.round(rect.width)}px`);
    menu.style.setProperty('--arcana-floating-menu-max-height', `${Math.round(maxHeight)}px`);
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
      ArcanaApp.customSelect.close(wrapper);
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

window.addEventListener('resize', () => {
  if (!window.ArcanaApp || !ArcanaApp.customSelect) return;
  ArcanaApp.customSelect.closeAll();
});

window.addEventListener('scroll', () => {
  if (!window.ArcanaApp || !ArcanaApp.customSelect) return;
  document.querySelectorAll('.arcana-custom-select.is-open').forEach(wrapper => {
    ArcanaApp.customSelect.positionMenu(wrapper);
  });
}, true);
