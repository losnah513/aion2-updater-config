/*
 * KINOJO Character Daevanion Bridge · 306
 * 역할: Server SQL 306의 보드 이미지·효과·활성 노드 계약을 기존 공통 캐릭터 모달에 연결한다.
 * 규칙: WEB은 PLAYNC raw_payload를 파싱하거나 보드 효과를 판정하지 않는다.
 */
(function(){
  'use strict';

  const RPC='kinojo_character_daevanion_detail_v306';
  const boardsById=new Map();
  let currentDetail=null;
  let frame=0;
  let observer=null;

  function esc(value){
    return String(value==null?'':value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
  }

  function safeUrl(value){
    const raw=String(value||'').trim();
    if(!raw) return '';
    if(raw.startsWith('//')) return 'https:'+raw;
    if(raw.startsWith('/') || /^https:\/\//i.test(raw) || /^data:image\//i.test(raw)) return raw.replace(/"/g,'%22');
    return '';
  }

  function number(value){
    const n=Number(value);return Number.isFinite(n)?n:0;
  }

  function rememberBoards(rows){
    (Array.isArray(rows)?rows:[]).forEach(board=>{
      const id=number(board?.id||board?.boardId);
      if(id>0) boardsById.set(id,board||{});
    });
    scheduleEnhance();
  }

  function legacyDetail(result){
    const board=result?.board||{};
    const nodes=(Array.isArray(board.activeNodes)?board.activeNodes:[]).map(node=>Object.assign({},node,{
      open:1,
      effectList:(Array.isArray(node.effects)?node.effects:[]).map(desc=>({desc:String(desc||'')}))
    }));
    return Object.assign({},result,{
      board:Object.assign({},board,{
        nodeList:nodes,
        openStatEffectList:(Array.isArray(board.statEffects)?board.statEffects:[]).map(desc=>({desc:String(desc||'')})),
        openSkillEffectList:(Array.isArray(board.skillEffects)?board.skillEffects:[]).map(desc=>({desc:String(desc||'')}))
      })
    });
  }

  async function fetchDetail(payload){
    const rpc=window.KinojoSupabaseRpcCore;
    if(!rpc || typeof rpc.rpc!=='function') throw new Error('데바니온 Server RPC 연결 모듈을 불러오지 못했습니다.');
    const result=await rpc.rpc(RPC,{
      p_server_id:number(payload?.serverId||payload?.server_id),
      p_character_name:String(payload?.characterName||payload?.name||''),
      p_board_id:number(payload?.boardId||payload?.board_id)
    });
    if(!result || result.ok!==true) throw new Error(result?.message||'저장된 데바니온 상세정보를 불러오지 못했습니다.');
    currentDetail=result.board||null;
    if(currentDetail?.id) boardsById.set(number(currentDetail.id),Object.assign({},boardsById.get(number(currentDetail.id))||{},currentDetail));
    scheduleEnhance();
    return legacyDetail(result);
  }

  function installEdgeBridge(){
    const core=window.KinojoSupabaseClientCore;
    if(!core || typeof core.invokeEdgeFunction!=='function' || core.invokeEdgeFunction.__kinojoDaevanionV306) return false;
    const original=core.invokeEdgeFunction.bind(core);
    const wrapped=async function(name,payload){
      const action=String(payload?.action||'');
      if(String(name||'')==='character-detail-refresh' && action==='daevanionDetail') return fetchDetail(payload||{});
      const result=await original(name,payload);
      if(String(name||'')==='character-detail-refresh' && action==='overview') rememberBoards(result?.daevanion);
      return result;
    };
    Object.defineProperty(wrapped,'__kinojoDaevanionV306',{value:true});
    core.invokeEdgeFunction=wrapped;
    return true;
  }

  function installOverviewBridge(){
    const api=window.KinojoSupabase;
    const current=api?.getLiveCharacterProfile;
    if(!api || typeof current!=='function' || current.__kinojoDaevanionV306) return false;
    const original=current.bind(api);
    const wrapped=async function(action,extra){
      const result=await original(action,extra);
      if(String(action||'overview')==='overview') rememberBoards(result?.daevanion);
      return result;
    };
    Object.defineProperty(wrapped,'__kinojoDaevanionV306',{value:true});
    api.getLiveCharacterProfile=wrapped;
    return true;
  }

  function boardImage(board){
    return safeUrl(board?.imageUrl||board?.icon);
  }

  function enhanceBoardCards(root){
    root.querySelectorAll('[data-live-daevanion-board]').forEach(button=>{
      const id=number(button.dataset.boardId),board=boardsById.get(id)||{};
      const imageUrl=boardImage(board);
      let visual=button.querySelector(':scope > .kinojo-daevanion-board-visual');
      if(!visual){
        visual=document.createElement(imageUrl?'img':'i');
        visual.className='kinojo-daevanion-board-visual';
        if(visual.tagName==='I') visual.textContent='D';
        button.prepend(visual);
      }
      if(imageUrl && visual.tagName==='IMG' && visual.getAttribute('src')!==imageUrl){
        visual.setAttribute('src',imageUrl);visual.setAttribute('alt','');
      }
      const small=button.querySelector(':scope > span > small');
      if(small && board.openNodeCount!=null) small.textContent='활성 노드 '+number(board.openNodeCount)+' / '+number(board.totalNodeCount);
      button.dataset.kinojoDaevanionV306='true';
    });
  }

  function effectSection(title,values,kind){
    const rows=Array.isArray(values)?values:[];
    return '<section class="kinojo-daevanion-effects '+(kind==='skill'?'is-skill':'')+'"><h4>'+esc(title)+'</h4>'+
      (rows.length?rows.map(value=>'<p>'+esc(value)+'</p>').join(''):'<p class="is-empty">표시할 효과가 없습니다.</p>')+'</section>';
  }

  function enhanceDetail(root){
    const detailRoot=root.querySelector('#kinojoLiveDaevanionDetail');
    const board=currentDetail;
    if(!detailRoot || detailRoot.hidden || !board) return;

    const oldHead=detailRoot.querySelector('.kinojo-daevanion-detail-head');
    if(oldHead && !detailRoot.querySelector('.kinojo-daevanion-detail-hero')){
      const imageUrl=boardImage(board);
      const hero=document.createElement('header');
      hero.className='kinojo-daevanion-detail-hero';
      hero.innerHTML=(imageUrl?'<img src="'+imageUrl+'" alt="">':'<i aria-hidden="true">D</i>')+
        '<div><span>데바니온 보드</span><strong>'+esc(board.name||'데바니온 상세')+'</strong><small>활성 노드 '+number(board.openNodeCount)+' / '+number(board.totalNodeCount)+'</small></div>'+
        '<em>'+number(board.openPercent)+'%</em>';
      oldHead.replaceWith(hero);
    }

    const oldEffects=detailRoot.querySelector(':scope > .kinojo-daevanion-effects');
    if(oldEffects && !detailRoot.querySelector('.kinojo-daevanion-effect-columns')){
      const columns=document.createElement('div');
      columns.className='kinojo-daevanion-effect-columns';
      columns.innerHTML=effectSection('누적 능력치 효과',board.statEffects,'stat')+effectSection('스킬 효과',board.skillEffects,'skill');
      oldEffects.replaceWith(columns);
    }

    const nodeTitle=detailRoot.querySelector('.kinojo-daevanion-nodes > h4');
    if(nodeTitle && !nodeTitle.querySelector('span')) nodeTitle.innerHTML='활성 노드 <span>'+number(board.openNodeCount)+'개</span>';
    detailRoot.dataset.kinojoDaevanionV306='true';
  }

  function enhance(){
    frame=0;
    const root=document.getElementById('kinojoCharacterReactionModal');
    if(!root) return;
    enhanceBoardCards(root);
    enhanceDetail(root);
  }

  function scheduleEnhance(){
    if(frame) return;
    frame=requestAnimationFrame(enhance);
  }

  function installObserver(){
    if(observer || !document.body) return;
    observer=new MutationObserver(records=>{
      if(records.some(record=>Array.from(record.addedNodes||[]).some(node=>
        node.nodeType===1 && (node.matches?.('[data-live-daevanion-board],#kinojoLiveDaevanionDetail,.kinojo-daevanion-detail-head') || node.querySelector?.('[data-live-daevanion-board],#kinojoLiveDaevanionDetail,.kinojo-daevanion-detail-head'))
      ))) scheduleEnhance();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function start(){
    installObserver();
    installEdgeBridge();
    installOverviewBridge();
    let attempts=0;
    const timer=setInterval(()=>{
      attempts+=1;
      installEdgeBridge();
      installOverviewBridge();
      if(attempts>=60) clearInterval(timer);
    },100);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
