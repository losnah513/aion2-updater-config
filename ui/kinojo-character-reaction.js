/*
 * KINOJO Character Reaction Modal
 * 역할: 명예의 전당·랭킹·성역이 함께 쓰는 캐릭터 반응 모달.
 * 규칙: 페이지별 반응 저장 로직은 옵션으로 받고, 모달 UI는 여기서만 생성한다.
 */
(function(){
  'use strict';

  const state = {
    open: false,
    submitting: false,
    type: 'like',
    target: null,
    options: null
  };

  function visitorId(){
    let id = localStorage.getItem('kinojoVisitorId');
    if(!id){
      id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      localStorage.setItem('kinojoVisitorId', id);
    }
    return id;
  }

  function todayKey(){
    return new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  }

  function esc(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));
  }

  function safeUrl(value){
    return String(value || '').replace(/"/g, '%22');
  }

  function ensureModal(){
    let modal = document.getElementById('kinojoCharacterReactionModal');
    if(modal) return modal;

    modal = document.createElement('section');
    modal.id = 'kinojoCharacterReactionModal';
    modal.className = 'kinojo-character-reaction-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML =
      '<div class="kinojo-character-reaction-backdrop" data-kinojo-character-reaction-close></div>' +
      '<div class="kinojo-character-reaction-dialog" role="dialog" aria-modal="true" aria-labelledby="kinojoCharacterReactionTitle">' +
        '<button class="kinojo-character-reaction-close" type="button" aria-label="닫기" data-kinojo-character-reaction-close>×</button>' +
        '<div class="kinojo-character-reaction-avatar is-empty" id="kinojoCharacterReactionAvatar" aria-hidden="true"></div>' +
        '<div class="kinojo-character-reaction-badge" id="kinojoCharacterReactionBadge">CHARACTER</div>' +
        '<div class="kinojo-character-reaction-head">' +
          '<div class="kinojo-character-reaction-kicker">REACTION</div>' +
          '<h2 class="kinojo-character-reaction-title" id="kinojoCharacterReactionTitle">캐릭터</h2>' +
          '<p class="kinojo-character-reaction-sub" id="kinojoCharacterReactionSub">좋아요·싫어요와 코멘트를 남겨보세요.</p>' +
        '</div>' +
        '<a class="kinojo-character-reaction-detail" id="kinojoCharacterReactionDetail" href="#" target="_blank" rel="noopener noreferrer">정보실 ↗</a>' +
        '<div class="kinojo-character-reaction-actions">' +
          '<button class="kinojo-character-reaction-type active" id="kinojoCharacterReactionLikeBtn" type="button" data-kinojo-reaction-type="like">👍 좋아요</button>' +
          '<button class="kinojo-character-reaction-type" id="kinojoCharacterReactionDislikeBtn" type="button" data-kinojo-reaction-type="dislike">👎 싫어요</button>' +
        '</div>' +
        '<div class="kinojo-character-reaction-input">' +
          '<label for="kinojoCharacterReactionComment">코멘트 · 20자 이내로 한마디</label>' +
          '<textarea id="kinojoCharacterReactionComment" class="kinojo-character-reaction-comment" maxlength="20" rows="3" placeholder="전하고 싶은 말을 남겨주세요"></textarea>' +
        '</div>' +
        '<div class="kinojo-character-reaction-foot">' +
          '<span class="kinojo-character-reaction-status" id="kinojoCharacterReactionStatus"></span>' +
          '<button class="kinojo-character-reaction-submit" id="kinojoCharacterReactionSubmitBtn" type="button">전송</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if(event.target && event.target.hasAttribute('data-kinojo-character-reaction-close')) close();
    });
    modal.querySelectorAll('[data-kinojo-reaction-type]').forEach(btn => {
      btn.addEventListener('click', () => setType(btn.dataset.kinojoReactionType || 'like'));
    });
    modal.querySelector('#kinojoCharacterReactionSubmitBtn')?.addEventListener('click', submit);
    modal.querySelector('#kinojoCharacterReactionComment')?.addEventListener('input', updateSubmitState);
    document.addEventListener('keydown', event => {
      if(event.key === 'Escape') close();
    });
    return modal;
  }

  function limitKeyPrefix(){
    return (state.options && state.options.limitPrefix) || ('kinojo_' + ((state.options && state.options.source) || 'common') + '_react');
  }

  function checkLimit(name, type){
    const day = todayKey();
    const prefix = limitKeyPrefix();
    const sameKey = prefix + '_' + day + '_' + name + '_' + type;
    const countKey = prefix + '_count_' + day + '_' + type;
    if(localStorage.getItem(sameKey) === '1') return '같은 캐릭터에게 같은 반응은 하루 1번만 남길 수 있습니다.';
    const count = Number(localStorage.getItem(countKey) || '0');
    if(count >= 3) return (type === 'like' ? '좋아요' : '싫어요') + '는 하루 3번까지만 남길 수 있습니다.';
    return '';
  }

  function markLimit(name, type){
    const day = todayKey();
    const prefix = limitKeyPrefix();
    localStorage.setItem(prefix + '_' + day + '_' + name + '_' + type, '1');
    const countKey = prefix + '_count_' + day + '_' + type;
    localStorage.setItem(countKey, String(Number(localStorage.getItem(countKey) || '0') + 1));
  }

  function setStatus(message){
    const status = document.getElementById('kinojoCharacterReactionStatus');
    if(status) status.textContent = message || '';
  }

  function setType(type){
    state.type = type === 'dislike' ? 'dislike' : 'like';
    const like = document.getElementById('kinojoCharacterReactionLikeBtn');
    const dislike = document.getElementById('kinojoCharacterReactionDislikeBtn');
    if(like) like.classList.toggle('active', state.type === 'like');
    if(dislike) dislike.classList.toggle('active', state.type === 'dislike');
  }

  function updateSubmitState(){
    const input = document.getElementById('kinojoCharacterReactionComment');
    const btn = document.getElementById('kinojoCharacterReactionSubmitBtn');
    if(btn) btn.disabled = state.submitting || !(input && input.value.trim());
  }

  function normalizeTarget(target){
    const t = target || {};
    const name = t.name || t.characterName || t.charName || '';
    const className = t.className || t.class || '';
    const power = t.power || t.powerText || t.combatPower || '';
    const server = t.server || t.serverName || '';
    const owner = t.owner || t.mainCharacterName || '';
    const profileImageUrl = t.profileImageUrl || t.profileImage || t.profile || t.imageUrl || '';
    const detailUrl = t.detailUrl || t.url || '';
    const sub = t.sub || [className, power ? ('전투력 ' + power) : '', server].filter(Boolean).join(' · ');
    return { name, className, power, server, owner, profileImageUrl, detailUrl, sub };
  }

  function renderTarget(){
    const target = state.target || {};
    const avatar = document.getElementById('kinojoCharacterReactionAvatar');
    const badge = document.getElementById('kinojoCharacterReactionBadge');
    const title = document.getElementById('kinojoCharacterReactionTitle');
    const sub = document.getElementById('kinojoCharacterReactionSub');
    const detail = document.getElementById('kinojoCharacterReactionDetail');

    if(title) title.textContent = target.name || '캐릭터';
    if(sub) sub.textContent = target.sub || '좋아요·싫어요와 코멘트를 남겨보세요.';
    if(badge) badge.textContent = target.className || target.server || 'CHARACTER';

    if(avatar){
      const image = String(target.profileImageUrl || '').trim();
      if(image){
        avatar.classList.remove('is-empty');
        avatar.innerHTML = '<img src="' + safeUrl(image) + '" alt="' + esc((target.name || '캐릭터') + ' 프로필') + '">';
      }else{
        avatar.classList.add('is-empty');
        avatar.innerHTML = '';
      }
    }

    if(detail){
      if(target.detailUrl){
        detail.href = target.detailUrl;
        detail.classList.add('is-visible');
      }else{
        detail.removeAttribute('href');
        detail.classList.remove('is-visible');
      }
    }
  }

  function open(options){
    const opts = options || {};
    const context = opts.context || opts.source || 'character';
    if(window.KinojoAuth && opts.requireLogin !== false && !window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.', { context })){
      return false;
    }

    state.options = opts;
    state.target = normalizeTarget(opts.target || {});
    state.type = 'like';
    state.submitting = false;

    const modal = ensureModal();
    const input = document.getElementById('kinojoCharacterReactionComment');
    if(input) input.value = '';
    setStatus('');
    renderTarget();
    setType('like');
    updateSubmitState();

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    state.open = true;
    setTimeout(() => input?.focus(), 60);
    return true;
  }

  function close(){
    const modal = document.getElementById('kinojoCharacterReactionModal');
    if(modal){
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    state.open = false;
    state.submitting = false;
    state.target = null;
    state.options = null;
  }

  async function submit(){
    const input = document.getElementById('kinojoCharacterReactionComment');
    const comment = (input?.value || '').trim().slice(0, 20);
    const target = state.target;
    const opts = state.options || {};
    if(!target || state.submitting) return;

    if(!comment){
      setStatus('전하고 싶은 말을 입력해 주세요.');
      updateSubmitState();
      return;
    }

    const limit = checkLimit(target.name, state.type);
    if(limit){
      setStatus(limit);
      updateSubmitState();
      return;
    }

    try{
      const context = opts.context || opts.source || 'character';
      if(window.KinojoAuth && opts.requireLogin !== false && !window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.', { context })){
        return;
      }

      state.submitting = true;
      updateSubmitState();
      setStatus('전송 중...');

      const sessionToken = window.KinojoAuth ? window.KinojoAuth.getToken() : '';
      let data;
      if(typeof opts.onSubmit === 'function'){
        data = await opts.onSubmit({ target, reaction: state.type, comment, sessionToken, clientKey: visitorId() });
      }else{
        data = await window.KinojoApi.postAction('hallReaction', {
          characterName: target.name,
          owner: target.owner || '',
          className: target.className || '',
          reaction: state.type,
          comment,
          clientKey: visitorId(),
          sessionToken,
          source: opts.source || context
        });
      }

      if(!data || !data.ok){
        if(data && data.authRequired && window.KinojoAuth){
          window.KinojoAuth.openLoginModal(data.message || '로그인 후 이용할 수 있습니다.', { context });
        }
        setStatus((data && data.message) || '저장 실패');
        return;
      }

      markLimit(target.name, state.type);
      setStatus('한마디가 전달되었어요.');
      if(typeof opts.onSuccess === 'function') opts.onSuccess(data, { target, reaction: state.type, comment });
      setTimeout(close, opts.closeDelay || 420);
    }catch(error){
      setStatus('반응 저장 실패: ' + (error.message || error));
    }finally{
      state.submitting = false;
      updateSubmitState();
    }
  }

  window.KinojoCharacterReaction = { open, close, setType };
})();
