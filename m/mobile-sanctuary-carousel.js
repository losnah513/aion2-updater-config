/* KINOJO mobile sanctuary carousel v26062209
   Shared by mobile home and mobile sanctuary pages.
   - One source for arrow labels, swipe detection, elastic resistance.
   - Does not fetch data and does not touch PC sanctuary logic. */
(function(){
  function q(sel,root){return (root||document).querySelector(sel)}
  function qa(sel,root){return Array.from((root||document).querySelectorAll(sel))}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value))}

  function initCarousel(root){
    root._kinojoSanctuaryCarouselController?.abort?.();
    const controller=new AbortController();
    const signal=controller.signal;
    root._kinojoSanctuaryCarouselController=controller;
    const track=q('[data-sanctuary-track]',root)||q('.mobile-sanctuary-track',root);
    const slides=qa('[data-sanctuary-slide]',root).length?qa('[data-sanctuary-slide]',root):qa('.mobile-sanctuary-slide',root);
    const prev=q('[data-sanctuary-prev]',root)||q('.mobile-sanctuary-prev',root);
    const next=q('[data-sanctuary-next]',root)||q('.mobile-sanctuary-next',root);
    const dots=qa('[data-sanctuary-dot]',root).length?qa('[data-sanctuary-dot]',root):qa('.mobile-sanctuary-dots span',root);
    if(!track||!slides.length||!prev||!next)return;

    let index=clamp(Number(root.dataset.initialIndex||0),0,slides.length-1);
    let startX=0,startY=0,currentX=0,dragging=false,pointerId=null,dragMoved=false;

    function nameOf(i){return slides[i]?.dataset.arrowName||((i+1)+'성역')}
    function trackWidth(){return track.getBoundingClientRect().width||1}
    function setTransforms(offsetPx){
      const base=trackWidth();
      const offsetPercent=(offsetPx/base)*100;
      slides.forEach((slide,i)=>{
        slide.style.transform='translateX('+(((i-index)*100)+offsetPercent)+'%)';
      });
    }
    function render(){
      root.dataset.currentIndex=String(index);
      slides.forEach((slide,i)=>{
        const active=i===index;
        slide.classList.toggle('is-active',active);
        slide.classList.remove('is-dragging');
        slide.setAttribute('aria-hidden',active?'false':'true');
        slide.style.transform='translateX('+((i-index)*100)+'%)';
      });
      dots.forEach((dot,i)=>dot.classList.toggle('active',i===index));
      const hasPrev=index>0;
      const hasNext=index<slides.length-1;
      prev.hidden=!hasPrev;
      next.hidden=!hasNext;
      const prevLabel=q('.arrow-label',prev);
      const nextLabel=q('.arrow-label',next);
      if(prevLabel&&hasPrev)prevLabel.textContent=nameOf(index-1);
      if(nextLabel&&hasNext)nextLabel.textContent=nameOf(index+1);
    }
    function move(step){
      const nextIndex=clamp(index+step,0,slides.length-1);
      if(nextIndex===index){render();return;}
      index=nextIndex;
      render();
    }
    function begin(clientX,clientY,id){
      dragging=true; dragMoved=false; pointerId=id;
      startX=clientX; startY=clientY; currentX=clientX;
      slides.forEach(slide=>slide.classList.add('is-dragging'));
    }
    function update(clientX,clientY,ev){
      if(!dragging)return;
      currentX=clientX;
      const dx=currentX-startX;
      const dy=clientY-startY;
      if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
      if(Math.abs(dy)>Math.abs(dx)*1.25)return;
      dragMoved=true;
      ev?.preventDefault?.();
      const atFirst=index===0&&dx>0;
      const atLast=index===slides.length-1&&dx<0;
      setTransforms(dx*((atFirst||atLast)?0.28:1));
    }
    function end(){
      if(!dragging)return;
      const dx=currentX-startX;
      const threshold=Math.min(84,trackWidth()*0.22);
      dragging=false; pointerId=null;
      slides.forEach(slide=>slide.classList.remove('is-dragging'));
      if(Math.abs(dx)>threshold)move(dx<0?1:-1);
      else render();
      setTimeout(()=>{dragMoved=false},0);
    }

    prev.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();move(-1)},{signal});
    next.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();move(1)},{signal});
    slides.forEach(slide=>{
      slide.addEventListener('click',e=>{
        if(dragMoved){e.preventDefault();e.stopPropagation();}
        else if(!slide.classList.contains('is-activating')){
          e.preventDefault();e.stopPropagation();slide.classList.add('is-activating');
          const href=slide.href;setTimeout(()=>{if(href)location.href=href},280);
        }
      },{signal});
    });

    if(window.PointerEvent){
      track.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse'&&e.button!==0)return;
        begin(e.clientX,e.clientY,e.pointerId);
        track.setPointerCapture?.(e.pointerId);
      },{signal});
      track.addEventListener('pointermove',e=>{
        if(pointerId!==null&&e.pointerId!==pointerId)return;
        update(e.clientX,e.clientY,e);
      },{passive:false,signal});
      track.addEventListener('pointerup',end,{signal});
      track.addEventListener('pointercancel',end,{signal});
    }else{
      track.addEventListener('touchstart',e=>{
        const t=e.touches[0]; if(t)begin(t.clientX,t.clientY,null);
      },{passive:true,signal});
      track.addEventListener('touchmove',e=>{
        const t=e.touches[0]; if(t)update(t.clientX,t.clientY,e);
      },{passive:false,signal});
      track.addEventListener('touchend',end,{signal});
      track.addEventListener('touchcancel',end,{signal});
    }
    window.addEventListener('resize',render,{passive:true,signal});
    render();
  }

  function init(){qa('[data-mobile-sanctuary-carousel]').forEach(initCarousel)}
  window.KinojoMobileSanctuaryCarousel={init,initCarousel};
  window.addEventListener('kinojo:sanctuary-master-rendered',()=>{
    qa('[data-mobile-sanctuary-carousel]').forEach(root=>{
      initCarousel(root);
    });
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
