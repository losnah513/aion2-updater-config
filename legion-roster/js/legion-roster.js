/* Stage 3 interaction preview. Server facts and library images connect in stages 4/5. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id),wheel=el('rosterWheel');
  if(!wheel)return;
  const body=el('rosterBody'),detail=el('rosterDetail'),selector=el('rosterSelector');
  const legions=['깡','낮','밤','키나노동조합'],count=9,step=80;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),narrow=matchMedia('(max-width:700px)');
  let legion=0,selected=4,confirmed=-1,frame=0,settle=0,composing=false;
  let interacting=false,pendingOpen=false,revision=0,timers=[],audio=null,targetIndex=null;
  const scopes=new Map();
  const label=i=>'명단 카드 '+String(i+1).padStart(2,'0');
  const scopeKey=()=>el('rosterScope').checked?'all':String(legion);
  let currentScope='0';
  function preference(id){
    try{el(id).checked=localStorage.getItem('kinojo.roster.'+id)==='true'}catch(_){}
    el(id).addEventListener('change',()=>{
      try{localStorage.setItem('kinojo.roster.'+id,String(el(id).checked))}catch(_){}
      if(id==='rosterSound'&&el(id).checked)unlock();
    });
  }
  function unlock(){
    if(!el('rosterSound').checked)return;
    try{
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      if(!audio)audio=new Audio();
      if(audio.state==='suspended')audio.resume().catch(()=>{});
    }catch(_){}
  }
  function tick(crossings){
    if(document.hidden)return;
    if(el('rosterSound').checked&&audio?.state==='running'){
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
    if(el('rosterVibration').checked&&matchMedia('(pointer:coarse)').matches){
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
  function showDetail(){
    cancelTransition();confirmed=selected;
    el('rosterSelected').textContent=label(selected);
    body.dataset.phase='cards';
    detail.inert=false;detail.setAttribute('aria-hidden','false');
    body.classList.add('has-selection');
    if(narrow.matches){
      body.classList.add('is-detail','is-flipping');selector.inert=true;
      later(()=>{body.classList.remove('is-flipping');el('rosterBack').focus({preventScroll:true})},380);
    }else{
      body.classList.remove('is-detail');selector.inert=false;
      detail.classList.remove('is-revealing');void detail.offsetWidth;
      detail.classList.add('is-revealing');
    }
    later(()=>{body.dataset.phase='images'},narrow.matches?560:340);
  }
  function back(){
    cancelTransition();pendingOpen=false;interacting=false;clearTimeout(settle);
    body.classList.remove('is-detail');body.classList.add('is-returning');
    selector.inert=false;detail.inert=narrow.matches;
    detail.setAttribute('aria-hidden',String(narrow.matches));
    requestAnimationFrame(()=>{resize();wheel.focus({preventScroll:true})});
    later(()=>body.classList.remove('is-returning'),380);
  }
  for(let i=0;i<count;i++){
    const option=document.createElement('div'),card=document.createElement('span');
    option.className='roster-option';option.id='roster-option-'+i;
    option.setAttribute('role','option');
    card.className='roster-name-card';
    const name=document.createElement('strong'),caption=document.createElement('small');
    name.textContent=label(i);caption.textContent='조작 확인용 · 예시 '+(i+1);
    card.append(name,caption);option.append(card);wheel.append(option);
    option.addEventListener('click',()=>move(i,true));
  }
  const options=Array.from(wheel.children);
  function draw(){
    frame=0;
    if(!wheel.clientHeight)return;
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
  }
  function move(index,open=false){
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
    unlock();interacting=true;targetIndex=null;
  },{passive:true}));
  wheel.addEventListener('keydown',event=>{
    const current=targetIndex??selected;
    const targets={ArrowDown:current+1,ArrowUp:current-1,Home:0,End:count-1,PageDown:current+3,PageUp:current-3};
    if(event.key in targets){event.preventDefault();move(targets[event.key])}
    if(event.key==='Enter'||event.key===' '){event.preventDefault();move(current,true)}
  });
  function renderScope(){
    scopes.set(currentScope,{selected,query:el('rosterName').value,status:el('rosterStatus').textContent});
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
    selected=saved?.selected??4;
    el('rosterName').value=saved?.query??'';
    el('rosterStatus').textContent=saved?.status??'카드를 넘긴 뒤 눌러 선택하세요.';
    el('rosterResults').replaceChildren();resize();
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
    const query=el('rosterName').value.trim(),results=el('rosterResults');
    results.replaceChildren();
    if(!query){el('rosterStatus').textContent='조회할 예시 카드 이름을 입력하세요.';return}
    const matches=options.map((_,i)=>i).filter(i=>label(i).includes(query));
    if(matches.length===1){move(matches[0],true);el('rosterStatus').textContent='예시 카드로 이동했습니다.';return}
    el('rosterStatus').textContent=matches.length?'예시 조회 결과에서 카드를 선택하세요.':'조회 결과 없음 · 실제 이름 조회는 4단계에서 연결됩니다.';
    matches.forEach(i=>{
      const button=document.createElement('button');button.type='button';
      button.textContent=label(i)+' · 예시 '+(i+1);
      button.addEventListener('click',()=>{results.replaceChildren();move(i,true)});
      results.append(button);
    });
  });
  narrow.addEventListener('change',()=>{
    cancelTransition();selector.inert=false;body.classList.remove('is-detail');
    detail.inert=narrow.matches||confirmed<0;detail.setAttribute('aria-hidden',String(detail.inert));
    if(confirmed>=0)body.dataset.phase='images';
    resize();
  });
  reduced.addEventListener('change',()=>{
    if(reduced.matches){cancelTransition();if(confirmed>=0)body.dataset.phase='images'}
  });
  preference('rosterSound');preference('rosterVibration');
  new ResizeObserver(resize).observe(wheel);
  renderScope();
})();
