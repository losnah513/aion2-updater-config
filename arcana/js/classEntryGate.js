window.ArcanaApp = window.ArcanaApp || {};

/*
 * ARCANA CLASS ENTRY GATE
 * 책임 범위: 최초 클래스 미선택 진입 안내, 탑바 클래스 버튼 노출 제어.
 * 실제 클래스 선택 로직은 classSelector.js만 사용한다.
 */
ArcanaApp.classEntryGate = {
  _initialized: false,
  _dismissed: false,
  _pickerLaunched: false,
  _touchTarget: '',
  _observer: null,

  init() {
    if (ArcanaApp.classEntryGate._initialized) return;
    ArcanaApp.classEntryGate._initialized = true;

    ArcanaApp.classEntryGate.ensure();
    ArcanaApp.classEntryGate.bind();

    ArcanaApp.classEntryGate._observer = new MutationObserver(() => ArcanaApp.classEntryGate.refresh());
    ArcanaApp.classEntryGate._observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    ArcanaApp.classEntryGate.refresh();
  },

  ensure() {
    let gate = document.getElementById('arcanaClassEntryGate');
    if (gate) return gate;

    gate = document.createElement('div');
    gate.id = 'arcanaClassEntryGate';
    gate.className = 'arcana-entry-gate';
    gate.hidden = true;
    gate.setAttribute('aria-hidden', 'true');

    gate.innerHTML = `
      <section class="arcana-entry-gate-card" role="dialog" aria-modal="true" aria-labelledby="arcanaEntryGateTitle">
        <button class="arcana-entry-gate-close" type="button" aria-label="처음 안내 닫기"></button>
        <div class="arcana-entry-gate-icon" aria-hidden="true">✦</div>
        <h2 id="arcanaEntryGateTitle" class="arcana-entry-gate-title">클래스를 먼저 선택해주세요</h2>
        <p class="arcana-entry-gate-copy">아르카나 분석을 시작하려면 현재 사용 중인 클래스를 선택해야 해요.</p>
        <button class="arcana-btn arcana-btn-primary arcana-entry-gate-action" type="button">클래스 선택하기</button>
      </section>
    `;

    document.body.appendChild(gate);
    return gate;
  },

  bind() {
    const gate = ArcanaApp.classEntryGate.ensure();
    const action = gate.querySelector('.arcana-entry-gate-action');
    const close = gate.querySelector('.arcana-entry-gate-close');

    if (action) {
      action.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        ArcanaApp.classEntryGate.handleAction(event, action);
      });
    }

    if (close) {
      close.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        ArcanaApp.classEntryGate.handleClose(event, close);
      });
    }
  },

  isTouchMode() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  },

  handleAction(event, button) {
    if (ArcanaApp.classEntryGate.isTouchMode() && ArcanaApp.classEntryGate._touchTarget !== 'action') {
      ArcanaApp.classEntryGate._touchTarget = 'action';
      button.classList.add('is-touch-preview');
      button.textContent = '한 번 더 터치해서 선택';
      ArcanaApp.classEntryGate.clearTouchPreviewLater(button);
      return;
    }

    ArcanaApp.classEntryGate.openClassPicker();
  },

  handleClose(event, button) {
    if (ArcanaApp.classEntryGate.isTouchMode() && ArcanaApp.classEntryGate._touchTarget !== 'close') {
      ArcanaApp.classEntryGate._touchTarget = 'close';
      button.classList.add('is-touch-preview');
      ArcanaApp.classEntryGate.clearTouchPreviewLater(button);
      return;
    }

    ArcanaApp.classEntryGate.dismiss();
  },

  clearTouchPreviewLater(element) {
    window.clearTimeout(ArcanaApp.classEntryGate._touchTimer);
    ArcanaApp.classEntryGate._touchTimer = window.setTimeout(() => {
      ArcanaApp.classEntryGate._touchTarget = '';
      if (element) element.classList.remove('is-touch-preview');
      const action = document.querySelector('.arcana-entry-gate-action');
      if (action) action.textContent = '클래스 선택하기';
    }, 1800);
  },

  openClassPicker() {
    ArcanaApp.classEntryGate._pickerLaunched = true;
    ArcanaApp.classEntryGate.hide();

    if (ArcanaApp.classSelector && typeof ArcanaApp.classSelector.openPicker === 'function') {
      ArcanaApp.classSelector.openPicker();
      ArcanaApp.classEntryGate.watchPickerClose();
    }
  },

  watchPickerClose() {
    const timer = window.setInterval(() => {
      const showcase = document.getElementById('arcanaClassShowcase');
      const isOpen = Boolean(showcase && !showcase.hidden);
      const hasClass = Boolean(ArcanaApp.state && ArcanaApp.state.hasSelectedClass);

      if (!isOpen) {
        window.clearInterval(timer);
        ArcanaApp.classEntryGate._pickerLaunched = false;
        if (!hasClass && !ArcanaApp.classEntryGate._dismissed) {
          ArcanaApp.classEntryGate.refresh();
        }
      }
    }, 120);
  },

  dismiss() {
    ArcanaApp.classEntryGate._dismissed = true;
    ArcanaApp.classEntryGate.hide();
    ArcanaApp.classEntryGate.refreshTopbar();
  },

  shouldShow() {
    const state = ArcanaApp.state || {};
    return !state.hasSelectedClass && !ArcanaApp.classEntryGate._dismissed && !ArcanaApp.classEntryGate._pickerLaunched;
  },

  refresh() {
    const shouldShow = ArcanaApp.classEntryGate.shouldShow();
    const hasClass = Boolean(ArcanaApp.state && ArcanaApp.state.hasSelectedClass);

    document.body.classList.toggle('arcana-entry-gate-dismissed', ArcanaApp.classEntryGate._dismissed && !hasClass);

    if (hasClass) {
      ArcanaApp.classEntryGate._dismissed = false;
      ArcanaApp.classEntryGate.hide();
    } else if (shouldShow) {
      ArcanaApp.classEntryGate.show();
    } else {
      ArcanaApp.classEntryGate.hide();
    }

    ArcanaApp.classEntryGate.refreshTopbar();
  },

  refreshTopbar() {
    const picker = document.getElementById('arcanaClassPicker');
    if (!picker) return;

    const state = ArcanaApp.state || {};
    const shouldHideTopbarPicker = !state.hasSelectedClass && !ArcanaApp.classEntryGate._dismissed;

    picker.hidden = shouldHideTopbarPicker;
    picker.setAttribute('aria-hidden', shouldHideTopbarPicker ? 'true' : 'false');
  },

  show() {
    const gate = ArcanaApp.classEntryGate.ensure();
    gate.hidden = false;
    gate.setAttribute('aria-hidden', 'false');

    window.requestAnimationFrame(() => {
      gate.classList.add('is-open');
    });
  },

  hide() {
    const gate = document.getElementById('arcanaClassEntryGate');
    if (!gate) return;

    gate.classList.remove('is-open');
    gate.setAttribute('aria-hidden', 'true');

    window.setTimeout(() => {
      if (!gate.classList.contains('is-open')) gate.hidden = true;
    }, 230);
  }
};
