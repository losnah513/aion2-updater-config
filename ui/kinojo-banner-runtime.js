/* KINOJO public Banner Manifest client v2026082201 */
(function(){
  'use strict';

  const EDGE='kinojo-banner-media';
  const CONTRACT='banner-public-manifest-v1';
  const CACHE_KEY='kinojo_banner_manifest_cache_v1';
  const PAGE_RE=/^(HOME|HOF|RANKING|LEGION_TREE|METER|SANCTUARY|SANCTUARY_SCHEDULE)$/;
  const SLOT_RE=/^(MAIN|LEFT|RIGHT)$/;
  const STATIC_RE=/^https:\/\/kinojo\.info\/assets\/images\/[A-Za-z0-9._\/-]+$/;
  const memory=new Map();
  const inflight=new Map();
  const meta=new Map();

  const text=(value,max=500)=>String(value??'').trim().slice(0,max);
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

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

  function storage(){
    try{return window.sessionStorage||null}catch(_error){return null}
  }

  function loadStored(){
    const store=storage();if(!store)return{};
    try{const value=JSON.parse(store.getItem(CACHE_KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch(_error){return{}}
  }

  function saveStored(entries){
    const store=storage();if(!store)return;
    try{store.setItem(CACHE_KEY,JSON.stringify(entries))}catch(_error){}
  }

  function cached(key){
    if(memory.has(key))return memory.get(key);
    const entry=loadStored()[key];
    if(!entry||typeof entry!=='object'||typeof entry.etag!=='string'||!entry.manifest)return null;
    memory.set(key,entry);
    return entry;
  }

  function putCache(key,etag,manifest){
    const entry={etag:text(etag,300),manifest:clone(manifest)};
    memory.set(key,entry);
    const entries=loadStored();entries[key]=entry;
    const keys=Object.keys(entries);
    for(const old of keys.slice(0,Math.max(0,keys.length-20)))delete entries[old];
    saveStored(entries);
  }

  function clearCache(pageCode,slotCode){
    if(pageCode===undefined){memory.clear();meta.clear();saveStored({});return}
    const t=target(pageCode,slotCode),entries=loadStored();
    memory.delete(t.key);meta.delete(t.key);delete entries[t.key];saveStored(entries);
  }

  function safeClick(value){
    const v=text(value,2048);return !v?null:(/^https:\/\//i.test(v)||(v.startsWith('/')&&!v.startsWith('//'))?v:null);
  }

  function safeImage(value,cfg){
    const v=text(value,3000);if(!v)return'';
    if(STATIC_RE.test(v)&&!v.includes('..'))return v;
    let projectOrigin='';
    try{projectOrigin=new URL(cfg.url).origin}catch(_error){return''}
    const prefix=`${projectOrigin}/storage/v1/object/public/kinojo-site-banners/`;
    if(!v.startsWith(prefix))return'';
    const path=v.slice(prefix.length);
    if(path.includes('..')||!/^[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i.test(path))return'';
    return v;
  }

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
    return{
      ok:true,
      service:text(raw.service,80),apiVersion:text(raw.apiVersion,40),databaseContract:text(raw.databaseContract,40),contract:CONTRACT,
      manifestVersion:text(raw.manifestVersion,80),generatedAtKst:text(raw.generatedAtKst,60),validUntil:text(raw.validUntil,60),
      pageCode:page,slotCode:slot,slotKey:t.key,active:raw.active,reason:raw.active?null:text(raw.reason,100)||null,
      rotation:raw.active?rotation:null,playlist:raw.active?playlist:[]
    };
  }

  function invalid(code){const error=new Error('배너 Manifest 응답 계약이 올바르지 않습니다.');error.code=code;return error}

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
    if(!response.ok||raw?.ok===false){
      const error=new Error(text(raw?.message,300)||bodyText||`배너 Manifest HTTP ${response.status}`);error.code=text(raw?.code,100)||'BANNER_MANIFEST_HTTP_ERROR';error.status=response.status;throw error;
    }
    const manifest=sanitize(raw,cfg,t),etag=text(response.headers.get('etag'),300);
    if(etag)putCache(t.key,etag,manifest);else{memory.set(t.key,{etag:'',manifest:clone(manifest)})}
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

  window.KinojoBannerRuntime=Object.freeze({
    version:'2026082201',contract:CONTRACT,fetchManifest,peekManifest,getMeta,clearCache
  });
})();
