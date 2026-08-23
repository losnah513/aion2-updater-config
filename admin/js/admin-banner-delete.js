/* KINOJO Admin banner asset delete bridge v2026082301 */
(function(A){
  'use strict';
  if(!A) throw new Error('KINOJO Admin shared module is required.');

  const EDGE='kinojo-banner-media';
  const BUCKET='kinojo-site-banners';
  const ROOT='[data-main-banner-admin]';
  const STORAGE_PATH=`/storage/v1/object/public/${BUCKET}/`;
  let deleting=false;

  const $=(q,r=document)=>r.querySelector(q);
  const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
  const token=()=>{
    const value=String(window.KinojoAuth?.getSession?.()?.token||'').trim();
    return /^kws_[A-Za-z0-9_-]{40,80}$/.test(value)?value:'';
  };
  const status=(text,type='')=>{
    const line=$('#bUploadStatus')||$('#bStatus');
    if(!line)return;
    line.textContent=text||'';
    line.className='admin-statusline '+type;
    line.setAttribute('role',type==='error'?'alert':'status');
    line.setAttribute('aria-live',type==='error'?'assertive':'polite');
  };
  async function api(action,body={},mutation=false){
    const core=window.KinojoSupabaseClientCore;
    if(!core?.invokeEdgeFunction)throw new Error('배너 Server 연결 모듈이 없습니다.');
    const sessionToken=token();
    if(!sessionToken)throw new Error('MASTER 세션이 만료되었습니다.');
    const payload={action,...body,sessionToken};
    if(mutation)payload.idempotencyKey=crypto.randomUUID();
    return core.invokeEdgeFunction(EDGE,payload);
  }
  function isStorageAsset(label){
    const src=String($('img',label)?.src||'');
    try{return new URL(src,location.href).pathname.includes(STORAGE_PATH)}catch(_err){return false}
  }
  function inject(){
    const root=$(ROOT);if(!root)return;
    for(const label of $$('#bLibrary .b-asset',root)){
      if(!isStorageAsset(label)||$('[data-b-asset-delete]',label))continue;
      const check=$('[data-b-check]',label),assetId=Number(check?.dataset?.bCheck||0),slot=$('span',label);
      if(!Number.isInteger(assetId)||assetId<=0||!slot)continue;
      const button=document.createElement('button');
      button.type='button';button.className='admin-btn b-asset-delete';button.dataset.bAssetDelete=String(assetId);
      button.textContent='삭제';button.setAttribute('aria-label',`Asset ${assetId} 영구 삭제`);
      slot.appendChild(document.createElement('br'));slot.appendChild(button);
    }
  }
  async function remove(button){
    if(deleting)return;
    const root=button.closest(ROOT),assetId=Number(button.dataset.bAssetDelete||0);
    if(!root||!Number.isInteger(assetId)||assetId<=0)return;
    if(root.dataset.unsaved==='true'){
      status('캠페인 변경사항을 먼저 저장한 뒤 이미지를 삭제하세요.','error');return;
    }
    if(!window.confirm('이 업로드 이미지를 영구 삭제할까요? 캠페인에서 사용 중이면 삭제할 수 없습니다.'))return;
    deleting=true;button.disabled=true;root.setAttribute('aria-busy','true');
    let archivedHere=false;
    try{
      status('삭제 가능 여부 확인 중...');
      const listed=await api('asset-list',{includeArchived:true});
      const asset=(Array.isArray(listed?.assets)?listed.assets:[]).find(x=>Number(x?.assetId)===assetId);
      if(!asset)throw new Error('삭제할 이미지를 찾지 못했습니다.');
      if(String(asset.sourceType)!=='STORAGE')throw new Error('기존 정적 이미지는 관리자 화면에서 삭제하지 않습니다.');
      if(Number(asset.referenceCount||0)>0)throw new Error('캠페인에서 이미지 선택을 해제하고 저장한 뒤 삭제하세요.');
      if(String(asset.status)!=='ARCHIVED'){
        await api('asset-archive',{assetId},true);archivedHere=true;
      }
      try{
        await api('asset-delete',{assetId},true);
      }catch(error){
        if(archivedHere){try{await api('asset-restore',{assetId},true)}catch(_restoreError){}}
        throw error;
      }
      status('삭제 완료','ok');
      await A.loadMainBannerManagement?.(true);
    }catch(error){
      status(error?.message||String(error),'error');
    }finally{
      deleting=false;button.disabled=false;root.removeAttribute('aria-busy');inject();
    }
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-b-asset-delete]');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();remove(button);
  },true);
  const observer=new MutationObserver(inject);observer.observe(document.documentElement,{subtree:true,childList:true});
  if(!$('#bAssetDeleteStyle')){const style=document.createElement('style');style.id='bAssetDeleteStyle';style.textContent='.b-asset-delete{margin-top:6px;padding:5px 8px;font-size:10px;line-height:1.2}';document.head.appendChild(style)}
  queueMicrotask(inject);
  Object.assign(A,{refreshMainBannerAssetDeleteButtons:inject});
})(window.KinojoAdmin);
