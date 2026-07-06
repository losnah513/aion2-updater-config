/*
 * KINOJO Ranking Utils
 * 역할: 레기온 전체 순위 페이지에서 공통으로 쓰는 순수 유틸리티만 관리합니다.
 * 규칙: 서버 순위 계산·정렬·필터링 금지. 표시용 정규화와 escape만 담당합니다.
 */
(function(){
  'use strict';
  const Ranking = window.KinojoRanking = window.KinojoRanking || {};

  const CLASS_ORDER = ['전체','수호성','검성','살성','궁성','마도성','정령성','치유성','호법성','권성'];

  function $(id){ return document.getElementById(id); }
  function escapeHtml(v){
    return String(v ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }
  function num(v){
    const n = Number(v || 0);
    return Number.isFinite(n) && n > 0 ? n.toLocaleString('ko-KR') : '-';
  }
  function pick(row, snake, camel, fallback){
    if(row && row[camel] !== undefined && row[camel] !== null) return row[camel];
    if(row && row[snake] !== undefined && row[snake] !== null) return row[snake];
    return fallback;
  }
  function text(v, fallback=''){
    const s = String(v ?? '').trim();
    return s || fallback;
  }
  function stripServerSuffix(v){
    return text(v).replace(/\[[^\]]+\]\s*$/,'').trim();
  }
  function isMobileRanking(){
    return document.body.classList.contains('is-mobile-ranking') || window.matchMedia('(max-width: 760px)').matches;
  }

  function normalizeRow(row, mode){
    const rank = Number(pick(row,'rank_no','rankNo',0) || 0);
    const name = stripServerSuffix(pick(row,'character_name','characterName','')) || '-';
    const owner = stripServerSuffix(pick(row,'main_character_name','mainCharacterName',name)) || name;
    const server = text(pick(row,'server_name','serverName','지켈'),'지켈');
    const className = text(pick(row,'class_name','className','-'),'-');
    const like = Number(pick(row,'like_count','likeCount',0) || 0);
    const dislike = Number(pick(row,'dislike_count','dislikeCount',0) || 0);
    const pvePower = Number(pick(row,'pve_power_total','pvePowerTotal',0) || 0);
    const pvpPower = Number(pick(row,'pvp_power_total','pvpPowerTotal',0) || 0);
    const pveItem = Number(pick(row,'pve_item_level','pveItemLevel',0) || 0);
    const pvpItem = Number(pick(row,'pvp_item_level','pvpItemLevel',0) || 0);
    const growthLabel = text(pick(row,'growth_label','growthLabel',''), '기록 확인');
    const review = text(pick(row,'review_text','reviewText',''), growthLabel || 'AI 리뷰 대기 중');
    const profile = text(pick(row,'profile_image_url','profileImageUrl',''), '');
    const detailUrl = text(pick(row,'detail_url','detailUrl',''), '');
    return { rank,name,owner,server,className,like,dislike,pvePower,pvpPower,pveItem,pvpItem,review,growthLabel,profile,detailUrl,mode };
  }

  Ranking.utils = { CLASS_ORDER, $, escapeHtml, num, pick, text, stripServerSuffix, isMobileRanking, normalizeRow };
})();
