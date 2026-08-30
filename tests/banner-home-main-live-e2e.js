'use strict';

const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');

const BASE=String(process.env.LIVE_BASE||'https://kinojo.info').replace(/\/$/,'');
const CHROME=String(process.env.CHROME_BIN||'').trim();
const FIXTURE=process.env.BANNER_E2E_FIXTURE==='1';
assert.ok(CHROME,'CHROME_BIN is required');

const EDGE_PATH='/functions/v1/kinojo-banner-media';
const FALLBACK='/assets/images/common/kinojo_banner_summer.webp';
const SUMMER_PNG='/assets/images/common/kinojo_banner_summer.png';
const SUMMER_WEBP='/assets/images/common/kinojo_banner_summer.webp';
const deliveryImageUrl=value=>String(value||'').replace(SUMMER_PNG,SUMMER_WEBP);

async function snapshot(page){
  return page.evaluate(()=>{
    const image=document.querySelector('#kinojo-main-banner-image');
    const host=image?.closest('.kinojo-main-banner');
    const rect=host?.getBoundingClientRect();
    return{
      src:String(image?.currentSrc||image?.src||''),
      visibility:String(image?getComputedStyle(image).visibility:''),
      pending:host?.classList.contains('is-manifest-pending')===true,
      ariaBusy:host?.getAttribute('aria-busy'),
      width:Number(rect?.width||0),
      height:Number(rect?.height||0),
    };
  });
}

(async()=>{
  const browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:1000,deviceScaleFactor:1});
    await page.setRequestInterception(true);
    page.on('request',request=>{
      if(FIXTURE&&request.url().includes(EDGE_PATH)&&request.method()==='OPTIONS'){
        request.respond({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'GET, OPTIONS'}}).catch(()=>{});
        return;
      }
      if(request.method()==='GET'&&request.url().includes(EDGE_PATH)){
        if(FIXTURE){
          const body={ok:true,service:'kinojo-banner-media',apiVersion:'e2e',databaseContract:'412',contract:'banner-public-manifest-v1',manifestVersion:'first-paint-e2e',generatedAtKst:'2035-01-01T00:00:00+09:00',validUntil:'2035-01-01T00:05:00+09:00',pageCode:'HOME',slotCode:'MAIN',slotKey:'HOME:MAIN',active:true,reason:null,rotation:{slideIntervalMs:8000,transitionDurationMs:600},playlist:[{imageUrl:'https://kinojo.info/assets/images/common/kinojo_banner_summer.png',alt:'First paint E2E',clickUrl:null}]};
          setTimeout(()=>request.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','cache-control':'no-store','etag':'W/"first-paint-e2e"'},body:JSON.stringify(body)}).catch(()=>{}),2500);
          return;
        }
        setTimeout(()=>request.continue().catch(()=>{}),2500);
        return;
      }
      request.continue().catch(()=>{});
    });
    const response=await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:45000});
    assert.ok(response&&response.status()>=200&&response.status()<400,'HOME HTTP '+response?.status());
    await page.waitForSelector('#kinojo-main-banner-image',{timeout:15000});
    const pending=await snapshot(page);
    assert.ok(pending.src.includes(FALLBACK),'pending source must remain SEO fallback '+pending.src);
    assert.ok(pending.width>0&&pending.height>0,'pending banner must reserve layout geometry');
    assert.equal(pending.visibility,'visible','approved optimized first banner must paint while Manifest is unresolved');
    assert.equal(pending.pending,true,'pending state class');
    assert.equal(pending.ariaBusy,'true','pending accessibility state');

    await page.waitForFunction(()=>window.KinojoBannerRuntime?.peekManifest?.('HOME','MAIN')!==null,{timeout:20000});
    const manifest=await page.evaluate(()=>window.KinojoBannerRuntime.peekManifest('HOME','MAIN'));
    await page.waitForFunction(()=>!document.querySelector('.kinojo-main-banner')?.classList.contains('is-manifest-pending'),{timeout:10000});
    const settled=await snapshot(page);
    assert.equal(settled.visibility,'visible','settled banner visibility');
    assert.equal(settled.pending,false,'settled pending state');
    assert.equal(settled.ariaBusy,null,'settled accessibility state');
    if(manifest.active){
      const canonical=String(manifest.playlist?.[0]?.imageUrl||'');
      assert.equal(settled.src,deliveryImageUrl(canonical),'active first image must use the approved delivery URL for the Server Manifest item');
    }else{
      assert.ok(settled.src.includes(FALLBACK),'inactive Manifest must reveal fallback');
    }
    console.log('KINOJO PC HOME delayed Manifest first-paint E2E: PASS');
    await page.close();
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error?.stack||error);process.exit(1)});
