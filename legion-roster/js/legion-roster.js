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
  const scopeKey=()=>el('rosterScope').checked?'all':String(legion);
  let currentScope='0';

  async function request(fn,params){
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
        if(!data||data.contractVersion!==465||!Array.isArray(data.items)||data.items.length>(params.p_limit||50)
          ||data.items.some(row=>!/^\d+$/.test(row.characterId)||typeof row.name!=='string')
          ||typeof data.sourceToken!=='string')throw new Error('ROSTER_RESPONSE_INVALID');
        cache?.set(key,data,30000);cacheKeys.delete(key);cacheKeys.add(key);
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
    }catch(error){
      if(token!==listRevision||scope!==currentScope)return;
      if(append&&error.message==='ROSTER_CURSOR_EXPIRED'){
        window.KinojoCache?.clear('roster:465:');listBusy=false;return loadList(false,items[selected]?.characterId);
      }
      el('rosterStatus').textContent='명부를 불러오지 못했습니다. 조회를 눌러 다시 시도하세요.';
    }finally{if(token===listRevision){listBusy=false;wheel.setAttribute('aria-busy','false')}}
  }
  function renderFamily(rows,append=false){
    const family=el('rosterFamily');if(!append){family.replaceChildren();family.scrollLeft=0}
    rows.forEach(row=>{
      const article=document.createElement('article');article.className='roster-character '+(row.isMain?'is-main':'is-alt');article.dataset.characterId=row.characterId;
      const image=document.createElement('div');image.className='roster-image';image.setAttribute('aria-hidden','true');
      const info=document.createElement('div');info.className='roster-info';
      const kind=document.createElement('span');kind.className='roster-kind';kind.textContent=row.isMain?'본캐':'부캐';
      const heading=document.createElement('h2');
      const iconUrl=window.KinojoCommonUI?.classIconFor(row.className);
      if(iconUrl){const icon=document.createElement('img');icon.src=iconUrl;icon.alt=row.className;icon.width=22;icon.height=22;heading.append(icon)}
      const name=document.createElement('span');name.textContent=row.name;heading.append(name);
      const server=document.createElement('small');server.className='roster-server';server.textContent=serverLabel(row);
      const metrics=document.createElement('div');metrics.className='roster-metrics';
      for(const [key,alt,file] of [['itemLevel','아이템레벨','level'],['combatPower','전투력','power']]){
        const line=document.createElement('span'),icon=document.createElement('img'),value=document.createElement('b');
        icon.src='https://assets.playnccdn.com/static-aion2/characters/img/info/profile_'+file+'_icon_pc.png';icon.alt=alt;icon.width=18;icon.height=18;
        value.textContent=row[key]===null||row[key]===undefined?'—':Number(row[key]).toLocaleString('ko-KR');
        line.append(icon,value);metrics.append(line);
      }
      info.append(kind,heading,server,metrics);article.append(image,info);family.append(article);
      if(append)article.classList.add('is-card-visible','is-image-visible');
    });
    Array.from(family.children).forEach((card,i)=>card.style.zIndex=String(family.children.length-i));
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
    }catch(error){
      if(token!==selectionRevision||scope!==currentScope)return;
      el('rosterStatus').textContent='캐릭터 정보를 불러오지 못했습니다. 카드를 다시 선택하세요.';
      body.classList.remove('has-selection');detail.inert=true;
    }
  }
  el('rosterFamily').addEventListener('scroll',async()=>{
    const family=el('rosterFamily');
    if(familyBusy||!familyCursor||family.scrollLeft+family.clientWidth<family.scrollWidth-100)return;
    const token=selectionRevision,row=items[confirmed];if(!row)return;familyBusy=true;
    try{
      const data=await request('kinojo_web_roster_family_v465',{p_character_id:row.characterId,p_cursor:familyCursor,p_limit:20});
      if(token!==selectionRevision)return;
      renderFamily(data.items,true);familyCursor=data.nextCursor;
    }catch(error){if(token===selectionRevision){el('rosterDetailNote').textContent='추가 정보를 불러오지 못했습니다. 카드를 다시 선택하세요.'}}
    finally{familyBusy=false}
  },{passive:true});

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
    if(open)showDetail();
    if(count&&selected>=count-5)loadList(true);
  }
  function move(index,open=false){
    if(!count)return;selectionRevision++;
    unlock();interacting=true;pendingOpen=open;
    const next=Math.max(0,Math.min(count-1,index));
    targetIndex=next;
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
  renderScope();
})();
