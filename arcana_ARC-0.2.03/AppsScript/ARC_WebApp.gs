function ARC_handleApiRequest(params, event) {
  try {
    const action = params.action || '';
    let payload;

    if (action === 'getInitialData') {
      payload = ARC_getInitialData();
    } else if (action === 'saveOwnedCards') {
      const ownedCards = ARC_parseOwnedCardsPayload(params, event);
      payload = ARC_saveOwnedCards(ownedCards);
    } else {
      payload = {
        ok: false,
        message: 'Unknown action: ' + action
      };
    }

    return ARC_createJsonResponse(payload, params.callback);
  } catch (error) {
    return ARC_createJsonResponse({
      ok: false,
      message: error && error.message ? error.message : String(error)
    }, params.callback);
  }
}

function ARC_getInitialData() {
  const classList = ARC_getClassList();
  const classSkills = ARC_getClassSkillData(classList);

  return {
    ok: true,
    version: ARC_VERSION,
    targetLevel: ARC_TARGET_LEVEL,
    baseSkillLevel: ARC_BASE_SKILL_LEVEL,
    devanionBonus: ARC_DEVANION_BONUS,
    maxCardLevel: ARC_MAX_CARD_LEVEL,
    maxSlotLevel: ARC_MAX_SLOT_LEVEL,
    arcanaTypes: ARC_ARCANA_TYPES,
    skillsByArcana: ARC_createEmptyArcanaSkillMap_(),
    classList: classList.map(function(item) {
      return { key: item.key, name: item.name };
    }),
    classSkills: classSkills,
    activeSkills: [],
    passiveSkills: [],
    ownedCards: ARC_loadOwnedCards(),
    source: 'apps-script'
  };
}

function ARC_saveOwnedCards(ownedCards) {
  ARC_saveOwnedCardsToProperties(ownedCards || {});
  return {
    ok: true,
    savedAt: new Date().toISOString()
  };
}

function ARC_parseOwnedCardsPayload(params, event) {
  if (params.ownedCards) {
    return JSON.parse(params.ownedCards);
  }

  if (event && event.postData && event.postData.contents) {
    return JSON.parse(event.postData.contents);
  }

  return {};
}

function ARC_createJsonResponse(payload, callbackName) {
  const json = JSON.stringify(payload || {});
  const output = callbackName
    ? String(callbackName) + '(' + json + ');'
    : json;

  return ContentService
    .createTextOutput(output)
    .setMimeType(callbackName
      ? ContentService.MimeType.JAVASCRIPT
      : ContentService.MimeType.JSON);
}
