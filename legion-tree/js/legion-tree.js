/* KINOJO Legion Tree · Client Guard + race/server filter · 라-2 + 마-2/마-3 */
(function(){
  'use strict';

  const q=(selector,root=document)=>root.querySelector(selector);
  const SERVER_REFERENCE_RPC='kinojo_web_legion_tree_server_reference_v372';
  const BASE_STATUS='마-2/3 · 종족별 서버 선택 연결 · 캐릭터 추가 Server 연결 전';
  const MAIN_REQUIRED_MESSAGE='본캐 이름을 입력해 주세요.';
  let serverReference=[];
  let selectedRaceId=null;
  let serverReferenceReady=false;
  let serverReferenceError='';

  function toast(message){
    if(window.KinojoCommonUI?.toast)return window.KinojoCommonUI.toast(message);
    if(window.KinojoToast?.show)return window.KinojoToast.show(message);
  }

  function raceLabel(raceId){
    return Number(raceId)===1?'천족':Number(raceId)===2?'마족':'';
  }

  function normalStatusMessage(){
    if(serverReferenceError)return serverReferenceError;
    if(selectedRaceId){
      const count=serverReference.filter(item=>item.raceId===selectedRaceId).length;
      return `${raceLabel(selectedRaceId)} 서버 ${count}개 표시`;
    }
    return BASE_STATUS;
  }

  function setStatus(message,color=''){
    const status=q('#legionTreeStatus');
    if(!status)return;
    status.textContent=message;
    status.style.color=color;
  }

  function setMainRequiredError(active){
    const main=q('#legionTreeMainName');
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
    if(active)setStatus(MAIN_REQUIRED_MESSAGE,'#dc2626');
    else setStatus(normalStatusMessage());
  }

  function normalizeServer(item){
    const source=item&&typeof item==='object'?item:{};
    const serverId=Number(source.serverId??source.server_id);
    const raceId=Number(source.raceId??source.race_id);
    const serverName=String(source.serverName??source.server_name??'').trim();
    const shortName=String(source.shortName??source.server_short_name??'').trim();
    if(!Number.isInteger(serverId)||serverId<=0||![1,2].includes(raceId)||!serverName)return null;
    return {serverId,raceId,serverName,shortName};
  }

  function setRaceButtonState(raceId){
    const elyos=q('#legionTreeRaceElyos');
    const asmodian=q('#legionTreeRaceAsmodian');
    [[elyos,1],[asmodian,2]].forEach(([button,id])=>{
      if(!button)return;
      const selected=Number(raceId)===id;
      button.setAttribute('aria-pressed',selected?'true':'false');
      button.style.opacity=raceId?(selected?'1':'.58'):'1';
      button.style.boxShadow=selected?'inset 0 0 0 2px rgba(50,85,145,.28)':'none';
    });
  }

  function clearServerOptions(){
    const server=q('#legionTreeServer');
    if(!server)return;
    while(server.firstChild)server.removeChild(server.firstChild);
    const placeholder=document.createElement('option');
    placeholder.value='';
    placeholder.textContent='서버 선택';
    server.appendChild(placeholder);
    server.value='';
  }

  function renderServerOptions(raceId){
    const server=q('#legionTreeServer');
    if(!server)return;
    const previous=String(server.value||'');
    clearServerOptions();
    const filtered=serverReference.filter(item=>item.raceId===Number(raceId));
    filtered.forEach(item=>{
      const option=document.createElement('option');
      option.value=String(item.serverId);
      option.textContent=item.serverName;
      option.dataset.raceId=String(item.raceId);
      option.dataset.shortName=item.shortName;
      server.appendChild(option);
    });
    if(filtered.some(item=>String(item.serverId)===previous))server.value=previous;
    server.disabled=false;
  }

  function selectRace(raceId){
    if(!serverReferenceReady)return;
    const normalized=Number(raceId);
    if(![1,2].includes(normalized))return;
    selectedRaceId=normalized;
    setRaceButtonState(normalized);
    renderServerOptions(normalized);
    setStatus(normalStatusMessage());
  }

  async function loadServerReference(){
    const elyos=q('#legionTreeRaceElyos');
    const asmodian=q('#legionTreeRaceAsmodian');
    const server=q('#legionTreeServer');
    if(elyos)elyos.disabled=true;
    if(asmodian)asmodian.disabled=true;
    if(server){
      server.disabled=true;
      clearServerOptions();
    }
    serverReferenceError='';
    setStatus('서버 기준정보 확인 중…');

    try{
      const api=window.KinojoSupabase;
      if(!api||typeof api.rpc!=='function')throw new Error('SERVER_REFERENCE_API_UNAVAILABLE');
      const data=await api.rpc(SERVER_REFERENCE_RPC,{});
      if(!data||data.ok!==true||String(data.contract||'')!=='web-legion-tree-server-reference-v1')throw new Error('SERVER_REFERENCE_CONTRACT_INVALID');
      const normalized=(Array.isArray(data.servers)?data.servers:[]).map(normalizeServer).filter(Boolean);
      if(!normalized.some(item=>item.raceId===1)||!normalized.some(item=>item.raceId===2))throw new Error('SERVER_REFERENCE_EMPTY_RACE');
      serverReference=normalized;
      serverReferenceReady=true;
      if(elyos)elyos.disabled=false;
      if(asmodian)asmodian.disabled=false;
      if(server)server.disabled=true;
      setRaceButtonState(null);
      setStatus(BASE_STATUS);
    }catch(error){
      serverReference=[];
      serverReferenceReady=false;
      serverReferenceError='서버 기준정보를 불러오지 못했습니다.';
      if(elyos)elyos.disabled=true;
      if(asmodian)asmodian.disabled=true;
      if(server)server.disabled=true;
      setStatus(serverReferenceError,'#dc2626');
      console.warn('[KINOJO][LegionTree] server reference load failed',error);
    }
  }

  function resetPreviewInputs(){
    const main=q('#legionTreeMainName');
    const alt=q('#legionTreeAltName');
    const server=q('#legionTreeServer');
    if(main)main.value='';
    if(alt)alt.value='';
    selectedRaceId=null;
    setRaceButtonState(null);
    clearServerOptions();
    if(server)server.disabled=true;
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
    // Keeping this handler network-free guarantees alt-only add attempts trigger no request.
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
    q('#legionTreeRaceElyos')?.addEventListener('click',()=>selectRace(1));
    q('#legionTreeRaceAsmodian')?.addEventListener('click',()=>selectRace(2));
    document.querySelectorAll('[data-preview-card]').forEach(card=>{
      card.addEventListener('click',()=>toast('프리뷰 카드입니다. 캐릭터 상세 연결은 후속 단계에서 활성화합니다.'));
    });
  }

  function start(){
    bindPreview();
    void loadServerReference();
    window.dispatchEvent(new CustomEvent('kinojo:page-time',{detail:{value:new Date(),label:'프리뷰'}}));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
