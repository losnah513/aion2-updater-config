window.ArcanaApp = window.ArcanaApp || {};

ArcanaApp.state = {
  version: 'ARC-0.1.00',
  targetLevel: 20,
  devanionBonus: 4,
  maxTargetSkills: 7,
  maxCardLevel: 5,
  maxSlotLevel: 4,
  currentClassKey: 'gladiator',
  classList: [
    { key: 'gladiator', name: '검성' }
  ],
  activeSkills: [],
  passiveSkills: [],
  classSkills: {},
  arcanaTypes: ['성배', '양피지', '나침반', '천칭'],
  skillsByArcana: {},
  selectedTargetSkills: [],
  characterLevels: {},
  ringOptions: {
    ring1: [],
    ring2: []
  },
  ownedCards: {},
  recommendationCards: {}
};
