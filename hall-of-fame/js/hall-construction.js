/* KINOJO construction notice */
function openConstructionNotice(label){
  const notice=document.getElementById("constructionNotice");
  const message=document.getElementById("constructionMessage");
  if(message)message.textContent=(label?label+" 페이지는 ":"페이지는 ")+"인테리어 공사중입니다. 조금만 기다려 주세요.";
  if(notice){
    notice.classList.add("open");
    notice.setAttribute("aria-hidden","false");
  }
  closeSideDrawer();
}
function closeConstructionNotice(){
  const notice=document.getElementById("constructionNotice");
  if(notice){
    notice.classList.remove("open");
    notice.setAttribute("aria-hidden","true");
  }
}
function bindConstructionNotice_(){
  document.querySelectorAll("[data-construction]").forEach(btn=>{
    if(btn.dataset.boundConstruction)return;
    btn.dataset.boundConstruction="1";
    btn.addEventListener("click",e=>{
      e.preventDefault();
      e.stopPropagation();
      openConstructionNotice(btn.dataset.construction||"");
    });
  });
  const close=document.getElementById("constructionCloseBtn");
  const ok=document.getElementById("constructionOkBtn");
  if(close&&!close.dataset.boundConstruction){
    close.dataset.boundConstruction="1";
    close.addEventListener("click",closeConstructionNotice);
  }
  if(ok&&!ok.dataset.boundConstruction){
    ok.dataset.boundConstruction="1";
    ok.addEventListener("click",closeConstructionNotice);
  }
}
