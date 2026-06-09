function ARC_saveOwnedCardsToProperties(ownedCards) {
  PropertiesService
    .getDocumentProperties()
    .setProperty(ARC_OWNED_CARD_PROPERTY_KEY, JSON.stringify(ownedCards || {}));
}

function ARC_loadOwnedCards() {
  const raw = PropertiesService
    .getDocumentProperties()
    .getProperty(ARC_OWNED_CARD_PROPERTY_KEY);

  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}
