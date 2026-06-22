/* KINOJO mobile home interactions
   Sanctuary carousel only. Data/API logic remains shared elsewhere. */
(function(){
  const slides=[...document.querySelectorAll('.mobile-sanctuary-slide')];
  const prev=document.getElementById('mobileSanctuaryPrev');
  const next=document.getElementById('mobileSanctuaryNext');
  const dots=[...document.querySelectorAll('#mobileSanctuaryDots span')];
  if(!slides.length||!prev||!next)return;
  let index=0;
  function nameOf(i){return (i+1)+'성역'}
  function render(){
    slides.forEach((slide,i)=>{
      slide.classList.toggle('is-active',i===index);
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
    index=Math.max(0,Math.min(slides.length-1,index+step));
    render();
  }
  prev.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();move(-1)});
  next.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();move(1)});
  render();
})();
