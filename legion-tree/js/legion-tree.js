/* KINOJO Legion Tree · Foundation Preview · 가-0 */
(function(){
  'use strict';

  const q=(selector,root=document)=>root.querySelector(selector);

  function toast(message){
    if(window.KinojoCommonUI?.toast)return window.KinojoCommonUI.toast(message);
    if(window.KinojoToast?.show)return window.KinojoToast.show(message);
  }

  function resetPreviewInputs(){
    const main=q('#legionTreeMainName');
    const alt=q('#legionTreeAltName');
    const server=q('#legionTreeServer');
    if(main)main.value='';
    if(alt)alt.value='';
    if(server)server.selectedIndex=0;
    const status=q('#legionTreeStatus');
    if(status)status.textContent='가-0 프리뷰 · 데이터/편집 기능 연결 전';
  }

  function bindPreview(){
    q('#legionTreeResetBtn')?.addEventListener('click',resetPreviewInputs);
    document.querySelectorAll('[data-preview-card]').forEach(card=>{
      card.addEventListener('click',()=>toast('프리뷰 카드입니다. 캐릭터 상세 연결은 후속 단계에서 활성화합니다.'));
    });
  }

  function start(){
    bindPreview();
    window.dispatchEvent(new CustomEvent('kinojo:page-time',{detail:{value:new Date(),label:'프리뷰'}}));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
