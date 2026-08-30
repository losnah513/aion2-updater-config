(function(){
  'use strict';

  const selector='[data-kinojo-pc-banner]';
  const desktopQuery=window.matchMedia?.('(min-width: 1840px)')||null;
  const observed=new WeakSet();
  const manifestBound=new WeakSet();
  const runtimeScriptUrl=(()=>{
    try{
      const src=String(document.currentScript?.src||'').trim();
      return src?new URL('kinojo-banner-runtime.js?cache=2026083001',src).href:'';
    }catch(_error){return ''}
  })();
  let runtimePromise=null;
  const resizeObserver=typeof ResizeObserver==='function'
    ?new ResizeObserver(entries=>entries.forEach(entry=>update(entry.target)))
    :null;

  function visible(element){return element&&window.getComputedStyle(element).display!=='none'}
  function text(value,max=300){return String(value??'').trim().slice(0,max)}
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
    const host=slot.closest('.kinojo-pc-banner-host');if(!host)return;
    const hostRect=host.getBoundingClientRect(),rect=slot.getBoundingClientRect();
    const width=Math.round(rect.width),height=Math.round(rect.height);
    const documentTop=hostRect.top+window.scrollY;
    const maxTop=Math.max(14,window.innerHeight-height-14);
    const top=Math.max(14,Math.min(Math.round(documentTop),maxTop));
    const left=slot.classList.contains('is-left')?Math.round(hostRect.left-width-14):Math.round(hostRect.right+14);
    slot.style.left=left+'px';slot.style.top=top+'px';
    if(slot.dataset.kinojoPcBannerState!=='rendered'){
      const label=width+' × '+height;slot.dataset.kinojoPcBannerState='empty';
      if(width>0&&height>0&&slot.textContent!==label)slot.textContent=label;
    }
  }
  function observe(slot){if(!slot||observed.has(slot))return;observed.add(slot);resizeObserver?.observe(slot)}
  function clear(slot){
    if(!slot)return false;
    slot.replaceChildren();slot.dataset.kinojoPcBannerState='empty';slot.setAttribute('aria-hidden','true');observe(slot);update(slot);return true;
  }
  function ensureMedia(slot){
    let frame=slot.querySelector?.('.kinojo-pc-banner-media'),image=frame?.querySelector?.('.kinojo-pc-banner-image');
    if(!frame||!image){
      frame=document.createElement('a');frame.className='kinojo-pc-banner-media';
      image=document.createElement('img');image.className='kinojo-pc-banner-image';image.setAttribute('decoding','async');image.setAttribute('draggable','false');
      frame.appendChild(image);slot.replaceChildren(frame);
    }
    slot.dataset.kinojoPcBannerState='rendered';slot.removeAttribute('aria-hidden');observe(slot);update(slot);
    return{host:frame,image};
  }
  function render(slot,item){
    if(!slot||!item||typeof item!=='object'||!text(item.imageUrl,3000)){clear(slot);return false}
    const elements=ensureMedia(slot),alt=text(item.alt,300)||'KINOJO 사이드 배너',clickUrl=text(item.clickUrl,2048);
    elements.image.setAttribute('src',text(item.imageUrl,3000));elements.image.setAttribute('alt',alt);
    if(clickUrl)elements.host.setAttribute('href',clickUrl);else elements.host.removeAttribute('href');
    elements.host.setAttribute('aria-label',alt);return true;
  }
  function ensureRuntime(){
    const current=window.KinojoBannerRuntime;
    if(current?.mountBanner)return Promise.resolve(current);
    if(runtimePromise)return runtimePromise;
    runtimePromise=new Promise((resolve,reject)=>{
      if(!runtimeScriptUrl){reject(new Error('KINOJO Banner runtime URL을 확인할 수 없습니다.'));return}
      const script=document.createElement('script');script.src=runtimeScriptUrl;script.async=true;script.dataset.kinojoBannerRuntimeLoader='pc-side';
      script.onload=()=>{const loaded=window.KinojoBannerRuntime;if(loaded?.mountBanner)resolve(loaded);else reject(new Error('KINOJO Banner runtime이 준비되지 않았습니다.'))};
      script.onerror=()=>reject(new Error('KINOJO Banner runtime을 불러오지 못했습니다.'));
      (document.head||document.documentElement).appendChild(script);
    });
    return runtimePromise;
  }
  function bindManifest(slot){
    if(!slot||manifestBound.has(slot))return;
    /* A hidden SIDE slot must not fetch its manifest or any media. The same
       refresh path binds it when the viewport later crosses into PC mode. */
    if(desktopQuery&&!desktopQuery.matches)return;
    const pageCode=resolvePageCode(),slotCode=resolveSlotCode(slot);if(!pageCode||!slotCode)return;
    manifestBound.add(slot);slot.dataset.kinojoPcBannerTarget=pageCode+':'+slotCode;
    ensureRuntime().then(runtime=>{
      runtime.mountBanner({
        pageCode,slotCode,fallbackAlt:'KINOJO 사이드 배너',
        ensureElements:()=>ensureMedia(slot),
        deactivate:()=>clear(slot),
        onError:error=>console.warn('[KINOJO BANNER] '+pageCode+':'+slotCode+' 재생 중 오류가 발생해 현재 상태를 유지합니다.',error)
      });
    }).catch(error=>{clear(slot);console.warn('[KINOJO BANNER] '+pageCode+':'+slotCode+' Manifest runtime을 준비하지 못해 빈 사이드 슬롯을 유지합니다.',error)});
  }
  function attach(slot){observe(slot);update(slot);bindManifest(slot)}
  function refresh(){document.querySelectorAll(selector).forEach(attach)}

  window.KinojoPcBanners=Object.freeze({refresh,render,clear,resolvePageCode,resolveSlotCode});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
  window.addEventListener('resize',refresh,{passive:true});
  desktopQuery?.addEventListener?.('change',refresh);
  if(typeof MutationObserver==='function')new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});
})();
