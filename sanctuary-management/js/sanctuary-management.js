(function(){
  'use strict';

  const API_VERSION=1;
  const SCHEMA_VERSION=429;
  let requestSequence=0;
  let bootstrapData=null;
  let selectedSanctuary='all';

  const byId=id=>document.getElementById(id);
  const value=value=>String(value??'').trim();

  function validateBootstrap(data){
    if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('성역 관리 Server 응답이 올바르지 않습니다.');
    if(Number(data.apiVersion)!==API_VERSION||Number(data.schemaVersion)!==SCHEMA_VERSION){
      throw new Error('성역 관리 Server 계약 버전이 일치하지 않습니다.');
    }
    if(!Array.isArray(data.sanctuaries)||!Array.isArray(data.teams))throw new Error('성역 관리 Server 데이터 형식이 올바르지 않습니다.');
    return {
      apiVersion:Number(data.apiVersion),
      schemaVersion:Number(data.schemaVersion),
      serverTime:value(data.serverTime),
      readEnabled:data.readEnabled===true,
      writeEnabled:data.writeEnabled===true,
      actor:data.actor&&typeof data.actor==='object'?data.actor:{},
      sanctuaries:data.sanctuaries.filter(item=>item&&typeof item==='object'),
      teams:data.teams.filter(item=>item&&typeof item==='object').map(item=>Object.assign({},item,{
        schedule:item.schedule&&typeof item.schedule==='object'?Object.assign({},item.schedule):null
      }))
    };
  }

  const ServerAdapter=Object.freeze({
    kind:'SERVER_ONLY',
    apiVersion:API_VERSION,
    schemaVersion:SCHEMA_VERSION,
    async bootstrap(){
      const api=window.KinojoSupabase;
      if(!api||typeof api.getSanctuaryManagementBootstrap!=='function')throw new Error('성역 관리 Server 어댑터를 불러오지 못했습니다.');
      return validateBootstrap(await api.getSanctuaryManagementBootstrap());
    },
    async command(command,payload,expectedRevision=null,requestKey=''){
      const api=window.KinojoSupabase;
      if(!api||typeof api.runSanctuaryManagementCommand!=='function')throw new Error('성역 관리 Server 명령 어댑터를 불러오지 못했습니다.');
      const result=await api.runSanctuaryManagementCommand(command,payload,expectedRevision,requestKey);
      if(!result||typeof result!=='object'||result.ok!==true)throw new Error(value(result?.message)||'성역 팀 초안을 저장하지 못했습니다.');
      return result;
    }
  });
  window.KinojoSanctuaryManagementData=ServerAdapter;

  function authState(){
    const auth=window.KinojoAuth||{};
    const core=window.KinojoAuthSessionCore||{};
    const session=(typeof auth.getSession==='function'?auth.getSession():null)||(typeof core.getSession==='function'?core.getSession():null);
    const account=(typeof auth.getAccount==='function'?auth.getAccount():null)||(typeof core.getAccount==='function'?core.getAccount():null);
    const combined=Object.assign({},session||{},account||{});
    const loggedIn=Boolean(session&&value(session.token));
    const canEdit=loggedIn&&window.KinojoPermissions?.canEditSanctuary?.(combined)===true;
    return {loggedIn,canEdit};
  }

  function setAccess(state,title,message,action){
    const region=byId('sanctuaryManagementAccess');
    if(!region)return;
    region.dataset.state=state;
    region.setAttribute('aria-busy',state==='loading'?'true':'false');
    byId('sanctuaryManagementAccessTitle').textContent=title;
    byId('sanctuaryManagementAccessMessage').textContent=message;
    const button=byId('sanctuaryManagementAccessAction');
    button.hidden=!action;
    button.textContent=action==='login'?'로그인':action==='back'?'성역으로 돌아가기':'다시 시도';
    button.dataset.action=action||'';
  }

  function contractLabel(data){return 'API '+data.apiVersion+' · DB '+data.schemaVersion;}
  function sanctuaryKey(item){return value(item.code)||value(item.id);}
  function sanctuaryLabel(item){return value(item.shortName)||value(item.name)||value(item.code)||String(item.id||'');}
  function sanctuaryForSelection(){return bootstrapData?.sanctuaries.find(item=>sanctuaryKey(item)===selectedSanctuary)||null;}

  function resolveInitialSelection(data){
    const requested=value(new URLSearchParams(location.search).get('id'));
    if(requested&&data.sanctuaries.some(item=>sanctuaryKey(item)===requested))return requested;
    return 'all';
  }

  function syncLocation(){
    const url=new URL(location.href);
    if(selectedSanctuary==='all')url.searchParams.delete('id');
    else url.searchParams.set('id',selectedSanctuary);
    history.replaceState(null,'',url.pathname+url.search+url.hash);
  }

  function renderScope(){
    const shell=byId('sanctuaryManagementScopeShell');
    const root=byId('sanctuaryManagementScope');
    root.replaceChildren();
    const items=[{key:'all',label:'전체'}].concat(bootstrapData.sanctuaries.map(item=>({key:sanctuaryKey(item),label:sanctuaryLabel(item)})));
    items.forEach(item=>{
      const button=document.createElement('button');
      button.type='button';
      button.dataset.sanctuaryScope=item.key;
      button.setAttribute('aria-pressed',item.key===selectedSanctuary?'true':'false');
      button.textContent=item.label;
      root.appendChild(button);
    });
    shell.hidden=false;
  }

  function setFlagState(id,enabled){
    const target=byId(id);
    target.textContent=enabled?'활성':'준비 중';
    target.classList.toggle('is-on',enabled);
    target.classList.toggle('is-off',!enabled);
  }

  function renderSelectedSanctuary(){
    const selected=sanctuaryForSelection();
    byId('sanctuaryManagementSelectedName').textContent=selected?sanctuaryLabel(selected):'전체';
    const status=selected?(value(selected.releaseLabel)||value(selected.releaseStatus)||'Server master'):'Server master 전체';
    byId('sanctuaryManagementSelectedMeta').textContent=status;
  }

  function teamModeLabel(team){return value(team.mode)==='FIXED'?'고정 팀':value(team.mode)==='PARTICIPATION'?'참여 팀':value(team.mode)||'팀';}
  function teamStatusLabel(team){
    const status=value(team.status);
    return ({DRAFT:'DRAFT',ACTIVE:'운영 중',FULL:'모집 완료',ARCHIVED:'보관됨'})[status]||status||'상태 확인 중';
  }

  function createEmpty(title,message){
    const empty=document.createElement('div');
    empty.className='sanctuary-management-empty';
    const icon=document.createElement('span');icon.className='sanctuary-management-empty-icon';icon.textContent='S';icon.setAttribute('aria-hidden','true');
    const strong=document.createElement('strong');strong.textContent=title;
    const text=document.createElement('p');text.textContent=message;
    empty.append(icon,strong,text);
    return empty;
  }

  function createTeamCard(team){
    const card=document.createElement('article');card.className='sanctuary-management-team-card';
    const head=document.createElement('div');head.className='sanctuary-management-team-card-head';
    const titleWrap=document.createElement('div');
    const title=document.createElement('h3');title.textContent=value(team.title)||'이름 없는 팀';
    const activity=document.createElement('p');activity.textContent=value(team.activity)||'진행 내용 미정';
    titleWrap.append(title,activity);
    const badge=document.createElement('span');badge.className='sanctuary-management-team-badge';badge.textContent=teamStatusLabel(team);
    head.append(titleWrap,badge);
    const meta=document.createElement('div');meta.className='sanctuary-management-team-meta';
    [teamModeLabel(team),'팀 ID '+value(team.teamId),'revision '+value(team.revision)].forEach(text=>{const item=document.createElement('span');item.textContent=text;meta.appendChild(item);});
    card.append(head,meta);
    if(value(team.status)==='DRAFT'){
      const actions=document.createElement('div');actions.className='sanctuary-management-team-actions';
      const reopen=document.createElement('button');reopen.type='button';reopen.className='kinojo-btn secondary';reopen.textContent='초안 계속 작성';
      reopen.dataset.sanctuaryDraftTeam=value(team.teamId);
      reopen.disabled=!bootstrapData?.writeEnabled;
      actions.appendChild(reopen);card.appendChild(actions);
    }
    return card;
  }

  function visibleTeams(){
    if(selectedSanctuary==='all')return bootstrapData.teams;
    const selected=sanctuaryForSelection();
    return bootstrapData.teams.filter(team=>String(team.sanctuaryId)===String(selected?.id));
  }

  function renderTeams(){
    const root=byId('sanctuaryManagementTeamList');
    root.replaceChildren();
    const addButton=byId('sanctuaryManagementAddTeam');
    addButton.disabled=!bootstrapData.writeEnabled;
    if(!bootstrapData.readEnabled){
      byId('sanctuaryManagementTeamStatus').textContent='Server 읽기 플래그가 비활성 상태입니다. 팀 생성도 운영 승인 전까지 열리지 않습니다.';
      root.appendChild(createEmpty('실제 팀 읽기는 아직 열리지 않았습니다.','Server 어댑터 연결은 완료됐으며 별도 승인 전까지 운영 팀 데이터는 표시하지 않습니다.'));
      return;
    }
    const teams=visibleTeams();
    byId('sanctuaryManagementTeamStatus').textContent=bootstrapData.writeEnabled?'Server 팀 데이터를 표시합니다.':'읽기 전용으로 Server 팀 데이터를 표시합니다.';
    if(!teams.length){
      root.appendChild(createEmpty('등록된 팀이 없습니다.','선택한 성역에 Server가 반환한 운영 팀이 없습니다.'));
      return;
    }
    teams.forEach(team=>root.appendChild(createTeamCard(team)));
  }

  function selectedDraftTeam(teamId){
    return bootstrapData?.teams.find(team=>String(team.teamId)===String(teamId))||null;
  }

  async function saveFixedDraft(model){
    if(!bootstrapData?.writeEnabled)throw new Error('Server 쓰기 기능이 아직 활성화되지 않았습니다.');
    const source=model&&typeof model==='object'?model:{};
    const teamId=Number(source.teamId||0);
    const command=teamId?'UPDATE_TEAM_DRAFT':'CREATE_TEAM';
    const payload={
      sanctuaryCode:value(source.sanctuaryCode),
      title:value(source.title),
      activity:value(source.activity),
      mode:'FIXED',
      joinPolicy:'INSTANT',
      schedule:source.schedule&&typeof source.schedule==='object'?source.schedule:{}
    };
    if(teamId)payload.teamId=teamId;
    const result=await ServerAdapter.command(command,payload,teamId?Number(source.revision):null,value(source.requestKey));
    await load();
    return result;
  }

  window.KinojoSanctuaryManagementDraftBridge=Object.freeze({
    kind:'SERVER_ONLY_DRAFT',
    schemaVersion:SCHEMA_VERSION,
    snapshot(){return bootstrapData;},
    findTeam:selectedDraftTeam,
    saveFixedDraft,
    reload:load
  });

  function renderBootstrap(data){
    bootstrapData=data;
    selectedSanctuary=resolveInitialSelection(data);
    byId('sanctuaryManagementContract').textContent=contractLabel(data);
    byId('sanctuaryManagementSource').textContent='Server';
    setFlagState('sanctuaryManagementReadState',data.readEnabled);
    setFlagState('sanctuaryManagementWriteState',data.writeEnabled);
    renderScope();
    renderSelectedSanctuary();
    renderTeams();
    byId('sanctuaryManagementContent').hidden=false;
    if(data.readEnabled){
      setAccess('ready','Server 데이터 경계가 연결되었습니다.',data.writeEnabled?'읽기와 쓰기 플래그가 활성 상태입니다.':'읽기 전용 상태이며 팀 생성·편집은 아직 비활성입니다.');
    }else{
      setAccess('rollout','Server 연결은 완료됐고 실제 팀 읽기는 준비 중입니다.','신규 read/write 플래그는 그대로 비활성 상태이며 기존 성역·스케줄·시트 데이터는 변경하지 않습니다.');
    }
    if(data.serverTime)window.dispatchEvent(new CustomEvent('kinojo:page-time',{detail:{value:data.serverTime,label:'Server'}}));
  }

  async function load(){
    const sequence=++requestSequence;
    const auth=authState();
    bootstrapData=null;
    byId('sanctuaryManagementContent').hidden=true;
    byId('sanctuaryManagementScopeShell').hidden=true;
    byId('sanctuaryManagementContract').textContent='API 계약 확인 중';
    if(!auth.loggedIn){
      setAccess('denied','로그인이 필요합니다.','성역 팀 관리는 권한형 화면입니다. 로그인 후 권한을 다시 확인합니다.','login');
      return;
    }
    if(!auth.canEdit){
      setAccess('denied','성역 관리 권한이 없습니다.','MANAGER 이상 또는 sanctuary_edit 권한이 있는 계정만 이 화면을 사용할 수 있습니다.','back');
      return;
    }
    setAccess('loading','Server 성역 관리 계약을 확인하고 있습니다.','목업이나 기존 시트를 사용하지 않고 신규 Server 어댑터만 호출합니다.');
    try{
      const data=await ServerAdapter.bootstrap();
      if(sequence!==requestSequence)return;
      renderBootstrap(data);
    }catch(error){
      if(sequence!==requestSequence)return;
      setAccess('error','Server 데이터를 불러오지 못했습니다.',value(error?.message)||'잠시 후 다시 시도해 주세요.','retry');
    }
  }

  function bind(){
    byId('sanctuaryManagementScope')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-sanctuary-scope]');
      if(!button||!bootstrapData)return;
      selectedSanctuary=value(button.dataset.sanctuaryScope)||'all';
      syncLocation();
      renderScope();
      renderSelectedSanctuary();
      renderTeams();
    });
    byId('sanctuaryManagementAccessAction')?.addEventListener('click',event=>{
      const action=value(event.currentTarget.dataset.action);
      if(action==='login'){byId('kinojoLoginBtn')?.click();return;}
      if(action==='back'){location.href=document.body.classList.contains('kinojo-page-mobile')?'../sanctuary/':'../sanctuary/';return;}
      load();
    });
    byId('sanctuaryManagementAddTeam')?.addEventListener('click',event=>{
      if(event.currentTarget.disabled)return;
      window.KinojoSanctuaryManagementDraftUI?.openMode?.(event.currentTarget);
    });
    byId('sanctuaryManagementTeamList')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-sanctuary-draft-team]');
      if(!button||button.disabled)return;
      const team=selectedDraftTeam(button.dataset.sanctuaryDraftTeam);
      if(team)window.KinojoSanctuaryManagementDraftUI?.openDraft?.(team,button);
    });
    window.addEventListener('kinojo:auth-changed',load);
    load();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();
