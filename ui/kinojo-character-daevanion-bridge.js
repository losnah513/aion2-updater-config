/*
 * KINOJO Character Daevanion Bridge · 4-4
 * 역할: SQL 307의 보드 맵·누적 효과·전체 노드 배치를 공통 캐릭터 모달에 직접 표시한다.
 * 규칙: frozen 공통 Core를 덮어쓰거나 PLAYNC raw_payload를 WEB에서 파싱하지 않는다.
 */
(function(){
  'use strict';

  const RPC='kinojo_character_daevanion_detail_v307';
  let pending=false;
  let observer=null;
  const CLASS_KEY={
    '수호성':'templar','검성':'gladiator','살성':'assassin','궁성':'ranger',
    '마도성':'sorcerer','정령성':'elementalist','치유성':'cleric','호법성':'chanter','권성':'fighter'
  };

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

  function identity(root){
    const name=String(root?.querySelector('#kinojoCharacterReactionTitle')?.textContent||'').trim();
    const href=String(root?.querySelector('#kinojoCharacterReactionDetail')?.href||'');
    const match=href.match(/\/characters\/(\d+)\//i);
    return {name,serverId:match?Number(match[1]):0};
  }

  function enhanceCards(root){
    root?.querySelectorAll('[data-live-daevanion-board]').forEach(button=>{
      const current=button.querySelector(':scope > .kinojo-daevanion-board-visual');
      if(current){
        if(current.tagName==='IMG' && current.dataset.fallbackBound!=='1'){
          current.dataset.fallbackBound='1';
          current.addEventListener('error',()=>{
            const visual=document.createElement('i');
            visual.className='kinojo-daevanion-board-visual';
            visual.setAttribute('aria-hidden','true');
            visual.textContent='D';
            current.replaceWith(visual);
          },{once:true});
        }
        return;
      }
      const visual=document.createElement('i');
      visual.className='kinojo-daevanion-board-visual';
      visual.setAttribute('aria-hidden','true');
      visual.textContent='D';
      button.prepend(visual);
    });
  }

  function effectPanel(board){
    const stat=(Array.isArray(board?.statEffects)?board.statEffects:[]).filter(Boolean).map(value=>({value,kind:'stat'}));
    const skill=(Array.isArray(board?.skillEffects)?board.skillEffects:[]).filter(Boolean).map(value=>({value,kind:'skill'}));
    const rows=stat.concat(skill);
    return '<aside class="kinojo-daevanion-effects-panel"><h4>활성 누적 효과 <span>'+rows.length+'개</span></h4><div class="kinojo-daevanion-effect-grid">'+
      (rows.length?rows.map(row=>'<p class="is-'+row.kind+'">'+esc(row.value)+'</p>').join(''):'<p class="is-empty">표시할 효과가 없습니다.</p>')+
      '</div></aside>';
  }

  function boardMap(board,className){
    const full=Array.isArray(board?.nodes)&&board.nodes.length?board.nodes:[];
    const nodes=full.length?full:(Array.isArray(board?.activeNodes)?board.activeNodes.map(node=>Object.assign({open:true},node)):[]);
    const classKey=CLASS_KEY[String(className||'').trim()]||'gladiator';
    return '<section class="kinojo-daevanion-board-map-section"><h4>노드 보드 <span>활성 '+Number(board?.openNodeCount||0)+' / '+Number(board?.totalNodeCount||0)+'</span></h4><div class="kinojo-daevanion-board-map is-class-'+classKey+'" role="img" aria-label="'+esc((board?.name||'데바니온')+' 노드 보드 배치')+'">'+
      nodes.map(node=>{
        const row=Math.max(1,Math.min(15,Number(node?.row||1)));
        const col=Math.max(1,Math.min(15,Number(node?.col||1)));
        const grade=String(node?.grade||'common').toLowerCase();
        const type=String(node?.type||'').toLowerCase();
        const start=type==='start'||grade==='none';
        const open=node?.open===true||Number(node?.open||0)===1;
        const label=[node?.name].concat(Array.isArray(node?.effects)?node.effects:[]).filter(Boolean).join(' · ');
        return '<span class="is-'+(start?'start':esc(grade))+' '+(open?'is-open':'is-closed')+'" style="--kinojo-node-row:'+row+';--kinojo-node-col:'+col+'" title="'+esc(label)+'" aria-label="'+esc(label)+'"></span>';
      }).join('')+'</div></section>';
  }

  function render(root,board){
    const imageUrl=safeUrl(board?.imageUrl);
    const className=String(document.getElementById('kinojoCharacterReactionClassName')?.textContent||'').trim();
    root.innerHTML='<button type="button" class="kinojo-character-live-detail-close" data-live-detail-close>닫기</button>'+
      '<header class="kinojo-daevanion-detail-hero">'+
        (imageUrl?'<img src="'+imageUrl+'" alt="보드 대표 아이콘" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'<i aria-hidden="true">D</i>')+
        '<div><span>데바니온 보드</span><strong>'+esc(board?.name||'데바니온 상세')+'</strong><small>활성 노드 '+Number(board?.openNodeCount||0)+' / '+Number(board?.totalNodeCount||0)+'</small></div>'+
        '<em>'+Number(board?.openPercent||0)+'%</em>'+
      '</header><div class="kinojo-daevanion-workspace">'+effectPanel(board)+boardMap(board,className)+'</div>';
    root.dataset.kinojoDaevanionApiVersion='307';
  }

  async function load(button){
    if(pending) return;
    const modal=button.closest('#kinojoCharacterReactionModal');
    const root=modal?.querySelector('#kinojoLiveDaevanionDetail');
    const boardId=Number(button.dataset.boardId||0);
    const target=identity(modal);
    const rpc=window.KinojoSupabaseRpcCore;
    if(!root || !boardId) return;
    modal.querySelectorAll('[data-live-daevanion-board]').forEach(item=>{
      const active=item===button;
      item.classList.toggle('is-active',active);
      item.setAttribute('aria-pressed',String(active));
    });
    root.hidden=false;
    root.innerHTML='<div class="kinojo-character-live-loading">선택한 보드 맵과 효과를 불러오는 중입니다.</div>';
    pending=true;
    try{
      if(!rpc || typeof rpc.rpc!=='function' || !target.name || !target.serverId) throw new Error('데바니온 Server RPC 연결 정보를 확인하지 못했습니다.');
      const result=await rpc.rpc(RPC,{p_server_id:target.serverId,p_character_name:target.name,p_board_id:boardId});
      if(!result || result.ok!==true || !result.board) throw new Error(result?.message||'SQL 307 데바니온 상세정보를 불러오지 못했습니다.');
      render(root,result.board);
    }catch(error){
      root.innerHTML='<strong>데바니온 상세 조회 실패</strong><span>'+esc(error?.message||error)+'</span>';
      console.error('[KINOJO daevanion 4-4]',error);
    }finally{
      pending=false;
    }
  }

  function clickCapture(event){
    const button=event.target?.closest?.('#kinojoCharacterReactionModal [data-live-daevanion-board]');
    if(!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    load(button);
  }

  function start(){
    document.addEventListener('click',clickCapture,true);
    if(document.body){
      observer=new MutationObserver(records=>{
        if(records.some(record=>Array.from(record.addedNodes||[]).some(node=>
          node.nodeType===1 && (node.matches?.('[data-live-daevanion-board],.kinojo-character-daevanion-grid') || node.querySelector?.('[data-live-daevanion-board],.kinojo-character-daevanion-grid'))
        ))) enhanceCards(document.getElementById('kinojoCharacterReactionModal'));
      });
      observer.observe(document.body,{childList:true,subtree:true});
    }
    enhanceCards(document.getElementById('kinojoCharacterReactionModal'));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
