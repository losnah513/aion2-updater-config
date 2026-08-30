/* KINOJO public Banner Manifest client v2026083001 */
(function(){
  'use strict';

  const EDGE='kinojo-banner-media';
  const CONTRACT='banner-public-manifest-v1';
  const CACHE_KEY='kinojo_banner_manifest_cache_v1';
  const PAGE_RE=/^(HOME|HOF|RANKING|LEGION_TREE|METER|SANCTUARY|SANCTUARY_SCHEDULE)$/;
  const SLOT_RE=/^(MAIN|LEFT|RIGHT)$/;
  const STATIC_RE=/^https:\/\/kinojo\.info\/assets\/images\/[A-Za-z0-9._\/-]+$/;
  const DELIVERY_ALIASES=Object.freeze({
    'https://kinojo.info/assets/images/common/kinojo_banner_summer.png':'https://kinojo.info/assets/images/common/kinojo_banner_summer.webp'
  });
  const memory=new Map();
  const inflight=new Map();
  const meta=new Map();
  const preloads=new Map();
  const players=new Map();

  const text=(value,max=500)=>String(value??'').trim().slice(0,max);
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const deliveryImageUrl=value=>DELIVERY_ALIASES[text(value,3000)]||text(value,3000);

  function core(){
    const value=window.KinojoSupabaseClientCore;
    if(!value?.ensureConfig||!value?.headers)throw new Error('BANNER_CLIENT_CORE_REQUIRED');
    return value;
  }

  function target(pageCode,slotCode){
    const page=text(pageCode,40).toUpperCase();
    const slot=text(slotCode,20).toUpperCase();
    if(!PAGE_RE.test(page)||!SLOT_RE.test(slot)){
      const error=new Error('배너 Manifest 대상이 올바르지 않습니다.');
      error.code='BANNER_MANIFEST_TARGET_INVALID';
      throw error;
    }
    return{page,slot,key:`${page}:${slot}`};
  }

  function storage(){try{return window.sessionStorage||null}catch(_error){return null}}
  function loadStored(){
    const store=storage();if(!store)return{};
    try{const value=JSON.parse(store.getItem(CACHE_KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch(_error){return{}}
  }
  function saveStored(entries){const store=storage();if(!store)return;try{store.setItem(CACHE_KEY,JSON.stringify(entries))}catch(_error){}}
  function cached(key){
    if(memory.has(key))return memory.get(key);
    const entry=loadStored()[key];
    if(!entry||typeof entry!=='object'||typeof entry.etag!=='string'||!entry.manifest)return null;
    memory.set(key,entry);return entry;
  }
  function putCache(key,etag,manifest){
    const entry={etag:text(etag,300),manifest:clone(manifest)};
    memory.set(key,entry);
    const entries=loadStored();entries[key]=entry;
    const keys=Object.keys(entries);for(const old of keys.slice(0,Math.max(0,keys.length-20)))delete entries[old];
    saveStored(entries);
  }
  function clearCache(pageCode,slotCode){
    if(pageCode===undefined){memory.clear();meta.clear();saveStored({});return}
    const t=target(pageCode,slotCode),entries=loadStored();
    memory.delete(t.key);meta.delete(t.key);delete entries[t.key];saveStored(entries);
  }

  function safeClick(value){const v=text(value,2048);return !v?null:(/^https:\/\//i.test(v)||(v.startsWith('/')&&!v.startsWith('//'))?v:null)}
  function safeImage(value,cfg){
    const v=text(value,3000);if(!v)return'';
    if(STATIC_RE.test(v)&&!v.includes('..'))return v;
    let projectOrigin='';try{projectOrigin=new URL(cfg.url).origin}catch(_error){return''}
    const prefix=`${projectOrigin}/storage/v1/object/public/kinojo-site-banners/`;
    if(!v.startsWith(prefix))return'';
    const path=v.slice(prefix.length);
    if(path.includes('..')||!/^[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i.test(path))return'';
    return v;
  }
  function invalid(code){const error=new Error('배너 Manifest 응답 계약이 올바르지 않습니다.');error.code=code;return error}
  function sanitize(raw,cfg,t){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.ok!==true||raw.contract!==CONTRACT)throw invalid('BANNER_MANIFEST_CONTRACT_INVALID');
    const page=text(raw.pageCode,40).toUpperCase(),slot=text(raw.slotCode,20).toUpperCase();
    if(page!==t.page||slot!==t.slot||text(raw.slotKey,80)!==t.key)throw invalid('BANNER_MANIFEST_TARGET_MISMATCH');
    if(typeof raw.active!=='boolean'||!Array.isArray(raw.playlist))throw invalid('BANNER_MANIFEST_SHAPE_INVALID');
    const playlist=[];
    for(const item of raw.playlist){
      if(!item||typeof item!=='object'||Array.isArray(item))throw invalid('BANNER_MANIFEST_ITEM_INVALID');
      const imageUrl=safeImage(item.imageUrl,cfg);if(!imageUrl)throw invalid('BANNER_MANIFEST_IMAGE_URL_INVALID');
      const clickUrl=safeClick(item.clickUrl);if(item.clickUrl&&clickUrl===null)throw invalid('BANNER_MANIFEST_CLICK_URL_INVALID');
      playlist.push({imageUrl,alt:text(item.alt,300),clickUrl});
    }
    let rotation=null;
    if(raw.rotation!==null&&raw.rotation!==undefined){
      const slide=Number(raw.rotation?.slideIntervalMs),transition=Number(raw.rotation?.transitionDurationMs);
      if(!Number.isInteger(slide)||slide<3000||slide>60000||!Number.isInteger(transition)||transition<0||transition>5000)throw invalid('BANNER_MANIFEST_ROTATION_INVALID');
      rotation={slideIntervalMs:slide,transitionDurationMs:transition};
    }
    if(raw.active===true&&(!playlist.length||rotation===null))throw invalid('BANNER_MANIFEST_ACTIVE_STATE_INVALID');
    const validUntil=text(raw.validUntil,60);
    if(!Number.isFinite(Date.parse(validUntil)))throw invalid('BANNER_MANIFEST_VALID_UNTIL_INVALID');
    return{ok:true,service:text(raw.service,80),apiVersion:text(raw.apiVersion,40),databaseContract:text(raw.databaseContract,40),contract:CONTRACT,
      manifestVersion:text(raw.manifestVersion,80),generatedAtKst:text(raw.generatedAtKst,60),validUntil,
      pageCode:page,slotCode:slot,slotKey:t.key,active:raw.active,reason:raw.active?null:text(raw.reason,100)||null,
      rotation:raw.active?rotation:null,playlist:raw.active?playlist:[]};
  }

  async function request(t,options){
    const c=core(),cfg=await c.ensureConfig(),entry=options?.force?null:cached(t.key);
    const url=new URL(`${cfg.url}/functions/v1/${EDGE}`);url.searchParams.set('pageCode',t.page);url.searchParams.set('slotCode',t.slot);
    const headers=Object.assign({},c.headers(cfg),{accept:'application/json'});if(entry?.etag)headers['If-None-Match']=entry.etag;
    let response;
    try{response=await fetch(url.toString(),{method:'GET',headers,cache:'no-cache',signal:options?.signal})}catch(cause){const error=new Error('배너 Manifest를 불러오지 못했습니다.');error.code='BANNER_MANIFEST_NETWORK_ERROR';error.cause=cause;throw error}
    if(response.status===304){
      if(!entry?.manifest)throw invalid('BANNER_MANIFEST_304_WITHOUT_CACHE');
      meta.set(t.key,{httpStatus:304,disposition:'revalidated',etag:entry.etag,requestId:text(response.headers.get('x-kinojo-request-id'),120)});
      return clone(entry.manifest);
    }
    const bodyText=await response.text();let raw=null;try{raw=bodyText?JSON.parse(bodyText):null}catch(_error){}
    if(!response.ok||raw?.ok===false){const error=new Error(text(raw?.message,300)||bodyText||`배너 Manifest HTTP ${response.status}`);error.code=text(raw?.code,100)||'BANNER_MANIFEST_HTTP_ERROR';error.status=response.status;throw error}
    const manifest=sanitize(raw,cfg,t),etag=text(response.headers.get('etag'),300);
    if(etag)putCache(t.key,etag,manifest);else memory.set(t.key,{etag:'',manifest:clone(manifest)});
    meta.set(t.key,{httpStatus:response.status,disposition:'fresh',etag,requestId:text(response.headers.get('x-kinojo-request-id'),120)});
    return clone(manifest);
  }
  function fetchManifest(pageCode,slotCode,options){
    const t=target(pageCode,slotCode);
    if(!options?.force&&inflight.has(t.key))return inflight.get(t.key);
    const promise=request(t,options).finally(()=>{if(inflight.get(t.key)===promise)inflight.delete(t.key)});
    inflight.set(t.key,promise);return promise;
  }
  function peekManifest(pageCode,slotCode){const t=target(pageCode,slotCode),entry=cached(t.key);return entry?.manifest?clone(entry.manifest):null}
  function getMeta(pageCode,slotCode){const t=target(pageCode,slotCode);return clone(meta.get(t.key)||null)}

  function preloadImage(imageUrl){
    const url=deliveryImageUrl(imageUrl);if(!url)return Promise.reject(invalid('BANNER_PRELOAD_URL_INVALID'));
    if(preloads.has(url))return preloads.get(url);
    const promise=new Promise((resolve,reject)=>{
      const image=new Image();image.decoding='async';
      let settled=false;
      const done=()=>{if(settled)return;settled=true;resolve(url)};
      const fail=()=>{if(settled)return;settled=true;const error=new Error('배너 이미지를 선로딩하지 못했습니다.');error.code='BANNER_IMAGE_PRELOAD_FAILED';reject(error)};
      image.onload=done;image.onerror=fail;image.src=url;
      if(image.complete&&Number(image.naturalWidth)>0)done();
    }).catch(error=>{preloads.delete(url);throw error});
    preloads.set(url,promise);return promise;
  }
  function motionReduced(){try{return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true}catch(_error){return false}}
  function frame(){return new Promise(resolve=>(window.requestAnimationFrame||function(cb){return setTimeout(cb,0)})(()=>resolve()))}
  function wait(ms){return new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)))}
  function applyItem(elements,item,fallbackAlt){
    const host=elements?.host,image=elements?.image;if(!host||!image)return false;
    const alt=text(item?.alt,300)||text(fallbackAlt,300)||'KINOJO 배너';
    image.setAttribute('src',deliveryImageUrl(item.imageUrl));image.setAttribute('alt',alt);image.setAttribute('decoding','async');image.setAttribute('draggable','false');
    if(item.clickUrl)host.setAttribute('href',item.clickUrl);else host.removeAttribute('href');
    host.setAttribute('aria-label',alt);
    return true;
  }
  async function crossfade(elements,item,duration,fallbackAlt){
    await preloadImage(item.imageUrl);
    const host=elements?.host,image=elements?.image;if(!host||!image)throw invalid('BANNER_PLAYER_ELEMENTS_INVALID');
    if(motionReduced()||duration<=0){applyItem(elements,item,fallbackAlt);return}
    const imageStyle=window.getComputedStyle?window.getComputedStyle(image):{};
    const previous={backgroundImage:host.style.backgroundImage,backgroundSize:host.style.backgroundSize,backgroundPosition:host.style.backgroundPosition,backgroundRepeat:host.style.backgroundRepeat,transition:image.style.transition,opacity:image.style.opacity};
    host.style.backgroundImage=`url(${JSON.stringify(deliveryImageUrl(item.imageUrl))})`;
    host.style.backgroundSize=imageStyle.objectFit==='contain'?'contain':'cover';
    host.style.backgroundPosition=imageStyle.objectPosition||'center';
    host.style.backgroundRepeat='no-repeat';
    image.style.transition=`opacity ${duration}ms ease`;
    image.style.opacity='1';
    await frame();image.style.opacity='0';await wait(duration);
    applyItem(elements,item,fallbackAlt);
    image.style.transition='none';image.style.opacity='1';await frame();
    host.style.backgroundImage=previous.backgroundImage;host.style.backgroundSize=previous.backgroundSize;host.style.backgroundPosition=previous.backgroundPosition;host.style.backgroundRepeat=previous.backgroundRepeat;
    image.style.transition=previous.transition;image.style.opacity=previous.opacity;
  }

  function mountBanner(options){
    const t=target(options?.pageCode,options?.slotCode);
    players.get(t.key)?.stop?.();
    let stopped=false,manifest=null,index=0,elements=null,slideTimer=0,preloadTimer=0,refreshTimer=0,requestSeq=0;
    const fallbackAlt=text(options?.fallbackAlt,300)||'KINOJO 배너';
    const clearTimers=()=>{if(slideTimer){clearTimeout(slideTimer);slideTimer=0}if(preloadTimer){clearTimeout(preloadTimer);preloadTimer=0}if(refreshTimer){clearTimeout(refreshTimer);refreshTimer=0}};
    const isHidden=()=>document.hidden===true;
    const expired=value=>Date.now()>=Date.parse(value?.validUntil||'');
    function scheduleRefresh(){
      if(stopped||isHidden()||!manifest)return;
      const delay=Math.max(0,Math.min(300000,Date.parse(manifest.validUntil)-Date.now()+25));
      refreshTimer=setTimeout(()=>{refreshTimer=0;load(true)},delay);
    }
    function scheduleSlide(){
      if(stopped||isHidden()||!manifest?.active||manifest.playlist.length<2)return;
      const nextIndex=(index+1)%manifest.playlist.length;
      const preloadDelay=Math.max(0,manifest.rotation.slideIntervalMs-1200);
      preloadTimer=setTimeout(()=>{preloadTimer=0;preloadImage(manifest.playlist[nextIndex].imageUrl).catch(()=>{})},preloadDelay);
      slideTimer=setTimeout(()=>{slideTimer=0;advance()},manifest.rotation.slideIntervalMs);
    }
    async function install(next,seq){
      if(stopped||seq!==requestSeq)return;
      clearTimers();manifest=next;index=0;
      if(next.active!==true||next.playlist.length===0){elements=null;options?.deactivate?.(next);scheduleRefresh();return}
      await preloadImage(next.playlist[0].imageUrl);
      if(stopped||seq!==requestSeq)return;
      elements=options?.ensureElements?.(next.playlist[0],next)||options?.elements||null;
      if(!elements?.host||!elements?.image)throw invalid('BANNER_PLAYER_ELEMENTS_INVALID');
      applyItem(elements,next.playlist[0],fallbackAlt);options?.onActive?.(next,elements);
      scheduleSlide();scheduleRefresh();
    }
    async function load(force){
      const seq=++requestSeq;
      try{const next=await fetchManifest(t.page,t.slot,force?{force:true}:undefined);await install(next,seq)}catch(error){if(stopped||seq!==requestSeq)return;options?.onError?.(error);if(!manifest)options?.deactivate?.(null,error)}
    }
    async function advance(){
      if(stopped||isHidden()||!manifest?.active||manifest.playlist.length<2)return;
      if(expired(manifest)){await load(true);return}
      const nextIndex=(index+1)%manifest.playlist.length,item=manifest.playlist[nextIndex];
      try{
        await crossfade(elements,item,manifest.rotation.transitionDurationMs,fallbackAlt);
        if(stopped)return;
        index=nextIndex;
      }catch(error){options?.onError?.(error)}
      scheduleSlide();
    }
    function visibility(){
      clearTimers();if(stopped||isHidden())return;
      if(manifest&&expired(manifest)){load(true);return}
      scheduleSlide();scheduleRefresh();
    }
    function stop(){
      if(stopped)return;stopped=true;clearTimers();document.removeEventListener?.('visibilitychange',visibility);if(players.get(t.key)?.stop===stop)players.delete(t.key);
    }
    document.addEventListener?.('visibilitychange',visibility);
    const controller=Object.freeze({stop,refresh:()=>load(true),getState:()=>({manifest:clone(manifest),index,hidden:isHidden()})});
    players.set(t.key,controller);load(false);return controller;
  }

  window.KinojoBannerRuntime=Object.freeze({version:'2026083001',contract:CONTRACT,fetchManifest,peekManifest,getMeta,clearCache,preloadImage,mountBanner});
})();
