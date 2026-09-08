/* DB465 roster read client. Server owns membership, family relationships and PVE values. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id),wheel=el('rosterWheel');
  if(!wheel)return;
  const body=el('rosterBody'),detail=el('rosterDetail'),selector=el('rosterSelector');
  let legions=['깡','낮','밤','키나노동조합'],items=[],options=[],count=0;
  const step=80;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),narrow=matchMedia('(max-width:700px)');
  let legion=0,selected=0,confirmed=-1,frame=0,settle=0,composing=false;
  let interacting=false,pendingOpen=false,revision=0,timers=[],audio=null,targetIndex=null;
  const scopes=new Map();
  const label=i=>items[i]?.name||'';
  let listRevision=0,selectionRevision=0,listCursor=null,familyCursor=null,listBusy=false,familyBusy=false,activeQuery='';
  const inFlight=new Map(),cacheKeys=new Set();
  let cacheEpoch=0;
  const scopeKey=()=>el('rosterScope').checked?'all':String(legion);
  let currentScope='0';
  let familyGeneration=0;
  let activeFamily=0,detailReady=Promise.resolve(),familyLoad=null,horizontalIntent=0;
  const moreFamily=button('','다음 캐릭터 보기');moreFamily.className='roster-family-more';moreFamily.hidden=true;
  for(let i=0;i<3;i++){const arrow=document.createElement('span');arrow.textContent='›';arrow.setAttribute('aria-hidden','true');moreFamily.append(arrow)}
  detail.append(moreFamily);
  const prevFamily=button('','이전 캐릭터 보기');prevFamily.className='roster-family-prev';prevFamily.hidden=true;
  for(let i=0;i<3;i++){const arrow=document.createElement('span');arrow.textContent='‹';arrow.setAttribute('aria-hidden','true');prevFamily.append(arrow)}
  detail.append(prevFamily);
  function updateFamilyHint(){
    const family=el('rosterFamily');
    const last=family.lastElementChild,frame=family.getBoundingClientRect();
    moreFamily.hidden=!body.classList.contains('has-selection')||!(familyCursor||(last&&last.getBoundingClientRect().right>frame.right+1));
    prevFamily.hidden=!body.classList.contains('has-selection')||!(activeFamily>0||(family.firstElementChild&&family.firstElementChild.getBoundingClientRect().left<frame.left-1));
  }
  function selectFamily(index,scroll=false){
    const family=el('rosterFamily'),cards=Array.from(family.children);if(!cards.length)return;
    activeFamily=Math.max(0,Math.min(cards.length-1,index));
    cards.forEach((card,i)=>{card.classList.toggle('is-family-active',i===activeFamily);card.tabIndex=i===activeFamily?0:-1;card.setAttribute('aria-current',String(i===activeFamily))});
    if(scroll){cards[activeFamily].scrollIntoView({block:'nearest',inline:'center',behavior:reduced.matches?'instant':'smooth'});cards[activeFamily].focus({preventScroll:true})}
    updateFamilyHint();
  }
  async function moveFamily(direction){
    const intent=++horizontalIntent;
    if(interacting||confirmed!==selected||!body.classList.contains('has-selection')){
      wheel.scrollTo({top:(targetIndex??selected)*step,behavior:'instant'});draw();pendingOpen=true;finish();
    }
    await detailReady;if(intent!==horizontalIntent||!body.classList.contains('has-selection'))return;
    const token=selectionRevision;
    if(direction>0&&activeFamily+1>=el('rosterFamily').children.length&&familyCursor)await loadFamilyPage();
    if(token!==selectionRevision||intent!==horizontalIntent)return;
    selectFamily(activeFamily+direction,true);
  }
  moreFamily.addEventListener('click',()=>moveFamily(1));
  prevFamily.addEventListener('click',()=>moveFamily(-1));
  const imageObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){imageObserver.unobserve(entry.target);entry.target.loadLibrary?.()}
  }),{root:el('rosterFamily'),rootMargin:'0px 270px'});

  function safeImage(url){
    return typeof url==='string'&&!url.includes('..')&&(
      /^https:\/\/josvoltpktvwysrasffq\.supabase\.co\/storage\/v1\/object\/public\/kinojo-site-banners\/[0-9]{4}\/[0-9]{2}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(url)
      ||/^https:\/\/kinojo\.info\/assets\/images\/[A-Za-z0-9._/-]+\.(jpg|jpeg|png|webp)$/.test(url));
  }
  const viewer=document.createElement('dialog');viewer.className='roster-lightbox';viewer.setAttribute('aria-label','캐릭터 이미지 전체화면');
  const viewerImage=document.createElement('img'),viewerTools=document.createElement('div'),viewerStatus=document.createElement('p');
  viewerTools.className='roster-lightbox-tools';viewerStatus.setAttribute('role','status');
  function button(text,label){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',label||text);return b}
  const download=button('다운로드'),closeViewer=button('닫기');
  viewerTools.append(download,closeViewer);viewer.append(viewerImage,viewerTools,viewerStatus);document.body.append(viewer);
  let viewed=null,viewerOrigin=null,downloadController=null;
  closeViewer.addEventListener('click',()=>viewer.close());
  viewer.addEventListener('close',()=>{downloadController?.abort();downloadController=null;viewed=null;viewerImage.removeAttribute('src');viewerOrigin?.focus({preventScroll:true});viewerOrigin=null});
  viewerImage.addEventListener('error',()=>{viewerStatus.textContent='이미지를 불러오지 못했습니다. 닫고 다시 시도하세요.'});
  function openImage(asset,row,origin){
    viewed={asset,row};viewerOrigin=origin;viewerStatus.textContent='';download.disabled=false;
    viewerImage.src=asset.url;viewerImage.alt=asset.alt||row.name;viewer.showModal();closeViewer.focus();
  }
  download.addEventListener('click',async()=>{
    if(!viewed||downloadController)return;
    const current=viewed,controller=new AbortController();downloadController=controller;
    download.disabled=true;viewerStatus.textContent='원본을 준비하고 있습니다.';
    const timeout=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(current.asset.url,{signal:controller.signal,credentials:'omit'});
      if(!response.ok||!/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get('content-type')||''))throw new Error('IMAGE_DOWNLOAD_FAILED');
      const blob=await response.blob();if(!blob.size)throw new Error('IMAGE_DOWNLOAD_EMPTY');
      if(viewed!==current||controller.signal.aborted)return;
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      const extension=current.asset.url.match(/\.(jpg|jpeg|png|webp)$/i)[1].toLowerCase();
      link.href=url;link.download=(current.row.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,60)||'character')+'-'+current.asset.assetId+'.'+extension;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      viewerStatus.textContent='브라우저에 원본 저장을 요청했습니다.';
    }catch(error){if(viewed===current)viewerStatus.textContent='원본을 다운로드하지 못했습니다. 다시 시도하세요.'}
    finally{clearTimeout(timeout);if(downloadController===controller){downloadController=null;download.disabled=false}}
  });
  function library(article,box,row,selectedId,generation){
    let assets=[],cursor=null,total=0,index=0,busy=false,loaded=false;
    const valid=()=>generation===familyGeneration&&article.isConnected;
    const surface=button('',row.name+' 이미지 전체화면 보기');surface.className='roster-image-open';
    const img=document.createElement('img');img.alt='';surface.append(img);
    const prev=button('‹','이전 이미지'),next=button('›','다음 이미지');prev.className='roster-image-prev';next.className='roster-image-next';
    const status=document.createElement('span');status.className='roster-image-status';status.setAttribute('role','status');
    async function pageImages(reset=false){
      let data;
      try{data=await request('kinojo_web_roster_images_v467',{p_selected_character_id:selectedId,p_character_id:row.characterId,p_cursor:reset?null:cursor,p_limit:20})}
      catch(error){
        if(!reset&&error.message==='ROSTER_CURSOR_EXPIRED'){
          window.KinojoCache?.clear('roster:465:');return pageImages(true);
        }
        throw error;
      }
      if(!valid())return false;
      if(data.characterId!==row.characterId||data.selectedCharacterId!==selectedId)throw new Error('ROSTER_RESPONSE_INVALID');
      assets=reset?data.items:assets.concat(data.items);cursor=data.nextCursor;total=data.total;
      if(!total){
        box.replaceChildren();box.setAttribute('aria-hidden','true');box.classList.remove('has-library-image');
        box.classList.toggle('is-background-male',data.gender==='MALE');
        box.classList.toggle('is-background-female',data.gender==='FEMALE');
      }
      else if(total===1){prev.remove();next.remove()}
      return true;
    }
    async function display(target,flip){
      busy=true;prev.setAttribute('aria-disabled','true');next.setAttribute('aria-disabled','true');status.textContent='';
      try{
        while(target>=assets.length&&cursor){if(!await pageImages())return}
        if(!total)return;target%=total;
        const asset=assets[target];if(!asset)return;
        const preload=new Image();preload.src=asset.url;await preload.decode();if(!valid())return;
        if(flip&&!reduced.matches){const animation=surface.animate([{transform:'rotateY(0)'},{transform:'rotateY(-90deg)'}],{duration:140,fill:'forwards'});await animation.finished;animation.cancel();if(!valid())return}
        index=target;img.src=asset.url;img.alt=asset.alt||row.name;surface.dataset.assetId=asset.assetId;
        box.classList.add('has-library-image');
        box.classList.remove('is-background-male','is-background-female');
        if(flip&&!reduced.matches)surface.animate([{transform:'rotateY(90deg)'},{transform:'rotateY(0)'}],{duration:180});
        if(assets[index+1]){const ahead=new Image();ahead.src=assets[index+1].url}
      }catch(error){
        if(valid()){
          status.textContent='이미지를 불러오지 못했습니다. ';
          const retry=button('다시 시도');retry.addEventListener('click',()=>display(target,flip));status.append(retry);
        }
      }finally{busy=false;prev.setAttribute('aria-disabled','false');next.setAttribute('aria-disabled','false')}
    }
    async function turn(direction){if(busy||total<2)return;await display((index+direction+total)%total,true)}
    prev.addEventListener('click',()=>turn(-1));next.addEventListener('click',()=>turn(1));
    surface.addEventListener('click',()=>{if(assets[index]&&img.getAttribute('src'))openImage(assets[index],row,surface)});
    article.loadLibrary=async()=>{
      if(loaded)return;loaded=true;box.setAttribute('aria-busy','true');
      try{
        if(!await pageImages(true))return;
        if(!total)return;
        box.removeAttribute('aria-hidden');box.append(surface,status);if(total>1)box.append(prev,next);
        await display(0,false);
      }catch(error){
        if(valid()){
          loaded=false;box.removeAttribute('aria-hidden');status.textContent='이미지를 불러오지 못했습니다.';
          const retry=button('다시 시도');retry.addEventListener('click',()=>{box.replaceChildren();article.loadLibrary()});box.replaceChildren(status,retry);
        }
      }finally{box.removeAttribute('aria-busy')}
    };
    imageObserver.observe(article);
  }

  async function request(fn,params){
    const epoch=cacheEpoch;
    const key='roster:465:'+fn+':'+JSON.stringify(params),cache=window.KinojoCache;
    const cached=cache?.get(key);if(cached)return cached;
    if(inFlight.has(key))return inFlight.get(key);
    const task=(async()=>{
      let timeout;
      try{
        const data=await Promise.race([
          window.KinojoSupabaseRpcCore.rpc(fn,params),
          new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('ROSTER_TIMEOUT')),10000)})
        ]);
        const images=fn==='kinojo_web_roster_images_v467';
        if(!data||data.contractVersion!==(images?467:465)||!Array.isArray(data.items)||data.items.length>(params.p_limit||50)
          ||data.items.some(row=>images?(!/^\d+$/.test(row.assetId)||!safeImage(row.url)):(!/^\d+$/.test(row.characterId)||typeof row.name!=='string'))
          ||typeof data.sourceToken!=='string'||!Number.isInteger(data.total)||data.total<0)throw new Error('ROSTER_RESPONSE_INVALID');
        if(epoch===cacheEpoch){cache?.set(key,data,30000);cacheKeys.delete(key);cacheKeys.add(key)}
        while(cacheKeys.size>32){const oldest=cacheKeys.values().next().value;cacheKeys.delete(oldest);cache?.remove(oldest)}
        return data;
      }finally{clearTimeout(timeout)}
    })();
    inFlight.set(key,task);
    try{return await task}finally{if(inFlight.get(key)===task)inFlight.delete(key)}
  }
  function serverLabel(row){return row.serverName||(row.serverId?'서버 '+row.serverId:'서버 미확인')}
  function renderOptions(){
    wheel.replaceChildren();count=items.length;
    items.forEach((row,i)=>{
      const option=document.createElement('div'),card=document.createElement('span');
      option.className='roster-option';option.id='roster-option-'+i;option.dataset.characterId=row.characterId;
      option.setAttribute('role','option');
      option.setAttribute('aria-label',row.name+' · '+serverLabel(row)+' · '+row.characterId);
      card.className='roster-name-card';
      if(row.hasLibraryImage===true){
        const dot=document.createElement('span');dot.className='roster-image-dot';dot.setAttribute('aria-hidden','true');card.append(dot);
        option.title='등록된 이미지 있음';option.setAttribute('aria-label',option.getAttribute('aria-label')+' · 등록된 이미지 있음');
      }
      const name=document.createElement('strong'),caption=document.createElement('small');
      name.textContent=row.name;caption.textContent=serverLabel(row)+' · '+(row.className||'직업 미확인');
      card.append(name,caption);option.append(card);wheel.append(option);
      option.addEventListener('click',()=>move(i,true));
    });
    options=Array.from(wheel.children);
    wheel.tabIndex=count?0:-1;resize();
  }
  async function loadList(append=false,restoreId=null,openSingle=false){
    if(append&&(!listCursor||listBusy))return;
    const token=append?listRevision:++listRevision,scope=currentScope;
    if(!append){selectionRevision++;listCursor=null;items=[];count=0;renderOptions()}
    listBusy=true;wheel.setAttribute('aria-busy','true');
    el('rosterStatus').textContent='명부를 불러오는 중입니다.';
    try{
      const data=await request('kinojo_web_roster_list_v465',{
        p_mode:el('rosterScope').checked?'all':'legion',p_legion:legions[legion],
        p_query:activeQuery,p_cursor:append?listCursor:null,p_limit:50
      });
      if(token!==listRevision||scope!==currentScope)return;
      if(Array.isArray(data.legions)&&data.legions.length===4)legions=data.legions;
      items=append?items.concat(data.items):data.items;listCursor=data.nextCursor;
      if(!append)selected=0;
      if(restoreId){const index=items.findIndex(row=>row.characterId===restoreId);if(index>=0)selected=index;else if(listCursor)queueMicrotask(()=>loadList(true,restoreId));}
      renderOptions();
      el('rosterStatus').textContent=data.total?data.total+'명 · 카드를 눌러 선택하세요.':(activeQuery?'조회 결과가 없습니다.':'등록된 캐릭터가 없습니다.');
      if(openSingle&&items.length===1&&!listCursor)move(0,true);
      return true;
    }catch(error){
      if(token!==listRevision||scope!==currentScope)return;
      if(append&&error.message==='ROSTER_CURSOR_EXPIRED'){
        window.KinojoCache?.clear('roster:465:');listBusy=false;return loadList(false,items[selected]?.characterId);
      }
      el('rosterStatus').textContent='명부를 불러오지 못했습니다. 조회를 눌러 다시 시도하세요.';
      return false;
    }finally{if(token===listRevision){listBusy=false;wheel.setAttribute('aria-busy','false')}}
  }
  function renderFamily(rows,append=false){
    const family=el('rosterFamily');if(!append){familyGeneration++;imageObserver.disconnect();family.replaceChildren();family.scrollLeft=0;activeFamily=0}
    rows.forEach(row=>{
      const article=document.createElement('article');article.className='roster-character '+(row.isMain?'is-main':'is-alt');article.dataset.characterId=row.characterId;
      article.setAttribute('aria-label',row.name+' · '+(row.isMain?'본캐':'부캐'));
      article.addEventListener('pointerdown',()=>selectFamily(Array.from(family.children).indexOf(article)));
      const image=document.createElement('div');image.className='roster-image';image.setAttribute('aria-hidden','true');
      const info=document.createElement('div');info.className='roster-info';
      const kind=document.createElement('span');kind.className='roster-kind';kind.textContent=row.isMain?'본캐':'부캐';
      const heading=document.createElement('h2');
      const iconUrl=window.KinojoCommonUI?.classIconFor(row.className);
      if(iconUrl){const icon=document.createElement('img');icon.src=iconUrl;icon.alt=row.className;icon.width=22;icon.height=22;heading.append(icon)}
      const name=document.createElement('span');name.textContent=row.name;name.title=row.name;heading.append(name);
      const server=document.createElement('small');server.className='roster-server';server.textContent=serverLabel(row);
      const metrics=document.createElement('div');metrics.className='roster-metrics';
      for(const [key,alt,file] of [['itemLevel','아이템레벨','level'],['combatPower','전투력','power']]){
        const line=document.createElement('span'),icon=document.createElement('img'),value=document.createElement('b');
        icon.src='https://assets.playnccdn.com/static-aion2/characters/img/info/profile_'+file+'_icon_pc.png';icon.alt=alt;icon.width=18;icon.height=18;
        value.textContent=row[key]===null||row[key]===undefined?'—':Number(row[key]).toLocaleString('ko-KR');
        line.append(icon,value);metrics.append(line);
      }
      info.append(kind,heading,server,metrics);article.append(image,info);family.append(article);
      library(article,image,row,items[selected].characterId,familyGeneration);
      if(append)article.classList.add('is-card-visible','is-image-visible');
    });
    Array.from(family.children).forEach((card,i)=>card.style.zIndex=String(family.children.length-i));
    selectFamily(activeFamily);
  }
  async function showDetail(){
    const row=items[selected];if(!row)return;
    const token=++selectionRevision,scope=currentScope;
    cancelTransition();el('rosterStatus').textContent=row.name+' 정보를 불러오는 중입니다.';
    try{
      const data=await request('kinojo_web_roster_family_v465',{p_character_id:row.characterId,p_cursor:null,p_limit:20});
      if(token!==selectionRevision||scope!==currentScope||items[selected]?.characterId!==row.characterId)return;
      if(data.selectedCharacterId!==row.characterId)throw new Error('ROSTER_RESPONSE_INVALID');
      familyCursor=data.nextCursor;renderFamily(data.items);
      el('rosterDetailNote').textContent=data.relationshipState==='OK'?'': '본캐 연결 정보를 확인할 수 없습니다.';
      el('rosterStatus').textContent=row.name+' · '+serverLabel(row);
      animateDetail();
      updateFamilyHint();
    }catch(error){
      if(token!==selectionRevision||scope!==currentScope)return;
      el('rosterStatus').textContent='캐릭터 정보를 불러오지 못했습니다. 카드를 다시 선택하세요.';
      body.classList.remove('has-selection');detail.inert=true;
    }
  }
  async function loadFamilyPage(){
    if(familyLoad)return familyLoad;
    if(!familyCursor)return;
    const token=selectionRevision,row=items[confirmed];if(!row)return;
    familyLoad=(async()=>{
    try{
      const data=await request('kinojo_web_roster_family_v465',{p_character_id:row.characterId,p_cursor:familyCursor,p_limit:20});
      if(token!==selectionRevision)return;
      renderFamily(data.items,true);familyCursor=data.nextCursor;
    }catch(error){if(token===selectionRevision){el('rosterDetailNote').textContent='추가 정보를 불러오지 못했습니다. 카드를 다시 선택하세요.'}}
    finally{familyLoad=null;updateFamilyHint()}
    })();return familyLoad;
  }
  el('rosterFamily').addEventListener('scroll',()=>{
    const family=el('rosterFamily');updateFamilyHint();
    if(family.scrollLeft+family.clientWidth>=family.scrollWidth-100)void loadFamilyPage();
  },{passive:true});
  new ResizeObserver(updateFamilyHint).observe(el('rosterFamily'));

  function unlock(){
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      if(!audio)audio=new Audio();
      if(audio.state==='suspended')audio.resume().catch(()=>{});
    }catch(_){}
  }
  function tick(crossings){
    if(document.hidden)return;
    if(audio?.state==='running'){
      try{
       for(let i=0;i<crossings;i++){
        const oscillator=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+i*.04;
        oscillator.type='triangle';oscillator.frequency.setValueAtTime(1050,t);
        oscillator.frequency.exponentialRampToValueAtTime(420,t+.025);
        gain.gain.setValueAtTime(.035,t);gain.gain.exponentialRampToValueAtTime(.001,t+.035);
        oscillator.connect(gain);gain.connect(audio.destination);
        oscillator.start(t);oscillator.stop(t+.04);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
       }
      }catch(_){}
    }
    if(matchMedia('(pointer:coarse)').matches){
      try{navigator.vibrate?.(crossings===1?8:Array.from({length:crossings*2-1},(_,i)=>i%2?20:8))}catch(_){}
    }
  }
  function cancelTransition(){
    revision++;timers.forEach(clearTimeout);timers=[];
    body.classList.remove('is-flipping','is-returning');
  }
  function later(fn,delay){
    const token=revision;
    timers.push(setTimeout(()=>{if(token===revision)fn()},reduced.matches?0:delay));
  }
  function animateDetail(){
    cancelTransition();confirmed=selected;
    const cards=Array.from(el('rosterFamily').children);
    cards.forEach(card=>card.classList.remove('is-card-visible','is-image-visible'));
    void detail.offsetWidth;
    el('rosterSelected').textContent=label(selected);
    body.dataset.phase='cards';
    detail.inert=false;detail.setAttribute('aria-hidden','false');
    body.classList.add('has-selection');
    if(narrow.matches){
      body.classList.add('is-detail','is-flipping');selector.inert=true;
      later(()=>{body.classList.remove('is-flipping');el('rosterBack').focus({preventScroll:true})},380);
    }else{
      body.classList.remove('is-detail');selector.inert=false;
    }
    const start=narrow.matches?380:0;
    cards.forEach((card,index)=>later(()=>card.classList.add('is-card-visible'),start+index*160));
    const imageStart=start+Math.max(0,cards.length-1)*160+280;
    later(()=>{body.dataset.phase='images'},imageStart);
    cards.forEach((card,index)=>later(()=>card.classList.add('is-image-visible'),imageStart+index*140));
  }
  function revealAll(){
    if(confirmed<0)return;
    body.dataset.phase='images';
    Array.from(el('rosterFamily').children).forEach(card=>card.classList.add('is-card-visible','is-image-visible'));
  }
  function back(){
    cancelTransition();selectionRevision++;pendingOpen=false;interacting=false;clearTimeout(settle);
    body.classList.remove('is-detail');body.classList.add('is-returning');
    selector.inert=false;detail.inert=narrow.matches;
    detail.setAttribute('aria-hidden',String(narrow.matches));
    requestAnimationFrame(()=>{resize();wheel.focus({preventScroll:true})});
    later(()=>body.classList.remove('is-returning'),380);
  }

  function draw(){
    frame=0;
    if(!wheel.clientHeight||!count){wheel.removeAttribute('aria-activedescendant');return;}
    const position=wheel.scrollTop/step;
    const nearest=Math.max(0,Math.min(count-1,Math.round(position)));
    if(interacting&&nearest!==selected)tick(Math.abs(nearest-selected));
    selected=nearest;
    options.forEach((option,i)=>{
      const distance=Math.abs(i-position),card=option.firstElementChild;
      card.style.setProperty('--depth',(-Math.min(distance,4)*95)+'px');
      card.style.setProperty('--scale',Math.max(.72,1-distance*.065));
      card.style.setProperty('--opacity',Math.max(.12,1-distance*.22));
      option.style.zIndex=String(10-Math.min(9,Math.round(distance)));
      option.setAttribute('aria-selected',String(i===nearest));
    });
    wheel.setAttribute('aria-activedescendant',options[nearest].id);
  }
  function finish(){
    draw();
    const top=selected*step;
    if(Math.abs(wheel.scrollTop-top)>1){wheel.scrollTo({top,behavior:'instant'});draw()}
    const open=pendingOpen||(!narrow.matches&&interacting&&confirmed!==selected);
    pendingOpen=false;interacting=false;targetIndex=null;
    if(open)detailReady=showDetail();
    if(count&&selected>=count-5)loadList(true);
  }
  function move(index,open=false){
    if(!count)return;selectionRevision++;
    unlock();interacting=true;pendingOpen=open;
    const next=Math.max(0,Math.min(count-1,index));
    targetIndex=next;
    if(!wheel.clientHeight){
      if(next!==selected)tick(Math.abs(next-selected));selected=next;targetIndex=null;interacting=false;pendingOpen=false;
      detailReady=showDetail();return;
    }
    wheel.scrollTo({top:next*step,behavior:reduced.matches?'instant':'smooth'});
    if(reduced.matches)draw();
    clearTimeout(settle);settle=setTimeout(finish,reduced.matches?0:180);
  }
  function resize(){
    if(!wheel.clientHeight)return;
    wheel.style.setProperty('--wheel-height',wheel.clientHeight+'px');
    wheel.scrollTop=(targetIndex??selected)*step;draw();
  }
  wheel.addEventListener('scroll',()=>{
    if(!frame)frame=requestAnimationFrame(draw);
    clearTimeout(settle);settle=setTimeout(finish,160);
  },{passive:true});
  ['pointerdown','wheel','touchstart'].forEach(type=>wheel.addEventListener(type,()=>{
    unlock();interacting=true;targetIndex=null;selectionRevision++;
  },{passive:true}));
  wheel.addEventListener('keydown',event=>{
    const current=targetIndex??selected;
    const targets={ArrowDown:current+1,ArrowUp:current-1,Home:0,End:count-1,PageDown:current+3,PageUp:current-3};
    if(event.key in targets){event.preventDefault();move(targets[event.key])}
    if(event.key==='Enter'||event.key===' '){event.preventDefault();move(current,true)}
  });
  document.addEventListener('keydown',event=>{
    if(event.target!==document.body&&!event.target.closest('.roster-wrap'))return;
    if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.isComposing||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();void moveFamily(event.key==='ArrowLeft'?-1:1)}
    else if(event.key==='ArrowUp'||event.key==='ArrowDown'){
      event.preventDefault();move((targetIndex??selected)+(event.key==='ArrowUp'?-1:1),true);
    }
  });
  function renderScope(){
    scopes.set(currentScope,{characterId:items[selected]?.characterId,query:activeQuery});
    currentScope=scopeKey();const saved=scopes.get(currentScope);
    cancelTransition();clearTimeout(settle);interacting=false;pendingOpen=false;confirmed=-1;targetIndex=null;
    const all=el('rosterScope').checked;
    el('rosterScopeLabel').textContent=all?'전체':'레기온별';
    el('rosterTitle').textContent=all?'전체':legions[legion];
    el('rosterPrev').disabled=all;el('rosterNext').disabled=all;
    el('rosterPrevName').textContent=legions[(legion+3)%4];
    el('rosterNextName').textContent=legions[(legion+1)%4];
    body.classList.remove('has-selection','is-detail');
    body.dataset.phase='idle';selector.inert=false;detail.inert=true;detail.setAttribute('aria-hidden','true');
    selected=0;activeQuery=saved?.query??'';
    el('rosterName').value=saved?.query??'';
    el('rosterResults').replaceChildren();loadList(false,saved?.characterId);
  }
  el('rosterPrev').addEventListener('click',()=>{legion=(legion+3)%4;renderScope()});
  el('rosterNext').addEventListener('click',()=>{legion=(legion+1)%4;renderScope()});
  el('rosterScope').addEventListener('change',renderScope);
  el('rosterBack').addEventListener('click',back);
  body.addEventListener('keydown',e=>{if(e.key==='Escape'&&body.classList.contains('is-detail')){e.preventDefault();back()}});
  el('rosterName').addEventListener('compositionstart',()=>{composing=true});
  el('rosterName').addEventListener('compositionend',()=>{composing=false});
  el('rosterSearch').addEventListener('submit',event=>{
    event.preventDefault();if(composing)return;
    activeQuery=el('rosterName').value.trim();
    cancelTransition();body.classList.remove('has-selection','is-detail');selector.inert=false;detail.inert=true;
    window.KinojoCache?.clear('roster:465:');
    loadList(false,null,true);
  });
  narrow.addEventListener('change',()=>{
    cancelTransition();selector.inert=false;body.classList.remove('is-detail');
    detail.inert=narrow.matches||confirmed<0;detail.setAttribute('aria-hidden',String(detail.inert));
    revealAll();
    resize();
  });
  reduced.addEventListener('change',()=>{
    if(reduced.matches){cancelTransition();revealAll()}
  });
  new ResizeObserver(resize).observe(wheel);
  window.KinojoRoster=Object.freeze({refresh:async()=>{
    cacheEpoch++;window.KinojoCache?.clear('roster:465:');inFlight.clear();cacheKeys.clear();
    cancelTransition();familyGeneration++;imageObserver.disconnect();confirmed=-1;
    body.classList.remove('has-selection','is-detail');selector.inert=false;detail.inert=true;
    detail.setAttribute('aria-hidden','true');
    return loadList(false,items[selected]?.characterId);
  }});
  renderScope();
})();
