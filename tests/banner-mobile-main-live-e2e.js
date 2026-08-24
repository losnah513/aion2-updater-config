'use strict';

const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');

const BASE=String(process.env.LIVE_BASE||'https://kinojo.info').replace(/\/$/,'');
const CHROME=String(process.env.CHROME_BIN||'').trim();
assert.ok(CHROME,'CHROME_BIN is required');

const MOBILE_URL=BASE+'/m/';
const EDGE_PATH='/functions/v1/kinojo-banner-media';
const FALLBACK='/assets/images/common/kinojo-og.jpg';
const SUMMER='/assets/images/common/kinojo_banner_summer.png';
const MOBILE_UA='Mozilla/5.0 (Linux; Android 16; SM-F956N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function manifest(mode){
  const base={
    ok:true,
    service:'kinojo-banner-media',
    apiVersion:'e2e',
    databaseContract:'388',
    contract:'banner-public-manifest-v1',
    manifestVersion:'mobile-e2e-'+mode,
    generatedAtKst:'2035-01-01T00:00:00+09:00',
    validUntil:'2035-01-01T00:05:00+09:00',
    pageCode:'HOME',
    slotCode:'MAIN',
    slotKey:'HOME:MAIN'
  };
  if(mode==='inactive')return {...base,active:false,reason:'NO_ACTIVE_CAMPAIGN',rotation:null,playlist:[]};
  const first={imageUrl:BASE+SUMMER,alt:'Mobile E2E A',clickUrl:'/hof/'};
  if(mode==='one')return {...base,active:true,reason:null,rotation:{slideIntervalMs:3000,transitionDurationMs:600},playlist:[first]};
  if(mode==='multi')return {...base,active:true,reason:null,rotation:{slideIntervalMs:3000,transitionDurationMs:600},playlist:[first,{imageUrl:BASE+FALLBACK,alt:'Mobile E2E B',clickUrl:'/'}]};
  throw new Error('Unknown manifest mode '+mode);
}

function isFallback(src){return String(src||'').includes(FALLBACK)}
function isSummer(src){return String(src||'').includes(SUMMER)}

async function configurePage(browser,scenario,{reducedMotion=false}={}){
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await page.setUserAgent(MOBILE_UA);
  if(reducedMotion)await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.setRequestInterception(true);
  page.on('request',request=>{
    const url=request.url();
    if(url.includes(EDGE_PATH)&&request.method()==='GET'){
      if(scenario.mode==='slow-live'){
        setTimeout(()=>request.continue().catch(()=>{}),2500);
        return;
      }
      if(scenario.mode==='server-fail'){
        request.respond({
          status:503,
          contentType:'application/json',
          headers:{'access-control-allow-origin':'https://kinojo.info','cache-control':'no-store'},
          body:JSON.stringify({ok:false,code:'MOBILE_E2E_SERVER_FAILURE',message:'isolated mobile fallback fixture'})
        }).catch(()=>{});
        return;
      }
      if(scenario.mode==='one'||scenario.mode==='multi'||scenario.mode==='inactive'||scenario.mode==='preload-fail'){
        const mode=scenario.mode==='preload-fail'?'one':scenario.mode;
        request.respond({
          status:200,
          contentType:'application/json',
          headers:{
            'access-control-allow-origin':'https://kinojo.info',
            'cache-control':'no-store',
            'etag':'W/"mobile-e2e-'+mode+'"'
          },
          body:JSON.stringify(manifest(mode))
        }).catch(()=>{});
        return;
      }
    }
    if(scenario.mode==='preload-fail'&&url.includes(SUMMER)){
      request.abort('failed').catch(()=>{});
      return;
    }
    request.continue().catch(()=>{});
  });
  return page;
}

async function waitBanner(page){
  await page.waitForSelector('#kinojo-main-banner-image',{timeout:15000});
  return page.evaluate(()=>{
    const image=document.querySelector('#kinojo-main-banner-image');
    const host=image?.closest('.mobile-og-banner');
    const rect=image?.getBoundingClientRect();
    const resources=performance.getEntriesByType('resource').map(entry=>entry.name);
    return {
      src:String(image?.currentSrc||image?.src||''),
      alt:String(image?.alt||''),
      href:String(host?.getAttribute('href')||''),
      complete:image?.complete===true,
      naturalWidth:Number(image?.naturalWidth||0),
      width:Number(rect?.width||0),
      height:Number(rect?.height||0),
      sideSlots:document.querySelectorAll('[data-kinojo-pc-banner]').length,
      sideResources:resources.filter(url=>/kinojo-pc-banners\.(?:js|css)/.test(url))
    };
  });
}

function assertVisibleBanner(state,label){
  assert.ok(state.src,label+' src');
  assert.ok(state.width>0&&state.height>0,label+' geometry '+state.width+'x'+state.height);
  assert.equal(state.sideSlots,0,label+' SIDE DOM');
  assert.deepEqual(state.sideResources,[],label+' SIDE resources');
}

async function resetAndMount(page){
  await page.evaluate(()=>{
    const image=document.querySelector('#kinojo-main-banner-image');
    const host=image?.closest('.mobile-og-banner');
    if(!image||!host||!window.KinojoBannerRuntime?.mountBanner)throw new Error('mobile banner runtime unavailable');
    const fallback={
      src:new URL('/assets/images/common/kinojo-og.jpg',location.href).href,
      alt:'KINOJO INFO 깡 레기온 대표 배너',
      href:'hof/',
      aria:'KINOJO INFO 대표 배너'
    };
    const restore=()=>{
      image.src=fallback.src;
      image.alt=fallback.alt;
      host.setAttribute('href',fallback.href);
      host.setAttribute('aria-label',fallback.aria);
    };
    restore();
    window.KinojoBannerRuntime.clearCache('HOME','MAIN');
    window.__mobileBannerController=window.KinojoBannerRuntime.mountBanner({
      pageCode:'HOME',slotCode:'MAIN',fallbackAlt:fallback.alt,
      ensureElements:()=>({host,image}),
      deactivate:restore,
      onError:error=>{window.__mobileBannerLastError=String(error?.code||error?.message||error)}
    });
  });
}

async function waitAlt(page,expected,timeout=6000){
  await page.waitForFunction(value=>document.querySelector('#kinojo-main-banner-image')?.alt===value,{timeout},expected);
}

(async()=>{
  const browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
  try{
    // 1) Real live mobile HOME + delayed Manifest: fallback must paint first, then settle to Server state.
    {
      const scenario={mode:'slow-live'};
      const page=await configurePage(browser,scenario);
      const response=await page.goto(MOBILE_URL,{waitUntil:'domcontentloaded',timeout:45000});
      assert.ok(response&&response.status()>=200&&response.status()<400,'slow-live HTTP '+response?.status());
      await page.waitForFunction(()=>{const i=document.querySelector('#kinojo-main-banner-image');return i?.complete&&i.naturalWidth>0},{timeout:5000});
      const first=await waitBanner(page);
      assertVisibleBanner(first,'slow first paint');
      assert.ok(isFallback(first.src),'slow first paint must keep kinojo-og fallback: '+first.src);
      await page.waitForFunction(()=>window.KinojoBannerRuntime?.peekManifest?.('HOME','MAIN')!==null,{timeout:15000});
      const liveManifest=await page.evaluate(()=>window.KinojoBannerRuntime.peekManifest('HOME','MAIN'));
      assert.equal(liveManifest?.pageCode,'HOME','slow live Manifest page');
      assert.equal(liveManifest?.slotCode,'MAIN','slow live Manifest slot');
      assert.equal(typeof liveManifest?.active,'boolean','slow live Manifest active');
      if(liveManifest.active){
        const expected=String(liveManifest.playlist?.[0]?.imageUrl||'');
        assert.ok(expected,'slow live active first image');
        await page.waitForFunction(url=>{
          const i=document.querySelector('#kinojo-main-banner-image');
          return String(i?.currentSrc||i?.src||'')===url;
        },{timeout:10000},expected);
        const settled=await waitBanner(page);
        assertVisibleBanner(settled,'slow active settled');
        assert.equal(settled.src,expected,'slow active DOM follows Server first playlist item');
        assert.ok(settled.complete&&settled.naturalWidth>0,'slow active settled image loaded');
        console.log('PASS mobile slow Manifest first-paint fallback -> active Server image '+settled.src);
      }else{
        await page.waitForFunction(()=>document.querySelector('#kinojo-main-banner-image')?.src.includes('/assets/images/common/kinojo-og.jpg'),{timeout:5000});
        const settled=await waitBanner(page);
        assertVisibleBanner(settled,'slow inactive settled');
        assert.ok(isFallback(settled.src),'slow inactive must keep fallback '+settled.src);
        assert.ok(settled.complete&&settled.naturalWidth>0,'slow inactive fallback loaded');
        console.log('PASS mobile slow Manifest first-paint fallback -> inactive Server fallback');
      }
      await page.close();
    }

    // 2) Initial Server failure: fallback remains visible and Browser does not invent schedule/random state.
    {
      const scenario={mode:'server-fail'};
      const page=await configurePage(browser,scenario);
      await page.goto(MOBILE_URL,{waitUntil:'domcontentloaded',timeout:45000});
      await sleep(1200);
      const state=await waitBanner(page);
      assertVisibleBanner(state,'server failure');
      assert.ok(isFallback(state.src),'server failure fallback '+state.src);
      assert.ok(state.complete&&state.naturalWidth>0,'server failure fallback loaded');
      console.log('PASS mobile Server failure keeps kinojo-og fallback');
      await page.close();
    }

    // 3) Active Manifest but first-image preload failure: fallback remains, never blank.
    {
      const scenario={mode:'preload-fail'};
      const page=await configurePage(browser,scenario);
      await page.goto(MOBILE_URL,{waitUntil:'domcontentloaded',timeout:45000});
      await sleep(1500);
      const state=await waitBanner(page);
      assertVisibleBanner(state,'preload failure');
      assert.ok(isFallback(state.src),'preload failure fallback '+state.src);
      assert.ok(state.complete&&state.naturalWidth>0,'preload failure fallback loaded');
      console.log('PASS mobile preload failure keeps fallback without blank');
      await page.close();
    }

    // 4) One-image active Manifest: install succeeds and no slideshow interval changes it.
    {
      const scenario={mode:'one'};
      const page=await configurePage(browser,scenario);
      await page.goto(MOBILE_URL,{waitUntil:'domcontentloaded',timeout:45000});
      await waitAlt(page,'Mobile E2E A');
      const installed=await waitBanner(page);
      assert.ok(isSummer(installed.src),'one-image active install '+installed.src);
      await sleep(3300);
      const later=await waitBanner(page);
      assert.equal(later.alt,'Mobile E2E A','one-image must not rotate');
      console.log('PASS mobile one-image active Manifest has no slideshow rotation');
      await page.close();
    }

    // 5) Active -> inactive on the same mounted controller must restore fallback.
    {
      const scenario={mode:'one'};
      const page=await configurePage(browser,scenario);
      await page.goto(MOBILE_URL,{waitUntil:'domcontentloaded',timeout:45000});
      await waitAlt(page,'Mobile E2E A');
      await resetAndMount(page);
      await waitAlt(page,'Mobile E2E A');
      scenario.mode='inactive';
      await page.evaluate(()=>window.__mobileBannerController.refresh());
      await page.waitForFunction(()=>document.querySelector('#kinojo-main-banner-image')?.src.includes('/assets/images/common/kinojo-og.jpg'),{timeout:5000});
      const state=await waitBanner(page);
      assertVisibleBanner(state,'active-inactive');
      assert.ok(isFallback(state.src),'active->inactive fallback '+state.src);
      console.log('PASS mobile active -> inactive restores fallback');
      await page.close();
    }

    // 6) Multiple images: Server playlist order is consumed sequentially.
    {
      const scenario={mode:'multi'};
      const page=await configurePage(browser,scenario);
      await page.goto(MOBILE_URL,{waitUntil:'domcontentloaded',timeout:45000});
      await waitAlt(page,'Mobile E2E A');
      await sleep(3300);
      await waitAlt(page,'Mobile E2E B');
      const state=await waitBanner(page);
      assert.ok(isFallback(state.src),'multi second playlist item '+state.src);
      console.log('PASS mobile multi-image playlist rotates in Server order');
      await page.close();
    }

    // 7) Reduced motion: playlist still advances, but runtime does not install opacity transition.
    {
      const scenario={mode:'multi'};
      const page=await configurePage(browser,scenario,{reducedMotion:true});
      await page.goto(MOBILE_URL,{waitUntil:'domcontentloaded',timeout:45000});
      await waitAlt(page,'Mobile E2E A');
      const reduced=await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
      assert.equal(reduced,true,'reduced-motion emulation');
      await sleep(3300);
      await waitAlt(page,'Mobile E2E B');
      const transition=await page.evaluate(()=>document.querySelector('#kinojo-main-banner-image')?.style.transition||'');
      assert.equal(/opacity/i.test(transition),false,'reduced motion opacity transition');
      console.log('PASS mobile prefers-reduced-motion advances without opacity transition');
      await page.close();
    }

    // 8) hidden/visible: hidden pauses rotation, visible resumes it.
    {
      const scenario={mode:'multi'};
      const page=await configurePage(browser,scenario);
      await page.goto(MOBILE_URL,{waitUntil:'domcontentloaded',timeout:45000});
      await waitAlt(page,'Mobile E2E A');
      await resetAndMount(page);
      await waitAlt(page,'Mobile E2E A');
      await page.evaluate(()=>{
        window.__mobileBannerHidden=true;
        Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__mobileBannerHidden});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await sleep(3300);
      assert.equal((await waitBanner(page)).alt,'Mobile E2E A','hidden must pause slideshow');
      await page.evaluate(()=>{window.__mobileBannerHidden=false;document.dispatchEvent(new Event('visibilitychange'))});
      await sleep(3300);
      await waitAlt(page,'Mobile E2E B');
      console.log('PASS mobile hidden pauses and visible resumes slideshow');
      await page.close();
    }

    console.log('KINOJO mobile MAIN live/fallback E2E: PASS');
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error?.stack||error);process.exit(1)});
