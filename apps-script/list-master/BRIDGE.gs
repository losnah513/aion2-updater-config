/**
 * BRIDGE.gs
 * ------------------------------------------------------------
 * 붙여넣을 위치:
 * - `list` 시트와 성역 원본 마스터 시트가 있는 Google Spreadsheet의 Apps Script 프로젝트.
 * - KINOJO 메인 Apps Script 프로젝트에 넣지 않는다.
 *
 * 역할:
 * - Supabase Edge Function `lookup-sheet-bridge`가 Google Sheet 원본을 읽고 쓸 때 호출하는 브릿지.
 * - 확장프로그램은 이 Web App URL을 직접 알거나 호출하지 않는다.
 *
 * 호출 흐름:
 * - Extension → Supabase Edge Function → 이 Apps Script Web App → list/성역 원본 Spreadsheet
 *
 * 관리 규칙:
 * - 신규/삭제/마스터 대조 판단은 이 파일에서 하지 않는다.
 * - 이 파일은 원본 list 데이터를 읽거나, Server Engine이 확정한 결과를 시트에 쓰는 브릿지만 담당한다.
 */

const KINOJO_LIST_MASTER_BRIDGE_CONFIG = {
  LIST_SHEET_NAME: 'list',
  SPREADSHEET_ID_PROPERTY: 'KINOJO_MASTER_SPREADSHEET_ID',
  ROSTER_WRITE_TOKEN_PROPERTY: 'KINOJO_ROSTER_WRITE_TOKEN',
  ROSTER_TEST_SPREADSHEET_ID_PROPERTY: 'KINOJO_ROSTER_TEST_SPREADSHEET_ID',
  ROSTER_WRITE_LOCK_TIMEOUT_MS: 15000,
  SANCTUARY_SHEET_NAMES: ['칼드릭스팟', '바고트팟', '루드라팟'],
  HEADER_ROW: 1,
  FIRST_DATA_ROW: 6, // list 실제 데이터 시작 행. 기존 메인 CONFIG.START_ROW와 동일하게 6행부터 읽고 쓴다.
  DEFAULT_SERVER_ID: '2002',
  DEFAULT_SERVER_NAME: '지켈',

  // list 시트 기준 컬럼. 실제 시트 구조 변경 시 여기만 수정한다.
  COL_CHARACTER_NAME: 1,       // A열: 캐릭터명
  COL_CLASS_NAME: 2,           // B열: 직업명. Server Engine 공식 조회 확정값이 있으면 추가/교정
  COL_STATUS: 8,             // H열: 상태 원문. 제외 판정은 Server가 담당한다.
  COL_MAIN_CHARACTER_NAME: 7,  // G열: 본캐명 또는 대표 캐릭터명

  // list 시트 반영용 컬럼은 실제 list 구조 확인 후 확정한다.
  // null이면 쓰기 단계는 안전하게 중단한다. 다음 작업에서 실제 컬럼을 확정 후 활성화한다.
  COL_PVE_ITEM_LEVEL: 3,  // C열: PVE 아이템레벨
  COL_PVE_POWER: 4,       // D열: PVE 전투력
  COL_PVP_ITEM_LEVEL: 5,  // E열: PVP 아이템레벨
  COL_PVP_POWER: 6,       // F열: PVP 전투력

  // 전체 list 반영과 Edge Function readback 검증까지 끝난 뒤 Server가 전달한 완료 문구를 기록한다.
  // A2:G2가 병합되어 있어도 좌상단 A2에만 값을 쓰면 병합 상태와 기존 서식은 유지된다.
  COMPLETION_MARKER_CELL: 'A2',
  COMPLETION_MARKER_RANGE: 'A2:G2',
  COMPLETION_SESSION_PROPERTY_PREFIX: 'KINOJO_LIST_LAST_COMPLETION_'
};

function doGet(e) {
  return kinojoListMasterBridgeRoute_(e, 'GET');
}

function doPost(e) {
  return kinojoListMasterBridgeRoute_(e, 'POST');
}

function kinojoListMasterBridgeRoute_(e, method) {
  try {
    const body = kinojoParseRequestBody_(e);
    const action = String(body.action || '').trim();

    if (action === 'serverBridgeHealth') {
      const pair = kinojoGetListSheet_();
      return kinojoJson_({
        ok: true,
        bridge: 'KINOJO_LIST_SANCTUARY_MASTER_BRIDGE',
        role: 'APPSCRIPT_MASTER',
        spreadsheetId: pair.ss.getId(),
        sheetName: pair.sheet.getName(),
        message: 'AppsScript_MASTER 브릿지 정상'
      });
    }

    if (action === 'serverListSheetRead') {
      return kinojoJson_(kinojoHandleServerListSheetRead_(body, method));
    }

    if (action === 'serverListSheetSync') {
      return kinojoJson_(kinojoHandleServerListSheetSync_(body, method));
    }

    if (action === 'serverListSheetMarkCompleted') {
      return kinojoJson_(kinojoHandleServerListSheetMarkCompleted_(body, method));
    }

    if (action === 'serverSanctuarySheetRead') {
      return kinojoJson_(kinojoHandleServerSanctuarySheetRead_(body, method));
    }

    if (action === 'serverSanctuaryRosterWrite') {
      return kinojoJson_(kinojoHandleServerSanctuaryRosterWrite_(body, method));
    }

    return kinojoJson_({
      ok: false,
      message: 'Unknown action',
      action: action || '',
      method,
      bridge: 'KINOJO_LIST_SANCTUARY_MASTER_BRIDGE',
      bridgeRole: 'APPSCRIPT_MASTER'
    });
  } catch (err) {
    return kinojoJson_({
      ok: false,
      message: String(err && err.message || err),
      stack: String(err && err.stack || '').slice(0, 2000),
      bridge: 'KINOJO_LIST_SANCTUARY_MASTER_BRIDGE',
      bridgeRole: 'APPSCRIPT_MASTER'
    });
  }
}

function kinojoParseRequestBody_(e) {
  const params = Object.assign({}, e && e.parameter || {});
  const postData = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';

  if (postData) {
    try {
      const parsed = JSON.parse(postData);
      if (parsed && typeof parsed === 'object') return Object.assign(params, parsed);
    } catch (_jsonErr) {
      // form-urlencoded는 e.parameter로 들어오므로 여기서는 무시한다.
    }
  }
  return params;
}

function kinojoJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

function kinojoGetListSheet_() {
  const cfg = KINOJO_LIST_MASTER_BRIDGE_CONFIG;
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = String(props.getProperty(cfg.SPREADSHEET_ID_PROPERTY) || '').trim();
  const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('원본 Spreadsheet를 찾지 못했습니다. 이 코드를 list/성역 원본 Spreadsheet에 바인딩하거나 Script Property ' + cfg.SPREADSHEET_ID_PROPERTY + '를 설정하세요.');
  }

  const sheet = ss.getSheetByName(cfg.LIST_SHEET_NAME);
  if (!sheet) {
    const names = ss.getSheets().map(s => s.getName());
    throw new Error('list 시트를 찾지 못했습니다. 찾는 시트명=' + cfg.LIST_SHEET_NAME + ' / 실제 시트=' + names.join(', '));
  }
  return { ss, sheet };
}

function kinojoHandleServerListSheetRead_(body, method) {
  const cfg = KINOJO_LIST_MASTER_BRIDGE_CONFIG;
  const pair = kinojoGetListSheet_();
  const sheet = pair.sheet;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < cfg.FIRST_DATA_ROW) {
    return {
      ok: true,
      list: [],
      rowCount: 0,
      readComplete: true,
      firstDataRow: cfg.FIRST_DATA_ROW,
      lastDataRow: lastRow,
      message: 'list 시트에 데이터 행이 없습니다.',
      method,
      sheetName: sheet.getName(),
      spreadsheetId: pair.ss.getId(),
      bridgeRole: 'APPSCRIPT_MASTER'
    };
  }

  const values = sheet.getRange(cfg.FIRST_DATA_ROW, 1, lastRow - cfg.FIRST_DATA_ROW + 1, lastCol).getValues();
  const list = [];

  values.forEach((row, index) => {
    const rowNumber = cfg.FIRST_DATA_ROW + index;
    const characterName = String(row[cfg.COL_CHARACTER_NAME - 1] || '').trim();
    if (!characterName) return;

    const className = String(row[cfg.COL_CLASS_NAME - 1] || '').trim();
    const mainCharacterName = String(row[cfg.COL_MAIN_CHARACTER_NAME - 1] || characterName).trim();
    list.push({
      row: rowNumber,
      name: characterName,
      characterName,
      originalName: characterName,
      className,
      mainCharacterName,
      status: String(row[cfg.COL_STATUS - 1] || '').trim(),
      pveItemLevel: kinojoNumberOrBlank_(row[cfg.COL_PVE_ITEM_LEVEL - 1]),
      pveCombatPower: kinojoNumberOrBlank_(row[cfg.COL_PVE_POWER - 1]),
      pvpItemLevel: kinojoNumberOrBlank_(row[cfg.COL_PVP_ITEM_LEVEL - 1]),
      pvpCombatPower: kinojoNumberOrBlank_(row[cfg.COL_PVP_POWER - 1]),
      serverId: cfg.DEFAULT_SERVER_ID,
      serverName: cfg.DEFAULT_SERVER_NAME
    });
  });

  return {
    ok: true,
    list,
    rowCount: list.length,
    rawRowCount: values.length,
    readComplete: true,
    firstDataRow: cfg.FIRST_DATA_ROW,
    lastDataRow: lastRow,
    method,
    sheetName: sheet.getName(),
    spreadsheetId: pair.ss.getId(),
    bridgeRole: 'APPSCRIPT_MASTER',
    message: 'list 시트 읽기 완료'
  };
}


/**
 * Server Engine이 list 전체 쓰기와 실제 셀 readback 검증까지 완료한 뒤 전달한
 * 최종 반영 문구를 A2:G2 병합 셀의 좌상단 A2에 기록합니다.
 *
 * AppsScript_MASTER는 완료 여부나 시각을 계산하지 않으며, Server가 확정한
 * displayText/completedAt/sessionId를 그대로 기록하고 동일 세션 재호출만 멱등 처리합니다.
 */
function kinojoHandleServerListSheetMarkCompleted_(body, method) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return {
      ok: false,
      code: 'MASTER_BRIDGE_BUSY',
      message: 'AppsScript_MASTER가 다른 list 작업을 처리 중입니다. 잠시 후 재시도하세요.',
      bridgeRole: 'APPSCRIPT_MASTER',
      retryable: true
    };
  }

  try {
    const cfg = KINOJO_LIST_MASTER_BRIDGE_CONFIG;
    const pair = kinojoGetListSheet_();
    const sheet = pair.sheet;
    const sessionId = String(body && (body.sessionId || body.session_id) || '').trim();
    const completedAt = String(body && (body.completedAt || body.completed_at) || '').trim();
    const displayText = String(body && (body.displayText || body.display_text) || '').trim();
    const expectedQueuedCount = Number(body && (body.expectedQueuedCount || body.expected_queued_count) || 0);

    if (!sessionId) {
      return {
        ok: false,
        code: 'LIST_COMPLETION_SESSION_REQUIRED',
        message: '최종 반영 일자 기록에는 sessionId가 필요합니다.',
        bridgeRole: 'APPSCRIPT_MASTER',
        retryable: false
      };
    }
    if (!completedAt || !displayText) {
      return {
        ok: false,
        code: 'LIST_COMPLETION_VALUE_REQUIRED',
        message: 'Server가 확정한 completedAt/displayText가 필요합니다.',
        bridgeRole: 'APPSCRIPT_MASTER',
        retryable: false
      };
    }

    const target = sheet.getRange(cfg.COMPLETION_MARKER_CELL);
    const props = PropertiesService.getScriptProperties();
    const completionPropertyKey = cfg.COMPLETION_SESSION_PROPERTY_PREFIX + pair.ss.getId();
    let previousMeta = null;
    try {
      previousMeta = JSON.parse(String(props.getProperty(completionPropertyKey) || 'null'));
    } catch (_propertyParseError) {
      previousMeta = null;
    }

    if (previousMeta && String(previousMeta.sessionId || '') === sessionId) {
      const previousDisplayText = String(previousMeta.displayText || displayText);
      const currentMarkerValue = String(target.getDisplayValue() || target.getValue() || '');
      if (currentMarkerValue !== previousDisplayText) {
        target.setValue(previousDisplayText);
        SpreadsheetApp.flush();
      }
      return {
        ok: true,
        alreadyMarked: true,
        markerCell: cfg.COMPLETION_MARKER_CELL,
        markerRange: cfg.COMPLETION_MARKER_RANGE,
        markerValue: String(target.getDisplayValue() || target.getValue() || ''),
        completedAt: String(previousMeta.completedAt || completedAt),
        sessionId: sessionId,
        expectedQueuedCount: Number(previousMeta.expectedQueuedCount || expectedQueuedCount || 0),
        method: method,
        sheetName: sheet.getName(),
        spreadsheetId: pair.ss.getId(),
        bridgeRole: 'APPSCRIPT_MASTER',
        message: '동일 세션의 최종 반영 일자가 이미 기록되어 있습니다.'
      };
    }

    target.setValue(displayText);
    SpreadsheetApp.flush();

    const markerValue = String(target.getDisplayValue() || target.getValue() || '');
    if (markerValue !== displayText) {
      throw new Error('최종 반영 일자 write/readback 불일치 · 예상=' + displayText + ' / 실제=' + markerValue);
    }

    props.setProperty(completionPropertyKey, JSON.stringify({
      sessionId: sessionId,
      completedAt: completedAt,
      displayText: displayText,
      expectedQueuedCount: expectedQueuedCount,
      source: String(body && body.source || 'supabase-edge:lookup-sheet-bridge')
    }));

    const mergedRanges = target.getMergedRanges().map(function(range) { return range.getA1Notation(); });
    return {
      ok: true,
      alreadyMarked: false,
      markerCell: cfg.COMPLETION_MARKER_CELL,
      markerRange: mergedRanges.length ? mergedRanges[0] : cfg.COMPLETION_MARKER_RANGE,
      markerValue: markerValue,
      completedAt: completedAt,
      sessionId: sessionId,
      expectedQueuedCount: expectedQueuedCount,
      method: method,
      sheetName: sheet.getName(),
      spreadsheetId: pair.ss.getId(),
      bridgeRole: 'APPSCRIPT_MASTER',
      message: 'list 시트 최종 반영 일자 기록 완료'
    };
  } finally {
    lock.releaseLock();
  }
}

function kinojoHandleServerListSheetSync_(body, method) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return {
      ok:false,
      code:'MASTER_BRIDGE_BUSY',
      message:'AppsScript_MASTER가 다른 list 반영 작업을 처리 중입니다. 잠시 후 재시도하세요.',
      bridgeRole:'APPSCRIPT_MASTER',
      retryable:true
    };
  }

  try {
    const cfg = KINOJO_LIST_MASTER_BRIDGE_CONFIG;
    const pair = kinojoGetListSheet_();
    const sheet = pair.sheet;
    let lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const updates = kinojoParseUpdates_(body);
    if (!updates.length) {
      return {
        ok: true,
        updatedCount: 0,
        processedCount: 0,
        unchangedCount: 0,
        appendedCount: 0,
        failedCount: 0,
        queuedCount: 0,
        finished: true,
        message: '반영할 list 업데이트가 없습니다.',
        method,
        sheetName: sheet.getName(),
        spreadsheetId: pair.ss.getId(),
        bridgeRole: 'APPSCRIPT_MASTER'
      };
    }

    kinojoAssertWriteColumns_(cfg, lastCol);
    const readLastCol = Math.max(
      cfg.COL_CHARACTER_NAME,
      cfg.COL_CLASS_NAME,
      cfg.COL_PVE_ITEM_LEVEL,
      cfg.COL_PVE_POWER,
      cfg.COL_PVP_ITEM_LEVEL,
      cfg.COL_PVP_POWER,
      cfg.COL_MAIN_CHARACTER_NAME
    );
    const rowCount = Math.max(0, lastRow - cfg.FIRST_DATA_ROW + 1);
    const values = rowCount > 0
      ? sheet.getRange(cfg.FIRST_DATA_ROW, 1, rowCount, readLastCol).getValues()
      : [];

    // Server가 보존한 Google list 원본 이름을 그대로 확인하기 위한 맵.
    // AppsScript_MASTER는 [서버태그]를 해석하거나 서버 ID를 판정하지 않는다.
    const originalNameToRows = {};
    values.forEach(function(row, idx) {
      const key = kinojoNormalizeName_(row[cfg.COL_CHARACTER_NAME - 1]);
      if (!key) return;
      if (!originalNameToRows[key]) originalNameToRows[key] = [];
      originalNameToRows[key].push(cfg.FIRST_DATA_ROW + idx);
    });

    const results = [];
    const failedItems = [];
    const powerChangedRows = {};
    const classChangedRows = {};
    const identityChangedRows = {};
    const mainCharacterChangedRows = {};
    let processedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let appendedCount = 0;
    let classFilledCount = 0;
    let classCorrectedCount = 0;
    let classConflictCount = 0;
    let identityChangedCount = 0;
    let mainCharacterReferenceChangedCount = 0;

    updates.forEach(function(item) {
      try {
        const characterName = String(item.characterName || item.character_name || item.name || '').trim();
        const originalListName = String(
          item.originalListName || item.listOriginalName || item.list_original_name || item.originalName || ''
        ).trim();
        const normalizedOriginalName = kinojoNormalizeName_(originalListName);
        const appendIfMissing = item.appendIfMissing === true || item.append_if_missing === true;
        const appendDisplayName = String(item.listDisplayName || item.list_display_name || characterName || '').trim();
        const mainCharacterName = String(
          item.mainCharacterName || item.main_character_name || (appendIfMissing ? characterName : '') || ''
        ).trim();
        const serverClassName = String(item.className || item.class_name || '').trim();
        let rowNumber = Number(item.listRow || item.list_row || item.row || 0);
        let appended = false;

        if (!characterName) throw new Error('Server가 확정한 characterName이 없습니다.');

        // listRow는 Server가 STEP 1에서 Google list 원본으로부터 보존한 기준 행이다.
        // No row-number-only writes: Server must preserve a known original identity.
        if (!appendIfMissing && !normalizedOriginalName) throw new Error('LIST_ORIGINAL_IDENTITY_REQUIRED');
        if (rowNumber >= cfg.FIRST_DATA_ROW && rowNumber <= lastRow) {
          if (normalizedOriginalName) {
            const localIndex = rowNumber - cfg.FIRST_DATA_ROW;
            const sheetOriginalName = kinojoNormalizeName_(values[localIndex][cfg.COL_CHARACTER_NAME - 1]);
            if (sheetOriginalName !== normalizedOriginalName) rowNumber = 0;
          }
        } else {
          rowNumber = 0;
        }

        // 조회 도중 행이 이동했을 때만 Server가 보존한 원본 이름으로 재탐색한다.
        if (!rowNumber && normalizedOriginalName) {
          const candidates = originalNameToRows[normalizedOriginalName] || [];
          if (candidates.length === 1) rowNumber = candidates[0];
          else if (candidates.length > 1) {
            throw new Error('동일한 list 원본 이름이 여러 행에 있습니다. originalListName=' + originalListName);
          }
        }

        // 신규 append는 Server가 appendIfMissing=true를 명시한 행에서만 허용한다.
        // 재시도 시 같은 이름이 이미 한 행에 있으면 새 행을 만들지 않고 그 행을 재사용한다.
        if (!rowNumber && appendIfMissing) {
          const normalizedCharacterName = kinojoNormalizeName_(appendDisplayName || characterName);
          const candidates = originalNameToRows[normalizedCharacterName] || [];
          if (candidates.length === 1) {
            rowNumber = candidates[0];
          } else if (candidates.length > 1) {
            throw new Error('신규 append 대상 이름이 여러 list 행에 이미 있습니다. characterName=' + characterName);
          }
        }

        if (!rowNumber && appendIfMissing) {
          if (!mainCharacterName) throw new Error('신규 append에는 mainCharacterName이 필요합니다.');
          rowNumber = Math.max(lastRow + 1, cfg.FIRST_DATA_ROW);
          if (rowNumber > sheet.getMaxRows()) {
            sheet.insertRowsAfter(sheet.getMaxRows(), rowNumber - sheet.getMaxRows());
          }

          function requestedValue_(value, clearRequested) {
            if (clearRequested) return '';
            const parsed = kinojoNumberOrBlank_(value);
            return parsed === '' ? '' : Number(parsed);
          }
          const expectedRow = [
            appendDisplayName || characterName,
            serverClassName,
            requestedValue_(item.pveItemLevel !== undefined ? item.pveItemLevel : item.pve_item_level, item.clearPveStats === true || item.clear_pve_stats === true),
            requestedValue_(item.pveCombatPower !== undefined ? item.pveCombatPower : item.pve_combat_power, item.clearPveStats === true || item.clear_pve_stats === true),
            requestedValue_(item.pvpItemLevel !== undefined ? item.pvpItemLevel : item.pvp_item_level, item.clearPvpStats === true || item.clear_pvp_stats === true),
            requestedValue_(item.pvpCombatPower !== undefined ? item.pvpCombatPower : item.pvp_combat_power, item.clearPvpStats === true || item.clear_pvp_stats === true),
            mainCharacterName
          ];

          const appendRange = sheet.getRange(rowNumber, 1, 1, 7);
          const before = appendRange.getValues()[0];
          if (String(before[0] || '').trim()) {
            throw new Error('신규 append 예정 행이 비어 있지 않습니다. row=' + rowNumber);
          }
          appendRange.setValues([expectedRow]);
          SpreadsheetApp.flush();
          const actualRaw = appendRange.getValues()[0];
          const actualDisplay = appendRange.getDisplayValues()[0];
          const mismatches = [];
          if (String(actualDisplay[0] || '').trim() !== (appendDisplayName || characterName)) mismatches.push('A 캐릭터명');
          if (serverClassName && String(actualDisplay[1] || '').trim() !== serverClassName) mismatches.push('B 클래스');
          [2,3,4,5].forEach(function(index) {
            const expected = kinojoNumberOrBlank_(expectedRow[index]);
            const actual = kinojoNumberOrBlank_(actualRaw[index]);
            if (expected === '' ? actual !== '' : Number(actual) !== Number(expected)) mismatches.push(String.fromCharCode(65 + index) + ' 수치');
          });
          if (String(actualDisplay[6] || '').trim() !== mainCharacterName) mismatches.push('G 본캐명');
          if (mismatches.length) {
            appendRange.clearContent();
            SpreadsheetApp.flush();
            throw new Error('신규 list append write/readback 불일치 · ' + mismatches.join(' · '));
          }

          const localIndex = rowNumber - cfg.FIRST_DATA_ROW;
          while (values.length < localIndex) values.push(new Array(readLastCol).fill(''));
          const rowForMemory = new Array(readLastCol).fill('');
          for (let c = 0; c < Math.min(7, readLastCol); c += 1) rowForMemory[c] = actualRaw[c];
          if (values.length === localIndex) values.push(rowForMemory);
          else values[localIndex] = rowForMemory;
          lastRow = Math.max(lastRow, rowNumber);
          const key = kinojoNormalizeName_(appendDisplayName || characterName);
          if (!originalNameToRows[key]) originalNameToRows[key] = [];
          originalNameToRows[key].push(rowNumber);
          appended = true;
          appendedCount += 1;
        }

        if (!rowNumber) {
          throw new Error(
            'list 행을 찾지 못했습니다. listRow=' + String(item.listRow || item.list_row || item.row || '') +
            ' / originalListName=' + originalListName +
            ' / characterName=' + characterName
          );
        }

        const localIndex = rowNumber - cfg.FIRST_DATA_ROW;
        const row = values[localIndex];
        const identityChanged = item.identityChanged === true || item.identity_changed === true;
        const listDisplayName = String(item.listDisplayName || item.list_display_name || characterName || '').trim();
        const previousCharacterName = String(item.previousCharacterName || item.previous_character_name || originalListName || '').trim();
        const mainCharacterRenamed = item.mainCharacterRenamed === true || item.main_character_renamed === true;
        let identityCellChanged = false;
        if (identityChanged) {
          if (!listDisplayName) throw new Error('Server가 확정한 listDisplayName이 없습니다.');
          const currentSheetName = String(row[cfg.COL_CHARACTER_NAME - 1] || '').trim();
          if (currentSheetName !== listDisplayName) {
            row[cfg.COL_CHARACTER_NAME - 1] = listDisplayName;
            identityChangedRows[rowNumber] = true;
            identityCellChanged = true;
            identityChangedCount += 1;
          }
          // Family propagation belongs to Server-generated per-character updates.

        }

        // 신규 append 재시도/행 재발견 시에도 G열은 Server가 확정한 본캐명을 유지한다.
        let mainReferenceChanged = false;
        if (mainCharacterName) {
          const currentMain = String(row[cfg.COL_MAIN_CHARACTER_NAME - 1] || '').trim();
          if (currentMain !== mainCharacterName) {
            row[cfg.COL_MAIN_CHARACTER_NAME - 1] = mainCharacterName;
            mainCharacterChangedRows[rowNumber] = true;
            mainCharacterReferenceChangedCount += 1;
            mainReferenceChanged = true;
          }
        }

        const writeSpecs = [
          { key:'pveItemLevel', alt:'pve_item_level', clearKey:'clearPveStats', clearAlt:'clear_pve_stats', col:cfg.COL_PVE_ITEM_LEVEL },
          { key:'pveCombatPower', alt:'pve_combat_power', clearKey:'clearPveStats', clearAlt:'clear_pve_stats', col:cfg.COL_PVE_POWER },
          { key:'pvpItemLevel', alt:'pvp_item_level', clearKey:'clearPvpStats', clearAlt:'clear_pvp_stats', col:cfg.COL_PVP_ITEM_LEVEL },
          { key:'pvpCombatPower', alt:'pvp_combat_power', clearKey:'clearPvpStats', clearAlt:'clear_pvp_stats', col:cfg.COL_PVP_POWER }
        ];
        const written = {};
        const sheetClassName = String(row[cfg.COL_CLASS_NAME - 1] || '').trim();
        let classWriteStatus = 'not_requested';
        let powerChanged = false;
        let classChanged = false;

        if (serverClassName) {
          if (!sheetClassName) {
            row[cfg.COL_CLASS_NAME - 1] = serverClassName;
            classChanged = true;
            classChangedRows[rowNumber] = true;
            classFilledCount += 1;
            classWriteStatus = 'filled_blank';
            written.className = serverClassName;
          } else if (sheetClassName === serverClassName) {
            classWriteStatus = 'same';
          } else {
            row[cfg.COL_CLASS_NAME - 1] = serverClassName;
            classChanged = true;
            classChangedRows[rowNumber] = true;
            classCorrectedCount += 1;
            classConflictCount += 1;
            classWriteStatus = 'corrected_conflict';
            written.className = serverClassName;
          }
        }

        writeSpecs.forEach(function(spec) {
          const shouldClear = item[spec.clearKey] === true || item[spec.clearAlt] === true;
          const oldValue = kinojoNumberOrBlank_(row[spec.col - 1]);
          if (shouldClear) {
            if (oldValue !== '') {
              row[spec.col - 1] = '';
              written[spec.key] = '';
              powerChanged = true;
              powerChangedRows[rowNumber] = true;
            }
            return;
          }
          const raw = item[spec.key] !== undefined ? item[spec.key] : item[spec.alt];
          const value = kinojoNumberOrBlank_(raw);
          if (value === '') return;
          if (oldValue === '' || Number(oldValue) !== Number(value)) {
            row[spec.col - 1] = Number(value);
            powerChanged = true;
            powerChangedRows[rowNumber] = true;
          }
          written[spec.key] = Number(value);
        });

        const changed = appended || powerChanged || classChanged || identityCellChanged || mainReferenceChanged;
        processedCount += 1;
        if (changed) updatedCount += 1;
        else unchangedCount += 1;

        results.push({
          ok:true,
          id:item.id || '',
          row:rowNumber,
          originalListName: originalListName || appendDisplayName || characterName,
          characterName,
          changed,
          appended,
          appendIfMissing,
          mainCharacterName,
          className:serverClassName,
          sheetClassName,
          classWriteStatus,
          identityChanged,
          listDisplayName,
          mainCharacterRenamed,
          written
        });
      } catch (err) {
        failedItems.push({
          ok:false,
          id:item.id || '',
          row:item.listRow || item.list_row || '',
          originalListName:item.originalListName || item.listOriginalName || item.list_original_name || item.originalName || '',
          characterName:item.characterName || item.character_name || item.name || '',
          message:String(err && err.message || err)
        });
      }
    });

    kinojoBuildRowGroups_(Object.keys(powerChangedRows).map(Number)).forEach(function(group) {
      const startIndex = group.start - cfg.FIRST_DATA_ROW;
      const length = group.end - group.start + 1;
      const block = values.slice(startIndex, startIndex + length).map(function(row) {
        return [
          row[cfg.COL_PVE_ITEM_LEVEL - 1],
          row[cfg.COL_PVE_POWER - 1],
          row[cfg.COL_PVP_ITEM_LEVEL - 1],
          row[cfg.COL_PVP_POWER - 1]
        ];
      });
      sheet.getRange(group.start, cfg.COL_PVE_ITEM_LEVEL, length, 4).setValues(block);
    });

    kinojoBuildRowGroups_(Object.keys(classChangedRows).map(Number)).forEach(function(group) {
      const startIndex = group.start - cfg.FIRST_DATA_ROW;
      const length = group.end - group.start + 1;
      const block = values.slice(startIndex, startIndex + length).map(function(row) {
        return [row[cfg.COL_CLASS_NAME - 1]];
      });
      sheet.getRange(group.start, cfg.COL_CLASS_NAME, length, 1).setValues(block);
    });
    kinojoBuildRowGroups_(Object.keys(identityChangedRows).map(Number)).forEach(function(group) {
      const startIndex = group.start - cfg.FIRST_DATA_ROW;
      const length = group.end - group.start + 1;
      const block = values.slice(startIndex, startIndex + length).map(function(row) {
        return [row[cfg.COL_CHARACTER_NAME - 1]];
      });
      sheet.getRange(group.start, cfg.COL_CHARACTER_NAME, length, 1).setValues(block);
    });
    kinojoBuildRowGroups_(Object.keys(mainCharacterChangedRows).map(Number)).forEach(function(group) {
      const startIndex = group.start - cfg.FIRST_DATA_ROW;
      const length = group.end - group.start + 1;
      const block = values.slice(startIndex, startIndex + length).map(function(row) {
        return [row[cfg.COL_MAIN_CHARACTER_NAME - 1]];
      });
      sheet.getRange(group.start, cfg.COL_MAIN_CHARACTER_NAME, length, 1).setValues(block);
    });
    SpreadsheetApp.flush();

    return {
      ok: failedItems.length === 0,
      updatedCount: processedCount,
      changedCount: updatedCount,
      processedCount,
      unchangedCount,
      appendedCount,
      appendSupported: true,
      appendContract: 'server-explicit-list-row-null-v373',
      classFilledCount,
      classCorrectedCount,
      classConflictCount,
      identityChangedCount,
      mainCharacterReferenceChangedCount,
      failedCount: failedItems.length,
      processedIds: results.map(function(item){ return item.id; }).filter(String),
      failedIds: failedItems.map(function(item){ return item.id; }).filter(String),
      queuedCount: updates.length,
      finished: failedItems.length === 0 && processedCount === updates.length,
      message: failedItems.length
        ? 'list 시트 일부 반영 실패: ' + failedItems.length + '건'
        : 'list 시트 실제 반영 완료: 처리 ' + processedCount + '건 / 신규 append ' + appendedCount + '건 / 변경 ' + updatedCount + '건 / 동일 ' + unchangedCount + '건',
      method,
      sheetName: sheet.getName(),
      spreadsheetId: pair.ss.getId(),
      bridgeRole: 'APPSCRIPT_MASTER',
      firstDataRow: cfg.FIRST_DATA_ROW,
      columns: {
        characterName: cfg.COL_CHARACTER_NAME,
        className: cfg.COL_CLASS_NAME,
        pveItemLevel: cfg.COL_PVE_ITEM_LEVEL,
        pvePower: cfg.COL_PVE_POWER,
        pvpItemLevel: cfg.COL_PVP_ITEM_LEVEL,
        pvpPower: cfg.COL_PVP_POWER,
        mainCharacterName: cfg.COL_MAIN_CHARACTER_NAME
      },
      rowMappings: results.map(function(item) {
        return {
          id: item.id,
          row: item.row,
          originalListName: item.originalListName,
          characterName: item.characterName,
          mainCharacterName: item.mainCharacterName,
          appended: item.appended === true
        };
      }),
      results: results.slice(0, 30),
      failedItems: failedItems.slice(0, 50)
    };
  } finally {
    lock.releaseLock();
  }
}

function kinojoParseUpdates_(body) {
  let updates = body.updates || body.rows || body.items || body.queue || [];
  if (typeof updates === 'string') {
    try { updates = JSON.parse(updates); }
    catch (_e) { updates = []; }
  }
  return Array.isArray(updates) ? updates : [];
}

function kinojoAssertWriteColumns_(cfg, lastCol) {
  const columns = [
    cfg.COL_CLASS_NAME,
    cfg.COL_PVE_ITEM_LEVEL,
    cfg.COL_PVE_POWER,
    cfg.COL_PVP_ITEM_LEVEL,
    cfg.COL_PVP_POWER
  ];
  columns.forEach(col => {
    if (!col || Number(col) < 1) throw new Error('list 시트 쓰기 컬럼 설정이 비어 있습니다.');
    if (Number(col) > Number(lastCol || 0)) {
      throw new Error('list 시트 쓰기 컬럼이 실제 범위를 벗어났습니다. col=' + col + ' / lastCol=' + lastCol);
    }
  });
}

function kinojoBuildRowGroups_(rowNumbers) {
  const sorted = (Array.isArray(rowNumbers) ? rowNumbers : [])
    .map(Number)
    .filter(function(value) { return Number.isFinite(value) && value > 0; })
    .sort(function(a, b) { return a - b; });
  const groups = [];
  sorted.forEach(function(rowNumber) {
    const last = groups.length ? groups[groups.length - 1] : null;
    if (!last || rowNumber !== last.end + 1) groups.push({ start:rowNumber, end:rowNumber });
    else last.end = rowNumber;
  });
  return groups;
}

function kinojoNumberOrBlank_(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/,/g, '').trim();
  if (!text) return '';
  const n = Number(text);
  return Number.isFinite(n) ? n : '';
}

function kinojoNormalizeName_(value) {
  let text = String(value || '');
  try { text = text.normalize('NFKC'); } catch (_e) {}
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Server Engine이 sanctuary_master.sheet_name으로 지정한 성역 원본 시트를 읽습니다.
 * 이 브릿지는 셀 값을 해석하지 않고 표시 문자열과 병합 범위만 그대로 전달합니다.
 */
function kinojoHandleServerSanctuarySheetRead_(body, method) {
  const cfg = KINOJO_LIST_MASTER_BRIDGE_CONFIG;
  const requestedSheetName = String(
    body && (body.sheetName || body.sheet_name || body.sourceSheetName || body.source_sheet_name) || ''
  ).trim();

  if (!requestedSheetName) {
    return {
      ok: false,
      code: 'SANCTUARY_SHEET_NAME_REQUIRED',
      message: 'Server Engine이 확정한 sanctuary_master.sheet_name이 필요합니다.',
      bridgeRole: 'APPSCRIPT_MASTER'
    };
  }

  const props = PropertiesService.getScriptProperties();
  const productionSpreadsheetId = String(props.getProperty(cfg.SPREADSHEET_ID_PROPERTY) || '').trim();
  const testSpreadsheetId = String(props.getProperty(cfg.ROSTER_TEST_SPREADSHEET_ID_PROPERTY) || '').trim();
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const activeSpreadsheetId = activeSpreadsheet ? String(activeSpreadsheet.getId() || '').trim() : '';
  const effectiveProductionId = productionSpreadsheetId || activeSpreadsheetId;
  const requestedSpreadsheetId = String(
    body && (body.targetSpreadsheetId || body.target_spreadsheet_id) || effectiveProductionId
  ).trim();
  if (!requestedSpreadsheetId || (requestedSpreadsheetId !== effectiveProductionId && requestedSpreadsheetId !== testSpreadsheetId)) {
    return {
      ok: false,
      code: 'SPREADSHEET_TARGET_DENIED',
      message: '허용되지 않은 Spreadsheet 읽기 대상입니다.',
      bridgeRole: 'APPSCRIPT_MASTER'
    };
  }
  if (testSpreadsheetId && requestedSpreadsheetId === testSpreadsheetId) {
    const configuredToken = String(props.getProperty(cfg.ROSTER_WRITE_TOKEN_PROPERTY) || '').trim();
    const providedToken = String(body && (body.writeToken || body.write_token) || '').trim();
    if (!configuredToken || !providedToken || !kinojoConstantTimeTextEqual_(configuredToken, providedToken)) {
      return {
        ok: false,
        code: 'READ_TOKEN_INVALID',
        message: '테스트 Spreadsheet 읽기 토큰을 확인할 수 없습니다.',
        bridgeRole: 'APPSCRIPT_MASTER'
      };
    }
  }
  const ss = requestedSpreadsheetId === activeSpreadsheetId
    ? activeSpreadsheet
    : SpreadsheetApp.openById(requestedSpreadsheetId);
  if (!ss) {
    throw new Error('성역 원본 Spreadsheet를 찾지 못했습니다.');
  }

  const sheet = ss.getSheetByName(requestedSheetName);
  if (!sheet) {
    return {
      ok: false,
      code: 'SANCTUARY_SHEET_NOT_FOUND',
      message: '요청한 성역 원본 시트를 찾지 못했습니다.',
      sheetName: requestedSheetName,
      availableSheets: ss.getSheets().map(function(item) { return item.getName(); }),
      spreadsheetId: ss.getId(),
      bridgeRole: 'APPSCRIPT_MASTER'
    };
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    return {
      ok: true,
      sheetName: sheet.getName(),
      spreadsheetId: ss.getId(),
      rows: [],
      rowCount: 0,
      columnCount: 0,
      mergedRanges: [],
      method,
      bridgeRole: 'APPSCRIPT_MASTER',
      message: '성역 원본 시트가 비어 있습니다.'
    };
  }

  const range = sheet.getRange(1, 1, lastRow, lastColumn);
  return {
    ok: true,
    sheetName: sheet.getName(),
    spreadsheetId: ss.getId(),
    rows: range.getDisplayValues(),
    rowCount: lastRow,
    columnCount: lastColumn,
    mergedRanges: range.getMergedRanges().map(function(item) { return item.getA1Notation(); }),
    method,
    bridgeRole: 'APPSCRIPT_MASTER',
    message: '성역 원본 시트 읽기 완료'
  };
}

/**
 * Server Engine 309/310/311이 확정한 최소 셀 쓰기 계획만 실행합니다.
 * 이 함수는 파티/캐릭터 의미를 해석하지 않고 expectedBefore, 쓰기, flush,
 * readback, 실패 시 원복만 담당합니다.
 */
function kinojoHandleServerSanctuaryRosterWrite_(body, method) {
  const cfg = KINOJO_LIST_MASTER_BRIDGE_CONFIG;
  if (method !== 'POST') {
    return kinojoRosterWriteResult_('WRITE_FAILED', 'POST_REQUIRED', 'POST 요청만 허용됩니다.');
  }

  const props = PropertiesService.getScriptProperties();
  const configuredToken = String(props.getProperty(cfg.ROSTER_WRITE_TOKEN_PROPERTY) || '');
  const providedToken = String(body && (body.writeToken || body.write_token) || '');
  if (!configuredToken || !providedToken || !kinojoConstantTimeTextEqual_(configuredToken, providedToken)) {
    return kinojoRosterWriteResult_('WRITE_FAILED', 'WRITE_TOKEN_INVALID', '성역 시트 쓰기 토큰을 확인할 수 없습니다.');
  }

  const plan = kinojoParseRosterWritePlan_(body && (body.writePlan || body.write_plan));
  const contractVersion = Number(plan && plan.contractVersion);
  if (!plan || (contractVersion !== 309 && contractVersion !== 310 && contractVersion !== 311) || !Array.isArray(plan.writes)) {
    return kinojoRosterWriteResult_('WRITE_FAILED', 'WRITE_PLAN_INVALID', 'Server Engine 309/310/311 쓰기 계획이 필요합니다.');
  }
  const minWriteCount = contractVersion === 311 ? 1 : 2;
  const maxWriteCount = contractVersion === 310 ? 20 : (contractVersion === 311 ? 8 : 10);
  if (plan.writes.length < minWriteCount || plan.writes.length > maxWriteCount || Number(plan.writeCount) !== plan.writes.length) {
    return kinojoRosterWriteResult_('WRITE_FAILED', 'WRITE_COUNT_INVALID', '쓰기 셀 수가 허용 범위를 벗어났습니다.');
  }
  if (contractVersion === 311) {
    const operation = String(plan.operation || '').trim().toUpperCase();
    const rosterWrites = plan.writes.filter(function(item) { return String(item && item.targetType || '') === 'ROSTER'; });
    const listWrites = plan.writes.filter(function(item) { return String(item && item.targetType || '') === 'LIST'; });
    const listColumns = listWrites.map(function(item) { return String(item && item.listColumn || '').toUpperCase(); }).sort().join('');
    const listRows = {};
    listWrites.forEach(function(item) { listRows[String(item && item.listRow || '')] = true; });
    if (['ADD_EXISTING','ADD_NEW','REMOVE'].indexOf(operation) < 0
        || rosterWrites.length !== 1
        || (operation === 'ADD_NEW' && (listWrites.length !== 7 || listColumns !== 'ABCDEFG' || Object.keys(listRows).length !== 1))
        || (operation !== 'ADD_NEW' && listWrites.length !== 0)) {
      return kinojoRosterWriteResult_('WRITE_FAILED', 'WRITE_PLAN_311_SHAPE_INVALID', 'Server Engine 311 결합 쓰기 구조가 올바르지 않습니다.');
    }
  }

  const productionSpreadsheetId = String(props.getProperty(cfg.SPREADSHEET_ID_PROPERTY) || '').trim();
  const testSpreadsheetId = String(props.getProperty(cfg.ROSTER_TEST_SPREADSHEET_ID_PROPERTY) || '').trim();
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const activeSpreadsheetId = activeSpreadsheet ? String(activeSpreadsheet.getId() || '').trim() : '';
  const effectiveProductionId = productionSpreadsheetId || activeSpreadsheetId;
  const requestedSpreadsheetId = String(
    body && (body.targetSpreadsheetId || body.target_spreadsheet_id) || effectiveProductionId
  ).trim();
  if (!requestedSpreadsheetId || (requestedSpreadsheetId !== effectiveProductionId && requestedSpreadsheetId !== testSpreadsheetId)) {
    return kinojoRosterWriteResult_('WRITE_FAILED', 'SPREADSHEET_TARGET_DENIED', '허용되지 않은 Spreadsheet 대상입니다.');
  }
  const isTestTarget = Boolean(testSpreadsheetId && requestedSpreadsheetId === testSpreadsheetId);
  const testMode = body && body.testMode === true && isTestTarget;
  const failAfterWrites = testMode ? Math.max(0, Number(body.failAfterWrites || 0)) : 0;
  const holdLockMs = testMode
    ? Math.min(20000, Math.max(0, Number(body.holdLockMs || 0)))
    : 0;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(cfg.ROSTER_WRITE_LOCK_TIMEOUT_MS)) {
    return kinojoRosterWriteResult_('WRITE_FAILED', 'WRITE_LOCK_TIMEOUT', '다른 성역 시트 쓰기가 진행 중입니다.');
  }

  const snapshots = [];
  const applied = [];
  try {
    const ss = requestedSpreadsheetId === activeSpreadsheetId && activeSpreadsheet
      ? activeSpreadsheet
      : SpreadsheetApp.openById(requestedSpreadsheetId);
    if (holdLockMs) Utilities.sleep(holdLockMs);
    const seenCells = {};
    const conflicts = [];

    plan.writes.forEach(function(write, index) {
      const targetType = String(write && write.targetType || (contractVersion === 311 ? '' : 'ROSTER')).trim().toUpperCase();
      const sheetName = String(write && write.sheetName || '').trim();
      const cellA1 = String(write && write.cellA1 || '').trim().toUpperCase();
      const expectedBefore = String(write && write.expectedBefore || '');
      const rawWriteValue = write && Object.prototype.hasOwnProperty.call(write, 'writeValue') ? write.writeValue : '';
      const writeValue = rawWriteValue === null || rawWriteValue === undefined ? '' : rawWriteValue;
      const rawExpectedAfter = write && Object.prototype.hasOwnProperty.call(write, 'expectedAfter') ? write.expectedAfter : writeValue;
      const expectedAfter = rawExpectedAfter === null || rawExpectedAfter === undefined ? '' : rawExpectedAfter;
      const readbackMode = String(write && write.readbackMode || 'DISPLAY').trim().toUpperCase();
      const listCellAllowed = contractVersion === 311 && targetType === 'LIST'
        && sheetName === cfg.LIST_SHEET_NAME && /^[A-G][1-9][0-9]*$/.test(cellA1)
        && Number(cellA1.slice(1)) >= cfg.FIRST_DATA_ROW;
      const rosterCellAllowed = targetType === 'ROSTER' && cfg.SANCTUARY_SHEET_NAMES.indexOf(sheetName) >= 0;
      if (!rosterCellAllowed && !listCellAllowed) {
        throw new Error('WRITE_PLAN_SHEET_DENIED:' + sheetName);
      }
      if (!/^[A-Z]+[1-9][0-9]*$/.test(cellA1)) {
        throw new Error('WRITE_PLAN_CELL_INVALID:' + cellA1);
      }
      if (readbackMode !== 'DISPLAY' && readbackMode !== 'RAW') {
        throw new Error('WRITE_PLAN_READBACK_MODE_INVALID:' + cellA1);
      }
      if ((typeof writeValue !== 'string' && typeof writeValue !== 'number')
          || (typeof expectedAfter !== 'string' && typeof expectedAfter !== 'number')) {
        throw new Error('WRITE_PLAN_VALUE_TYPE_INVALID:' + cellA1);
      }
      if (typeof writeValue === 'string' && writeValue.charAt(0) === '=') {
        throw new Error('WRITE_PLAN_FORMULA_DENIED:' + cellA1);
      }
      const cellKey = sheetName + '!' + cellA1;
      if (seenCells[cellKey]) throw new Error('WRITE_PLAN_DUPLICATE_CELL:' + cellKey);
      seenCells[cellKey] = true;
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error('WRITE_PLAN_SHEET_NOT_FOUND:' + sheetName);
      const range = sheet.getRange(cellA1);
      if (range.getNumRows() !== 1 || range.getNumColumns() !== 1 || range.getA1Notation() !== cellA1) {
        throw new Error('WRITE_PLAN_CELL_NOT_SINGLE:' + cellKey);
      }
      const displayBefore = String(range.getDisplayValue() || '');
      snapshots.push({
        index,
        sheetName,
        cellA1,
        expectedBefore,
        writeValue,
        expectedAfter,
        readbackMode,
        displayBefore,
        rawBefore: range.getValue(),
        formulaBefore: String(range.getFormula() || ''),
        range
      });
      if (displayBefore !== expectedBefore) {
        conflicts.push({sheetName, cellA1, expectedBefore, actualBefore: displayBefore});
      }
    });

    if (conflicts.length) {
      return {
        ok: false,
        status: 'CONFLICT',
        code: 'EXPECTED_BEFORE_CONFLICT',
        message: '시트 값이 Server 쓰기 계획의 기대값과 다릅니다.',
        mutationId: String(plan.mutationId || ''),
        spreadsheetId: ss.getId(),
        conflicts,
        appliedCount: 0,
        bridgeRole: 'APPSCRIPT_MASTER'
      };
    }

    snapshots.forEach(function(snapshot) {
      snapshot.range.setValue(snapshot.writeValue);
      applied.push(snapshot);
      if (failAfterWrites && applied.length >= failAfterWrites) {
        throw new Error('TEST_INJECTED_FAILURE_AFTER_' + applied.length);
      }
    });
    SpreadsheetApp.flush();

    const readback = snapshots.map(function(snapshot) {
      const actualRaw = snapshot.range.getValue();
      const actualDisplay = String(snapshot.range.getDisplayValue() || '');
      const matched = snapshot.readbackMode === 'RAW'
        ? kinojoRosterPrimitiveEqual_(actualRaw, snapshot.expectedAfter)
        : actualDisplay === String(snapshot.expectedAfter === null || snapshot.expectedAfter === undefined ? '' : snapshot.expectedAfter);
      return {
        sheetName: snapshot.sheetName,
        cellA1: snapshot.cellA1,
        readbackMode: snapshot.readbackMode,
        expected: snapshot.expectedAfter,
        actual: snapshot.readbackMode === 'RAW' ? actualRaw : actualDisplay,
        matched
      };
    });
    const readbackFailures = readback.filter(function(item) { return item.matched !== true; });
    if (readbackFailures.length) {
      throw new Error('READBACK_MISMATCH:' + JSON.stringify(readbackFailures));
    }
    return {
      ok: true,
      status: 'READBACK_VERIFIED',
      code: 'OK',
      mutationId: String(plan.mutationId || ''),
      spreadsheetId: ss.getId(),
      writeCount: snapshots.length,
      readback,
      bridgeRole: 'APPSCRIPT_MASTER'
    };
  } catch (err) {
    const rollback = [];
    let rollbackOk = true;
    for (let index = applied.length - 1; index >= 0; index -= 1) {
      const snapshot = applied[index];
      try {
        if (snapshot.formulaBefore) snapshot.range.setFormula(snapshot.formulaBefore);
        else snapshot.range.setValue(snapshot.rawBefore);
      } catch (rollbackErr) {
        rollbackOk = false;
        rollback.push({
          sheetName: snapshot.sheetName,
          cellA1: snapshot.cellA1,
          ok: false,
          message: String(rollbackErr && rollbackErr.message || rollbackErr)
        });
      }
    }
    if (applied.length) {
      try { SpreadsheetApp.flush(); } catch (_flushErr) { rollbackOk = false; }
      applied.forEach(function(snapshot) {
        let actual = '';
        try { actual = String(snapshot.range.getDisplayValue() || ''); }
        catch (_readErr) { rollbackOk = false; }
        const restored = actual === snapshot.displayBefore;
        if (!restored) rollbackOk = false;
        rollback.push({
          sheetName: snapshot.sheetName,
          cellA1: snapshot.cellA1,
          expected: snapshot.displayBefore,
          actual,
          ok: restored
        });
      });
    }
    return {
      ok: false,
      status: applied.length ? (rollbackOk ? 'ROLLBACK_COMPLETED' : 'RECONCILE_REQUIRED') : 'WRITE_FAILED',
      code: applied.length ? (rollbackOk ? 'WRITE_FAILED_ROLLED_BACK' : 'ROLLBACK_READBACK_FAILED') : 'WRITE_FAILED_BEFORE_APPLY',
      message: String(err && err.message || err),
      mutationId: String(plan && plan.mutationId || ''),
      appliedCount: applied.length,
      rollback,
      bridgeRole: 'APPSCRIPT_MASTER'
    };
  } finally {
    lock.releaseLock();
  }
}

function kinojoParseRosterWritePlan_(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string' && value.trim()) {
    try { return JSON.parse(value); } catch (_err) { return null; }
  }
  return null;
}

function kinojoConstantTimeTextEqual_(left, right) {
  const leftDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(left), Utilities.Charset.UTF_8);
  const rightDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(right), Utilities.Charset.UTF_8);
  if (leftDigest.length !== rightDigest.length) return false;
  let diff = 0;
  for (let index = 0; index < leftDigest.length; index += 1) diff |= leftDigest[index] ^ rightDigest[index];
  return diff === 0;
}

function kinojoRosterPrimitiveEqual_(left, right) {
  if (typeof left === 'number' || typeof right === 'number') {
    return Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Number(left) === Number(right);
  }
  return String(left === null || left === undefined ? '' : left) === String(right === null || right === undefined ? '' : right);
}

function kinojoRosterWriteResult_(status, code, message) {
  return {
    ok: status === 'READBACK_VERIFIED',
    status,
    code,
    message,
    bridgeRole: 'APPSCRIPT_MASTER'
  };
}
