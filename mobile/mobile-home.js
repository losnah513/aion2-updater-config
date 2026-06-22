/* KINOJO mobile home interactions v26062208
   Sanctuary carousel only. Data/API logic remains shared elsewhere. */
(function(){
  const track=document.getElementById('mobileSanctuaryTrack');
  const slides=[...document.querySelectorAll('.mobile-sanctuary-slide')];
  const prev=document.getElementById('mobileSanctuaryPrev');
  const next=document.getElementById('mobileSanctuaryNext');
  const dots=[...document.querySelectorAll('#mobileSanctuaryDots span')];
  if(!track||!slides.length||!prev||!next)return;

  let index=0;
  let startX=0;
  let startY=0;
  let currentX=0;
  let dragging=false;
  let pointerId=null;

  function nameOf(i){return (i+1)+'성역'}
  function clampIndex(value){return Math.max(0,Math.min(slides.length-1,value))}
  function width(){return track.getBoundingClientRect().width||1}

  function setSlideTransform(offsetPx){
    const base=width();
    slides.forEach((slide,i)=>{
      const percent=(i-index)*100;
      const px=(offsetPx/base)*100;
      slide.style.transform='translateX('+(percent+px)+'%)';
    });
  }

  function render(){
    slides.forEach((slide,i)=>{
      slide.classList.toggle('is-active',i===index);
      slide.classList.remove('is-dragging');
      slide.setAttribute('aria-hidden',i===index?'false':'true');
      slide.style.transform='translateX('+((i-index)*100)+'%)';
    });
    dots.forEach((dot,i)=>dot.classList.toggle('active',i===index));
    const hasPrev=index>0;
    const hasNext=index<slides.length-1;
    prev.hidden=!hasPrev;
    next.hidden=!hasNext;
    if(hasPrev)prev.querySelector('.arrow-label').textContent=nameOf(index-1);
    if(hasNext)next.querySelector('.arrow-label').textContent=nameOf(index+1);
  }

  function move(step){
    const nextIndex=clampIndex(index+step);
    if(nextIndex===index){render();return;}
    index=nextIndex;
    render();
  }

  function beginDrag(clientX,clientY,id){
    dragging=true;
    pointerId=id;
    startX=clientX;
    startY=clientY;
    currentX=clientX;
    slides.forEach(slide=>slide.classList.add('is-dragging'));
  }

  function updateDrag(clientX,clientY,ev){
    if(!dragging)return;
    currentX=clientX;
    const dx=currentX-startX;
    const dy=clientY-startY;
    if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
    if(Math.abs(dy)>Math.abs(dx)*1.25)return;
    ev?.preventDefault?.();
    const atFirst=index===0&&dx>0;
    const atLast=index===slides.length-1&&dx<0;
    const resistance=(atFirst||atLast)?0.28:1;
    setSlideTransform(dx*resistance);
  }

  function endDrag(){
    if(!dragging)return;
    const dx=currentX-startX;
    const threshold=Math.min(80,width()*0.22);
    dragging=false;
    pointerId=null;
    slides.forEach(slide=>slide.classList.remove('is-dragging'));
    if(Math.abs(dx)>threshold){
      move(dx<0?1:-1);
    }else{
      render();
    }
  }

  prev.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();move(-1)});
  next.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();move(1)});

  if(window.PointerEvent){
    track.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      beginDrag(e.clientX,e.clientY,e.pointerId);
      track.setPointerCapture?.(e.pointerId);
    });
    track.addEventListener('pointermove',e=>{
      if(pointerId!==null&&e.pointerId!==pointerId)return;
      updateDrag(e.clientX,e.clientY,e);
    },{passive:false});
    track.addEventListener('pointerup',endDrag);
    track.addEventListener('pointercancel',endDrag);
  }else{
    track.addEventListener('touchstart',e=>{
      const t=e.touches[0];
      if(t)beginDrag(t.clientX,t.clientY,null);
    },{passive:true});
    track.addEventListener('touchmove',e=>{
      const t=e.touches[0];
      if(t)updateDrag(t.clientX,t.clientY,e);
    },{passive:false});
    track.addEventListener('touchend',endDrag);
    track.addEventListener('touchcancel',endDrag);
  }

  window.addEventListener('resize',render,{passive:true});
  render();
})();
