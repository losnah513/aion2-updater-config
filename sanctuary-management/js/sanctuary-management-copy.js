/*
 * KINOJO Sanctuary management copy bridge.
 * The copied pixels are rendered by the original sanctuary-copy-render SVG
 * implementation. This file only adapts the new Server team snapshot to the
 * retired renderer contract; it must not invent a second image layout.
 */
(function(){
  'use strict';

  const EDGE_FUNCTION_NAME='sanctuary-copy-render';
  const SNAPSHOT_CONTRACT='KINOJO_SANCTUARY_MANAGEMENT_COPY_V1';
  const bridge=()=>window.KinojoSanctuaryManagementCopyBridge;
  const text=value=>String(value??'').replace(/\s+/g,' ').trim();
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeFilename=value=>text(value).replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'-').slice(0,72)||'sanctuary';

  function notify(message,tone='success'){
    if(tone==='success'&&window.KinojoToast?.success){window.KinojoToast.success(message);return;}
    if(tone==='error'&&window.KinojoToast?.error){window.KinojoToast.error(message);return;}
    if(window.KinojoToast?.show){window.KinojoToast.show(message,{type:tone==='warning'?'warning':tone});return;}
    console[tone==='error'?'warn':'log'](message);
  }

  function requireLogin(){
    if(!window.KinojoAuth||typeof window.KinojoAuth.requireLogin!=='function')return true;
    return window.KinojoAuth.requireLogin('로그인 후 클립보드 복사 기능을 사용할 수 있습니다.',{context:'sanctuary'});
  }

  async function ensureSupabaseConfig(){
    if(window.KinojoSupabase&&typeof window.KinojoSupabase.ensureReady==='function')await window.KinojoSupabase.ensureReady();
    const cfg=window.KinojoSupabase&&typeof window.KinojoSupabase.getConfig==='function'
      ?window.KinojoSupabase.getConfig()
      :((window.KINOJO_SUPABASE_CONFIG||{}).supabase||window.KINOJO_SUPABASE_CONFIG||{});
    const url=String(cfg.url||'').replace(/\/$/,'');
    const key=String(cfg.publishableKey||cfg.anonKey||'').trim();
    if(!url)throw new Error('Supabase 설정이 준비되지 않았습니다.');
    return {url,key};
  }

  async function fetchWithTimeout(url,options,timeoutMs=45000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{return await fetch(url,Object.assign({},options,{signal:controller.signal}));}
    finally{clearTimeout(timer);}
  }

  async function svgBlobToPng(svgBlob){
    const svgText=await svgBlob.text();
    const sizeMatch=svgText.match(/<svg[^>]*\bwidth=["']([0-9.]+)["'][^>]*\bheight=["']([0-9.]+)["']/i)
      ||svgText.match(/<svg[^>]*\bviewBox=["'][^"']*?([0-9.]+)\s+([0-9.]+)["']/i);
    const width=Math.max(1,Math.round(Number(sizeMatch?.[1]||760)));
    const height=Math.max(1,Math.round(Number(sizeMatch?.[2]||500)));
    const url=URL.createObjectURL(new Blob([svgText],{type:'image/svg+xml'}));
    try{
      const image=await new Promise((resolve,reject)=>{const element=new Image();element.onload=()=>resolve(element);element.onerror=()=>reject(new Error('기존 성역 SVG 이미지를 불러오지 못했습니다.'));element.src=url;});
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d');if(!context)throw new Error('PNG 변환 Canvas를 만들지 못했습니다.');
      context.drawImage(image,0,0,width,height);
      return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 변환에 실패했습니다.')),'image/png'));
    }finally{URL.revokeObjectURL(url);}
  }

  function characterSnapshot(character){
    if(!character)return null;
    const relation=text(character.relation).toUpperCase();
    return {
      name:text(character.name).slice(0,16),
      className:text(character.className).slice(0,40),
      profileImageUrl:text(character.profileImageUrl),
      power:number(character.power||character.latestPveCombatPower||character.latest_pve_combat_power),
      mainCharacterName:text(character.mainCharacterName),
      relation:['MAIN','ALT','GUEST'].includes(relation)?relation:'GUEST'
    };
  }

  function managementSnapshot(team){
    return {
      contract:SNAPSHOT_CONTRACT,
      teamId:number(team?.teamId),
      title:text(team?.title)||'이름 없는 팀',
      forces:(Array.isArray(team?.forces)?team.forces:[]).map(force=>({
        forceId:String(force?.forceId||''),
        forceNo:number(force?.forceNo),
        parties:(Array.isArray(force?.parties)?force.parties:[]).map(party=>({
          partyNo:number(party?.partyNo),
          slots:(Array.isArray(party?.slots)?party.slots:[]).map(slot=>({
            slotNo:number(slot?.slotNo),
            occupied:slot?.occupied===true,
            character:slot?.occupied===true?characterSnapshot(slot.character):null
          }))
        }))
      }))
    };
  }

  function buildPayload(team,targetForce){
    const teamId=number(team?.teamId);
    const forceId=targetForce?String(targetForce.forceId||''):'';
    return {
      scope:targetForce?'force':'team',
      teamGroupNo:teamId,
      teamGroupName:text(team?.title),
      forceId:forceId||undefined,
      forceNo:targetForce?number(targetForce.forceNo):undefined,
      managementSnapshot:managementSnapshot(team),
      filename:'kinojo-'+safeFilename(targetForce?(number(targetForce.forceNo)||1)+'포스':text(team?.title)||'성역-팀')+'.png'
    };
  }

  async function requestServerCopyImage(payload){
    if(typeof window.KinojoSanctuaryCopyRenderRequest==='function')return await window.KinojoSanctuaryCopyRenderRequest(payload);
    const cfg=await ensureSupabaseConfig();
    const headers={'content-type':'application/json'};
    if(cfg.key){headers.apikey=cfg.key;headers.authorization='Bearer '+cfg.key;}
    const response=await fetchWithTimeout(cfg.url.replace(/\/rest\/v1\/?$/i,'').replace(/\/$/,'')+'/functions/v1/'+EDGE_FUNCTION_NAME,{
      method:'POST',cache:'no-store',headers,body:JSON.stringify(payload)
    });
    const contentType=response.headers.get('content-type')||'';
    if(response.ok&&/^image\/png/i.test(contentType))return {blob:await response.blob(),filename:response.headers.get('x-kinojo-filename')||payload.filename};
    if(response.ok&&/^image\/svg\+xml/i.test(contentType))return {blob:await svgBlobToPng(await response.blob()),filename:String(response.headers.get('x-kinojo-filename')||payload.filename).replace(/\.svg$/i,'.png')};
    const errorBody=/json/i.test(contentType)?await response.json().catch(()=>null):null;
    const raw=errorBody?text(errorBody.message||errorBody.error):text(await response.text().catch(()=>''));
    throw new Error(raw||'기존 성역 이미지 렌더러 HTTP '+response.status);
  }

  function assertClipboardReady(){
    if(!window.isSecureContext||!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw new Error('이 브라우저에서는 이미지 클립보드를 바로 사용할 수 없습니다.');
  }
  async function writeClipboard(blobPromise){
    assertClipboardReady();
    await navigator.clipboard.write([new ClipboardItem({'image/png':Promise.resolve(blobPromise).then(result=>result?.blob||result)})]);
  }
  function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}

  function openPreview(blob,filename){
    document.querySelector('.sanctuary-management-copy-preview')?.remove();
    const imageUrl=URL.createObjectURL(blob);const layer=document.createElement('section');layer.className='sanctuary-management-copy-preview';
    layer.innerHTML='<div class="sanctuary-management-copy-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryCopyPreviewTitle"><header><strong id="sanctuaryCopyPreviewTitle">기존 성역 복사 이미지 미리보기</strong><button type="button" data-copy-close aria-label="닫기">×</button></header><div class="sanctuary-management-copy-preview-body"><img src="'+escapeHtml(imageUrl)+'" alt="기존 성역 레이아웃으로 생성한 팀 편성 이미지"></div><footer><span>브라우저가 자동 복사를 막은 경우 다시 복사하거나 PNG로 저장할 수 있습니다.</span><div><button type="button" class="is-primary" data-copy-retry>이미지 복사</button><button type="button" data-copy-download>PNG 저장</button></div></footer></div>';
    const close=()=>{URL.revokeObjectURL(imageUrl);layer.remove();};
    layer.querySelector('[data-copy-close]').addEventListener('click',close);layer.addEventListener('click',event=>{if(event.target===layer)close();});
    layer.querySelector('[data-copy-download]').addEventListener('click',()=>downloadBlob(blob,filename));
    layer.querySelector('[data-copy-retry]').addEventListener('click',async()=>{try{await writeClipboard(blob);notify('이미지가 클립보드에 복사되었습니다.');close();}catch(error){notify(text(error?.message)||'이미지 복사에 실패했습니다.','error');}});
    document.body.appendChild(layer);layer.querySelector('[data-copy-close]').focus();
  }

  async function renderPng(team,targetForce){return (await requestServerCopyImage(buildPayload(team,targetForce))).blob;}

  async function copyFromButton(button){
    if(!button||button.disabled||!requireLogin())return;
    const team=bridge()?.findTeam?.(button.dataset.sanctuaryCopyTeam);const forceId=number(button.dataset.sanctuaryCopyForce);
    const force=forceId?(Array.isArray(team?.forces)?team.forces:[]).find(item=>number(item.forceId)===forceId):null;
    if(!team||forceId&&!force){notify('복사할 팀·포스 데이터를 찾지 못했습니다.','error');return;}
    const payload=buildPayload(team,force);const imagePromise=requestServerCopyImage(payload);const oldHtml=button.innerHTML;
    document.documentElement.dataset.sanctuaryCopyState='rendering';button.disabled=true;button.setAttribute('aria-busy','true');
    try{
      await writeClipboard(imagePromise);await imagePromise;document.documentElement.dataset.sanctuaryCopyState='copied';
      notify(force?'포스 이미지가 클립보드에 복사되었습니다.':'팀 전체 이미지가 클립보드에 복사되었습니다.');
    }catch(error){
      try{const result=await imagePromise;document.documentElement.dataset.sanctuaryCopyState='preview';openPreview(result.blob,result.filename||payload.filename);notify('기존 성역 이미지가 생성되었습니다. 미리보기에서 복사를 완료해 주세요.','warning');}
      catch(renderError){document.documentElement.dataset.sanctuaryCopyState='error';notify(text(renderError?.message||error?.message)||'이미지 생성에 실패했습니다.','error');}
    }finally{button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=oldHtml;}
  }

  function bind(){
    if(document.documentElement.dataset.sanctuaryCopyBound==='true')return;
    document.documentElement.dataset.sanctuaryCopyBound='true';
    document.addEventListener('click',event=>{const button=event.target.closest?.('[data-sanctuary-copy-team]');if(!button)return;document.documentElement.dataset.sanctuaryCopyLast=button.dataset.sanctuaryCopyForce?'force':'team';event.preventDefault();event.stopPropagation();copyFromButton(button);},true);
  }

  window.KinojoSanctuaryManagementCopy=Object.freeze({copyFromButton,renderPng,buildPayload,version:'20260830_02_server_legacy_renderer'});
  document.documentElement.dataset.sanctuaryCopyReady='true';
  bind();
})();
