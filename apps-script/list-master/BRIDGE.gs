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
        metadataWriteContract: 'MASTER_ID_V1',
        completeReadContract: true,
        listSyncPositionalWrites: false,
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

    if (action === 'serverListSheetCleanup') {
      return kinojoJson_(kinojoHandleServerListSheetCleanup_(body, method));
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
    kinojoAssertNoListCleanup_();
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

// Stable row addressing: Sheets metadata follows row moves; never fall back to positional writes.
function kinojoSheetsApi_(spreadsheetId, suffix, payload) {
  const response = UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + suffix, {
    method:'post', contentType:'application/json',
    headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()},
    payload:JSON.stringify(payload), muteHttpExceptions:true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('SHEETS_METADATA_API_FAILED HTTP ' + response.getResponseCode());
  }
  return JSON.parse(response.getContentText());
}
function kinojoMetadataRow_(range) {
  const match = String(range || '').match(/!\$?A\$?(\d+)(?::[A-Z]+\$?\d+)?$/);
  return match ? Number(match[1]) : 0;
}
function kinojoHandleServerListSheetSync_(body, method) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000)) return {ok:false,code:'MASTER_BRIDGE_BUSY',bridgeRole:'APPSCRIPT_MASTER',retryable:true};
  const results=[],failedItems=[];
  try {
    kinojoAssertNoListCleanup_();
    const cfg=KINOJO_LIST_MASTER_BRIDGE_CONFIG,pair=kinojoGetListSheet_(),sheet=pair.sheet;
    const spreadsheetId=pair.ss.getId(),sheetId=sheet.getSheetId(),updates=kinojoParseUpdates_(body);
    if(updates.length>250) throw new Error('LIST_SYNC_BATCH_LIMIT_250');
    if(!updates.length) return {ok:true,processedIds:[],results:[],rowMappings:[],bridgeRole:'APPSCRIPT_MASTER',finished:true};
    const api=(suffix,payload)=>kinojoSheetsApi_(spreadsheetId,suffix,payload);
    const metadataKey='KINOJO_MASTER_ID';
    const existing=api('/developerMetadata:search',{dataFilters:[{developerMetadataLookup:{metadataKey,locationType:'ROW'}}]});
    const metadata=(existing.matchedDeveloperMetadata||[]).map(x=>x.developerMetadata)
      .filter(x=>x.location && x.location.dimensionRange && x.location.dimensionRange.sheetId===sheetId);
    const lastRow=sheet.getLastRow(),values=lastRow>=cfg.FIRST_DATA_ROW
      ?sheet.getRange(cfg.FIRST_DATA_ROW,1,lastRow-cfg.FIRST_DATA_ROW+1,7).getValues():[];
    const plans=[],requests=[],seen=new Set(),claimedRows=new Set();
    let appendIndex=Math.max(lastRow,cfg.FIRST_DATA_ROW-1);
    function fail(item,message){failedItems.push({ok:false,id:item.id,row:item.listRow||'',characterName:item.characterName||'',message});}
    function cell(value){return {userEnteredValue:typeof value==='number'?{numberValue:value}:{stringValue:String(value??'')}};}
    for(const item of updates){
      try {
        const masterId=String(item.characterId||item.character_id||'');
        if(!/^[1-9]\d*$/.test(masterId)) throw new Error('LIST_STABLE_MASTER_ID_REQUIRED');
        if(PropertiesService.getScriptProperties().getProperty('KINOJO_LIST_RETIRED_'+masterId)) throw new Error('LIST_RETIRED_CHARACTER_REQUIRES_REVIEW');
        if(seen.has(masterId)) throw new Error('LIST_DUPLICATE_MASTER_ID');
        seen.add(masterId);
        const original=String(item.originalListName||item.list_original_name||'').trim();
        const display=String(item.listDisplayName||item.list_display_name||item.characterName||'').trim();
        const cls=String(item.className||item.class_name||'').trim();
        const append=item.appendIfMissing===true||item.append_if_missing===true;
        const renamed=item.identityChanged===true||item.identity_changed===true;
        if(!original&&!append)throw new Error('LIST_ORIGINAL_IDENTITY_REQUIRED');
        if(!display)throw new Error('LIST_DISPLAY_NAME_REQUIRED');
        const bound=metadata.filter(x=>x.metadataValue===masterId);
        if(bound.length>1)throw new Error('LIST_METADATA_IDENTITY_AMBIGUOUS');
        const expected=[renamed||append?display:original,cls||null,null,null,null,null,
          String(item.mainCharacterName||item.main_character_name||'').trim()||null,
          typeof item.listStatus==='string'?item.listStatus:null];
        const fields=[['pveItemLevel','pve_item_level','clearPveStats'],['pveCombatPower','pve_combat_power','clearPveStats'],['pvpItemLevel','pvp_item_level','clearPvpStats'],['pvpCombatPower','pvp_combat_power','clearPvpStats']];
        fields.forEach((f,index)=>{const raw=item[f[0]]===undefined?item[f[1]]:item[f[0]],n=kinojoNumberOrBlank_(raw);
          expected[index+2]=item[f[2]]===true?'':n===''?null:Number(n);});
        const plan={item,masterId,original,display,cls,expected,renamed,append,newBinding:false,appended:false,metadataId:bound[0]&&bound[0].metadataId};
        if(!plan.metadataId){
          const matches=[];
          values.forEach((row,index)=>{if(kinojoNormalizeName_(row[0])===kinojoNormalizeName_(original||display))matches.push({row,index:index+cfg.FIRST_DATA_ROW-1});});
          if(matches.length>1)throw new Error('LIST_ORIGINAL_IDENTITY_AMBIGUOUS');
          let index;
          if(matches.length){
            index=matches[0].index;
            if(cls&&kinojoNormalizeName_(matches[0].row[1])!==kinojoNormalizeName_(cls))throw new Error('LIST_BINDING_CLASS_MISMATCH');
            if(metadata.some(x=>x.location.dimensionRange.startIndex===index))throw new Error('LIST_ROW_ALREADY_BOUND');
            if(claimedRows.has(index))throw new Error('LIST_ROW_ALREADY_PLANNED');
            claimedRows.add(index);
          }else{
            if(!append)throw new Error('LIST_ROW_NOT_FOUND');
            if(!expected[6])throw new Error('LIST_APPEND_MAIN_REQUIRED');
            index=appendIndex++;
            requests.push({insertDimension:{range:{sheetId,dimension:'ROWS',startIndex:index,endIndex:index+1},inheritFromBefore:index>0}});
            plan.appended=true;
          }
          plan.newBinding=true;plan.requestIndex=requests.length;
          requests.push({createDeveloperMetadata:{developerMetadata:{metadataKey,metadataValue:masterId,visibility:'DOCUMENT',location:{dimensionRange:{sheetId,dimension:'ROWS',startIndex:index,endIndex:index+1}}}}});
          if(plan.appended)requests.push({updateCells:{range:{sheetId,startRowIndex:index,endRowIndex:index+1,startColumnIndex:0,endColumnIndex:expected.length},rows:[{values:expected.map(x=>cell(x??''))}],fields:'userEnteredValue'}});
        }
        plans.push(plan);
      }catch(error){fail(item,String(error.message||error));}
    }
    if(requests.length){
      const made=api(':batchUpdate',{requests});
      for(const plan of plans)if(plan.newBinding){
        const reply=(made.replies||[])[plan.requestIndex];
        plan.metadataId=reply&&reply.createDeveloperMetadata&&reply.createDeveloperMetadata.developerMetadata.metadataId;
        if(!plan.metadataId)throw new Error('LIST_METADATA_CREATE_UNCONFIRMED');
      }
    }
    function readPlans(selected){
      if(!selected.length)return new Map();
      const read=api('/values:batchGetByDataFilter',{dataFilters:selected.map(p=>({developerMetadataLookup:{metadataId:p.metadataId}})),valueRenderOption:'UNFORMATTED_VALUE'});
      const mapped=new Map();
      for(const match of read.valueRanges||[]){
        const value=match.valueRange||{};
        for(const f of match.dataFilters||[]){const id=f.developerMetadataLookup&&f.developerMetadataLookup.metadataId;
          if(id){if(mapped.has(id))throw new Error('LIST_METADATA_MULTIPLE_RANGES');mapped.set(id,{row:kinojoMetadataRow_(value.range),values:(value.values||[])[0]||[]});}}
      }
      return mapped;
    }
    const before=readPlans(plans),ready=[],data=[];
    for(const plan of plans){
      const current=before.get(plan.metadataId),actual=current&&current.values||[],name=kinojoNormalizeName_(actual[0]);
      const oldMatch=name===kinojoNormalizeName_(plan.original),newMatch=name===kinojoNormalizeName_(plan.display);
      // First binding must still identify the original row. A bound ID permits an already-applied rename.
      const nameOK=plan.appended?newMatch:plan.newBinding?(oldMatch||(plan.append&&newMatch)):oldMatch||((plan.renamed||plan.append)&&newMatch);
      if(!current||!current.row||!nameOK||(plan.cls&&kinojoNormalizeName_(actual[1])!==kinojoNormalizeName_(plan.cls))){
        fail(plan.item,'LIST_METADATA_IDENTITY_CHANGED');
        if(plan.newBinding&&!plan.appended)api(':batchUpdate',{requests:[{deleteDeveloperMetadata:{dataFilter:{developerMetadataLookup:{metadataId:plan.metadataId}}}}]});
        continue;
      }
      ready.push(plan);
      if(plan.expected.some((v,i)=>v!==null&&String(v)!==String(actual[i]??'')))data.push({dataFilter:{developerMetadataLookup:{metadataId:plan.metadataId}},majorDimension:'ROWS',values:[plan.expected]});
    }
    if(data.length){
      const written=api('/values:batchUpdateByDataFilter',{valueInputOption:'RAW',data});
      if(Number(written.totalUpdatedRows)!==data.length)throw new Error('LIST_METADATA_WRITE_COUNT_MISMATCH');
    }
    const after=readPlans(ready);
    for(const plan of ready){
      const actual=after.get(plan.metadataId),mismatches=[];
      if(!actual||!actual.row)mismatches.push('ROW_MISSING');
      else plan.expected.forEach((v,i)=>{if(v!==null&&String(v)!==String(actual.values[i]??''))mismatches.push(String.fromCharCode(65+i));});
      if(mismatches.length)fail(plan.item,'LIST_METADATA_READBACK_MISMATCH '+mismatches.join(','));
      else results.push({ok:true,id:plan.item.id,characterId:plan.masterId,row:actual.row,metadataId:plan.metadataId,appended:plan.appended});
    }
    return {ok:failedItems.length===0,finished:failedItems.length===0,bridgeRole:'APPSCRIPT_MASTER',method,
      metadataWriteContract:'MASTER_ID_V1',appendSupported:true,processedCount:results.length,updatedCount:results.length,
      failedCount:failedItems.length,processedIds:results.map(x=>x.id),failedIds:failedItems.map(x=>x.id),results,
      rowMappings:results,failedItems};
  }catch(error){
    return {ok:false,finished:false,bridgeRole:'APPSCRIPT_MASTER',code:'LIST_METADATA_SYNC_FAILED',
      message:String(error.message||error),retryable:true,writeOutcomeUnknown:true,processedIds:[],failedItems};
  }finally{lock.releaseLock();}
}
// I/O only. Eligibility/family/DB completion decisions belong to the Server.
// Disabled until final DB/writer and real Sheets canary gates are satisfied.
function kinojoAssertNoListCleanup_() {
  if(PropertiesService.getScriptProperties().getProperty('KINOJO_LIST_CLEANUP_ACTIVE')) throw new Error('LIST_CLEANUP_RECOVERY_PENDING');
}
function kinojoHandleServerListSheetCleanup_(body, method) {
  const props=PropertiesService.getScriptProperties(),cfg=KINOJO_LIST_MASTER_BRIDGE_CONFIG;
  const token=String(props.getProperty(cfg.ROSTER_WRITE_TOKEN_PROPERTY)||'');
  if(method!=='POST'||!token||!kinojoConstantTimeTextEqual_(token,String(body.writeToken||''))) return {ok:false,code:'WRITE_TOKEN_INVALID'};
  if(props.getProperty('KINOJO_LIST_CLEANUP_ENABLED')!=='true'&&(body.cleanupPlan||{}).operation==='CLEAR')return {ok:false,code:'LIST_CLEANUP_DISABLED'};
  const p=body.cleanupPlan||{},jobId=String(p.jobId||''),masterId=String(p.characterId||''),metadataId=Number(p.metadataId);
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(jobId)||!/^[1-9]\d*$/.test(masterId)||!Number.isSafeInteger(metadataId)||metadataId<1
    ||!['CLEAR','RESTORE','COMPLETE'].includes(p.operation))return {ok:false,code:'CLEANUP_PLAN_INVALID'};
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))return {ok:false,code:'MASTER_BRIDGE_BUSY',retryable:true};
  const activeKey='KINOJO_LIST_CLEANUP_ACTIVE',doneKey='KINOJO_LIST_CLEANUP_DONE_'+jobId;
  let journal;
  try {
    const pair=kinojoGetListSheet_(),spreadsheetId=pair.ss.getId(),sheetId=pair.sheet.getSheetId();
    const api=(suffix,data)=>kinojoSheetsApi_(spreadsheetId,suffix,data);
    const receipt=(state)=>({ok:true,jobId,characterId:masterId,metadataId,spreadsheetId,sheetId,state});
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const done=props.getProperty(doneKey);
    if(done){
      const d=JSON.parse(done);
      if(d.characterId!==masterId||d.metadataId!==metadataId||d.spreadsheetId!==spreadsheetId||d.sheetId!==sheetId)throw Error('CLEANUP_JOB_MISMATCH');
      const pending=JSON.parse(props.getProperty(activeKey)||'null');
      if(pending&&pending.jobId===jobId&&pending.characterId===masterId&&pending.metadataId===metadataId&&pending.spreadsheetId===spreadsheetId&&pending.sheetId===sheetId)props.deleteProperty(activeKey);
      return Object.assign({},d,{replayed:true});
    }
    journal=JSON.parse(props.getProperty(activeKey)||'null');
    if(journal&&(journal.jobId!==jobId||journal.characterId!==masterId||journal.metadataId!==metadataId||journal.spreadsheetId!==spreadsheetId||journal.sheetId!==sheetId))throw Error('LIST_CLEANUP_RECOVERY_PENDING');
    function read(){
      const search=api('/developerMetadata:search',{dataFilters:[{developerMetadataLookup:{metadataKey:'KINOJO_MASTER_ID',locationType:'ROW'}}]});
      const bindings=(search.matchedDeveloperMetadata||[]).map(x=>x.developerMetadata).filter(x=>x.metadataKey==='KINOJO_MASTER_ID'&&x.location&&x.location.dimensionRange&&x.location.dimensionRange.sheetId===sheetId);
      const matches=bindings.filter(x=>x.metadataValue===masterId);
      if(matches.length!==1||matches[0].metadataId!==metadataId)throw Error('CLEANUP_METADATA_MISMATCH');
      const dimension=matches[0].location.dimensionRange;
      if(dimension.endIndex!==dimension.startIndex+1||bindings.filter(x=>x.location.dimensionRange.startIndex===dimension.startIndex).length!==1)throw Error('CLEANUP_METADATA_MISMATCH');
      const result=api('/values:batchGetByDataFilter',{dataFilters:[{developerMetadataLookup:{metadataId}}],valueRenderOption:'FORMULA'});
      if((result.valueRanges||[]).length!==1)throw Error('CLEANUP_ROW_MISSING');
      const v=result.valueRanges[0],range=v.valueRange||{},values=range.values||[],row=kinojoMetadataRow_(range.range);
      if(row<cfg.FIRST_DATA_ROW||row!==dimension.startIndex+1||values.length>1)throw Error('CLEANUP_ROW_INVALID');
      if(journal&&journal.row!==row)throw Error('CLEANUP_ROW_MOVED');
      const cells=values[0]||[];
      if(cells.slice(8).some(x=>x!==''&&x!==null))throw Error('CLEANUP_EXTRA_COLUMNS_PRESENT');
      const first=Array.from({length:8},(_,i)=>cells[i]??'');
      if(first.some(x=>!['string','number','boolean'].includes(typeof x)||(typeof x==='string'&&(x.length>256||x.startsWith('=')))))throw Error('CLEANUP_UNSUPPORTED_CELL');
      return {row,values:first};
    }
    function save(){props.setProperty(activeKey,JSON.stringify(journal));}
    function write(values){
      const r=api('/values:batchUpdateByDataFilter',{valueInputOption:'RAW',data:[{dataFilter:{developerMetadataLookup:{metadataId}},majorDimension:'ROWS',values:[values]}]});
      if(Number(r.totalUpdatedRows)!==1)throw Error('CLEANUP_WRITE_UNCONFIRMED');
      if(!same(read().values,values))throw Error('CLEANUP_READBACK_MISMATCH');
    }
    const current=read(),blank=Array(8).fill('');
    if(!journal){
      if(p.operation!=='CLEAR'||!Array.isArray(p.expectedBefore)||p.expectedBefore.length!==8||!same(current.values,p.expectedBefore)||!current.values[0])throw Error('CLEANUP_EXPECTED_BEFORE_MISMATCH');
      if(props.getProperty('KINOJO_LIST_RETIRED_'+masterId))throw Error('LIST_RETIRED_CHARACTER_REQUIRES_REVIEW');
      journal=Object.assign(receipt('PREPARED'),{row:current.row,before:current.values});save();
    }
    if(p.operation==='CLEAR'){
      if(!same(current.values,blank)){
        if(!same(current.values,journal.before))throw Error('CLEANUP_MANUAL_EDIT_DETECTED');
        write(blank);
      }
      journal.state='CLEARED';save();return receipt('CLEARED');
    }
    if(p.operation==='RESTORE'){
      if(!same(current.values,journal.before)){
        if(!same(current.values,blank))throw Error('CLEANUP_MANUAL_EDIT_DETECTED');
        write(journal.before);
      }
      const r=receipt('RESTORED');props.setProperty(doneKey,JSON.stringify(r));props.deleteProperty(activeKey);return r;
    }
    if(p.dbFinalized!==true||journal.state!=='CLEARED'||!same(current.values,blank))throw Error('CLEANUP_FINALIZATION_UNCONFIRMED');
    const r=receipt('COMPLETED');
    props.setProperty('KINOJO_LIST_RETIRED_'+masterId,JSON.stringify(r));
    props.setProperty(doneKey,JSON.stringify(r));props.deleteProperty(activeKey);return r;
  }catch(error){return {ok:false,code:String(error.message||error),jobId,characterId:masterId,recoveryRequired:!!props.getProperty(activeKey),writeOutcomeUnknown:true};}
  finally{lock.releaseLock();}
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
    kinojoAssertNoListCleanup_();
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
