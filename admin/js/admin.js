/* KINOJO Admin Console loader v2026073105 */
(function(){
  'use strict';
  const current=document.currentScript;
  const coreUrl=new URL('admin-core-2026073104.js?cache=2026073104',current?.src||location.href).href;
  const labels={
    queued:'조회 대기',claimed:'조회 준비 중',processing:'캐릭터 정보 조회 중',running:'진행 중',
    retryable:'잠시 후 자동 재시도',final_failed:'자동 조회 실패 · 확인 필요',lookup_done:'공식 조회 완료',
    postprocess:'Server Master 반영 중',master_sync:'Server Master 반영 중',list_sync:'Google 명단 반영 중',
    synced:'Google 명단 반영 완료',completed:'완료',failed:'실패',cancelled:'중단',paused:'일시정지'
  };
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function errorInfo(raw){
    const text=String(raw||'').trim();
    const probe=text.toLowerCase();
    if(/failed to fetch|networkerror|cors|options/.test(probe))return['조회 서버 연결에 실패했습니다.','조회 대상은 보존되어 있습니다. 잠시 후 다시 시도해 주세요.'];
    if(/statement timeout|canceling statement|cancelling statement/.test(probe))return['서버 처리 시간이 초과되었습니다.','상태 정보를 불러오는 과정이 지연되었습니다. 잠시 후 상태를 다시 확인해 주세요.'];
    if(/429|rate.?limit|plaync_rate/.test(probe))return['공식 사이트 요청 제한으로 잠시 대기 중입니다.','서버가 제한 해제 후 자동으로 다시 시도합니다.'];
    if(/http[_ ]?5\d\d|edge_function_error|server_queue_worker_failed/.test(probe))return['공식 조회 서버에 일시적인 문제가 있습니다.','조회 대상은 보존되어 있으며 자동 재시도 또는 다시 시작할 수 있습니다.'];
    if(/timeout/.test(probe))return['응답 대기 시간이 초과되었습니다.','현재 상태를 다시 확인해 주세요.'];
    return null;
  }
  function localizeStatus(){
    const el=document.querySelector('#characterLookupStatus');
    if(!el||el.querySelector('details[data-kinojo-technical]'))return;
    const raw=el.textContent||'';
    const info=errorInfo(raw);
    if(!info)return;
    el.classList.add('error');
    el.innerHTML='<strong>'+escapeHtml(info[0])+'</strong><span> '+escapeHtml(info[1])+'</span><details data-kinojo-technical><summary>기술 정보 보기</summary><pre>'+escapeHtml(raw)+'</pre></details>';
  }
  function localizeText(root){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      if(node.parentElement?.closest('details[data-kinojo-technical]'))return;
      let value=node.nodeValue||'';
      Object.entries(labels).forEach(([key,label])=>{value=value.replace(new RegExp('(^|[^A-Za-z0-9_])'+key+'(?=$|[^A-Za-z0-9_])','g'),(_,prefix)=>prefix+label);});
      if(value!==node.nodeValue)node.nodeValue=value;
    });
  }
  let scheduled=false;
  function scan(){
    scheduled=false;
    localizeStatus();
    ['#characterLookupFailures','#characterLookupTargetList','#characterLookupHistory'].forEach(selector=>localizeText(document.querySelector(selector)));
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(scan);}
  function install(){
    scan();
    new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  }
  const core=document.createElement('script');
  core.src=coreUrl;
  core.async=false;
  core.onload=install;
  core.onerror=function(){
    const el=document.querySelector('#characterLookupStatus');
    if(el){el.classList.add('error');el.textContent='관리자 콘솔 파일을 불러오지 못했습니다. 새로고침해 주세요.';}
  };
  (current?.parentNode||document.head).insertBefore(core,current?.nextSibling||null);
})();
