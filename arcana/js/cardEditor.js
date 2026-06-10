window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.cardEditor = {
  render() {
    ArcanaApp.cardEditor.renderOwnedCards();
    ArcanaApp.cardEditor.renderRecommendationArea();
  },

  renderOwnedCards() {
    const ownedGrid = document.getElementById('arcanaOwnedCardGrid');
    if (!ownedGrid) return;

    ownedGrid.innerHTML = '';
    ArcanaApp.state.arcanaTypes.forEach(arcanaName => {
      ownedGrid.appendChild(ArcanaApp.cardEditor.createOwnedCard(arcanaName));
    });
  },

  renderRecommendationArea() {
    const area = document.getElementById('arcanaRecommendArea');
    const panel = document.querySelector('[data-panel-key="recommendArcanaCards"]');
    if (!area || !panel) return;

    const hasRecommendation = Boolean(ArcanaApp.state.recommendationGenerated);
    panel.classList.toggle('is-recommend-ready', hasRecommendation);
    panel.classList.toggle('is-recommend-locked', !hasRecommendation);

    if (!hasRecommendation) {
      area.innerHTML = ArcanaApp.cardEditor.createRecommendationPlaceholder();
      return;
    }

    area.innerHTML = '';
    area.appendChild(ArcanaApp.cardEditor.createRecommendationTabs());
    area.appendChild(ArcanaApp.cardEditor.createRecommendationContent());
  },

  createRecommendationPlaceholder() {
    return `
      <div class="arcana-recommend-placeholder">
        <div class="arcana-fog-writing">
          <strong>키노조 AI가</strong>
          <span>최적의 아르카나 세팅을 추천해드릴게요</span>
        </div>
      </div>
    `;
  },

  createRecommendationTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'arcana-recommend-tabs';

    const items = [
      { key: 'cards', label: '추천 카드' },
      { key: 'analysis', label: '분석' },
      { key: 'advice', label: '조언' }
    ];

    items.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'arcana-tab-btn';
      button.textContent = item.label;

      if (ArcanaApp.state.recommendationTab === item.key) {
        button.classList.add('is-active');
      }

      button.addEventListener('click', () => {
        ArcanaApp.tabs.setRecommendTab(item.key);
      });

      tabs.appendChild(button);
    });

    return tabs;
  },

  createRecommendationContent() {
    const content = document.createElement('div');
    content.className = 'arcana-recommend-content';

    if (ArcanaApp.state.recommendationTab === 'analysis') {
      content.appendChild(ArcanaApp.cardEditor.createAnalysisTable());
      return content;
    }

    if (ArcanaApp.state.recommendationTab === 'advice') {
      content.appendChild(ArcanaApp.cardEditor.createAdviceList());
      return content;
    }

    const grid = document.createElement('div');
    grid.className = 'arcana-card-grid arcana-recommend-card-grid';
    ArcanaApp.state.arcanaTypes.forEach(arcanaName => {
      grid.appendChild(ArcanaApp.cardEditor.createRecommendationCard(arcanaName));
    });
    content.appendChild(grid);
    return content;
  },

  createAnalysisTable() {
    const wrapper = document.createElement('div');
    wrapper.className = 'arcana-analysis-list';

    const rows = (ArcanaApp.state.recommendationMeta && ArcanaApp.state.recommendationMeta.rows) || [];
    if (rows.length === 0) {
      wrapper.innerHTML = '<div class="arcana-empty-line">목표 스킬을 선택하면 키노조 AI가 계산 근거를 차근차근 보여드릴게요.</div>';
      return wrapper;
    }

    rows.forEach(row => {
      const item = document.createElement('div');
      item.className = 'arcana-analysis-row';
      item.classList.toggle('is-short', row.shortage > 0);
      item.classList.toggle('is-important', row.must && row.shortage === 0);
      item.innerHTML = `
        <strong>${row.skill}</strong>
        <span>현재 ${row.current}</span>
        <span>장비 ${row.equipment}</span>
        <span>보유 ${row.owned}</span>
        <span>추천 ${row.recommended}</span>
        <span>데바 ${row.bonus}</span>
        <b>${row.finalLevel}레벨</b>
      `;
      wrapper.appendChild(item);
    });

    return wrapper;
  },

  createAdviceList() {
    const wrapper = document.createElement('div');
    wrapper.className = 'arcana-advice-list';

    const advice = (ArcanaApp.state.recommendationMeta && ArcanaApp.state.recommendationMeta.advice) || [];
    if (advice.length === 0) {
      wrapper.innerHTML = '<div class="arcana-empty-line">추천 결과가 나오면 제작 부담을 줄이는 조언을 함께 남겨드릴게요.</div>';
      return wrapper;
    }

    advice.forEach(text => {
      const item = document.createElement('div');
      item.className = 'arcana-advice-item';
      item.textContent = text;
      wrapper.appendChild(item);
    });

    return wrapper;
  },

  createOwnedCard(arcanaName) {
    const card = document.createElement('article');
    card.className = 'arcana-card-box arcana-owned-card';
    card.dataset.arcana = arcanaName;

    const title = document.createElement('h4');
    title.textContent = arcanaName;
    card.appendChild(title);

    const savedSlots = ArcanaApp.state.ownedCards[arcanaName] || [];

    for (let index = 0; index < 4; index++) {
      card.appendChild(ArcanaApp.cardEditor.createEditableSlot(arcanaName, index, savedSlots[index]));
    }

    return card;
  },

  createRecommendationCard(arcanaName) {
    const card = document.createElement('article');
    card.className = 'arcana-card-box arcana-recommend-card';

    const title = document.createElement('h4');
    title.textContent = arcanaName;
    card.appendChild(title);

    const slots = ArcanaApp.state.recommendationCards[arcanaName] || [];

    for (let index = 0; index < 4; index++) {
      const slot = slots[index] || { skill: '', level: 0 };
      const slotEl = document.createElement('div');
      slotEl.className = 'arcana-slot';
      slotEl.classList.toggle('is-important-slot', Number(slot.level || 0) >= 4);

      const select = ArcanaApp.customSelect.create({
        placeholder: '추천 없음',
        options: slot.skill ? [slot.skill] : [],
        value: slot.skill || '',
        disabled: true
      });

      const level = document.createElement('input');
      level.disabled = true;
      level.value = slot.level || '';
      level.placeholder = 'Lv';

      slotEl.appendChild(select);
      slotEl.appendChild(level);
      card.appendChild(slotEl);
    }

    return card;
  },

  createEditableSlot(arcanaName, index, savedSlot) {
    const slot = document.createElement('div');
    slot.className = 'arcana-slot';

    const select = ArcanaApp.customSelect.create({
      placeholder: '스킬 선택',
      options: ArcanaApp.state.skillsByArcana[arcanaName] || [],
      value: savedSlot?.skill || '',
      dataset: {
        arcana: arcanaName,
        slotIndex: String(index),
        maxVisible: '6'
      }
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.pattern = '[0-9]*';
    input.placeholder = 'Lv';
    input.value = savedSlot?.level || '';
    input.dataset.arcana = arcanaName;
    input.dataset.slotIndex = String(index);

    slot.appendChild(select);
    slot.appendChild(input);
    return slot;
  },

  collect() {
    const cards = {};

    document.querySelectorAll('.arcana-owned-card[data-arcana]').forEach(card => {
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

      const validation = ArcanaApp.simulator.validateCardSlots(slots, arcanaName);
      if (!validation.ok) {
        throw new Error(`${arcanaName}: ${validation.message}`);
      }

      cards[arcanaName] = slots;
    });

    return cards;
  }
};
