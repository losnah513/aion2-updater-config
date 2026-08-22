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
    const label=width+' × '+height;
    slot.style.left=left+'px';
    slot.style.top=top+'px';
    if(width>0&&height>0&&slot.textContent!==label)slot.textContent=label;
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

  function refresh(){
    document.querySelectorAll(selector).forEach(attach);
  }

  window.KinojoPcBanners={refresh};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});
  else refresh();
  window.addEventListener('resize',refresh,{passive:true});
  if(typeof MutationObserver==='function'){
    new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});
  }
})();
