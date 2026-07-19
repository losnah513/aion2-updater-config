/*
 * KINOJO Ranking Events
 * 역할: 레기온 전체 순위 페이지 이벤트 바인딩만 담당합니다.
 */
(function(){
  'use strict';
  const Ranking = window.KinojoRanking = window.KinojoRanking || {};
  const U = Ranking.utils;
  const D = Ranking.data;

  let rankingReactionSubmitting=false;
  let rankingReactionTarget=null;
  let rankingReactionType='like';

  function rankingVisitorId(){
    let id=localStorage.getItem('kinojoVisitorId');
    if(!id){id='v_'+Date.now()+'_'+Math.random().toString(36).slice(2);localStorage.setItem('kinojoVisitorId',id)}
    return id;
  }
  function rankingTodayKey(){return new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}
  function rankingReactionLimit(name,type){const day=rankingTodayKey();const sameKey='kinojo_ranking_react_'+day+'_'+name+'_'+type;const countKey='kinojo_ranking_react_count_'+day+'_'+type;if(localStorage.getItem(sameKey)==='1')return '같은 캐릭터에게 같은 반응은 하루 1번만 남길 수 있습니다.';const count=Number(localStorage.getItem(countKey)||'0');if(count>=3)return (type==='like'?'좋아요':'싫어요')+'는 하루 3번까지만 남길 수 있습니다.';return ''}
  function rankingMarkReaction(name,type){const day=rankingTodayKey();localStorage.setItem('kinojo_ranking_react_'+day+'_'+name+'_'+type,'1');const countKey='kinojo_ranking_react_count_'+day+'_'+type;localStorage.setItem(countKey,String(Number(localStorage.getItem(countKey)||'0')+1))}
  function ensureRankingReactionModal(){
    let modal=document.getElementById('rankingReactionModal');
    if(modal)return modal;
    modal=document.createElement('section');
    modal.id='rankingReactionModal';
    modal.className='ranking-reaction-modal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML='<div class="ranking-reaction-backdrop" data-ranking-reaction-close></div><div class="ranking-reaction-dialog" role="dialog" aria-modal="true" aria-labelledby="rankingReactionTitle"><button class="ranking-reaction-close" type="button" aria-label="닫기" data-ranking-reaction-close>×</button><div class="ranking-reaction-profile"><div class="ranking-reaction-avatar is-empty" id="rankingReactionAvatar">PROFILE</div><div class="ranking-reaction-meta"><div class="ranking-reaction-kicker">REACTION</div><h2 id="rankingReactionTitle">캐릭터에게 한마디</h2><p id="rankingReactionSub">좋아요·싫어요와 코멘트를 남겨보세요.</p></div></div><div class="ranking-reaction-actions"><button class="ranking-reaction-type active" id="rankingReactionLikeBtn" type="button" data-ranking-reaction-type="like">좋아요</button><button class="ranking-reaction-type" id="rankingReactionDislikeBtn" type="button" data-ranking-reaction-type="dislike">싫어요</button></div><div class="ranking-reaction-input"><label for="rankingReactionComment">코멘트 · 20자 이내로 한마디</label><textarea id="rankingReactionComment" class="ranking-reaction-comment" maxlength="20" rows="3" placeholder="응원 한마디 남겨주세요!"></textarea></div><div class="ranking-reaction-foot"><span class="ranking-reaction-status" id="rankingReactionStatus"></span><button class="kinojo-btn ranking-reaction-submit" id="rankingReactionSubmitBtn" type="button">전송</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target&&e.target.hasAttribute('data-ranking-reaction-close'))closeRankingReactionModal()});
    modal.querySelectorAll('[data-ranking-reaction-type]').forEach(btn=>btn.addEventListener('click',()=>setRankingReactionType(btn.dataset.rankingReactionType||'like')));
    modal.querySelector('#rankingReactionSubmitBtn')?.addEventListener('click',submitRankingReaction);
    modal.querySelector('#rankingReactionComment')?.addEventListener('input',updateRankingReactionSubmitState);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeRankingReactionModal()});
    return modal;
  }
  function setRankingReactionType(type){rankingReactionType=type==='dislike'?'dislike':'like';const like=document.getElementById('rankingReactionLikeBtn');const dislike=document.getElementById('rankingReactionDislikeBtn');if(like)like.classList.toggle('active',rankingReactionType==='like');if(dislike)dislike.classList.toggle('active',rankingReactionType==='dislike')}
  function updateRankingReactionSubmitState(){const input=document.getElementById('rankingReactionComment');const btn=document.getElementById('rankingReactionSubmitBtn');if(btn){btn.disabled=rankingReactionSubmitting||!(input&&input.value.trim())}}
  function openRankingReactionModal(card){
    if(window.KinojoCharacterReaction){
      const name=card.dataset.charName||card.dataset.character||'';
      const target={name:name,owner:card.dataset.charOwner||'',className:card.dataset.charClass||'',server:card.dataset.charServer||'',serverId:card.dataset.serverId||'',profileImageUrl:card.dataset.profileImage||'',detailUrl:card.dataset.detailUrl||'',pvePower:card.dataset.pvePower||'',pvpPower:card.dataset.pvpPower||''};
      window.KinojoCharacterReaction.open({
        source:'ranking',
        context:'ranking',
        limitPrefix:'kinojo_ranking_react',
        target:target,
        onSubmit:async function(payload){
          return await window.KinojoApi.postAction('hallReaction',{
            characterName:payload.target.name,
            owner:payload.target.owner||'',
            className:payload.target.className||'',
            reaction:payload.reaction,
            comment:payload.comment,
            clientKey:payload.clientKey,
            sessionToken:payload.sessionToken,
            source:'ranking'
          });
        }
      });
      return;
    }

    if(window.KinojoAuth&&!window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.',{context:'ranking'}))return;
    const name=card.dataset.charName||card.dataset.character||'';
    rankingReactionTarget={name:name,owner:card.dataset.charOwner||'',className:card.dataset.charClass||'',server:card.dataset.charServer||'',serverId:card.dataset.serverId||'',profileImageUrl:card.dataset.profileImage||'',detailUrl:card.dataset.detailUrl||'',pvePower:card.dataset.pvePower||'',pvpPower:card.dataset.pvpPower||''};
    const modal=ensureRankingReactionModal();const title=document.getElementById('rankingReactionTitle');const sub=document.getElementById('rankingReactionSub');const avatar=document.getElementById('rankingReactionAvatar');const input=document.getElementById('rankingReactionComment');const status=document.getElementById('rankingReactionStatus');
    if(title)title.textContent=name;
    if(sub)sub.textContent=[rankingReactionTarget.className,rankingReactionTarget.power?('전투력 '+rankingReactionTarget.power):'',rankingReactionTarget.server].filter(Boolean).join(' · ')||'좋아요·싫어요와 코멘트를 남겨보세요.';
    if(avatar){const image=String(rankingReactionTarget.profileImageUrl||'').trim();if(image){avatar.classList.remove('is-empty');avatar.innerHTML='<img src="'+image.replace(/"/g,'%22')+'" alt="">'}else{avatar.classList.add('is-empty');avatar.textContent='PROFILE'}}
    if(input)input.value='';if(status)status.textContent='';rankingReactionSubmitting=false;setRankingReactionType('like');updateRankingReactionSubmitState();modal.classList.add('open');modal.setAttribute('aria-hidden','false');
  }
  function closeRankingReactionModal(){const modal=document.getElementById('rankingReactionModal');if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}rankingReactionTarget=null;rankingReactionSubmitting=false}
  async function submitRankingReaction(){
    const status=document.getElementById('rankingReactionStatus');const input=document.getElementById('rankingReactionComment');if(!rankingReactionTarget||rankingReactionSubmitting)return;const comment=(input?.value||'').trim().slice(0,20);
    if(!comment){if(status)status.textContent='전하고 싶은 말을 입력해 주세요.';updateRankingReactionSubmitState();return}
    const limit=rankingReactionLimit(rankingReactionTarget.name,rankingReactionType);if(limit){if(status)status.textContent=limit;updateRankingReactionSubmitState();return}
    try{if(window.KinojoAuth&&!window.KinojoAuth.requireLogin('로그인 후 좋아요·싫어요를 남길 수 있습니다.',{context:'ranking'}))return;rankingReactionSubmitting=true;updateRankingReactionSubmitState();if(status)status.textContent='전송 중...';const sessionToken=window.KinojoAuth?window.KinojoAuth.getToken():'';const data=await window.KinojoApi.postAction('hallReaction',{characterName:rankingReactionTarget.name,owner:rankingReactionTarget.owner||'',className:rankingReactionTarget.className||'',reaction:rankingReactionType,comment:comment,clientKey:rankingVisitorId(),sessionToken:sessionToken,source:'ranking'});if(!data||!data.ok){if(data&&data.authRequired&&window.KinojoAuth)window.KinojoAuth.openLoginModal(data.message||'로그인 후 이용할 수 있습니다.',{context:'ranking'});if(status)status.textContent=(data&&data.message)||'저장 실패';return}rankingMarkReaction(rankingReactionTarget.name,rankingReactionType);if(status)status.textContent='한마디가 전달되었어요.';setTimeout(closeRankingReactionModal,420)}catch(e){if(status)status.textContent='반응 저장 실패: '+(e.message||e)}finally{rankingReactionSubmitting=false;updateRankingReactionSubmitState()}
  }

  async function loadRanking(){
    if(D.state.loading) return;
    D.state.loading = true;
    Ranking.render.renderLoading();
    try{
      D.state.data = await D.fetchRanking();
      Ranking.render.render();
      bindDynamicEvents();
    }catch(err){
      Ranking.render.renderError(err);
    }finally{
      D.state.loading = false;
    }
  }
  function bindDynamicEvents(){
    const tabs = U.$('rankingClassTabs');
    if(tabs){
      tabs.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { D.setClass(btn.dataset.class || '전체'); loadRanking(); };
      });
    }
    document.querySelectorAll('.ranking-reaction-card').forEach(card => {
      card.onclick = ev => { ev.stopPropagation(); openRankingReactionModal(card); };
      card.onkeydown = ev => { if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); openRankingReactionModal(card); } };
    });
  }
  function bindStaticEvents(){
    const search = U.$('rankingSearch');
    const include = U.$('rankingIncludeSubs');
    const searchBtn = U.$('rankingSearchBtn');
    const resetBtn = U.$('rankingResetBtn');
    const prev = U.$('rankingPrevBtn');
    const next = U.$('rankingNextBtn');
    const filterToggle = U.$('rankingFilterToggleBtn');
    const toolbar = document.querySelector('.ranking-toolbar');

    if(filterToggle && toolbar){
      filterToggle.addEventListener('click', () => {
        const open = !toolbar.classList.contains('is-filter-open');
        toolbar.classList.toggle('is-filter-open', open);
        filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        filterToggle.textContent = open ? '닫기' : '필터';
      });
    }
    if(search){
      search.addEventListener('keydown', e => {
        if(e.key === 'Enter'){
          D.setSearch(search.value.trim());
          loadRanking();
        }
      });
    }
    if(include){
      include.addEventListener('change', () => { D.setIncludeSubs(include.checked); loadRanking(); });
    }
    if(searchBtn){
      searchBtn.addEventListener('click', () => { D.setSearch(search?.value.trim() || ''); loadRanking(); });
    }
    if(resetBtn){
      resetBtn.addEventListener('click', () => {
        D.reset();
        if(search) search.value = '';
        if(include) include.checked = false;
        loadRanking();
      });
    }
    if(prev){
      prev.addEventListener('click', () => { if(D.state.page > 1){ D.state.page--; loadRanking(); } });
    }
    if(next){
      next.addEventListener('click', () => { if(D.state.page < D.totalPages()){ D.state.page++; loadRanking(); } });
    }
    document.querySelectorAll('[data-mobile-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        D.state.mobileMode = btn.dataset.mobileMode === 'PVP' ? 'PVP' : 'PVE';
        document.querySelectorAll('[data-mobile-mode]').forEach(b => b.classList.toggle('is-active', b === btn));
        const board = U.$('rankingBoard');
        if(board){
          board.dataset.mobileMode = D.state.mobileMode;
          if(U.isMobileRanking()) board.scrollIntoView({ block:'start', behavior:'smooth' });
        }
      });
    });
  }

  Ranking.events = { bindStaticEvents, bindDynamicEvents, loadRanking };
})();
