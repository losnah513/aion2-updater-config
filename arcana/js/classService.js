window.ArcanaApp = window.ArcanaApp || {};

/**
 * ARCANA ClassService
 *
 * 클래스 키/표시명/아이콘/스킬 DB 키를 한 곳에서 정규화합니다.
 * 수호성은 class_skill_db 시트 기준인 skill_db_templar / templar를 표준 키로 사용합니다.
 */
ArcanaApp.classService = {
  list: [
    { key: 'templar', name: '수호성', englishName: 'Templar', icon: '../hall-of-fame/assets/class_icon_templar.png', skillIconFile: 'templar.json' },
    { key: 'gladiator', name: '검성', englishName: 'Gladiator', icon: '../hall-of-fame/assets/class_icon_gladiator.png', skillIconFile: 'gladiator.json' },
    { key: 'assassin', name: '살성', englishName: 'Assassin', icon: '../hall-of-fame/assets/class_icon_assassin.png', skillIconFile: 'assassin.json' },
    { key: 'ranger', name: '궁성', englishName: 'Ranger', icon: '../hall-of-fame/assets/class_icon_ranger.png', skillIconFile: 'ranger.json' },
    { key: 'sorcerer', name: '마도성', englishName: 'Sorcerer', icon: '../hall-of-fame/assets/class_icon_sorcerer.png', skillIconFile: 'sorcerer.json' },
    { key: 'elementalist', name: '정령성', englishName: 'Spiritmaster', icon: '../hall-of-fame/assets/class_icon_elementalist.png', skillIconFile: 'spiritmaster.json' },
    { key: 'cleric', name: '치유성', englishName: 'Cleric', icon: '../hall-of-fame/assets/class_icon_cleric.png', skillIconFile: 'cleric.json' },
    { key: 'chanter', name: '호법성', englishName: 'Chanter', icon: '../hall-of-fame/assets/class_icon_chanter.png', skillIconFile: 'chanter.json' }
  ],

  aliasMap: {
    skill_db_templar: 'templar',
    templar: 'templar',
    skill_db_gladiator: 'gladiator',
    gladiator: 'gladiator',
    skill_db_assassin: 'assassin',
    assassin: 'assassin',
    skill_db_ranger: 'ranger',
    ranger: 'ranger',
    skill_db_sorcerer: 'sorcerer',
    sorcerer: 'sorcerer',
    skill_db_spiritmaster: 'elementalist',
    spiritmaster: 'elementalist',
    skill_db_elementalist: 'elementalist',
    elementalist: 'elementalist',
    skill_db_cleric: 'cleric',
    cleric: 'cleric',
    skill_db_chanter: 'chanter',
    chanter: 'chanter'
  },

  nameMap: {
    '수호성': 'templar',
    '검성': 'gladiator',
    '살성': 'assassin',
    '궁성': 'ranger',
    '마도성': 'sorcerer',
    '정령성': 'elementalist',
    '치유성': 'cleric',
    '호법성': 'chanter'
  },

  normalizeKey(value, displayName) {
    const raw = String(value || '').trim();
    const name = String(displayName || '').trim();
    const key = raw.startsWith('skill_db_') ? raw : raw.replace(/^skill_db_/, '');
    return ArcanaApp.classService.nameMap[name] || ArcanaApp.classService.aliasMap[raw] || ArcanaApp.classService.aliasMap[key] || key || '';
  },

  normalizeList() {
    return ArcanaApp.classService.list.map(item => ({
      key: item.key,
      name: item.name,
      englishName: item.englishName
    }));
  },

  getItem(value) {
    const key = ArcanaApp.classService.normalizeKey(value);
    return ArcanaApp.classService.list.find(item => item.key === key) || null;
  },

  getName(value) {
    const item = ArcanaApp.classService.getItem(value);
    return item ? item.name : '클래스 선택';
  },

  getIconUrl(value) {
    const item = ArcanaApp.classService.getItem(value);
    return item ? item.icon : '';
  },

  getSkillIconFile(value) {
    const item = ArcanaApp.classService.getItem(value);
    return item ? item.skillIconFile : '';
  },

  getLookupKeys(value) {
    const key = ArcanaApp.classService.normalizeKey(value);
    const legacy = {
      templar: ['templar', 'skill_db_templar'],
      elementalist: ['elementalist', 'spiritmaster', 'skill_db_spiritmaster', 'skill_db_elementalist'],
      gladiator: ['gladiator', 'skill_db_gladiator'],
      assassin: ['assassin', 'skill_db_assassin'],
      ranger: ['ranger', 'skill_db_ranger'],
      sorcerer: ['sorcerer', 'skill_db_sorcerer'],
      cleric: ['cleric', 'skill_db_cleric'],
      chanter: ['chanter', 'skill_db_chanter']
    };
    return legacy[key] || [key];
  }
};
