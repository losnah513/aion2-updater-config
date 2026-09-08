'use strict';
// Install before navigation, including when the target is the deployed website.
const isVisitRequest=url=>/\/rest\/v1\/rpc\/kinojo_log_page_view(?:_[a-z0-9]+)?(?:[?]|$)/i.test(url);
const response={ok:true,ignored:true,reason:'BROWSER_TEST'};
async function isolatePlaywrightPage(page){
  await page.addInitScript(()=>{window.__KINOJO_TEST_TRAFFIC__=true;});
  await page.route('**/rest/v1/rpc/**',route=>isVisitRequest(route.request().url())
    ?route.fulfill({status:200,json:response,headers:{'access-control-allow-origin':'*'}}):route.fallback());
}
async function markPuppeteerPage(page){
  await page.evaluateOnNewDocument(()=>{window.__KINOJO_TEST_TRAFFIC__=true;});
}
function interceptPuppeteerVisit(request){
  if(!isVisitRequest(request.url()))return false;
  request.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)}).catch(()=>{});
  return true;
}
module.exports={isVisitRequest,isolatePlaywrightPage,markPuppeteerPage,interceptPuppeteerVisit};
