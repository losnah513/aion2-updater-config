/* KINOJO Legion Tree · Client Guard · 라-2 */
(function(){
  'use strict';

  const q=(selector,root=document)=>root.querySelector(selector);
  const PREVIEW_STATUS='라-2 · 캐릭터 추가 Server 연결 전';
  const MAIN_REQUIRED_MESSAGE='본캐 이름을 입력해 주세요.';

  function toast(message){
    if(window.KinojoCommonUI?.toast)return window.KinojoCommonUI.toast(message);
    if(window.KinojoToast?.show)return window.KinojoToast.show(message);
  }

  function setMainRequiredError(active){
    const main=q('#legionTreeMainName');
    const status=q('#legionTreeStatus');
    if(main){
      if(active){
        main.setAttribute('aria-invalid','true');
        main.style.borderColor='#dc2626';
        main.style.boxShadow='0 0 0 3px rgba(220,38,38,.10)';
      }else{
        main.removeAttribute('aria-invalid');
        main.style.removeProperty('border-color');
        main.style.removeProperty('box-shadow');
      }
    }
    if(status){
      status.textContent=active?MAIN_REQUIRED_MESSAGE:PREVIEW_STATUS;
      status.style.color=active?'#dc2626':'';
    }
  }

  function resetPreviewInputs(){
    const main=q('#legionTreeMainName');
    const alt=q('#legionTreeAltName');
    const server=q('#legionTreeServer');
    if(main)main.value='';
    if(alt)alt.value='';
    if(server)server.selectedIndex=0;
    setMainRequiredError(false);
  }

  function validateAddBeforeNetwork(){
    const main=q('#legionTreeMainName');
    const alt=q('#legionTreeAltName');
    const mainName=main?.value.trim()||'';
    const altName=alt?.value.trim()||'';

    // 라-2 hard guard: this branch must stay before every future Server/network call.
    if(altName&&!mainName){
      setMainRequiredError(true);
      main?.focus();
      return false;
    }

    setMainRequiredError(false);
    return true;
  }

  function handleAdd(){
    if(!validateAddBeforeNetwork())return;

    // 라-2 scope: normal add paths are intentionally not connected to Server yet.
    // Keeping this handler network-free guarantees alt-only requests are zero as well.
    toast('캐릭터 추가 Server 연결은 후속 단계에서 활성화합니다.');
  }

  function bindPreview(){
    const add=q('#legionTreeAddBtn');
    if(add){
      add.disabled=false;
      add.addEventListener('click',handleAdd);
    }
    q('#legionTreeResetBtn')?.addEventListener('click',resetPreviewInputs);
    q('#legionTreeMainName')?.addEventListener('input',event=>{
      if(String(event.currentTarget?.value||'').trim())setMainRequiredError(false);
    });
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
