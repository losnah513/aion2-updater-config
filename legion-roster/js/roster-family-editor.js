/* Roster family editor: draft placement only; Server owns relationships and authorization. */
(function(){
  'use strict';
  const openButton=document.getElementById('rosterFamilyEdit');if(!openButton)return;
  const dialog=document.createElement('dialog');dialog.className='roster-link-dialog';dialog.setAttribute('aria-labelledby','rosterLinkTitle');
  dialog.innerHTML=`<header class="roster-link-header"><h2 id="rosterLinkTitle">본캐·부캐 연결</h2><button type="button" class="kinojo-btn secondary" data-close>닫기</button></header>
    <div class="roster-link-content"><form class="roster-link-search"><label for="rosterLinkQuery">캐릭터 불러오기</label><div><input class="kinojo-input" id="rosterLinkQuery" placeholder="캐릭터 이름 검색" maxlength="80" autocomplete="off"><button class="kinojo-btn" type="submit">조회</button></div></form>
    <div class="roster-link-results" aria-live="polite"></div>
    <section class="roster-link-pool"><h3>불러온 캐릭터</h3><div class="roster-link-pool-zone" data-zone="pool"></div></section>
    <div class="roster-link-board" aria-label="본캐·부캐 배치"><section class="roster-link-main" data-zone="main"><h3>본캐</h3><div class="roster-link-main-cards"></div></section><section class="roster-link-alts" data-zone="alts"><h3>부캐 <span></span></h3><div class="roster-link-alt-cards"></div></section><svg class="roster-link-wires" aria-hidden="true"></svg></div>
    <p class="roster-link-message" role="status" aria-live="polite"></p></div>
    <footer class="roster-link-footer"><small>레기온과 이미지는 유지됩니다.</small><div><button class="kinojo-btn secondary" type="button" data-close>취소</button><button class="kinojo-btn" type="button" data-save disabled>연결 저장</button></div></footer>`;
  document.body.append(dialog);
  const $=s=>dialog.querySelector(s),board=$('.roster-link-board'),mainZone=$('[data-zone="main"]'),altZone=$('[data-zone="alts"]'),poolZone=$('[data-zone="pool"]'),wires=$('svg');
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  let cards=new Map(),families=new Map(),main=null,alts=[],positions=new Map(),detached=new Set(),pointer=null,busy=false,saved=false,generation=0,requestId=null,animationFrame=0;
  const allowed=()=>{const a=window.KinojoAuth?.getAccount?.();return a?.canManage===true||window.KinojoPermissions?.canManage?.(a)===true;};
  const say=message=>{$('.roster-link-message').textContent=message||'';};
  const pool=()=>[...cards.keys()].filter(id=>id!==main&&!alts.includes(id)&&!detached.has(id));
  const changed=()=>main&&(detached.size>0||[...cards.values()].some(c=>c.mainCharacterId!==main||c.isMain!==(c.characterId===main)));
  function controls(){openButton.hidden=!allowed();dialog.querySelectorAll('input,button').forEach(b=>b.disabled=busy||saved||!allowed()||(b.dataset.characterId&&!cards.get(b.dataset.characterId)?.available));$('[data-save]').disabled=busy||saved||!allowed()||!main||pool().length>0||!changed()||[...cards.values()].some(c=>!c.available);dialog.setAttribute('aria-busy',String(busy));}
  function clear(){generation++;cards.clear();families.clear();main=null;alts=[];positions.clear();detached.clear();requestId=null;pointer=null;busy=false;saved=false;$('.roster-link-results').replaceChildren();$('#rosterLinkQuery').value='';render();say('캐릭터를 조회해 연결된 가족을 불러오세요.');}
  function close(){if(busy)return;confirmDialog.close();dialog.close();clear();openButton.focus();}
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  openButton.onclick=()=>{if(!allowed())return;clear();dialog.showModal();$('#rosterLinkQuery').focus();};
  window.addEventListener('kinojo:auth-changed',()=>{if(!allowed()&&dialog.open){generation++;confirmDialog.close();dialog.close();cards.clear();families.clear();detached.clear();}controls();});
  const confirmDialog=document.createElement('dialog');confirmDialog.className='roster-link-dialog roster-unlink-dialog';confirmDialog.setAttribute('aria-labelledby','rosterUnlinkTitle');
  confirmDialog.innerHTML='<header class="roster-link-header"><h2 id="rosterUnlinkTitle">부캐 연결 해제</h2></header><div class="roster-link-content"><p class="roster-unlink-question"></p><small>연결 저장을 누르면 독립 본캐로 반영됩니다.</small></div><footer class="roster-link-footer"><div><button type="button" class="kinojo-btn" data-unlink-confirm>확인</button><button type="button" class="kinojo-btn secondary" data-unlink-cancel>취소</button></div></footer>';
  document.body.append(confirmDialog);let unlinkId=null,unlinkOrigin=null;
  function cancelUnlink(){confirmDialog.close();unlinkId=null;unlinkOrigin?.focus();}
  confirmDialog.querySelector('[data-unlink-cancel]').onclick=cancelUnlink;
  confirmDialog.addEventListener('cancel',e=>{e.preventDefault();cancelUnlink();});
  function askUnlink(id,origin){if(confirmDialog.open||busy||saved||!allowed()||!main||!alts.includes(id))return;unlinkId=id;unlinkOrigin=origin;confirmDialog.querySelector('.roster-unlink-question').textContent='['+cards.get(id).name+']캐릭터를 ['+cards.get(main).name+']의 부캐에서 제외합니다.';confirmDialog.showModal();confirmDialog.querySelector('[data-unlink-cancel]').focus();}
  confirmDialog.querySelector('[data-unlink-confirm]').onclick=()=>{if(busy||saved||!allowed()||!alts.includes(unlinkId)){cancelUnlink();return;}const id=unlinkId;confirmDialog.close();unlinkId=null;alts=alts.filter(x=>x!==id);detached.add(id);positions.delete(id);requestId=null;render();say('연결 해제를 준비했습니다. 연결 저장을 누르면 반영됩니다.');$('[data-character-id="'+id+'"] .roster-link-drag')?.focus();};
  function messageFor(error){return error?.status===401?'로그인이 만료되었습니다. 다시 로그인해 주세요.':error?.message||'요청을 완료하지 못했습니다. 다시 시도해 주세요.';}
  async function call(action,payload){const result=await window.KinojoSupabase.rosterFamily(action,payload);if(result?.ok!==true||result.contract!=='roster-family-v477')throw new Error(result?.message||'연결 응답을 확인하지 못했습니다.');return result;}
  $('.roster-link-search').onsubmit=async e=>{
    e.preventDefault();if(busy||saved||e.isComposing||!allowed())return;const query=$('#rosterLinkQuery').value.trim();if(!query){say('캐릭터 이름을 입력해 주세요.');return;}
    const token=++generation;busy=true;controls();say('조회 중입니다.');$('.roster-link-results').replaceChildren();
    try{const result=await call('family-search',{query});if(token!==generation||!dialog.open)return;
      for(const c of result.items||[]){const row=document.createElement('div');row.className='roster-link-result';const label=document.createElement('span');label.textContent=c.name+' ['+c.serverName+'] · '+(c.legion||'소속 없음');const button=document.createElement('button');button.className='kinojo-btn';button.textContent='불러오기';button.type='button';button.onclick=()=>load(c.characterId);row.append(label,button);$('.roster-link-results').append(row);}
      say(result.items?.length===30?'조회 결과 30명입니다. 이름을 더 정확히 입력할 수 있습니다.':result.items?.length?'캐릭터를 선택하면 연결된 가족도 함께 불러옵니다.':'조회 결과가 없습니다.');
    }catch(error){if(token===generation)say(messageFor(error));}finally{if(token===generation){busy=false;controls();}}
  };
  async function load(characterId){
    if(busy||saved||!allowed())return;const token=++generation;busy=true;controls();
    try{const {family}=await call('family-load',{characterId:String(characterId)});if(token!==generation||!dialog.open)return;
      if(!family||!Array.isArray(family.items))throw new Error('가족 정보를 확인하지 못했습니다.');
      if(families.has(family.rootId)){if(families.get(family.rootId).revision!==family.revision)throw new Error('가족 관계가 변경되었습니다. 닫은 뒤 다시 불러와 주세요.');say('이미 불러온 가족입니다.');return;}
      if(family.items.some(c=>cards.has(c.characterId)))throw new Error('불러온 가족의 관계가 변경되었습니다. 닫은 뒤 다시 불러와 주세요.');
      if(cards.size+family.items.length>100)throw new Error('한 번에 100명까지 연결할 수 있습니다.');
      const first=cards.size===0;families.set(family.rootId,{rootId:family.rootId,revision:family.revision});family.items.forEach(c=>cards.set(c.characterId,c));
      if(first){main=family.items.find(c=>c.characterId===family.rootId&&c.isMain)?.characterId||null;alts=family.items.filter(c=>c.characterId!==main).map(c=>c.characterId);}
      requestId=null;$('.roster-link-results').replaceChildren();render();say('카드를 끌어 본캐·부캐 영역에 배치하세요.');
    }catch(error){if(token===generation)say(messageFor(error));}finally{if(token===generation){busy=false;controls();}}
  }
  function card(id){const c=cards.get(id),b=document.createElement('div');b.setAttribute('role','group');b.className='roster-link-card';b.dataset.characterId=id;b.draggable=false;b.setAttribute('aria-label',c.name+' ['+c.serverName+']');const name=document.createElement('strong'),meta=document.createElement('small');name.textContent=c.name;meta.textContent=c.serverName+' · '+(c.legion||'소속 없음');const body=document.createElement('button');body.type='button';body.className='roster-link-drag';body.setAttribute('aria-label',c.name+' ['+c.serverName+']');body.append(name,meta);b.append(body);body.disabled=busy||saved||!c.available;
    if(detached.has(id)){b.classList.add('is-detached');const badge=document.createElement('span');badge.className='roster-unlink-pending';badge.textContent='해제 예정';b.append(badge);}
    if(alts.includes(id)){const remove=document.createElement('button');remove.type='button';remove.className='roster-unlink-button';remove.textContent='−';remove.setAttribute('aria-label',c.name+' 부캐 연결 해제');remove.title='부캐 연결 해제';let press=null;remove.onpointerdown=e=>{e.stopPropagation();press={x:e.clientX,y:e.clientY};};remove.onpointercancel=()=>{press=null;};remove.onpointerup=e=>{e.stopPropagation();if(e.pointerType==='touch'&&press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)<8){e.preventDefault();askUnlink(id,remove);}press=null;};remove.onclick=e=>{e.stopPropagation();askUnlink(id,remove);};b.append(remove);}

    b.onpointerdown=e=>{if(e.target.closest('.roster-unlink-button')||e.button!==0||busy||saved||pointer||!allowed()||!c.available)return;const r=b.getBoundingClientRect();pointer={id,el:b,pid:e.pointerId,x:e.clientX,y:e.clientY,ox:e.clientX-r.left,oy:e.clientY-r.top,moved:false};dialog.setPointerCapture(e.pointerId);};
    b.onkeydown=e=>{if(e.target.closest('.roster-unlink-button')||busy||saved||!allowed())return;if(e.key==='Enter'||e.key===' '){e.preventDefault();place(id,id===main?'alts':'main');say(c.name+(id===main?' 본캐로 등록했습니다.':' 부캐로 등록했습니다.'));}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();place(id,'pool');}else if(alts.includes(id)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const p=positions.get(id);p.x+=e.key==='ArrowRight'?10:e.key==='ArrowLeft'?-10:0;p.y+=e.key==='ArrowDown'?10:e.key==='ArrowUp'?-10:0;layout();}};
    return b;
  }
  function render(){
    const fill=(el,ids,text)=>{el.replaceChildren();if(ids.length)ids.forEach(id=>el.append(card(id)));else{const hint=document.createElement('span');hint.className='roster-link-empty';hint.textContent=text;el.append(hint);}};
    fill(poolZone,[...pool(),...detached],'배치를 해제할 카드는 이곳으로 옮기세요.');fill($('.roster-link-main-cards'),main?[main]:[],'본캐 카드를 놓으세요.');fill($('.roster-link-alt-cards'),alts,'부캐 카드를 자유롭게 놓으세요.');$('.roster-link-alts h3 span').textContent=alts.length?alts.length+'명':'';controls();layout();
  }
  function layout(){const zone=$('.roster-link-alt-cards'),columns=Math.max(1,Math.floor((zone.clientWidth-16)/170));const required=52+Math.ceil(alts.length/columns)*70;board.style.setProperty('--roster-link-extra',Math.max(0,required-220)+'px');alts.forEach((id,i)=>{const el=zone.querySelector('[data-character-id="'+id+'"]');const p=positions.get(id)||{x:16+(i%columns)*170,y:46+Math.floor(i/columns)*70};p.x=Math.max(6,Math.min(p.x,zone.clientWidth-el.offsetWidth-6));p.y=Math.max(36,Math.min(p.y,zone.clientHeight-el.offsetHeight-6));positions.set(id,p);el.style.left=p.x+'px';el.style.top=p.y+'px';});draw();}
  function draw(){wires.replaceChildren();const source=$('.roster-link-main-cards .roster-link-card');if(!source)return;const area=board.getBoundingClientRect(),s=source.getBoundingClientRect(),mobile=matchMedia('(max-width:600px)').matches;wires.setAttribute('viewBox','0 0 '+area.width+' '+area.height);
    alts.forEach(id=>{const el=$('.roster-link-alt-cards [data-character-id="'+id+'"]');if(!el)return;const t=el.getBoundingClientRect(),x1=(mobile?s.left+s.width/2:s.right)-area.left,y1=(mobile?s.bottom:s.top+s.height/2)-area.top,x2=(mobile?t.left+t.width/2:t.left)-area.left,y2=(mobile?t.top:t.top+t.height/2)-area.top,d=Math.max(30,Math.abs(mobile?y2-y1:x2-x1)*.5);const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',mobile?`M ${x1} ${y1} C ${x1} ${y1+d}, ${x2} ${y2-d}, ${x2} ${y2}`:`M ${x1} ${y1} C ${x1+d} ${y1}, ${x2-d} ${y2}, ${x2} ${y2}`);wires.append(path);for(const[x,y]of[[x1,y1],[x2,y2]]){const port=document.createElementNS(wires.namespaceURI,'circle');port.setAttribute('cx',x);port.setAttribute('cy',y);port.setAttribute('r',3);wires.append(port);}});
  }
  function place(id,zone){if(!cards.has(id)||busy||saved)return;detached.delete(id);const previous=main;alts=alts.filter(x=>x!==id);if(main===id)main=null;if(zone==='main'){main=id;if(previous&&previous!==id)alts.unshift(previous);}else if(zone==='alts')alts.push(id);requestId=null;render();}
  const nearMain=(x,y)=>{const r=mainZone.getBoundingClientRect();return x>=r.left-28&&x<=r.right+28&&y>=r.top-24&&y<=r.bottom+24;};
  function animatePlace(id,zone,from){const old=main,oldRect=$('.roster-link-main-cards .roster-link-card')?.getBoundingClientRect();place(id,zone);if(reduced.matches)return;const animations=[];function glide(cid,r){const el=$('[data-character-id="'+cid+'"]');if(!el||!r)return;const end=el.getBoundingClientRect();animations.push(el.animate([{transform:`translate(${r.left-end.left}px,${r.top-end.top}px)`},{transform:'translate(0,0)'}],{duration:zone==='main'?280:180,easing:'cubic-bezier(.2,.85,.25,1.08)'}));}glide(id,from);if(zone==='main'&&old&&old!==id)glide(old,oldRect);cancelAnimationFrame(animationFrame);function tick(){if(!dialog.open)return;draw();if(animations.some(a=>a.playState==='running'))animationFrame=requestAnimationFrame(tick);}animationFrame=requestAnimationFrame(tick);}
  dialog.addEventListener('pointermove',e=>{if(!pointer||pointer.pid!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(!pointer.moved&&Math.hypot(dx,dy)<5)return;pointer.moved=true;pointer.el.classList.add('is-dragging');pointer.el.style.transform=`translate(${dx}px,${dy}px)`;mainZone.classList.toggle('is-magnet',nearMain(e.clientX,e.clientY));draw();});
  function cancelPointer(){if(pointer){pointer.el.style.transform='';pointer.el.classList.remove('is-dragging');pointer=null;}mainZone.classList.remove('is-magnet');draw();}
  dialog.addEventListener('pointercancel',cancelPointer);
  dialog.addEventListener('pointerup',e=>{if(!pointer||pointer.pid!==e.pointerId)return;const p=pointer,from=p.el.getBoundingClientRect();cancelPointer();if(!p.moved)return;const inside=el=>{const r=el.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;};if(nearMain(e.clientX,e.clientY))animatePlace(p.id,'main',from);else if(inside(altZone)){const r=$('.roster-link-alt-cards').getBoundingClientRect();positions.set(p.id,{x:e.clientX-r.left-p.ox,y:e.clientY-r.top-p.oy});animatePlace(p.id,'alts',from);}else if(inside(poolZone))animatePlace(p.id,'pool',from);else layout();say(pool().length?'불러온 캐릭터를 모두 배치한 뒤 저장하세요.':'배치한 연결을 저장할 수 있습니다.');});
  $('[data-save]').onclick=async()=>{
    if(busy||saved||!main||pool().length||!allowed())return;const token=++generation;requestId=requestId||crypto.randomUUID();busy=true;controls();say('연결을 저장하고 있습니다.');
    try{await call('family-save',{requestId,mainCharacterId:main,altCharacterIds:[...alts],detachedCharacterIds:[...detached],expectedFamilies:[...families.values()]});if(token!==generation)return;saved=true;busy=false;controls();say('연결을 저장했습니다. 명부를 새로 불러옵니다.');
      try{await window.KinojoRoster?.refresh();}catch(_error){say('연결은 저장되었습니다. 명부를 새로고침해 주세요.');dialog.querySelectorAll('[data-close]').forEach(b=>b.disabled=false);return;}
      dialog.close();clear();openButton.focus();
    }catch(error){if(token===generation)say(messageFor(error));}finally{if(token===generation){busy=false;controls();if(saved)dialog.querySelectorAll('[data-close]').forEach(b=>b.disabled=false);}}
  };
  new ResizeObserver(()=>{if(dialog.open&&!pointer)layout();}).observe(board);
  controls();
})();
