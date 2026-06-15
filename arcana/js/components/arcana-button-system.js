(function () {
  window.ArcanaApp = window.ArcanaApp || {};

  const PREVIEW_CLASS = 'is-touch-preview';
  const EXECUTING_CLASS = 'is-executing';
  const PREVIEW_TIMEOUT = 1600;

  const selectors = [
    '.arcana-btn:not(.arcana-wave-cta)',
    '.arcana-class-picker-button',
    '.arcana-entry-gate-close'
  ];

  const excludedSelectors = [
    '.arcana-skill-btn',
    '.arcana-custom-select-button',
    '.arcana-custom-select-item',
    '.arcana-class-card',
    '.arcana-tab-btn',
    '.arcana-slot',
    '.arcana-showcase-name-btn'
  ];

  const state = {
    previewTarget: null,
    previewTimer: 0
  };

  function isCoarsePointer() {
    return window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;
  }

  function getButton(target) {
    if (!(target instanceof Element)) return null;
    const button = target.closest(selectors.join(','));
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return null;
    if (excludedSelectors.some(selector => button.matches(selector) || button.closest(selector))) return null;
    return button;
  }

  function clearPreview(target) {
    const button = target || state.previewTarget;
    if (button) button.classList.remove(PREVIEW_CLASS);
    if (state.previewTimer) window.clearTimeout(state.previewTimer);
    state.previewTimer = 0;
    if (!target || state.previewTarget === target) state.previewTarget = null;
  }

  function setPreview(button) {
    clearPreview();
    state.previewTarget = button;
    button.classList.add(PREVIEW_CLASS);
    state.previewTimer = window.setTimeout(() => clearPreview(button), PREVIEW_TIMEOUT);
  }

  function flashExecute(button) {
    button.classList.add(EXECUTING_CLASS);
    window.setTimeout(() => button.classList.remove(EXECUTING_CLASS), 150);
  }

  function onClick(event) {
    const button = getButton(event.target);
    if (!button) return;

    if (!isCoarsePointer()) {
      flashExecute(button);
      return;
    }

    if (state.previewTarget !== button || !button.classList.contains(PREVIEW_CLASS)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setPreview(button);
      return;
    }

    clearPreview(button);
    flashExecute(button);
  }

  function onPointerLeave(event) {
    const button = getButton(event.target);
    if (button && state.previewTarget === button && !isCoarsePointer()) clearPreview(button);
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('pointerleave', onPointerLeave, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') clearPreview();
  });

  ArcanaApp.buttonSystem = {
    clearPreview,
    flashExecute
  };
})();
