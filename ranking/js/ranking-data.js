/*
 * KINOJO Ranking Data
 * 역할: Server Engine 050 RPC 호출과 표시용 페이지 누적 상태만 관리합니다.
 * 규칙: 웹 자체 순위 계산·정렬·필터링 금지. Server가 반환한 20명 단위 결과를 순서대로 이어 붙여 표시합니다.
 */
(function(){
  'use strict';
  const Ranking = window.KinojoRanking = window.KinojoRanking || {};
  const U = Ranking.utils;

  const state = {
    page: 1,
    pageSize: 20,
    className: '전체',
    search: '',
    includeSubs: false,
    includeAllLegions: false,
    data: null,
    loading: false,
    mobileMode: 'PVE'
  };

  function cacheKey(page){
    return ['ranking', Number(page || state.page), state.pageSize, state.className, state.search, state.includeSubs ? 'subs' : 'main', state.includeAllLegions ? 'all-legions' : 'default-legions'].join('::');
  }
  function readCache(page){
    if(!window.KinojoCache) return null;
    return window.KinojoCache.getSession(cacheKey(page));
  }
  function writeCache(page, data){
    if(!window.KinojoCache) return data;
    return window.KinojoCache.setSession(cacheKey(page), data, 45 * 1000);
  }
  function rows(data, mode){
    return Array.isArray(mode === 'PVP' ? data?.pvpItems : data?.pveItems)
      ? (mode === 'PVP' ? data.pvpItems : data.pveItems)
      : [];
  }
  function total(data, mode){
    return Number(mode === 'PVP' ? data?.pvpTotalCount : data?.pveTotalCount) || 0;
  }
  function mergePageData(current, next){
    if(!current) return next;
    return Object.assign({}, current, next, {
      pveItems: rows(current, 'PVE').concat(rows(next, 'PVE')),
      pvpItems: rows(current, 'PVP').concat(rows(next, 'PVP')),
      pveTotalCount: total(next, 'PVE') || total(current, 'PVE'),
      pvpTotalCount: total(next, 'PVP') || total(current, 'PVP'),
      classCounts: next?.classCounts || current?.classCounts || {}
    });
  }
  function publishServerTime(data){
    const candidates=[].concat(rows(data,'PVE'),rows(data,'PVP'))
      .map(item=>item?.updated_at||item?.updatedAt||item?.last_synced_at||item?.lastSyncedAt)
      .filter(Boolean)
      .sort((a,b)=>new Date(b)-new Date(a));
    const value=data?.updatedAt||data?.generatedAt||candidates[0];
    if(value)window.dispatchEvent(new CustomEvent('kinojo:page-time',{detail:{value,label:'최종 조회'}}));
  }
  async function fetchPage(page){
    const pageNo = Math.max(1, Number(page || 1));
    const cached = readCache(pageNo);
    if(cached){publishServerTime(cached);return cached;}
    if(!window.KinojoSupabase || typeof window.KinojoSupabase.rpc !== 'function'){
      throw new Error('Server Engine 연결을 확인해 주세요.');
    }
    const params = {
      p_page: pageNo,
      p_page_size: state.pageSize,
      p_include_subs: state.includeSubs,
      p_include_all_legions: state.includeAllLegions,
      p_class_name: state.className,
      p_search: state.search
    };
    const data = await window.KinojoSupabase.rpc('kinojo_web_get_legion_ranking', params);
    if(!data || data.ok === false) throw new Error(data?.message || data?.error || '레기온 순위 응답이 실패했습니다.');
    publishServerTime(data);
    return writeCache(pageNo, data);
  }
  async function fetchRanking(options){
    const append = !!options?.append;
    const pageData = await fetchPage(state.page);
    return append ? mergePageData(state.data, pageData) : pageData;
  }
  function totalPages(){
    const maxTotal = Math.max(total(state.data, 'PVE'), total(state.data, 'PVP'));
    return Math.max(1, Math.ceil(maxTotal / state.pageSize));
  }
  function hasMore(){ return state.page < totalPages(); }
  function advancePage(){
    if(!hasMore()) return false;
    state.page += 1;
    return true;
  }
  function retreatPage(){ state.page = Math.max(1, state.page - 1); }
  function loadedCount(mode){ return rows(state.data, mode).length; }
  function resetResult(){ state.page = 1; state.data = null; }
  function setSearch(value){ state.search = U.text(value); resetResult(); }
  function setClass(value){ state.className = U.text(value, '전체'); resetResult(); }
  function setIncludeSubs(value){ state.includeSubs = !!value; resetResult(); }
  function setIncludeAllLegions(value){ state.includeAllLegions = !!value; resetResult(); }
  function reset(){ state.className = '전체'; state.search = ''; state.includeSubs = false; state.includeAllLegions = false; resetResult(); }

  Ranking.data = {
    state,
    fetchRanking,
    totalPages,
    hasMore,
    advancePage,
    retreatPage,
    loadedCount,
    total,
    setSearch,
    setClass,
    setIncludeSubs,
    setIncludeAllLegions,
    reset
  };
})();
