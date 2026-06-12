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

    ArcanaApp.cardEditor.bindOwnedCardUpdates(ownedGrid);
    ArcanaApp.cardEditor.updateOwnedDuplicateSkillLocks(ownedGrid);
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



  bindOwnedCardUpdates(wrapper) {
    if (!wrapper || wrapper.dataset.arcanaBound === 'true') return;
    wrapper.dataset.arcanaBound = 'true';

    wrapper.addEventListener('change', event => {
      if (!event.target.matches('select[data-arcana]')) return;
      ArcanaApp.cardEditor.updateOwnedDuplicateSkillLocks(wrapper);
    });
  },

  updateOwnedDuplicateSkillLocks(root) {
    const wrapper = root || document.getElementById('arcanaOwnedCardGrid');
    if (!wrapper) return;

    wrapper.querySelectorAll('.arcana-owned-card[data-arcana]').forEach(card => {
      const selects = Array.from(card.querySelectorAll('select[data-arcana]'));
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

  createRecommendationPlaceholder() {
    return `
      <div class="arcana-recommend-placeholder" aria-hidden="true">
        추천 조건을 저장하면 아래 버튼으로 분석을 시작할 수 있어요.
      </div>
    `;
  },

  createRecommendationTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'arcana-recommend-tabs';

    const items = [
      { key: 'cards', label: '추천 카드' },
      { key: 'analysis', label: '분석' },
      { key: 'advice', label: '추천 가이드' }
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
    wrapper.className = 'arcana-analysis-list arcana-analysis-split-list';

    const rows = (ArcanaApp.state.recommendationMeta && ArcanaApp.state.recommendationMeta.rows) || [];
    if (rows.length === 0) {
      wrapper.innerHTML = '<div class="arcana-empty-line">목표 스킬을 선택하면 키노조 AI가 계산 근거를 차근차근 보여드릴게요.</div>';
      return wrapper;
    }

    [20, 16].forEach(targetLevel => {
      const sectionRows = rows.filter(row => Number(row.targetLevel || 20) === targetLevel);
      const section = document.createElement('section');
      section.className = `arcana-analysis-section arcana-analysis-level-${targetLevel}`;

      const title = document.createElement('h4');
      const successCount = sectionRows.filter(row => row.achieved).length;
      title.textContent = `${targetLevel}레벨 목표 스킬 (${successCount}/${sectionRows.length})`;
      section.appendChild(title);

      if (sectionRows.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'arcana-empty-line arcana-empty-line-mini';
        empty.textContent = `${targetLevel}레벨 목표로 선택한 스킬이 없습니다.`;
        section.appendChild(empty);
      }

      sectionRows.forEach(row => {
        const item = document.createElement('div');
        item.className = 'arcana-analysis-row arcana-analysis-row-v2';
        item.classList.toggle('is-achieved', row.achieved);
        item.classList.toggle('is-short', !row.achieved);
        item.innerHTML = `
          <strong>${row.skill}</strong>
          <span>${row.autoTarget ? '자동 16' : `목표 ${row.targetLevel}`}</span>
          <span>장비 ${row.equipment}</span>
          <span>보유 ${row.owned}</span>
          <span>추천 ${row.recommended}</span>
          <b>${row.finalLevel}레벨</b>
          <em>${row.achieved ? '달성' : (row.over > 0 ? `${row.over} 초과` : `${row.shortage} 부족`)}</em>
        `;
        section.appendChild(item);
      });

      wrapper.appendChild(section);
    });

    return wrapper;
  },

  createAdviceList() {
    const wrapper = document.createElement('div');
    wrapper.className = 'arcana-advice-list arcana-guide-list';

    const tools = document.createElement('div');
    tools.className = 'arcana-guide-tools';

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'arcana-btn arcana-btn-ghost arcana-guide-tool-btn';
    copyButton.textContent = '가이드 복사';
    copyButton.addEventListener('click', () => ArcanaApp.cardEditor.copyGuideText());

    const imageButton = document.createElement('button');
    imageButton.type = 'button';
    imageButton.className = 'arcana-btn arcana-btn-ghost arcana-guide-tool-btn';
    imageButton.textContent = '이미지 저장';
    imageButton.addEventListener('click', () => ArcanaApp.cardEditor.saveGuideImage());

    tools.appendChild(copyButton);
    tools.appendChild(imageButton);
    wrapper.appendChild(tools);

    const body = document.createElement('div');
    body.className = 'arcana-guide-body';

    const advice = (ArcanaApp.state.recommendationMeta && ArcanaApp.state.recommendationMeta.advice) || [];
    if (advice.length === 0) {
      body.innerHTML = '<div class="arcana-empty-line">추천 결과가 나오면 제작 부담을 줄이는 가이드를 함께 남겨드릴게요.</div>';
    } else {
      advice.forEach(text => {
        const item = document.createElement('div');
        item.className = 'arcana-advice-item arcana-guide-item';
        item.textContent = text;
        body.appendChild(item);
      });
    }

    wrapper.appendChild(body);
    return wrapper;
  },

  getGuideText() {
    const advice = (ArcanaApp.state.recommendationMeta && ArcanaApp.state.recommendationMeta.advice) || [];
    const rows = (ArcanaApp.state.recommendationMeta && ArcanaApp.state.recommendationMeta.rows) || [];
    const lines = ['아르카나 추천 가이드'];

    [20, 16].forEach(level => {
      const levelRows = rows.filter(row => Number(row.targetLevel || 20) === level);
      if (levelRows.length === 0) return;
      lines.push('', `${level}레벨 목표`);
      levelRows.forEach(row => {
        lines.push(`- ${row.skill}${row.autoTarget ? ' (자동 16)' : ''}: ${row.achieved ? '달성' : (row.over > 0 ? `${row.over} 초과` : `${row.shortage} 부족`)} / 최종 ${row.finalLevel}`);
      });
    });

    if (advice.length > 0) {
      lines.push('', '추천 가이드');
      advice.forEach(text => lines.push(`- ${text}`));
    }

    lines.push('', '아르카나 스킬 시뮬레이터 · 키노조 AI');
    return lines.join('\n');
  },

  async copyGuideText() {
    const text = ArcanaApp.cardEditor.getGuideText();
    try {
      await navigator.clipboard.writeText(text);
      ArcanaApp.panelLock.showMessage('recommendArcanaCards', '추천 가이드를 클립보드에 복사했어요.');
    } catch (error) {
      ArcanaApp.panelLock.showMessage('recommendArcanaCards', '복사 권한이 없어 가이드를 선택해서 복사해주세요.');
    }
  },

  saveGuideImage() {
    const text = ArcanaApp.cardEditor.getGuideText();
    const lines = text.split('\n');
    const width = 900;
    const lineHeight = 30;
    const padding = 42;
    const height = Math.max(360, padding * 2 + lines.length * lineHeight + 34);
    const escapeXml = value => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const textNodes = lines.map((line, index) => {
      const y = padding + 32 + index * lineHeight;
      const isTitle = index === 0 || line.endsWith('목표') || line === '추천 가이드';
      const fill = index === 0 ? '#0f172a' : (line.includes('부족') || line.includes('초과') ? '#b45353' : '#334155');
      const size = index === 0 ? 28 : (isTitle ? 20 : 16);
      const weight = index === 0 || isTitle ? 800 : 500;
      return `<text x="${padding}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`;
    }).join('');

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" rx="24" fill="#ffffff"/>
        <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="20" fill="#f8fafc" stroke="#dbe4f0"/>
        ${textNodes}
        <text x="${width - padding}" y="${height - 34}" text-anchor="end" font-size="15" font-weight="800" fill="#94a3b8">아르카나 스킬 시뮬레이터 · 키노조 AI</text>
      </svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'arcana_kinojo_ai_guide.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },


  createOwnedCard(arcanaName) {
    const card = document.createElement('article');
    card.className = 'arcana-card-box arcana-owned-card';
    card.dataset.arcana = arcanaName;

    const title = document.createElement('h4');
    title.textContent = arcanaName;
    card.appendChild(title);

    const savedSlots = (ArcanaApp.state.ownedCards && ArcanaApp.state.ownedCards[arcanaName]) || [];
    const validation = ArcanaApp.state.recommendationValidation || {};
    const invalidCard = (validation.invalidCards || []).some(item => item.arcanaName === arcanaName);

    if (invalidCard) {
      card.classList.add('has-recommendation-warning');
    }

    for (let index = 0; index < 4; index += 1) {
      card.appendChild(ArcanaApp.cardEditor.createEditableSlot(arcanaName, index, savedSlots[index]));
    }

    if (invalidCard) {
      const warning = document.createElement('div');
      warning.className = 'arcana-owned-warning-text';
      warning.textContent = '20레벨 7개 조건: 이 카드에 4레벨 액티브 슬롯이 필요합니다.';
      card.appendChild(warning);
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
    const validation = ArcanaApp.state.recommendationValidation || {};
    const invalidSlot = (validation.invalidSlots || []).some(item => {
      return item.arcanaName === arcanaName && Number(item.slotIndex) === Number(index);
    });

    if (invalidSlot) {
      slot.classList.add('has-recommendation-warning');
    }

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
        if (!select || !input) return;
        slots.push({
          skill: String(select.value || '').trim(),
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
