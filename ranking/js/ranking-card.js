/*
 * KINOJO Ranking Card Component
 * 역할: 레기온 전체 순위 캐릭터 카드 HTML만 생성합니다.
 * 규칙: 서버 데이터 표시 전용. 카드 안에서 순위 계산·정렬 금지.
 */
(function(){
  'use strict';
  const Ranking = window.KinojoRanking = window.KinojoRanking || {};
  const U = Ranking.utils;

  function topRankClass(rank){
    return rank === 1 ? ' top-one' : rank === 2 ? ' top-two' : rank === 3 ? ' top-three' : '';
  }
  function rankIcon(rank){
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank || '-');
  }
  function avatarHtml(item){
    const cls = 'ranking-avatar' + topRankClass(item.rank) + (item.profile ? '' : ' is-empty');
    if(item.profile){
      return '<img class="'+cls+'" src="'+U.escapeHtml(item.profile)+'" alt="'+U.escapeHtml(item.name+' 프로필')+'" loading="lazy" decoding="async">';
    }
    return '<div class="'+cls+'" aria-hidden="true">'+U.escapeHtml(item.name.slice(0,1) || '?')+'</div>';
  }
  function ownerBadge(item){
    if(item.owner && item.owner !== item.name){
      return '<span class="ranking-owner-note">본캐 '+U.escapeHtml(item.owner)+'</span>';
    }
    return '<span class="ranking-main-badge">본캐</span>';
  }
  function reactionBoxes(item){
    return '<div class="ranking-reaction-boxes">'
      + '<span class="ranking-reaction-box like">👍 '+U.escapeHtml(item.like)+'</span>'
      + '<span class="ranking-reaction-box dislike">👎 '+U.escapeHtml(item.dislike)+'</span>'
      + '</div>';
  }
  function statBlock(label, value, kind){
    return '<div class="ranking-stat '+kind+'"><span>'+U.escapeHtml(label)+'</span><strong>'+U.escapeHtml(value)+'</strong></div>';
  }
  function cardHtml(raw, mode){
    const item = U.normalizeRow(raw, mode);
    const power = mode === 'PVP' ? item.pvpPower : item.pvePower;
    const itemLevel = mode === 'PVP' ? item.pvpItem : item.pveItem;
    return '<article class="ranking-card ranking-reaction-card'+topRankClass(item.rank)+'" role="button" tabindex="0" aria-label="'+U.escapeHtml(item.name)+' 반응 남기기" data-character="'+U.escapeHtml(item.name)+'" data-char-name="'+U.escapeHtml(item.name)+'" data-char-owner="'+U.escapeHtml(item.owner)+'" data-char-class="'+U.escapeHtml(item.className)+'" data-char-server="'+U.escapeHtml(item.server)+'" data-char-power="'+U.escapeHtml(U.num(power))+'" data-profile-image="'+U.escapeHtml(item.profile)+'">'
      + '<div class="ranking-card-main">'
      + '<div class="ranking-rank">'+rankIcon(item.rank)+'</div>'
      + '<div class="ranking-character">'+avatarHtml(item)+'<div class="ranking-character-meta"><div class="ranking-name-line"><strong>'+U.escapeHtml(item.name)+'</strong>'+ownerBadge(item)+'</div><div class="ranking-server-line">'+U.escapeHtml(item.server)+'</div>'+reactionBoxes(item)+'</div></div>'
      + '<div class="ranking-class-chip">'+U.escapeHtml(item.className)+'</div>'
      + statBlock('아이템', U.num(itemLevel), 'item')
      + statBlock(mode, U.num(power), mode.toLowerCase())
      + '</div>'
      + '<div class="ranking-review"><span class="ranking-review-badge">'+U.escapeHtml(item.growthLabel)+'</span><p>🤖 '+U.escapeHtml(item.review)+'</p></div>'
      + '</article>';
  }

  Ranking.card = { cardHtml, topRankClass, rankIcon };
})();
