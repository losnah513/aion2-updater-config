window.ArcanaApp = window.ArcanaApp || {};

/**
 * ARCANA LayoutManager
 *
 * 영역 카드 번호/그룹 정보를 한 곳에서 관리한다.
 * 실제 크기/배치는 arcana-layout-manager.css가 담당하며, 이 파일은
 * DOM에 카드 번호를 보강하고 감사용 메타데이터를 제공한다.
 */
ArcanaApp.layoutManager = {
  cards: [
    { id: '01', name: '액티브 스킬 선택', group: 'top-row' },
    { id: '02', name: '반지 스킬 옵션', group: 'top-row' },
    { id: '03', name: '기능 추가 예정 영역', group: 'top-row' },
    { id: '04', name: '현재 아르카나', group: 'arcana-row' },
    { id: '05', name: '추천 아르카나', group: 'arcana-row' }
  ],

  init() {
    ArcanaApp.layoutManager.cards.forEach(card => {
      const element = document.querySelector(`[data-card="${card.id}"]`);
      if (!element) return;
      element.dataset.layoutName = card.name;
      element.dataset.layoutGroup = card.group;
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (ArcanaApp.layoutManager) ArcanaApp.layoutManager.init();
});
