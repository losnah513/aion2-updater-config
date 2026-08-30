/*
 * KINOJO Sanctuary image copy for the canonical Server page.
 * It recreates the retired team > force > two parties > five slots capture
 * layout entirely in the browser and never writes team data back to Server.
 */
(function(){
  'use strict';

  const CLASS_ICON_MAP={
    '검성':'gladiator','수호성':'templar','궁성':'ranger','살성':'assassin',
    '마도성':'sorcerer','정령성':'elementalist','치유성':'cleric','호법성':'chanter','권성':'fighter'
  };
  const DAYS=['일','월','화','수','목','금','토'];
  const bridge=()=>window.KinojoSanctuaryManagementCopyBridge;
  const text=value=>String(value??'').trim();
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeFilename=value=>text(value).replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'-').slice(0,72)||'sanctuary';
  const classIconPath=className=>{const slug=CLASS_ICON_MAP[text(className).replace(/\s+/g,'')];return slug?'/assets/images/classes/class_icon_'+slug+'.png':'';};

  function notify(message,tone='success'){
    if(tone==='success'&&window.KinojoToast?.success){window.KinojoToast.success(message);return;}
    if(tone==='error'&&window.KinojoToast?.error){window.KinojoToast.error(message);return;}
    if(window.KinojoToast?.show){window.KinojoToast.show(message,{type:tone==='warning'?'warning':tone});return;}
    console[tone==='error'?'warn':'log'](message);
  }

  function scheduleText(team){
    const schedule=team?.schedule||{};const time=text(schedule.startsAt)||'시간 미정';
    const duration=number(schedule.durationMinutes);const durationLabel=duration===0?'무제한':duration%60===0?duration/60+'시간':duration+'분';
    if(text(schedule.kind)==='WEEKLY'){
      const weekdays=(Array.isArray(schedule.weekdays)?schedule.weekdays:[]).map(day=>DAYS[number(day)]).filter(Boolean).join('·');
      return '매주 '+(weekdays||'요일 미정')+' '+time+' · '+durationLabel;
    }
    return (text(schedule.startsOn)||'날짜 미정')+' '+time+' · '+durationLabel;
  }

  function normalizeForce(force){
    const parties=[1,2].map(partyNo=>{
      const source=(Array.isArray(force?.parties)?force.parties:[]).find(item=>number(item.partyNo)===partyNo)||{};
      const slots=Array.isArray(source.slots)?source.slots.slice(0,5):[];
      while(slots.length<5)slots.push({slotNo:slots.length+1,occupied:false,character:null});
      return {partyNo,slots:slots.map((slot,index)=>Object.assign({slotNo:index+1,occupied:false,character:null},slot))};
    });
    return {forceId:number(force?.forceId),forceNo:number(force?.forceNo)||1,occupiedCount:number(force?.occupiedCount),capacity:number(force?.capacity)||10,parties};
  }

  async function blobDataUrl(blob){
    return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||new Error('이미지 변환 실패'));reader.readAsDataURL(blob);});
  }
  async function embeddedIcons(forces){
    const paths=new Set();forces.forEach(force=>force.parties.forEach(party=>party.slots.forEach(slot=>{const path=slot.occupied?classIconPath(slot.character?.className):'';if(path)paths.add(path);})));const result=new Map();
    await Promise.all(Array.from(paths,path=>fetch(path,{cache:'force-cache'}).then(response=>{if(!response.ok)throw new Error('클래스 아이콘 HTTP '+response.status);return response.blob();}).then(blobDataUrl).then(url=>result.set(path,url)).catch(()=>result.set(path,''))));
    return result;
  }

  function slotMarkup(slot,index,icons){
    const character=slot.occupied&&slot.character?slot.character:null;const className=text(character?.className);const path=classIconPath(className);const icon=icons.get(path);
    const iconMarkup=icon?'<img src="'+escapeHtml(icon)+'" alt="" />':'<span>'+escapeHtml(character?(Array.from(className||'?')[0]||'?'):'+')+'</span>';
    return '<div class="slot '+(character?'occupied':'empty')+'"><b>'+escapeHtml(index)+'</b><i>'+iconMarkup+'</i><div><strong>'+escapeHtml(character?.name||'빈 슬롯')+'</strong><small>'+escapeHtml(character?'['+(text(character.serverName)||'서버 미상')+'] · '+(className||'클래스 미상'):'[대기] · 파티 인원 모집중')+'</small></div></div>';
  }
  function partyMarkup(party,icons){
    const occupied=party.slots.filter(slot=>slot.occupied).length;
    return '<section class="party"><header><strong>'+party.partyNo+'파티</strong><span>'+occupied+' / 5</span></header><div>'+party.slots.map((slot,index)=>slotMarkup(slot,index+1,icons)).join('')+'</div></section>';
  }
  function forceMarkup(force,icons,single){
    return '<article class="force '+(single?'single':'')+'"><header><strong>'+force.forceNo+'포스</strong><span>'+force.occupiedCount+' / '+force.capacity+'명</span></header><div class="parties">'+force.parties.map(party=>partyMarkup(party,icons)).join('')+'</div></article>';
  }

  function captureCss(single){return `
    *{box-sizing:border-box}body{margin:0;background:#edf2fa;color:#18233b;font-family:Arial,"Noto Sans KR",sans-serif}.capture{width:100%;height:100%;padding:38px;background:radial-gradient(circle at 10% 0%,#dbeafe,transparent 420px),linear-gradient(180deg,#f8faff,#edf2fa)}
    .capture-head{min-height:92px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:19px 23px;border-radius:17px;background:linear-gradient(135deg,#1f3966,#6250b7);color:#fff}.capture-head>div{min-width:0}.capture-head small{display:block;color:#bcd3ff;font-size:13px;font-weight:900;letter-spacing:.12em}.capture-head h1{margin:5px 0 4px;font-size:28px;line-height:1.12}.capture-head p{margin:0;color:#e1e8ff;font-size:13px;font-weight:700}.capture-head>strong{flex:0 0 auto;padding:8px 11px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(255,255,255,.12);font-size:12px}
    .forces{display:grid;grid-template-columns:${single?'1fr':'repeat(2,minmax(0,1fr))'};gap:18px;margin-top:18px}.force{min-width:0;padding:16px;border:1px solid #d7dfed;border-radius:16px;background:linear-gradient(180deg,#fff,#f6f8fd);box-shadow:0 10px 26px rgba(38,54,90,.08)}.force>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 3px 12px;border-bottom:1px solid #dfe5ef}.force>header strong{font-size:${single?'22px':'17px'}}.force>header span{color:#63728a;font-size:12px;font-weight:900}.parties{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.party{min-width:0;padding:9px;border:1px solid #e0e6ef;border-radius:12px;background:#fff}.party>header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 3px 7px}.party>header strong{font-size:${single?'15px':'12px'}}.party>header span{color:#8490a3;font-size:10px;font-weight:900}.party>div{display:grid;gap:6px}.slot{min-width:0;height:${single?'57px':'43px'};display:grid;grid-template-columns:24px 34px minmax(0,1fr);align-items:center;gap:7px;padding:5px 7px;border:1px solid transparent;border-radius:9px;background:#f1f4f9}.slot.occupied{border-color:#d5def5;background:linear-gradient(135deg,#e8eeff,#f2f3ff)}.slot>b{color:#7d899c;font-size:10px;text-align:center}.slot>i{width:${single?'34px':'30px'};height:${single?'34px':'30px'};display:grid;place-items:center;overflow:hidden;border-radius:8px;background:#dfe6f2;color:#6e7d92;font-size:10px;font-style:normal;font-weight:900}.slot.occupied>i{background:linear-gradient(135deg,#315fe8,#7150eb);color:#fff}.slot>i img{display:block;width:100%;height:100%;object-fit:cover}.slot>div{min-width:0;display:grid;gap:3px}.slot strong,.slot small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.slot strong{font-size:${single?'13px':'10px'}}.slot small{color:#74839b;font-size:${single?'10px':'8px'};font-weight:700}.capture-foot{margin-top:14px;color:#7a879a;font-size:10px;font-weight:800;text-align:right}
  `;}

  async function renderPng(team,targetForce){
    const forces=(targetForce?[targetForce]:Array.isArray(team?.forces)?team.forces:[]).map(normalizeForce);if(!forces.length)throw new Error('복사할 포스가 없습니다.');
    const single=Boolean(targetForce);const columns=single?1:2;const rows=Math.ceil(forces.length/columns);const width=1200;const height=(single?690:174+rows*385)+38;const icons=await embeddedIcons(forces);const sanctuary=bridge()?.selectedSanctuary?.()||{};
    const title=single?(number(targetForce.forceNo)||1)+'포스':text(team.title)||'이름 없는 팀';const subtitle=single?(text(team.title)||'이름 없는 팀')+' · '+scheduleText(team):scheduleText(team)+' · '+forces.length+'포스 · '+number(team.occupiedCount)+'/'+number(team.slotCount)+'명';
    const markup='<div xmlns="http://www.w3.org/1999/xhtml" class="capture"><style>'+captureCss(single)+'</style><header class="capture-head"><div><small>성역 '+escapeHtml(sanctuary.displayOrder||'')+' · '+escapeHtml(text(sanctuary.name)||'KINOJO SANCTUARY')+'</small><h1>'+escapeHtml(title)+'</h1><p>'+escapeHtml(subtitle)+'</p></div><strong>'+escapeHtml(text(team.mode)==='PARTICIPATION'?'참여 팀':'고정 팀')+'</strong></header><main class="forces">'+forces.map(force=>forceMarkup(force,icons,single)).join('')+'</main><footer class="capture-foot">KINOJO INFO · '+escapeHtml(new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+'</footer></div>';
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><foreignObject width="100%" height="100%">'+markup+'</foreignObject></svg>';
    const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    const image=await new Promise((resolve,reject)=>{const element=new Image();element.onload=()=>resolve(element);element.onerror=()=>reject(new Error('복사 레이아웃을 이미지로 변환하지 못했습니다.'));element.src=url;});
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)throw new Error('이미지 Canvas를 만들지 못했습니다.');context.drawImage(image,0,0,width,height);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 이미지 생성에 실패했습니다.')),'image/png'));
  }

  async function writeClipboard(blobOrPromise){
    if(!window.isSecureContext||!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw new Error('이 브라우저에서는 이미지 클립보드를 바로 사용할 수 없습니다.');
    await navigator.clipboard.write([new ClipboardItem({'image/png':Promise.resolve(blobOrPromise)})]);
  }
  function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}
  function openPreview(blob,filename){
    document.querySelector('.sanctuary-management-copy-preview')?.remove();const imageUrl=URL.createObjectURL(blob);const layer=document.createElement('section');layer.className='sanctuary-management-copy-preview';layer.innerHTML='<div class="sanctuary-management-copy-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="sanctuaryCopyPreviewTitle"><header><strong id="sanctuaryCopyPreviewTitle">복사 이미지 미리보기</strong><button type="button" data-copy-close aria-label="닫기">×</button></header><div class="sanctuary-management-copy-preview-body"><img src="'+escapeHtml(imageUrl)+'" alt="생성된 성역 팀 편성 이미지"></div><footer><span>브라우저가 자동 복사를 막은 경우 다시 복사하거나 PNG로 저장할 수 있습니다.</span><div><button type="button" class="is-primary" data-copy-retry>이미지 복사</button><button type="button" data-copy-download>PNG 저장</button></div></footer></div>';
    const close=()=>{URL.revokeObjectURL(imageUrl);layer.remove();};layer.querySelector('[data-copy-close]').addEventListener('click',close);layer.addEventListener('click',event=>{if(event.target===layer)close();});layer.querySelector('[data-copy-download]').addEventListener('click',()=>downloadBlob(blob,filename));layer.querySelector('[data-copy-retry]').addEventListener('click',async()=>{try{await writeClipboard(blob);notify('이미지가 클립보드에 복사되었습니다.');close();}catch(error){notify(text(error?.message)||'이미지 복사에 실패했습니다.','error');}});document.body.appendChild(layer);layer.querySelector('[data-copy-close]').focus();
  }

  async function copyFromButton(button){
    if(!button||button.disabled)return;const team=bridge()?.findTeam?.(button.dataset.sanctuaryCopyTeam);const forceId=number(button.dataset.sanctuaryCopyForce);const force=forceId?(Array.isArray(team?.forces)?team.forces:[]).find(item=>number(item.forceId)===forceId):null;if(!team||forceId&&!force){notify('복사할 팀·포스 데이터를 찾지 못했습니다.','error');return;}
    document.documentElement.dataset.sanctuaryCopyState='rendering';
    const title=force?force.forceNo+'포스':text(team.title)||'성역 팀';const filename='kinojo-'+safeFilename(title)+'.png';const oldHtml=button.innerHTML;button.disabled=true;button.setAttribute('aria-busy','true');
    const pngPromise=renderPng(team,force);
    try{await writeClipboard(pngPromise);await pngPromise;document.documentElement.dataset.sanctuaryCopyState='copied';notify(force?'포스 이미지가 클립보드에 복사되었습니다.':'팀 전체 이미지가 클립보드에 복사되었습니다.');}
    catch(error){try{const blob=await pngPromise;document.documentElement.dataset.sanctuaryCopyState='preview';openPreview(blob,filename);notify('이미지를 만들었습니다. 미리보기에서 복사를 완료해 주세요.','warning');}catch(renderError){document.documentElement.dataset.sanctuaryCopyState='error';notify(text(renderError?.message||error?.message)||'이미지 생성에 실패했습니다.','error');}}
    finally{button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=oldHtml;}
  }

  function bind(){
    if(document.documentElement.dataset.sanctuaryCopyBound==='true')return;
    document.documentElement.dataset.sanctuaryCopyBound='true';
    document.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-sanctuary-copy-team]');
      if(!button)return;
      document.documentElement.dataset.sanctuaryCopyLast=button.dataset.sanctuaryCopyForce?'force':'team';
      event.preventDefault();event.stopPropagation();copyFromButton(button);
    },true);
  }

  window.KinojoSanctuaryManagementCopy=Object.freeze({copyFromButton,renderPng,version:'20260830_01_browser_legacy_layout'});
  document.documentElement.dataset.sanctuaryCopyReady='true';
  bind();
})();
