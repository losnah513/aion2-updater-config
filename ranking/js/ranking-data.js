/*
 * KINOJO Ranking Data
 * 역할: Server Engine 050 RPC 호출과 상태만 관리합니다.
 * 규칙: 웹 자체 순위 계산 금지. 조건은 RPC 파라미터로만 전달합니다.
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
    data: null,
    loading: false,
    mobileMode: 'PVE'
  };

  function cacheKey(){
    return ['ranking', state.page, state.pageSize, state.className, state.search, state.includeSubs ? 'subs' : 'main'].join('::');
  }
  function readCache(){
    if(!window.KinojoCache) return null;
    return window.KinojoCache.getSession(cacheKey());
  }
  function writeCache(data){
    if(!window.KinojoCache) return data;
    return window.KinojoCache.setSession(cacheKey(), data, 45 * 1000);
  }
  function totalPages(){
    const d = state.data || {};
    const maxTotal = Math.max(Number(d.pveTotalCount || 0), Number(d.pvpTotalCount || 0));
    return Math.max(1, Math.ceil(maxTotal / state.pageSize));
  }
  async function fetchRanking(){
    const cached = readCache();
    if(cached) return cached;
    if(!window.KinojoApi) throw new Error('KinojoApi 연결을 확인해 주세요.');
    const data = await window.KinojoApi.getAction('legionRanking', {
      page: state.page,
      pageSize: state.pageSize,
      includeSubs: state.includeSubs,
      className: state.className,
      search: state.search
    });
    if(!data || data.ok === false) throw new Error(data?.message || data?.error || '레기온 순위 응답이 실패했습니다.');
    return writeCache(data);
  }
  function setSearch(value){ state.search = U.text(value); state.page = 1; }
  function setClass(value){ state.className = U.text(value, '전체'); state.page = 1; }
  function setIncludeSubs(value){ state.includeSubs = !!value; state.page = 1; }
  function reset(){ state.page = 1; state.className = '전체'; state.search = ''; state.includeSubs = false; }

  Ranking.data = { state, fetchRanking, totalPages, setSearch, setClass, setIncludeSubs, reset };
})();
