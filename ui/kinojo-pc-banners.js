(function(){
  'use strict';

  const selector='[data-kinojo-pc-banner]';
  const observed=new WeakSet();
  const resizeObserver=typeof ResizeObserver==='function'
    ?new ResizeObserver(entries=>entries.forEach(entry=>update(entry.target)))
    :null;

  function visible(element){
    return element&&window.getComputedStyle(element).display!=='none';
  }

  function text(value,max=300){
    return String(value??'').trim().slice(0,max);
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

  function attach(slot){
    if(observed.has(slot)){
      update(slot);
      return;
    }
    observed.add(slot);
    resizeObserver?.observe(slot);
    update(slot);
  }

  function clear(slot){
    if(!slot)return false;
    slot.replaceChildren();
    slot.dataset.kinojoPcBannerState='empty';
    slot.setAttribute('aria-hidden','true');
    attach(slot);
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
    attach(slot);
    return true;
  }

  function refresh(){
    document.querySelectorAll(selector).forEach(attach);
  }

  window.KinojoPcBanners=Object.freeze({refresh,render,clear});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});
  else refresh();
  window.addEventListener('resize',refresh,{passive:true});
  if(typeof MutationObserver==='function'){
    new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});
  }
})();
