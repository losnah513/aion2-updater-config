function ARC_getClassList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const found = [];
  const usedKeys = {};

  sheets.forEach(function(sheet) {
    const sheetName = sheet.getName();
    if (sheetName.indexOf(ARC_CLASS_SHEET_PREFIX) !== 0) return;

    const rawKey = sheetName.replace(ARC_CLASS_SHEET_PREFIX, '').trim();
    const rawDisplayName = String(sheet.getRange('A1').getValue() || '').trim() || rawKey;
    const key = ARC_normalizeClassKey_(rawKey, rawDisplayName);
    const displayName = ARC_getClassNameByKey_(key) || rawDisplayName;

    if (!key || usedKeys[key]) return;

    usedKeys[key] = true;
    found.push({
      key: key,
      name: displayName,
      sheetNames: [sheetName]
    });
  });

  const list = found.length > 0 ? found : ARC_CLASS_LIST_FALLBACK;
  return ARC_sortClassList_(list);
}

function ARC_getClassSkillData(classList) {
  const result = {};
  const list = classList || ARC_getClassList();

  list.forEach(function(classInfo) {
    const sheet = ARC_findFirstSheet_(classInfo.sheetNames);

    if (!sheet) {
      result[classInfo.key] = {
        active: [],
        passive: [],
        arcanaSkills: ARC_createEmptyArcanaSkillMap_()
      };
      return;
    }

    result[classInfo.key] = {
      active: ARC_readSkillColumn_(sheet, 1),
      passive: ARC_readSkillColumn_(sheet, 2),
      arcanaSkills: ARC_readArcanaSkillMap_(sheet)
    };
  });

  return result;
}

function ARC_readSkillColumn_(sheet, column) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];

  return ARC_uniqueTextList_(
    sheet.getRange(3, column, lastRow - 2, 1).getValues().flat()
  );
}

function ARC_readArcanaSkillMap_(sheet) {
  const result = ARC_createEmptyArcanaSkillMap_();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 4) return result;

  const startColumn = 4;
  const columnCount = Math.min(6, lastColumn - startColumn + 1);
  const headers = sheet.getRange(1, startColumn, 1, columnCount).getValues()[0];

  for (let offset = 0; offset < columnCount; offset++) {
    const arcanaName = String(headers[offset] || '').trim();
    if (!arcanaName) continue;

    const rowCount = Math.max(0, lastRow - 1);
    const values = rowCount > 0
      ? sheet.getRange(2, startColumn + offset, rowCount, 1).getValues().flat()
      : [];

    result[arcanaName] = ARC_uniqueTextList_(values);
  }

  return result;
}

function ARC_createEmptyArcanaSkillMap_() {
  const result = {};
  ARC_ARCANA_TYPES.forEach(function(arcanaName) {
    result[arcanaName] = [];
  });
  return result;
}

function ARC_findFirstSheet_(sheetNames) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  for (let index = 0; index < sheetNames.length; index++) {
    const sheet = ss.getSheetByName(sheetNames[index]);
    if (sheet) return sheet;
  }

  return null;
}

function ARC_uniqueTextList_(values) {
  const seen = {};
  const result = [];

  values.forEach(function(value) {
    const text = String(value || '').trim();
    if (!text || seen[text]) return;

    seen[text] = true;
    result.push(text);
  });

  return result;
}

function ARC_normalizeClassKey_(rawKey, displayName) {
  const name = String(displayName || '').trim();
  const key = String(rawKey || '').trim();

  const nameMap = {
    '수호성': 'templar',
    '검성': 'gladiator',
    '살성': 'assassin',
    '궁성': 'ranger',
    '마도성': 'sorcerer',
    '정령성': 'elementalist',
    '치유성': 'cleric',
    '호법성': 'chanter'
  };

  const keyMap = {
    guardian: 'templar',
    templar: 'templar',
    gladiator: 'gladiator',
    gladiatior: 'gladiator',
    assassin: 'assassin',
    ranger: 'ranger',
    sorcerer: 'sorcerer',
    spiritmaster: 'elementalist',
    elementalist: 'elementalist',
    cleric: 'cleric',
    chanter: 'chanter'
  };

  return nameMap[name] || keyMap[key] || key;
}


function ARC_getClassNameByKey_(key) {
  const map = {
    templar: '수호성',
    guardian: '수호성',
    gladiator: '검성',
    gladiatior: '검성',
    assassin: '살성',
    ranger: '궁성',
    sorcerer: '마도성',
    elementalist: '정령성',
    spiritmaster: '정령성',
    cleric: '치유성',
    chanter: '호법성'
  };

  return map[key] || '';
}

function ARC_sortClassList_(list) {
  const order = {};
  ARC_CLASS_DISPLAY_ORDER.forEach(function(name, index) {
    order[name] = index;
  });

  return list.slice().sort(function(a, b) {
    const aOrder = order[a.name] !== undefined ? order[a.name] : 999;
    const bOrder = order[b.name] !== undefined ? order[b.name] : 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.name).localeCompare(String(b.name), 'ko');
  });
}
