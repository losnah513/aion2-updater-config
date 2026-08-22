(function(){
  'use strict';

  const selector='[data-kinojo-pc-banner]';
  const observed=new WeakSet();
  const manifestBound=new WeakSet();
  const targetLoads=new Map();
  const runtimeScriptUrl=(()=>{
    try{
      const src=String(document.currentScript?.src||'').trim();
      return src?new URL('kinojo-banner-runtime.js?cache=2026082301',src).href:'';
    }catch(_error){return ''}
  })();
  let runtimePromise=null;
  const resizeObserver=typeof ResizeObserver==='function'
    ?new ResizeObserver(entries=>entries.forEach(entry=>update(entry.target)))
    :null;

  function visible(element){
    return element&&window.getComputedStyle(element).display!=='none';
  }

  function text(value,max=300){
    return String(value??'').trim().slice(0,max);
  }

  function normalizePath(pathname){
    let path=String(pathname||'/').trim().split(/[?#]/,1)[0]||'/';
    if(!path.startsWith('/'))path='/'+path;
    path=path.replace(/\/index\.html$/i,'/');
    if(path!=='/'&&!path.endsWith('/'))path+='/';
    return path.replace(/\/{2,}/g,'/');
  }

  function resolvePageCode(pathname=window.location?.pathname){
    const path=normalizePath(pathname);
    if(path==='/'||path==='/home.html/')return 'HOME';
    if(path==='/hof/')return 'HOF';
    if(path==='/ranking/')return 'RANKING';
    if(path==='/legion-tree/')return 'LEGION_TREE';
    if(path==='/meter/')return 'METER';
    if(path==='/sanctuary/')return 'SANCTUARY';
    if(path==='/sanctuary-schedule/')return 'SANCTUARY_SCHEDULE';
    return '';
  }

  function resolveSlotCode(slot){
    if(slot?.classList?.contains('is-left'))return 'LEFT';
    if(slot?.classList?.contains('is-right'))return 'RIGHT';
    return '';
  }

  function update(slot){
    if(!visible(slot))return;
    const host=slot.closest('.kinojo-pc-banner-host');
    if(!host)return;
    const hostRect=host.getBoundingClientRect();
    const rect=slot.getBoundingClientRect();
    const width=Math.round(rect.width);
    const height=Math.round(rect.height);
    const documentTop=hostRect.top+window.scrollY;
    const maxTop=Math.max(14,window.innerHeight-height-14);
    const top=Math.max(14,Math.min(Math.round(documentTop),maxTop));
    const left=slot.classList.contains('is-left')
      ?Math.round(hostRect.left-width-14)
      :Math.round(hostRect.right+14);
    slot.style.left=left+'px';
    slot.style.top=top+'px';

    if(slot.dataset.kinojoPcBannerState!=='rendered'){
      const label=width+' × '+height;
      slot.dataset.kinojoPcBannerState='empty';
      if(width>0&&height>0&&slot.textContent!==label)slot.textContent=label;
    }
  }

  function observe(slot){
    if(!slot||observed.has(slot))return;
    observed.add(slot);
    resizeObserver?.observe(slot);
  }

  function clear(slot){
    if(!slot)return false;
    slot.replaceChildren();
    slot.dataset.kinojoPcBannerState='empty';
    slot.setAttribute('aria-hidden','true');
    observe(slot);
    update(slot);
    return true;
  }

  function render(slot,item){
    if(!slot||!item||typeof item!=='object')return false;
    const imageUrl=text(item.imageUrl,3000);
    if(!imageUrl){
      clear(slot);
      return false;
    }

    const alt=text(item.alt,300)||'KINOJO 사이드 배너';
    const clickUrl=text(item.clickUrl,2048);
    const frame=document.createElement(clickUrl?'a':'span');
    frame.className='kinojo-pc-banner-media';
    if(clickUrl)frame.setAttribute('href',clickUrl);

    const image=document.createElement('img');
    image.className='kinojo-pc-banner-image';
    image.setAttribute('src',imageUrl);
    image.setAttribute('alt',alt);
    image.setAttribute('decoding','async');
    image.setAttribute('draggable','false');
    frame.appendChild(image);

    slot.replaceChildren(frame);
    slot.dataset.kinojoPcBannerState='rendered';
    slot.removeAttribute('aria-hidden');
    observe(slot);
    update(slot);
    return true;
  }

  function ensureRuntime(){
    const current=window.KinojoBannerRuntime;
    if(current?.fetchManifest)return Promise.resolve(current);
    if(runtimePromise)return runtimePromise;
    runtimePromise=new Promise((resolve,reject)=>{
      if(!runtimeScriptUrl){
        reject(new Error('KINOJO Banner runtime URL을 확인할 수 없습니다.'));
        return;
      }
      const script=document.createElement('script');
      script.src=runtimeScriptUrl;
      script.async=true;
      script.dataset.kinojoBannerRuntimeLoader='pc-side';
      script.onload=()=>{
        const loaded=window.KinojoBannerRuntime;
        if(loaded?.fetchManifest)resolve(loaded);
        else reject(new Error('KINOJO Banner runtime이 준비되지 않았습니다.'));
      };
      script.onerror=()=>reject(new Error('KINOJO Banner runtime을 불러오지 못했습니다.'));
      (document.head||document.documentElement).appendChild(script);
    });
    return runtimePromise;
  }

  function loadTarget(pageCode,slotCode){
    const key=pageCode+':'+slotCode;
    if(targetLoads.has(key))return targetLoads.get(key);
    const load=ensureRuntime().then(runtime=>runtime.fetchManifest(pageCode,slotCode));
    targetLoads.set(key,load);
    return load;
  }

  function bindManifest(slot){
    if(!slot||manifestBound.has(slot))return;
    const pageCode=resolvePageCode();
    const slotCode=resolveSlotCode(slot);
    if(!pageCode||!slotCode)return;
    manifestBound.add(slot);
    slot.dataset.kinojoPcBannerTarget=pageCode+':'+slotCode;
    loadTarget(pageCode,slotCode).then(manifest=>{
      if(manifest?.active===true&&Array.isArray(manifest.playlist)&&manifest.playlist.length>0){
        render(slot,manifest.playlist[0]);
        return;
      }
      clear(slot);
    }).catch(error=>{
      clear(slot);
      console.warn('[KINOJO BANNER] '+pageCode+':'+slotCode+' Manifest를 불러오지 못해 빈 사이드 슬롯을 유지합니다.',error);
    });
  }

  function attach(slot){
    observe(slot);
    update(slot);
    bindManifest(slot);
  }

  function refresh(){
    document.querySelectorAll(selector).forEach(attach);
  }

  window.KinojoPcBanners=Object.freeze({refresh,render,clear,resolvePageCode,resolveSlotCode});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});
  else refresh();
  window.addEventListener('resize',refresh,{passive:true});
  if(typeof MutationObserver==='function'){
    new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});
  }
})();
