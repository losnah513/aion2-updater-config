const WEB_APP_URL=new URLSearchParams(location.search).get("api")||"https://script.google.com/macros/s/AKfycbztXbGEbiId1yOfa3CVmErivNVi5IUi64qxIQRf8Sm_KduCPieeAKlNRMGyYkKL5iPaYg/exec";
const CLASS_ORDER=["검성","수호성","살성","궁성","정령성","마도성","치유성","호법성"];
const HALL_ASSET_BASE=(location.pathname.includes("/mobile/hall-of-fame/")?"../../hall-of-fame/assets/":"assets/");
const CLASS_ICONS={"검성":HALL_ASSET_BASE+"class_icon_gladiator.png","수호성":HALL_ASSET_BASE+"class_icon_templar.png","살성":HALL_ASSET_BASE+"class_icon_assassin.png","궁성":HALL_ASSET_BASE+"class_icon_ranger.png","정령성":HALL_ASSET_BASE+"class_icon_elementalist.png","마도성":HALL_ASSET_BASE+"class_icon_sorcerer.png","치유성":HALL_ASSET_BASE+"class_icon_cleric.png","호법성":HALL_ASSET_BASE+"class_icon_chanter.png"};
const RANK_EMBLEMS={mvp:HALL_ASSET_BASE+"emblem_mvp_challenger.png",diamond:HALL_ASSET_BASE+"emblem_rank_diamond.png",crystal:HALL_ASSET_BASE+"emblem_rank_crystal.png",gold:HALL_ASSET_BASE+"emblem_rank_gold.png",silver:HALL_ASSET_BASE+"emblem_rank_silver.png",bronze:HALL_ASSET_BASE+"emblem_rank_bronze.png"};
let hallData=null,keyword="",includeSubs=false,page=1,activeRankClass="전체",chicksExpanded=false,chicksCollapsed=false,longPressTimer=null,longPressFired=false,loadingTimer=null,loadingStep=0,currentReactionItem=null,currentReactionType="like",reactionCarouselIndex=0,reactionCarouselPausedUntil=0,reactionSubmitting=false,searchComposing=false,searchDebounceTimer=null,adminAuthed=false;
const PAGE_SIZE=10,app=document.getElementById("app");
function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function rankIcon(i){return i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}
function numberOnly(value){const n=Number(String(value??"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)&&n>0?n.toLocaleString("ko-KR"):""}
function itemLevelFor(item,category){return category==="PVP"?numberOnly(item?.pvpItem):numberOnly(item?.pveItem)}
function currentOverall(){return includeSubs?(hallData.overallAll||[]):(hallData.overallMain||[])}
function currentDemon(){return includeSubs?(hallData.demonFamilyAll||hallData.demonFamily||[]):(hallData.demonFamily||[])}
function currentParty(){return includeSubs?(hallData.partyFriendAll||hallData.partyFriend||[]):(hallData.partyFriend||[])}
function match(item){if(!keyword)return true;return [item.name,item.owner,item.serverName,item.meta,item.className,item.pveReview,item.pvpReview].join(" ").toLowerCase().includes(keyword.toLowerCase())}

function reactionIcon(kind){
  const cls=kind==="dislike"?"dislike-icon":"like-icon";
  return '<span class="reaction-icon '+cls+'" aria-hidden="true"></span>';
}
function reactionPairHtml(like,dislike,extraClass){
  return '<span class="reaction-pair '+(extraClass||'')+'">'
    + reactionIcon("like")+'<strong>'+Number(like||0)+'</strong>'
    + reactionIcon("dislike")+'<strong>'+Number(dislike||0)+'</strong>'
    + '</span>';
}

function nameClass(item){return item?.isAdminMain?"admin-main":(item?.isAdminAlt?"admin-alt":"")}
function itemClass(item){return ""}
function nameSpan(item,text){
  return '<span class="character-name-text '+nameClass(item)+'" data-character="'+escapeHtml(item?.name||"")+'">'
    + '<span class="character-text">'+text+'</span>'
    + '</span>';
}
function ownerLine(item){const owner=String(item?.owner||"").trim(),name=String(item?.name||"").trim();return owner&&owner!==name?'<div class="owner-line">본캐 '+escapeHtml(owner)+'</div>':''}
function flowText(text,item){return '<span class="flow-candidate">'+nameSpan(item,escapeHtml(text))+'</span>'}
function classIconHtml(cls,withText=false){const path=CLASS_ICONS[cls];if(!path)return withText?'<span class="class-icon-cell">'+escapeHtml(cls||"-")+'</span>':'-';return '<span class="class-icon-cell"><img class="class-icon" src="'+path+'" alt="'+escapeHtml(cls)+'">'+(withText?'<span>'+escapeHtml(cls)+'</span>':'')+'</span>'}
function classTabIcon(cls){const path=CLASS_ICONS[cls];return path?'<img class="tab-icon" src="'+path+'" alt="">':''}
