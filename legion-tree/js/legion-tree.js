/* KINOJO Legion Tree · Foundation Preview · 가-0 */
(function(){
  'use strict';

  const q=(selector,root=document)=>root.querySelector(selector);

  function toast(message){
    if(window.KinojoCommonUI?.toast)return window.KinojoCommonUI.toast(message);
    if(window.KinojoToast?.show)return window.KinojoToast.show(message);
  }

  function previewHref(){
    return /(^|\/)m(\/|$)/.test(location.pathname)?'/m/legion-tree/':'/legion-tree/';
  }

  function markPageIdentity(){
    document.body.classList.remove('kinojo-page-home');
    document.body.classList.add('kinojo-page-tree');
    document.body.dataset.kinojoPage='tree';
    const title=q('.kinojo-top-page strong');
    if(title)title.textContent='레기온 트리';
  }

  function installPreviewNavigation(){
    const href=previewHref();
    const nav=q('#kinojoTopNav');
    if(nav&&!nav.querySelector('[data-legion-tree-nav]')){
      const link=document.createElement('a');
      link.className='kinojo-top-nav-link active';
      link.href='./';
      link.setAttribute('aria-current','page');
      link.dataset.legionTreeNav='true';
      link.textContent='레기온 트리';
      const ranking=Array.from(nav.querySelectorAll('a')).find(item=>/\/ranking\//.test(item.getAttribute('href')||''));
      if(ranking)ranking.insertAdjacentElement('afterend',link);
      else nav.appendChild(link);
    }

    const drawer=q('.kinojo-drawer-nav');
    if(drawer&&!drawer.querySelector('[data-legion-tree-nav]')){
      const link=document.createElement('a');
      link.href=href;
      link.className='active';
      link.setAttribute('aria-disabled','true');
      link.dataset.legionTreeNav='true';
      link.textContent='레기온 트리';
      const ranking=Array.from(drawer.querySelectorAll('a')).find(item=>/ranking\//.test(item.getAttribute('href')||''));
      if(ranking)ranking.insertAdjacentElement('afterend',link);
      else drawer.prepend(link);
    }
  }

  function resetPreviewInputs(){
    const main=q('#legionTreeMainName');
    const alt=q('#legionTreeAltName');
    const server=q('#legionTreeServer');
    if(main)main.value='';
    if(alt)alt.value='';
    if(server)server.selectedIndex=0;
    const status=q('#legionTreeStatus span');
    if(status)status.textContent='가-0 프리뷰 · 데이터/편집 기능 연결 전';
  }

  function bindPreview(){
    q('#legionTreeResetBtn')?.addEventListener('click',resetPreviewInputs);
    document.querySelectorAll('[data-preview-card]').forEach(card=>{
      card.addEventListener('click',()=>toast('프리뷰 카드입니다. 캐릭터 상세 연결은 후속 단계에서 활성화합니다.'));
    });
  }

  function start(){
    markPageIdentity();
    installPreviewNavigation();
    bindPreview();
    window.dispatchEvent(new CustomEvent('kinojo:page-time',{detail:{value:new Date(),label:'프리뷰'}}));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
