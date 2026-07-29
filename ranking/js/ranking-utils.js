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
  function nullableNumber(row, snake, camel){
    const raw = pick(row, snake, camel, null);
    if(raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  function stripServerSuffix(v){
    return text(v).replace(/\[[^\]]+\]\s*$/,'').trim();
  }
  function isMobileRanking(){
    return window.matchMedia('(max-width: 699px)').matches;
  }

  function normalizeRow(row, mode){
    const rank = Number(pick(row,'rank_no','rankNo',0) || 0);
    const name = stripServerSuffix(pick(row,'character_name','characterName','')) || '-';
    const owner = stripServerSuffix(pick(row,'main_character_name','mainCharacterName',name)) || name;
    const rawIsMain = pick(row,'is_main','isMain',null);
    const isMain = rawIsMain === true || String(rawIsMain).toLowerCase() === 'true'
      ? true
      : rawIsMain === false || String(rawIsMain).toLowerCase() === 'false'
        ? false
        : null;
    const server = text(pick(row,'server_name','serverName','지켈'),'지켈');
    const serverId = text(pick(row,'server_id','serverId',''),'');
    const className = text(pick(row,'class_name','className','-'),'-');
    const like = Number(pick(row,'like_count','likeCount',0) || 0);
    const dislike = Number(pick(row,'dislike_count','dislikeCount',0) || 0);
    const pvePower = Number(pick(row,'pve_power_total','pvePowerTotal',0) || 0);
    const pvpPower = Number(pick(row,'pvp_power_total','pvpPowerTotal',0) || 0);
    const pveItem = Number(pick(row,'pve_item_level','pveItemLevel',0) || 0);
    const pvpItem = Number(pick(row,'pvp_item_level','pvpItemLevel',0) || 0);
    const growthLabel = text(
      pick(row,'rank_growth_label','rankGrowthLabel',pick(row,'growth_label','growthLabel','')),
      '기록 확인'
    );
    const review = text(
      pick(row,'rank_review_text','rankReviewText',pick(row,'review_text','reviewText','')),
      growthLabel || 'AI 리뷰 대기 중'
    );
    const previousRank = nullableNumber(row,'previous_rank_no','previousRankNo');
    const rankChange = nullableNumber(row,'rank_change','rankChange');
    const rankChangeStatus = text(pick(row,'rank_change_status','rankChangeStatus',''), previousRank === null ? 'NEW' : 'SAME').toUpperCase();
    const powerDelta = nullableNumber(row,'rank_power_delta','rankPowerDelta');
    const itemLevelDelta = nullableNumber(row,'rank_item_level_delta','rankItemLevelDelta');
    const baselineDate = nullableNumber(row,'rank_baseline_date','rankBaselineDate');
    const profile = text(pick(row,'profile_image_url','profileImageUrl',''), '');
    const detailUrl = text(pick(row,'detail_url','detailUrl',''), '');
    return {
      rank,name,owner,isMain,server,serverId,className,like,dislike,
      pvePower,pvpPower,pveItem,pvpItem,review,growthLabel,
      previousRank,rankChange,rankChangeStatus,powerDelta,itemLevelDelta,baselineDate,
      profile,detailUrl,mode
    };
  }

  Ranking.utils = { CLASS_ORDER, $, escapeHtml, num, pick, text, stripServerSuffix, isMobileRanking, normalizeRow };
})();
