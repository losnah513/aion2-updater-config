/**
 * Kinojo Updater Phase Model
 * ------------------------------------------------------------
 * Extension is a trigger/viewer. Server Engine owns all work.
 *
 * UI contract:
 * - The server's seven internal phases are grouped into three user-facing STEP panels.
 * - Every phase state is kept in history so a completed STEP does not disappear.
 * - Errors and retry notes remain visible until a new lookup or manual reset.
 */
(function(){
  'use strict';

  const PHASES = [
    {
      id:'list_master_compare',
      aliases:['LIST_MASTER_COMPARE','list_master','queue_ready','QUEUE_READY'],
      no:1,
      title:'LIST / MASTER 대조',
      shortTitle:'원본 대조',
      label:'LIST ↔ MASTER',
      description:'서버 엔진이 Google list 원본과 character_master를 대조하고 조회 Target을 확정합니다.',
      substeps:[
        { no:1, title:'조회 Lock 확인', label:'runtime_lock' },
        { no:2, title:'list 원본 확보', label:'google_list' },
        { no:3, title:'Master 대조', label:'server_compare' },
        { no:4, title:'신규 선등록', label:'wait_lookup' },
        { no:5, title:'Target 큐 확정', label:'target_queue' }
      ],
      serverStage:'LIST_MASTER_COMPARE',
      weight:12
    },
    {
      id:'character_lookup',
      aliases:['CHARACTER_LOOKUP','character_lookup_apply','CHARACTER_LOOKUP_APPLY'],
      no:2,
      title:'캐릭터 공식 조회',
      shortTitle:'공식 조회',
      label:'OFFICIAL LOOKUP',
      description:'Server Worker가 PLAYNC 공식 API 원본을 수집하고 같은 Parser·Master 계약으로 반영합니다.',
      serverStage:'CHARACTER_LOOKUP',
      weight:56
    },
    {
      id:'missing_recheck',
      aliases:['MISSING_RECHECK','retry_missing','missing_retry'],
      no:3,
      title:'누락 검산 / 재조회',
      shortTitle:'누락 검산',
      label:'MISSING CHECK',
      description:'서버가 list 기준 Target과 저장된 payload를 대조하고 누락을 재조회합니다.',
      substeps:[
        { no:1, title:'payload 대조', label:'payload_reconcile' },
        { no:2, title:'누락 캐릭터 확인', label:'missing_check' },
        { no:3, title:'재조회 큐 생성', label:'retry_queue' }
      ],
      serverStage:'MISSING_RECHECK',
      weight:6
    },
    {
      id:'master_sync',
      aliases:['MASTER_SYNC'],
      no:4,
      title:'캐릭터 마스터 최신화',
      shortTitle:'Master 반영',
      label:'MASTER SYNC',
      description:'서버가 최신 payload를 character_master에 반영합니다.',
      serverStage:'MASTER_SYNC',
      weight:8
    },
    {
      id:'growth_review',
      aliases:['GROWTH_REVIEW'],
      no:5,
      title:'성장 리뷰 생성',
      shortTitle:'리뷰 생성',
      label:'REVIEW',
      description:'서버가 성장 기록과 키노조AI 리뷰를 생성합니다.',
      serverStage:'GROWTH_REVIEW',
      weight:7
    },
    {
      id:'ranking_rebuild',
      aliases:['RANKING_REBUILD'],
      no:6,
      title:'랭킹 / 명예의 전당 계산',
      shortTitle:'랭킹 계산',
      label:'RANKING',
      description:'서버가 랭킹과 명예의 전당 데이터를 재계산합니다.',
      serverStage:'RANKING_REBUILD',
      weight:6
    },
    {
      id:'list_sheet_export',
      aliases:['LIST_SHEET_EXPORT','LIST_SHEET_EXPORT_DONE'],
      no:7,
      title:'Google list 시트 반영',
      shortTitle:'list 반영',
      label:'SHEET EXPORT',
      description:'Server Engine 결과를 AppsScript_MASTER 브릿지로 원본 list 시트에 반영합니다.',
      substeps:[
        { no:1, title:'서버 큐 확인', label:'queue_check' },
        { no:2, title:'MASTER 브릿지 호출', label:'apps_script' },
        { no:3, title:'list 시트 업데이트', label:'sheet_write' },
        { no:4, title:'반영 결과 검증', label:'verify' },
        { no:5, title:'완료 신호 수신', label:'done_signal' }
      ],
      serverStage:'LIST_SHEET_EXPORT',
      weight:5
    }
  ];

  const STEPS = [
    {
      id:'step1',
      no:1,
      title:'원본 LIST / SERVER 대조',
      shortTitle:'STEP 1',
      description:'원본 list 확보, 서버 마스터 대조, 조회 Target 확정',
      phaseIds:['list_master_compare']
    },
    {
      id:'step2',
      no:2,
      title:'캐릭터 공식 조회',
      shortTitle:'STEP 2',
      description:'공식 정보실 원본 수집, Server Engine 저장 확인',
      phaseIds:['character_lookup']
    },
    {
      id:'step3',
      no:3,
      title:'서버 후처리 / 원본 LIST 반영',
      shortTitle:'STEP 3',
      description:'누락 검산, Master·Review·Ranking 갱신, list 시트 반영',
      phaseIds:['missing_recheck','master_sync','growth_review','ranking_rebuild','list_sheet_export']
    }
  ];

  const DEFAULT_STATE = {
    phaseId:'idle',
    phaseNo:0,
    status:'idle',
    current:0,
    total:0,
    percent:0,
    startedAt:0,
    updatedAt:0,
    message:'조회 대기 중',
    etaText:'-',
    elapsedText:'-',
    details:{}
  };

  const STATE_KEY = 'KINOJO_UPDATER_PHASE_STATE';
  const HISTORY_KEY = 'KINOJO_UPDATER_PHASE_HISTORY';

  function normalizeKey(value){ return String(value || '').trim().toLowerCase(); }

  function getPhase(id){
    const key = normalizeKey(id);
    if (!key) return null;
    return PHASES.find(p => {
      if (normalizeKey(p.id) === key || normalizeKey(p.serverStage) === key) return true;
      return Array.isArray(p.aliases) && p.aliases.some(alias => normalizeKey(alias) === key);
    }) || null;
  }

  function getStep(id){
    const key = normalizeKey(id);
    if (!key) return null;
    return STEPS.find(step => normalizeKey(step.id) === key || Number(step.no) === Number(id)) || null;
  }

  function getStepByPhase(phaseId){
    const phase = getPhase(phaseId);
    if (!phase) return null;
    return STEPS.find(step => step.phaseIds.includes(phase.id)) || null;
  }

  function formatDuration(ms){
    const totalSec = Math.max(0, Math.round(Number(ms || 0) / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min <= 0) return `${sec}초`;
    return `${min}분 ${String(sec).padStart(2,'0')}초`;
  }

  function buildState(input){
    const raw = Object.assign({}, DEFAULT_STATE, input || {});
    const phase = getPhase(raw.phaseId) || getPhase(raw.stage) || getPhase(raw.serverStage) || null;
    const total = Math.max(0, Number(raw.total || raw.progressTotal || 0));
    const current = Math.max(0, Number(raw.current || raw.progressCurrent || 0));
    const startedAt = Number(raw.startedAt || raw.started_at || 0);
    const phaseId = phase ? phase.id : raw.phaseId;
    const details = raw.details && typeof raw.details === 'object' ? raw.details : {};
    const serverPercent = Number(raw.percent ?? details.percent);
    const percent = Number.isFinite(serverPercent)
      ? Math.min(100, Math.max(0, serverPercent))
      : (raw.status === 'done' ? 100 : 0);
    const etaSeconds = Number(raw.etaSeconds ?? details.etaSeconds);
    const elapsedSeconds = Number(raw.elapsedSeconds ?? details.elapsedSeconds);
    return Object.assign({}, raw, {
      phaseId,
      phaseNo: phase ? phase.no : Number(raw.phaseNo || 0),
      phase,
      current,
      total,
      percent,
      etaText: raw.etaText || (Number.isFinite(etaSeconds) && etaSeconds > 0 ? `약 ${formatDuration(etaSeconds * 1000)}` : '-'),
      elapsedText: raw.elapsedText || (Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? formatDuration(elapsedSeconds * 1000) : '-'),
      updatedAt: Number(raw.updatedAt || raw.updated_at || Date.now())
    });
  }

  function readRawHistory(){
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function saveState(state){
    const built = buildState(state);
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(built));
      if (built.phaseId && built.phaseId !== 'idle') {
        const history = readRawHistory();
        const previous = history[built.phaseId] && typeof history[built.phaseId] === 'object'
          ? history[built.phaseId]
          : {};
        history[built.phaseId] = Object.assign({}, previous, built, {
          details:Object.assign({}, previous.details || {}, built.details || {}),
          updatedAt:Date.now()
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      }
    } catch(_e) {}
    return built;
  }

  function readState(){
    try { return buildState(JSON.parse(localStorage.getItem(STATE_KEY) || 'null') || DEFAULT_STATE); }
    catch(_e) { return buildState(DEFAULT_STATE); }
  }

  function readHistory(){
    const raw = readRawHistory();
    const out = {};
    Object.keys(raw).forEach(key => {
      const phase = getPhase(key);
      if (!phase) return;
      out[phase.id] = buildState(Object.assign({}, raw[key], { phaseId:phase.id }));
    });
    return out;
  }

  function clearState(options){
    const preserveHistory = options && options.preserveHistory === true;
    try {
      localStorage.removeItem(STATE_KEY);
      if (!preserveHistory) localStorage.removeItem(HISTORY_KEY);
    } catch(_e) {}
  }

  window.KINOJO_UPDATER_PHASES = {
    version:'20260731_01_lookup_3step_runtime_fix',
    phases:PHASES,
    steps:STEPS,
    getPhase,
    getStep,
    getStepByPhase,
    buildState,
    saveState,
    readState,
    readHistory,
    clearState,
    formatDuration
  };

  // ui.js가 먼저 로드되는 기존 manifest 순서를 유지하면서도 저장된 STEP 기록을 즉시 다시 그립니다.
  if (window.AION2_UI && typeof window.AION2_UI.updateStatusBox === 'function') {
    setTimeout(() => window.AION2_UI.updateStatusBox(), 0);
  }
})();
