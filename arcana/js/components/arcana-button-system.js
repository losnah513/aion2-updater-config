(function () {
  window.ArcanaApp = window.ArcanaApp || {};

  const EXECUTING_CLASS = 'is-executing';

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

  function getButton(target) {
    if (!(target instanceof Element)) return null;
    const button = target.closest(selectors.join(','));
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return null;
    if (excludedSelectors.some(selector => button.matches(selector) || button.closest(selector))) return null;
    return button;
  }

  function clearPreview() {
    document.querySelectorAll('.is-touch-preview').forEach(element => {
      element.classList.remove('is-touch-preview');
    });
    if (ArcanaApp.state) {
      ArcanaApp.state.touchPreviewClassKey = '';
      ArcanaApp.state.recommendationTouchArmed = false;
    }
  }

  function flashExecute(button) {
    if (!button) return;
    button.classList.remove('is-touch-preview');
    button.classList.add(EXECUTING_CLASS);
    window.setTimeout(() => button.classList.remove(EXECUTING_CLASS), 150);
  }

  function onClick(event) {
    const button = getButton(event.target);
    if (!button) return;

    /*
     * 모바일 UX 규칙:
     * - 1회 탭으로 즉시 실행한다.
     * - 과거의 touch-preview / 두 번째 탭 확정 로직은 사용하지 않는다.
     * - 클래스 선택처럼 확인 버튼이 있는 흐름은 모달 내부 확인 버튼만 별도 확정 단계로 둔다.
     */
    clearPreview();
    flashExecute(button);
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') clearPreview();
  });

  ArcanaApp.buttonSystem = {
    clearPreview,
    flashExecute
  };
})();
