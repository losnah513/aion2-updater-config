/* KINOJO common navigation extension · 2026-08-20
   - Reuses the existing common Topbar/Drawer markup and visual contract.
   - Owns only registration of the Legion Tree destination.
   - Never creates a second Topbar/Drawer or page-specific shell geometry.
*/
(function(){
  'use strict';

  if(window.__KINOJO_COMMON_NAVIGATION_INIT_DONE__) return;
  window.__KINOJO_COMMON_NAVIGATION_INIT_DONE__ = true;

  let syncing=false;
  function path_(){ return location.pathname.replace(/\\/g,'/'); }
  function mobile_(){ return /(^|\/)m(\/|$)/.test(path_()); }
  function tree_(){ return path_().includes('/legion-tree/'); }
  function base_(){ return mobile_()?'/m/':'/'; }
  function treeHref_(){ return tree_()?'./':base_()+'legion-tree/'; }

  function isTreeLink_(item){
    if(!(item instanceof HTMLAnchorElement)) return false;
    const href=String(item.getAttribute('href')||'');
    const text=String(item.textContent||'').trim();
    return text==='레기온 트리'||href.includes('/legion-tree/')||href==='legion-tree/';
  }

  function placeAfterRanking_(container,link){
    const anchors=Array.from(container.querySelectorAll('a'));
    const ranking=anchors.find(item=>{
      const href=String(item.getAttribute('href')||'');
      return href.includes('/ranking/')||href==='ranking/'||String(item.textContent||'').trim()==='레기온 순위';
    });
    if(ranking) ranking.insertAdjacentElement('afterend',link);
    else container.appendChild(link);
  }

  function removeLegacyPreviewEntries_(){
    if(tree_()) return;
    document.querySelectorAll('a[href*="legion-tree/"]').forEach(item=>{
      if(item.closest('#kinojoTopNav,#sideDrawer')) return;
      if(item.classList.contains('mobile-feature-card')||item.classList.contains('eyebrow')||String(item.getAttribute('aria-label')||'').includes('레기온 트리 프리뷰')) item.remove();
    });
  }

  function dedupeTreeLinks_(container,canonical){
    Array.from(container.querySelectorAll('a')).filter(isTreeLink_).forEach(item=>{
      if(item!==canonical) item.remove();
    });
  }

  function ensureTopbarTree_(){
    const nav=document.getElementById('kinojoTopNav');
    if(!nav) return false;
    let link=nav.querySelector('[data-kinojo-nav-key="legion-tree"]');
    if(!link){
      link=document.createElement('a');
      link.className='kinojo-top-nav-link';
      link.dataset.kinojoNavKey='legion-tree';
      link.textContent='레기온 트리';
      placeAfterRanking_(nav,link);
    }
    dedupeTreeLinks_(nav,link);
    const href=treeHref_();
    if(link.getAttribute('href')!==href) link.setAttribute('href',href);
    if(tree_()){
      nav.querySelectorAll('.kinojo-top-nav-link.active').forEach(item=>{if(item!==link){item.classList.remove('active');item.removeAttribute('aria-current');}});
      if(!link.classList.contains('active')) link.classList.add('active');
      if(link.getAttribute('aria-current')!=='page') link.setAttribute('aria-current','page');
    }else{
      if(link.classList.contains('active')) link.classList.remove('active');
      if(link.hasAttribute('aria-current')) link.removeAttribute('aria-current');
    }
    return true;
  }

  function ensureDrawerTree_(){
    const nav=document.querySelector('#sideDrawer .kinojo-drawer-nav');
    if(!nav) return false;
    let link=nav.querySelector('[data-kinojo-nav-key="legion-tree"]');
    if(!link){
      link=document.createElement('a');
      link.dataset.kinojoNavKey='legion-tree';
      link.textContent='레기온 트리';
      placeAfterRanking_(nav,link);
    }
    dedupeTreeLinks_(nav,link);
    const href=treeHref_();
    if(link.getAttribute('href')!==href) link.setAttribute('href',href);
    if(tree_()){
      nav.querySelectorAll('a.active').forEach(item=>{if(item!==link){item.classList.remove('active');item.removeAttribute('aria-current');item.removeAttribute('aria-disabled');}});
      if(!link.classList.contains('active')) link.classList.add('active');
      if(link.getAttribute('aria-current')!=='page') link.setAttribute('aria-current','page');
      if(link.getAttribute('aria-disabled')!=='true') link.setAttribute('aria-disabled','true');
    }else{
      if(link.classList.contains('active')) link.classList.remove('active');
      if(link.hasAttribute('aria-current')) link.removeAttribute('aria-current');
      if(link.hasAttribute('aria-disabled')) link.removeAttribute('aria-disabled');
    }
    return true;
  }

  function syncTreeIdentity_(){
    if(!tree_()) return;
    document.body.classList.remove('kinojo-page-home');
    document.body.classList.add('kinojo-page-legion-tree');
    if(document.body.dataset.kinojoPage!=='legion-tree') document.body.dataset.kinojoPage='legion-tree';
    const label=document.querySelector('.kinojo-top-page strong');
    if(label&&label.textContent!=='레기온 트리') label.textContent='레기온 트리';
  }

  function sync(){
    if(syncing) return false;
    syncing=true;
    try{
      removeLegacyPreviewEntries_();
      const top=ensureTopbarTree_();
      const drawer=ensureDrawerTree_();
      syncTreeIdentity_();
      return top&&drawer;
    }finally{syncing=false;}
  }

  function start(){
    sync();
    let ticks=0;
    let successTicks=0;
    const timer=setInterval(()=>{
      ticks+=1;
      if(sync()) successTicks+=1;
      else successTicks=0;
      if(successTicks>=20||ticks>=80) clearInterval(timer);
    },100);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
