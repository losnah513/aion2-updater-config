/*
 * KINOJO Ranking Card Component
 * 역할: 레기온 전체 순위 캐릭터 카드 HTML만 생성합니다.
 * 규칙: 서버 데이터 표시 전용. 카드 안에서 순위 계산·정렬 금지.
 */
(function(){
  'use strict';
  const Ranking = window.KinojoRanking = window.KinojoRanking || {};
  const U = Ranking.utils;
  const METRIC_ASSET_BASE = '/assets/images/aion2/metrics/';
  const CLASS_ICON_BASE = 'https://assets.playnccdn.com/static-aion2/characters/img/class/';
  const CLASS_ICON_KEYS = Object.freeze({
    '수호성':'templar',
    '검성':'gladiator',
    '살성':'assassin',
    '궁성':'ranger',
    '마도성':'sorcerer',
    '정령성':'spiritmaster',
    '치유성':'cleric',
    '호법성':'chanter'
  });

  function topRankClass(rank){
    return rank === 1 ? ' top-one' : rank === 2 ? ' top-two' : rank === 3 ? ' top-three' : '';
  }
  function rankIcon(rank){
    return String(rank || '-');
  }
  function rankCrownHtml(rank){
    return rank >= 1 && rank <= 3 ? '<span class="ranking-rank-crown" aria-hidden="true">♛</span>' : '';
  }
  function classIconHtml(item){
    const iconKey = CLASS_ICON_KEYS[item.className] || '';
    const fallback = U.escapeHtml(String(item.className || '?').slice(0,1));
    const image = iconKey
      ? '<img src="'+CLASS_ICON_BASE+'class_icon_'+U.escapeHtml(iconKey)+'.png" alt="" loading="lazy" decoding="async" onerror="this.hidden=true;this.parentElement.classList.add(\'is-fallback\')">'
      : '';
    return '<span class="ranking-class-emblem'+(image?'':' is-fallback')+'" aria-label="'+U.escapeHtml(item.className)+'">'
      + '<span class="ranking-class-fallback" aria-hidden="true">'+fallback+'</span>'
      + image
      + '</span>';
  }
  function portraitHtml(item){
    if(item.profile){
      return '<div class="ranking-portrait"><img src="'+U.escapeHtml(item.profile)+'" alt="'+U.escapeHtml(item.name+' 프로필')+'" loading="lazy" decoding="async"></div>';
    }
    return '<div class="ranking-portrait is-empty" aria-label="프로필 이미지 없음"><span>'+U.escapeHtml(item.name.slice(0,1) || '?')+'</span></div>';
  }
  function ownerBadge(item){
    if(item.isMain === false && item.owner){
      return '<span class="ranking-owner-note">본캐 '+U.escapeHtml(item.owner)+'</span>';
    }
    if(item.isMain === true) return '<span class="ranking-main-badge">본캐</span>';
    return '';
  }
  function actualLegionHtml(item){
    if(!item.actualLegion || item.actualLegion === item.rankingLegion) return '';
    return '<span class="ranking-actual-legion">현재 레기온 '+U.escapeHtml(item.actualLegion)+'</span>';
  }
  function reactionBoxes(item){
    return '<div class="ranking-reaction-boxes" aria-label="캐릭터 반응">'
      + '<span class="ranking-reaction-box like">👍 '+U.escapeHtml(item.like)+'</span>'
      + '<span class="ranking-reaction-box dislike">👎 '+U.escapeHtml(item.dislike)+'</span>'
      + '</div>';
  }
  function metricHtml(label, value, kind, mode){
    const formatted = U.num(value);
    const icon = kind === 'power' ? 'combat-power.svg' : 'item-level.svg';
    const tone = kind === 'power' ? ' '+String(mode || '').toLowerCase() : '';
    return '<div class="ranking-metric '+kind+tone+'" aria-label="'+U.escapeHtml(label+' '+formatted)+'" title="'+U.escapeHtml(label+' '+formatted)+'">'
      + '<span class="ranking-metric-icon" style="--ranking-metric-icon:url(\''+METRIC_ASSET_BASE+icon+'\')" aria-hidden="true"></span>'
      + '<strong>'+U.escapeHtml(formatted)+'</strong>'
      + '</div>';
  }
  function rankChangeHtml(item){
    const status = String(item.rankChangeStatus || '').toUpperCase();
    const amount = Math.abs(Number(item.rankChange || 0));
    if(status === 'NEW'){
      return '<span class="ranking-rank-change is-new" aria-label="신규 진입">NEW</span>';
    }
    if(status === 'UP' && amount > 0){
      return '<span class="ranking-rank-change is-up" aria-label="'+amount+'위 상승"><span aria-hidden="true">▲</span> '+amount+'</span>';
    }
    if(status === 'DOWN' && amount > 0){
      return '<span class="ranking-rank-change is-down" aria-label="'+amount+'위 하락"><span aria-hidden="true">▼</span> '+amount+'</span>';
    }
    return '<span class="ranking-rank-change is-same" aria-label="순위 변동 없음">–</span>';
  }
  function signedValue(value){
    const number = Number(value || 0);
    return (number > 0 ? '+' : '') + number.toLocaleString('ko-KR');
  }
  function deltaBadge(label, value, kind){
    if(value === null || value === undefined || Number(value) === 0) return '';
    const tone = Number(value) > 0 ? ' is-positive' : ' is-negative';
    return '<span class="ranking-delta-badge '+kind+tone+'">'+U.escapeHtml(label)+' '+U.escapeHtml(signedValue(value))+'</span>';
  }
  function reviewBadgesHtml(item){
    return '<div class="ranking-review-badges">'
      + '<span class="ranking-review-badge">'+U.escapeHtml(item.growthLabel)+'</span>'
      + deltaBadge('아이템 레벨', item.itemLevelDelta, 'item')
      + deltaBadge('전투력', item.powerDelta, 'power')
      + '</div>';
  }
  function cardHtml(raw, mode){
    const item = U.normalizeRow(raw, mode);
    const power = mode === 'PVP' ? item.pvpPower : item.pvePower;
    const itemLevel = mode === 'PVP' ? item.pvpItem : item.pveItem;
    const cardMode = String(mode || 'PVE').toLowerCase();
    return '<article class="ranking-card ranking-reaction-card '+cardMode+topRankClass(item.rank)+'" role="button" tabindex="0" aria-haspopup="dialog" aria-label="'+U.escapeHtml(item.name)+' 상세 정보 보기" data-character="'+U.escapeHtml(item.name)+'" data-char-name="'+U.escapeHtml(item.name)+'" data-char-owner="'+U.escapeHtml(item.owner)+'" data-char-class="'+U.escapeHtml(item.className)+'" data-char-server="'+U.escapeHtml(item.server)+'" data-server-id="'+U.escapeHtml(item.serverId||'')+'" data-char-key="'+U.escapeHtml(item.charKey||'')+'" data-char-power="'+U.escapeHtml(String(power || ''))+'" data-pve-power="'+U.escapeHtml(String(item.pvePower || ''))+'" data-pvp-power="'+U.escapeHtml(String(item.pvpPower || ''))+'" data-profile-image="'+U.escapeHtml(item.profile)+'" data-detail-url="'+U.escapeHtml(item.detailUrl||'')+'">'
      + '<div class="ranking-card-main">'
      + '<div class="ranking-rank">'+rankCrownHtml(item.rank)+'<strong class="ranking-rank-current">'+rankIcon(item.rank)+'</strong>'+rankChangeHtml(item)+'</div>'
      + '<div class="ranking-class-area">'+classIconHtml(item)+'</div>'
      + '<div class="ranking-character-meta">'
      + '<div class="ranking-legion-line"><span class="ranking-legion">&lt;'+U.escapeHtml(item.rankingLegion)+'&gt;</span>'+actualLegionHtml(item)+'</div>'
      + '<div class="ranking-name-line"><strong>'+U.escapeHtml(item.name)+'</strong>'+ownerBadge(item)+'</div>'
      + '<div class="ranking-server-line">'+U.escapeHtml(item.server)+' · '+U.escapeHtml(item.className)+'</div>'
      + '<div class="ranking-metrics">'
      + metricHtml(mode+' 전투력', power, 'power', mode)
      + '<span class="ranking-metric-divider" aria-hidden="true"></span>'
      + metricHtml(mode+' 아이템 레벨', itemLevel, 'item', mode)
      + '</div>'
      + '</div>'
      + portraitHtml(item)
      + '</div>'
      + '<div class="ranking-card-footer">'
      + reactionBoxes(item)
      + '<div class="ranking-review">'+reviewBadgesHtml(item)+'<p>🤖 '+U.escapeHtml(item.review)+'</p></div>'
      + '</div>'
      + '</article>';
  }

  Ranking.card = { cardHtml, topRankClass, rankIcon };
})();
