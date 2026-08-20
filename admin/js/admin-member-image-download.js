/* KINOJO Admin MASTER image download v2026082102 */
(function(A){
  'use strict';
  if(!A)throw new Error('KINOJO Admin shared module is required.');
  const $=A.$;
  const esc=(...args)=>A.esc(...args);
  const isMaster=(...args)=>A.isMaster(...args);
  const toast=(...args)=>A.toast(...args);
  const SLOTS=['PROFILE','FRONT','BACK','UPPER_BODY'];

  function sessionToken(){
    const token=String(window.KinojoAuth?.getSession?.()?.token||'').trim();
    return /^kws_[A-Za-z0-9_-]{40,80}$/.test(token)?token:'';
  }

  function attachButtons(root=document){
    if(!isMaster())return;
    root.querySelectorAll?.('#adminMemberImageModal [data-admin-image-preview]').forEach(preview=>{
      const actions=preview.closest('.admin-row-actions');
      if(!actions||actions.querySelector('[data-admin-image-download]'))return;
      const button=document.createElement('button');
      button.className='admin-btn';
      button.type='button';
      button.dataset.adminImageDownload='';
      button.textContent='다운로드';
      actions.appendChild(button);
    });
  }

  async function download(button){
    if(!isMaster())return;
    const modal=$('#adminMemberImageModal');
    const character=button?.closest?.('[data-admin-member-image-character]');
    const slotRow=button?.closest?.('[data-admin-image-slot]');
    const memberId=String(modal?.dataset.memberId||'').trim();
    const characterId=String(character?.dataset.adminMemberImageCharacter||'').trim();
    const slot=String(slotRow?.dataset.adminImageSlot||'').trim().toUpperCase();
    if(!modal?.classList.contains('active')||!/^\d+$/.test(memberId)||!/^\d+$/.test(characterId)||!SLOTS.includes(slot))return;
    const token=sessionToken();
    const client=window.KinojoSupabaseClientCore;
    if(!token)throw new Error('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.');
    if(!client||typeof client.invokeEdgeFunction!=='function')throw new Error('회원 이미지 다운로드 모듈을 준비하지 못했습니다.');
    button.disabled=true;
    try{
      const data=await client.invokeEdgeFunction('kinojo-member-image-download',{action:'admin-image-download',sessionToken:token,memberId:Number(memberId),characterId:Number(characterId),slot});
      if(!data||data.ok!==true)throw new Error(data?.message||data?.code||'ADMIN_MEMBER_IMAGE_DOWNLOAD_FAILED');
      if(Number(data.targetMemberId)!==Number(memberId)||Number(data.characterId)!==Number(characterId)||String(data.slot||'')!==slot)throw new Error('ADMIN_MEMBER_IMAGE_DOWNLOAD_BINDING_MISMATCH');
      if(String(data.privacy||'')!=='SIGNED_DOWNLOAD_URL_ONLY_NO_OBJECT_PATH'||String(data.purpose||'')!=='EXPLICIT_DOWNLOAD_ONLY'||data.download?.attachment!==true)throw new Error('ADMIN_MEMBER_IMAGE_DOWNLOAD_PRIVACY_MISMATCH');
      const cfg=await client.ensureConfig();
      const url=new URL(String(data.download?.url||''));
      const expected=new URL(String(cfg.url||''));
      const filename=String(data.download?.filename||'').trim();
      if(!/^[A-Za-z0-9._-]{1,180}$/.test(filename))throw new Error('ADMIN_MEMBER_IMAGE_DOWNLOAD_FILENAME_INVALID');
      if(url.origin!==expected.origin||!url.pathname.startsWith('/storage/v1/object/sign/')||!url.searchParams.get('token')||url.searchParams.get('download')!==filename)throw new Error('ADMIN_MEMBER_IMAGE_DOWNLOAD_URL_INVALID');
      const a=document.createElement('a');
      a.href=url.toString();
      a.download=filename;
      a.rel='noopener';
      a.hidden=true;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('이미지 다운로드를 시작했습니다.');
      return data;
    }finally{
      button.disabled=false;
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-admin-image-download]');
    if(!button)return;
    event.preventDefault();
    download(button).catch(error=>toast(error?.message||String(error)));
  });

  const observer=new MutationObserver(records=>{
    if(!isMaster())return;
    records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)attachButtons(node);}));
    attachButtons(document);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>attachButtons(document),{once:true});
  else attachButtons(document);

  Object.assign(A,{downloadAdminMemberImage:download,attachAdminMemberImageDownloadButtons:attachButtons});
})(window.KinojoAdmin);
