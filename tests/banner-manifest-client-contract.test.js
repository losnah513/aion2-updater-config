'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'ui/kinojo-banner-runtime.js'),'utf8');
const pcHome=fs.readFileSync(path.join(root,'home.html'),'utf8');
const mobileHome=fs.readFileSync(path.join(root,'m/index.html'),'utf8');

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
  assert.equal(/Date\.now|Math\.random|Asia\/Seoul|priority|weighted|scheduleMode/.test(source),false,'Browser runtime must not own schedule/priority/random decisions');
  assert.equal(/passKey|passCode|service_role/.test(source),false,'public runtime must not contain private credentials');
  assert.equal(/og:image|twitter:image/.test(source),false,'Banner runtime must not rewrite static SEO fallback metadata');

  const supabaseClientIndex=pcHome.indexOf('core/kinojo-supabase-client.js?cache=2026080205');
  const runtimeIndex=pcHome.indexOf('ui/kinojo-banner-runtime.js?cache=2026082301');
  const manifestCallIndex=pcHome.indexOf("runtime.fetchManifest('HOME', 'MAIN')");
  assert.ok(supabaseClientIndex>=0&&runtimeIndex>supabaseClientIndex&&manifestCallIndex>runtimeIndex,'PC HOME must load Supabase client, then Banner runtime, then request HOME:MAIN');
  assert.match(pcHome,/<a class="kinojo-main-banner" href="hof\/"/,'PC default banner link must remain HOF before a Server Manifest overrides it');
  assert.match(pcHome,/<img id="kinojo-main-banner-image" src="assets\/images\/common\/kinojo-og\.jpg\?cache=26062218" alt="KINOJO INFO 깡 레기온 대표 배너">/,'PC default visual fallback must remain kinojo-og.jpg with a non-empty alt');
  assert.match(pcHome,/<meta property="og:image" content="https:\/\/kinojo\.info\/assets\/images\/common\/kinojo-og\.jpg">/,'PC Open Graph fallback must stay on the static kinojo-og.jpg');
  assert.match(pcHome,/<meta property="og:image:width" content="1536">/);
  assert.match(pcHome,/<meta property="og:image:height" content="864">/);
  assert.match(pcHome,/<meta name="twitter:image" content="https:\/\/kinojo\.info\/assets\/images\/common\/kinojo-og\.jpg">/,'PC Twitter fallback must stay on the static kinojo-og.jpg');
  assert.match(pcHome,/manifest\?\.active !== true/,'inactive Manifest must leave current PC banner untouched');
  assert.match(pcHome,/manifest\.playlist\[0\]/,'6-나 must render only the first Server playlist item; rotation remains 8-마');
  assert.match(pcHome,/banner\.src = item\.imageUrl/);
  assert.match(pcHome,/banner\.alt = item\.alt \|\| 'KINOJO INFO 깡 레기온 대표 배너'/);
  assert.match(pcHome,/bannerLink\.setAttribute\('href', item\.clickUrl\)/);
  assert.match(pcHome,/bannerLink\.removeAttribute\('href'\)/,'Manifest item without clickUrl must not keep the legacy HOF click target');
  assert.match(pcHome,/kinojo_banner_summer\.png\?cache=2026080602/,'legacy summer fallback must remain until migration stage 9');
  assert.match(pcHome,/2026-08-31T23:59:59\.999\+09:00/,'legacy summer end schedule must remain until 9-다');
  assert.equal(/setInterval|setTimeout\([^)]*slide|transitionDurationMs/.test(pcHome),false,'6-나 must not implement slideshow timing/crossfade before 8-마');

  const mobileSupabaseClientIndex=mobileHome.indexOf('../core/kinojo-supabase-client.js?cache=2026080205');
  const mobileRuntimeIndex=mobileHome.indexOf('../ui/kinojo-banner-runtime.js?cache=2026082301');
  const mobileManifestCallIndex=mobileHome.indexOf("runtime.fetchManifest('HOME', 'MAIN')");
  assert.ok(mobileSupabaseClientIndex>=0&&mobileRuntimeIndex>mobileSupabaseClientIndex&&mobileManifestCallIndex>mobileRuntimeIndex,'mobile HOME must load Supabase client, then shared Banner runtime, then request HOME:MAIN');
  assert.match(mobileHome,/<a class="mobile-og-banner" href="hof\/"/,'mobile default banner link must remain HOF before a Server Manifest overrides it');
  assert.match(mobileHome,/<img id="kinojo-main-banner-image" src="\.\.\/assets\/images\/common\/kinojo-og\.jpg\?cache=26062218" alt="KINOJO INFO 깡 레기온 대표 배너">/,'mobile default visual fallback must remain kinojo-og.jpg with a non-empty alt');
  assert.match(mobileHome,/<meta property="og:image" content="https:\/\/kinojo\.info\/assets\/images\/common\/kinojo-og\.jpg">/,'mobile Open Graph fallback must use the same static kinojo-og.jpg');
  assert.match(mobileHome,/<meta property="og:image:width" content="1536">/);
  assert.match(mobileHome,/<meta property="og:image:height" content="864">/);
  assert.match(mobileHome,/<meta name="twitter:image" content="https:\/\/kinojo\.info\/assets\/images\/common\/kinojo-og\.jpg">/,'mobile Twitter fallback must use the same static kinojo-og.jpg');
  assert.match(mobileHome,/manifest\?\.active !== true/,'inactive Manifest must leave current mobile banner untouched');
  assert.match(mobileHome,/manifest\.playlist\[0\]/,'6-다 must render only the first Server playlist item; rotation remains 8-마');
  assert.match(mobileHome,/banner\.src = item\.imageUrl/);
  assert.match(mobileHome,/banner\.alt = item\.alt \|\| 'KINOJO INFO 깡 레기온 대표 배너'/);
  assert.match(mobileHome,/bannerLink\.setAttribute\('href', item\.clickUrl\)/);
  assert.match(mobileHome,/bannerLink\.removeAttribute\('href'\)/,'mobile Manifest item without clickUrl must not keep the legacy HOF click target');
  assert.match(mobileHome,/kinojo_banner_summer\.png\?cache=2026080602/,'mobile legacy summer fallback must remain until migration stage 9');
  assert.match(mobileHome,/2026-08-31T23:59:59\.999\+09:00/,'mobile legacy summer end schedule must remain until 9-다');
  assert.equal(/runtime\.fetchManifest\([^)]*,\s*'(?:LEFT|RIGHT)'/.test(mobileHome),false,'mobile HOME must not request SIDE banner slots');
  assert.equal(/setInterval|setTimeout\([^)]*slide|transitionDurationMs/.test(mobileHome),false,'6-다 must not implement slideshow timing/crossfade before 8-마');
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
    console.log('KINOJO banner Manifest live ETag/304: PASS');
    console.log('KINOJO MAIN fallback image/SEO contract live readback: PASS');
  }
})().catch(error=>{console.error(error);process.exit(1)});
