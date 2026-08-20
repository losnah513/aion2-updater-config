/* KINOJO common navigation extension · 2026-08-20
   - Reuses the existing common Topbar/Drawer markup and visual contract.
   - Owns only registration of the Legion Tree destination.
   - Never creates a second Topbar/Drawer or page-specific shell geometry.
*/
(function(){
  'use strict';

  if(window.__KINOJO_COMMON_NAVIGATION_INIT_DONE__) return;
  window.__KINOJO_COMMON_NAVIGATION_INIT_DONE__ = true;

  function path_(){ return location.pathname.replace(/\\/g,'/'); }
  function mobile_(){ return /(^|\/)m(\/|$)/.test(path_()); }
  function tree_(){ return path_().includes('/legion-tree/'); }
  function base_(){ return mobile_()?'/m/':'/'; }

  function treeHref_(){ return tree_()?'./':base_()+'legion-tree/'; }

  function placeAfterRanking_(container,link){
    const anchors=Array.from(container.querySelectorAll('a'));
    const ranking=anchors.find(item=>{
      const href=String(item.getAttribute('href')||'');
      return href.includes('/ranking/')||href==='ranking/'||String(item.textContent||'').trim()==='레기온 순위';
    });
    if(ranking) ranking.insertAdjacentElement('afterend',link);
    else container.appendChild(link);
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
    link.href=treeHref_();
    if(tree_()){
      nav.querySelectorAll('.kinojo-top-nav-link.active').forEach(item=>{
        if(item!==link){item.classList.remove('active');item.removeAttribute('aria-current');}
      });
      link.classList.add('active');
      link.setAttribute('aria-current','page');
    }else{
      link.classList.remove('active');
      link.removeAttribute('aria-current');
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
    link.href=treeHref_();
    if(tree_()){
      nav.querySelectorAll('a.active').forEach(item=>{if(item!==link){item.classList.remove('active');item.removeAttribute('aria-current');item.removeAttribute('aria-disabled');}});
      link.classList.add('active');
      link.setAttribute('aria-current','page');
      link.setAttribute('aria-disabled','true');
    }else{
      link.classList.remove('active');
      link.removeAttribute('aria-current');
      link.removeAttribute('aria-disabled');
    }
    return true;
  }

  function syncTreeIdentity_(){
    if(!tree_()) return;
    document.body.classList.remove('kinojo-page-home');
    document.body.classList.add('kinojo-page-legion-tree');
    document.body.dataset.kinojoPage='legion-tree';
    const label=document.querySelector('.kinojo-top-page strong');
    if(label) label.textContent='레기온 트리';
  }

  function sync(){
    const top=ensureTopbarTree_();
    const drawer=ensureDrawerTree_();
    syncTreeIdentity_();
    return top&&drawer;
  }

  function start(){
    if(sync()) return;
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(sync()||tries>=20) clearInterval(timer);
    },100);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
