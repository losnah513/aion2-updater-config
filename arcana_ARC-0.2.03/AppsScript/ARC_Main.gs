function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};

  if (params.action) {
    return ARC_handleApiRequest(params);
  }

  return HtmlService
    .createHtmlOutput('Arcana Simulator API is running.')
    .setTitle('Arcana Simulator API')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const params = e && e.parameter ? e.parameter : {};
  return ARC_handleApiRequest(params, e);
}
