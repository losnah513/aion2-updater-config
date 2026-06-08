window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.api = {
  loadInitialData() {
    return new Promise((resolve) => {
      if (window.google && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(() => resolve(ArcanaApp.api.getFallbackData()))
          .ARC_getInitialData();
        return;
      }

      resolve(ArcanaApp.api.getFallbackData());
    });
  },

  saveOwnedCards(ownedCards) {
    return new Promise((resolve) => {
      if (window.google && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(() => resolve({ ok: false }))
          .ARC_saveOwnedCards(ownedCards);
        return;
      }

      localStorage.setItem('ARCANA_OWNED_CARDS', JSON.stringify(ownedCards));
      resolve({ ok: true, local: true });
    });
  },

  loadOwnedCardsFromLocal() {
    try {
      return JSON.parse(localStorage.getItem('ARCANA_OWNED_CARDS') || '{}');
    } catch (error) {
      return {};
    }
  },

  clearOwnedCards() {
    localStorage.removeItem('ARCANA_OWNED_CARDS');
  },

  getFallbackData() {
    return {
      version: 'ARC-0.1.00',
      targetLevel: 20,
      devanionBonus: 4,
      arcanaTypes: ['성배', '양피지', '나침반', '천칭'],
      skillsByArcana: {
        '성배': ['예리한 일격', '절단의 맹타', '검기 난무', '분노 폭발'],
        '양피지': ['예리한 일격', '도약찍기', '내려찍기', '검기 난무'],
        '나침반': ['절단의 맹타', '유인의 검', '회전 베기', '맹렬한 돌진'],
        '천칭': ['예리한 일격', '분노 폭발', '유인의 검', '회전 베기']
      },
      ownedCards: ArcanaApp.api.loadOwnedCardsFromLocal()
    };
  }
};
