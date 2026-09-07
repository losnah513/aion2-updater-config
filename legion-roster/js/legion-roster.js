/* Layout-only roster foundation. No character facts or relationships inferred here. */
(function(){
  'use strict';
  const wheel=document.getElementById('rosterWheel');
  if(!wheel)return;
  const el=id=>document.getElementById(id);
  const legions=['깡','낮','밤','키나노동조합'];
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let legion=0,selected=4,frame=0,settle=0,composing=false;
  const count=9,step=80;
  function label(index){return '명단 카드 '+String(index+1).padStart(2,'0')}
  for(let i=0;i<count;i++){
    const option=document.createElement('div');
    option.className='roster-option';option.id='roster-option-'+i;
    option.setAttribute('role','option');option.setAttribute('aria-selected',String(i===0));
    const card=document.createElement('span');card.className='roster-name-card';
    const name=document.createElement('strong');name.textContent=label(i);
    const caption=document.createElement('small');caption.textContent='배치 확인용';
    card.append(name,caption);option.append(card);wheel.append(option);
    option.addEventListener('click',()=>move(i));
  }
  const options=Array.from(wheel.children);
  function draw(){
    frame=0;
    const position=wheel.scrollTop/step;
    const nearest=Math.max(0,Math.min(count-1,Math.round(position)));
    options.forEach((option,i)=>{
      const distance=Math.abs(i-position),card=option.firstElementChild;
      card.style.setProperty('--depth',(-Math.min(distance,4)*95)+'px');
      card.style.setProperty('--scale',Math.max(.72,1-distance*.065));
      card.style.setProperty('--opacity',Math.max(.12,1-distance*.22));
      option.style.zIndex=String(10-Math.min(9,Math.round(distance)));
      option.setAttribute('aria-selected',String(i===nearest));
    });
    wheel.setAttribute('aria-activedescendant',options[nearest].id);
    selected=nearest;el('rosterSelected').textContent=label(selected);
  }
  function move(index){
    const next=Math.max(0,Math.min(count-1,index));
    wheel.scrollTo({top:next*step,behavior:reduced.matches?'instant':'smooth'});
  }
  function resize(){wheel.style.setProperty('--wheel-height',wheel.clientHeight+'px');wheel.scrollTop=selected*step;draw()}
  wheel.addEventListener('scroll',()=>{
    if(!frame)frame=requestAnimationFrame(draw);
    clearTimeout(settle);settle=setTimeout(()=>move(Math.round(wheel.scrollTop/step)),130);
  },{passive:true});
  wheel.addEventListener('keydown',event=>{
    const targets={ArrowDown:selected+1,ArrowUp:selected-1,Home:0,End:count-1};
    if(event.key in targets){event.preventDefault();move(targets[event.key])}
  });
  function renderLegion(direction){
    const all=el('rosterScope').checked;
    el('rosterScopeLabel').textContent=all?'전체':'레기온별';
    el('rosterTitle').textContent=all?'전체':legions[legion];
    el('rosterPrev').disabled=all;el('rosterNext').disabled=all;
    el('rosterPrevName').textContent=legions[(legion+3)%4];
    el('rosterNextName').textContent=legions[(legion+1)%4];
    el('rosterName').value='';el('rosterStatus').textContent='명단을 위아래로 넘겨 보세요.';
    selected=4;wheel.scrollTop=selected*step;draw();
    const body=el('rosterBody');body.classList.remove('is-turning');
    body.style.setProperty('--turn-x',direction<0?'-16px':'16px');
    if(!reduced.matches){void body.offsetWidth;body.classList.add('is-turning')}
  }
  el('rosterPrev').addEventListener('click',()=>{legion=(legion+3)%4;renderLegion(-1)});
  el('rosterNext').addEventListener('click',()=>{legion=(legion+1)%4;renderLegion(1)});
  el('rosterScope').addEventListener('change',()=>renderLegion(1));
  el('rosterName').addEventListener('compositionstart',()=>{composing=true});
  el('rosterName').addEventListener('compositionend',()=>{composing=false});
  el('rosterSearch').addEventListener('submit',event=>{
    event.preventDefault();if(composing)return;
    const text=el('rosterName').value.trim();
    const match=options.findIndex((_,i)=>label(i)===text);
    if(match>=0){move(match);el('rosterStatus').textContent='배치 확인용 카드로 이동했습니다.'}
    else el('rosterStatus').textContent='실제 이름 조회는 명부 연결 후 제공됩니다.';
  });
  new ResizeObserver(resize).observe(wheel);
  renderLegion(1);resize();
})();
