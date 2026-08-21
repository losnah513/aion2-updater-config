/* KINOJO Admin Shared state and utilities v2026082104 */
(function(global){
  'use strict';
  const A=global.KinojoAdmin=global.KinojoAdmin||{};
  const lookupExitSafety=(...args)=>A.lookupExitSafety(...args);
  const renderLogs=(...args)=>A.renderLogs(...args);

  const $ = (s,r=document)=>r.querySelector(s);

  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  const state = { tab:'dashboard', subtab:'', loaded:{}, subtabs:{ members:'accounts', characters:'lookup', sanctuary:'schedule', notices:'general', meter:'downloads', system:'server-status' }, requests:[], accounts:[], characters:[], characterSummary:{}, logs:[], eventNoticeGroups:[], eventNoticeEditingId:null, meterConsoles:{stable:null,staging:null}, meterNotices:[], meterDungeonLogPage:1, meterDungeonLogTotalPages:1, sanctuarySchedules:[], sanctuaryMasters:[], sanctuaryStatusOptions:[], sanctuaryScheduleLoaded:false, sanctuaryScheduleAccess:null, sanctuaryRolePermissions:null, sanctuaryScheduleSaving:false, sanctuarySupportRequests:[], lastSanctuarySyncData:null, lastSanctuaryStatusData:null, lastSanctuaryId:'all', visitorDays:7, visitorPage:1, visitorTotalPages:1, visitorCanViewMemberHistory:false, lookupConsole:null, lookupSessionId:'', lookupSessionToken:'', lookupPollTimer:null, lookupHeartbeatAt:0, lookupStarting:false, lookupQueueRunning:false, lookupRetrying:false, lookupExitSafety:'idle', lookupHistory:[], lookupHistoryDetails:{}, lookupTargetStates:{}, lookupTargetSession:'', lookupLastCurrent:'' };

  const CACHE = '2026073105';

  const DEFAULT_SUBTABS = { members:'accounts', characters:'lookup', sanctuary:'schedule', notices:'general', meter:'downloads', system:'server-status', logs:'activity' };

  function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}

  function addLog(type,msg){
    const t = new Date(); const line = '['+String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0')+':'+String(t.getSeconds()).padStart(2,'0')+'] '+String(type||'INFO')+' · '+String(msg||'');
    state.logs.unshift(line); state.logs = state.logs.slice(0,80); renderLogs();
  }

  function setStatus(id,msg,kind){ const el=$(id); if(!el)return; el.textContent=msg||''; el.className='admin-statusline '+(kind||''); }

  function toast(msg){ if(window.KinojoToast?.show) window.KinojoToast.show(msg); else addLog('TOAST',msg); }

  function roleLabel(){ const s=window.KinojoAuth?.getSession?.()||{}; return s.roleLabel||s.role||'관리자'; }

  function roleKey(){ const s=window.KinojoAuth?.getSession?.()||{}; return String(s.role||s.roleLabel||'').toUpperCase().replace(/\s+/g,'_'); }

  function roleLevel(){
    const s=window.KinojoAuth?.getSession?.()||{};
    const direct=Number(s.level||0);
    if(direct>0)return direct;
    const role=roleKey();
    if(role==='MASTER'||role==='LV5')return 5;
    if(role==='SUB_MASTER'||role==='SUBMASTER'||role==='LV4')return 4;
    if(role==='MANAGER'||role==='LV3')return 3;
    if(role==='STAFF'||role==='LV2')return 2;
    return 1;
  }

  function isMaster(){ return roleLevel()>=5; }

  function isFullAdmin(){ return roleLevel()>=3; }

  function isStaffConsole(){ return roleLevel()===2; }

  function isAdmin(){ return roleLevel()>=2; }

  function adminAccount(cmd, extra){ return window.KinojoSupabase.adminAccount(cmd, extra||{}); }

  function adminCharacter(cmd, extra){ return window.KinojoSupabase.adminCharacter(cmd, extra||{}); }

  function adminLookup(cmd, extra){ return window.KinojoSupabase.adminLookup(cmd, extra||{}); }

  function adminNotice(cmd, extra){ return window.KinojoSupabase.adminNotice(cmd, extra||{}); }

  function adminEventNotice(cmd, extra){ return window.KinojoSupabase.adminEventNotice(cmd, extra||{}); }

  function adminMeter(cmd, extra){ return window.KinojoSupabase.adminMeter(cmd, extra||{}); }

  function adminAutomation(cmd, extra){ return window.KinojoSupabase.adminAutomation(cmd, extra||{}); }

  function adminVisitor(cmd, extra){ return window.KinojoSupabase.adminVisitor(cmd, extra||{}); }

  const EVENT_NOTICE_TYPES = [
    { value:'abyss_low', label:'어비스 하층', icon:'◆', tone:'gold', title:'어비스 하층 일정 안내', body:'하층 전장 이동과 파티 준비를 확인하세요.' },
    { value:'abyss_middle', label:'어비스 중층', icon:'◆', tone:'gold', title:'어비스 중층 일정 안내', body:'중층 전장 이동과 파티 준비를 확인하세요.' },
    { value:'rift', label:'시공', icon:'◎', tone:'gold', title:'시공 일정 안내', body:'시공 입장 시간과 이동 동선을 확인하세요.' },
    { value:'abyss_boss', label:'어비스 보스', icon:'♛', tone:'gold', title:'어비스 보스 일정 안내', body:'보스 등장 전 파티와 위치를 확인하세요.' },
    { value:'event', label:'이벤트', icon:'◆', tone:'gold', title:'이벤트 공지', body:'이벤트 내용을 확인하세요.' },
    { value:'custom', label:'자유공지', icon:'◆', tone:'gold', title:'공지', body:'공지 내용을 확인하세요.' }
  ];

  function eventNoticeTypeLabel(value){
    const hit = EVENT_NOTICE_TYPES.find(t=>t.value===String(value||''));
    return hit ? hit.label : String(value||'공지');
  }

  function todayDateInputValue(){
    const d=new Date();
    d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  }

  async function action(name, params){ return window.KinojoApi ? window.KinojoApi.getAction(name, params||{}) : window.KinojoSupabase.webAction(name, params||{}); }

  Object.assign(A,{$,$$,state,CACHE,DEFAULT_SUBTABS,esc,addLog,setStatus,toast,roleLabel,roleKey,roleLevel,isMaster,isFullAdmin,isStaffConsole,isAdmin,adminAccount,adminCharacter,adminLookup,adminNotice,adminEventNotice,adminMeter,adminAutomation,adminVisitor,EVENT_NOTICE_TYPES,eventNoticeTypeLabel,todayDateInputValue,action});
})(window);
