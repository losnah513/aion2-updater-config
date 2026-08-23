'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'ui/kinojo-banner-runtime.js'),'utf8');
const pcHome=fs.readFileSync(path.join(root,'home.html'),'utf8');
const mobileHome=fs.readFileSync(path.join(root,'m/index.html'),'utf8');
const pcBannerSource=fs.readFileSync(path.join(root,'ui/kinojo-pc-banners.js'),'utf8');
const pcBannerCss=fs.readFileSync(path.join(root,'ui/kinojo-pc-banners.css'),'utf8');

class MemoryStorage{constructor(){this.m=new Map()}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}}
const makeHeaders=obj=>new Headers(obj||{});
function manifest(extra={}){return Object.assign({
  ok:true,service:'kinojo-banner-media',apiVersion:'1.4',databaseContract:'388',contract:'banner-public-manifest-v1',manifestVersion:'m1',generatedAtKst:'2026-08-22T19:00:00+09:00',validUntil:'2026-08-22T19:05:00+09:00',pageCode:'HOME',slotCode:'MAIN',slotKey:'HOME:MAIN',active:true,reason:null,rotation:{slideIntervalMs:8000,transitionDurationMs:600},playlist:[{imageUrl:'https://kinojo.info/assets/images/common/kinojo-og.jpg',alt:'대표',clickUrl:'/hof/',weight:999,assetId:7}],campaignId:5,objectPath:'forbidden'
},extra)}
function jpegDimensions(bytes){
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(data.length<4||data[0]!==0xff||data[1]!==0xd8)return null;
  const sof=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  let offset=2;
  while(offset+3<data.length){
    if(data[offset]!==0xff){offset+=1;continue}
    while(offset<data.length&&data[offset]===0xff)offset+=1;
    if(offset>=data.length)break;
    const marker=data[offset++];
    if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    if(marker===0xda)break;
    if(offset+1>=data.length)break;
    const length=(data[offset]<<8)|data[offset+1];
    if(length<2||offset+length>data.length)break;
    if(sof.has(marker)&&length>=7){
      return{height:(data[offset+3]<<8)|data[offset+4],width:(data[offset+5]<<8)|data[offset+6]};
    }
    offset+=length;
  }
  return null;
}

function playbackElement(){
  return {
    style:{},attrs:{},
    setAttribute(k,v){this.attrs[k]=String(v);if(k==='src')this.src=String(v);if(k==='alt')this.alt=String(v)},
    removeAttribute(k){delete this.attrs[k]},
    getAttribute(k){return this.attrs[k]??null},
  };
}
function playbackManifest(items,{slide=3000,transition=600,validMs=600000}={}){
  return {
    ok:true,service:'kinojo-banner-media',apiVersion:'1.4',databaseContract:'388',contract:'banner-public-manifest-v1',
    manifestVersion:'playback-v1',generatedAtKst:'2035-01-01T12:00:00+09:00',validUntil:new Date(Date.now()+validMs).toISOString(),
    pageCode:'HOME',slotCode:'MAIN',slotKey:'HOME:MAIN',active:true,reason:null,
    rotation:{slideIntervalMs:slide,transitionDurationMs:transition},playlist:items,
  };
}
function playbackContext(raw,{reduced=false}={}){
  let nextTimer=1;
  const timers=new Map(),listeners=new Map(),preloadLog=[],session={};
  class FakeImage{
    constructor(){this.complete=false;this.naturalWidth=0;this.onload=null;this.onerror=null}
    set src(v){this._src=v;preloadLog.push(v);this.complete=true;this.naturalWidth=100;queueMicrotask(()=>this.onload?.())}
    get src(){return this._src}
  }
  const document={hidden:false,addEventListener(type,fn){listeners.set(type,fn)},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type)}};
  const window={
    sessionStorage:{getItem:k=>session[k]??null,setItem:(k,v)=>{session[k]=String(v)}},
    KinojoSupabaseClientCore:{async ensureConfig(){return{url:'https://example.supabase.co'}},headers(){return{}}},
    matchMedia:()=>({matches:reduced}),requestAnimationFrame:cb=>{cb();return 0},
    getComputedStyle:()=>({objectFit:'cover',objectPosition:'right center'}),
  };
  const headers={get(name){return String(name).toLowerCase()==='etag'?'W/"playback"':''}};
  const fakeFetch=async()=>({ok:true,status:200,headers,text:async()=>JSON.stringify(raw)});
  function fakeSetTimeout(fn,delay){const id=nextTimer++;timers.set(id,{fn,delay,active:true});return id}
  function fakeClearTimeout(id){const timer=timers.get(id);if(timer)timer.active=false}
  const context={window,document,Image:FakeImage,fetch:fakeFetch,console,URL,Date,JSON,Map,WeakMap,WeakSet,Promise,Number,String,Object,Array,RegExp,Error,setTimeout:fakeSetTimeout,clearTimeout:fakeClearTimeout,queueMicrotask};
  vm.runInNewContext(source,context,{filename:'ui/kinojo-banner-runtime.js'});
  return{runtime:window.KinojoBannerRuntime,document,listeners,timers,preloadLog};
}
async function playbackFlush(n=40){for(let i=0;i<n;i++)await Promise.resolve()}
function activePlaybackTimers(timers,delay){return[...timers.entries()].filter(([,timer])=>timer.active&&(delay===undefined||timer.delay===delay))}
async function firePlaybackTimer(timers,delay){const found=activePlaybackTimers(timers,delay)[0];assert.ok(found,`expected active timer ${delay}`);found[1].active=false;found[1].fn();await playbackFlush()}
async function verifyPlaybackRuntime(){
  assert.match(source,/prefers-reduced-motion:\s*reduce/);
  assert.match(source,/visibilitychange/);
  assert.match(source,/preloadImage\(next\.playlist\[0\]\.imageUrl\)/);
  const A={imageUrl:'https://kinojo.info/assets/images/a.jpg',alt:'A',clickUrl:'/a'};
  const B={imageUrl:'https://kinojo.info/assets/images/b.jpg',alt:'B',clickUrl:'/b'};
  const C={imageUrl:'https://kinojo.info/assets/images/c.jpg',alt:'C',clickUrl:null};
  {
    const env=playbackContext(playbackManifest([A,B,C])),host=playbackElement(),image=playbackElement();
    const controller=env.runtime.mountBanner({pageCode:'HOME',slotCode:'MAIN',ensureElements:()=>({host,image}),fallbackAlt:'fallback'});
    await playbackFlush();
    assert.equal(image.src,A.imageUrl,'first Server playlist item should render after preload');
    assert.equal(host.attrs.href,'/a');
    assert.deepEqual(env.preloadLog.slice(0,2),[A.imageUrl,B.imageUrl],'player should preload only current and next image');
    assert.equal(activePlaybackTimers(env.timers,3000).length,1,'slide interval must come from Server rotation');
    await firePlaybackTimer(env.timers,3000);
    assert.equal(host.style.backgroundImage,`url(${JSON.stringify(B.imageUrl)})`,'next preloaded image should sit below current image during crossfade');
    assert.equal(image.style.opacity,'0');
    assert.equal(activePlaybackTimers(env.timers,600).length,1,'transition duration must come from Server rotation');
    await firePlaybackTimer(env.timers,600);
    assert.equal(image.src,B.imageUrl,'player must consume Server playlist in order');
    assert.equal(host.attrs.href,'/b');
    assert.equal(host.style.backgroundImage,undefined,'transient crossfade background must be restored');
    assert.equal(controller.getState().index,1);
    assert.ok(env.preloadLog.includes(C.imageUrl),'following image must preload after transition');
    env.document.hidden=true;env.listeners.get('visibilitychange')();
    assert.equal(activePlaybackTimers(env.timers,3000).length,0,'background tab must pause slide timer');
    env.document.hidden=false;env.listeners.get('visibilitychange')();
    assert.equal(controller.getState().index,1,'visibility restore must preserve current playlist index');
    assert.equal(activePlaybackTimers(env.timers,3000).length,1,'visible tab must resume slide timer');
    controller.stop();
  }
  {
    const env=playbackContext(playbackManifest([A,B],{transition:900}),{reduced:true}),host=playbackElement(),image=playbackElement();
    env.runtime.mountBanner({pageCode:'HOME',slotCode:'MAIN',ensureElements:()=>({host,image})});await playbackFlush();await firePlaybackTimer(env.timers,3000);
    assert.equal(image.src,B.imageUrl,'reduced motion should switch immediately after preload');
    assert.equal(activePlaybackTimers(env.timers,900).length,0,'reduced motion must skip fade wait');
    assert.equal(host.style.backgroundImage,undefined,'reduced motion must skip crossfade background');
  }
  {
    const env=playbackContext(playbackManifest([A])),host=playbackElement(),image=playbackElement();
    env.runtime.mountBanner({pageCode:'HOME',slotCode:'MAIN',ensureElements:()=>({host,image})});await playbackFlush();
    assert.equal(image.src,A.imageUrl);assert.equal(activePlaybackTimers(env.timers,3000).length,0,'single-image playlist must not run slide timer');
  }
  console.log('KINOJO banner playback preload/crossfade/visibility/reduced-motion contract: PASS');
}


(async()=>{
  const calls=[];let mode='fresh';let delayResolve=null;
  const cfg={url:'https://josvoltpktvwysrasffq.supabase.co',publishableKey:'sb_publishable_test'};
  const fakeFetch=async(url,options)=>{
    calls.push({url,options});
    if(mode==='fresh')return new Response(JSON.stringify(manifest()),{status:200,headers:makeHeaders({etag:'W/"kbm-1.4-m1"','x-kinojo-request-id':'req-1'})});
    if(mode==='not-modified')return new Response(null,{status:304,headers:makeHeaders({etag:'W/"kbm-1.4-m1"','x-kinojo-request-id':'req-2'})});
    if(mode==='server-error')return new Response(JSON.stringify({ok:false,code:'BANNER_SERVER_ERROR',message:'fail'}),{status:500,headers:makeHeaders()});
    if(mode==='delayed')return await new Promise(resolve=>{delayResolve=()=>resolve(new Response(JSON.stringify(manifest({manifestVersion:'m2'})),{status:200,headers:makeHeaders({etag:'W/"kbm-1.4-m2"'})}))});
    throw new Error('unexpected fetch mode');
  };
  const context={window:{sessionStorage:new MemoryStorage(),KinojoSupabaseClientCore:{async ensureConfig(){return cfg},headers(c){return{apikey:c.publishableKey,Authorization:'Bearer '+c.publishableKey,'content-type':'application/json'}}}},fetch:fakeFetch,URL,Headers,Response,AbortController,console,setTimeout,clearTimeout,JSON,Map,Promise,Error,Object,Array,Number,String,RegExp};
  vm.runInNewContext(source,context,{filename:'ui/kinojo-banner-runtime.js'});
  const api=context.window.KinojoBannerRuntime;
  assert.equal(api.contract,'banner-public-manifest-v1');
  const first=await api.fetchManifest('home','main');
  assert.equal(calls.length,1);assert.match(calls[0].url,/pageCode=HOME/);assert.match(calls[0].url,/slotCode=MAIN/);
  assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.cache,'no-cache');assert.equal(calls[0].options.body,undefined);
  assert.equal(calls[0].options.headers.Authorization,'Bearer sb_publishable_test');assert.equal(calls[0].options.headers['If-None-Match'],undefined);
  assert.equal(first.active,true);assert.deepEqual(first.playlist,[{imageUrl:'https://kinojo.info/assets/images/common/kinojo-og.jpg',alt:'대표',clickUrl:'/hof/'}]);
  assert.equal(first.campaignId,undefined);assert.equal(first.objectPath,undefined);assert.equal(first.playlist[0].weight,undefined);assert.equal(first.playlist[0].assetId,undefined);
  assert.equal(api.getMeta('HOME','MAIN').disposition,'fresh');

  mode='not-modified';const second=await api.fetchManifest('HOME','MAIN');
  assert.equal(calls.length,2);assert.equal(calls[1].options.headers['If-None-Match'],'W/"kbm-1.4-m1"');assert.deepEqual(second,first);assert.equal(api.getMeta('HOME','MAIN').httpStatus,304);

  mode='server-error';await assert.rejects(()=>api.fetchManifest('HOME','MAIN'),e=>e.code==='BANNER_SERVER_ERROR'&&e.status===500);
  assert.deepEqual(api.peekManifest('HOME','MAIN'),first,'error must not overwrite the last validated cache');

  api.clearCache('HOME','MAIN');mode='delayed';const a=api.fetchManifest('HOME','MAIN'),b=api.fetchManifest('HOME','MAIN');
  assert.equal(a,b,'same target requests must share one in-flight promise');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls.length,4);delayResolve();await a;
  assert.equal(calls.length,4,'dedupe must avoid a second network call');

  assert.throws(()=>api.fetchManifest('bad page','MAIN'),e=>e.code==='BANNER_MANIFEST_TARGET_INVALID');
  assert.equal(/Math\.random|Asia\/Seoul|priority|weighted|scheduleMode/.test(source),false,'Browser runtime must not own schedule/priority/random decisions');
  assert.match(source,/Date\.now\(\)>=Date\.parse\(value\?\.validUntil/,'Browser time may only trigger Manifest validity revalidation');
  assert.equal(/Date\.parse\([^)]*generatedAtKst/.test(source),false,'Browser must not derive publication state from Server KST metadata');
  assert.equal(/passKey|passCode|service_role/.test(source),false,'public runtime must not contain private credentials');
  await verifyPlaybackRuntime();

  assert.match(pcBannerSource,/runtime\.mountBanner\(\{/,'8-마 common PC renderer must mount the shared Banner player');
  assert.match(pcBannerSource,/if\(path==='\/'\|\|path==='\/home\.html\/'\)return 'HOME'/,'HOME route mapping must be explicit');
  for(const code of ['HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE'])assert.ok(pcBannerSource.includes("return '"+code+"'"),'missing PC side page mapping '+code);
  assert.equal(/Date\.now|Math\.random|Asia\/Seoul|priority|weighted|scheduleMode/.test(pcBannerSource),false,'PC side mapping must not own Server schedule/priority/random decisions');
  assert.equal(pcBannerSource.includes('innerHTML'),false,'PC side banner renderer must use DOM construction instead of HTML injection');
  assert.match(pcBannerSource,/Object\.freeze\(\{refresh,render,clear,resolvePageCode,resolveSlotCode\}\)/,'common PC side banner renderer must expose renderer and canonical mapping helpers');
  assert.match(pcBannerCss,/\.kinojo-pc-banner-media,[\s\S]*\.kinojo-pc-banner-image\{[\s\S]*width:100%;[\s\S]*height:100%;/,'rendered media must fill the existing 300×715 slot');
  assert.match(pcBannerCss,/\.kinojo-pc-banner-image\{[\s\S]*object-fit:cover;/,'side banner image must preserve the validated 300:715 media ratio');

  class FakeClassList{constructor(values=[]){this.values=new Set(values)}contains(value){return this.values.has(value)}}
  class FakeElement{
    constructor(tagName='div',classes=[]){
      this.tagName=String(tagName).toUpperCase();this.classList=new FakeClassList(classes);this.dataset={};this.style={};this.attributes=new Map();this.children=[];this.textContent='';this.className='';
      this.rect={left:0,right:300,top:100,width:300,height:715};this.host=null;
    }
    closest(selector){return selector==='.kinojo-pc-banner-host'?this.host:null}
    getBoundingClientRect(){return this.rect}
    setAttribute(name,value){this.attributes.set(name,String(value))}
    getAttribute(name){return this.attributes.has(name)?this.attributes.get(name):null}
    removeAttribute(name){this.attributes.delete(name)}
    appendChild(child){this.children.push(child);return child}
    replaceChildren(...children){this.children=[...children];this.textContent=''}
  }
  const fakeHost=new FakeElement('main',['kinojo-pc-banner-host']);fakeHost.rect={left:400,right:1000,top:100,width:600,height:900};
  const fakeSlot=new FakeElement('aside',['kinojo-pc-banner-slot','is-left']);fakeSlot.host=fakeHost;fakeSlot.setAttribute('aria-hidden','true');
  let renderedSlots=[];
  const pcBannerContext={
    window:{scrollY:0,innerHeight:900,location:{pathname:'/unsupported/'},getComputedStyle(){return{display:'grid'}},addEventListener(){}},
    document:{readyState:'complete',currentScript:null,documentElement:{appendChild(){}},head:{appendChild(){}},querySelectorAll(){return renderedSlots},createElement(tag){return new FakeElement(tag)},addEventListener(){}},
    WeakSet,Map,Promise,URL,Object,String,Math,console,
  };
  vm.runInNewContext(pcBannerSource,pcBannerContext,{filename:'ui/kinojo-pc-banners.js'});
  const pcBannerApi=pcBannerContext.window.KinojoPcBanners;
  assert.equal(pcBannerApi.render(fakeSlot,{imageUrl:'https://kinojo.info/assets/images/common/kinojo-og.jpg',alt:'사이드 배너',clickUrl:'/hof/'}),true);
  assert.equal(fakeSlot.dataset.kinojoPcBannerState,'rendered');
  assert.equal(fakeSlot.getAttribute('aria-hidden'),null,'rendered banner must be exposed to accessibility tree');
  assert.equal(fakeSlot.children.length,1);assert.equal(fakeSlot.children[0].tagName,'A');assert.equal(fakeSlot.children[0].getAttribute('href'),'/hof/');
  assert.equal(fakeSlot.children[0].children[0].tagName,'IMG');assert.equal(fakeSlot.children[0].children[0].getAttribute('alt'),'사이드 배너');
  assert.equal(fakeSlot.textContent,'','geometry refresh must not overwrite rendered media with the old size label');
  renderedSlots=[fakeSlot];pcBannerApi.refresh();assert.equal(fakeSlot.children[0].tagName,'A','refresh must preserve rendered media');
  assert.equal(pcBannerApi.clear(fakeSlot),true);assert.equal(fakeSlot.dataset.kinojoPcBannerState,'empty');assert.equal(fakeSlot.getAttribute('aria-hidden'),'true');
  assert.equal(fakeSlot.children.length,0);assert.equal(fakeSlot.textContent,'300 × 715','clear must restore the existing empty slot label');
  assert.equal(pcBannerApi.render(fakeSlot,{imageUrl:'https://kinojo.info/assets/images/common/kinojo-og.jpg',alt:'',clickUrl:null}),true);
  assert.equal(fakeSlot.children[0].tagName,'A','stable SIDE player host remains an anchor element');
  assert.equal(fakeSlot.children[0].getAttribute('href'),null,'image without clickUrl must not expose a clickable href');
  assert.equal(fakeSlot.children[0].children[0].getAttribute('alt'),'KINOJO 사이드 배너','blank alt must receive a safe visible-content fallback');
  for(const [route,code] of [['/','HOME'],['/index.html','HOME'],['/home.html','HOME'],['/hof/','HOF'],['/ranking/index.html','RANKING'],['/legion-tree/','LEGION_TREE'],['/meter/','METER'],['/sanctuary/','SANCTUARY'],['/sanctuary-schedule/index.html','SANCTUARY_SCHEDULE']])assert.equal(pcBannerApi.resolvePageCode(route),code,route+' page mapping mismatch');
  assert.equal(pcBannerApi.resolvePageCode('/m/'),'','mobile HOME must never map to a PC SIDE target');
  assert.equal(pcBannerApi.resolvePageCode('/m/hof/'),'','mobile subpages must never map to PC SIDE targets');
  assert.equal(pcBannerApi.resolveSlotCode(fakeSlot),'LEFT');
  const fakeRightSlot=new FakeElement('aside',['kinojo-pc-banner-slot','is-right']);fakeRightSlot.host=fakeHost;fakeRightSlot.setAttribute('aria-hidden','true');
  assert.equal(pcBannerApi.resolveSlotCode(fakeRightSlot),'RIGHT');

  const sideCalls=[];
  pcBannerContext.window.KinojoBannerRuntime={mountBanner(options){
    sideCalls.push(options.pageCode+':'+options.slotCode);
    if(options.slotCode==='RIGHT'){options.deactivate?.();return{stop(){}}}
    const elements=options.ensureElements?.();
    elements?.image?.setAttribute('src','https://kinojo.info/assets/images/common/kinojo-og.jpg');
    elements?.image?.setAttribute('alt',options.pageCode+' '+options.slotCode);
    elements?.host?.removeAttribute('href');
    return{stop(){}};
  }};
  pcBannerContext.window.location.pathname='/ranking/';
  pcBannerApi.clear(fakeSlot);pcBannerApi.clear(fakeRightSlot);renderedSlots=[fakeSlot,fakeRightSlot];pcBannerApi.refresh();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(sideCalls.sort(),['RANKING:LEFT','RANKING:RIGHT'],'mapped PC page must request only its supported LEFT/RIGHT targets once each');
  assert.equal(fakeSlot.dataset.kinojoPcBannerTarget,'RANKING:LEFT');assert.equal(fakeSlot.dataset.kinojoPcBannerState,'rendered');
  assert.equal(fakeRightSlot.dataset.kinojoPcBannerTarget,'RANKING:RIGHT');assert.equal(fakeRightSlot.dataset.kinojoPcBannerState,'empty');
  renderedSlots=[fakeSlot];pcBannerApi.refresh();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(sideCalls.length,2,'repeated refresh must not repeat the same target network request');

  const loaderHost=new FakeElement('main',['kinojo-pc-banner-host']);loaderHost.rect=fakeHost.rect;
  const loaderSlot=new FakeElement('aside',['kinojo-pc-banner-slot','is-left']);loaderSlot.host=loaderHost;loaderSlot.setAttribute('aria-hidden','true');
  const loadedScripts=[];const loaderCalls=[];let loaderContext=null;
  loaderContext={
    window:{scrollY:0,innerHeight:900,location:{pathname:'/meter/'},getComputedStyle(){return{display:'grid'}},addEventListener(){}},
    document:{
      readyState:'complete',currentScript:{src:'https://kinojo.info/ui/kinojo-pc-banners.js?cache=2026082303'},documentElement:{appendChild(){}},
      head:{appendChild(script){loadedScripts.push(script.src);loaderContext.window.KinojoBannerRuntime={mountBanner(options){loaderCalls.push(options.pageCode+':'+options.slotCode);options.deactivate?.();return{stop(){}}}};script.onload?.();return script}},
      querySelectorAll(){return[loaderSlot]},createElement(tag){return new FakeElement(tag)},addEventListener(){},
    },
    WeakSet,Map,Promise,URL,Object,String,Math,console,
  };
  vm.runInNewContext(pcBannerSource,loaderContext,{filename:'ui/kinojo-pc-banners.js'});await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(loadedScripts,['https://kinojo.info/ui/kinojo-banner-runtime.js?cache=2026082302'],'PC pages without a static runtime tag must load the shared Manifest client from the same /ui/ base');
  assert.deepEqual(loaderCalls,['METER:LEFT'],'dynamically loaded shared runtime must receive the canonical page/slot target');
  assert.equal(loaderSlot.dataset.kinojoPcBannerState,'empty','inactive SIDE Manifest must keep the existing empty slot');
  assert.equal(/og:image|twitter:image/.test(source),false,'Banner runtime must not rewrite static SEO fallback metadata');

  const supabaseClientIndex=pcHome.indexOf('core/kinojo-supabase-client.js?cache=2026080205');
  const runtimeIndex=pcHome.indexOf('ui/kinojo-banner-runtime.js?cache=2026082302');
  const manifestCallIndex=pcHome.indexOf('runtime.mountBanner({');
  assert.ok(supabaseClientIndex>=0&&runtimeIndex>supabaseClientIndex&&manifestCallIndex>runtimeIndex,'PC HOME must load Supabase client, then Banner runtime, then mount HOME:MAIN playback');
  assert.match(pcHome,/<a class="kinojo-main-banner" href="hof\/"/,'PC default banner link must remain HOF before a Server Manifest overrides it');
  assert.match(pcHome,/<img id="kinojo-main-banner-image" src="assets\/images\/common\/kinojo-og\.jpg\?cache=26062218" alt="KINOJO INFO 깡 레기온 대표 배너">/,'PC default visual fallback must remain kinojo-og.jpg with a non-empty alt');
  assert.match(pcHome,/<meta property="og:image" content="https:\/\/kinojo\.info\/assets\/images\/common\/kinojo-og\.jpg">/,'PC Open Graph fallback must stay on the static kinojo-og.jpg');
  assert.match(pcHome,/<meta property="og:image:width" content="1536">/);
  assert.match(pcHome,/<meta property="og:image:height" content="864">/);
  assert.match(pcHome,/<meta name="twitter:image" content="https:\/\/kinojo\.info\/assets\/images\/common\/kinojo-og\.jpg">/,'PC Twitter fallback must stay on the static kinojo-og.jpg');
  assert.match(pcHome,/runtime\.mountBanner\(\{/,'8-마 PC HOME must use the shared playback runtime');
  assert.match(pcHome,/pageCode: 'HOME'/);assert.match(pcHome,/slotCode: 'MAIN'/);
  assert.match(pcHome,/deactivate: restoreFallback/,'inactive/error Manifest must restore the current PC fallback');
  assert.match(pcHome,/ensureElements: \(\) => \(\{ host: bannerLink, image: banner \}\)/);
  assert.equal(/kinojo_banner_summer\.png|2026-08-31T23:59:59\.999\+09:00|summerBannerEndsAt|Date\.now\(\)\s*<=/.test(pcHome),false,'9-다 PC HOME must not own the migrated summer schedule or image selection');
  assert.equal(/runtime\.fetchManifest\(/.test(pcHome),false,'PC HOME must not implement a page-specific Manifest player');

  const mobileSupabaseClientIndex=mobileHome.indexOf('../core/kinojo-supabase-client.js?cache=2026080205');
  const mobileRuntimeIndex=mobileHome.indexOf('../ui/kinojo-banner-runtime.js?cache=2026082302');
  const mobileManifestCallIndex=mobileHome.indexOf('runtime.mountBanner({');
  assert.ok(mobileSupabaseClientIndex>=0&&mobileRuntimeIndex>mobileSupabaseClientIndex&&mobileManifestCallIndex>mobileRuntimeIndex,'mobile HOME must load Supabase client, then shared Banner runtime, then mount HOME:MAIN playback');
  assert.match(mobileHome,/<a class="mobile-og-banner" href="hof\/"/,'mobile default banner link must remain HOF before a Server Manifest overrides it');
  assert.match(mobileHome,/<img id="kinojo-main-banner-image" src="\.\.\/assets\/images\/common\/kinojo-og\.jpg\?cache=26062218" alt="KINOJO INFO 깡 레기온 대표 배너">/,'mobile default visual fallback must remain kinojo-og.jpg with a non-empty alt');
  assert.match(mobileHome,/<meta property="og:image" content="https:\/\/kinojo\.info\/assets\/images\/common\/kinojo-og\.jpg">/,'mobile Open Graph fallback must use the same static kinojo-og.jpg');
  assert.match(mobileHome,/<meta property="og:image:width" content="1536">/);
  assert.match(mobileHome,/<meta property="og:image:height" content="864">/);
  assert.match(mobileHome,/<meta name="twitter:image" content="https:\/\/kinojo\.info\/assets\/images\/common\/kinojo-og\.jpg">/,'mobile Twitter fallback must use the same static kinojo-og.jpg');
  assert.match(mobileHome,/runtime\.mountBanner\(\{/,'8-마 mobile HOME must use the shared playback runtime');
  assert.match(mobileHome,/pageCode: 'HOME'/);assert.match(mobileHome,/slotCode: 'MAIN'/);
  assert.match(mobileHome,/deactivate: restoreFallback/,'inactive/error Manifest must restore the current mobile fallback');
  assert.match(mobileHome,/ensureElements: \(\) => \(\{ host: bannerLink, image: banner \}\)/);
  assert.equal(/kinojo_banner_summer\.png|2026-08-31T23:59:59\.999\+09:00|summerBannerEndsAt|Date\.now\(\)\s*<=/.test(mobileHome),false,'9-다 mobile HOME must not own the migrated summer schedule or image selection');
  assert.equal(/runtime\.fetchManifest\([^)]*,\s*'(?:LEFT|RIGHT)'/.test(mobileHome),false,'mobile HOME must not request SIDE banner slots');
  assert.equal(/runtime\.fetchManifest\(/.test(mobileHome),false,'mobile HOME must not implement a page-specific Manifest player');
  console.log('KINOJO PC/Mobile HOME Banner Manifest connection: PASS');
  console.log('KINOJO banner Manifest client contract: PASS');

  if(process.env.KINOJO_BANNER_LIVE==='1'){
    const config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8')).supabase;
    const liveContext={window:{sessionStorage:new MemoryStorage(),KinojoSupabaseClientCore:{async ensureConfig(){return{url:config.url,publishableKey:config.publishableKey}},headers(c){return{apikey:c.publishableKey,Authorization:'Bearer '+c.publishableKey,'content-type':'application/json'}}}},fetch:(url,options={})=>fetch(url,{...options,headers:{...options.headers,Origin:'https://kinojo.info'}}),URL,Headers,Response,AbortController,console,setTimeout,clearTimeout,JSON,Map,Promise,Error,Object,Array,Number,String,RegExp};
    vm.runInNewContext(source,liveContext,{filename:'ui/kinojo-banner-runtime.js'});
    const live=liveContext.window.KinojoBannerRuntime;
    const one=await live.fetchManifest('HOME','MAIN');
    const two=await live.fetchManifest('HOME','MAIN');
    assert.equal(one.contract,'banner-public-manifest-v1');assert.equal(one.pageCode,'HOME');assert.equal(one.slotCode,'MAIN');assert.deepEqual(two,one);
    assert.equal(live.getMeta('HOME','MAIN').httpStatus,304,'second live request must revalidate with ETag/304');

    const liveSideTargets=[
      ['HOME','LEFT'],['HOME','RIGHT'],['HOF','LEFT'],
      ['RANKING','LEFT'],['RANKING','RIGHT'],['LEGION_TREE','LEFT'],['LEGION_TREE','RIGHT'],
      ['METER','LEFT'],['METER','RIGHT'],['SANCTUARY','LEFT'],['SANCTUARY','RIGHT'],
      ['SANCTUARY_SCHEDULE','LEFT'],['SANCTUARY_SCHEDULE','RIGHT'],
    ];
    for(const [pageCode,slotCode] of liveSideTargets){
      const side=await live.fetchManifest(pageCode,slotCode);
      assert.equal(side.contract,'banner-public-manifest-v1');assert.equal(side.pageCode,pageCode);assert.equal(side.slotCode,slotCode);
    }

    const fallbackUrl='https://kinojo.info/assets/images/common/kinojo-og.jpg';
    let fallbackResponse=null;let fallbackError=null;
    for(let attempt=1;attempt<=3;attempt+=1){
      try{
        const candidate=await fetch(`${fallbackUrl}?verify=6d-${Date.now()}-${attempt}`,{headers:{'Cache-Control':'no-cache'}});
        if(candidate.ok){fallbackResponse=candidate;break}
        fallbackError=new Error(`fallback image HTTP ${candidate.status}`);
      }catch(error){fallbackError=error}
      if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*500));
    }
    if(!fallbackResponse)throw fallbackError||new Error('fallback image readback failed');
    assert.equal(fallbackResponse.status,200,'static SEO/default fallback image must be publicly readable');
    assert.match(String(fallbackResponse.headers.get('content-type')||''),/^image\/jpeg(?:;|$)/i,'static fallback must remain JPEG');
    const fallbackBytes=new Uint8Array(await fallbackResponse.arrayBuffer());
    assert.ok(fallbackBytes.length>0&&fallbackBytes[0]===0xff&&fallbackBytes[1]===0xd8,'static fallback must have a JPEG signature');
    assert.deepEqual(jpegDimensions(fallbackBytes),{width:1536,height:864},'static fallback dimensions must match the declared 16:9 SEO metadata');
    console.log('KINOJO banner Manifest live ETag/304 + PC SIDE target matrix: PASS');
    console.log('KINOJO MAIN fallback image/SEO contract live readback: PASS');
  }
})().catch(error=>{console.error(error);process.exit(1)});
